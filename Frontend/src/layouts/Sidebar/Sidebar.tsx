import { NavLink } from "react-router-dom";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [{ name: "Dashboard", path: "/dashboard", icon: "▦" }],
  },
  {
    label: "Project Setup",
    items: [
      { name: "Projects", path: "/projects", icon: "🏗" },
      { name: "Contractors", path: "/contractors", icon: "👷" },
    ],
  },
  {
    label: "Execution",
    items: [
      { name: "Work Orders", path: "/work-items", icon: "📋" },
      { name: "Work Progress", path: "/work-progress", icon: "📊" },
    ],
  },
  {
    label: "Billing",
    items: [
      { name: "Billing & Payments", path: "/bills", icon: "💳" },
      { name: "Approvals", path: "/approvals", icon: "✅" },
      { name: "Ledger", path: "/ledger", icon: "📒" },
    ],
  },
];

export default function Sidebar() {
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
      {/* Logo area */}
      <div
        style={{
          padding: "18px 20px 14px",
          borderBottom: "1px solid #F3F4F6",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>
          Nexora ERP
        </div>
        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
          Vendor Billing Module
        </div>
      </div>

      {/* Nav groups */}
      <div style={{ flex: 1, padding: "8px 0" }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {/* Section label */}
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#9CA3AF",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "14px 20px 6px",
              }}
            >
              {group.label}
            </div>

            {/* Items */}
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 20px",
                  margin: "1px 8px",
                  borderRadius: 8,
                  textDecoration: "none",
                  fontSize: 13,
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

      {/* Footer */}
      <div
        style={{
          padding: "14px 20px",
          borderTop: "1px solid #F3F4F6",
          fontSize: 11,
          color: "#9CA3AF",
        }}
      >
        Neoteric Group · pc4@neotericgrp.in
      </div>
    </div>
  );
}
