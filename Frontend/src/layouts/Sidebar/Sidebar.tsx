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
      { name: "Projects",    path: "/projects",    icon: "🏗" },
      { name: "Contractors", path: "/contractors", icon: "👷" },
      { name: "Categories",  path: "/categories",  icon: "🏷️" },
    ],
  },
  {
    label: "Execution",
    items: [
      { name: "Work Orders",    path: "/work-items",    icon: "📋" },
      { name: "Work Progress",  path: "/work-progress", icon: "📊" },
    ],
  },
  {
    label: "Billing",
    items: [
      { name: "Bill Requests",     path: "/bill-requests", icon: "📨" },
      { name: "Billing & Payments",path: "/bills",          icon: "💳" },
      { name: "Approvals",         path: "/approvals",      icon: "✅" },
      { name: "Ledger",            path: "/ledger",         icon: "📒" },
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
  const isDRI    = user?.role === "dri";
  const groups   = isDRI ? DRI_GROUPS : ADMIN_GROUPS;

  return (
    <div
      style={{
        width: 240,
        background: "#fff",
        borderRight: "1px solid #E5E7EB",
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #F3F4F6" }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>Nexora ERP</div>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
          {isDRI ? "Site Progress Portal" : "Vendor Billing Module"}
        </div>
      </div>

      <div style={{ flex: 1, padding: "8px 0" }}>
        {groups.map((group) => (
          <div key={group.label}>
            <div
              style={{
                fontSize: 10, fontWeight: 700, color: "#9CA3AF",
                textTransform: "uppercase", letterSpacing: "0.08em",
                padding: "14px 20px 6px",
              }}
            >
              {group.label}
            </div>
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                style={({ isActive }) => ({
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 20px", margin: "1px 8px", borderRadius: 8,
                  textDecoration: "none", fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#FF7A00" : "#374151",
                  background: isActive ? "#FFF4E8" : "transparent",
                  borderLeft: isActive ? "3px solid #FF7A00" : "3px solid transparent",
                  transition: "all 0.15s",
                })}
              >
                <span style={{ fontSize: 14, lineHeight: 1 }}>{item.icon}</span>
                {item.name}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div style={{ padding: "14px 20px", borderTop: "1px solid #F3F4F6", fontSize: 11, color: "#9CA3AF" }}>
        {user?.name} · {isDRI ? "Site Engineer" : user?.role}
      </div>
    </div>
  );
}
