import { useState } from "react";
import { Select, InputNumber } from "antd";

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

export default function GstSelect({
  value, onChange, style,
}: {
  value?: number;
  onChange?: (v: number) => void;
  style?: React.CSSProperties;
}) {
  const [customMode, setCustomMode] = useState(value !== undefined && !GST_PRESETS.includes(value));

  if (customMode) {
    return (
      <InputNumber
        value={value}
        min={0}
        max={100}
        step={0.1}
        style={{ width: "100%", ...style }}
        placeholder="Custom %"
        formatter={v => (v === undefined || v === null ? "" : `${v}%`)}
        parser={v => Number(String(v ?? "").replace("%", "")) as unknown as number}
        onChange={v => onChange?.(typeof v === "number" ? v : 0)}
        addonAfter={
          <span
            title="Back to presets"
            onClick={() => setCustomMode(false)}
            style={{ cursor: "pointer", color: "#f37916", fontSize: 11, fontWeight: 600 }}
          >
            ↺
          </span>
        }
      />
    );
  }

  const options: { label: string; value: number | string }[] = [
    ...GST_PRESETS.map(v => ({ label: presetLabel(v), value: v as number | string })),
    { label: "Custom %…", value: CUSTOM_VALUE },
  ];

  return (
    <Select<number | string>
      value={value !== undefined && GST_PRESETS.includes(value) ? value : undefined}
      style={style}
      placeholder="Select GST %"
      placement="bottomLeft"
      options={options}
      onChange={v => {
        if (v === CUSTOM_VALUE) { setCustomMode(true); return; }
        onChange?.(v as number);
      }}
      getPopupContainer={(trigger) => trigger.parentElement || document.body}
    />
  );
}
