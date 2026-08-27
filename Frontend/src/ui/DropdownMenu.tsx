import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface DropdownMenuItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
  // Tooltip explaining why an item is disabled (e.g. "Locked — unlock to edit").
  title?: string;
  onClick: () => void;
}

interface DropdownMenuProps {
  items: DropdownMenuItem[];
  trigger?: ReactNode;
}

// Row-action popover menu — antd's <Dropdown menu={{items}}> replacement.
// Renders via a portal at fixed viewport coordinates (see the comment on
// the effect below) so it's never clipped by a scrollable ancestor, e.g. a
// table's own horizontal-scroll wrapper.
const MENU_WIDTH = 180;
// The app's sticky Header (see layouts/Header/Header.tsx: mt-3 + top-3 +
// h-16) occupies roughly this much space at the top of every page — never
// place the menu above this line, so it can't render over/behind the header.
const HEADER_CLEARANCE = 90;

export default function DropdownMenu({ items, trigger }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  // Screen (viewport) coordinates for the portal-rendered menu below — since
  // it renders into document.body (not as a DOM descendant of the trigger),
  // it needs its own fixed position rather than relying on a relative parent.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Recomputes pos from the trigger button's CURRENT on-screen position —
  // shared by the initial open and by the scroll/resize tracking below, so
  // the menu always reflects where the button actually is right now.
  function computePos() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return null;
    // Estimated menu height (each item row ≈36px + the menu's own py-1
    // padding) — used only to decide whether it should flip upward, since
    // the real height isn't known until after it's rendered.
    const estHeight = items.length * 36 + 8;
    const openUp = window.innerHeight - rect.bottom < estHeight + 12 && rect.top - estHeight - 4 > HEADER_CLEARANCE;
    // Right-aligned to the button (its own right edge = the button's right
    // edge) — this is a row-action trigger, almost always the rightmost
    // thing in its row/column, so right-aligning keeps the menu over the
    // table instead of overhanging further right. Every edge is then
    // clamped to an 8px viewport margin, so it's always fully visible no
    // matter how close to a corner the button itself is. The top clamp
    // uses HEADER_CLEARANCE (not just 8px) — the app's sticky Header sits
    // ~88px tall at the top of every page, and flipping upward for a
    // button that's just below it (but not below HEADER_CLEARANCE) would
    // otherwise place the menu overlapping the header instead of clearing it.
    return {
      top: Math.min(
        Math.max(HEADER_CLEARANCE, openUp ? rect.top - 8 - estHeight : rect.bottom + 8),
        window.innerHeight - estHeight - 8
      ),
      left: Math.min(Math.max(8, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8),
    };
  }

  // A row-action menu like this routinely sits inside a horizontally
  // scrollable table (Table.tsx's own overflow-x-auto wrapper — which, per
  // the CSS overflow spec, also makes the vertical axis non-`visible`, so an
  // absolutely-positioned child gets silently clipped the moment the row is
  // anywhere near that container's edge). Rendering into a portal at fixed
  // viewport coordinates sidesteps every ancestor's overflow/clipping,
  // regardless of which table or page this is used from.
  //
  // Since it's portaled out of the trigger's own DOM subtree, it also needs
  // to actively track the trigger's position while open — scrolling the
  // table (or the page) moves the button but wouldn't otherwise move this
  // portal, so it'd visually detach from its own "⋮" the moment you scroll.
  // `capture: true` on the scroll listener picks up scrolling on ANY
  // ancestor (the inner table's own scroll box, the page, etc.), not just
  // window-level scroll.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function reposition() {
      const next = computePos();
      if (next) setPos(next);
      else setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function openMenu() {
    setPos(computePos());
    setOpen((o) => !o);
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); openMenu(); }}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        {trigger ?? <MoreHorizontal className="w-4 h-4" />}
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH, zIndex: 9999 }}
          className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg shadow-lg overflow-hidden py-1"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              title={item.title}
              onClick={() => { setOpen(false); item.onClick(); }}
              className={[
                "w-full flex items-center gap-2 px-3 py-2 text-sm text-left disabled:opacity-40 disabled:cursor-not-allowed",
                item.danger ? "text-red-600! hover:bg-red-50 dark:hover:bg-red-500/10" : "text-[#1A1A2E]! dark:text-[#F1F5F9]! hover:bg-gray-50 dark:hover:bg-gray-700/40",
              ].join(" ")}
            >
              {item.icon && <item.icon className="w-3.5 h-3.5 shrink-0" />}
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
