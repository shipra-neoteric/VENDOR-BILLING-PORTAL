// One-time script: before stripping hardcoded 'agm'/'accounts'/'process-coordinator'/
// 'site-dri' role-literal bypasses out of authorizeOr()/authorizeAnyOr() calls in
// Backend/src/routes/*.js, make sure each such role's Role library document
// (Backend/src/models/Role.js) already explicitly grants the module+action that
// the bypass used to grant it — so real day-to-day functionality (AGM quotation
// review, Accounts contractor/category management, DRI progress logging, etc.)
// doesn't silently break once the bypass is gone. Merges (adds missing
// module/actions) rather than replacing — additive/idempotent, safe to re-run.
require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../src/models/Role');

const GRANTS = {
  agm: {
    'bill-requests': ['create', 'agm-approve'],
    'quotation-comparison': ['view', 'create'],
    'drawing-requests': ['create', 'edit', 'delete'],
    'ledger': ['view'],
    'bill-review': ['view', 'approve'],
    'work-progress': ['create', 'edit', 'delete'],
    'daily-progress-report': ['create'],
  },
  accounts: {
    // Mirrors the authorizeAnyOr(...'agm-approve','gm-approve','l3-approve','l4-approve'...)
    // reject/manual-reject gate accounts previously passed via role bypass.
    'bill-requests': ['edit', 'agm-approve', 'gm-approve', 'l3-approve', 'l4-approve'],
    'categories': ['create', 'edit'],
    'contractors': ['create', 'edit'],
    'consultants': ['create', 'edit'],
    'ledger': ['view'],
    'projects': ['create', 'edit'],
    'vendor-groups': ['create', 'edit'],
    'work-orders': ['edit'],
    'work-progress': ['create', 'edit', 'delete'],
    'sla-dashboard': ['view'],
  },
  'process-coordinator': {
    'sla-dashboard': ['view'],
  },
  'site-dri': {
    'work-progress': ['create', 'edit', 'delete'],
    'sla-dashboard': ['view'],
  },
};

async function mergeGrants(roleName, grants) {
  const role = await Role.findOne({ name: roleName });
  if (!role) {
    console.log(`Creating Role '${roleName}' (did not exist)`);
  }
  const doc = role || new Role({ name: roleName, permissions: [] });
  const byModule = new Map((doc.permissions || []).map(p => [p.module, new Set(p.actions)]));
  for (const [module, actions] of Object.entries(grants)) {
    const set = byModule.get(module) || new Set();
    for (const a of actions) set.add(a);
    byModule.set(module, set);
  }
  doc.permissions = [...byModule.entries()].map(([module, actions]) => ({ module, actions: [...actions] }));
  await doc.save();
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  for (const [roleName, grants] of Object.entries(GRANTS)) {
    await mergeGrants(roleName, grants);
    console.log(`Merged grants into '${roleName}' role`);
  }

  for (const roleName of Object.keys(GRANTS)) {
    const role = await Role.findOne({ name: roleName }).lean();
    console.log(`\n${roleName}:`, JSON.stringify(role.permissions));
  }

  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
