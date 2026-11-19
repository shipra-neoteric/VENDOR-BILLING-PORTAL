const mongoose = require('mongoose');
const RunningBill = require('../models/RunningBill');
const BillRequest = require('../models/BillRequest');
const AdvanceSlip = require('../models/AdvanceSlip');
const WorkOrder = require('../models/WorkOrder');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');
const { success, notFound, badRequest, conflict } = require('../utils/responseFormatter');
const { logAudit } = require('../utils/auditLog');
const { archiveDeleted } = require('../utils/recycleBin');

// One place (Masters → Records, Admin/owner only) for everything that has been taken out
// of the normal lists: Archived, Cancelled and Rejected records, next to the Recycle Bin.
// Each action here reuses the SAME effects as the screen it normally lives on.

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MAX_BATCH = 200;
const LIST_LIMIT = 500;

// type key -> model + display helpers (RunningBill/BillRequest/AdvanceSlip all carry isArchived).
const TYPES = {
  RunningBill: { title: 'Bill',         model: RunningBill, label: (d) => d.billNo, module: 'billing-payments' },
  BillRequest: { title: 'Bill Request', model: BillRequest, label: (d) => d.reqNo,  module: 'bill-requests' },
  AdvanceSlip: { title: 'Advance Slip', model: AdvanceSlip, label: (d) => d.slipNo, module: 'advance-slips' },
};

const qFilter = (q, fields) => {
  const s = String(q || '').trim().slice(0, 100);
  if (!s) return {};
  const rx = { $regex: escapeRegex(s), $options: 'i' };
  return { $or: fields.map((f) => ({ [f]: rx })) };
};

const rowOf = (type, d) => ({
  type, typeTitle: TYPES[type].title, id: d._id, label: TYPES[type].label(d) || '',
  project: d.projectName || '', party: d.vendorName || '', status: d.status || '',
  archivedAt: d.archivedAt || null, updatedAt: d.updatedAt || null,
});

// ── Archived ─────────────────────────────────────────────────────────────
// GET /api/records/archived?type=&q=
exports.listArchived = asyncHandler(async (req, res) => {
  const only = req.query.type;
  if (only && !Object.hasOwn(TYPES, only)) return badRequest(res, 'Unknown record type');
  const keys = only ? [only] : Object.keys(TYPES);
  const lists = await Promise.all(keys.map(async (k) => {
    const nameField = k === 'RunningBill' ? 'billNo' : k === 'BillRequest' ? 'reqNo' : 'slipNo';
    const filter = { isArchived: true, ...qFilter(req.query.q, [nameField, 'projectName', 'vendorName']) };
    const docs = await TYPES[k].model.find(filter).select(`${nameField} projectName vendorName status archivedAt updatedAt`).sort({ archivedAt: -1 }).limit(LIST_LIMIT).lean();
    return docs.map((d) => rowOf(k, d));
  }));
  const rows = lists.flat().sort((a, b) => new Date(b.archivedAt || 0) - new Date(a.archivedAt || 0));
  success(res, { rows, types: Object.entries(TYPES).map(([key, t]) => ({ key, title: t.title })) });
});

// POST /api/records/archived/unarchive  { items: [{ type, id }] }
// Mirrors unarchiveBill / unarchiveBillRequest / unarchiveAdvanceSlip, including the bill <-> request cascade.
exports.unarchive = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return badRequest(res, 'Pick at least one record');
  if (items.length > MAX_BATCH) return badRequest(res, `At most ${MAX_BATCH} at a time`);
  const results = [];
  for (const it of items) {
    if (!it || !Object.hasOwn(TYPES, it.type) || !mongoose.isValidObjectId(it.id)) { results.push({ ok: false, error: 'Invalid item' }); continue; }
    const t = TYPES[it.type];
    const doc = await t.model.findById(it.id);
    if (!doc) { results.push({ ok: false, error: 'Not found' }); continue; }
    doc.isArchived = false;
    doc.archivedAt = null;
    await doc.save();
    if (it.type === 'RunningBill') await BillRequest.updateMany({ billId: doc._id }, { isArchived: false, archivedAt: null });
    if (it.type === 'BillRequest' && doc.billId) await RunningBill.findByIdAndUpdate(doc.billId, { isArchived: false, archivedAt: null });
    await logAudit({
      action: 'UPDATE', module: t.module, user: req.user,
      description: `${t.title} ${t.label(doc)} unarchived (from Masters → Records)`,
      entityType: it.type, entityId: doc._id, entityLabel: t.label(doc),
    });
    results.push({ ok: true, label: t.label(doc) });
  }
  const done = results.filter((r) => r.ok).length;
  success(res, { results, done, failed: results.length - done }, `${done} unarchived`);
});

// ── Cancelled (work orders) ──────────────────────────────────────────────
// GET /api/records/cancelled?q=
exports.listCancelled = asyncHandler(async (req, res) => {
  const filter = { status: 'cancelled', ...qFilter(req.query.q, ['workOrderNo', 'projectName', 'vendorName', 'cancelReason']) };
  const rows = await WorkOrder.find(filter)
    .select('workOrderNo projectName vendorName contractValue cancelReason cancelledBy cancelledAt')
    .populate('cancelledBy', 'name')
    .sort({ cancelledAt: -1 }).limit(LIST_LIMIT).lean();
  success(res, {
    rows: rows.map((w) => ({
      id: w._id, label: w.workOrderNo, project: w.projectName || '', party: w.vendorName || '',
      contractValue: w.contractValue || 0, reason: w.cancelReason || '',
      cancelledBy: w.cancelledBy?.name || '', cancelledAt: w.cancelledAt || null,
    })),
  });
});

