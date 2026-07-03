import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const ADMIN_GROUPS = [
  {
    label: "Overview",
    items: [{ name: "Dashboard", path: "/dashboard", icon: "▦" }],
  },
  {
    label: "Project Setup",
    items: [
      { name: "Companies",   path: "/companies",   icon: "🏢" },
      { name: "Projects",    path: "/projects",    icon: "🏗️" },
      { name: "Contractors", path: "/contractors", icon: "👷" },
      { name: "Categories",  path: "/categories",  icon: "🏷️" },
    ],
  },
  {
    label: "Execution",
    items: [
      { name: "Work Orders",   path: "/work-items",    icon: "📋" },
      { name: "Work Progress", path: "/work-progress", icon: "📊" },
    ],
  },
  {
    label: "Billing",
    items: [
      { name: "Bill Requests",      path: "/bill-requests", icon: "📨" },
      { name: "Billing & Payments", path: "/bills",         icon: "💳" },
      { name: "Approvals",          path: "/approvals",     icon: "✅" },
      { name: "Ledger",             path: "/ledger",        icon: "📒" },
    ],
  },
  {
    label: "Admin",
    items: [
      { name: "User Management", path: "/users", icon: "👥" },
    ],
  },
];

const DRI_GROUPS = [
  {
    label: "My Work",
    items: [{ name: "Work Dashboard", path: "/work-progress", icon: "📊" }],
  },
];

export default function Sidebar() {
  const { user } = useAuth();
  const isDRI  = user?.role === "dri";
  const groups = isDRI ? DRI_GROUPS : ADMIN_GROUPS;

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
              {isDRI ? "Site Progress Portal" : "Vendor Billing Module"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Nav Groups ── */}
      <div style={{ flex: 1, padding: "6px 0 10px" }}>
        {groups.map((group, gi) => (
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
