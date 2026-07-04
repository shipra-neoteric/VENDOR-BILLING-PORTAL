import { useNavigate } from "react-router-dom";
import { Dropdown, Tooltip } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

export default function Header() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const initial = user?.name?.[0]?.toUpperCase() ?? "U";

  return (
    <div
      style={{
        height: 64,
        background: "var(--nx-header-bg)",
        borderBottom: "1px solid var(--nx-border)",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Left: Logo + Module name */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            background: "#FF7A00",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 15,
            color: "#fff",
            letterSpacing: "-0.5px",
          }}
        >
          N
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--nx-text)", lineHeight: 1.2 }}>
            Neoteric Properties
          </div>
          <div style={{ fontSize: 11, color: "var(--nx-text-2)", lineHeight: 1.2 }}>
            Project Cost Center
          </div>
        </div>
      </div>

      {/* Right: Theme toggle + User */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Dark / light toggle */}
        <Tooltip title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
          <button
            onClick={toggleTheme}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: "1px solid var(--nx-border)",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              transition: "background 0.15s ease, border-color 0.15s ease",
            }}
          >
            {isDark ? "☀️" : "🌙"}
          </button>
        </Tooltip>

        {/* User dropdown */}
        <Dropdown
          menu={{
            items: [{ key: "logout", icon: <LogoutOutlined />, label: "Sign out", danger: true }],
            onClick: ({ key }) => key === "logout" && handleLogout(),
          }}
          trigger={["click"]}
          placement="bottomRight"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--nx-text)", lineHeight: 1.2 }}>
                {user?.name || "User"}
              </div>
              <div style={{ fontSize: 11, color: "var(--nx-text-2)", lineHeight: 1.2, textTransform: "capitalize" }}>
                {user?.role || ""}
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #FF7A00 0%, #FF9A3C 100%)",
                boxShadow: "0 2px 6px rgba(255,122,0,0.35)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              {initial}
            </div>
          </div>
        </Dropdown>
      </div>
    </div>
  );
}
