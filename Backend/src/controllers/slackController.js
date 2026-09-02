const crypto = require('crypto');
const User = require('../models/User');
const SlackApproval = require('../models/SlackApproval');
const workOrderController = require('./workOrderController');
const billController = require('./billController');
const { can } = require('../middleware/auth');
const { updateApprovalMessage, openReasonModal, postEphemeral } = require('../utils/slackApprovals');

// Per-approvalType wiring: which real controller function to call for
// Approve/Reject, and which permission gate matches the route's own
// authorizeOr/authorizeAnyOr (see routes/workOrders.js, routes/bills.js) —
// checked again here since calling a controller function directly bypasses
// the Express middleware chain that normally guards it.
const ACTIONS = {
  WORK_ORDER_OWNER_APPROVAL: {
    module: 'work-orders', action: 'ceo-approve', roles: ['owner'],
    approveFn: workOrderController.finalApprove,
    rejectFn: workOrderController.sendBack,
  },
  PAYMENT_L2_GM_APPROVAL: {
    module: 'accounts-payment', action: 'l2-director-approve', roles: ['owner'],
    approveFn: billController.l2DirectorApprove,
    rejectFn: billController.rejectBill,
  },
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
  const cfg = ACTIONS[approval.approvalType];
  await runController(cfg.approveFn, { params: { id: String(approval.entityId) }, body: {}, user: actingUser });
  approval.status = 'approved';
  approval.decidedBy = actingUser._id;
  approval.decidedAt = new Date();
  await approval.save();
  await updateApprovalMessage(approval, { decidedByName: actingUser.name, verb: 'Approved' });
}

async function handleReject(approval, actingUser, reason) {
  const cfg = ACTIONS[approval.approvalType];
  await runController(cfg.rejectFn, { params: { id: String(approval.entityId) }, body: { reason }, user: actingUser });
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
      const cfg = ACTIONS[approval.approvalType];
      if (!can(actingUser, cfg.module, cfg.action, ...cfg.roles)) return;
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
        const cfg = ACTIONS[approval.approvalType];
        if (!can(actingUser, cfg.module, cfg.action, ...cfg.roles)) {
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
