import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus, Pencil, KeyRound, User, CheckCircle2, Ban, Users,
} from "lucide-react";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import { useFormErrors } from "../../hooks/useFormErrors";
import { SearchFilter, SelectFilter } from "../../ui/Filters";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import UISwitch from "../../ui/Switch";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import StatCard from "../../ui/StatCard";
import Card from "../../ui/Card";
import Badge from "../../ui/Badge";
import EmptyState from "../../ui/EmptyState";
import { Descriptions, DescItem } from "../../ui/Descriptions";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import dayjs from "dayjs";

// ── Types ─────────────────────────────────────────────────────────

interface AppUser {
  _id: string;
  name: string;
  email: string;
  mobile?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  permissions?: { module: string; actions: string[] }[];
}

type PermAction = "view" | "create" | "edit" | "delete" | "approve" | "request" | "maker" | "checker" | "approver" | "reject" | "ceo-approve" | "send-back" | "agm-approve" | "gm-approve" | "verify" | "l1-agm-approve" | "l2-director-approve" | "hold" | "release-hold" | "retry-tms" | "l1-review" | "l2-draw" | "l3-review" | "l4-approve";

interface ModuleDef {
  id: string;
  name: string;
  icon: string;
  group: string;
  actions: PermAction[];
}

const ACTION_CFG: Record<PermAction, { label: string; bg: string }> = {
  view:     { label: "View",     bg: "#6366f1" },
  create:   { label: "Create",   bg: "#16a34a" },
  edit:     { label: "Edit",     bg: "#2563eb" },
  delete:   { label: "Delete",   bg: "#dc2626" },
  approve:  { label: "Approve",  bg: "#d97706" },
  request:  { label: "Request",  bg: "#7c3aed" },
  maker:    { label: "L1 Maker",    bg: "#0891b2" },
  checker:  { label: "L2 Checker",  bg: "#2563eb" },
  approver: { label: "L3 Approver", bg: "#d97706" },
  reject:   { label: "Reject",      bg: "#dc2626" },
  "ceo-approve": { label: "L4 Final Approval", bg: "#7c3aed" },
  "send-back":   { label: "Send Back",         bg: "#dc2626" },
  "agm-approve": { label: "L1 AGM Approve",     bg: "#0891b2" },
  "gm-approve":  { label: "L2 GM Approve",      bg: "#2563eb" },
  verify:   { label: "Verify",      bg: "#0891b2" },
  "l1-agm-approve":      { label: "L1 AGM Approve",      bg: "#0d9488" },
  "l2-director-approve": { label: "L2 Director Approve", bg: "#7c3aed" },
  hold:          { label: "Hold",          bg: "#d97706" },
  "release-hold":{ label: "Release Hold",  bg: "#16a34a" },
  "retry-tms":   { label: "Send/Retry TMS",bg: "#1d4ed8" },
  "l1-review":  { label: "L1 GM Screening",     bg: "#d97706" },
  "l2-draw":    { label: "L2 Architect Draw",   bg: "#2563eb" },
  "l3-review":  { label: "L3 GM Cross-Check",   bg: "#7c3aed" },
  "l4-approve": { label: "L4 GM Final Approval",bg: "#0d9488" },
};

