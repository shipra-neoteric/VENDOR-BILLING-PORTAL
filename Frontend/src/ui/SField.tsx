import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export interface SFieldOption {
  value: string;
  label: string;
}

interface SFieldProps {
  label?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  error?: string;
  value: string | null;
  onChange: (value: string) => void;
  options: SFieldOption[];
  disabled?: boolean;
  // Rich per-option JSX (e.g. bold name + muted email, or a colored badge +
  // description) — falls back to the plain option.label row when omitted.
  renderOption?: (option: SFieldOption) => ReactNode;
}

// Searchable single-select — click to open, type to filter, click an option to pick.
export default function SField({ label, required, placeholder = "Select…", hint, error, value, onChange, options, disabled, renderOption }: SFieldProps) {
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

  const selected = options.find((o) => o.value === value);
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div className="relative" ref={rootRef}>
      {label && (
        <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={[
          "w-full h-9 px-2.5 rounded-lg border bg-white dark:bg-[#0F172A] text-[13px] flex items-center justify-between gap-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
          error ? "border-red-400" : "border-gray-200 dark:border-gray-700",
        ].join(" ")}
      >
        <span className={["truncate min-w-0", selected ? "text-[#1A1A2E] dark:text-[#F1F5F9]" : "text-gray-400 dark:text-gray-500"].join(" ")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700/40">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full text-[13px] bg-transparent outline-none text-[#1A1A2E] dark:text-[#F1F5F9] placeholder:text-gray-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-[13px] text-gray-400">No matches</div>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery("");
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] text-left text-[#1A1A2E]! dark:text-[#F1F5F9]! hover:bg-gray-50 dark:hover:bg-gray-700/40"
              >
                {renderOption ? renderOption(o) : o.label}
                {o.value === value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
      {error ? (
        <span className="block text-xs text-red-500 mt-1">{error}</span>
      ) : (
        hint && <span className="block text-xs text-gray-400 dark:text-gray-500 mt-1">{hint}</span>
      )}
    </div>
  );
}
