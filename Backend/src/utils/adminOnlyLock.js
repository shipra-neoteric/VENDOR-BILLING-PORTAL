// Temporary "admin only" lock: while on, nobody except the one admin account can sign in,
// and tokens already issued to anyone else stop working too (otherwise people who were
// logged in before the lock would carry on for the rest of their 7-day token).
//
// ON by default (fail-closed — a missing env var must never leave the system open).
//   ADMIN_ONLY_LOGIN_EMAIL=<email>  → that email is the only one allowed (default below)
//   ADMIN_ONLY_LOGIN_EMAIL=off      → lock lifted, everyone can sign in again
// Changing the env var on Render only restarts the service; no code change needed.
const DEFAULT_ADMIN_EMAIL = 'admin@neotericgrp.in';
const MESSAGE = 'System is under maintenance. Only the administrator can sign in right now.';

function allowedEmail() {
  const v = (process.env.ADMIN_ONLY_LOGIN_EMAIL ?? DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  if (v === 'off' || v === 'false' || v === '0') return null; // lock lifted
  return v || DEFAULT_ADMIN_EMAIL;
}

// true when this email is blocked by the lock
function isBlocked(email) {
  const allowed = allowedEmail();
  if (!allowed) return false;
  return String(email || '').trim().toLowerCase() !== allowed;
}

// Express middleware for POST /auth/login — runs before the password check.
function loginLock(req, res, next) {
  if (isBlocked(req.body && req.body.email)) {
    return res.status(403).json({ success: false, message: MESSAGE });
  }
  next();
}

module.exports = { isBlocked, loginLock, MESSAGE };
