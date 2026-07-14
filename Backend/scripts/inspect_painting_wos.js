// Inspect all painting work orders and their scope items
require('dotenv').config();
const mongoose  = require('mongoose');
const WorkOrder = require('../src/models/WorkOrder');

// Items that should be split into 2BHK/3BHK
const SPLIT_ITEMS = ['1st coat putty','2nd coat putty','1st coat paint','2nd coat paint','common final'];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const wos = await WorkOrder.find({ category: 'Painting' });
  console.log(`Found ${wos.length} painting work order(s)\n`);

  for (const wo of wos) {
    console.log(`\n=== ${wo.workOrderNo} | ${wo.vendorName} | ${wo.projectName || ''} ===`);
    for (const si of wo.scopeItems) {
      const nameLC = si.description?.toLowerCase().trim();
      if (SPLIT_ITEMS.some(s => nameLC.includes(s))) {
        // Check progress remarks
        const remarks = [...new Set(
          (si.progressEntries || []).map(e => e.remarks || e.locationNote || '').filter(Boolean)
        )];
        console.log(`  "${si.description}" | unit=${si.unit} | rate=${si.rate} | completedQty=${si.completedQty} | remarks=[${remarks.join(', ')}]`);
      }
    }
  }

  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
