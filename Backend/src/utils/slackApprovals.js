const SlackApproval = require('../models/SlackApproval');
const User = require('../models/User');

const SLACK_API = 'https://slack.com/api';

// Finds whoever should get this approval in Slack — prefers the 'owner' role
// (today, that's the one person these two stages are gated to: see
// authorizeOr('work-orders','ceo-approve','owner') / authorizeOr('accounts-payment',
// 'l2-director-approve','owner') on the real routes), falling back to anyone
// individually granted the permission via User Management. Not hardcoded to a
// specific name/email so this keeps working if that assignment ever changes.
async function resolveApproverUser(module, action) {
  const owner = await User.findOne({ role: 'owner', isActive: true, slackUserId: { $ne: null } });
  if (owner) return owner;
  return User.findOne({ isActive: true, slackUserId: { $ne: null }, permissions: { $elemMatch: { module, actions: action } } });
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

function buildBlocks({ title, lines, deepLinkUrl, approvalId, footer }) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
    {
      type: 'section',
      fields: lines.map(l => ({ type: 'mrkdwn', text: `*${l.label}:*\n${l.value}` })),
    },
  ];
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

// Creates the tracking row, posts the Slack message, and saves the returned
// channel/ts back onto it so the message can be updated later. Called right
// after an entity flips into a stage that's Rahul's (or whoever's) turn —
// see workOrderController.approverApprove / billController.l1AgmApprove.
async function createApprovalAndNotify({ approvalType, entityType, entityId, approverUser, title, lines, deepLinkPath }) {
  const approval = await SlackApproval.create({
    approvalType, entityType, entityId,
    approverUserId: approverUser._id,
    title, lines, deepLinkPath,
  });

  const deepLinkUrl = `${process.env.FRONTEND_URL.split(',')[0].trim()}${deepLinkPath}`;
  const blocks = buildBlocks({ title, lines, deepLinkUrl, approvalId: String(approval._id) });

  const posted = await slackCall('chat.postMessage', {
    channel: process.env.SLACK_APPROVAL_CHANNEL_ID,
    text: title, // fallback for notifications
    blocks,
  });

  approval.slackChannel = posted.channel;
  approval.slackMessageTs = posted.ts;
  await approval.save();
  return approval;
}

// Replaces the action buttons with a plain decided-state line — called after
// the real approve/reject write has already succeeded.
async function updateApprovalMessage(approval, { decidedByName, verb, remarks }) {
  if (!approval.slackChannel || !approval.slackMessageTs) return;
  const icon = verb === 'Approved' ? '✅' : '❌';
  const footer = `${icon} *${verb} by ${decidedByName}* — ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` +
    (remarks ? `\n_${remarks}_` : '');
  const blocks = buildBlocks({ title: approval.title, lines: approval.lines, footer });
  await slackCall('chat.update', {
    channel: approval.slackChannel,
    ts: approval.slackMessageTs,
    text: `${approval.title} — ${verb}`,
    blocks,
  });
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

module.exports = { createApprovalAndNotify, updateApprovalMessage, openReasonModal, postEphemeral, resolveApproverUser };
