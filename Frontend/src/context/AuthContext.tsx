import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import apiClient from "../services/apiClient";
import { clearExecutiveDashboardCache } from "../features/dashboard/reportCache";

export interface PermEntry {
  module: string;
  actions: string[];
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  vendorCode?: string;
  permissions?: PermEntry[];
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  // Applies an already-issued token/user pair directly, without calling the
  // login API — used by the Owner "switch account" feature, which mints a
  // session for another user via a dedicated backend endpoint.
  setSession: (token: string, user: AuthUser) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // localStorage, not sessionStorage — a session needs to be visible to a
  // freshly-opened tab (e.g. a Slack "View & Decide" link), not just the tab
  // that logged in.
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const u = localStorage.getItem("user");
    return u ? JSON.parse(u) : null;
  });

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await apiClient.post("/auth/login", { email, password });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    clearExecutiveDashboardCache(); // the next person to sign in on this tab must not see this user's report
    setToken(null);
    setUser(null);
  }, []);

  const setSession = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
    clearExecutiveDashboardCache();
    setToken(newToken);
    setUser(newUser);
  }, []);

  // The role and permissions saved at login go stale the moment an admin changes them in the Permission Matrix (buttons for things the user
  // can no longer do would keep showing until they signed in again). So when the app opens with a saved session, ask the server for the
  // current ones — the same merged role + own permissions the server itself checks — and keep the rest of the saved user as it is.
  useEffect(() => {
    if (!token) return;
    let live = true;
    apiClient.get("/auth/me")
      .then((res) => {
        const fresh = res.data?.user;
        if (!live || !fresh || !Array.isArray(fresh.permissions)) return;
        setUser((prev) => {
          if (!prev) return prev;
          const next = { ...prev, role: fresh.role ?? prev.role, permissions: fresh.permissions };
          localStorage.setItem("user", JSON.stringify(next));
          return next;
        });
      })
      .catch(() => { /* offline / expired: keep what is saved (a 401 is handled by the API client) */ });
    return () => { live = false; };
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, setSession, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
