const asyncHandler = require('../utils/asyncHandler');
const { success, badRequest } = require('../utils/responseFormatter');
const { exportBackupZip, restoreFromZip } = require('../utils/backup');

const CONFIRM_HEADER = 'x-confirm-restore';
const CONFIRM_VALUE = 'RESTORE';

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
