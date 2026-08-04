import { useState } from "react";
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

const selectClass =
  "h-9 px-2.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#0F172A] text-sm " +
  "text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

export default function DateRangeFilter({ onChange }: Props) {
  const [preset, setPreset] = useState<Preset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

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
    // custom — wait for the date inputs; clear previous resolved range
    onChange(null, null);
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={preset}
        onChange={e => applyPreset(e.target.value as Preset)}
        className={selectClass}
        style={{ width: 148 }}
      >
        <option value="all">All Time</option>
        <option value="today">Today</option>
        <option value="week">Current Week</option>
        <option value="lastweek">Last Week</option>
        <option value="custom">Custom Range</option>
      </select>
      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customFrom}
            className={selectClass}
            style={{ width: 130, colorScheme: "light" }}
            onChange={e => {
              setCustomFrom(e.target.value);
              const from = e.target.value ? dayjs(e.target.value).startOf("day") : null;
              onChange(from, customTo ? dayjs(customTo).endOf("day") : null);
            }}
          />
          <span className="text-gray-400 text-xs">to</span>
          <input
            type="date"
            value={customTo}
            className={selectClass}
            style={{ width: 130, colorScheme: "light" }}
            onChange={e => {
              setCustomTo(e.target.value);
              const to = e.target.value ? dayjs(e.target.value).endOf("day") : null;
              onChange(customFrom ? dayjs(customFrom).startOf("day") : null, to);
            }}
          />
        </div>
      )}
    </div>
  );
}
