import { create } from "zustand";

// Real, dynamic brand-color mechanism matching Nexora's getThemeColor()
// pattern — separate from useThemeStore (dark/light mode). Backed by plain
// runtime CSS variables (see index.css's ":root { --theme-primary: ... }"
// block), not Tailwind's static @theme, so it can change with no rebuild.
//
// This app has no natural "current company" scope the way a multi-tenant
// app would (Project Cost Center serves one organization), so for this
// pilot the color is a single app-wide setting rather than resolved per
// record — a deliberate simplification, not a shortcut around the real
// mechanism. Swapping in a per-record source later only means changing
// where setThemeColor() gets called from, not this store's shape.
const STORAGE_KEY = "nx-theme-color";
const DEFAULT_COLOR = "#FF7A00";

function shade(hex: string, percent: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 0xff) + Math.round(255 * percent)));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + Math.round(255 * percent)));
  const b = Math.min(255, Math.max(0, (n & 0xff) + Math.round(255 * percent)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function applyThemeColor(hex: string) {
  const root = document.documentElement.style;
  root.setProperty("--theme-primary", hex);
  root.setProperty("--theme-primary-light", shade(hex, 0.22));
  root.setProperty("--theme-primary-dark", shade(hex, -0.1));
}

interface ThemeColorState {
  themeColor: string;
  getThemeColor: () => string;
  setThemeColor: (hex: string) => void;
}

const initialColor =
  (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) || DEFAULT_COLOR;
if (typeof document !== "undefined") applyThemeColor(initialColor);

export const useThemeColorStore = create<ThemeColorState>((set, get) => ({
  themeColor: initialColor,
  getThemeColor: () => get().themeColor,
  setThemeColor: (hex: string) => {
    applyThemeColor(hex);
    localStorage.setItem(STORAGE_KEY, hex);
    set({ themeColor: hex });
  },
}));
