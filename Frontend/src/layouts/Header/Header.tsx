import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dropdown, message } from "antd";
import { LogOut, ArrowLeftRight, Undo2, Menu } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import type { AuthUser } from "../../context/AuthContext";
import apiClient from "../../services/apiClient";
import { useIsMobile } from "../../hooks/useIsMobile";
import ThemeToggle from "../../ui/ThemeToggle";

// Stashes the Owner's own session while they're impersonating someone else,
// so "Back to Admin" is instant and doesn't need another login.
const ADMIN_SESSION_KEY = "adminSession";

interface SwitchableUser { _id: string; name: string; email: string; role: string; isActive: boolean; }

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const { user, token, logout, setSession } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [stashedAdmin, setStashedAdmin] = useState<{ token: string; user: AuthUser } | null>(() => {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const isImpersonating = !!stashedAdmin;
  const canSwitch = user?.role === "owner" || isImpersonating;

  const [switchable, setSwitchable] = useState<SwitchableUser[]>([]);
  // While impersonating, the active session's own token may not have
  // user-management access (e.g. an AGM test account) — always list
  // switchable users as the stashed admin, not the current role.
  function loadSwitchable() {
    if (!canSwitch) return;
    const authOverride = isImpersonating && stashedAdmin
      ? { headers: { Authorization: `Bearer ${stashedAdmin.token}` } }
      : undefined;
    apiClient.get("/auth/users", authOverride).then(res => setSwitchable(res.data.users ?? [])).catch(() => {});
  }
  useEffect(loadSwitchable, [canSwitch, isImpersonating, stashedAdmin]);

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

  // Built by hand (not antd Menu's `children` submenu) because that
  // submenu renders as its own popup portal that a className scoped to the
  // Dropdown never reaches — with dozens of users it ran off the bottom of
  // the screen with no way to scroll it back into view.
  const rowClass = "flex items-center gap-2.5 w-full text-left px-3 py-2 text-[13px] rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors";

  return (
    <div
      className="mt-3 mx-3 px-3 md:px-6 h-16 rounded-xl bg-white/80 dark:bg-gray-800/90 backdrop-blur-md shadow-sm border border-gray-200/50 dark:border-gray-700/50 flex items-center justify-between sticky top-3 z-[100]"
    >
      {/* Left: Hamburger (collapses the sidebar on any screen size) + Logo + Module name */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle menu"
          className="w-9 h-9 rounded-lg border border-gray-200/70 dark:border-gray-700/50 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors shrink-0"
        >
          <Menu className="w-4.5 h-4.5" />
        </button>
        <div
          style={{
            width: 36,
            height: 36,
            background: "#fff",
            border: "1px solid var(--nx-border)",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            padding: 5,
          }}
        >
          <img src="/neoteric-logo.png" alt="Neoteric" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        {!isMobile && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--nx-text)", lineHeight: 1.2, whiteSpace: "nowrap" }}>
              Neoteric Properties
            </div>
            <div style={{ fontSize: 11, color: "var(--nx-text-2)", lineHeight: 1.2, whiteSpace: "nowrap" }}>
              Project Cost Center
            </div>
          </div>
        )}
      </div>

      {/* Right: Theme toggle + User */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {isImpersonating && !isMobile && (
          <span style={{ background: "var(--nx-orange-50)", border: "1px solid #FED7AA", color: "var(--nx-orange)", fontWeight: 600, fontSize: 11, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
            Viewing as {user?.name}
          </span>
        )}

        {/* Dark / light toggle */}
        <ThemeToggle />

        {/* User dropdown */}
        <Dropdown
          trigger={["click"]}
          placement="bottomRight"
          onOpenChange={(open) => { if (open) loadSwitchable(); }}
          popupRender={() => (
            <div className="min-w-[240px] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700/50 p-1.5">
              {isImpersonating && (
                <>
                  <button type="button" className={rowClass} onClick={handleBackToAdmin}>
                    <Undo2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">Back to Admin ({stashedAdmin!.user.name})</span>
                  </button>
                  <div className="my-1 border-t border-gray-200 dark:border-gray-700/50" />
                </>
              )}
              {canSwitch && otherUsers.length > 0 && (
                <>
                  <div className="flex items-center gap-2.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                    <ArrowLeftRight className="w-3.5 h-3.5" /> Switch Account
                  </div>
                  <div className="max-h-[320px] overflow-y-auto">
                    {otherUsers.map(u => (
                      <button key={u._id} type="button" className={rowClass} onClick={() => handleSwitch(u._id)}>
                        <span className="truncate">
                          {u.name} <span className="capitalize" style={{ color: "var(--nx-text-2)" }}>— {u.role}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="my-1 border-t border-gray-200 dark:border-gray-700/50" />
                </>
              )}
              <button type="button" className={`${rowClass} text-red-600 dark:text-red-400`} onClick={handleLogout}>
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Sign out</span>
              </button>
            </div>
          )}
        >
          <div data-testid="user-menu-trigger" style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            {!isMobile && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--nx-text)", lineHeight: 1.2 }}>
                  {user?.name || "User"}
                </div>
                <div style={{ fontSize: 11, color: "var(--nx-text-2)", lineHeight: 1.2, textTransform: "capitalize" }}>
                  {user?.role || ""}
                </div>
              </div>
            )}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "linear-gradient(135deg, var(--nx-orange) 0%, var(--color-primary-light) 100%)",
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
