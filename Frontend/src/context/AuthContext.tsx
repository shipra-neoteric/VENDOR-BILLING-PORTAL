import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import apiClient from "../services/apiClient";

export interface PermEntry {
  module: string;
  actions: string[];
}

interface AuthUser {
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
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem("token"));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const u = sessionStorage.getItem("user");
    return u ? JSON.parse(u) : null;
  });

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await apiClient.post("/auth/login", { email, password });
    sessionStorage.setItem("token", data.token);
    sessionStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
