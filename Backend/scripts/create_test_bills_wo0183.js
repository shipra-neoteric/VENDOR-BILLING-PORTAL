// One-off local/dev helper — creates 2 real draft bills against WO-0183 by
// calling the actual createBill controller logic (not a raw insert), so
// every side effect (billNo generation, WorkOrder.scopeItems.lastBilledQty
// accumulation, validation) happens exactly like a real New Bill submission.
// Purely for local testing of the SUPERSEDES quantity-reclaim fix — not
// meant to be run against production data.
require('dotenv').config();
const mongoose = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');
const User = require('../src/models/User');
const billController = require('../src/controllers/billController');

function fakeRes(label) {
  const res = {
    _status: 200,
    status(code) { this._status = code; return this; },
    json(body) {
      console.log(`\n[${label}] HTTP ${this._status}:`, JSON.stringify(body, null, 2));
      return body;
    },
  };
  return res;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const woNo = process.argv[2] || 'WO-0183';
  const wo = await WorkOrder.findOne({ workOrderNo: woNo });
  if (!wo) { console.error(`${woNo} not found`); process.exit(1); }
  console.log(`Found ${wo.workOrderNo} — ${wo.scopeItems.length} scope items`);

  const owner = await User.findOne({ role: 'owner' });
  if (!owner) { console.error('No owner user found'); process.exit(1); }

  // Prefer a plain scope item (no particulars); fall back to the first
  // particular (subItem) with real plannedQty if every scope item here has
  // particulars — matches how NewBillDrawer bills a particular directly.
  let si = wo.scopeItems.find((s) => s.plannedQty > 0 && (!s.subItems || s.subItems.length === 0));
  let subItemId = null;
  let targetLabel;
  if (!si) {
    for (const s of wo.scopeItems) {
      const sub = (s.subItems || []).find((x) => x.plannedQty > 0);
      if (sub) { si = s; subItemId = sub._id; targetLabel = `${s.description} › ${sub.description}`; break; }
    }
  }
  if (!si) { console.error('No billable scope item/particular with plannedQty > 0 found on this WO'); process.exit(1); }
  const target = subItemId ? si.subItems.id(subItemId) : si;
  targetLabel = targetLabel || si.description;
  console.log(`Using "${targetLabel}" — plannedQty ${target.plannedQty}, lastBilledQty ${target.lastBilledQty || 0}`);

  const half = Math.floor((target.plannedQty - (target.lastBilledQty || 0)) / 2) || 1;
  const rate = target.rate || 100;

  for (let i = 0; i < 2; i++) {
    const req = {
      body: {
        billDate: new Date().toISOString(),
        workOrderId: wo._id.toString(),
        projectId: wo.projectId ? wo.projectId.toString() : undefined,
        projectName: '',
        vendorCode: wo.vendorCode,
        vendorName: wo.vendorName,
        generatedBy: 'Test Script',
        gstPercent: 18,
        billType: 'running',
        department: wo.department || '',
        relationshipType: 'NONE',
        linkedBills: [],
        lineItems: [{
          scopeItemId: si._id.toString(),
          ...(subItemId ? { subItemId: subItemId.toString() } : {}),
          description: target.description,
          unit: target.unit || '',
          plannedQty: target.plannedQty,
          billedQty: half,
          rate,
          amount: half * rate,
        }],
      },
      user: owner,
    };
    await billController.createBill(req, fakeRes(`bill ${i + 1}`), (err) => { if (err) { console.error(`[bill ${i + 1}] error:`, err); } });
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch((err) => { console.error(err); process.exit(1); });
