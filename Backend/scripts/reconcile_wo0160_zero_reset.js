// One-off: resets Done/Billed/Unbilled to 0 across every scope item and
// particular on WO-0160 (Zen Garden / Ambika Construction) — EXCEPT where a
// real, approved bill (BillRequest -> RunningBill) already exists for that
// item, in which case it's set to reflect that real billed amount instead of
// being erased. Blindly zeroing everything would let already-paid work look
// unbilled again and get billed (and paid) a second time — this only zeros
// what has no real money behind it.
//
// For each scope item / particular:
//   1. Sum any REAL approved billing found for it across every BillRequest
//      tied to this work order (matched by scopeItemId+subItemId when it
//      still resolves, falling back to description matching for older,
//      pre-particulars records whose ids no longer resolve at all).
//   2. If that real total > 0: set completedQty = lastBilledQty = that total
//      (preserved as correctly billed, not reset).
//   3. If nothing real is found: set completedQty = lastBilledQty = 0, and
//      invalidate any existing progress entries (reason recorded, kept for
//      audit rather than deleted) so the item goes back to a clean "pending"
//      state.
//
// Usage:
//   node scripts/reconcile_wo0160_zero_reset.js           (dry run — prints only)
//   node scripts/reconcile_wo0160_zero_reset.js --apply   (writes)
require('dotenv').config();
const mongoose = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');
const BillRequest = require('../src/models/BillRequest');
const { recomputeParentFromSubItems, deriveStatus } = require('../src/utils/progressHelpers');

const APPLY = process.argv.includes('--apply');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected —', APPLY ? 'APPLY MODE (will write)' : 'DRY RUN (no writes)');

  const wo = await WorkOrder.findOne({ workOrderNo: 'WO-0160' });
  if (!wo) throw new Error('WO-0160 not found — check you are pointed at the right database');
  console.log(`Found ${wo.workOrderNo} — ${wo.projectName || '(no project name)'} — vendor ${wo.vendorCode}`);

  const approvedBRs = await BillRequest.find({ workOrderId: wo._id, status: 'approved' });
  console.log(`\n${approvedBRs.length} approved bill request(s) found on this work order.`);

  // Real approved billed qty, keyed by "scopeItemId" or "scopeItemId:subItemId"
  // for items that still resolve, and by lowercased description text for
  // items whose id no longer resolves anywhere (legacy orphaned records).
  const realBilledById = new Map();
  const realBilledByDescription = new Map();
  const currentIds = new Set();
  for (const si of wo.scopeItems) {
    currentIds.add(String(si._id));
    for (const sub of si.subItems || []) currentIds.add(String(sub._id));
  }

  for (const br of approvedBRs) {
    for (const item of br.items) {
      const resolvesById = item.scopeItemId && currentIds.has(String(item.subItemId || item.scopeItemId));
      if (resolvesById) {
        const key = item.subItemId ? `${item.scopeItemId}:${item.subItemId}` : String(item.scopeItemId);
        realBilledById.set(key, (realBilledById.get(key) || 0) + Number(item.billedQty || 0));
      } else {
        const key = (item.description || '').trim().toLowerCase();
        realBilledByDescription.set(key, (realBilledByDescription.get(key) || 0) + Number(item.billedQty || 0));
      }
    }
  }

  const plan = []; // { label, target, realQty, currentCompleted, currentLastBilled }

  function planFor(target, label, key, fallbackDescKey) {
    const real = realBilledById.get(key) ?? realBilledByDescription.get(fallbackDescKey) ?? 0;
    plan.push({ label, target, realQty: real, currentCompleted: target.completedQty || 0, currentLastBilled: target.lastBilledQty || 0 });
  }

  for (const si of wo.scopeItems) {
    if (si.subItems && si.subItems.length > 0) {
      for (const sub of si.subItems) {
        planFor(sub, `${si.description} — ${sub.description}`, `${si._id}:${sub._id}`, sub.description.trim().toLowerCase());
      }
    } else {
      planFor(si, si.description, String(si._id), si.description.trim().toLowerCase());
    }
  }

  console.log('\n=== Plan ===');
  for (const p of plan) {
    const action = p.realQty > 0
      ? `PRESERVE as billed: completedQty/lastBilledQty -> ${p.realQty} (real approved billing found)`
      : `ZERO OUT: completedQty/lastBilledQty ${p.currentCompleted}/${p.currentLastBilled} -> 0/0`;
    console.log(`  ${p.label}: ${action}`);
  }

  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to write these changes.');
    await mongoose.disconnect();
    return;
  }

  for (const p of plan) {
    const t = p.target;
    if (p.realQty > 0) {
      t.completedQty = p.realQty;
      t.lastBilledQty = p.realQty;
      t.status = deriveStatus(t);
    } else {
      if (p.currentCompleted > 0 || (t.progressEntries || []).length > 0) {
        for (const entry of t.progressEntries) {
          if (!entry.invalidated?.done) {
            entry.invalidated = { done: true, at: new Date(), reason: 'Bulk reconciliation reset — no matching approved bill found for this quantity.' };
            entry.billedInRequestId = null;
          }
        }
      }
      t.completedQty = 0;
      t.lastBilledQty = 0;
      t.status = 'pending';
    }
  }

  for (const si of wo.scopeItems) {
    if (si.subItems && si.subItems.length > 0) recomputeParentFromSubItems(si);
  }

  await wo.save();
  console.log('\nApplied. WO-0160 now reflects zero everywhere with no real billing behind it, and the correct billed amount everywhere real billing exists.');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
