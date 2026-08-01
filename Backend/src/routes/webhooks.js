const router = require('express').Router();
const crypto = require('crypto');
const { unauthorized } = require('../utils/responseFormatter');
const { tmsCallback } = require('../controllers/billController');

// No authenticate() here on purpose — TMS is an external system, not a
// logged-in user, so it can't carry a session/JWT. A shared secret header is
// the simplest proportionate check given there's no existing HMAC-signing
// precedent anywhere else in this backend to match instead.
function verifyTmsSecret(req, res, next) {
  const expected = process.env.TMS_CALLBACK_SECRET || '';
  const provided = req.headers['x-tms-callback-secret'] || '';
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  const match = expected && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!match) return unauthorized(res, 'Invalid or missing callback secret');
  next();
}

router.post('/tms-callback', verifyTmsSecret, tmsCallback);

module.exports = router;
