// Single source of truth for VMS->QC project name fallback mappings — used
// by BOTH scripts/vms-to-qc-migrate.js (bulk backfill) and syncToQc.js
// (live per-record sync). These two used to carry their own separate
// copies of this dict; whoever added a new mapping to fix one would
// silently leave the other stale, so a rename that was handled in the
// live-sync path could still be missed by a backfill run (or vice versa).
//
// This is only a FALLBACK — the primary match is always VMS project code
// -> QC project id/code (resolveProject in both callers tries that first).
// Only add an entry here for a project whose name differs between VMS and
// QC AND whose code doesn't match either (e.g. renamed independently on
// both sides) — a plain rename that keeps the same code needs no entry.
const PROJECT_MAPPINGS = {
  "garden city villa extension": { id: "PRJ-027", name: "Garden city Villa Extension" },
  "hyde park": { id: "PRJ-012", name: "Hyde park" },
  "milestone": { id: "PRJ-039", name: "Milestone" },
  "ng grande": { id: "PRJ-040", name: "NG Grande" },
  "nature park hotel": { id: "PRJ-001", name: "Nature park Hotel" },
  "zen garden": { id: "PRJ-013", name: "Zen Garden" },
  "automated test project prj 8320": { id: "PRJ-055", name: "Automated Test Project PRJ-8320", proposed: true, vmsCode: "PRJ-055" },
  "automated test project prj 6176": { id: "PRJ-057", name: "Automated Test Project PRJ-6176", proposed: true, vmsCode: "PRJ-057" },
  "automated test project prj 4096": { id: "PRJ-059", name: "Automated Test Project PRJ-4096", proposed: true, vmsCode: "PRJ-059" },
};

// Same reasoning as PROJECT_MAPPINGS above — VMS's drawing-request review
// stages that have no direct QC equivalent map to the closest QC stage.
// Was duplicated identically in both callers before; a third VMS status
// added to fix one path would've silently left the other unmapped.
function mapDrawingReviewStatus(status) {
  const validQcStatuses = new Set([
    'stage-1-screen', 'stage-2-produce', 'stage-3-crosscheck', 'stage-4-final-approve', 'approved', 'returned',
  ]);
  if (validQcStatuses.has(status)) return status;
  if (status === 'l1-gm') return 'stage-1-screen';
  if (status === 'l2-architect') return 'stage-2-produce';
  return null;
}

// VMS's own Mongo database name — was separately hardcoded as "vbp" in
// both vms-to-qc-migrate.js and vms-to-qc-vendors-migrate.js.
const VMS_DB_NAME = 'vbp';

module.exports = { PROJECT_MAPPINGS, mapDrawingReviewStatus, VMS_DB_NAME };
