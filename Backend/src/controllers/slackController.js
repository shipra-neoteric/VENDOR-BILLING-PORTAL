const crypto = require('crypto');
const User = require('../models/User');
const SlackApproval = require('../models/SlackApproval');
const workOrderController = require('./workOrderController');
const billController = require('./billController');
const billRequestController = require('./billRequestController');
const { can } = require('../middleware/auth');
const { STAGES } = require('../config/approvalStages');
const { updateApprovalMessage, openReasonModal, postEphemeral, postMessage } = require('../utils/slackApprovals');

// Per-approvalType wiring: which real controller function to call for
// Approve/Reject. The permission gate (module/action/roles) lives once in
// approvalStages.js and is looked up from there below — checked again here
// since calling a controller function directly bypasses the Express
// middleware chain (authorizeOr/authorizeAnyOr) that normally guards it.
// rejectBodyKey defaults to 'reason' (sendBack/rejectBill/manualReject all
// read req.body.reason) — rejectBillRequest is the one outlier, reading
// req.body.rejectReason instead (matches BillRequests/index.tsx's own PUT
// .../reject call), so it's called out explicitly per entry below.
const CONTROLLER_FNS = {
  WORK_ORDER_CHECKER_APPROVAL:  { approveFn: workOrderController.checkerApprove,  rejectFn: workOrderController.sendBack },
  WORK_ORDER_APPROVER_APPROVAL: { approveFn: workOrderController.approverApprove, rejectFn: workOrderController.sendBack },
  WORK_ORDER_OWNER_APPROVAL:    { approveFn: workOrderController.finalApprove,    rejectFn: workOrderController.sendBack },
  BILL_REQUEST_AGM_APPROVAL:    { approveFn: billRequestController.agmApprove,    rejectFn: billRequestController.rejectBillRequest, rejectBodyKey: 'rejectReason' },
  BILL_REQUEST_GM_APPROVAL:     { approveFn: billRequestController.gmApprove,     rejectFn: billRequestController.rejectBillRequest, rejectBodyKey: 'rejectReason' },
  BILL_REQUEST_L3_APPROVAL:     { approveFn: billRequestController.l3Approve,     rejectFn: billRequestController.rejectBillRequest, rejectBodyKey: 'rejectReason' },
  BILL_REQUEST_L4_APPROVAL:     { approveFn: billRequestController.l4Approve,     rejectFn: billRequestController.rejectBillRequest, rejectBodyKey: 'rejectReason' },
  PAYMENT_MANUAL_AGM_APPROVAL:  { approveFn: billController.manualAgmApprove,     rejectFn: billController.manualReject },
  PAYMENT_MANUAL_GM_APPROVAL:   { approveFn: billController.manualGmApprove,      rejectFn: billController.manualReject },
  PAYMENT_MANUAL_L3_APPROVAL:   { approveFn: billController.manualL3Approve,      rejectFn: billController.manualReject },
  PAYMENT_MANUAL_L4_APPROVAL:   { approveFn: billController.manualL4Approve,      rejectFn: billController.manualReject },
  PAYMENT_VERIFY_APPROVAL:      { approveFn: billController.verifyBill,           rejectFn: billController.rejectBill },
  PAYMENT_L1_AGM_APPROVAL:      { approveFn: billController.l1AgmApprove,         rejectFn: billController.rejectBill },
  PAYMENT_L2_GM_APPROVAL:       { approveFn: billController.l2DirectorApprove,    rejectFn: billController.rejectBill },
};

// Verifies Slack's request signature against the raw body (captured by the
// express.urlencoded `verify` option in index.js, since this route must run
// ahead of the global express.json() parser). Rejects anything older than 5
// minutes to block replay of a captured request.
function verifySlackSignature(req) {
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];
  if (!signature || !timestamp) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) return false;

  const base = `v0:${timestamp}:${req.rawBody.toString('utf8')}`;
  const hmac = 'v0=' + crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET).update(base).digest('hex');
  const a = Buffer.from(hmac);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Calls an existing, already-fully-validated controller function (finalApprove,
// sendBack, l2DirectorApprove, rejectBill, …) directly, so Slack's buttons run
// the exact same business logic — segregation-of-duty checks, approvalHistory,
// audit log, isLocked, everything — as clicking the button in the app itself.
function runController(fn, { params, body, user }) {
  return new Promise((resolve, reject) => {
    const req = { params, body, user };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) {
        if (this.statusCode >= 400) {
          reject(Object.assign(new Error(payload?.message || 'Request failed'), { statusCode: this.statusCode }));
        } else {
          resolve(payload);
        }
      },
    };
    fn(req, res, reject);
  });
}

async function resolveActingUser(slackUserId) {
  if (!slackUserId) return null;
  return User.findOne({ slackUserId, isActive: true });
}

async function handleApprove(approval, actingUser) {
  const { approveFn } = CONTROLLER_FNS[approval.approvalType];
  await runController(approveFn, { params: { id: String(approval.entityId) }, body: {}, user: actingUser });
  approval.status = 'approved';
  approval.decidedBy = actingUser._id;
  approval.decidedAt = new Date();
  await approval.save();
  await updateApprovalMessage(approval, { decidedByName: actingUser.name, verb: 'Approved' });
}

async function handleReject(approval, actingUser, reason) {
  const { rejectFn, rejectBodyKey = 'reason' } = CONTROLLER_FNS[approval.approvalType];
  await runController(rejectFn, { params: { id: String(approval.entityId) }, body: { [rejectBodyKey]: reason }, user: actingUser });
  approval.status = 'rejected';
  approval.decidedBy = actingUser._id;
  approval.decidedAt = new Date();
  approval.remarks = reason;
  await approval.save();
  await updateApprovalMessage(approval, { decidedByName: actingUser.name, verb: 'Rejected', remarks: reason });
}

