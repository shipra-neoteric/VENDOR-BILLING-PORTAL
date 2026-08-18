import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useIsMobile } from "../../hooks/useIsMobile";
import {
  LayoutDashboard, Landmark, Building2, Users, Tags,
  FileText, LineChart, Wallet,
  BookOpen, UserPlus, Monitor,
  Share2, Settings, Clock, History,
  FileSearch, CalendarClock, CreditCard,
  Workflow, GitCompare, Ruler, Network, PenLine, Database,
} from "lucide-react";
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
      { name: "Dashboard",     path: "/dashboard",     icon: <LayoutDashboard className="w-4 h-4" />, moduleId: "dashboard" },
      { name: "MIS Dashboard", path: "/sla-dashboard",  icon: <Clock className="w-4 h-4" />,  moduleId: "sla-dashboard" },
      { name: "Projects",      path: "/projects",      icon: <Building2 className="w-4 h-4" />,    moduleId: "projects" },
    ],
  },
  {
    // Construction/site work — measured quantities, day-to-day progress,
    // drawing requests. "Work Orders" here is pre-filtered to execution via
    // ?type=, same shared list page "Consultancy Orders" below also lands on.
    label: "Execution",
    items: [
      { name: "Contractors",   path: "/contractors",   icon: <Users className="w-4 h-4" />,         moduleId: "contractors" },
      { name: "Vendor Groups", path: "/vendor-groups", icon: <Network className="w-4 h-4" />,      moduleId: "vendor-groups" },
      { name: "Work Orders",   path: "/work-items?type=execution", icon: <FileText className="w-4 h-4" />, moduleId: "work-orders" },
      { name: "Quotation Comparison", path: "/quotation-comparison", icon: <GitCompare className="w-4 h-4" />, moduleId: "quotation-comparison" },
      { name: "Work Progress", path: "/work-progress", icon: <LineChart className="w-4 h-4" />, moduleId: "work-progress" },
      { name: "Daily Progress Report", path: "/daily-progress-report", icon: <CalendarClock className="w-4 h-4" />, moduleId: "daily-progress-report" },
      { name: "Drawing Requests", path: "/drawing-requests", icon: <PenLine className="w-4 h-4" />, moduleId: "drawing-requests" },
    ],
  },
  {
    // Design/consultancy engagements — deliverables and milestone fees, no
    // site measurement. "Consultancy Orders" lands on the same list page as
    // "Work Orders" above, pre-filtered to professional-services via ?type=.
    label: "Professional Services",
    items: [
      { name: "Consultants",        path: "/consultants",   icon: <Ruler className="w-4 h-4" />,     moduleId: "consultants" },
      { name: "Consultancy Orders", path: "/work-items?type=professional-services", icon: <FileText className="w-4 h-4" />, moduleId: "work-orders" },
    ],
  },
  {
    label: "Billing",
    items: [
      { name: "Site Progress",      path: "/site-progress",    icon: <FileSearch className="w-4 h-4" />,   moduleId: "bill-review" },
      { name: "Billing",            path: "/billing",          icon: <CreditCard className="w-4 h-4" />,   moduleId: "billing" },
      { name: "Accounts Payment",   path: "/accounts-payment", icon: <Wallet className="w-4 h-4" />,       moduleId: "accounts-payment" },
      { name: "Procurement Tracker", path: "/procurement-tracker", icon: <Workflow className="w-4 h-4" />, moduleId: "procurement-tracker" },
      { name: "Ledger",             path: "/ledger",           icon: <BookOpen className="w-4 h-4" />,  moduleId: "ledger" },
      { name: "Advance Payments",   path: "/advance-payments", icon: <Landmark className="w-4 h-4" />,         moduleId: "advance-payments" },
    ],
  },
  {
    label: "Admin",
    items: [
      { name: "Companies",          path: "/companies",     icon: <Landmark className="w-4 h-4" />,           moduleId: "companies" },
      { name: "Categories",         path: "/categories",    icon: <Tags className="w-4 h-4" />,           moduleId: "categories" },
      { name: "DRI Work Dashboard", path: "/dri-dashboard", icon: <Monitor className="w-4 h-4" />,        moduleId: "dri-dashboard" },
      { name: "Public Forms",       path: "/public-forms",  icon: <Share2 className="w-4 h-4" />,        moduleId: "public-forms" },
      { name: "Audit Logs",         path: "/audit-logs",    icon: <History className="w-4 h-4" />,         moduleId: "audit-logs" },
      { name: "Users",              path: "/users",         icon: <UserPlus className="w-4 h-4" />,   moduleId: "user-management" },
      { name: "SLA Settings",       path: "/sla-settings",  icon: <Settings className="w-4 h-4" />,         moduleId: "sla-settings" },
      { name: "Backup",             path: "/backup",        icon: <Database className="w-4 h-4" />,         moduleId: "backup" },
    ],
  },
];

const DRI_OWN_ITEMS: NavItem[] = [
  { name: "Dashboard", path: "/dri-home", icon: <LayoutDashboard className="w-4 h-4" />, moduleId: "dashboard" },
  { name: "Project Wise Progress", path: "/work-progress", icon: <LineChart className="w-4 h-4" />, moduleId: "work-progress" },
  { name: "Daily Progress Report", path: "/daily-progress-report", icon: <CalendarClock className="w-4 h-4" />, moduleId: "daily-progress-report" },
];

