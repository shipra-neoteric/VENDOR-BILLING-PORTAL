const asyncHandler = require('../utils/asyncHandler');
const { success, badRequest } = require('../utils/responseFormatter');
const { exportBackupZip, restoreFromZip } = require('../utils/backup');
const { sendMail } = require('../utils/mailer');

const CONFIRM_HEADER = 'x-confirm-restore';
const CONFIRM_VALUE = 'RESTORE';

const CRON_SECRET_HEADER = 'x-cron-secret';
// Most mail providers cap the whole message near 25MB, and base64-encoding a
// binary attachment inflates its size by roughly a third — staying under 20MB
// of raw zip keeps the encoded message safely under that ceiling.
const MAX_EMAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

// GET /api/backup/export — owner-only (see routes/backup.js). Streams a
// single .zip containing every collection as EJSON, plus a manifest. Used
// both for the page's own "Download Backup" button and, from the frontend,
// as the auto safety-snapshot taken right before a restore.
exports.exportBackup = asyncHandler(async (req, res) => {
  const buffer = await exportBackupZip();
  const filename = `vbp-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
  res.set('Content-Type', 'application/zip');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.set('Content-Length', String(buffer.length));
  res.send(buffer);
});

// POST /api/backup/import — owner-only. Body is the raw .zip bytes
// (express.raw, not multipart — see routes/backup.js). Defense-in-depth
// beyond the frontend's own typed "RESTORE" confirmation: rejects outright
// if this header isn't present and exactly right, before ever touching the
// uploaded bytes or the database.
exports.importBackup = asyncHandler(async (req, res) => {
  if (req.get(CONFIRM_HEADER) !== CONFIRM_VALUE) {
    return badRequest(res, `Missing or incorrect ${CONFIRM_HEADER} header — restore refused`);
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return badRequest(res, 'No backup file received');
  }

  let results;
  try {
    results = await restoreFromZip(req.body);
  } catch (err) {
    // restoreFromZip validates the archive (manifest present/parseable)
    // before deleting anything — a thrown error here means nothing was
    // touched yet, so this is safely a 400, not a partial-restore 500.
    return badRequest(res, err.message);
  }

  success(res, { results }, 'Restore complete');
});

// GET /api/backup/scheduled — no user session exists at 11 PM, so this is
// protected by a shared secret header (set by the external cron trigger,
// e.g. cron-job.org) instead of authenticate/authorize('owner'). See
// routes/backup.js — this route is deliberately mounted before the
// router.use(authenticate) line so it stays reachable with no JWT.
exports.scheduledBackupEmail = asyncHandler(async (req, res) => {
  if (!process.env.BACKUP_CRON_SECRET || req.get(CRON_SECRET_HEADER) !== process.env.BACKUP_CRON_SECRET) {
    return badRequest(res, 'Missing or incorrect cron secret');
  }
  if (!process.env.BACKUP_EMAIL_TO) {
    return badRequest(res, 'BACKUP_EMAIL_TO is not configured yet');
  }

  const buffer = await exportBackupZip();
  const dateLabel = new Date().toDateString();
  const filename = `vbp-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
  const tooLarge = buffer.length > MAX_EMAIL_ATTACHMENT_BYTES;

  await sendMail({
    to: process.env.BACKUP_EMAIL_TO,
    subject: tooLarge
      ? `VMS backup ${dateLabel} — too large to email, download manually`
      : `VMS daily backup — ${dateLabel}`,
    text: tooLarge
      ? `Today's backup is ${(buffer.length / (1024 * 1024)).toFixed(1)}MB, too large to send by email. Log into the app and download it from the Backup page instead.`
      : `Attached is today's full database backup (${filename}).`,
    attachments: tooLarge ? [] : [{ filename, content: buffer }],
  });

  success(res, { sentTo: process.env.BACKUP_EMAIL_TO, sizeBytes: buffer.length, attached: !tooLarge }, 'Scheduled backup email sent');
});
