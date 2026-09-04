import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Plus, Pencil, KeyRound, CheckCircle2, Ban, Users, ShieldAlert, Trash2, Key,
} from "lucide-react";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import { useFormErrors } from "../../hooks/useFormErrors";
import { SearchFilter, DropdownSelectFilter } from "../../ui/Filters";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import StatCard from "../../ui/StatCard";
import Field from "../../ui/Field";
import UISwitch from "../../ui/Switch";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import Card from "../../ui/Card";
import MultiSelect from "../../ui/MultiSelect";
import EmptyState from "../../ui/EmptyState";
import DropdownMenu from "../../ui/DropdownMenu";
import type { DropdownMenuItem } from "../../ui/DropdownMenu";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import Segmented from "../../ui/Segmented";
import dayjs from "dayjs";

// ── Types ─────────────────────────────────────────────────────────

export interface AppUser {
  _id: string;
  name: string;
  email: string;
  mobile?: string;
  slackUserId?: string;
  department?: string;
  customDepartment?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  permissions?: { module: string; actions: string[] }[];
}

// A reusable permission set from the Roles library (see Backend/src/models/
// Role.js) — Phase 1 of moving off per-user-only permissions. Assigning one
// to a user (below) copies its permissions onto that user once; it does not
// keep them in sync afterwards — see the Roles tab's own note on why.
export interface RoleDoc {
  _id: string;
  name: string;
  description?: string;
  permissions: { module: string; actions: string[] }[];
  isSystem: boolean;
  userCount: number;
}

// A department's approval rule (Backend/src/models/DepartmentApprovalConfig.js)
// — isDefault means no doc exists yet for this department, so it's running on
// the original hardcoded behavior (2 approvals, owner+agm / owner+gm) shown
// here only as a preview of what's currently in effect.
export interface ApprovalRule {
  department: string;
  isCustom: boolean;
  requiredApprovals: 1 | 2 | 3 | 4;
  agmRoles: string[];
  gmRoles: string[];
  l3Roles: string[];
  l4Roles: string[];
  // Specific named approvers — when set, ONLY these people (plus Owner) can
  // act at that stage for this department, regardless of the matching *Roles.
  agmUsers: { _id: string; name: string; email: string }[];
  gmUsers:  { _id: string; name: string; email: string }[];
  l3Users:  { _id: string; name: string; email: string }[];
  l4Users:  { _id: string; name: string; email: string }[];
  isDefault: boolean;
}

// Ordered so `.slice(0, requiredApprovals)` always yields exactly the
// levels that department's config actually uses — same order the backend's
// gm/l3/l4-approve handlers advance through (billRequestController.js).
const APPROVAL_LEVEL_STAGES: {
  stage: "agm" | "gm" | "l3" | "l4"; short: string;
  rolesKey: "agmRoles" | "gmRoles" | "l3Roles" | "l4Roles";
  usersKey: "agmUsers" | "gmUsers" | "l3Users" | "l4Users";
}[] = [
  { stage: "agm", short: "L1 (AGM)", rolesKey: "agmRoles", usersKey: "agmUsers" },
  { stage: "gm",  short: "L2 (GM)",  rolesKey: "gmRoles",  usersKey: "gmUsers" },
  { stage: "l3",  short: "L3",       rolesKey: "l3Roles",  usersKey: "l3Users" },
  { stage: "l4",  short: "L4",       rolesKey: "l4Roles",  usersKey: "l4Users" },
];

export type PermAction = "view" | "create" | "edit" | "delete" | "approve" | "request" | "maker" | "checker" | "approver" | "reject" | "ceo-approve" | "send-back" | "agm-approve" | "gm-approve" | "l3-approve" | "verify" | "l1-agm-approve" | "l2-director-approve" | "hold" | "release-hold" | "retry-tms" | "l1-review" | "l2-draw" | "l3-review" | "l4-approve" | "co-l1-approve" | "co-l2-approve";

interface ModuleDef {
  id: string;
  name: string;
  icon: string;
  group: string;
  actions: PermAction[];
}

export const ACTION_CFG: Record<PermAction, { label: string; bg: string }> = {
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
  // Labels are stage-based, not role-based — this permission works for
  // anyone it's granted to, not just users literally named/roled "AGM"/"GM".
  "agm-approve": { label: "L1 Approval",     bg: "#0891b2" },
  "gm-approve":  { label: "L2 Approval",      bg: "#2563eb" },
  "l3-approve":  { label: "L3 Approval",      bg: "#7c3aed" },
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
  "co-l1-approve": { label: "L1 Approval", bg: "#0891b2" },
  "co-l2-approve": { label: "L2 Approval", bg: "#2563eb" },
};

