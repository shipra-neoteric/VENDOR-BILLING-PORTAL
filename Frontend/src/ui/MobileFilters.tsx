import { useState } from "react";
import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

// A page's filter row that stays compact on a phone: only the search box (and a "Filters" button) show; the
// dropdowns / toggles / buttons passed as children fold away, and open two to a row when the button is tapped.
// From md up it renders exactly like a plain flex row (the children flow inline, as before).
// `className` is the page's own row classes (gap, alignment, margins); `active` puts a dot on the button when
// any filter is applied, so a hidden filter never goes unnoticed.
export default function MobileFilters({
  search, children, active = false, className = "flex gap-2 items-center flex-wrap",
}: { search?: ReactNode; children: ReactNode; active?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      {search}
      <button
        type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="md:hidden relative inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] font-semibold text-gray-600 dark:text-gray-300 shrink-0"
      >
        <SlidersHorizontal className="w-4 h-4" /> Filters
        {active && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-primary" />}
      </button>
      <div className={`${open ? "grid grid-cols-2 gap-2 w-full [&>*]:min-w-0 [&>*]:w-full" : "hidden"} md:contents`}>
        {children}
      </div>
    </div>
  );
}
