import { useEffect } from "react";
import type { RefObject } from "react";

// Closes a popover/dropdown on an outside click — the same pattern
// ReportToolbar's own dropdown already used, lifted here so every new
// popover-style component (Calendar-based pickers, TimeRangeSelect) shares
// one implementation instead of re-writing the same mousedown listener.
export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [active, onOutside]);
}
