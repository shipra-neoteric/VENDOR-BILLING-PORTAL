import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function buildGrid(monthCursor: Dayjs): Dayjs[] {
  const startOfMonth = monthCursor.startOf("month");
  const gridStart = startOfMonth.subtract(startOfMonth.day(), "day");
  return Array.from({ length: 42 }, (_, i) => gridStart.add(i, "day"));
}

// Single popup month-grid calendar — used both standalone (DatePicker, one
// value) and inside TimeRangeSelect's Custom Range panel (two clicks: from,
// then to). Which mode it's in is inferred from which callback is passed,
// not a separate `mode` prop — a caller only ever wants one or the other.
export default function Calendar({
  value, onSelect,
  rangeFrom, rangeTo, onRangeSelect,
  min, max,
}: {
  value?: string | null;
  onSelect?: (date: string) => void;
  rangeFrom?: string | null;
  rangeTo?: string | null;
  onRangeSelect?: (from: string, to: string | null) => void;
  min?: string;
  max?: string;
}) {
  const isRange = !!onRangeSelect;
  const anchor = value || rangeTo || rangeFrom;
  const [cursor, setCursor] = useState<Dayjs>(anchor ? dayjs(anchor) : dayjs());

  const grid = buildGrid(cursor);
  const today = dayjs().format("YYYY-MM-DD");
  const minD = min ? dayjs(min) : null;
  const maxD = max ? dayjs(max) : null;

  function isDisabled(d: Dayjs) {
    if (minD && d.isBefore(minD, "day")) return true;
    if (maxD && d.isAfter(maxD, "day")) return true;
    return false;
  }

  function handleClick(d: Dayjs) {
    if (isDisabled(d)) return;
    const iso = d.format("YYYY-MM-DD");
    if (isRange) {
      if (!rangeFrom || (rangeFrom && rangeTo)) {
        onRangeSelect!(iso, null);
      } else if (dayjs(iso).isBefore(rangeFrom, "day")) {
        onRangeSelect!(iso, rangeFrom);
      } else {
        onRangeSelect!(rangeFrom, iso);
      }
    } else {
      onSelect?.(iso);
    }
  }

  function dayState(d: Dayjs): { selected: boolean; inRange: boolean; isToday: boolean; otherMonth: boolean } {
    const iso = d.format("YYYY-MM-DD");
    const otherMonth = d.month() !== cursor.month();
    const isToday = iso === today;
    if (isRange) {
      const selected = iso === rangeFrom || iso === rangeTo;
      const inRange = !!rangeFrom && !!rangeTo && d.isAfter(rangeFrom, "day") && d.isBefore(rangeTo, "day");
      return { selected, inRange, isToday, otherMonth };
    }
    return { selected: !!value && iso === value, inRange: false, isToday, otherMonth };
  }

  return (
    <div className="w-[280px] p-3 rounded-xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-[#1E293B] shadow-xl">
      <div className="flex items-center justify-between mb-2.5">
        <button type="button" onClick={() => setCursor(c => c.subtract(1, "month"))} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[13px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">{cursor.format("MMMM YYYY")}</span>
        <button type="button" onClick={() => setCursor(c => c.add(1, "month"))} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-[10.5px] font-bold text-gray-400 text-center py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {grid.map((d, i) => {
          const { selected, inRange, isToday, otherMonth } = dayState(d);
          const disabled = isDisabled(d);
          return (
            <button
              key={i} type="button" disabled={disabled}
              onClick={() => handleClick(d)}
              className={[
                "h-8 text-[12.5px] rounded-md flex items-center justify-center transition-colors",
                disabled ? "text-gray-300 dark:text-gray-700 cursor-not-allowed"
                  : selected ? "bg-primary text-white! font-bold"
                  : inRange ? "bg-primary/10 text-primary! font-semibold rounded-none"
                  : otherMonth ? "text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                  : "text-[#1A1A2E] dark:text-[#F1F5F9] hover:bg-gray-100 dark:hover:bg-gray-800",
                isToday && !selected ? "ring-1 ring-inset ring-primary/50" : "",
              ].join(" ")}
            >
              {d.date()}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/40">
        <button
          type="button"
          onClick={() => {
            const t = dayjs();
            setCursor(t);
            if (isRange) onRangeSelect!(t.format("YYYY-MM-DD"), t.format("YYYY-MM-DD"));
            else onSelect?.(t.format("YYYY-MM-DD"));
          }}
          className="text-[11.5px] font-bold text-primary! hover:underline"
        >
          Today
        </button>
        {isRange && (rangeFrom || rangeTo) && (
          <button type="button" onClick={() => onRangeSelect!("", null)} className="text-[11.5px] font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
