import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutOutlined, BankOutlined, ApartmentOutlined, TeamOutlined, TagsOutlined,
  FileTextOutlined, LineChartOutlined, WalletOutlined,
  AccountBookOutlined, UsergroupAddOutlined, MonitorOutlined,
  ShareAltOutlined, SettingOutlined, ClockCircleOutlined, HistoryOutlined,
  FileSearchOutlined, ScheduleOutlined, SolutionOutlined, CreditCardOutlined,
  NodeIndexOutlined, DiffOutlined, ReadOutlined, ClusterOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../context/AuthContext";
import type { PermEntry } from "../../context/AuthContext";

interface NavItem {
  name: string;
  path: string;
  icon: ReactNode;
  moduleId: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// ── Nav definitions ────────────────────────────────────────────────────────────
const ADMIN_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard",     path: "/dashboard",     icon: <LayoutOutlined />,       moduleId: "dashboard" },
      { name: "MIS Dashboard", path: "/sla-dashboard",  icon: <ClockCircleOutlined />,  moduleId: "sla-dashboard" },
      { name: "Projects",      path: "/projects",      icon: <ApartmentOutlined />,    moduleId: "projects" },
    ],
  },
  {
    // Work Orders itself carries the Execution/Professional Services toggle
    // (contractTypeFilter, on the page) — no separate nav item or group split
    // for that distinction here.
    label: "Operations",
    items: [
      { name: "Contractors",   path: "/contractors",   icon: <TeamOutlined />,         moduleId: "contractors" },
      { name: "Vendor Groups", path: "/vendor-groups", icon: <ClusterOutlined />,      moduleId: "vendor-groups" },
      { name: "Consultants",   path: "/consultants",   icon: <ReadOutlined />,         moduleId: "consultants" },
      { name: "Work Orders",   path: "/work-items",    icon: <FileTextOutlined />, moduleId: "work-orders" },
      { name: "Quotation Comparison", path: "/quotation-comparison", icon: <DiffOutlined />, moduleId: "quotation-comparison" },
      { name: "Work Progress", path: "/work-progress", icon: <LineChartOutlined />, moduleId: "work-progress" },
      { name: "Daily Project Report", path: "/daily-project-report", icon: <ScheduleOutlined />, moduleId: "daily-project-report" },
      { name: "Daily Labour Report", path: "/daily-labour-report", icon: <SolutionOutlined />, moduleId: "daily-labour-report" },
    ],
  },
  {
    label: "Billing",
    items: [
      { name: "Site Progress",      path: "/site-progress",    icon: <FileSearchOutlined />,   moduleId: "bill-review" },
      { name: "Billing",            path: "/billing",          icon: <CreditCardOutlined />,   moduleId: "billing" },
      { name: "Accounts Payment",   path: "/accounts-payment", icon: <WalletOutlined />,       moduleId: "accounts-payment" },
      { name: "Procurement Tracker", path: "/procurement-tracker", icon: <NodeIndexOutlined />, moduleId: "procurement-tracker" },
      { name: "Ledger",             path: "/ledger",           icon: <AccountBookOutlined />,  moduleId: "ledger" },
      { name: "Advance Payments",   path: "/advance-payments", icon: <BankOutlined />,         moduleId: "advance-payments" },
    ],
  },
  {
    label: "Admin",
    items: [
      { name: "Companies",          path: "/companies",     icon: <BankOutlined />,           moduleId: "companies" },
      { name: "Categories",         path: "/categories",    icon: <TagsOutlined />,           moduleId: "categories" },
      { name: "DRI Work Dashboard", path: "/dri-dashboard", icon: <MonitorOutlined />,        moduleId: "dri-dashboard" },
      { name: "Public Forms",       path: "/public-forms",  icon: <ShareAltOutlined />,        moduleId: "public-forms" },
      { name: "Audit Logs",         path: "/audit-logs",    icon: <HistoryOutlined />,         moduleId: "audit-logs" },
      { name: "Users",              path: "/users",         icon: <UsergroupAddOutlined />,   moduleId: "user-management" },
      { name: "SLA Settings",       path: "/sla-settings",  icon: <SettingOutlined />,         moduleId: "sla-settings" },
    ],
  },
];

const DRI_OWN_ITEMS: NavItem[] = [
  { name: "Project Wise Progress", path: "/work-progress", icon: <LineChartOutlined />, moduleId: "work-progress" },
  { name: "Daily Project Report", path: "/daily-project-report", icon: <ScheduleOutlined />, moduleId: "daily-project-report" },
  { name: "Daily Labour Report", path: "/daily-labour-report", icon: <SolutionOutlined />, moduleId: "daily-labour-report" },
];