// POST /api/records/cancelled/:id/reactivate
// Puts the work order back to the status it had when it was cancelled (read from the audit
// trail; falls back to 'issued') and clears the cancel fields. It does NOT restart the SLA
// timer — cancelling stopped it, and starting a fresh one is a separate, deliberate step.
exports.reactivateWorkOrder = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return badRequest(res, 'Invalid id');
  const wo = await WorkOrder.findById(req.params.id);
  if (!wo) return notFound(res, 'Work order not found');
  if (wo.status !== 'cancelled') return conflict(res, `${wo.workOrderNo} is not cancelled`);

  const last = await AuditLog.findOne({
    module: 'work-orders', entityType: 'WorkOrder', entityId: wo._id, 'changes.status.to': 'cancelled',
  }).sort({ createdAt: -1 }).lean();
  const from = last?.changes?.status?.from;
  const restoreTo = ['draft', 'issued', 'in-progress', 'completed'].includes(from) ? from : 'issued';

  wo.status = restoreTo;
  wo.cancelReason = undefined;
  wo.cancelledBy = undefined;
  wo.cancelledAt = undefined;
  await wo.save();

  await logAudit({
    action: 'UPDATE', module: 'work-orders', user: req.user,
    description: `Reactivated cancelled work order ${wo.workOrderNo} (from Masters → Records) — back to '${restoreTo}'`,
    entityType: 'WorkOrder', entityId: wo._id, entityLabel: wo.workOrderNo,
    changes: { status: { from: 'cancelled', to: restoreTo } },
  });
  success(res, { id: wo._id, status: restoreTo }, `${wo.workOrderNo} reactivated as '${restoreTo}'. Its SLA timer was not restarted.`);
});

// ── Rejected (bills + bill requests) ─────────────────────────────────────
// GET /api/records/rejected?q=
exports.listRejected = asyncHandler(async (req, res) => {
  const mk = async (key, nameField) => {
    const filter = { status: 'rejected', ...qFilter(req.query.q, [nameField, 'projectName', 'vendorName']) };
    const docs = await TYPES[key].model.find(filter).select(`${nameField} projectName vendorName status isArchived archivedAt updatedAt`).sort({ updatedAt: -1 }).limit(LIST_LIMIT).lean();
    return docs.map((d) => ({ ...rowOf(key, d), isArchived: !!d.isArchived }));
  };
  const [bills, requests] = await Promise.all([mk('RunningBill', 'billNo'), mk('BillRequest', 'reqNo')]);
  const rows = [...bills, ...requests].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  success(res, { rows });
});

// POST /api/records/rejected/delete  { items: [{ type: 'RunningBill'|'BillRequest', id }], reason? }
// Only REJECTED records: rejecting already released their billed quantity and advance
// recovery, so removing them changes no figures. A full copy goes to the Recycle Bin first.
exports.deleteRejected = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return badRequest(res, 'Pick at least one record');
  if (items.length > MAX_BATCH) return badRequest(res, `At most ${MAX_BATCH} at a time`);
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  const results = [];
  for (const it of items) {
    if (!it || !['RunningBill', 'BillRequest'].includes(it.type) || !mongoose.isValidObjectId(it.id)) { results.push({ ok: false, error: 'Invalid item' }); continue; }
    const t = TYPES[it.type];
    const doc = await t.model.findById(it.id);
    if (!doc) { results.push({ ok: false, error: 'Not found' }); continue; }
    const label = t.label(doc);
    if (doc.status !== 'rejected') { results.push({ ok: false, label, error: `${label} is '${doc.status}' — only rejected records can be deleted. Reject it first.` }); continue; }

    if (it.type === 'RunningBill') {
      if (await AdvanceSlip.exists({ 'recoveries.billNo': doc.billNo })) {
        results.push({ ok: false, label, error: `${label} still has an advance recovery recorded against it` }); continue;
      }
    } else if (doc.billId) {
      const bill = await RunningBill.findById(doc.billId).select('status').lean();
      if (bill && bill.status !== 'rejected') {
        results.push({ ok: false, label, error: `${label} is linked to a live bill (${bill.status})` }); continue;
      }
    }
    await archiveDeleted(it.type, doc, req.user, reason); // copy first; throws (→ 500) if it can't be saved
    await doc.deleteOne();
    await logAudit({
      action: 'DELETE', module: t.module, user: req.user,
      description: `Deleted rejected ${t.title.toLowerCase()} ${label} (Masters → Records)${reason ? ` — ${reason}` : ''}`,
      entityType: it.type, entityId: doc._id, entityLabel: label,
    });
    results.push({ ok: true, label });
  }
  const done = results.filter((r) => r.ok).length;
  success(res, { results, done, failed: results.length - done }, `${done} moved to the Recycle Bin`);
});
