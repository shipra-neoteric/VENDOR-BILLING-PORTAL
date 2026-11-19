import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Layers, Pencil, ShieldCheck, Users as UsersIcon } from "lucide-react";
import apiClient from "../../services/apiClient";
import StatCard from "../../ui/StatCard";
import Badge from "../../ui/Badge";
import Spinner from "../../ui/Spinner";
import PermissionEditorModal from "../UserManagement/PermissionEditorModal";
import { MODULE_DEFS, ROLE_CFG, isKnownRole, permsToMap } from "../UserManagement";
import type { AppUser, PermAction, RoleDoc } from "../UserManagement";

const TOTAL_ACTIONS = MODULE_DEFS.reduce((n, m) => n + m.actions.length, 0);

// Own grants plus whatever the user's role library entry adds — the same
// "effective" set EditUser shows.
function effectivePerms(u: AppUser, roles: RoleDoc[]) {
  const role = roles.find((r) => r.name === u.role);
  const rolePerms = permsToMap(role?.permissions ?? []);
  const eff = permsToMap(u.permissions ?? []);
  for (const [mod, actions] of Object.entries(rolePerms)) {
    eff[mod] = Array.from(new Set([...(eff[mod] ?? []), ...actions])) as PermAction[];
  }
  return { eff, rolePerms };
}

export default function PermissionManagement() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<RoleDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [editing, setEditing] = useState<AppUser | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiClient.get<{ users: AppUser[] }>("/users"),
      apiClient.get<{ roles: RoleDoc[] }>("/roles"),
    ])
      .then(([u, r]) => { setUsers(u.data.users ?? []); setRoles(r.data.roles ?? []); })
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const depts = useMemo(() => Array.from(new Set(users.map((u) => u.department).filter(Boolean))) as string[], [users]);
  const roleNames = useMemo(() => Array.from(new Set(users.map((u) => u.role))), [users]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => (!roleFilter || u.role === roleFilter) && (!deptFilter || u.department === deptFilter))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .map((u) => {
        const { eff, rolePerms } = effectivePerms(u, roles);
        const granted = MODULE_DEFS.reduce(
          (n, m) => n + m.actions.filter((a) => (eff[m.id] ?? []).includes(a)).length, 0);
        return { u, eff, rolePerms, granted };
      });
  }, [users, roles, search, roleFilter, deptFilter]);

  const editRow = editing ? effectivePerms(editing, roles) : null;
  const inputCls = "border border-gray-200 dark:border-gray-700/40 rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1E293B]";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Permission Management</h1>
        <p className="text-sm text-gray-500">Manage which pages and actions each user can access</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Users" value={users.length} icon={UsersIcon} />
        <StatCard label="Available Permissions" value={TOTAL_ACTIONS} icon={ShieldCheck} />
        <StatCard label="Manageable Pages" value={MODULE_DEFS.length} icon={Layers} />
        <StatCard label="Showing" value={rows.length} icon={UsersIcon} />
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…"
          className={`${inputCls} flex-1 min-w-[200px]`}
        />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={inputCls}>
          <option value="">All Departments</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={inputCls}>
          <option value="">All Roles</option>
          {roleNames.map((r) => <option key={r} value={r}>{isKnownRole(r) ? ROLE_CFG[r].label : r}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 dark:border-gray-700/40">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3 min-w-[180px]">Permissions</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ u, granted }) => {
                const pct = Math.round((granted / TOTAL_ACTIONS) * 100);
                return (
                  <tr key={u._id} className="border-b last:border-0 border-gray-100 dark:border-gray-700/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white truncate">{u.name}</p>
                          <p className="text-xs text-gray-500 truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={isKnownRole(u.role) ? ROLE_CFG[u.role].color : "gray"} small>
                        {isKnownRole(u.role) ? ROLE_CFG[u.role].label : u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 capitalize">{u.department || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 whitespace-nowrap">{granted}/{TOTAL_ACTIONS} ({pct}%)</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={u.isActive ? "green" : "gray"} small>{u.isActive ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button" onClick={() => setEditing(u)} aria-label={`Edit permissions for ${u.name}`}
                        className="p-2 rounded-lg text-gray-500 hover:text-primary hover:bg-primary/10"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && editRow && (
        <PermissionEditorModal
          key={editing._id}
          user={editing}
          initial={editRow.eff}
          rolePerms={editRow.rolePerms}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
