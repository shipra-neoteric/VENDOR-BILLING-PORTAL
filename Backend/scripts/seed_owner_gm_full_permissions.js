// One-time script: give the 'owner' and 'gm' Roles (Backend/src/models/Role.js)
// every module + every action from Frontend's MODULE_DEFS, explicitly, so that
// once the hardcoded owner/gm authorizeOr(...,'owner','gm') bypasses are removed
// from the codebase, owner/gm accounts keep full access purely via the
// permission-matrix (mergeRolePermissions in Backend/src/middleware/auth.js
// merges a user's Role permissions into their own at request time).
// Idempotent/additive — safe to re-run.
require('dotenv').config();
const mongoose = require('mongoose');
const Role = require('../src/models/Role');

// Mirrors Frontend/src/pages/UserManagement/index.tsx's MODULE_DEFS (id -> actions).
const MODULE_DEFS = [
  { id: 'dashboard', actions: ['view'] },
  { id: 'sla-dashboard', actions: ['view'] },
  { id: 'projects', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'contractors', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'vendor-groups', actions: ['view', 'create', 'edit'] },
  { id: 'work-orders', actions: ['view', 'create', 'edit', 'delete', 'maker', 'checker', 'approver', 'ceo-approve', 'send-back'] },
  { id: 'quotation-comparison', actions: ['view', 'create', 'approve'] },
  { id: 'work-progress', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'daily-progress-report', actions: ['view', 'create'] },
  { id: 'drawing-requests', actions: ['view', 'create', 'edit', 'delete', 'l1-review', 'l2-draw', 'l3-review', 'l4-approve'] },
  { id: 'consultants', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'consultancy-orders', actions: ['view', 'edit', 'co-l1-approve', 'co-l2-approve', 'reject'] },
  { id: 'bill-review', actions: ['view', 'approve'] },
  { id: 'bill-requests', actions: ['view', 'create', 'agm-approve', 'gm-approve', 'l3-approve', 'l4-approve', 'reject'] },
  { id: 'billing', actions: ['view', 'create'] },
  { id: 'accounts-payment', actions: ['view', 'edit', 'verify', 'l1-agm-approve', 'l2-director-approve', 'hold', 'release-hold', 'retry-tms', 'reject'] },
  { id: 'procurement-tracker', actions: ['view'] },
  { id: 'ledger', actions: ['view'] },
  { id: 'advance-payments', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'companies', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'categories', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'dri-dashboard', actions: ['view', 'create', 'edit'] },
  { id: 'public-forms', actions: ['view'] },
  { id: 'audit-logs', actions: ['view'] },
  { id: 'user-management', actions: ['view', 'create', 'edit', 'delete'] },
  { id: 'sla-settings', actions: ['view', 'create', 'edit', 'delete'] },
];

const FULL_PERMISSIONS = MODULE_DEFS.map(({ id, actions }) => ({ module: id, actions: [...actions] }));

async function upsertFullAccessRole(name) {
  await Role.findOneAndUpdate(
    { name },
    { $set: { name, permissions: FULL_PERMISSIONS } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  await upsertFullAccessRole('owner');
  await upsertFullAccessRole('gm');
  console.log('Upserted full-access permissions for owner and gm Roles');

  const owner = await Role.findOne({ name: 'owner' }).lean();
  const gm = await Role.findOne({ name: 'gm' }).lean();

  console.log(`\nowner role: ${owner.permissions.length} modules granted`);
  console.log(`gm role: ${gm.permissions.length} modules granted`);

  const expectedModuleCount = MODULE_DEFS.length;
  const ok =
    owner.permissions.length === expectedModuleCount &&
    gm.permissions.length === expectedModuleCount &&
    MODULE_DEFS.every(({ id, actions }) => {
      const ownerMod = owner.permissions.find(p => p.module === id);
      const gmMod = gm.permissions.find(p => p.module === id);
      return (
        ownerMod && gmMod &&
        actions.every(a => ownerMod.actions.includes(a)) &&
        actions.every(a => gmMod.actions.includes(a))
      );
    });

  console.log(ok ? '\nVERIFIED: owner and gm both have every module+action from MODULE_DEFS.' : '\nWARNING: verification mismatch — check output above.');

  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