// ── Permission helpers ─────────────────────────────────────────────────────────
// Owner always sees every module regardless of what's in their stored permissions
// array — otherwise a newly-added module (like Accounts Payment) stays invisible to
// existing Owner accounts until someone remembers to backfill their permissions,
// even though the backend already lets Owner bypass every authorizeOr check.
function canView(moduleId: string, perms: PermEntry[] | undefined, role?: string): boolean {
  // Whole-database export/wipe-and-replace — never leak this to a role that
  // simply hasn't been assigned granular permissions yet (canView's own
  // fallback below treats an empty perms array as "can see everything").
  if (moduleId === "backup") return role === "owner";
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
        item.moduleId !== "daily-progress-report" &&
        item.moduleId !== "dri-dashboard" &&
        canViewExplicit(item.moduleId, perms!)
      );
      if (extras.length > 0) groups.push({ label: group.label, items: extras });
    });
  }

  return groups;
}

interface SidebarProps {
  // Only meaningful below the md breakpoint — desktop always shows the
  // sidebar regardless of this prop. On mobile it's an off-canvas overlay
  // that slides in/out and sits behind a tap-to-close backdrop.
  open?: boolean;
  onClose?: () => void;
}

// ── Sidebar component ──────────────────────────────────────────────────────────
export default function Sidebar({ open = false, onClose }: SidebarProps) {
  const { user } = useAuth();
  const isDRI  = user?.role === "site-dri";
  const perms  = user?.permissions;
  const isMobile = useIsMobile();
  const location = useLocation();

  // NavLink's own isActive match ignores the query string, only comparing
  // pathname — so "Work Orders" and "Consultancy Orders" (both /work-items,
  // different ?type=) would both light up together. Compare the full
  // path+search against each item's own instead.
  const currentPath = location.pathname + location.search;
  function isItemActive(itemPath: string): boolean {
    const [path, query] = itemPath.split("?");
    if (!query) return location.pathname === path;
    return currentPath === `${path}?${query}`;
  }

  const rawGroups = isDRI
    ? buildDRIGroups(perms)
    : ADMIN_GROUPS
        .map(g => ({ ...g, items: g.items.filter(item => canView(item.moduleId, perms, user?.role)) }))
        .filter(g => g.items.length > 0);

  // On desktop, "closed" shrinks to a narrow icon-only rail rather than
  // disappearing outright — same collapse treatment as the reference. Mobile
  // still fully hides (slides off-canvas behind a backdrop), since there a
  // permanent icon rail would eat too much of an already-narrow screen.
  const collapsed = !isMobile && !open;

  return (
    <>
      {/* Tap-to-close backdrop — mobile only, only while the sidebar is open */}
      {isMobile && open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.4)" }}
          onClick={onClose}
        />
      )}
      <div
        data-testid="app-sidebar"
        className="flex flex-col overflow-y-auto overflow-x-hidden flex-shrink-0 bg-white/90 dark:bg-gray-800/95 backdrop-blur-xl border border-gray-100 dark:border-gray-700/50 rounded-xl shadow-sm"
        style={{
          width: isMobile ? 320 : collapsed ? 80 : 256,
          maxWidth: isMobile ? "85vw" : undefined,
          height: "calc(100vh - 24px)",
          transition: isMobile ? "transform 0.2s ease" : "width 0.18s ease",
          ...(isMobile
            ? {
                position: "fixed",
                top: 12,
                left: 12,
                zIndex: 50,
                transform: open ? "translateX(0)" : "translateX(calc(-100% - 24px))",
              }
            : {
                position: "sticky",
                top: 12,
                marginLeft: 12,
              }),
        }}
      >
      {/* ── Logo / Brand ── */}
      <div style={{ padding: collapsed ? "20px 0 16px" : "20px 18px 16px", borderBottom: "1px solid var(--nx-sidebar-logo-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: collapsed ? "center" : "flex-start" }}>
          <div
            style={{
              width: 40, height: 40,
              background: "#fff",
              border: "1px solid var(--nx-sidebar-logo-border)",
              borderRadius: 11,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(255,122,0,0.2)",
              flexShrink: 0,
              padding: 6,
            }}
          >
            <img src="/neoteric-logo.png" alt="Neoteric" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          {!collapsed && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: "var(--nx-sidebar-brand-color)", lineHeight: 1.2, whiteSpace: "nowrap" }}>
                Nexora ERP
              </div>
              <div style={{ fontSize: 12, color: "var(--nx-sidebar-sub-color)", marginTop: 2, lineHeight: 1.2, whiteSpace: "nowrap" }}>
                {isDRI ? "Site Progress Portal" : "Project Cost Center"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Nav Groups ── */}
      <div style={{ flex: 1, padding: "6px 0 10px" }}>
        {rawGroups.map((group, gi) => (
          <div key={group.label} style={{ marginTop: gi === 0 ? 4 : 0 }}>
            {/* Group label — a plain divider line once collapsed, no text (no room for it) */}
            {collapsed ? (
              <div style={{ height: 1, background: "var(--nx-sidebar-group-line)", margin: gi === 0 ? "8px 16px 10px" : "16px 16px 10px" }} />
            ) : (
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
            )}

            {/* Nav items */}
            {group.items.map((item) => {
              const isActive = isItemActive(item.path);
              return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={isMobile ? onClose : undefined}
                title={collapsed ? item.name : undefined}
                style={{ textDecoration: "none", display: "block" }}
              >
                {collapsed ? (
                  <div style={{ display: "flex", justifyContent: "center", margin: "2px 0" }}>
                    <span className={`nx-nav-icon${isActive ? " nx-nav-item--active" : ""}`}>{item.icon}</span>
                  </div>
                ) : (
                  <div className={`nx-nav-item${isActive ? " nx-nav-item--active" : ""}`}>
                    <span className="nx-nav-icon">{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.name}</span>
                    {isActive && (
                      <span
                        style={{
                          width: 6, height: 6,
                          borderRadius: "50%",
                          background: "var(--nx-orange)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                )}
              </NavLink>
              );
            })}
          </div>
        ))}
      </div>
      </div>
    </>
  );
}
