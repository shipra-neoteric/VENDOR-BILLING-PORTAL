// One-off: copies the 3 Oct-7 DPRs that landed in project_quality_dev
// (wrong DB, due to a stale local .env) into project_quality (the real,
// live QC database), so yesterday's labour total matches VMS (235) again.
require('dotenv').config();
const { MongoClient } = require('mongodb');

async function run() {
  const client = new MongoClient(process.env.QC_MONGODB_URI);
  await client.connect();
  try {
    const dev = client.db('project_quality_dev');
    const prod = client.db('project_quality');
    const ids = [
      'DPR-VMS-6ac6367e5da0c4d56b7e4630',
      'DPR-VMS-6ac636c15da0c4d56b7e46a3',
      'DPR-VMS-6ac6370d5da0c4d56b7e4718',
    ];
    const docs = await dev.collection('dpr').find({ id: { $in: ids } }).toArray();
    console.log('found in dev:', docs.length);
    for (const d of docs) {
      delete d._id;
      await prod.collection('dpr').updateOne({ id: d.id }, { $set: d }, { upsert: true });
    }
    console.log('backfilled into prod (project_quality)');
    const total = await prod.collection('dpr').countDocuments();
    const oct7Sum = (await prod.collection('dpr').find({ date: { $regex: '^2026-10-07' } }).toArray())
      .reduce((a, r) => a + (r.labourCount || 0), 0);
    console.log('prod total dpr:', total, '| Oct 7 labour sum:', oct7Sum);
  } finally {
    await client.close();
  }
}

run().catch(console.error);
