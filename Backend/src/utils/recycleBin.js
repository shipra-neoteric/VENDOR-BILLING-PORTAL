const DeletedRecord = require('../models/DeletedRecord');

// Which record types the Recycle Bin can hold and bring back. `unique` lists
// the human-facing fields that must not collide with a record created after
// the delete (e.g. a work-order number) before we put the old one back.
// Add a type here + call archiveDeleted() from its delete controller.
const RECYCLABLE = {
  WorkOrder:   { title: 'Work Order',   model: () => require('../models/WorkOrder'),   label: (d) => d.workOrderNo || '',                                  unique: ['workOrderNo'] },
  Contractor:  { title: 'Contractor',   model: () => require('../models/Contractor'),  label: (d) => `${d.companyName || ''} (${d.vendorCode || ''})`.trim(), unique: ['vendorCode'] },
  AdvanceSlip: { title: 'Advance Slip', model: () => require('../models/AdvanceSlip'), label: (d) => d.slipNo || '',                                       unique: ['slipNo'] },
  // Only ever deleted while 'rejected' (see recordsController.deleteRejected) — reject has
  // already unwound their billed-qty / advance-recovery effects, so a plain copy is enough.
  RunningBill: { title: 'Bill',         model: () => require('../models/RunningBill'), label: (d) => d.billNo || '',                                       unique: ['billNo'] },
  BillRequest: { title: 'Bill Request', model: () => require('../models/BillRequest'), label: (d) => d.reqNo || '',                                        unique: ['reqNo'] },
};

const actorOf = (user) => ({ id: user?._id || null, name: user?.name || '', email: user?.email || '' });

// Must be awaited BEFORE the real delete. It throws if the copy could not be
// saved, so the caller never deletes something it failed to archive.
async function archiveDeleted(entityType, doc, user, reason) {
  const cfg = RECYCLABLE[entityType];
  if (!cfg) throw new Error(`Recycle Bin does not support "${entityType}"`);
  return DeletedRecord.create({
    entityType,
    entityId: doc._id,
    label: cfg.label(doc),
    snapshot: doc.toObject({ depopulate: true, versionKey: true }),
    reason: String(reason || '').trim().slice(0, 500),
    deletedBy: actorOf(user),
  });
}

// Puts the exact deleted document back. Returns { error } for a refusal the UI
// should show, or { ok: true, label } on success.
async function restoreDeleted(recordId, user) {
  const rec = await DeletedRecord.findById(recordId).lean();
  if (!rec) return { error: 'Recycle Bin entry not found', status: 404 };
  if (rec.restoredAt) return { error: 'This record was already restored', status: 409 };
  const cfg = RECYCLABLE[rec.entityType];
  if (!cfg) return { error: `Restoring "${rec.entityType}" is not supported`, status: 400 };

  const Model = cfg.model();
  if (await Model.exists({ _id: rec.entityId })) {
    return { error: `${cfg.title} ${rec.label} already exists again — nothing to restore`, status: 409 };
  }
  for (const field of cfg.unique) {
    const value = rec.snapshot?.[field];
    if (value && await Model.exists({ [field]: value })) {
      return { error: `Cannot restore: ${field} "${value}" is now used by another ${cfg.title.toLowerCase()}`, status: 409 };
    }
  }

  // Raw insert on purpose: keeps _id, createdAt/updatedAt and __v exactly as they
  // were, and does not re-run hooks that could renumber or re-stamp the record.
  await Model.collection.insertOne(rec.snapshot);
  await DeletedRecord.updateOne({ _id: rec._id }, { $set: { restoredAt: new Date(), restoredBy: actorOf(user) } });
  return { ok: true, label: rec.label, entityType: rec.entityType, entityId: rec.entityId, title: cfg.title };
}

module.exports = { RECYCLABLE, archiveDeleted, restoreDeleted };
