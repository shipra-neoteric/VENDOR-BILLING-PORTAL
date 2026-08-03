import { Calendar } from "lucide-react";

interface DatePickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
}

const inputClass =
  "w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm " +
  "text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50 " +
  "[color-scheme:light] dark:[color-scheme:dark]";

export function DatePicker({ label, value, onChange, min, max, disabled }: DatePickerProps) {
  return (
    <label className="block">
      {label && (
        <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">
          {label}
        </span>
      )}
      <div className="relative">
        <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="date"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      </div>
    </label>
  );
}

interface DateRangePickerProps {
  label?: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  disabled?: boolean;
}

export function DateRangePicker({ label, from, to, onChange, disabled }: DateRangePickerProps) {
  return (
    <div>
      {label && (
        <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">
          {label}
        </span>
      )}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="date"
            value={from}
            max={to || undefined}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value, to)}
            className={inputClass}
          />
        </div>
        <span className="text-gray-400 text-sm shrink-0">to</span>
        <div className="relative flex-1">
          <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="date"
            value={to}
            min={from || undefined}
            disabled={disabled}
            onChange={(e) => onChange(from, e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}