// ── Permission helpers ─────────────────────────────────────────────────────────
// Owner always sees every module regardless of what's in their stored permissions
// array — otherwise a newly-added module (like Accounts Payment) stays invisible to
// existing Owner accounts until someone remembers to backfill their permissions,
// even though the backend already lets Owner bypass every authorizeOr check.
function canView(moduleId: string, perms: PermEntry[] | undefined, role?: string): boolean {
  if (role === "owner") return true;
  if (!perms || perms.length === 0) return true;
  const entry = perms.find(p => p.module === moduleId);
  return entry ? entry.actions.includes("view") : false;
}

// First module (in sidebar order) this user is actually permitted to view — used as
// the post-login landing route instead of hardcoding /dashboard for everyone, since a
// user without explicit dashboard access would otherwise land on a page not in their
// own sidebar.
export function getDefaultPath(perms: PermEntry[] | undefined, role?: string): string {
  for (const group of ADMIN_GROUPS) {
    for (const item of group.items) {
      if (canView(item.moduleId, perms, role)) return item.path;
    }
  }
  return "/dashboard";
}

// DRI-specific: only show admin modules where permission is explicitly granted
function canViewExplicit(moduleId: string, perms: PermEntry[]): boolean {
  const entry = perms.find(p => p.module === moduleId);
  return entry ? entry.actions.includes("view") : false;
}

// Build the sidebar groups for a DRI user
function buildDRIGroups(perms: PermEntry[] | undefined): NavGroup[] {
  const hasExplicit = perms && perms.length > 0;

  // My Work items are baseline DRI capabilities — always shown, never gated
  // behind the permission checklist. (canView's fallback only defaults to
  // "visible" when a user has *zero* permission entries at all — the moment
  // any unrelated module gets explicitly granted to them, that same fallback
  // starts requiring an explicit "view" entry for every module, which would
  // silently hide these core items too if they went through canView.)
  const groups: NavGroup[] = [{ label: "My Work", items: DRI_OWN_ITEMS }];

  // Admin modules where admin has explicitly granted DRI "view" access
  if (hasExplicit) {
    ADMIN_GROUPS.forEach(group => {
      // Skip items already in My Work
      const extras = group.items.filter(item =>
        item.moduleId !== "dashboard" &&
        item.moduleId !== "work-progress" &&
        item.moduleId !== "daily-project-report" &&
        item.moduleId !== "daily-labour-report" &&
        item.moduleId !== "dri-dashboard" &&
        canViewExplicit(item.moduleId, perms!)
      );
      if (extras.length > 0) groups.push({ label: group.label, items: extras });
    });
  }

  return groups;
}

// ── Sidebar component ──────────────────────────────────────────────────────────
export default function Sidebar() {
  const { user } = useAuth();
  const isDRI  = user?.role === "site-dri";
  const perms  = user?.permissions;

  const rawGroups = isDRI
    ? buildDRIGroups(perms)
    : ADMIN_GROUPS
        .map(g => ({ ...g, items: g.items.filter(item => canView(item.moduleId, perms, user?.role)) }))
        .filter(g => g.items.length > 0);

  return (
    <div
      style={{
        width: 260,
        background: "var(--nx-sidebar-bg)",
        borderRight: "1px solid var(--nx-sidebar-border)",
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        flexShrink: 0,
        boxShadow: "2px 0 8px rgba(0,0,0,0.04)",
      }}
    >
      {/* ── Logo / Brand ── */}
      <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid var(--nx-sidebar-logo-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40, height: 40,
              background: "linear-gradient(135deg, #FF7A00 0%, #FF9A3C 100%)",
              borderRadius: 11,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 900, fontSize: 20, color: "#fff",
              boxShadow: "0 2px 8px rgba(255,122,0,0.35)",
              flexShrink: 0,
              letterSpacing: "-1px",
            }}
          >
            N
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--nx-sidebar-brand-color)", lineHeight: 1.2 }}>
              Nexora ERP
            </div>
            <div style={{ fontSize: 12, color: "var(--nx-sidebar-sub-color)", marginTop: 2, lineHeight: 1.2 }}>
              {isDRI ? "Site Progress Portal" : "Project Cost Center"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Nav Groups ── */}
      <div style={{ flex: 1, padding: "6px 0 10px" }}>
        {rawGroups.map((group, gi) => (
          <div key={group.label} style={{ marginTop: gi === 0 ? 4 : 0 }}>
            {/* Group label */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--nx-sidebar-group-color)",
                textTransform: "uppercase",
                letterSpacing: "0.09em",
                padding: gi === 0 ? "10px 20px 5px" : "18px 20px 5px",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  flex: 1,
                  height: 1,
                  background: "var(--nx-sidebar-group-line)",
                  display: "block",
                  maxWidth: 16,
                }}
              />
              {group.label}
            </div>

            {/* Nav items */}
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                style={{ textDecoration: "none", display: "block" }}
              >
                {({ isActive }) => (
                  <div className={`nx-nav-item${isActive ? " nx-nav-item--active" : ""}`}>
                    <span className="nx-nav-icon">{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.name}</span>
                    {isActive && (
                      <span
                        style={{
                          width: 6, height: 6,
                          borderRadius: "50%",
                          background: "#FF7A00",
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
