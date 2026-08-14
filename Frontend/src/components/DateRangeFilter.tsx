import { useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import Calendar from "../ui/Calendar";
import Btn from "../ui/Btn";
import { useClickOutside } from "../ui/useClickOutside";
import { usePopupAlign } from "../ui/usePopupAlign";

// Widest of the three popup contents (the plain menu is 176px, but Week
// Number's grid and Custom Range's calendar+Apply-Range panel both run
// closer to 300px) — measured against the trigger up front so whichever
// sub-view opens first still fits on screen.
const MENU_WIDTH = 300;

type Preset = "all" | "today" | "yesterday" | "week" | "lastweek" | "month" | "weeknum" | "custom";

const PRESET_LABEL: Record<Preset, string> = {
  all: "All Time", today: "Today", yesterday: "Yesterday", week: "This Week",
  lastweek: "Last Week", month: "This Month", weeknum: "Week Number", custom: "Custom Range",
};
const MENU_ORDER: Preset[] = ["all", "today", "yesterday", "week", "lastweek", "weeknum", "month", "custom"];

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

// One ISO-ish week per row (Sunday-start, matching this file's own prior
// convention), most recent first, capped at the current week — a report
// can't be run for a week that hasn't happened yet.
function weeksForYear(year: number) {
  const weeks: { label: string; from: Dayjs; to: Dayjs; disabled: boolean }[] = [];
  let cursor = dayjs(`${year}-01-01`).startOf("week");
  const now = dayjs();
  let n = 1;
  while (cursor.year() <= year) {
    const from = cursor;
    const to = cursor.endOf("week");
    if (from.year() === year || to.year() === year) {
      weeks.push({ label: `Wk ${n}`, from, to, disabled: from.isAfter(now, "day") });
      n++;
    }
    cursor = cursor.add(1, "week");
    if (cursor.year() > year && cursor.subtract(1, "week").year() <= year && cursor.diff(dayjs(`${year}-01-01`), "day") > 370) break;
  }
  return weeks.reverse();
}

function WeekNumberPanel({ onPick, onBack }: { onPick: (from: Dayjs, to: Dayjs) => void; onBack: () => void }) {
  const [year, setYear] = useState(dayjs().year());
  const weeks = weeksForYear(year);
  return (
    <div className="w-[300px] p-3 rounded-xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-[#1E293B] shadow-xl">
      <div className="flex items-center justify-between mb-2.5">
        <button type="button" onClick={() => setYear(y => y - 1)} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[13px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">Week {year}</span>
        <button type="button" onClick={() => setYear(y => y + 1)} disabled={year >= dayjs().year()} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 disabled:opacity-30">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto custom-scrollbar">
        {weeks.map(w => (
          <button
            key={w.label} type="button" disabled={w.disabled}
            onClick={() => onPick(w.from, w.to)}
            className="text-left px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-700/40 hover:border-primary hover:bg-primary/5 disabled:opacity-30 disabled:hover:border-gray-200 disabled:hover:bg-transparent"
          >
            <div className="text-[11.5px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">{w.label}</div>
            <div className="text-[10px] text-gray-400">{w.from.format("MMM D")} – {w.to.format("MMM D")}</div>
          </button>
        ))}
      </div>
      <button type="button" onClick={onBack} className="mt-2 text-[11.5px] font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
        ← Back
      </button>
    </div>
  );
}

function CustomRangePanel({ onApply, onCancel }: { onApply: (from: Dayjs, to: Dayjs) => void; onCancel: () => void }) {
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  return (
    <div className="p-1">
      <Calendar
        rangeFrom={from} rangeTo={to}
        onRangeSelect={(f, t) => { setFrom(f || null); setTo(t); }}
      />
      <div className="flex justify-end gap-2 mt-2">
        <Btn small outline label="Cancel" onClick={onCancel} />
        <Btn
          small color="primary" label="Apply Range" disabled={!from || !to}
          onClick={() => { if (from && to) onApply(dayjs(from), dayjs(to)); }}
        />
      </div>
    </div>
  );
}

// The full Today/Yesterday/This Week/Last Week/Week Number/This Month/
// Custom Range preset dropdown, resolving to a plain (from, to) Dayjs pair —
// same external contract as this file always had, so every existing caller
// (WorkItems, SiteProgress, Billing, AccountsPayment, Ledger) picks this up
// with no changes of its own.
export default function DateRangeFilter({ onChange }: Props) {
  const [preset, setPreset] = useState<Preset>("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [subView, setSubView] = useState<"weeknum" | "custom" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useClickOutside(ref, () => { setMenuOpen(false); setSubView(null); }, menuOpen);
  const { align, measure } = usePopupAlign();

  function resolve(p: Preset) {
    const now = dayjs();
    switch (p) {
      case "all":       return onChange(null, null);
      case "today":     return onChange(now.startOf("day"), now.endOf("day"));
      case "yesterday": { const y = now.subtract(1, "day"); return onChange(y.startOf("day"), y.endOf("day")); }
      case "week":      return onChange(now.startOf("week"), now.endOf("week"));
      case "lastweek":  { const s = now.subtract(1, "week"); return onChange(s.startOf("week"), s.endOf("week")); }
      case "month":     return onChange(now.startOf("month"), now.endOf("month"));
      default: return;
    }
  }

  function pick(p: Preset) {
    if (p === "weeknum") { setSubView("weeknum"); return; }
    if (p === "custom")  { setSubView("custom"); return; }
    setPreset(p);
    resolve(p);
    setMenuOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => { measure(btnRef, MENU_WIDTH); setMenuOpen(o => !o); }}
        className="h-9 px-3 flex items-center gap-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#0F172A] text-sm text-[#1A1A2E] dark:text-[#F1F5F9] hover:border-primary/50"
      >
        <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
        {PRESET_LABEL[preset]}
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
      </button>

      {menuOpen && (
        <div className={`absolute z-50 mt-1.5 ${align === "right" ? "right-0" : "left-0"}`}>
          {subView === "weeknum" ? (
            <WeekNumberPanel
              onBack={() => setSubView(null)}
              onPick={(from, to) => { setPreset("weeknum"); onChange(from.startOf("day"), to.endOf("day")); setMenuOpen(false); setSubView(null); }}
            />
          ) : subView === "custom" ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-[#1E293B] shadow-xl">
              <CustomRangePanel
                onCancel={() => setSubView(null)}
                onApply={(from, to) => { setPreset("custom"); onChange(from.startOf("day"), to.endOf("day")); setMenuOpen(false); setSubView(null); }}
              />
            </div>
          ) : (
            <div className="w-44 rounded-xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-[#1E293B] shadow-xl p-1.5 flex flex-col gap-0.5">
              {MENU_ORDER.map(p => (
                <button
                  key={p} type="button" onClick={() => pick(p)}
                  className={`text-left px-2.5 py-1.5 rounded-md text-[13px] font-medium ${
                    p === preset ? "bg-primary/10 text-primary! font-bold" : "text-[#1A1A2E] dark:text-[#F1F5F9] hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  {PRESET_LABEL[p]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
