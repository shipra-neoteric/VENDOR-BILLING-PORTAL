import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { SFieldOption } from "./SField";

export function FilterRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3 mb-4">{children}</div>;
}

interface SearchFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchFilter({ value, onChange, placeholder = "Search…" }: SearchFilterProps) {
  return (
    <div className="relative flex-1 min-w-[220px]">
      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm text-[#1A1A2E] dark:text-[#F1F5F9] placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
    </div>
  );
}

interface SelectFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: SFieldOption[];
  placeholder?: string;
  disabled?: boolean;
}

// Plain native <select> — lighter than SField for simple filter-bar dropdowns
// (no search needed, few options, no in-form label).
export function SelectFilter({ value, onChange, options, placeholder = "All", disabled }: SelectFilterProps) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm text-gray-500! dark:text-gray-400! focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

interface DropdownSelectFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: SFieldOption[];
  placeholder?: string;
  /** The value that means "nothing selected" — clicking it in the panel resets to this. */
  resetValue?: string;
}

// Same custom-panel look as MultiSelect (button + searchable panel), but
// single-select with no checkboxes — for filter-bar dropdowns that want the
// themed look without a native <select>'s browser-drawn popup.
export function DropdownSelectFilter({ value, onChange, options, placeholder = "All", resetValue = "all" }: DropdownSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  function select(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  const isReset = value === resetValue;
  const summary = isReset ? placeholder : options.find((o) => o.value === value)?.label ?? placeholder;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm min-w-[150px] flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      >
        <span className={isReset ? "text-gray-400 dark:text-gray-500" : "text-[#1A1A2E] dark:text-[#F1F5F9]"}>
          {summary}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-56 bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700/40">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full text-sm bg-transparent outline-none text-[#1A1A2E] dark:text-[#F1F5F9] placeholder:text-gray-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => select(resetValue)}
              className={["w-full flex items-center px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700/40", isReset ? "text-primary! font-semibold" : "text-[#1A1A2E]! dark:text-[#F1F5F9]!"].join(" ")}
            >
              {placeholder}
            </button>
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">No matches</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => select(o.value)}
                className={["w-full flex items-center px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700/40", value === o.value ? "text-primary! font-semibold" : "text-[#1A1A2E]! dark:text-[#F1F5F9]!"].join(" ")}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
