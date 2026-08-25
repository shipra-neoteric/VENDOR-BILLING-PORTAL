import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalendarIcon } from "lucide-react";
import dayjs from "dayjs";
import Calendar from "./Calendar";

const CALENDAR_WIDTH = 280;
const CALENDAR_HEIGHT = 330;

interface DatePickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
}

function usePortalPopover(open: boolean, onClose: () => void) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();

    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
      onClose();
      return;
    }

    // Always position below (down) the selector button
    let top = rect.bottom + 6;
    top = Math.min(top, window.innerHeight - CALENDAR_HEIGHT - 8);
    top = Math.max(8, top);

    const overflowsRight = rect.left + CALENDAR_WIDTH > window.innerWidth - 12;
    let left = overflowsRight ? rect.right - CALENDAR_WIDTH : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - CALENDAR_WIDTH - 8));

    setCoords({ top, left });
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    function onScrollOrResize() {
      updatePosition();
    }

    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        popupRef.current && !popupRef.current.contains(target)
      ) {
        onClose();
      }
    }

    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("mousedown", onDocMouseDown);

    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [open, updatePosition, onClose]);

  return { triggerRef, popupRef, coords };
}

// A real popup month-grid calendar (see ui/Calendar.tsx) instead of the
// browser's native <input type="date"> picker — rendered in a React Portal
// with fixed positioning so it always floats on top of modals, drawers, and
// overflow containers without being clipped or pushing layout.
export function DatePicker({ label, value, onChange, min, max, disabled }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const handleClose = useCallback(() => setOpen(false), []);
  const { triggerRef, popupRef, coords } = usePortalPopover(open, handleClose);

  return (
    <div>
      {label && (
        <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">
          {label}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-left text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50 relative"
      >
        <CalendarIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        {value ? dayjs(value).format("DD MMM YYYY") : <span className="text-gray-400">Select date</span>}
      </button>

      {open && coords && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[99999]"
          style={{ top: coords.top, left: coords.left }}
        >
          <Calendar
            value={value || null}
            min={min} max={max}
            onSelect={(v) => { onChange(v); setOpen(false); }}
          />
        </div>,
        document.body
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

// Two independent popup calendars (From / To), same portal floating behavior
// as the single DatePicker above.
export function DateRangePicker({ label, from, to, onChange, disabled }: DateRangePickerProps) {
  const [openWhich, setOpenWhich] = useState<"from" | "to" | null>(null);
  const handleCloseFrom = useCallback(() => setOpenWhich(w => w === "from" ? null : w), []);
  const handleCloseTo = useCallback(() => setOpenWhich(w => w === "to" ? null : w), []);

  const fromPopover = usePortalPopover(openWhich === "from", handleCloseFrom);
  const toPopover = usePortalPopover(openWhich === "to", handleCloseTo);

  return (
    <div>
      {label && (
        <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">
          {label}
        </span>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <button
            ref={fromPopover.triggerRef}
            type="button" disabled={disabled}
            onClick={() => setOpenWhich(w => (w === "from" ? null : "from"))}
            className="w-full h-9 pl-8 pr-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-left text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50 relative truncate"
          >
            <CalendarIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            {from ? dayjs(from).format("DD MMM YYYY") : <span className="text-gray-400">From</span>}
          </button>
          {openWhich === "from" && fromPopover.coords && createPortal(
            <div
              ref={fromPopover.popupRef}
              className="fixed z-[99999]"
              style={{ top: fromPopover.coords.top, left: fromPopover.coords.left }}
            >
              <Calendar value={from || null} max={to || undefined} onSelect={(v) => { onChange(v, to); setOpenWhich(null); }} />
            </div>,
            document.body
          )}
        </div>
        <span className="text-gray-400 text-[13px] shrink-0">to</span>
        <div className="flex-1">
          <button
            ref={toPopover.triggerRef}
            type="button" disabled={disabled}
            onClick={() => setOpenWhich(w => (w === "to" ? null : "to"))}
            className="w-full h-9 pl-8 pr-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-left text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50 relative truncate"
          >
            <CalendarIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            {to ? dayjs(to).format("DD MMM YYYY") : <span className="text-gray-400">To</span>}
          </button>
          {openWhich === "to" && toPopover.coords && createPortal(
            <div
              ref={toPopover.popupRef}
              className="fixed z-[99999]"
              style={{ top: toPopover.coords.top, left: toPopover.coords.left }}
            >
              <Calendar value={to || null} min={from || undefined} onSelect={(v) => { onChange(from, v); setOpenWhich(null); }} />
            </div>,
            document.body
          )}
        </div>
      </div>
    </div>
  );
}