const MODULE_DEFS: ModuleDef[] = [
  { id: "dashboard",        name: "Dashboard",         icon: "▦",  group: "Overview",      actions: ["view"] },
  { id: "companies",        name: "Companies",          icon: "🏢", group: "Project Setup", actions: ["view","create","edit","delete"] },
  { id: "projects",         name: "Projects",           icon: "🏗️", group: "Project Setup", actions: ["view","create","edit","delete"] },
  { id: "contractors",      name: "Contractors",        icon: "👷", group: "Project Setup", actions: ["view","create","edit","delete"] },
  { id: "consultants",      name: "Consultants",        icon: "📐", group: "Project Setup", actions: ["view","create","edit","delete"] },
  { id: "vendor-groups",    name: "Vendor Groups",      icon: "🔗", group: "Project Setup", actions: ["view","create","edit"] },
  { id: "categories",       name: "Categories",         icon: "🏷️", group: "Project Setup", actions: ["view","create","edit","delete"] },
  { id: "work-orders",      name: "Work Orders",        icon: "📋", group: "Execution",     actions: ["view","create","edit","delete","maker","checker","approver","ceo-approve","send-back"] },
  { id: "quotation-comparison", name: "Quotation Comparison", icon: "📑", group: "Execution", actions: ["view","create","approve"] },
  { id: "work-progress",    name: "Work Progress",      icon: "📊", group: "Execution",     actions: ["view","create","edit","delete"] },
  { id: "daily-progress-report", name: "Daily Progress Report", icon: "📅", group: "Execution", actions: ["view","create"] },
  { id: "drawing-requests", name: "Drawing Requests",   icon: "✏️", group: "Execution",     actions: ["view","create","edit","delete","l1-review","l2-draw","l3-review","l4-approve"] },
  { id: "bill-requests",    name: "Bill Requests",      icon: "📨", group: "Billing",       actions: ["view","create","agm-approve","gm-approve","reject"] },
  { id: "accounts-payment", name: "Accounts Payment",   icon: "💰", group: "Billing",       actions: ["view","edit","verify","l1-agm-approve","l2-director-approve","hold","release-hold","retry-tms","reject"] },
  { id: "billing",          name: "Billing",            icon: "🧮", group: "Billing",       actions: ["view","create"] },
  { id: "procurement-tracker", name: "Procurement Tracker", icon: "🔗", group: "Billing",   actions: ["view"] },
  { id: "advance-payments", name: "Advance Payments",   icon: "🏦", group: "Billing",       actions: ["view","create","edit","delete"] },
  { id: "bill-review",      name: "Site Progress",      icon: "🧾", group: "Billing",       actions: ["view","approve"] },
  { id: "ledger",           name: "Ledger",             icon: "📒", group: "Billing",       actions: ["view"] },
  { id: "user-management",  name: "User Management",    icon: "👥", group: "Admin",         actions: ["view","create","edit","delete"] },
  { id: "dri-dashboard",    name: "DRI Work Dashboard", icon: "🏗️", group: "Admin",         actions: ["view","create","edit"] },
  { id: "public-forms",     name: "Public Forms",       icon: "🔗", group: "Admin",         actions: ["view"] },
  { id: "audit-logs",       name: "Audit Logs",         icon: "🕘", group: "Admin",         actions: ["view"] },
  { id: "sla-settings",     name: "SLA Settings",       icon: "⚙️", group: "SLA",           actions: ["view","create","edit","delete"] },
  { id: "sla-dashboard",    name: "SLA Dashboard",      icon: "⏱️", group: "SLA",           actions: ["view"] },
];

function permsToMap(arr: { module: string; actions: string[] }[]): Record<string, PermAction[]> {
  const out: Record<string, PermAction[]> = {};
  for (const { module, actions } of (arr ?? [])) out[module] = actions as PermAction[];
  return out;
}

function permsToArray(map: Record<string, PermAction[]>): { module: string; actions: PermAction[] }[] {
  return Object.entries(map).filter(([, a]) => a.length > 0).map(([module, actions]) => ({ module, actions }));
}

type UserRole = "owner" | "gm" | "agm" | "accounts" | "process-coordinator" | "site-dri";

// ── Role config ───────────────────────────────────────────────────
// `color` values are ui/Badge color names (not antd Tag color names).

type BadgeColor = "gray" | "orange" | "green" | "red" | "amber" | "blue" | "purple" | "teal";

const ROLE_CFG: Record<UserRole, { label: string; color: BadgeColor; description: string }> = {
  owner:      { label: "Owner / Admin",    color: "red",     description: "Full system access — all modules, user management" },
  gm:         { label: "General Manager",  color: "purple",  description: "Reviews DRI progress, generates bill requests, work order sign-off & Accounts Payment checker stage" },
  agm:        { label: "AGM",              color: "amber",   description: "Reviews DRI progress, generates bill requests, work order sign-off & first stage of bill approval" },
  accounts:   { label: "Accounts",         color: "teal",    description: "Accounts Payment (maker/checker/approver/release), advance payments, ledger — per-user level assigned individually" },
  "process-coordinator": { label: "Process Coordinator", color: "blue", description: "Access assigned individually via the module permissions checklist below" },
  "site-dri": { label: "Site DRI",         color: "orange",  description: "DRI Work Dashboard — logs daily progress only" },
};

const ROLE_OPTIONS = Object.entries(ROLE_CFG).map(([value, { label, description }]) => ({
  value: value as UserRole,
  label,
  description,
}));

