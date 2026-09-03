const SlackApproval = require('../models/SlackApproval');
const User = require('../models/User');
const { STAGES } = require('../config/approvalStages');
const { canActOnDepartment } = require('./departmentAccess');

const SLACK_API = 'https://slack.com/api';

// Everyone eligible to act on a given stage — role bypass (e.g. 'owner') OR
// an explicit module+action permission grant via User Management — and who
// has actually linked their Slack account (slackUserId set). Not hardcoded to
// a specific name/email so this keeps working if assignments change.
async function resolveApproverUsers(module, action, ...roles) {
  return User.find({
    isActive: true,
    slackUserId: { $ne: null },
    $or: [
      { role: { $in: roles } },
      { permissions: { $elemMatch: { module, actions: action } } },
    ],
  });
}

// Mirrors mailer.js's style — a single fetch attempt, throws on failure with
// Slack's own error string, no built-in retry. The caller decides whether to
// swallow the error (this notifier is best-effort: a failed Slack push should
// never block the real approval-chain write that already happened).
async function slackCall(method, body) {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(`Slack API error (${method}): ${data.error || res.status}`);
  }
  return data;
}

function buildBlocks({ title, lines, deepLinkUrl, approvalId, footer, mentionText }) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
    {
      type: 'section',
      fields: lines.map(l => ({ type: 'mrkdwn', text: `*${l.label}:*\n${l.value}` })),
    },
  ];
  if (mentionText) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `👤 *Needs action from:* ${mentionText}` }] });
  }
  if (footer) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: footer }] });
    return blocks; // decided — no action buttons
  }
  blocks.push({
    type: 'actions',
    elements: [
      { type: 'button', style: 'primary', text: { type: 'plain_text', text: '✅ Approve', emoji: true }, action_id: `approve_${approvalId}`, value: approvalId },
      { type: 'button', style: 'danger', text: { type: 'plain_text', text: '❌ Reject', emoji: true }, action_id: `reject_${approvalId}`, value: approvalId },
      { type: 'button', text: { type: 'plain_text', text: '👁️ View & Decide', emoji: true }, url: deepLinkUrl, action_id: `view_${approvalId}` },
    ],
  });
  return blocks;
}

// Shared implementation behind settleStaleApprovals/settleAllPendingForEntity
// below — marks matching still-'pending' rows decided and updates every
// posted copy of each, same as a real Slack-driven decision would.
async function settlePendingApprovals(filter, { verb = 'Approved', decidedByName = 'the app' } = {}) {
  const stale = await SlackApproval.find({ ...filter, status: 'pending' });
  for (const approval of stale) {
    approval.status = verb === 'Rejected' ? 'rejected' : 'approved';
    approval.decidedAt = new Date();
    await approval.save();
    await updateApprovalMessage(approval, { decidedByName, verb })
      .catch((err) => console.error('[slackApprovals] settle update failed', err.message));
  }
}

// Called from notifyStagePending itself: an entity moving to a NEW stage
// means any of its OTHER still-pending rows (a different approvalType) are
// stale — most commonly because the previous stage was actioned through the
// app UI directly, not a Slack button, so nothing ever marked it decided.
const settleStaleApprovals = (entityId, exceptApprovalType) =>
  settlePendingApprovals({ entityId, approvalType: { $ne: exceptApprovalType } });

// Called explicitly from every reject/send-back controller function — a
// reject ends ALL currently-pending approval needs for that entity at once
// (regardless of which stage they were at), so a later resubmission starts
// clean instead of the dedup guard above mistaking a stale row for a still-
// current one.
const settleAllPendingForEntity = (entityId, opts) =>
  settlePendingApprovals({ entityId }, opts);

