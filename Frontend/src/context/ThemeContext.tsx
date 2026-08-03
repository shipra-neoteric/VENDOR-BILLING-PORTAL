import type { ReactNode } from "react";
import { useThemeStore } from "../store/themeStore";

// Thin backward-compatible shim — the actual state now lives in
// Frontend/src/store/themeStore.ts (Zustand, no Provider needed). Kept so
// every existing `useTheme()`/`<ThemeProvider>` call site (App.tsx,
// Header.tsx, BillingChart.tsx) needs zero changes during the design-system
// migration.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return children;
}

export function useTheme() {
  const isDark = useThemeStore((s) => s.isDark);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  return { isDark, toggleTheme };
}
