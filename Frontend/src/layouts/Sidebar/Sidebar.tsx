import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutOutlined, BankOutlined, ApartmentOutlined, TeamOutlined, TagsOutlined,
  FileTextOutlined, LineChartOutlined, ProfileOutlined, WalletOutlined,
  CheckSquareOutlined, AccountBookOutlined, UsergroupAddOutlined, MonitorOutlined,
  ShareAltOutlined,
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
    items: [{ name: "Dashboard", path: "/dashboard", icon: <LayoutOutlined />, moduleId: "dashboard" }],
  },
  {
    label: "Project Setup",
    items: [
      { name: "Companies",   path: "/companies",   icon: <BankOutlined />,       moduleId: "companies" },
      { name: "Projects",    path: "/projects",    icon: <ApartmentOutlined />,  moduleId: "projects" },
      { name: "Contractors", path: "/contractors", icon: <TeamOutlined />,       moduleId: "contractors" },
      { name: "Categories",  path: "/categories",  icon: <TagsOutlined />,       moduleId: "categories" },
    ],
  },
  {
    label: "Execution",
    items: [
      { name: "Work Orders",   path: "/work-items",    icon: <FileTextOutlined />, moduleId: "work-orders" },
      { name: "Work Progress", path: "/work-progress", icon: <LineChartOutlined />, moduleId: "work-progress" },
    ],
  },
  {
    label: "Billing",
    items: [
      { name: "Bill Requests",      path: "/bill-requests",    icon: <ProfileOutlined />,      moduleId: "bill-requests" },
      { name: "Advance Payments",   path: "/advance-payments", icon: <BankOutlined />,         moduleId: "advance-payments" },
      { name: "Billing & Payments", path: "/bills",            icon: <WalletOutlined />,        moduleId: "billing-payments" },
      { name: "Approvals",          path: "/approvals",     icon: <CheckSquareOutlined />,   moduleId: "approvals" },
      { name: "Ledger",             path: "/ledger",        icon: <AccountBookOutlined />,   moduleId: "ledger" },
    ],
  },
  {
    label: "Admin",
    items: [
      { name: "User Management",    path: "/users",         icon: <UsergroupAddOutlined />, moduleId: "user-management" },
      { name: "DRI Work Dashboard", path: "/dri-dashboard", icon: <MonitorOutlined />,      moduleId: "dri-dashboard" },
      { name: "Public Forms",       path: "/public-forms",  icon: <ShareAltOutlined />,      moduleId: "public-forms" },
    ],
  },
];

const DRI_OWN_ITEMS: NavItem[] = [
  { name: "Project Wise Progress", path: "/work-progress", icon: <LineChartOutlined />, moduleId: "work-progress" },
];

// ── Permission helpers ─────────────────────────────────────────────────────────
function canView(moduleId: string, perms: PermEntry[] | undefined): boolean {
  if (!perms || perms.length === 0) return true;
  const entry = perms.find(p => p.module === moduleId);
  return entry ? entry.actions.includes("view") : false;
}

// DRI-specific: only show admin modules where permission is explicitly granted
function canViewExplicit(moduleId: string, perms: PermEntry[]): boolean {
  const entry = perms.find(p => p.module === moduleId);
  return entry ? entry.actions.includes("view") : false;
}

// Build the sidebar groups for a DRI user
function buildDRIGroups(perms: PermEntry[] | undefined): NavGroup[] {
  const hasExplicit = perms && perms.length > 0;

  // My Work items — always use standard canView logic
  const myWorkItems = DRI_OWN_ITEMS.filter(item => canView(item.moduleId, perms));

  const groups: NavGroup[] = [];
  if (myWorkItems.length > 0) groups.push({ label: "My Work", items: myWorkItems });

  // Admin modules where admin has explicitly granted DRI "view" access
  if (hasExplicit) {
    ADMIN_GROUPS.forEach(group => {
      // Skip items already in My Work
      const extras = group.items.filter(item =>
        item.moduleId !== "dashboard" &&
        item.moduleId !== "work-progress" &&
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
  const isDRI  = user?.role === "dri";
  const perms  = user?.permissions;

  const rawGroups = isDRI
    ? buildDRIGroups(perms)
    : ADMIN_GROUPS
        .map(g => ({ ...g, items: g.items.filter(item => canView(item.moduleId, perms)) }))
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