// The one function every controller hook calls, right after an entity flips
// into a stage that's someone's turn (see approvalStages.js for the full
// list). Resolves everyone eligible, DMs each of them individually, and posts
// once more to the shared group channel — every posted copy's channel/ts is
// saved so a decision from any one of them can update all of them together.
async function notifyStagePending(approvalType, entityDoc) {
  const stage = STAGES[approvalType];
  if (!stage) throw new Error(`Unknown Slack approval stage: ${approvalType}`);
  if (!process.env.SLACK_BOT_TOKEN) return; // Slack not configured (e.g. local dev) — silently skip

  // Guards against posting the same approval twice — an entity can only
  // meaningfully be "pending at this exact stage" once at a time, so a
  // second call for the same entity+stage (a double-click before the button
  // disabled, a retried request after a slow Render cold-start response,
  // Slack's own retry on a slow ack, etc.) is a re-notification, not a new one.
  const existing = await SlackApproval.findOne({ approvalType, entityId: entityDoc._id, status: 'pending' });
  if (existing) return existing;

  // An entity moving to a NEW stage means any of its OTHER still-'pending'
  // rows are stale — most commonly because the previous stage was actioned
  // through the app UI directly rather than a Slack button, so nothing ever
  // marked it decided. Settling those here (rather than only when their own
  // Slack button is clicked) keeps the dedup check above honest on a
  // resubmit-after-send-back cycle — otherwise a leftover stale 'pending' row
  // from the first pass would wrongly block the real re-notification.
  await settleStaleApprovals(entityDoc._id, approvalType);

  let recipients = await resolveApproverUsers(stage.module, stage.action, ...stage.roles);
  // A handful of stages additionally gate on department (canActOnDepartment,
  // called inside their real controller function) — a permission holder in
  // the wrong department would just get rejected on click, so don't DM them
  // an approval they can't act on in the first place.
  if (stage.departmentScoped) recipients = recipients.filter((u) => canActOnDepartment(u, entityDoc));

  // Reuses the already-configured, already-working channel (originally set
  // up as #rahul-approvals) as the one shared group every stage now posts
  // to — everyone's individual DM already covers per-person targeting, so
  // this just needs to be "the one place everyone can see everything".
  const groupChannel = process.env.SLACK_APPROVAL_CHANNEL_ID;
  if (!recipients.length && !groupChannel) return; // nobody to notify anywhere

  const title = stage.title;
  const lines = stage.buildLines(entityDoc);
  const deepLinkPath = stage.deepLinkPath(entityDoc);

  const approval = await SlackApproval.create({
    approvalType, entityType: stage.entityType, entityId: entityDoc._id,
    approverUserIds: recipients.map(u => u._id),
    title, lines, deepLinkPath,
  });

  const deepLinkUrl = `${process.env.FRONTEND_URL.split(',')[0].trim()}${deepLinkPath}`;
  // <@U123> is Slack's mention syntax — renders as a clickable, pinging @name.
  // Mainly matters on the group channel copy (a DM already only reaches one
  // person), but included everywhere so it's obvious who else can also act.
  const mentionText = recipients.map(u => `<@${u.slackUserId}>`).join(' ') || undefined;
  const blocks = buildBlocks({ title, lines, deepLinkUrl, approvalId: String(approval._id), mentionText });

  const targets = [...recipients.map(u => u.slackUserId), ...(groupChannel ? [groupChannel] : [])];
  const messages = [];
  for (const channel of targets) {
    try {
      const posted = await slackCall('chat.postMessage', { channel, text: title, blocks });
      messages.push({ channel: posted.channel, ts: posted.ts });
    } catch (err) {
      console.error(`[slackApprovals] postMessage failed for ${channel}`, err.message);
    }
  }

  approval.messages = messages;
  await approval.save();
  return approval;
}

// Replaces the action buttons with a plain decided-state line on EVERY posted
// copy (each DM + the group) — called after the real approve/reject write has
// already succeeded, so acting from one copy visibly settles all of them.
async function updateApprovalMessage(approval, { decidedByName, verb, remarks }) {
  if (!approval.messages?.length) return;
  const icon = verb === 'Approved' ? '✅' : '❌';
  const footer = `${icon} *${verb} by ${decidedByName}* — ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` +
    (remarks ? `\n_${remarks}_` : '');
  const blocks = buildBlocks({ title: approval.title, lines: approval.lines, footer });
  for (const m of approval.messages) {
    try {
      await slackCall('chat.update', { channel: m.channel, ts: m.ts, text: `${approval.title} — ${verb}`, blocks });
    } catch (err) {
      console.error(`[slackApprovals] chat.update failed for ${m.channel}`, err.message);
    }
  }
}

// Re-renders a still-pending message (every copy) from its own saved snapshot
// — used by one-off scripts to correct messages that were posted wrong (e.g.
// a local run picking up the wrong FRONTEND_URL) or to re-sync after a config
// change.
async function refreshApprovalMessage(approval) {
  if (!approval.messages?.length) return;
  const deepLinkUrl = `${process.env.FRONTEND_URL.split(',')[0].trim()}${approval.deepLinkPath}`;
  const recipients = await User.find({ _id: { $in: approval.approverUserIds || [] } }).select('slackUserId');
  const mentionText = recipients.map(u => `<@${u.slackUserId}>`).join(' ') || undefined;
  const blocks = buildBlocks({ title: approval.title, lines: approval.lines, deepLinkUrl, approvalId: String(approval._id), mentionText });
  for (const m of approval.messages) {
    try {
      await slackCall('chat.update', { channel: m.channel, ts: m.ts, text: approval.title, blocks });
    } catch (err) {
      console.error(`[slackApprovals] refresh failed for ${m.channel}`, err.message);
    }
  }
}

async function openReasonModal(triggerId, approvalId) {
  await slackCall('views.open', {
    trigger_id: triggerId,
    view: {
      type: 'modal',
      callback_id: 'slack_approval_reject',
      private_metadata: approvalId,
      title: { type: 'plain_text', text: 'Reject' },
      submit: { type: 'plain_text', text: 'Reject' },
      close: { type: 'plain_text', text: 'Cancel' },
      blocks: [{
        type: 'input',
        block_id: 'reason_block',
        label: { type: 'plain_text', text: 'Reason' },
        element: { type: 'plain_text_input', action_id: 'reason_input', multiline: true },
      }],
    },
  });
}

async function postEphemeral(channel, user, text) {
  try {
    await slackCall('chat.postEphemeral', { channel, user, text });
  } catch (err) {
    console.error('[slackApprovals] postEphemeral failed', err.message);
  }
}

async function postMessage(channel, text, blocks) {
  try {
    await slackCall('chat.postMessage', { channel, text, ...(blocks ? { blocks } : {}) });
  } catch (err) {
    console.error('[slackApprovals] postMessage failed', err.message);
  }
}

module.exports = {
  notifyStagePending, settleAllPendingForEntity, updateApprovalMessage, refreshApprovalMessage,
  openReasonModal, postEphemeral, postMessage, resolveApproverUsers,
};