exports.handleInteraction = async (req, res) => {
  if (!verifySlackSignature(req)) return res.status(401).send('Invalid signature');

  const payload = JSON.parse(req.body.payload);

  // Modal submission (the Reject reason form) — ack fast, closes the modal.
  if (payload.type === 'view_submission' && payload.view.callback_id === 'slack_approval_reject') {
    res.json({}); // empty response_action closes the modal immediately
    const approvalId = payload.view.private_metadata;
    const reason = payload.view.state.values.reason_block.reason_input.value || 'No reason provided';
    (async () => {
      const approval = await SlackApproval.findById(approvalId);
      if (!approval || approval.status !== 'pending') return;
      const actingUser = await resolveActingUser(payload.user.id);
      if (!actingUser) return;
      const stage = STAGES[approval.approvalType];
      if (!can(actingUser, stage.module, stage.action, ...stage.roles)) return;
      try {
        await handleReject(approval, actingUser, reason);
      } catch (err) {
        console.error('[slackController] reject failed', err.message);
      }
    })();
    return;
  }

  if (payload.type === 'block_actions') {
    const action = payload.actions[0];
    const approvalId = action.action_id.slice(action.action_id.indexOf('_') + 1);
    const isApprove = action.action_id.startsWith('approve_');
    const isReject = action.action_id.startsWith('reject_');

    if (isReject) {
      // trigger_id expires in ~3s — open the modal before doing anything else.
      const approval = await SlackApproval.findById(approvalId);
      if (approval && approval.status === 'pending') {
        try {
          await openReasonModal(payload.trigger_id, approvalId);
        } catch (err) {
          console.error('[slackController] openReasonModal failed', err.message);
        }
      }
      return res.status(200).send();
    }

    if (isApprove) {
      res.status(200).send(); // ack immediately, Slack only needs a 200 within 3s
      (async () => {
        const approval = await SlackApproval.findById(approvalId);
        if (!approval || approval.status !== 'pending') return; // already decided — Slack retry, ignore
        const actingUser = await resolveActingUser(payload.user.id);
        if (!actingUser) {
          return postEphemeral(payload.channel.id, payload.user.id, "Your Slack account isn't linked to a portal user — contact an admin.");
        }
        const stage = STAGES[approval.approvalType];
        if (!can(actingUser, stage.module, stage.action, ...stage.roles)) {
          return postEphemeral(payload.channel.id, payload.user.id, "You don't have permission to approve this.");
        }
        try {
          await handleApprove(approval, actingUser);
        } catch (err) {
          console.error('[slackController] approve failed', err.message);
          await postEphemeral(payload.channel.id, payload.user.id, `Approval failed: ${err.message}`);
        }
      })();
      return;
    }

    return res.status(200).send();
  }

  res.status(200).send();
};

// Formats a person's own pending approvals for a DM reply — reuses each
// SlackApproval's own saved title/lines/deepLinkPath snapshot (no re-fetch of
// the underlying WorkOrder/RunningBill/BillRequest needed).
function buildPendingListBlocks(pending) {
  if (!pending.length) {
    return [{ type: 'section', text: { type: 'mrkdwn', text: '🎉 No pending approvals right now.' } }];
  }
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `You have ${pending.length} pending approval${pending.length !== 1 ? 's' : ''}`, emoji: true } },
  ];
  for (const a of pending) {
    const deepLinkUrl = `${process.env.FRONTEND_URL.split(',')[0].trim()}${a.deepLinkPath}`;
    const key = a.lines.find((l) => ['Work Order', 'Bill', 'Bill Request'].includes(l.label))?.value || '';
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*<${deepLinkUrl}|${a.title}>*${key ? `\n${key}` : ''}` } });
  }
  return blocks;
}

// POST /api/slack/events — the bot's DM conversation entry point (separate
// from /interactions, which only handles button clicks / modal submits).
// Slack's Event Subscriptions must be pointed here, subscribed to the
// `message.im` bot event, with the `im:history` scope granted.
exports.handleEvent = async (req, res) => {
  if (!verifySlackSignature(req)) return res.status(401).send('Invalid signature');

  // One-time handshake Slack does when you first save the Request URL in the
  // Event Subscriptions page — just echo the challenge back.
  if (req.body.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  res.status(200).send(); // ack immediately — Slack needs a 200 within 3s

  const event = req.body.event;
  // subtype is set on edits/deletes/etc (not a real new message); bot_id is
  // set on messages OUR OWN bot posts (including its replies here) — without
  // this check, replying would trigger another event, replying to itself.
  if (!event || event.type !== 'message' || event.subtype || event.bot_id) return;
  if (event.channel_type !== 'im') return; // DMs only for now

  (async () => {
    const actingUser = await resolveActingUser(event.user);
    if (!actingUser) {
      return postMessage(event.channel, "Your Slack account isn't linked to a portal user — contact an admin.");
    }

    const text = (event.text || '').trim().toLowerCase();
    if (text === 'pending') {
      const pending = await SlackApproval.find({ approverUserIds: actingUser._id, status: 'pending' }).sort({ createdAt: 1 });
      return postMessage(event.channel, `You have ${pending.length} pending approval${pending.length !== 1 ? 's' : ''}`, buildPendingListBlocks(pending));
    }
    return postMessage(event.channel, 'I can show your pending approvals — type `pending`.');
  })().catch((err) => console.error('[slackController] event handling failed', err.message));
};
