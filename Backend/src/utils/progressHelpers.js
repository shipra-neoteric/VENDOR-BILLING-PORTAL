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
// them rather than tracked directly. Particulars typically share the SAME
// plannedQty (e.g. every trade on a floor is measured against that floor's
// full built-up area) — summing their completedQty against that one shared
// plannedQty is meaningless and shows the parent as done as soon as a single
// particular finishes. Instead, average each particular's own fraction of
// completion and project it back onto the parent's plannedQty, so the parent
// only reaches 100% once every particular individually has.
function recomputeParentFromSubItems(item) {
  if (!item.subItems || item.subItems.length === 0) return;
  const fractions = item.subItems.map(si =>
    si.plannedQty > 0 ? Math.min(1, (si.completedQty || 0) / si.plannedQty) : (si.status === 'completed' ? 1 : 0)
  );
  const avgFraction = fractions.reduce((s, f) => s + f, 0) / fractions.length;
  item.completedQty = Math.round((item.plannedQty || 0) * avgFraction);
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

// Expands a work order's scope items into individual billable candidates —
// one per particular when an item has them, one per item otherwise. Billing
// must operate at this granularity: a parent item's own completedQty is only
// ever a display rollup of its particulars (see recomputeParentFromSubItems
// above), never something to bill against directly — and each particular has
// its own rate/description that the resulting bill line needs to show.
function expandBillableCandidates(scopeItems, selectedIds) {
  const out = [];
  for (const si of scopeItems) {
    if (selectedIds && !selectedIds.has(String(si._id))) continue;
    if (si.subItems && si.subItems.length > 0) {
      for (const sub of si.subItems) {
        out.push({
          scopeItemId:   si._id,
          subItemId:     sub._id,
          description:   `${si.description} — ${sub.description}`,
          unit:          sub.unit || si.unit,
          completedQty:  sub.completedQty || 0,
          lastBilledQty: sub.lastBilledQty || 0,
          rate:          sub.rate || 0,
        });
      }
    } else {
      out.push({
        scopeItemId:   si._id,
        subItemId:     null,
        description:   si.description,
        unit:          si.unit,
        completedQty:  si.completedQty || 0,
        lastBilledQty: si.lastBilledQty || 0,
        rate:          si.rate || 0,
      });
    }
  }
  return out;
}

module.exports = { sumActiveQty, applyVarianceGate, recomputeParentFromSubItems, deriveStatus, recomputeAfterInvalidate, expandBillableCandidates };
