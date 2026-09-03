// Department-scoped access check for approve/reject actions — the list
// endpoints already filter by department (see listBillRequests/listBills),
// but that's only a display filter: without this, a user could still act
// directly on another department's bill by ID (a deep link, a guessed URL,
// an old shared link), since the route-level authorizeOr only checks
// whether the user holds the action permission, not whose bill it is.
//
// Same bypasses and empty-department fallback as the list filters: Owner
// and Accounts always pass (Accounts processes every department once a
// bill clears L1/L2); a user with no department assigned yet passes too,
// so rollout doesn't lock anyone out until an admin assigns one.
function canActOnDepartment(user, doc) {
  if (!user || ['owner', 'accounts'].includes(user.role)) return true;
  if (!user.department) return true;
  if (!doc || !doc.department) return true;
  return doc.department === user.department;
}

module.exports = { canActOnDepartment };
