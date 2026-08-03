import type { ReactNode } from "react";
import { Search } from "lucide-react";
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
    <div className="relative w-full sm:w-64">
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
}

// Plain native <select> — lighter than SField for simple filter-bar dropdowns
// (no search needed, few options, no in-form label).
export function SelectFilter({ value, onChange, options, placeholder = "All" }: SelectFilterProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
