import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useIsMobile } from "../../hooks/useIsMobile";
import {
  LayoutDashboard,
  FileText, LineChart, Wallet,
  Monitor,
  Clock, History,
  FileSearch, CalendarClock, CreditCard, CheckSquare,
  GitCompare, PenLine, ShieldCheck, Truck,
} from "lucide-react";
import { MASTERS_OVERVIEW_ITEM, isMastersPath } from "./mastersNav";
import { VENDORS_ITEMS, isVendorsPath } from "./vendorsNav";
import { useAuth } from "../../context/AuthContext";
import type { PermEntry } from "../../context/AuthContext";

interface NavItem {
  name: string;
  path: string;
  icon: ReactNode;
  moduleId: string;
  // Renders a small sub-heading directly above this item — for grouping a
  // few related items together inside one group without needing a whole
  // separate top-level NavGroup for just two entries.
  subHeader?: string;
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
      { name: "Dashboard", path: "/dashboard", icon: <LayoutDashboard className="w-4 h-4" />, moduleId: "dashboard" },
      { name: "Final Approval", path: "/md-approvals", icon: <CheckSquare className="w-4 h-4" />, moduleId: "md-approvals" },
      { name: "SLA Report", path: "/sla-dashboard", icon: <Clock className="w-4 h-4" />, moduleId: "sla-dashboard" },
    ],
  },
  {
    // Construction/site work — measured quantities, day-to-day progress,
    // drawing requests. "Work Orders" here is pre-filtered to execution via
    // ?type=, same shared list page "Consultancy Orders" below also lands on.
    label: "Execution",
    items: [
      { name: "Work Orders", path: "/work-items", icon: <FileText className="w-4 h-4" />, moduleId: "work-orders" },
      { name: "Quotation Comparison", path: "/quotation-comparison", icon: <GitCompare className="w-4 h-4" />, moduleId: "quotation-comparison" },
      { name: "Work Progress", path: "/work-progress", icon: <LineChart className="w-4 h-4" />, moduleId: "work-progress" },
      { name: "Daily Progress Report", path: "/daily-progress-report", icon: <CalendarClock className="w-4 h-4" />, moduleId: "daily-progress-report" },
      { name: "Drawing Requests", path: "/drawing-requests", icon: <PenLine className="w-4 h-4" />, moduleId: "drawing-requests" },
    ],
  },
  {
    // Contractors, Consultants and Vendor Groups are no longer separate
    // top-level entries — they're only reachable through this one "Vendors"
    // section entry, which links into the first Vendors page and lights up
    // for all three (see isItemActive's moduleId === "vendors" case). The
    // secondary Vendors panel (VendorsSidebar.tsx, rendered by MainLayout
    // whenever the URL is one of VENDORS_PATHS) is what actually exposes all
    // three pages.
    label: "Vendors",
    items: [
      { name: "Vendors", path: VENDORS_ITEMS[0].path, icon: <Truck className="w-4 h-4" />, moduleId: "vendors" },
    ],
  },
  {
    label: "Finance",
    items: [
      { name: "Site Progress", path: "/site-progress", icon: <FileSearch className="w-4 h-4" />, moduleId: "bill-review" },
      { name: "Bill Approval", path: "/bill-requests", icon: <CheckSquare className="w-4 h-4" />, moduleId: "bill-requests" },
      { name: "Billing", path: "/billing", icon: <CreditCard className="w-4 h-4" />, moduleId: "billing" },
      { name: "Accounts Payment", path: "/accounts-payment", icon: <Wallet className="w-4 h-4" />, moduleId: "accounts-payment" },
    ],
  },
  {
    label: "Admin",
    items: [
      // Links straight into the Masters section's first page — the
      // secondary Masters panel (see MastersSidebar.tsx, rendered by
      // MainLayout whenever the URL is one of MASTERS_PATHS) is what
      // actually exposes Projects/Companies/Categories/Users/SLA/Backup;
      // this single entry just gets an admin into that area. Kept as its
      // own moduleId ("masters") so canView can gate it independently of
      // the underlying pages' own per-module permissions below.
      { name: "DRI Dashboard", path: "/dri-dashboard", icon: <Monitor className="w-4 h-4" />, moduleId: "dri-dashboard" },
      { name: "Masters", path: MASTERS_OVERVIEW_ITEM.path, icon: <ShieldCheck className="w-4 h-4" />, moduleId: "masters" },

      { name: "Audit Logs", path: "/audit-logs", icon: <History className="w-4 h-4" />, moduleId: "audit-logs" },
    ],
  },
];

const DRI_OWN_ITEMS: NavItem[] = [
  { name: "Dashboard", path: "/dri-home", icon: <LayoutDashboard className="w-4 h-4" />, moduleId: "dashboard" },
  { name: "Project Wise Progress", path: "/work-progress", icon: <LineChart className="w-4 h-4" />, moduleId: "work-progress" },
  { name: "Daily Progress Report", path: "/daily-progress-report", icon: <CalendarClock className="w-4 h-4" />, moduleId: "daily-progress-report" },
];

