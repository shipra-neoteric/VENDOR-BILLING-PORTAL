// One-off: turn PRJ-028 "Nature park labour huts" into a sub-project under a new
// "Nature Park" parent, alongside 2 new sibling sub-projects ("Nature Park", "Nature Park STP").
require('dotenv').config();
const mongoose = require('mongoose');
const Project = require('../src/models/Project');
const { nextProjectCode } = require('../src/utils/codeGen');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const labourHuts = await Project.findOne({ code: 'PRJ-028' });
  if (!labourHuts) { console.log('PRJ-028 not found'); return; }
  console.log(`Found ${labourHuts.code} | ${labourHuts.name}`);

  const shared = {
    location: labourHuts.location,
    client: labourHuts.client,
    projectType: labourHuts.projectType,
    status: labourHuts.status,
  };

  const parent = await Project.create({
    ...shared,
    code: await nextProjectCode(),
    name: 'Nature Park',
    contractValue: 0,
    budget: 0,
    parentId: null,
  });
  console.log(`Created parent ${parent.code} | ${parent.name}`);

  labourHuts.parentId = parent._id;
  await labourHuts.save();
  console.log(`Updated ${labourHuts.code} | ${labourHuts.name} -> parentId=${parent._id}`);

  const main = await Project.create({
    ...shared,
    code: await nextProjectCode(),
    name: 'Nature Park',
    contractValue: 0,
    budget: 0,
    parentId: parent._id,
  });
  console.log(`Created sub-project ${main.code} | ${main.name}`);

  const stp = await Project.create({
    ...shared,
    code: await nextProjectCode(),
    name: 'Nature Park STP',
    contractValue: 0,
    budget: 0,
    parentId: parent._id,
  });
  console.log(`Created sub-project ${stp.code} | ${stp.name}`);

  console.log('\nDone.');
  await mongoose.disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
