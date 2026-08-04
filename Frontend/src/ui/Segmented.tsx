import type { ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  label: ReactNode;
  value: T;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
}

export default function Segmented<T extends string>({ value, onChange, options }: SegmentedProps<T>) {
  return (
    <div className="inline-flex items-center gap-0.5 p-1 rounded-lg bg-gray-100 dark:bg-gray-800/60">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={[
            "px-3.5 h-9 rounded-md text-[13px] font-semibold transition-colors whitespace-nowrap",
            o.value === value
              ? "bg-white dark:bg-[#1E293B] text-[#1A1A2E] dark:text-[#F1F5F9] shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200",
          ].join(" ")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
