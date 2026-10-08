const crypto = require('crypto');

// Constant-time shared-secret comparison — same pattern webhooks.js already
// uses for the TMS callback secret, pulled out so the cron-secret checks in
// backupController.js/recurringController.js (previously a plain `!==`
// string comparison) use the same safe comparison instead of duplicating it.
function timingSafeEqualStr(provided, expected) {
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(String(expected || ''));
  return !!expected && a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { timingSafeEqualStr };
