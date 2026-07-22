// A scope item with particulars has no meaningful variance sign-off of its
// own — its completedQty is a rollup — so check whether any particular still
// has unresolved (unapproved) over-plan progress instead.
function hasUnapprovedVariance(si) {
  if (si.subItems && si.subItems.length > 0) {
    return si.subItems.some(sub => sub.plannedQty > 0 && sub.completedQty > sub.plannedQty && !sub.varianceApproved);
  }
  return si.plannedQty > 0 && si.completedQty > si.plannedQty && !si.varianceApproved;
}

module.exports = { hasUnapprovedVariance };
