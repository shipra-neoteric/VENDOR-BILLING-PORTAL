import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dropdown, Tooltip, message } from "antd";
import type { MenuProps } from "antd";
import { LogoutOutlined, SwapOutlined, RollbackOutlined } from "@ant-design/icons";
import { useAuth } from "../../context/AuthContext";
import type { AuthUser } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import apiClient from "../../services/apiClient";

// Stashes the Owner's own session while they're impersonating someone else,
// so "Back to Admin" is instant and doesn't need another login.
const ADMIN_SESSION_KEY = "adminSession";

interface SwitchableUser { _id: string; name: string; email: string; role: string; isActive: boolean; }

export default function Header() {
  const { user, token, logout, setSession } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [stashedAdmin, setStashedAdmin] = useState<{ token: string; user: AuthUser } | null>(() => {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const isImpersonating = !!stashedAdmin;
  const canSwitch = user?.role === "owner" || isImpersonating;

  const [switchable, setSwitchable] = useState<SwitchableUser[]>([]);
  useEffect(() => {
    if (!canSwitch) return;
    // While impersonating, the active session's own token may not have
    // user-management access (e.g. an AGM test account) — always list
    // switchable users as the stashed admin, not the current role.
    const authOverride = isImpersonating && stashedAdmin
      ? { headers: { Authorization: `Bearer ${stashedAdmin.token}` } }
      : undefined;
    apiClient.get("/auth/users", authOverride).then(res => setSwitchable(res.data.users ?? [])).catch(() => {});
  }, [canSwitch, isImpersonating, stashedAdmin]);

  const handleLogout = () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    logout();
    navigate("/login", { replace: true });
  };

  async function handleSwitch(targetId: string) {
    try {
      const authHeader = isImpersonating
        ? { Authorization: `Bearer ${stashedAdmin!.token}` }
        : undefined;
      const res = await apiClient.post(
        `/auth/switch/${targetId}`,
        {},
        authHeader ? { headers: authHeader } : undefined
      );
      if (!isImpersonating && token && user) {
        sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ token, user }));
      }
      setSession(res.data.token, res.data.user);
      message.success(`Switched to ${res.data.user.name}`);
      window.location.href = "/";
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err?.response?.data?.message || "Failed to switch account");
    }
  }

  function handleBackToAdmin() {
    if (!stashedAdmin) return;
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setSession(stashedAdmin.token, stashedAdmin.user);
    setStashedAdmin(null);
    window.location.href = "/";
  }

  const initial = user?.name?.[0]?.toUpperCase() ?? "U";

  const otherUsers = switchable
    .filter(u => u.isActive && u._id !== user?.id)
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  const menuItems: MenuProps["items"] = [
    ...(isImpersonating ? [{
      key: "back-to-admin",
      icon: <RollbackOutlined />,
      label: `Back to Admin (${stashedAdmin!.user.name})`,
    }] : []),
    ...(canSwitch && otherUsers.length > 0 ? [{
      key: "switch-account",
      icon: <SwapOutlined />,
      label: "Switch Account",
      children: otherUsers.map(u => ({
        key: `switch-${u._id}`,
        label: (
          <span>
            {u.name} <span style={{ color: "var(--nx-text-2)", textTransform: "capitalize" }}>— {u.role}</span>
          </span>
        ),
      })),
    }] : []),
    ...(isImpersonating || (canSwitch && otherUsers.length > 0) ? [{ type: "divider" as const }] : []),
    { key: "logout", icon: <LogoutOutlined />, label: "Sign out", danger: true },
  ];

  const onMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "logout") handleLogout();
    else if (key === "back-to-admin") handleBackToAdmin();
    else if (key.startsWith("switch-")) handleSwitch(key.replace("switch-", ""));
  };

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
        {isImpersonating && (
          <span style={{ background: "#FFF4E8", border: "1px solid #FED7AA", color: "#FF7A00", fontWeight: 600, fontSize: 11, padding: "4px 10px", borderRadius: 20 }}>
            Viewing as {user?.name}
          </span>
        )}

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
          menu={{ items: menuItems, onClick: onMenuClick }}
          trigger={["click"]}
          placement="bottomRight"
        >
          <div data-testid="user-menu-trigger" style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
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
