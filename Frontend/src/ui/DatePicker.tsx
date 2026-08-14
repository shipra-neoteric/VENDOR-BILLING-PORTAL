import { useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import dayjs from "dayjs";
import Calendar from "./Calendar";
import { useClickOutside } from "./useClickOutside";
import { usePopupAlign } from "./usePopupAlign";

const CALENDAR_WIDTH = 280;

interface DatePickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
}

// A real popup month-grid calendar (see ui/Calendar.tsx) instead of the
// browser's native <input type="date"> picker — every caller keeps the same
// value/onChange contract (a plain "YYYY-MM-DD" string), so this is a
// drop-in swap with no changes needed at any of its ~17 call sites.
export function DatePicker({ label, value, onChange, min, max, disabled }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const { align, measure } = usePopupAlign();

  return (
    <div ref={ref} className="relative">
      {label && (
        <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">
          {label}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { measure(ref, CALENDAR_WIDTH); setOpen(o => !o); }}
        className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm text-left text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50 relative"
      >
        <CalendarIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        {value ? dayjs(value).format("DD MMM YYYY") : <span className="text-gray-400">Select date</span>}
      </button>
      {open && (
        <div className={`absolute z-50 mt-1.5 ${align === "right" ? "right-0" : "left-0"}`}>
          <Calendar
            value={value || null}
            min={min} max={max}
            onSelect={(v) => { onChange(v); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
}

interface DateRangePickerProps {
  label?: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  disabled?: boolean;
}

// Two independent popup calendars (From / To), same look as the single
// DatePicker above — used where a bare from/to pair is needed outside the
// full Today/This Week/.../Custom Range dropdown (see ui/TimeRangeSelect
// via components/DateRangeFilter.tsx for that richer preset picker).
export function DateRangePicker({ label, from, to, onChange, disabled }: DateRangePickerProps) {
  const [openWhich, setOpenWhich] = useState<"from" | "to" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpenWhich(null), openWhich !== null);
  const fromBtnRef = useRef<HTMLButtonElement>(null);
  const toBtnRef = useRef<HTMLButtonElement>(null);
  const fromAlign = usePopupAlign();
  const toAlign = usePopupAlign();

  return (
    <div ref={ref}>
      {label && (
        <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">
          {label}
        </span>
      )}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <button
            ref={fromBtnRef}
            type="button" disabled={disabled}
            onClick={() => { fromAlign.measure(fromBtnRef, CALENDAR_WIDTH); setOpenWhich(w => (w === "from" ? null : "from")); }}
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm text-left text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50 relative"
          >
            <CalendarIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            {from ? dayjs(from).format("DD MMM YYYY") : <span className="text-gray-400">From</span>}
          </button>
          {openWhich === "from" && (
            <div className={`absolute z-50 mt-1.5 ${fromAlign.align === "right" ? "right-0" : "left-0"}`}>
              <Calendar value={from || null} max={to || undefined} onSelect={(v) => { onChange(v, to); setOpenWhich(null); }} />
            </div>
          )}
        </div>
        <span className="text-gray-400 text-sm shrink-0">to</span>
        <div className="relative flex-1">
          <button
            ref={toBtnRef}
            type="button" disabled={disabled}
            onClick={() => { toAlign.measure(toBtnRef, CALENDAR_WIDTH); setOpenWhich(w => (w === "to" ? null : "to")); }}
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm text-left text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50 relative"
          >
            <CalendarIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            {to ? dayjs(to).format("DD MMM YYYY") : <span className="text-gray-400">To</span>}
          </button>
          {openWhich === "to" && (
            <div className={`absolute z-50 mt-1.5 ${toAlign.align === "right" ? "right-0" : "left-0"}`}>
              <Calendar value={to || null} min={from || undefined} onSelect={(v) => { onChange(from, v); setOpenWhich(null); }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
