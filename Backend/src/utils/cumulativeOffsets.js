// Cumulative ("ab tak ka total") bills.
//
// Some running bills state the work done TILL DATE and take the earlier bills of the same work order off again as
// "advance recovery", so the vendor is only paid the new part. Adding up their gross amounts counts the same work again and
// again. For such a bill the part of its recovery that is explained by earlier bills sitting INSIDE it (same work order,
// every item quantity no more than this bill's) is not new work — it is returned here, to be taken off "Billed".
//
//  - Recovery that is backed by an advance actually given (advance bills to the same vendor group on the same project) is a
//    real advance recovery. Billed counts the advance itself, so this part is taken off the running bill too (no double count).
//  - Recovery that no earlier bill explains (paid earlier on paper, outside the system) is left alone too.
//  - Only the money rollups' "Billed" is affected. Paid / net payable are unchanged (they already net the recovery off).
const RunningBill = require('../models/RunningBill');
const Contractor = require('../models/Contractor');
const { excludeDuplicateBills } = require('./duplicateBills');

const TTL_MS = 5 * 60 * 1000;
const QTY_TOLERANCE = 1.01; // an item quantity that is within 1% still counts as "inside"
let cache = { at: 0, map: new Map() };
// map.backedMap (billId -> the part of that bill's amount taken off for a real advance recovery) rides on the returned Map.

const isAdvance = (b) => String(b.billType || '').startsWith('advance');
const key = (s) => String(s || '').trim().toLowerCase();
const qtyOf = (b) => {
  const m = new Map();
  for (const l of b.lineItems || []) m.set(key(l.description), (m.get(key(l.description)) || 0) + (Number(l.billedQty) || 0));
  return m;
};
const inside = (small, big) => small.size > 0 && [...small].every(([k, v]) => (big.get(k) || 0) * QTY_TOLERANCE + 0.01 >= v);

async function getCumulativeOffsets() {
  if (Date.now() - cache.at < TTL_MS) return cache.map;
  let bills = await RunningBill.find({ isArchived: { $ne: true }, status: { $nin: ['rejected', 'submitted'] } })
    .select('workOrderId projectId vendorCode billType amount advanceRecovery billDate lineItems status remarks').lean();
  bills = await excludeDuplicateBills(bills);

  const groupOf = new Map((await Contractor.find({}).select('vendorCode groupId').lean()).map((c) => [c.vendorCode, c.groupId ? 'G' + String(c.groupId) : null]));
  const poolKey = (b) => String(b.projectId) + '|' + (groupOf.get(b.vendorCode) || b.vendorCode);
  const pool = new Map(); // advance actually given, per project + vendor group
  for (const b of bills) if (isAdvance(b)) pool.set(poolKey(b), (pool.get(poolKey(b)) || 0) + (b.amount || 0));

  const work = bills.filter((b) => !isAdvance(b));
  const byWo = new Map();
  for (const b of work) { const k = String(b.workOrderId); if (!byWo.has(k)) byWo.set(k, []); byWo.get(k).push(b); }
  const qtys = new Map(work.map((b) => [String(b._id), qtyOf(b)]));

  const map = new Map();
  const backedMap = new Map();
  map.backedMap = backedMap;
  const withRecovery = work.filter((b) => (b.advanceRecovery || 0) > 0).sort((a, b) => new Date(a.billDate) - new Date(b.billDate));
  for (const b of withRecovery) {
    const pk = poolKey(b);
    const left = pool.get(pk) || 0;
    const backed = Math.min(b.advanceRecovery, left);
    pool.set(pk, left - backed);
    if (backed > 0.5) backedMap.set(String(b._id), Math.round(backed * 100) / 100);
    const excess = b.advanceRecovery - backed;
    // Recovery of a real advance is taken off Billed too: the advance itself is counted in Billed, so without this the same
    // money would be counted twice (once as the advance, once inside the running bill's gross).
    if (excess <= 0.5) { if (backed > 0.5) map.set(String(b._id), Math.round(backed * 100) / 100); continue; }
    const q = qtys.get(String(b._id));
    const others = (byWo.get(String(b.workOrderId)) || []).filter((o) => String(o._id) !== String(b._id)
      && ((o.amount || 0) < (b.amount || 0) - 1 || (Math.abs((o.amount || 0) - (b.amount || 0)) <= 1 && String(o._id) < String(b._id)))
      && inside(qtys.get(String(o._id)), q));
    // a bill that is itself inside another of these is already counted by that one
    const maximal = others.filter((o) => !others.some((p) => p !== o && (p.amount || 0) >= (o.amount || 0) && inside(qtys.get(String(o._id)), qtys.get(String(p._id)))));
    const covered = maximal.reduce((s, o) => s + (o.amount || 0), 0);
    const offset = Math.min(excess, covered);
    const total = backed + (offset > 0.5 ? offset : 0);
    if (total > 0.5) map.set(String(b._id), Math.round(total * 100) / 100);
  }
  cache = { at: Date.now(), map };
  return map;
}

module.exports = { getCumulativeOffsets };
