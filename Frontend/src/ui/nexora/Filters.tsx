import type { ReactNode } from "react";
import { Search, ChevronDown } from "lucide-react";

// Approximates the guide's §11 ThemedSelect visual language (bordered
// trigger, h-10, chevron, theme-colored focus ring) on top of a plain
// native <select> rather than a full portal-rendered custom dropdown with
// search/avatar-option support — that's a real component to build later if
// this direction is approved, not something to reproduce for a pilot.

export function NxFilterRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

export function NxSearchFilter({
  value, onChange, placeholder = "Search…",
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative flex-1 min-w-[220px]">
      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 pl-9 pr-3 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-[13px] border-gray-300 dark:border-gray-600 theme-ring"
      />
    </div>
  );
}

export function NxSelectFilter({
  value, onChange, options, placeholder = "All",
}: { value: string; onChange: (v: string) => void; options: { label: string; value: string }[]; placeholder?: string }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 pl-3 pr-8 border rounded-lg bg-white dark:bg-gray-800 text-gray-500! dark:text-gray-400! text-[13px] border-gray-300 dark:border-gray-600 theme-ring appearance-none"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}
