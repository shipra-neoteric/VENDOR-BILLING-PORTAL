const ProjectEvent = require('../models/ProjectEvent');

/**
 * Fire-and-forget event recorder. Never throws — errors are logged and swallowed
 * so a timeline failure never blocks the main operation.
 */
async function emitEvent(type, payload = {}) {
  try {
    const {
      projectId, workOrderId, workOrderNo, billRequestId, runningBillId,
      vendorCode, vendorName, stageNo, user, remarks, metadata,
    } = payload;
    if (!projectId) return;
    await ProjectEvent.create({
      projectId, workOrderId, workOrderNo, billRequestId, runningBillId,
      type, vendorCode, vendorName, stageNo,
      performedBy:     user?._id    || undefined,
      performedByName: user?.name   || undefined,
      remarks:  remarks  || '',
      metadata: metadata || {},
    });
  } catch (err) {
    console.error('[emitEvent]', type, err.message);
  }
}

module.exports = emitEvent;
