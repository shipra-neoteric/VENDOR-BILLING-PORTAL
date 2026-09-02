import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import apiClient from "../services/apiClient";

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
    setToken(null);
    setUser(null);
  }, []);

  const setSession = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

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