// ── Permission helpers ─────────────────────────────────────────────────────────
const VENDORS_MODULE_IDS = ["contractors", "consultants", "vendor-groups"];

function canView(moduleId: string, perms: PermEntry[] | undefined, role?: string): boolean {
  // Whole-database export/wipe-and-replace — never leak this to a role that
  // simply hasn't been assigned granular permissions yet (canView's own
  // fallback below treats an empty perms array as "can see everything").
  if (moduleId === "backup") return role === "owner";
  // Masters groups together the master-data admin pages (Projects,
  // Companies, Categories, Users, SLA, Backup) — same owner-only gate as
  // Backup above, since there's no separate "admin" role in this app and
  // "owner" is its highest-privilege role.
  if (moduleId === "masters") return role === "owner";
  // "Vendors" is one nav entry standing in for 3 underlying modules
  // (Contractors, Consultants, Vendor Groups) — visible if the user can view
  // ANY of them, same per-module permission checks those pages themselves
  // already enforce; this entry is pure navigation, not a new permission.
  if (moduleId === "vendors") {
    if (!perms || perms.length === 0) return true;
    return VENDORS_MODULE_IDS.some(m => perms.some(p => p.module === m && p.actions.includes("view")));
  }
  // MD Approvals is a cross-cutting aggregator over 3 unrelated modules'
  // final-approval stages (work-orders ceo-approve, bill-requests l4-approve,
  // accounts-payment l2-director-approve) — no single module's own "view"
  // permission fits it, so gate it on the same "holds ANY of those 3" check
  // the backend's own base-access guard uses, instead of canView's generic
  // module+view lookup below.
  if (moduleId === "md-approvals") {
    if (role === "owner") return true;
    return !!perms?.some((p) =>
      (p.module === "work-orders" && p.actions.includes("ceo-approve")) ||
      (p.module === "bill-requests" && p.actions.includes("l4-approve")) ||
      (p.module === "accounts-payment" && p.actions.includes("l2-director-approve"))
    );
  }
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
  if (moduleId === "vendors") {
    return VENDORS_MODULE_IDS.some(m => perms.some(p => p.module === m && p.actions.includes("view")));
  }
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
  const isDRI = user?.role === "site-dri";
  const perms = user?.permissions;
  const isMobile = useIsMobile();
  const location = useLocation();

  // NavLink's own isActive match ignores the query string, only comparing
  // pathname — so "Work Orders" and "Consultancy Orders" (both /work-items,
  // different ?type=) would both light up together. Compare the full
  // path+search against each item's own instead.
  const currentPath = location.pathname + location.search;
  function isItemActive(itemPath: string, moduleId?: string): boolean {
    // "Masters" is a single nav entry that links to the first Masters page
    // (Projects) but represents the whole section — it should stay
    // highlighted while browsing ANY Masters page (Companies, Users, SLA,
    // Backup...), not just the exact link target.
    if (moduleId === "masters") return isMastersPath(location.pathname);
    if (moduleId === "vendors") return isVendorsPath(location.pathname);
    const [path, query] = itemPath.split("?");
    // A bare (no-query) item must not light up while on the SAME pathname
    // but a DIFFERENT query string — "Work Orders" (/work-items) and
    // "Consultancy Orders" (/work-items?type=professional-services) share a
    // pathname, so without the `!location.search` check here, Work Orders
    // would incorrectly show active while actually viewing Consultancy Orders.
    if (!query) return location.pathname === path && !location.search;
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
        className="flex flex-col overflow-hidden flex-shrink-0 bg-white/90 dark:bg-gray-800/95 backdrop-blur-xl border border-gray-100 dark:border-gray-700/50 rounded-xl shadow-sm"
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
        {/* ── Logo / Brand — outside the scrolling nav area below, so it stays
          fixed at the top of the sidebar instead of scrolling away with the
          nav items. ── */}
        <div style={{ flexShrink: 0, padding: collapsed ? "20px 0 16px" : "20px 18px 16px", borderBottom: "1px solid var(--nx-sidebar-logo-border)" }}>
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
                  {isDRI ? "Site Progress Portal" : "Vendor Management System"}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Nav Groups — the only part that scrolls ── */}
        <div className="overflow-y-auto overflow-x-hidden" style={{ flex: 1, padding: "6px 0 10px" }}>
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
                const isActive = isItemActive(item.path, item.moduleId);
                return (
                  <div key={item.path}>
                    {item.subHeader && !collapsed && (
                      <div
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: "var(--nx-sidebar-group-color)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          padding: "10px 20px 3px",
                        }}
                      >
                        {item.subHeader}
                      </div>
                    )}
                    {item.subHeader && collapsed && (
                      <div style={{ height: 1, background: "var(--nx-sidebar-group-line)", margin: "10px 16px 6px" }} />
                    )}
                    <NavLink
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
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