// Grouped and ordered to match the left Sidebar's own section layout
// (Frontend/src/layouts/Sidebar/Sidebar.tsx's ADMIN_GROUPS) — so this
// checklist reads the same way the nav a granted user will actually see
// is laid out, not an arbitrary permissions-only grouping.
export const MODULE_DEFS: ModuleDef[] = [
  { id: "dashboard",        name: "Dashboard",         icon: "▦",  group: "Overview",      actions: ["view"] },
  { id: "sla-dashboard",    name: "SLA Report",        icon: "⏱️", group: "Overview",      actions: ["view"] },
  { id: "projects",         name: "Projects",           icon: "🏗️", group: "Overview",      actions: ["view","create","edit","delete"] },
  { id: "contractors",      name: "Contractors",        icon: "👷", group: "Execution",     actions: ["view","create","edit","delete"] },
  { id: "vendor-groups",    name: "Vendor Groups",      icon: "🔗", group: "Execution",     actions: ["view","create","edit"] },
  { id: "work-orders",      name: "Work Orders",        icon: "📋", group: "Execution",     actions: ["view","create","edit","delete","maker","checker","approver","ceo-approve","send-back"] },
  { id: "quotation-comparison", name: "Quotation Comparison", icon: "📑", group: "Execution", actions: ["view","create","approve"] },
  { id: "work-progress",    name: "Work Progress",      icon: "📊", group: "Execution",     actions: ["view","create","edit","delete"] },
  { id: "daily-progress-report", name: "Daily Progress Report", icon: "📅", group: "Execution", actions: ["view","create"] },
  { id: "drawing-requests", name: "Drawing Requests",   icon: "✏️", group: "Execution",     actions: ["view","create","edit","delete","l1-review","l2-draw","l3-review","l4-approve"] },
  { id: "consultants",      name: "Consultants",        icon: "📐", group: "Professional Services", actions: ["view","create","edit","delete"] },
  { id: "consultancy-orders", name: "Consultancy Orders", icon: "📝", group: "Professional Services", actions: ["view","edit","co-l1-approve","co-l2-approve","reject"] },
  { id: "bill-review",      name: "Site Progress",      icon: "🧾", group: "Billing",       actions: ["view","approve"] },
  { id: "bill-requests",    name: "Bill Approval",      icon: "📨", group: "Billing",       actions: ["view","create","agm-approve","gm-approve","l3-approve","l4-approve","reject"] },
  { id: "billing",          name: "Billing",            icon: "🧮", group: "Billing",       actions: ["view","create"] },
  { id: "accounts-payment", name: "Accounts Payment",   icon: "💰", group: "Billing",       actions: ["view","edit","verify","l1-agm-approve","l2-director-approve","hold","release-hold","retry-tms","reject"] },
  { id: "procurement-tracker", name: "Procurement Tracker", icon: "🔗", group: "Billing",   actions: ["view"] },
  { id: "ledger",           name: "Ledger",             icon: "📒", group: "Billing",       actions: ["view"] },
  { id: "advance-payments", name: "Advance Payments",   icon: "🏦", group: "Billing",       actions: ["view","create","edit","delete"] },
  { id: "companies",        name: "Companies",          icon: "🏢", group: "Admin",         actions: ["view","create","edit","delete"] },
  { id: "categories",       name: "Categories",         icon: "🏷️", group: "Admin",         actions: ["view","create","edit","delete"] },
  { id: "dri-dashboard",    name: "DRI Work Dashboard", icon: "🏗️", group: "Admin",         actions: ["view","create","edit"] },
  { id: "public-forms",     name: "Public Forms",       icon: "🔗", group: "Admin",         actions: ["view"] },
  { id: "audit-logs",       name: "Audit Logs",         icon: "🕘", group: "Admin",         actions: ["view"] },
  { id: "user-management",  name: "User Management",    icon: "👥", group: "Admin",         actions: ["view","create","edit","delete"] },
  { id: "sla-settings",     name: "SLA Settings",       icon: "⚙️", group: "Admin",         actions: ["view","create","edit","delete"] },
];

export function permsToMap(arr: { module: string; actions: string[] }[]): Record<string, PermAction[]> {
  const out: Record<string, PermAction[]> = {};
  for (const { module, actions } of (arr ?? [])) out[module] = actions as PermAction[];
  return out;
}

export function permsToArray(map: Record<string, PermAction[]>): { module: string; actions: PermAction[] }[] {
  return Object.entries(map).filter(([, a]) => a.length > 0).map(([module, actions]) => ({ module, actions }));
}

// The 6 built-in roles keep exact literal typing (so existing role === "owner"
// etc. checks elsewhere stay sound); the `(string & {})` branch additionally
// allows any custom role name typed in below, while still preserving
// autocomplete on the 6 known literals wherever this type is used.
type FixedRole = "owner" | "gm" | "agm" | "accounts" | "process-coordinator" | "site-dri";
export type UserRole = FixedRole | (string & {});

