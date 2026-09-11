// Central Notification Center — server-side fan-out.
//
// Every notification is generated HERE, never on the frontend, and every
// recipient is resolved the exact same way the existing Slack-approval
// notifier (slackApprovals.js) already resolves who's allowed to act on an
// entity: an explicit module+action permission grant (or a trusted role),
// AND — for anything department-scoped — canActOnDepartment(user, doc), the
// same check the real approve/reject controller functions themselves already
// enforce. This file adds NO new permission system: `can()` from
// middleware/auth.js and canActOnDepartment() from departmentAccess.js are
// the only authority for "does this person get notified."
//
// A user only ever gets their OWN Notification rows (see notificationController.js's
// { userId: req.user._id } filter on every read), so nobody can see or open
// another user's notification.
const User = require('../models/User');
const Notification = require('../models/Notification');
const { can } = require('../middleware/auth');
const { canActOnDepartment } = require('./departmentAccess');
const { STAGES } = require('../config/approvalStages');
const { sendMail } = require('./mailer');

// Resolves candidate recipients the same way slackApprovals.resolveApproverUsers
// does — role bypass OR an explicit module+action grant — but does NOT require
// slackUserId (in-app notifications don't need Slack linked).
async function resolveEligibleUsers(module, action, roles = []) {
  return User.find({
    isActive: true,
    $or: [
      { role: { $in: roles } },
      { permissions: { $elemMatch: { module, actions: action } } },
    ],
  });
}

// Inserts one row per recipient. Duplicate (userId, type, entityId) is
// silently ignored (E11000) — see Notification.js's unique index — so a
// retried request or a re-notify on a stale stale-approval settle never
// double-notifies anyone.
async function insertForUsers(users, { type, category, title, message, entityType, entityId, link }) {
  const docs = users.map((u) => ({
    userId: u._id, type, category, title, message, entityType, entityId, link,
  }));
  if (!docs.length) return [];
  try {
    return await Notification.insertMany(docs, { ordered: false });
  } catch (err) {
    // insertMany with ordered:false still throws once for the whole batch on
    // any duplicate-key error, but every non-duplicate document in the batch
    // has already been written by the time it does — nothing further to do.
    if (err.code === 11000 || err.writeErrors) return [];
    throw err;
  }
}

async function maybeEmail(users, { title, message, link }) {
  if (!process.env.RESEND_API_KEY) return; // No email service configured — never fake it.
  const wanted = users.filter((u) => u.notificationPreferences?.email && u.email);
  const url = link ? `${(process.env.FRONTEND_URL || '').split(',')[0].trim()}${link}` : '';
  for (const u of wanted) {
    try {
      await sendMail({
        to: u.email,
        subject: title,
        text: `${message}${url ? `\n\nOpen: ${url}` : ''}`,
      });
    } catch (err) {
      console.error(`[notifications] email to ${u.email} failed`, err.message);
    }
  }
}

// The main entry point for every one of the 15 existing approval stages
// (Work Orders, Bill Requests, Payments) — mirrors notifyStagePending's own
// recipient resolution exactly (same STAGES config, same department filter)
// so "who gets Slacked" and "who gets an in-app notification" can never
// silently drift apart.
async function notifyStageInApp(approvalType, entityDoc) {
  const stage = STAGES[approvalType];
  if (!stage) return [];
  let recipients = await resolveEligibleUsers(stage.module, stage.action, stage.roles);
  if (stage.departmentScoped) recipients = recipients.filter((u) => canActOnDepartment(u, entityDoc));
  if (!recipients.length) return [];

  const lines = stage.buildLines(entityDoc);
  const message = lines.map((l) => `${l.label}: ${l.value}`).join(' · ');
  const created = await insertForUsers(recipients, {
    type: approvalType,
    category: categoryForEntityType(stage.entityType),
    title: stage.title,
    message,
    entityType: stage.entityType,
    entityId: entityDoc._id,
    link: stage.deepLinkPath(entityDoc),
  });
  await maybeEmail(recipients, { title: stage.title, message, link: stage.deepLinkPath(entityDoc) });
  return created;
}

function categoryForEntityType(entityType) {
  if (entityType === 'WorkOrder') return 'work-orders';
  if (entityType === 'BillRequest') return 'bill-requests';
  if (entityType === 'RunningBill') return 'payments';
  return 'approvals';
}

// Notifies exactly one specific user (e.g. "your Work Order was approved" —
// the maker, not a role-based audience) — still goes through the same
// dedup/email path as everything else.
async function notifyUser(userId, { type, category, title, message, entityType, entityId, link }) {
  if (!userId) return [];
  const user = await User.findById(userId);
  if (!user || !user.isActive) return [];
  const created = await insertForUsers([user], { type, category, title, message, entityType, entityId, link });
  await maybeEmail([user], { title, message, link });
  return created;
}

// Generic permission+role (and optional department) scoped fan-out — used for
// the categories with no pre-existing Slack STAGES entry (Drawing Requests,
// Advance Recovery, Site Progress, Contract Limits, Vendor Compliance).
async function notifyByPermission({ module, action, roles = [], entityDoc, departmentScoped, type, category, title, message, entityType, entityId, link, excludeUserId }) {
  let recipients = await resolveEligibleUsers(module, action, roles);
  if (departmentScoped) recipients = recipients.filter((u) => canActOnDepartment(u, entityDoc));
  if (excludeUserId) recipients = recipients.filter((u) => String(u._id) !== String(excludeUserId));
  if (!recipients.length) return [];
  const created = await insertForUsers(recipients, { type, category, title, message, entityType, entityId, link });
  await maybeEmail(recipients, { title, message, link });
  return created;
}

module.exports = {
  notifyStageInApp, notifyUser, notifyByPermission, resolveEligibleUsers,
};
