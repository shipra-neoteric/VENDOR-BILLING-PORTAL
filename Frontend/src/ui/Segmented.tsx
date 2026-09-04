import type { ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  label: ReactNode;
  value: T;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  /** "pill" (default): selected option gets a white/dark pill background, like a tab.
   *  "text": selected option just turns brand-orange, no background — matches the
   *  sidebar nav's own active-item convention (color changes, not a fill). */
  variant?: "pill" | "text";
  // Adds a thin vertical divider between adjacent unselected pills — off by
  // default (matches every existing "pill" usage's plain look); opt in for a
  // row where the options read as more distinct, unrelated sections.
  divided?: boolean;
}

export default function Segmented<T extends string>({ value, onChange, options, variant = "pill", divided = false }: SegmentedProps<T>) {
  return (
    <div className={variant === "pill" ? "inline-flex items-center gap-0.5 p-1 rounded-lg bg-gray-100 dark:bg-gray-800/60" : "inline-flex items-center gap-4"}>
      {options.map((o, i) => {
        const isActive = o.value === value;
        // Never show a divider touching the active pill (its own background
        // already sets it apart) or after the last option.
        const nextIsActive = options[i + 1]?.value === value;
        const showDivider = divided && variant === "pill" && i < options.length - 1 && !isActive && !nextIsActive;
        return (
        <div key={o.value} className="flex items-center">
        <button
          type="button"
          onClick={() => onChange(o.value)}
          className={
            variant === "pill"
              ? [
                  "px-3.5 h-9 rounded-md text-[13px] font-semibold transition-colors whitespace-nowrap",
                  // Trailing `!` forces !important — see Btn.tsx for why (antd's
                  // unlayered global reset otherwise beats these text-color utilities).
                  isActive
                    ? "bg-white dark:bg-[#1E293B] text-[#1A1A2E]! dark:text-[#F1F5F9]! shadow-sm"
                    : "text-gray-500! dark:text-gray-400! hover:text-gray-700 dark:hover:text-gray-200",
                ].join(" ")
              : [
                  "px-3 h-8 rounded-md border text-[13px] font-semibold transition-colors whitespace-nowrap",
                  isActive
                    ? "border-primary text-primary!"
                    : "border-gray-200 dark:border-gray-700 text-gray-500! dark:text-gray-400! hover:text-gray-700 dark:hover:text-gray-200",
                ].join(" ")
          }
        >
          {o.label}
        </button>
        {showDivider && <span className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />}
        </div>
        );
      })}
    </div>
  );
}
