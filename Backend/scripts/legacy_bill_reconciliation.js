require('dotenv').config();
const mongoose = require('mongoose');

const WorkOrder    = require('../src/models/WorkOrder');
const BillRequest  = require('../src/models/BillRequest');
const RunningBill  = require('../src/models/RunningBill');
const User         = require('../src/models/User');
const { nextCode } = require('../src/utils/sequence');

// ── Legacy billing reconciliation ─────────────────────────────────────────
// For every Work Order, finds DRI progress entries dated on/before the cutoff
// that were never linked to a bill (billedInRequestId is null), and creates
// synthetic — but schema-correct, fully "approved/paid" — BillRequest +
// RunningBill records for them, since this work was actually billed/approved/
// paid via a pre-software manual paper process. Bundling: one bill per
// (Work Order, calendar date the progress was logged) — if a single Work
// Order has old progress spread across several distinct dates, each date
// gets its own separate bill, per the user's explicit instruction.
//
// Always targets the `vbp` (production) database directly by name, regardless
// of what database .env's MONGO_URI currently points at (local dev has been
// pointed at a `vbp_dev` clone for other work this session).
//
// Usage:
//   node legacy_bill_reconciliation.js                 # dry run — zero writes, prints report
//   node legacy_bill_reconciliation.js --write --confirm  # actually creates the records
// ───────────────────────────────────────────────────────────────────────────

const PROD_DB    = 'vbp';
const ADMIN_EMAIL = 'admin@neotericgrp.in';
const CUTOFF     = new Date('2026-07-15T23:59:59.999Z');
const BATCH_TAG  = 'LEGACY-RECON-2026-07-25';

const MODE_WRITE = process.argv.includes('--write');
const CONFIRMED  = process.argv.includes('--confirm');

function withDb(uri, dbName) {
  return uri.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
}

function dateKeyOf(d) {
  return d.toISOString().slice(0, 10);
}

function inr(n) {
  return `Rs.${Math.round(n).toLocaleString('en-IN')}`;
}

