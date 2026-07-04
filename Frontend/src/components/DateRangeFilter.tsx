import { useState } from "react";
import { Select, DatePicker } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

type Preset = "all" | "today" | "week" | "lastweek" | "custom";

interface Props {
  onChange: (from: Dayjs | null, to: Dayjs | null) => void;
}

export function inDateRange(
  dateStr: string | undefined,
  from: Dayjs | null,
  to: Dayjs | null
): boolean {
  if (!from && !to) return true;
  if (!dateStr) return false;
  const d = dayjs(dateStr);
  if (from && d.isBefore(from, "day")) return false;
  if (to && d.isAfter(to, "day")) return false;
  return true;
}

export default function DateRangeFilter({ onChange }: Props) {
  const [preset, setPreset] = useState<Preset>("all");
  const [customRange, setCustomRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "all") { onChange(null, null); return; }
    if (p === "today") {
      const d = dayjs();
      onChange(d.startOf("day"), d.endOf("day"));
      return;
    }
    if (p === "week") {
      onChange(dayjs().startOf("week"), dayjs().endOf("week"));
      return;
    }
    if (p === "lastweek") {
      const start = dayjs().subtract(1, "week").startOf("week");
      const end   = dayjs().subtract(1, "week").endOf("week");
      onChange(start, end);
      return;
    }
    // custom — wait for range picker; clear previous resolved range
    onChange(null, null);
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Select
        value={preset}
        onChange={applyPreset}
        style={{ width: 148 }}
        options={[
          { label: "All Time",     value: "all" },
          { label: "Today",        value: "today" },
          { label: "Current Week", value: "week" },
          { label: "Last Week",    value: "lastweek" },
          { label: "Custom Range", value: "custom" },
        ]}
      />
      {preset === "custom" && (
        <DatePicker.RangePicker
          value={customRange}
          format="DD/MM/YYYY"
          allowClear
          onChange={range => {
            const from = range?.[0] ?? null;
            const to   = range?.[1] ?? null;
            setCustomRange([from, to]);
            onChange(
              from ? from.startOf("day") : null,
              to   ? to.endOf("day")     : null
            );
          }}
          style={{ width: 230 }}
        />
      )}
    </div>
  );
}
