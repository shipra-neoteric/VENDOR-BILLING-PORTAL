const AuditLog = require('../models/AuditLog');

// Fire-and-forget audit trail write — must never block or fail the real action it's
// recording, so failures are swallowed (logged to console, not thrown).
async function logAudit({ action, module, user, description, entityType, entityId, entityLabel, changes, ip }) {
  try {
    await AuditLog.create({
      action,
      module,
      userId: user?._id || null,
      userName: user?.name || '',
      userEmail: user?.email || '',
      description,
      entityType: entityType || '',
      entityId: entityId || null,
      entityLabel: entityLabel || '',
      changes: changes || null,
      ip: ip || '',
    });
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

// Builds a shallow before/after map for only the fields that actually changed —
// used by update endpoints so the log shows exactly what moved, not a full document.
function diffFields(before, after, fields) {
  const changes = {};
  for (const f of fields) {
    const from = before?.[f];
    const to = after?.[f];
    const changed = JSON.stringify(from) !== JSON.stringify(to);
    if (changed && to !== undefined) changes[f] = { from: from ?? null, to };
  }
  return Object.keys(changes).length ? changes : null;
}

module.exports = { logAudit, diffFields };
