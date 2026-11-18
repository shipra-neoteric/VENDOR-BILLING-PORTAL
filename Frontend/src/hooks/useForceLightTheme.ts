import { useEffect } from "react";

// The no-login public forms have hard-coded light surfaces, but the shared
// ui/ components (Field, SField, Card, Table, ...) follow the saved app theme.
// With a dark theme saved in the browser they render dark inputs and faint
// text on the white page. Force light while the form is mounted and put the
// visitor's own theme back afterwards.
export function useForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    const prevTheme = root.getAttribute("data-theme");
    root.classList.remove("dark");
    root.setAttribute("data-theme", "light");
    return () => {
      if (wasDark) root.classList.add("dark");
      if (prevTheme) root.setAttribute("data-theme", prevTheme);
    };
  }, []);
}
