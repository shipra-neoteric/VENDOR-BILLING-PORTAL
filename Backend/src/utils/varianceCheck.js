// A scope item with particulars has no meaningful variance sign-off of its
// own — its completedQty is a rollup — so check whether any particular still
// has unresolved (unapproved) over-plan progress instead.
function hasUnapprovedVariance(si) {
  if (si.subItems && si.subItems.length > 0) {
    return si.subItems.some(sub => sub.plannedQty > 0 && sub.completedQty > sub.plannedQty && !sub.varianceApproved);
  }
  return si.plannedQty > 0 && si.completedQty > si.plannedQty && !si.varianceApproved;
}

// Same check, but scoped to one particular when a line item bills a specific
// subItem rather than the scope item as a whole — a variance on a sibling
// particular shouldn't block billing one that's clean.
function hasUnapprovedVarianceForLineItem(si, subItemId) {
  if (subItemId) {
    const sub = si.subItems && si.subItems.id ? si.subItems.id(subItemId) : null;
    if (!sub) return false;
    return sub.plannedQty > 0 && sub.completedQty > sub.plannedQty && !sub.varianceApproved;
  }
  return hasUnapprovedVariance(si);
}

// Resolves the actual billable target for a line item — the particular
// (subItem) it references, if any, otherwise the scope item itself.
function resolveBillableItem(si, subItemId) {
  if (!si) return null;
  if (!subItemId) return si;
  return si.subItems && si.subItems.id ? si.subItems.id(subItemId) : null;
}

// Rejects (rather than silently clamping) any line item that would bill more
// than its target's (scope item's, or a specific particular's) remaining
// unbilled quantity — cumulative across every bill ever raised against it,
// regardless of which path (DRI-progress cycle or manual entry) did the
// billing. A target with plannedQty unset/0 is treated as uncapped, matching
// the pre-existing clamp's own escape hatch.
//
// `supersedeQtyMap` (optional) — for a SUPERSEDES bill, the quantity already
// consumed by the specific bills THIS bill is replacing, keyed by
// "scopeItemId" or "scopeItemId|subItemId". Those bills stay active (see
// billController.js — SUPERSEDES no longer deactivates them) so their qty is
// still sitting in `lastBilledQty`; adding it back here lets a "final" bill
// re-claim the full planned quantity instead of being capped by what they
// already consumed. Absent/empty for every other bill, which keeps this
// function's behavior exactly as it was.
function findOverbilledLineItem(workOrder, lineItems, supersedeQtyMap) {
  for (const li of lineItems) {
    if (!li.scopeItemId || !li.billedQty) continue;
    const si = workOrder.scopeItems.id(li.scopeItemId);
    if (!si) continue;
    const target = resolveBillableItem(si, li.subItemId);
    if (!target || !(target.plannedQty > 0)) continue;
    const key = supersedeQtyMap ? (li.scopeItemId.toString() + (li.subItemId ? '|' + li.subItemId.toString() : '')) : null;
    const supersededQty = key && supersedeQtyMap[key] ? supersedeQtyMap[key] : 0;
    const remaining = target.plannedQty - (target.lastBilledQty || 0) + supersededQty;
    if (Number(li.billedQty) > remaining + 0.001) {
      return { li, si: target, remaining };
    }
  }
  return null;
}

// Rate guard for manually-entered bill lines: a line linked to a work order
// item is expected to carry that item's rate. When the rate was changed, the
// line must say why (rateReason) — otherwise a silent rate change (e.g. 300 ->
// 250) leaves money unaccounted for that nobody can later explain. Also stamps
// the work order's own rate onto each linked line (woRate), so approvers and
// the print can show the difference. Returns the first line missing a reason,
// or null.
function checkRateChanges(workOrder, lineItems) {
  let missing = null;
  for (const li of lineItems) {
    if (!li.scopeItemId || li.isBalance) continue;
    const si = workOrder.scopeItems.id(li.scopeItemId);
    const target = si ? resolveBillableItem(si, li.subItemId) : null;
    if (!target || !(Number(target.rate) > 0)) continue;
    li.woRate = Number(target.rate);
    if (!missing && li.billedQty && Number(li.rate) > 0
      && Math.abs(Number(li.rate) - li.woRate) > 0.005 && !String(li.rateReason || '').trim()) {
      missing = { li, target };
    }
  }
  return missing;
}

// A Work Order must have cleared its own L1(checker)->L2(approver)->L4(final)
// approval chain before anything can be billed against it — otherwise a bill
// could be raised (and paid) for a WO whose scope/value was never actually
// signed off. Missing/undefined approvalStatus is treated as approved too,
// matching the schema's own default (grandfathers pre-workflow WOs created
// before this approval chain existed).
function isWorkOrderApproved(wo) {
  return !wo.approvalStatus || wo.approvalStatus === 'approved';
}

module.exports = { hasUnapprovedVariance, hasUnapprovedVarianceForLineItem, resolveBillableItem, findOverbilledLineItem, checkRateChanges, isWorkOrderApproved };
