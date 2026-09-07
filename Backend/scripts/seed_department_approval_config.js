// One-time setup: configures DepartmentApprovalConfig for Civil, Marketing,
// and Planning — both the Bill Request fields (agm/gm/l3 + requiredApprovals,
// already-existing infrastructure, no code changes needed for bills) and the
// new Work Order fields (checker/approver/final + woRequiredApprovals).
//
//   Civil:     L1 Sagar Gupta (AGM) -> L2 Rakesh Bhargava (GM) -> L3/Final Rahul (Owner/CEO)
//   Marketing: L1 Shubham Saxena -> Final Rahul (Owner/CEO)              [2 levels, middle skipped]
//   Planning:  L1 Jalaj Gupta (GM) -> Final Rahul (Owner/CEO)            [2 levels, middle skipped]
//
// Run with --apply to write; without it, prints what WOULD be set (dry run).
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const DepartmentApprovalConfig = require('../src/models/DepartmentApprovalConfig');

const APPLY = process.argv.includes('--apply');

const PEOPLE = {
  sagar:   { email: 'sagar@neotericgrp.in',        name: 'Sagar Gupta' },
  rakesh:  { email: 'rakesh@neotericgrp.in',       name: 'Rakesh Bhargava' },
  rahul:   { email: 'rahul@neotericgrp.in',        name: 'Rahul' },
  shubham: { email: 'videoblogger@neotericgrp.in', name: 'Shubham Saxena' },
  jalaj:   { email: 'jalaj@neotericgrp.in',        name: 'Jalaj Gupta' },
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const ids = {};
  for (const [key, { email, name }] of Object.entries(PEOPLE)) {
    const user = await User.findOne({ email }).select('_id name').lean();
    if (!user) throw new Error(`Could not find user ${email} (expected ${name}) — aborting, nothing written.`);
    if (user.name !== name) console.log(`Note: ${email} is named "${user.name}" in the DB, expected "${name}" — continuing anyway.`);
    ids[key] = user._id;
  }

  const configs = [
    {
      department: 'civil',
      requiredApprovals: 3, agmUserIds: [ids.sagar], gmUserIds: [ids.rakesh], l3UserIds: [ids.rahul],
      woRequiredApprovals: 3, checkerUserIds: [ids.sagar], approverUserIds: [ids.rakesh], finalUserIds: [ids.rahul],
    },
    {
      department: 'marketing',
      requiredApprovals: 2, agmUserIds: [ids.shubham], gmUserIds: [ids.rahul],
      woRequiredApprovals: 2, checkerUserIds: [ids.shubham], finalUserIds: [ids.rahul],
    },
    {
      department: 'planning',
      requiredApprovals: 2, agmUserIds: [ids.jalaj], gmUserIds: [ids.rahul],
      woRequiredApprovals: 2, checkerUserIds: [ids.jalaj], finalUserIds: [ids.rahul],
    },
  ];

  for (const cfg of configs) {
    console.log(`${APPLY ? 'SET' : '[dry-run] would set'} ${cfg.department}:`, JSON.stringify(cfg));
    if (APPLY) {
      await DepartmentApprovalConfig.findOneAndUpdate(
        { department: cfg.department },
        { $set: cfg },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  }

  if (!APPLY) console.log('\nRe-run with --apply to write these changes.');
  await mongoose.disconnect();
})();
