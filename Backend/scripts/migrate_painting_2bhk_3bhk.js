// Migrate painting WO scope items: add 2BHK/3BHK suffixes to duplicate items
// Also adds 2BHK/3BHK variants to the Category collection
// Also fixes RA-0077's broken scopeItemId
require('dotenv').config();
const mongoose    = require('mongoose');
const WorkOrder   = require('../src/models/WorkOrder');
const RunningBill = require('../src/models/RunningBill');
const Category    = require('../src/models/Category');

// Items that appear in duplicate (2BHK + 3BHK pairs)
const SPLIT_NAMES = ['1st coat putty', '2nd coat putty', '1st coat paint', '2nd coat paint', 'common final'];

function normalize(str) { return (str || '').toLowerCase().trim(); }

// ── 1. Update Category collection ───────────────────────────────────────────
async function updateCategories() {
  console.log('\n── CATEGORIES ──');

  // Find all sub-sub-categories that need splitting
  const cats = await Category.find({ name: { $regex: /putty|paint|common final/i } });

  const targets = cats.filter(c => SPLIT_NAMES.includes(normalize(c.name)));
  const seen = new Set();

  for (const cat of targets) {
    const key = `${cat.name}__${cat.parentId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    for (const suffix of ['2BHK', '3BHK']) {
      const newName = `${cat.name} ${suffix}`;
      const exists = await Category.findOne({ name: newName, parentId: cat.parentId });
      if (exists) {
        console.log(`  SKIP "${newName}" (already exists)`);
        continue;
      }
      await Category.create({
        name: newName,
        parentId: cat.parentId,
        color: cat.color,
        description: cat.description,
        isActive: cat.isActive,
        createdBy: cat.createdBy,
      });
      console.log(`  CREATED "${newName}"`);
    }
  }
}

// ── 2. Rename scope items in a work order ────────────────────────────────────
async function renameWO(workOrderNo) {
  const wo = await WorkOrder.findOne({ workOrderNo });
  if (!wo) { console.log(`  ${workOrderNo} not found`); return; }

  // Group scope items by normalised description
  const groups = {};
  for (const si of wo.scopeItems) {
    const key = normalize(si.description);
    if (!SPLIT_NAMES.includes(key)) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(si);
  }

  let changed = false;
  for (const [key, items] of Object.entries(groups)) {
    if (items.length < 2) continue; // single item — no split needed

    // Sort by rate ascending (lower rate = 2BHK)
    items.sort((a, b) => (a.rate || 0) - (b.rate || 0));

    const suffixes = items.length === 2
      ? ['2BHK', '3BHK']
      : items.map((_, i) => i === 0 ? '2BHK' : i === items.length - 1 ? '3BHK' : `Unit${i + 1}`);

    for (let i = 0; i < items.length; i++) {
      const si = items[i];
      const before = si.description;
      // Only append if suffix not already there
      if (!si.description.includes('2BHK') && !si.description.includes('3BHK')) {
        si.description = `${si.description.trim()} ${suffixes[i]}`;
        console.log(`  "${before}" (rate=${si.rate}) → "${si.description}"`);
        changed = true;
      }
    }
  }

  if (changed) { await wo.save(); console.log(`  ✓ ${workOrderNo} saved`); }
  else          { console.log(`  ${workOrderNo}: nothing to change`); }

  return wo; // return for use in RA-0077 fix
}

// ── 3. Fix RA-0077 broken scopeItemId ────────────────────────────────────────
async function fixRA0077(wo0046) {
  console.log('\n── RA-0077 FIX ──');
  const bill = await RunningBill.findOne({ billNo: 'RA-0077' });
  if (!bill) { console.log('  RA-0077 not found'); return; }

  // Find "Common final 2BHK" (rate=5000, has completedQty=8) in WO-0046
  const si = wo0046.scopeItems.find(s =>
    normalize(s.description) === 'common final 2bhk' && s.rate === 5000
  );
  if (!si) { console.log('  Common final 2BHK not found in WO-0046'); return; }

  const li = bill.lineItems[0];
  const before = { scopeItemId: li.scopeItemId, rate: li.rate, amount: li.amount };

  li.scopeItemId = si._id;
  li.description = si.description;
  li.rate        = si.rate;           // 5000
  li.amount      = li.billedQty * si.rate; // 8 × 5000 = 40000

  bill.amount = bill.lineItems.reduce((s, l) => s + (l.amount || 0), 0);

  await bill.save();
  console.log(`  scopeItemId: ${before.scopeItemId} → ${si._id}`);
  console.log(`  rate: ${before.rate} → ${li.rate}`);
  console.log(`  amount per item: ${before.amount} → ${li.amount}`);
  console.log(`  bill.amount: → ${bill.amount}`);
  console.log('  ✓ RA-0077 fixed');
}

// ── main ─────────────────────────────────────────────────────────────────────
async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected\n');

  await updateCategories();

  const WOS_TO_RENAME = ['WO-0046', 'WO-0034', 'WO-0052', 'WO-0055'];
  let wo0046;
  for (const woNo of WOS_TO_RENAME) {
    console.log(`\n── ${woNo} ──`);
    const wo = await renameWO(woNo);
    if (woNo === 'WO-0046') wo0046 = await WorkOrder.findOne({ workOrderNo: 'WO-0046' }); // re-fetch after save
  }

  await fixRA0077(wo0046);

  console.log('\n✓ Migration complete.');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
