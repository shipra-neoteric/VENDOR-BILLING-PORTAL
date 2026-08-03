import { create } from "zustand";

// Applies BOTH the legacy `data-theme` attribute (every existing --nx-* CSS
// variable and the antd ConfigProvider dark-mode override still key off this)
// AND the new `.dark` class (Tailwind v4's `dark:` variant, used by the new
// Frontend/src/ui/ component library) — dual-write so nothing existing breaks
// while the app is mid-migration. Phase 3 cleanup can drop the attribute
// once every page reads only the class.
function applyThemeToDocument(isDark: boolean) {
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  document.documentElement.classList.toggle("dark", isDark);
}

interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
}

const initialIsDark = typeof window !== "undefined" && localStorage.getItem("nx-theme") === "dark";
if (typeof document !== "undefined") applyThemeToDocument(initialIsDark);

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: initialIsDark,
  toggleTheme: () => {
    const next = !get().isDark;
    applyThemeToDocument(next);
    localStorage.setItem("nx-theme", next ? "dark" : "light");
    set({ isDark: next });
  },
}));
