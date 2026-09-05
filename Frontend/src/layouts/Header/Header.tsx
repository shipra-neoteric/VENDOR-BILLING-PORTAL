import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dropdown, message } from "antd";
import { LogOut, ArrowLeftRight, Undo2, Menu, ChevronLeft, Check, Search } from "lucide-react";
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

  const [switchSearch, setSwitchSearch] = useState("");
  const filteredOtherUsers = switchSearch.trim()
    ? otherUsers.filter(u => `${u.name} ${u.role}`.toLowerCase().includes(switchSearch.trim().toLowerCase()))
    : otherUsers;

  // Two-step like the menu it replaces: the main panel just has a "Switch
  // Account" row, which drills into the actual (scrollable) user list —
  // rather than dumping every user into the first screen you see.
  const [switchListOpen, setSwitchListOpen] = useState(false);

  // Built by hand (not antd Menu's `children` submenu) because that
  // submenu renders as its own popup portal that a className scoped to the
  // Dropdown never reaches — with dozens of users it ran off the bottom of
  // the screen with no way to scroll it back into view. Styled to match this
  // app's own DropdownMenu.tsx (row-action menus elsewhere in the app), not
  // antd's default look.
  const rowClass = "flex items-center gap-2.5 w-full text-left px-3 py-2 text-[13px] rounded-md text-[#1A1A2E] dark:text-[#F1F5F9] hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors";

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
          onOpenChange={(open) => { if (open) loadSwitchable(); else { setSwitchListOpen(false); setSwitchSearch(""); } }}
          popupRender={() => (
            <div style={{ position: "relative" }}>
              {/* Main menu — always the same box, in the same place; never
                  replaced in-place by the switch-account list (that grew/
                  shrank the popup's own height, which made antd re-measure
                  and jump the whole thing to a different spot). */}
              <div className="user-menu-panel min-w-[250px] bg-white dark:bg-[#1E293B] rounded-lg shadow-lg border border-gray-200 dark:border-gray-700/40 p-1.5">
                {isImpersonating && (
                  <>
                    <button type="button" className={rowClass} onClick={handleBackToAdmin}>
                      <Undo2 className="w-4 h-4 shrink-0" />
                      <span className="truncate">Back to Admin ({stashedAdmin!.user.name})</span>
                    </button>
                    <div className="my-1 border-t border-gray-200 dark:border-gray-700/40" />
                  </>
                )}
                {canSwitch && otherUsers.length > 0 && (
                  <>
                    <button type="button" className={`${rowClass} justify-between`} onClick={() => setSwitchListOpen((o) => !o)}>
                      <span className="flex items-center gap-2.5">
                        <ArrowLeftRight className="w-4 h-4 shrink-0" /> Switch Account
                      </span>
                      <ChevronLeft className={`w-3.5 h-3.5 shrink-0 transition-colors ${switchListOpen ? "text-primary" : "text-gray-400"}`} />
                    </button>
                    <div className="my-1 border-t border-gray-200 dark:border-gray-700/40" />
                  </>
                )}
                <button type="button" className={`${rowClass} text-red-600! dark:text-red-400!`} onClick={handleLogout}>
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>Sign out</span>
                </button>
              </div>

              {/* Switch-account list — a separate flyout panel touching the
                  main menu's LEFT edge (like a submenu), not swapped into
                  the same box, so opening/closing it never moves or resizes
                  the main menu itself. */}
              {switchListOpen && canSwitch && otherUsers.length > 0 && (
                <div
                  className="user-menu-panel min-w-[220px] bg-white dark:bg-[#1E293B] rounded-lg shadow-lg border border-gray-200 dark:border-gray-700/40 p-1.5"
                  style={{ position: "absolute", top: 0, right: "100%", marginRight: 6 }}
                >
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700/40">
                    <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search…"
                      value={switchSearch}
                      onChange={(e) => setSwitchSearch(e.target.value)}
                      className="w-full text-[13px] bg-transparent outline-none text-[#1A1A2E] dark:text-[#F1F5F9] placeholder:text-gray-400"
                    />
                  </div>
                  <div className="user-menu-scroll py-1" style={{ maxHeight: 280, overflowY: "scroll" }}>
                    {/* The current account, shown first with an orange
                        checkmark — not clickable (you can't "switch" into
                        the session you're already in), just orients this
                        list the same way the "current selection" pattern
                        reads elsewhere in the app (e.g. the project filter).
                        Hidden while searching, same as any other filtered list. */}
                    {user && !switchSearch.trim() && (
                      <div className={`${rowClass} justify-between cursor-default`}>
                        <span className="truncate">
                          {user.name} <span className="capitalize" style={{ color: "var(--nx-text-2)" }}>— {user.role}</span>
                        </span>
                        <Check className="w-4 h-4 shrink-0 text-primary" />
                      </div>
                    )}
                    {filteredOtherUsers.map(u => (
                      <button key={u._id} type="button" className={rowClass} onClick={() => handleSwitch(u._id)}>
                        <span className="truncate">
                          {u.name} <span className="capitalize" style={{ color: "var(--nx-text-2)" }}>— {u.role}</span>
                        </span>
                      </button>
                    ))}
                    {filteredOtherUsers.length === 0 && switchSearch.trim() && (
                      <div className="px-3 py-2 text-[12px] text-gray-400">No matches</div>
                    )}
                  </div>
                </div>
              )}

              {/* A classic always-visible scrollbar (not the OS's auto-hide
                  overlay one) — matches how this looked before, since a
                  hover-only overlay scrollbar reads as "no scrollbar at all"
                  in a short-lived dropdown like this. */}
              <style>{`
                .user-menu-scroll { scrollbar-width: auto; scrollbar-color: #b0b0b0 #f1f1f1; }
                .user-menu-scroll::-webkit-scrollbar { width: 12px; }
                .user-menu-scroll::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 8px; }
                .user-menu-scroll::-webkit-scrollbar-thumb { background: #b0b0b0; border-radius: 8px; border: 2px solid #f1f1f1; }
                .user-menu-scroll::-webkit-scrollbar-thumb:hover { background: #8a8a8a; }
              `}</style>
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