// A sentinel option value (never a real role name) that the role picker below
// uses to reveal the "type a new role name" input — kept out of ROLE_CFG so
// it never gets treated as an actual assignable role.
export const CUSTOM_ROLE_OPTION = "__custom_role__";
export const isKnownRole = (r: string): boolean => Object.prototype.hasOwnProperty.call(ROLE_CFG, r);

// ── Role config ───────────────────────────────────────────────────
// `color` values are ui/Badge color names (not antd Tag color names).

export type BadgeColor = "gray" | "orange" | "green" | "red" | "amber" | "blue" | "purple" | "teal";

export const ROLE_CFG: Record<UserRole, { label: string; color: BadgeColor; description: string }> = {
  owner:      { label: "Owner / Admin",    color: "red",     description: "Full system access — all modules, user management" },
  gm:         { label: "General Manager",  color: "purple",  description: "Reviews DRI progress, generates bill requests, work order sign-off & Accounts Payment checker stage" },
  agm:        { label: "AGM",              color: "amber",   description: "Reviews DRI progress, generates bill requests, work order sign-off & first stage of bill approval" },
  accounts:   { label: "Accounts",         color: "teal",    description: "Accounts Payment (maker/checker/approver/release), advance payments, ledger — per-user level assigned individually" },
  "process-coordinator": { label: "Process Coordinator", color: "blue", description: "Access assigned individually via the module permissions checklist below" },
  "site-dri": { label: "Site DRI",         color: "orange",  description: "DRI Work Dashboard — logs daily progress only" },
};

export const ROLE_OPTIONS = Object.entries(ROLE_CFG).map(([value, { label, description }]) => ({
  value: value as UserRole,
  label,
  description,
}));

// NxBadge's palette (see ui/nexora/Badge.tsx) doesn't include "purple", so this
// maps each role onto the closest allowed Nexora badge color for the list-view
// pills below — ROLE_CFG itself (and its "purple" for gm) stays untouched since
// the create/edit modal's own role picker still renders through the old Badge.
const DEPARTMENT_LABEL: Record<string, string> = {
  civil: "Civil Team", marketing: "Marketing Team", planning: "Planning Team", maintenance: "Maintenance Team",
};
function departmentLabelForUser(dept: string): string {
  return DEPARTMENT_LABEL[dept] || dept;
}

const NX_ROLE_COLOR: Record<UserRole, NxBadgeColor> = {
  owner: "red",
  gm: "indigo",
  agm: "amber",
  accounts: "teal",
  "process-coordinator": "blue",
  "site-dri": "orange",
};

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

// One flattened "node" = one module+action pair, the actual unit this grid
// grants/revokes — each gets its own card (module name folded into the
// label) rather than being nested inside a per-module box.
interface PermNode { modId: string; label: string; kind: string; }

// Cosmetic-only categorization of an action, purely for the small "Read
// node / Logic write / Purge data" subtext under each permission's label —
// has no bearing on what the toggle actually grants.
function actionKind(action: PermAction): string {
  if (action === "view") return "Read node";
  if (action === "delete") return "Purge data";
  return "Logic write";
}

