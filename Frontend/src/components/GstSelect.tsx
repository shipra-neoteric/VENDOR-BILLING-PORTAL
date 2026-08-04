import { useState } from "react";
import { RotateCcw } from "lucide-react";

// Preset GST slabs cover the common cases, but real invoices sometimes carry a
// rate outside this list (e.g. a composition-scheme rate, or a slab change) —
// "Custom %" switches to a free-entry field instead of forcing the closest preset.
export const GST_PRESETS = [0, 5, 12, 18, 28];
const CUSTOM_VALUE = "__custom__";

function presetLabel(v: number) {
  if (v === 0) return "0% — Exempt / Nil";
  if (v === 18) return "18% (Standard)";
  return `${v}%`;
}

// Kept as a plain controlled { value, onChange(v) } component — same contract
// as the antd Select it replaces — so it drops straight into every existing
// antd <Form.Item name="gstPercent"> without touching the consuming page.
export default function GstSelect({
  value, onChange, style, className,
}: {
  value?: number;
  onChange?: (v: number) => void;
  style?: React.CSSProperties;
  className?: string;
}) {
  const [customMode, setCustomMode] = useState(value !== undefined && !GST_PRESETS.includes(value));

  const baseClass =
    "w-full h-8 px-2.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#0F172A] text-sm " +
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

  return (
    <select
      value={value !== undefined && GST_PRESETS.includes(value) ? value : ""}
      style={style}
      className={`${baseClass} ${className ?? ""}`}
      onChange={e => {
        if (e.target.value === CUSTOM_VALUE) { setCustomMode(true); return; }
        onChange?.(Number(e.target.value));
      }}
    >
      <option value="" disabled>Select GST %</option>
      {GST_PRESETS.map(v => (
        <option key={v} value={v}>{presetLabel(v)}</option>
      ))}
      <option value={CUSTOM_VALUE}>Custom %…</option>
    </select>
  );
}
