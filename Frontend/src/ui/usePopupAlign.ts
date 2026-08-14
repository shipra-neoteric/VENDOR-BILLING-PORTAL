import { useState } from "react";
import type { RefObject } from "react";

// Decides whether a popup anchored under a trigger should hang from the
// trigger's left edge (default) or its right edge, based on whether the
// popup's width would run past the viewport's right edge from the left
// position — e.g. the right-hand field in a two-column form row docked
// near the right side of the screen (a right-side drawer's second column).
export function usePopupAlign() {
  const [align, setAlign] = useState<"left" | "right">("left");

  function measure(triggerRef: RefObject<HTMLElement | null>, popupWidth: number) {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) { setAlign("left"); return; }
    const overflowsRight = rect.left + popupWidth > window.innerWidth - 12;
    setAlign(overflowsRight ? "right" : "left");
  }

  return { align, measure };
}