export function ModulePermsGrid({
  perms,
  onToggle,
  hiddenActionsByModule,
}: {
  perms: Record<string, PermAction[]>;
  onToggle: (mod: string, action: PermAction) => void;
  // Drops specific action-nodes from a module's division entirely — e.g. a
  // department set to 1 approval level (Users → Departments) means this
  // user's Bill Approval division should never even show L2/L3/L4 sign-off
  // toggles, since that department's bills never reach those stages. Purely
  // a display filter — has no effect on perms already granted beyond what's
  // shown; leave a module's key out entirely to show every one of its actions.
  hiddenActionsByModule?: Record<string, PermAction[]>;
}) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Each individual module (Contractors, Work Orders, ...) is its own
  // division — not the broader sidebar section (Execution, Billing, ...)
  // those modules sit under. MODULE_DEFS' own declaration order already
  // matches the sidebar's item order, so no re-sorting needed here.
  const nodesByGroup = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MODULE_DEFS.map(mod => {
      const nodes: (PermNode & { action: PermAction })[] = [];
      const hidden = hiddenActionsByModule?.[mod.id];
      for (const action of mod.actions) {
        if (hidden?.includes(action)) continue;
        const label = ACTION_CFG[action].label;
        if (q && !`${mod.name} ${label}`.toLowerCase().includes(q)) continue;
        nodes.push({ modId: mod.id, action, label, kind: actionKind(action) });
      }
      return { group: mod.name, nodes };
    }).filter(g => g.nodes.length > 0);
  }, [search, hiddenActionsByModule]);

  const assignedCount = Object.values(perms).reduce((s, actions) => s + actions.length, 0);
  const isOn = (n: { modId: string; action: PermAction }) => (perms[n.modId] ?? []).includes(n.action);

  function toggleGroup(nodes: { modId: string; action: PermAction }[], turnOn: boolean) {
    for (const n of nodes) {
      const on = isOn(n);
      if (turnOn && !on) onToggle(n.modId, n.action);
      if (!turnOn && on) onToggle(n.modId, n.action);
    }
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-hidden">
      <div className="px-3.5 py-3 bg-gray-50 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700/40 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[13px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">Role Permission Matrix</div>
          <div className="text-[11px] text-gray-400 font-mono mt-0.5">Assigned authorizations: {assignedCount}</div>
        </div>
        <div className="w-full sm:w-auto sm:min-w-[220px]">
          <Field placeholder="Search matrix…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="p-3 flex flex-col gap-3">
        {nodesByGroup.map(({ group, nodes }) => {
          const allOn = nodes.every(isOn);
          const isCollapsed = !!collapsed[group];
          return (
            <div key={group} className="rounded-lg border border-orange-100 dark:border-orange-500/20 bg-white dark:bg-transparent overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-orange-50 dark:bg-orange-500/10 border-b border-orange-100 dark:border-orange-500/20">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/40 flex items-center justify-center shrink-0">
                    <Key className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                  <div>
                    <div className="text-[13px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">{group}</div>
                    <div className="text-[10.5px] text-gray-400">{nodes.length} Node{nodes.length !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-gray-400 whitespace-nowrap hidden sm:inline">Select unit</span>
                  <UISwitch checked={allOn} onChange={(v) => toggleGroup(nodes, v)} onLabel="" offLabel="" />
                  <button type="button" onClick={() => setCollapsed(c => ({ ...c, [group]: !c[group] }))} className="text-gray-400 hover:text-primary w-5 text-center">
                    {isCollapsed ? "▾" : "▴"}
                  </button>
                </div>
              </div>
              {!isCollapsed && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 px-3.5 pt-3.5 pb-3.5">
                  {nodes.map(n => {
                    const on = isOn(n);
                    return (
                      <div
                        key={`${n.modId}:${n.action}`}
                        className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 ${on ? "border-orange-300 dark:border-orange-500/40 bg-orange-50 dark:bg-orange-500/10" : "border-gray-200 dark:border-gray-700/40 bg-white dark:bg-transparent"}`}
                      >
                        <div className="min-w-0">
                          <div className={`text-[13px] font-semibold truncate ${on ? "text-orange-700 dark:text-orange-300" : "text-[#1A1A2E] dark:text-[#F1F5F9]"}`}>
                            {n.label}
                          </div>
                          <div className="text-[10.5px] text-gray-400 flex items-center gap-1 mt-0.5">
                            <span className="w-1 h-1 rounded-full bg-gray-300 inline-block shrink-0" /> {n.kind}
                          </div>
                        </div>
                        <span className="shrink-0"><UISwitch checked={on} onChange={() => onToggle(n.modId, n.action)} onLabel="" offLabel="" /></span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {nodesByGroup.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">No matching permissions</div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────

export default function UserManagement() {
  const { user: me } = useAuth();
  const navigate = useNavigate();

  // ── Roles library (Phase 1 — additive; Users tab below is untouched) ──
  const [mainTab, setMainTab] = useState<"users" | "roles" | "departments">("users");
  const [roles, setRoles] = useState<RoleDoc[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  // Create modal — name + description only; permissions are set afterwards
  // via "Manage Permissions" below.
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleNameField, setRoleNameField] = useState("");
  const [roleDescField, setRoleDescField] = useState("");
  const [roleSaving, setRoleSaving] = useState(false);
  // Rename — the pencil icon's own narrow action, separate from the
  // permissions modal below.
  const [renameTarget, setRenameTarget] = useState<RoleDoc | null>(null);
  const [renameField, setRenameField] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleDoc | null>(null);
  const [deletingRole, setDeletingRole] = useState(false);
  const roleFormErrors = useFormErrors<"name">();
  const renameFormErrors = useFormErrors<"name">();

  const loadRoles = useCallback(() => {
    setRolesLoading(true);
    apiClient.get<{ roles: RoleDoc[] }>("/roles")
      .then(r => setRoles(r.data.roles || []))
      .catch(() => toast.error("Failed to load roles"))
      .finally(() => setRolesLoading(false));
  }, []);
  // Loaded on mount regardless of tab — the Add/Edit User form's own
  // "copy from role" picker below needs the list too, not just the Roles tab.
  useEffect(() => { loadRoles(); }, [loadRoles]);

  function openCreateRole() {
    roleFormErrors.clearAll();
    setRoleNameField(""); setRoleDescField("");
    setRoleModalOpen(true);
  }
  async function handleSaveRole() {
    if (!roleNameField.trim()) {
      roleFormErrors.setError("name", "Role name is required");
      return;
    }
    setRoleSaving(true);
    try {
      await apiClient.post<{ role: RoleDoc }>("/roles", { name: roleNameField, description: roleDescField });
      toast.success("Role created");
      setRoleModalOpen(false);
      loadRoles();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to create role");
    } finally {
      setRoleSaving(false);
    }
  }

  function openRenameRole(r: RoleDoc) {
    setRenameTarget(r);
    renameFormErrors.clearAll();
    setRenameField(r.name);
  }
  async function handleRenameRole() {
    if (!renameTarget) return;
    if (!renameField.trim()) {
      renameFormErrors.setError("name", "Role name is required");
      return;
    }
    setRenaming(true);
    try {
      await apiClient.patch(`/roles/${renameTarget._id}/rename`, { name: renameField });
      toast.success("Role renamed");
      setRenameTarget(null);
      loadRoles();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to rename role");
    } finally {
      setRenaming(false);
    }
  }
  async function handleDeleteRole() {
    if (!deleteRoleTarget) return;
    setDeletingRole(true);
    try {
      await apiClient.delete(`/roles/${deleteRoleTarget._id}`);
      toast.success("Role deleted");
      setDeleteRoleTarget(null);
      loadRoles();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to delete role");
    } finally {
      setDeletingRole(false);
    }
  }

  // ── Departments — per-department approval rules ────────────────
  const [approvalRules, setApprovalRules] = useState<ApprovalRule[]>([]);
  const [approvalRulesLoading, setApprovalRulesLoading] = useState(false);
  const [approvalDefaults, setApprovalDefaults] = useState<{ agmRoles: string[]; gmRoles: string[]; l3Roles: string[]; l4Roles: string[] }>({ agmRoles: [], gmRoles: [], l3Roles: [], l4Roles: [] });
  const [editRuleTarget, setEditRuleTarget] = useState<ApprovalRule | null>(null);
  const [editRuleRequired, setEditRuleRequired] = useState<1 | 2 | 3 | 4>(2);
  const [editRuleAgmRoles, setEditRuleAgmRoles] = useState<string[]>([]);
  const [editRuleGmRoles, setEditRuleGmRoles] = useState<string[]>([]);
  const [editRuleL3Roles, setEditRuleL3Roles] = useState<string[]>([]);
  const [editRuleL4Roles, setEditRuleL4Roles] = useState<string[]>([]);
  const [editRuleAgmUserIds, setEditRuleAgmUserIds] = useState<string[]>([]);
  const [editRuleGmUserIds, setEditRuleGmUserIds] = useState<string[]>([]);
  const [editRuleL3UserIds, setEditRuleL3UserIds] = useState<string[]>([]);
  const [editRuleL4UserIds, setEditRuleL4UserIds] = useState<string[]>([]);
  const [savingRule, setSavingRule] = useState(false);

  const loadApprovalRules = useCallback(() => {
    setApprovalRulesLoading(true);
    apiClient.get<{ rules: ApprovalRule[]; defaults: { agmRoles: string[]; gmRoles: string[]; l3Roles: string[]; l4Roles: string[] } }>("/approval-rules")
      .then(r => { setApprovalRules(r.data.rules || []); setApprovalDefaults(r.data.defaults); })
      .catch(() => toast.error("Failed to load approval rules"))
      .finally(() => setApprovalRulesLoading(false));
  }, []);
  useEffect(() => { loadApprovalRules(); }, [loadApprovalRules]);

  function openEditRule(rule: ApprovalRule) {
    setEditRuleTarget(rule);
    setEditRuleRequired(rule.requiredApprovals);
    setEditRuleAgmRoles(rule.agmRoles);
    setEditRuleGmRoles(rule.gmRoles);
    setEditRuleL3Roles(rule.l3Roles);
    setEditRuleL4Roles(rule.l4Roles);
    setEditRuleAgmUserIds(rule.agmUsers.map(u => u._id));
    setEditRuleGmUserIds(rule.gmUsers.map(u => u._id));
    setEditRuleL3UserIds(rule.l3Users.map(u => u._id));
    setEditRuleL4UserIds(rule.l4Users.map(u => u._id));
  }
  async function handleSaveRule() {
    if (!editRuleTarget) return;
    setSavingRule(true);
    try {
      await apiClient.put(`/approval-rules/${encodeURIComponent(editRuleTarget.department)}`, {
        requiredApprovals: editRuleRequired,
        agmRoles: editRuleAgmRoles,
        gmRoles: editRuleGmRoles,
        l3Roles: editRuleL3Roles,
        l4Roles: editRuleL4Roles,
        agmUserIds: editRuleAgmUserIds,
        gmUserIds: editRuleGmUserIds,
        l3UserIds: editRuleL3UserIds,
        l4UserIds: editRuleL4UserIds,
      });
      toast.success(`Approval rule for "${departmentLabelForUser(editRuleTarget.department)}" saved`);
      setEditRuleTarget(null);
      loadApprovalRules();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to save approval rule");
    } finally {
      setSavingRule(false);
    }
  }

  const [users, setUsers]     = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

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
        u._id.toLowerCase().includes(q) ||
        ROLE_CFG[u.role]?.label.toLowerCase().includes(q);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      const matchActive = activeFilter === "all" || (activeFilter === "active" ? u.isActive : !u.isActive);
      return matchSearch && matchRole && matchActive;
    });
  }, [users, search, roleFilter, activeFilter]);

  const { page, totalPages, setPage, pageItems: pagedUsers } = usePagination(filtered, 15);

  // Scoped by roleFilter only (not activeFilter) — Total/Active/Inactive are
  // themselves the activeFilter toggle, so they need a base that still lets
  // switching between them show a real split; "By Role" stays off the full
  // `users` list below since those pills are for changing roleFilter itself.
  const roleScoped = useMemo(
    () => roleFilter === "all" ? users : users.filter((u) => u.role === roleFilter),
    [users, roleFilter]
  );

  const stats = useMemo(() => ({
    total:    roleScoped.length,
    active:   roleScoped.filter((u) => u.isActive).length,
    inactive: roleScoped.filter((u) => !u.isActive).length,
    byRole:   ROLE_OPTIONS
      .map((r) => ({ ...r, count: users.filter((u) => u.role === r.value).length }))
      .filter((r) => r.count > 0),
  }), [users, roleScoped]);

  // ── Handlers ──────────────────────────────────────────────────

  function openCreate() {
    navigate("/users/new");
  }

  function openEdit(u: AppUser) {
    navigate(`/users/${u._id}/edit`);
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
        title="System Access Control"
        subtitle="Manage user accounts, roles, and granular permissions"
        actions={mainTab === "users"
          ? <NxBtn color="primary" icon={Plus} label="Register New User" onClick={openCreate} />
          : mainTab === "roles"
          ? <NxBtn color="primary" icon={Plus} label="Define New Role" onClick={openCreateRole} />
          : undefined}
      />

      <div className="mb-4">
        <Segmented
          value={mainTab}
          onChange={(v) => setMainTab(v as "users" | "roles" | "departments")}
          options={[
            { value: "users", label: "Users" },
            { value: "roles", label: "Roles" },
            { value: "departments", label: "Departments" },
          ]}
          divided
        />
      </div>

      {mainTab === "roles" ? (
        <>
          {rolesLoading ? (
            <div className="flex justify-center py-16 text-gray-400 text-sm">Loading…</div>
          ) : roles.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="No roles yet" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {roles.map((r) => {
                const authNodes = r.permissions.reduce((s, p) => s + p.actions.length, 0);
                return (
                <Card key={r._id} className="relative overflow-hidden flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2 relative">
                    <div className="w-11 h-11 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center shrink-0">
                      <ShieldAlert className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] text-gray-400">{authNodes} Auth Node{authNodes !== 1 ? "s" : ""}</span>
                      <div className="flex items-center gap-1">
                        <button type="button" title="Rename" onClick={() => openRenameRole(r)} className="text-gray-400 hover:text-primary">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" title="Delete" onClick={() => setDeleteRoleTarget(r)} className="text-gray-400 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="relative">
                    <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">
                      {ROLE_CFG[r.name]?.label || r.name}
                    </div>
                    <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                      {r.description || "Configure global access rights for this role type."}
                    </p>
                  </div>
                  <div className="relative flex items-center justify-between gap-2">
                    <Btn
                      outline small icon={Users} label="Manage Users"
                      onClick={() => { setRoleFilter(r.name); setMainTab("users"); }}
                    />
                    <span className="text-[11px] text-gray-400">{r.userCount} user{r.userCount !== 1 ? "s" : ""}</span>
                  </div>
                </Card>
                );
              })}
            </div>
          )}
        </>
      ) : mainTab === "departments" ? (
        <>
          {approvalRulesLoading ? (
            <div className="flex justify-center py-16 text-gray-400 text-sm">Loading…</div>
          ) : approvalRules.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="No departments yet" message="Departments show up here once a work order is assigned to one." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {approvalRules.map((rule) => (
                <Card key={rule.department} className="relative overflow-hidden flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-11 h-11 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center shrink-0">
                      <ShieldAlert className="w-5 h-5 text-primary" />
                    </div>
                    <button type="button" title="Edit" onClick={() => openEditRule(rule)} className="text-gray-400 hover:text-primary">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div>
                    <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">
                      {departmentLabelForUser(rule.department)}
                    </div>
                    <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">
                      {rule.requiredApprovals} approval{rule.requiredApprovals !== 1 ? "s" : ""} — {APPROVAL_LEVEL_STAGES.slice(0, rule.requiredApprovals).map(s => s.short).join(" → ")}
                      {rule.isDefault && <span className="text-gray-400"> (default, not customized)</span>}
                    </p>
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {APPROVAL_LEVEL_STAGES.slice(0, rule.requiredApprovals).map(s => {
                      const users = rule[s.usersKey], roles = rule[s.rolesKey];
                      const fallbackRoles = approvalDefaults[s.rolesKey];
                      return (
                        <div key={s.stage}>
                          {s.short}: {users.length
                            ? users.map(u => u.name).join(", ")
                            : (roles.length ? roles : fallbackRoles).map(r => ROLE_CFG[r as UserRole]?.label || r).join(", ")}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
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
        <Card padded={false} className="p-2.5">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">By Role</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRoleFilter("all")}
              className={roleFilter === "all" ? "ring-2 ring-primary rounded-full" : ""}
            >
              <NxBadge color="gray">Total · {users.length}</NxBadge>
            </button>
            {stats.byRole.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRoleFilter(roleFilter === r.value ? "all" : r.value)}
                className={roleFilter === r.value ? "ring-2 ring-primary rounded-full" : ""}
              >
                <NxBadge color={NX_ROLE_COLOR[r.value]}>{r.label.split(" ")[0]} · {r.count}</NxBadge>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-2.5 flex-wrap items-center mb-3.5">
        <SearchFilter placeholder="Search by Name, Email, or UID…" value={search} onChange={setSearch} />
        <DropdownSelectFilter
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
          <Table className="min-w-[900px]">
            <Thead>
              <Tr>
                <Th className="w-[26%]">Identity</Th>
                <Th className="w-[24%]">Contact Info</Th>
                <Th className="w-[20%]">Department / Role</Th>
                <Th className="w-[14%]">Account State</Th>
                <Th className="w-[16%]">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {pagedUsers.map((u) => {
                const menuItems: DropdownMenuItem[] = [
                  ...(myId !== u._id && u.isActive
                    ? [{ key: "disable", label: "Disable", icon: Ban, danger: true, onClick: () => setDeactivateTarget(u) }]
                    : []),
                ];
                return (
                  <Tr key={u._id} className={!u.isActive ? "opacity-50" : ""}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <span
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                          style={{ background: AVATAR_COLORS[u.role] || "#9ba3b8" }}
                        >
                          {initials(u.name)}
                        </span>
                        <div className="min-w-0">
                          <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9] truncate">
                            {u.name}
                            {myId === u._id && <span className="ml-2 align-middle"><NxBadge color="orange">You</NxBadge></span>}
                          </div>
                          <div className="text-[11px] text-gray-400 mt-0.5 font-mono truncate">UID: {u._id.slice(-8)}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] truncate" title={u.email}>{u.email}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">Joined {dayjs(u.createdAt).format("DD MMM YYYY")}</div>
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1 items-start">
                        {u.department && (
                          <NxBadge color="slate">{u.department === "custom" ? (u.customDepartment || "Custom") : departmentLabelForUser(u.department)}</NxBadge>
                        )}
                        <NxBadge color={NX_ROLE_COLOR[u.role] || "gray"}>{ROLE_CFG[u.role]?.label || u.role}</NxBadge>
                      </div>
                    </Td>
                    <Td><UISwitch checked={u.isActive} onChange={() => handleToggleActive(u)} onLabel="Active" offLabel="Inactive" /></Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <NxBtn color="icon" title="Edit" icon={Pencil} onClick={() => openEdit(u)} />
                        <NxBtn color="icon" title="Change Password" icon={KeyRound} onClick={() => openPassword(u)} />
                        {menuItems.length > 0 && <DropdownMenu items={menuItems} />}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          {totalPages > 1 && <div className="mt-4"><Pagination page={page} totalPages={totalPages} onChange={setPage} /></div>}
        </>
      )}
        </>
      )}

      {/* ── Create Role Modal — name + description only; permissions are set
          next, via "Manage Permissions" on the new role's card. ── */}
      {roleModalOpen && (
        <Modal
          icon={ShieldAlert}
          title="Define New Role"
          onClose={() => setRoleModalOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => setRoleModalOpen(false)} />
              <Btn color="primary" label="Create Role" loading={roleSaving} onClick={handleSaveRole} />
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <Field
              label="Role Name" required placeholder="e.g. Purchase Coordinator"
              value={roleNameField} onChange={(e) => setRoleNameField(e.target.value)}
              error={roleFormErrors.errors.name}
            />
            <Field
              label="Description" placeholder="What is this role for?"
              value={roleDescField} onChange={(e) => setRoleDescField(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {/* ── Rename Role Modal — the pencil icon's own narrow action ── */}
      {renameTarget && (
        <Modal
          icon={Pencil}
          title={`Rename Role — ${ROLE_CFG[renameTarget.name]?.label || renameTarget.name}`}
          onClose={() => setRenameTarget(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => setRenameTarget(null)} />
              <Btn color="primary" label="Save" loading={renaming} onClick={handleRenameRole} />
            </div>
          }
        >
          <Field
            label="Role Name" required
            value={renameField} onChange={(e) => setRenameField(e.target.value)}
            error={renameFormErrors.errors.name}
            hint="Every user currently on this role moves to the new name automatically."
          />
        </Modal>
      )}


      {deleteRoleTarget && (
        <ConfirmModal
          title={`Delete role "${deleteRoleTarget.name}"?`}
          message="This cannot be undone. Reassign any users on this role first — deleting a role still in use is blocked."
          confirmLabel="Delete" danger
          loading={deletingRole}
          onConfirm={handleDeleteRole} onCancel={() => setDeleteRoleTarget(null)}
        />
      )}

      {editRuleTarget && (() => {
        // Every user is selectable here, not just ones whose own `department`
        // field happens to match — most accounts never get that field set at
        // all, which silently narrowed this picker down to owner/whoever did
        // have it set (often just the AGM who created the department). Naming
        // someone a specific approver for a department has nothing to do with
        // which department they're personally tagged under.
        const departmentUsers = users;
        return (
        <Modal
          icon={ShieldAlert}
          title={`Approval Rule — ${departmentLabelForUser(editRuleTarget.department)}`}
          onClose={() => setEditRuleTarget(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => setEditRuleTarget(null)} />
              <Btn color="primary" label="Save" loading={savingRule} onClick={handleSaveRule} />
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <div>
              <MultiSelect
                label="Approval Levels"
                placeholder="L1 only"
                values={APPROVAL_LEVEL_STAGES.slice(0, editRuleRequired).map((_, i) => String(i + 1))}
                onChange={(vals) => {
                  // "1" (L1/AGM) is the non-negotiable baseline — every bill
                  // needs at least one sign-off — so it can't actually be
                  // unchecked. Otherwise the highest level checked wins (e.g.
                  // checking L3 alone still means "L1 through L3", 3 total).
                  const highest = Math.max(1, ...vals.map(Number));
                  setEditRuleRequired(Math.min(4, highest) as 1 | 2 | 3 | 4);
                }}
                options={APPROVAL_LEVEL_STAGES.map((s, i) => ({ value: String(i + 1), label: s.short }))}
                disabledValues={["1"]}
                onDisabledOptionClick={() => toast("L1 (AGM) is always required — a bill needs at least one sign-off.")}
              />
              <div className="text-[11px] text-gray-400 mt-1.5">
                Bill requests and manually-created bills in this department stop at whichever level is checked highest — the RunningBill is created right after that level's sign-off, with no further stage.
              </div>
            </div>
            {(() => {
              const STAGE_STATE = {
                agm: { roles: editRuleAgmRoles, setRoles: setEditRuleAgmRoles, userIds: editRuleAgmUserIds, setUserIds: setEditRuleAgmUserIds, defaults: approvalDefaults.agmRoles },
                gm:  { roles: editRuleGmRoles,  setRoles: setEditRuleGmRoles,  userIds: editRuleGmUserIds,  setUserIds: setEditRuleGmUserIds,  defaults: approvalDefaults.gmRoles },
                l3:  { roles: editRuleL3Roles,  setRoles: setEditRuleL3Roles,  userIds: editRuleL3UserIds,  setUserIds: setEditRuleL3UserIds,  defaults: approvalDefaults.l3Roles },
                l4:  { roles: editRuleL4Roles,  setRoles: setEditRuleL4Roles,  userIds: editRuleL4UserIds,  setUserIds: setEditRuleL4UserIds,  defaults: approvalDefaults.l4Roles },
              } as const;
              return APPROVAL_LEVEL_STAGES.slice(0, editRuleRequired).map(s => {
                const st = STAGE_STATE[s.stage];
                return (
                  <div key={s.stage} className="flex flex-col gap-2 pt-1 border-t border-gray-100 dark:border-gray-700/40 first:border-t-0 first:pt-0">
                    <MultiSelect
                      label={`Specific ${s.short} approvers (optional)`}
                      placeholder="Leave blank to allow by role instead"
                      values={st.userIds}
                      onChange={st.setUserIds}
                      options={departmentUsers.map(u => ({ label: `${u.name} (${ROLE_CFG[u.role]?.label || u.role})`, value: u._id }))}
                    />
                    {st.userIds.length === 0 && (
                      <MultiSelect
                        label={`Or, who can approve at ${s.short} by role`}
                        placeholder={st.defaults.length ? `Default: ${st.defaults.map(r => ROLE_CFG[r as UserRole]?.label || r).join(", ")}` : "Default: Owner / Admin only"}
                        values={st.roles}
                        onChange={st.setRoles}
                        options={ROLE_OPTIONS.map(r => ({ label: r.label, value: r.value }))}
                      />
                    )}
                  </div>
                );
              });
            })()}
            <div className="text-[11px] text-gray-400">
              Owner can always approve regardless of these lists. Leaving a list empty keeps the original default roles for that stage — L3/L4 default to Owner-only until named, since no role in this org is inherently "the L3/L4 approver".
            </div>
          </div>
        </Modal>
        );
      })()}


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