async function main() {
  if (MODE_WRITE && !CONFIRMED) {
    console.error('Refusing to write without --confirm. Review the dry-run report first, confirm a backup exists, then re-run with --write --confirm.');
    process.exit(1);
  }

  const baseUri = process.env.MONGO_URI;
  if (!baseUri) { console.error('MONGO_URI not set.'); process.exit(1); }
  const prodUri = withDb(baseUri, PROD_DB);
  await mongoose.connect(prodUri);
  console.log(`Connected to database: "${mongoose.connection.name}"  —  ${MODE_WRITE ? '*** WRITE MODE ***' : 'DRY RUN (no writes)'}`);

  const admin = await User.findOne({ email: ADMIN_EMAIL });
  if (!admin) {
    console.error(`Admin user ${ADMIN_EMAIL} not found in "${mongoose.connection.name}" — aborting.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`Acting as: ${admin.name} <${admin.email}>  (${admin._id})`);
  console.log(`Cutoff: entries dated on/before ${CUTOFF.toISOString()}\n`);

  const workOrders = await WorkOrder.find({});
  console.log(`Scanning ${workOrders.length} work order(s)...`);

  const grand = { workOrders: 0, bills: 0, amount: 0, tds: 0, retention: 0, paid: 0 };
  const report = [];
  const skipped = [];

  for (const wo of workOrders) {
    // scopeItemId -> { si, headroom, entries: [{date, qtyAdded, remarks, entryRef}] }
    const perItem = new Map();

    for (const si of wo.scopeItems) {
      const sources = (si.subItems && si.subItems.length > 0) ? si.subItems : [si];
      const entries = [];
      for (const src of sources) {
        for (const entry of src.progressEntries) {
          if (entry.billedInRequestId) continue;
          if (!entry.date || entry.date > CUTOFF) continue;
          if (!entry.qtyAdded || entry.qtyAdded <= 0) continue;
          entries.push(entry);
        }
      }
      if (entries.length === 0) continue;
      // headroom = how much of completedQty isn't yet reflected in lastBilledQty.
      // For most legacy items this is already 0 — the paper-billed quantity was
      // captured directly into lastBilledQty when the data was imported, even
      // though the individual progress entries were never linked to a bill. In
      // that (common) case we still create the synthetic bill for the full
      // historical quantity — that work genuinely happened and was paid — but we
      // must NOT push lastBilledQty past completedQty, so the increment applied
      // to lastBilledQty is capped by whatever headroom remains, oldest bucket
      // first, and any excess is billed-on-paper but adds 0 to lastBilledQty.
      const headroom = Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0));
      perItem.set(String(si._id), { si, headroom, entries });
    }

    if (perItem.size === 0) continue;

    const remainingHeadroom = new Map();
    for (const [key, rec] of perItem) remainingHeadroom.set(key, rec.headroom);

    // Bucket entries by calendar date logged.
    const buckets = new Map(); // dateKey -> Map(scopeItemId -> {si, qty, remarks[], entryRefs[]})
    for (const [key, rec] of perItem) {
      for (const entry of rec.entries) {
        const dateKey = dateKeyOf(entry.date);
        if (!buckets.has(dateKey)) buckets.set(dateKey, new Map());
        const itemMap = buckets.get(dateKey);
        if (!itemMap.has(key)) itemMap.set(key, { si: rec.si, qty: 0, remarks: [], entryRefs: [] });
        const b = itemMap.get(key);
        b.qty += entry.qtyAdded;
        if (entry.remarks && entry.remarks.trim()) b.remarks.push(entry.remarks.trim());
        b.entryRefs.push(entry);
      }
    }

    const dateKeys = [...buckets.keys()].sort();
    const woReport = { workOrderNo: wo.workOrderNo, vendorName: wo.vendorName, projectName: wo.projectName, bundles: [] };

    let stageNo      = MODE_WRITE ? await BillRequest.countDocuments({ workOrderId: wo._id }) : 0;
    let billingCycle = MODE_WRITE ? await RunningBill.countDocuments({ workOrderId: wo._id }) : 0;
    let woChanged = false;

    for (const dateKey of dateKeys) {
      const itemMap = buckets.get(dateKey);
      const lineEntries = [...itemMap.values()];
      const totalAmount = lineEntries.reduce((s, b) => s + b.qty * (b.si.rate || 0), 0);
      if (totalAmount <= 0) continue;

      // How much of this bucket's qty actually still needs to move lastBilledQty
      // forward (capped by whatever headroom remains for that item, oldest
      // bucket first) — the rest was already reflected in lastBilledQty at
      // import time, so it's billed-on-paper here but adds 0 to the rollup.
      for (const b of lineEntries) {
        const key = String(b.si._id);
        const remaining = remainingHeadroom.get(key) || 0;
        b.lastBilledIncrement = Math.min(b.qty, remaining);
        remainingHeadroom.set(key, remaining - b.lastBilledIncrement);
      }

      const billDate         = new Date(`${dateKey}T00:00:00.000Z`);
      const retentionPercent = wo.retentionPercent || 0;
      const retentionAmount  = Math.round(totalAmount * retentionPercent / 100);
      const tdsAmount        = Math.round(totalAmount * 0.01);
      const paidAmount       = Math.round(totalAmount - retentionAmount - tdsAmount);

      woReport.bundles.push({
        date: dateKey,
        items: lineEntries.map(b => ({
          description: b.si.description, qty: b.qty, rate: b.si.rate || 0, amount: b.qty * (b.si.rate || 0),
          lastBilledIncrement: b.lastBilledIncrement,
        })),
        totalAmount, retentionAmount, tdsAmount, paidAmount,
      });

      grand.bills     += 1;
      grand.amount    += totalAmount;
      grand.tds       += tdsAmount;
      grand.retention += retentionAmount;
      grand.paid      += paidAmount;

      if (MODE_WRITE) {
        stageNo      += 1;
        billingCycle += 1;

        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            const reqNo  = await nextCode('billRequestReqNo', 'BR-', 4);
            const billNo = await nextCode('billNo', 'RA-', 4);
            const billRequestId = new mongoose.Types.ObjectId();
            const runningBillId = new mongoose.Types.ObjectId();

            const legacyNote = `Legacy reconciliation - progress dated ${dateKey}, billed/paid via manual paper process prior to system adoption. Auto-reconciled 2026-07-25.`;

            const items = lineEntries.map(b => ({
              scopeItemId: b.si._id,
              description: b.si.description,
              unit:        b.si.unit,
              billedQty:   b.qty,
              rate:        b.si.rate || 0,
              amount:      b.qty * (b.si.rate || 0),
              progressRemarks: b.remarks.join('; '),
            }));

            const lineItems = lineEntries.map(b => ({
              scopeItemId: b.si._id,
              description: b.si.description,
              remarks:     b.si.remarks || '',
              progressRemarks: b.remarks.join('; '),
              unit:        b.si.unit,
              plannedQty:  b.si.plannedQty || 0,
              billedQty:   b.qty,
              rate:        b.si.rate || 0,
              amount:      b.qty * (b.si.rate || 0),
            }));

            await BillRequest.create([{
              _id: billRequestId,
              reqNo, stageNo,
              workOrderId: wo._id, workOrderNo: wo.workOrderNo,
              projectId: wo.projectId || null, projectName: wo.projectName, projectLocation: wo.projectLocation,
              vendorCode: wo.vendorCode, vendorName: wo.vendorName,
              category: wo.category || '', subCategory: wo.subCategory || '',
              items,
              remarks: legacyNote,
              periodFrom: billDate, periodTo: billDate,
              status: 'approved',
              billId: runningBillId,
              requestedBy: admin._id, processedBy: admin._id, processedAt: billDate,
              milestoneAchieved: true, milestoneDate: billDate,
              batchId: BATCH_TAG,
              isArchived: false,
              createdAt: billDate, updatedAt: billDate,
            }], { session });

            await RunningBill.create([{
              _id: runningBillId,
              billNo,
              workOrderId: wo._id, workOrderNo: wo.workOrderNo,
              projectId: wo.projectId, projectName: wo.projectName, projectLocation: wo.projectLocation,
              vendorCode: wo.vendorCode, vendorName: wo.vendorName,
              billDate,
              billingPeriodFrom: billDate, billingPeriodTo: billDate,
              contractorRefNo: '',
              generatedBy: admin.name,
              lineItems,
              amount: totalAmount,
              retentionPercent, retentionAmount,
              advanceRecovery: 0,
              paidAmount,
              gstPercent: wo.gstPercent ?? 18,
              tdsPercent: 1, tdsAmount,
              remarks: legacyNote,
              billType: 'running', relationshipType: 'NONE', billingCycle,
              isActive: true, supersededBy: null,
              status: 'paid',
              submittedAt: billDate,
              makerBy: admin._id, makerAt: billDate,
              checkerBy: admin._id, checkerAt: billDate,
              approvedBy: admin._id, approvedAt: billDate,
              paymentInitiatedBy: admin._id, paymentInitiatedAt: billDate,
              physicalVerification: { done: true, by: admin._id, at: billDate, remark: 'Legacy paper-process record' },
              paymentDate: billDate,
              paymentReleasedBy: admin.name,
              retentionReleased: 0, retentionReleaseRemark: '',
              isArchived: false, archivedAt: null,
              createdBy: admin._id,
              createdAt: billDate, updatedAt: billDate,
            }], { session });

            for (const b of lineEntries) {
              for (const entry of b.entryRefs) entry.billedInRequestId = billRequestId;
              if (b.lastBilledIncrement > 0) b.si.lastBilledQty = (b.si.lastBilledQty || 0) + b.lastBilledIncrement;
            }
            woChanged = true;
          });
        } finally {
          await session.endSession();
        }
      }
    }

    if (MODE_WRITE && woChanged) await wo.save();

    if (woReport.bundles.length) {
      grand.workOrders += 1;
      report.push(woReport);
    }
  }

  for (const w of report) {
    console.log(`\n${w.workOrderNo} - ${w.vendorName || '(no vendor)'} (${w.projectName || '(no project)'})`);
    for (const b of w.bundles) {
      console.log(`  ${b.date}: ${b.items.length} item(s) | amount ${inr(b.totalAmount)} | TDS ${inr(b.tdsAmount)} | retention ${inr(b.retentionAmount)} | paid ${inr(b.paidAmount)}`);
      for (const it of b.items) {
        const note = it.lastBilledIncrement < it.qty
          ? `  [lastBilledQty +${it.lastBilledIncrement} — rest already reflected]`
          : '';
        console.log(`      - ${it.description}: qty ${it.qty} x Rs.${it.rate} = ${inr(it.amount)}${note}`);
      }
    }
  }

  if (skipped.length) {
    console.log(`\n──────── SKIPPED (data-integrity guard tripped — needs manual review, left untouched) ────────`);
    for (const s of skipped) {
      console.log(`  ${s.workOrderNo} / "${s.scopeItem}": requested qty ${s.requested} > headroom ${s.headroom} (completedQty - lastBilledQty)`);
    }
  }

  console.log('\n──────── GRAND TOTALS ────────');
  console.log(`Work Orders affected : ${grand.workOrders}`);
  console.log(`Bills to create      : ${grand.bills}`);
  console.log(`Total bill amount    : ${inr(grand.amount)}`);
  console.log(`Total TDS (1%)       : ${inr(grand.tds)}`);
  console.log(`Total retention      : ${inr(grand.retention)}`);
  console.log(`Total net paid       : ${inr(grand.paid)}`);
  console.log(`Items skipped        : ${skipped.length}`);
  console.log(MODE_WRITE
    ? '\nWRITE MODE complete — records created as listed above.'
    : '\nThis was a DRY RUN — zero writes were made. Re-run with --write --confirm once the numbers above are confirmed and a backup exists.');

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
