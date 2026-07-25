// Shared helpers for recomputing a scope item's (or particular's) progress
// state after its progressEntries change — used by workOrderController.js
// (direct add/edit/delete/invalidate) and by billController.js/
// billRequestController.js (auto-invalidating entries when the bill made
// from them gets rejected).

// Invalidated entries (bad data, kept for audit) never count toward progress.
function sumActiveQty(entries) {
  return entries.filter(e => !e.invalidated?.done).reduce((s, e) => s + e.qtyAdded, 0);
}

// Progress is never hard-blocked at plannedQty — AGM/GM see an over-logged item
// flagged (yellow ≤10% over, red beyond that, computed client-side) and must
// explicitly sign off before it can be billed. A prior sign-off only gets
// invalidated if completedQty actually changed since it was approved — not by
// an unrelated edit (e.g. fixing a remarks/location typo) that nets out to the
// same quantity.
function applyVarianceGate(target) {
  if (target.plannedQty > 0 && target.completedQty > target.plannedQty) {
    if (target.varianceApproved && target.completedQty !== target.varianceApprovedAtQty) {
      target.varianceApproved = false;
    }
  }
}

// When an item has particulars, its own status/completedQty are derived from
// them rather than tracked directly.
function recomputeParentFromSubItems(item) {
  if (!item.subItems || item.subItems.length === 0) return;
  item.completedQty = item.subItems.reduce((s, si) => s + (si.completedQty || 0), 0);
  const allCompleted = item.subItems.every(si =>
    si.plannedQty > 0 ? si.completedQty >= si.plannedQty : si.status === 'completed'
  );
  const anyStarted = item.subItems.some(si => (si.completedQty || 0) > 0);
  item.status = allCompleted ? 'completed' : anyStarted ? 'running' : 'pending';
}

function deriveStatus(target) {
  return target.plannedQty > 0 && target.completedQty >= target.plannedQty ? 'completed'
    : target.completedQty > 0 ? 'running' : 'pending';
}

// Recomputes completedQty/status/variance for a scope item after some of its
// (or its particulars') entries were invalidated — handles both the flat and
// particular-bearing shapes.
function recomputeAfterInvalidate(si) {
  if (si.subItems && si.subItems.length > 0) {
    for (const sub of si.subItems) {
      sub.completedQty = sumActiveQty(sub.progressEntries);
      sub.status = deriveStatus(sub);
      applyVarianceGate(sub);
    }
    recomputeParentFromSubItems(si);
  } else {
    si.completedQty = sumActiveQty(si.progressEntries);
    si.status = deriveStatus(si);
    applyVarianceGate(si);
  }
}

module.exports = { sumActiveQty, applyVarianceGate, recomputeParentFromSubItems, deriveStatus, recomputeAfterInvalidate };