const AVATAR_COLORS: Record<UserRole, string> = {
  owner:      "#f37916",
  gm:         "#7c3aed",
  agm:        "#c9a227",
  accounts:   "#0891b2",
  "process-coordinator": "#2f54eb",
  "site-dri": "#d4620c",
};

// ── Helpers ───────────────────────────────────────────────────────

const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

// ── Module Permission Grid ────────────────────────────────────────

function ModulePermsGrid({
  perms,
  onToggle,
}: {
  perms: Record<string, PermAction[]>;
  onToggle: (mod: string, action: PermAction) => void;
}) {
  const groups = [...new Set(MODULE_DEFS.map(m => m.group))];

  return (
    <div className="border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700/40">
        <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Module Permissions
        </div>
        <div className="text-[11.5px] text-gray-400 mt-0.5">
          Tick exactly what this person should be able to do — nothing is granted automatically by role.
        </div>
      </div>

      {/* Module rows grouped */}
      <div className="py-1">
        {groups.map((group, gi) => (
          <div key={group}>
            {/* Group label */}
            <div className={`text-[9.5px] font-bold text-gray-400 uppercase tracking-wider px-3.5 ${gi === 0 ? "pt-2 pb-1" : "pt-2.5 pb-1"}`}>
              {group}
            </div>
            {MODULE_DEFS.filter(m => m.group === group).map(mod => {
              const activeActions = perms[mod.id] ?? [];

              return (
                <div
                  key={mod.id}
                  className={`flex items-start gap-2.5 px-3.5 py-2 border-t border-gray-200 dark:border-gray-700/40 ${activeActions.length > 0 ? "bg-white dark:bg-transparent" : "bg-gray-50 dark:bg-gray-800/20"}`}
                >
                  {/* Icon + Name */}
                  <div className="flex items-center gap-1.5 w-[150px] shrink-0 pt-0.5">
                    <span className="text-sm shrink-0">{mod.icon}</span>
                    <span className="text-[12.5px] font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">
                      {mod.name}
                    </span>
                  </div>

                  {/* Checklist of actions — full labels, real checkboxes, never ambiguous */}
                  <div className="flex gap-x-3.5 gap-y-1.5 flex-wrap flex-1">
                    {mod.actions.map(action => {
                      const cfg = ACTION_CFG[action];
                      const on  = activeActions.includes(action);
                      return (
                        <label key={action} className="flex items-center gap-1.5 cursor-pointer select-none">
                          <span
                            onClick={() => onToggle(mod.id, action)}
                            className="w-[15px] h-[15px] rounded flex items-center justify-center shrink-0 text-[10px] text-white font-bold transition-colors"
                            style={{
                              border: `1.5px solid ${on ? cfg.bg : "var(--nx-border, #E5E7EB)"}`,
                              background: on ? cfg.bg : "transparent",
                            }}
                          >
                            {on ? "✓" : ""}
                          </span>
                          <span className={`text-xs ${on ? "text-[#1A1A2E] dark:text-[#F1F5F9] font-semibold" : "text-gray-400 dark:text-gray-500"}`}>
                            {cfg.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────

export default function UserManagement() {
  const { user: me } = useAuth();

  const [users, setUsers]     = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  // Create / Edit modal
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editUser, setEditUser]     = useState<AppUser | null>(null);
  const [saving, setSaving]         = useState(false);
  const [perms, setPerms]           = useState<Record<string, PermAction[]>>({});

  const [nameField, setNameField]     = useState("");
  const [emailField, setEmailField]   = useState("");
  const [mobileField, setMobileField] = useState("");
  const [passwordField, setPasswordField] = useState("");
  const [roleField, setRoleField]     = useState<UserRole>("site-dri");
  const [isActiveField, setIsActiveField] = useState(true);
  const formErrors = useFormErrors<"name" | "email" | "mobile" | "password" | "role">();

  function togglePerm(mod: string, action: PermAction) {
    setPerms(prev => {
      const cur = prev[mod] ?? [];
      return { ...prev, [mod]: cur.includes(action) ? cur.filter(a => a !== action) : [...cur, action] };
    });
  }

  // Password modal
  const [pwdOpen, setPwdOpen]     = useState(false);
  const [pwdUser, setPwdUser]     = useState<AppUser | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdPassword, setPwdPassword] = useState("");
  const [pwdConfirm, setPwdConfirm]   = useState("");
  const pwdErrors = useFormErrors<"password" | "confirm">();

  // Deactivate confirm
  const [deactivateTarget, setDeactivateTarget] = useState<AppUser | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // ── Load ──────────────────────────────────────────────────────

  const load = useCallback(() => {
    setLoading(true);
    apiClient
      .get<{ users: AppUser[] }>("/users")
      .then((r) => setUsers(r.data.users || []))
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived ───────────────────────────────────────────────────

  const myId = (me as unknown as { _id?: string; id?: string })?._id
    || (me as unknown as { id?: string })?.id;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const matchSearch =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        ROLE_CFG[u.role]?.label.toLowerCase().includes(q);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      const matchActive = activeFilter === "all" || (activeFilter === "active" ? u.isActive : !u.isActive);
      return matchSearch && matchRole && matchActive;
    });
  }, [users, search, roleFilter, activeFilter]);

  const { page, totalPages, setPage, pageItems: pagedUsers } = usePagination(filtered, 15);

  const stats = useMemo(() => ({
    total:    users.length,
    active:   users.filter((u) => u.isActive).length,
    inactive: users.filter((u) => !u.isActive).length,
    byRole:   ROLE_OPTIONS
      .map((r) => ({ ...r, count: users.filter((u) => u.role === r.value).length }))
      .filter((r) => r.count > 0),
  }), [users]);

  // ── Handlers ──────────────────────────────────────────────────

  function openCreate() {
    setEditUser(null);
    formErrors.clearAll();
    setNameField(""); setEmailField(""); setMobileField(""); setPasswordField("");
    setRoleField("site-dri"); setIsActiveField(true);
    setPerms({});
    setDrawerOpen(true);
  }

  function openEdit(u: AppUser) {
    setEditUser(u);
    formErrors.clearAll();
    setNameField(u.name); setEmailField(u.email); setMobileField(u.mobile || "");
    setPasswordField(""); setRoleField(u.role); setIsActiveField(u.isActive);
    setPerms(u.permissions ? permsToMap(u.permissions) : {});
    setDrawerOpen(true);
  }

  function validateForm(): boolean {
    formErrors.clearAll();
    let ok = true;
    if (!nameField.trim()) { formErrors.setError("name", "Name is required"); ok = false; }
    if (!emailField.trim()) { formErrors.setError("email", "Email is required"); ok = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailField.trim())) { formErrors.setError("email", "Enter a valid email"); ok = false; }
    if (mobileField.trim() && !/^[0-9+\-\s]{6,15}$/.test(mobileField.trim())) { formErrors.setError("mobile", "Enter a valid mobile number"); ok = false; }
    if (!editUser) {
      if (!passwordField) { formErrors.setError("password", "Password is required"); ok = false; }
      else if (passwordField.length < 6) { formErrors.setError("password", "At least 6 characters"); ok = false; }
    }
    if (!roleField) { formErrors.setError("role", "Select a role"); ok = false; }
    return ok;
  }

  async function handleSave() {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: nameField, email: emailField, mobile: mobileField, role: roleField, isActive: isActiveField,
        permissions: permsToArray(perms),
      };
      if (!editUser) payload.password = passwordField;

      if (editUser) {
        const res = await apiClient.put<{ user: AppUser }>(`/users/${editUser._id}`, payload);
        setUsers((prev) => prev.map((u) => u._id === editUser._id ? res.data.user : u));
        toast.success("User updated");
      } else {
        const res = await apiClient.post<{ user: AppUser }>("/users", payload);
        setUsers((prev) => [res.data.user, ...prev]);
        toast.success(`User ${res.data.user.name} created`);
      }
      setDrawerOpen(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function openPassword(u: AppUser) {
    setPwdUser(u);
    setPwdPassword(""); setPwdConfirm("");
    pwdErrors.clearAll();
    setPwdOpen(true);
  }

  async function handlePassword() {
    pwdErrors.clearAll();
    let ok = true;
    if (!pwdPassword) { pwdErrors.setError("password", "Password is required"); ok = false; }
    else if (pwdPassword.length < 6) { pwdErrors.setError("password", "At least 6 characters"); ok = false; }
    if (!pwdConfirm) { pwdErrors.setError("confirm", "Please confirm the password"); ok = false; }
    else if (pwdConfirm !== pwdPassword) { pwdErrors.setError("confirm", "Passwords do not match"); ok = false; }
    if (!ok || !pwdUser) return;

    setPwdSaving(true);
    try {
      await apiClient.patch(`/users/${pwdUser._id}/password`, { password: pwdPassword });
      toast.success(`Password updated for ${pwdUser.name}`);
      setPwdOpen(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to update password");
    } finally {
      setPwdSaving(false);
    }
  }

  async function handleToggleActive(u: AppUser) {
    try {
      const res = await apiClient.put<{ user: AppUser }>(`/users/${u._id}`, { isActive: !u.isActive });
      setUsers((prev) => prev.map((x) => x._id === u._id ? res.data.user : x));
      toast.success(`${u.name} ${!u.isActive ? "activated" : "deactivated"}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed");
    }
  }

  async function handleDeactivate(u: AppUser) {
    setDeactivating(true);
    try {
      await apiClient.delete(`/users/${u._id}`);
      setUsers((prev) => prev.map((x) => x._id === u._id ? { ...x, isActive: false } : x));
      toast.success(`${u.name} deactivated`);
      setDeactivateTarget(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to deactivate");
    } finally {
      setDeactivating(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        icon={Users}
        title="User Management"
        subtitle="Manage team members, roles, and access levels"
        actions={<Btn color="primary" icon={Plus} label="Add User" onClick={openCreate} />}
      />

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-5">
        <StatCard label="Total Users" value={stats.total} icon={Users} active={activeFilter === "all"} onClick={() => setActiveFilter("all")} />
        <StatCard
          label="Active" value={stats.active} icon={CheckCircle2} iconColorClass="text-emerald-500"
          active={activeFilter === "active"} onClick={() => setActiveFilter(activeFilter === "active" ? "all" : "active")}
        />
        <StatCard
          label="Inactive" value={stats.inactive} icon={Ban} iconColorClass="text-red-500"
          active={activeFilter === "inactive"} onClick={() => setActiveFilter(activeFilter === "inactive" ? "all" : "inactive")}
        />
        <Card>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2.5">By Role</div>
          <div className="flex flex-wrap gap-1.5">
            {stats.byRole.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRoleFilter(roleFilter === r.value ? "all" : r.value)}
                className={roleFilter === r.value ? "ring-2 ring-primary rounded-full" : ""}
              >
                <Badge color={ROLE_CFG[r.value]?.color}>{r.label.split(" ")[0]} · {r.count}</Badge>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-2.5 flex-wrap items-center mb-3.5">
        <SearchFilter placeholder="Search by name or email…" value={search} onChange={setSearch} />
        <SelectFilter
          value={roleFilter}
          onChange={setRoleFilter}
          placeholder="All Roles"
          options={ROLE_OPTIONS.map((r) => ({ label: r.label, value: r.value }))}
        />
        <span className="ml-auto text-[13px] text-gray-400">
          {filtered.length} user{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex justify-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No users found" />
      ) : (
        <>
          <Table>
            <Thead>
              <Tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Joined</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {pagedUsers.map((u) => (
                <Tr key={u._id} className={!u.isActive ? "opacity-50" : ""}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                        style={{ background: AVATAR_COLORS[u.role] || "#9ba3b8" }}
                      >
                        {initials(u.name)}
                      </span>
                      <div>
                        <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">
                          {u.name}
                          {myId === u._id && <span className="ml-2 align-middle"><Badge color="orange" small>You</Badge></span>}
                        </div>
                        <div className="text-[13px] text-gray-400 mt-0.5">{u.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td><Badge color={ROLE_CFG[u.role]?.color || "gray"}>{ROLE_CFG[u.role]?.label || u.role}</Badge></Td>
                  <Td><UISwitch checked={u.isActive} onChange={() => handleToggleActive(u)} onLabel="Active" offLabel="Inactive" /></Td>
                  <Td className="text-[13px] text-gray-400">{dayjs(u.createdAt).format("DD MMM YYYY")}</Td>
                  <Td>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Btn small outline icon={Pencil} label="Edit" onClick={() => openEdit(u)} />
                      <Btn small outline icon={KeyRound} label="Password" onClick={() => openPassword(u)} />
                      {myId !== u._id && u.isActive && (
                        <Btn small color="red" icon={Ban} label="Disable" onClick={() => setDeactivateTarget(u)} />
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {totalPages > 1 && <div className="mt-4"><Pagination page={page} totalPages={totalPages} onChange={setPage} /></div>}
        </>
      )}

      {/* ── Create / Edit Modal ── */}
      {drawerOpen && (
        <Modal
          icon={User}
          title={editUser ? "Edit User" : "Add New User"}
          subtitle={editUser ? `Editing account for ${editUser.name}` : "Create a new team member account"}
          wide
          onClose={() => setDrawerOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => setDrawerOpen(false)} />
              <Btn color="primary" label={editUser ? "Save Changes" : "Create User"} loading={saving} onClick={handleSave} />
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <Field
              label="Full Name" required placeholder="e.g. Rahul Sharma"
              value={nameField} onChange={(e) => setNameField(e.target.value)}
              error={formErrors.errors.name}
            />
            <Field
              label="Email Address" required placeholder="e.g. rahul@neotericgrp.in"
              value={emailField} onChange={(e) => setEmailField(e.target.value)}
              error={formErrors.errors.email}
            />
            <Field
              label="Mobile" placeholder="e.g. 9876543210"
              value={mobileField} onChange={(e) => setMobileField(e.target.value)}
              error={formErrors.errors.mobile}
            />
            {!editUser && (
              <Field
                label="Password" required type="password" placeholder="Set initial password"
                value={passwordField} onChange={(e) => setPasswordField(e.target.value)}
                error={formErrors.errors.password}
              />
            )}
            <SField
              label="Role" required
              placeholder="Select role…"
              value={roleField}
              onChange={(v) => setRoleField(v as UserRole)}
              options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: ROLE_CFG[r.value]?.label }))}
              renderOption={(o) => {
                const role = o.value as UserRole;
                return (
                  <div className="py-0.5">
                    <Badge color={ROLE_CFG[role]?.color}>{ROLE_CFG[role]?.label}</Badge>
                    <div className="text-xs text-gray-400 mt-1">{ROLE_CFG[role]?.description}</div>
                  </div>
                );
              }}
              error={formErrors.errors.role}
            />
            <div>
              <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">Account Status</span>
              <UISwitch
                checked={isActiveField} onChange={setIsActiveField}
                onLabel="Active" offLabel="Inactive"
              />
            </div>

            {/* ── Module Permissions ── */}
            <ModulePermsGrid perms={perms} onToggle={togglePerm} />

            {editUser && (
              <div className="bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5">
                <div className="text-[13px] text-primary font-bold mb-2">Account Info</div>
                <Descriptions columns={1}>
                  <DescItem label="Member Since">{dayjs(editUser.createdAt).format("DD MMM YYYY")}</DescItem>
                  <DescItem label="Status">
                    <Badge color={editUser.isActive ? "green" : "red"}>{editUser.isActive ? "Active" : "Inactive"}</Badge>
                  </DescItem>
                </Descriptions>
                <div className="mt-2.5 text-[13px] text-gray-400">
                  Use the <strong className="text-gray-600 dark:text-gray-300">Password</strong> button on the table to change this user's password.
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Change Password Modal ── */}
      {pwdOpen && (
        <Modal
          icon={KeyRound}
          title="Change Password"
          subtitle={pwdUser ? `${pwdUser.name} · ${pwdUser.email}` : undefined}
          onClose={() => setPwdOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => setPwdOpen(false)} />
              <Btn color="purple" icon={KeyRound} label="Update Password" loading={pwdSaving} onClick={handlePassword} />
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <Field
              label="New Password" required type="password" placeholder="Enter new password"
              value={pwdPassword} onChange={(e) => setPwdPassword(e.target.value)}
              error={pwdErrors.errors.password}
            />
            <Field
              label="Confirm Password" required type="password" placeholder="Re-enter new password"
              value={pwdConfirm} onChange={(e) => setPwdConfirm(e.target.value)}
              error={pwdErrors.errors.confirm}
            />
          </div>
        </Modal>
      )}

      {deactivateTarget && (
        <ConfirmModal
          title={`Deactivate ${deactivateTarget.name}?`}
          message="They will lose access immediately."
          confirmLabel="Deactivate"
          danger
          loading={deactivating}
          onConfirm={() => handleDeactivate(deactivateTarget)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  );
}
