// Temporary "allow-list only" lock: while on, nobody except the allowed accounts can sign in,
// and tokens already issued to anyone else stop working too (otherwise people who were
// logged in before the lock would carry on for the rest of their 7-day token).
//
// ON by default (fail-closed — a missing env var must never leave the system open).
//   ADMIN_ONLY_LOGIN_EMAIL=a@x.in,b@x.in → only those emails are allowed (comma separated)
//   ADMIN_ONLY_LOGIN_EMAIL=off           → lock lifted, everyone can sign in again
// Changing the env var on Render only restarts the service; no code change needed.
const DEFAULT_ALLOWED = ['admin@neotericgrp.in', 'rahul@neotericgrp.in'];
const MESSAGE = 'System is under maintenance. Only the administrator can sign in right now.';

// null = lock lifted; otherwise the list of allowed emails
function allowedEmails() {
  const raw = process.env.ADMIN_ONLY_LOGIN_EMAIL;
  if (raw == null) return DEFAULT_ALLOWED;
  const v = raw.trim().toLowerCase();
  if (v === 'off' || v === 'false' || v === '0') return null;
  const list = v.split(',').map(s => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_ALLOWED;
}

// true when this email is blocked by the lock
function isBlocked(email) {
  const allowed = allowedEmails();
  if (!allowed) return false;
  return !allowed.includes(String(email || '').trim().toLowerCase());
}

// Express middleware for POST /auth/login — runs before the password check.
function loginLock(req, res, next) {
  if (isBlocked(req.body && req.body.email)) {
    return res.status(403).json({ success: false, message: MESSAGE });
  }
  next();
}

module.exports = { isBlocked, loginLock, MESSAGE };
