import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, RotateCcw } from "lucide-react";

// Preset GST slabs cover the common cases, but real invoices sometimes carry a
// rate outside this list (e.g. a composition-scheme rate, or a slab change) —
// "Custom %" switches to a free-entry field instead of forcing the closest preset.
export const GST_PRESETS = [0, 5, 12, 18, 28];

function presetLabel(v: number) {
  if (v === 0) return "0% — Exempt / Nil";
  if (v === 18) return "18% (Standard)";
  return `${v}%`;
}

// Kept as a plain controlled { value, onChange(v) } component — same contract
// as the antd Select it replaces — so it drops straight into every existing
// antd <Form.Item name="gstPercent"> without touching the consuming page.
// Styled like SField/DropdownSelectFilter (button + popup) instead of a
// native <select>, to match the rest of the Nexora-styled form fields.
export default function GstSelect({
  value, onChange, style, className,
}: {
  value?: number;
  onChange?: (v: number) => void;
  style?: React.CSSProperties;
  className?: string;
}) {
  const [customMode, setCustomMode] = useState(value !== undefined && !GST_PRESETS.includes(value));
  const [open, setOpen] = useState(false);
  // Screen (viewport) coordinates for the portal-rendered panel below — this
  // field is routinely used inside a scope-item row list (WorkItems,
  // PublicWorkOrderForm, PaymentMilestonesBuilder) that scrolls its own
  // overflow, which per the CSS overflow spec silently clips any normal
  // absolutely-positioned popup the moment the row is near that container's
  // edge — the "28%"/"Custom %…" options at the bottom of the list were
  // getting cut off invisibly rather than just being scrolled past. Rendering
  // into a portal at fixed viewport coordinates sidesteps that, same pattern
  // as ui/DropdownMenu.tsx.
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function computePos() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const estHeight = (GST_PRESETS.length + 1) * 36 + 8;
    const openUp = window.innerHeight - rect.bottom < estHeight + 12 && rect.top - estHeight - 4 > 0;
    return {
      top: openUp ? Math.max(4, rect.top - 4 - estHeight) : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    };
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function reposition() {
      const next = computePos();
      if (next) setPos(next); else setOpen(false);
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

  function toggleOpen() {
    setPos(computePos());
    setOpen(o => !o);
  }

  const baseClass =
    "w-full h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] " +
    "text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

  if (customMode) {
    return (
      <div className="relative" style={style}>
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={value ?? ""}
          placeholder="Custom %"
          className={`${baseClass} pr-8 ${className ?? ""}`}
          onChange={e => onChange?.(Number(e.target.value) || 0)}
        />
        <button
          type="button"
          title="Back to presets"
          onClick={() => setCustomMode(false)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-primary"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const selectedLabel = value !== undefined && GST_PRESETS.includes(value) ? presetLabel(value) : undefined;

  return (
    <div className="relative" ref={rootRef} style={style}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        className={[
          "flex items-center justify-between gap-2",
          baseClass,
          className ?? "",
        ].join(" ")}
      >
        <span className={["truncate min-w-0", selectedLabel ? "" : "text-gray-400 dark:text-gray-500"].join(" ")}>
          {selectedLabel ?? "Select GST %"}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="max-h-60 overflow-y-auto bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg shadow-lg py-1"
        >
          {GST_PRESETS.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => { onChange?.(v); setOpen(false); }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] text-left text-[#1A1A2E]! dark:text-[#F1F5F9]! hover:bg-gray-50 dark:hover:bg-gray-700/40"
            >
              {presetLabel(v)}
              {v === value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setCustomMode(true); setOpen(false); }}
            className="w-full flex items-center px-3 py-2 text-[13px] text-left text-[#1A1A2E]! dark:text-[#F1F5F9]! hover:bg-gray-50 dark:hover:bg-gray-700/40"
          >
            Custom %…
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
