import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { SFieldOption } from "./SField";

interface MultiSelectProps {
  label?: string;
  placeholder?: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: SFieldOption[];
  disabled?: boolean;
}

export default function MultiSelect({ label, placeholder = "Select…", values, onChange, options, disabled }: MultiSelectProps) {
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

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  const summary =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? options.find((o) => o.value === values[0])?.label ?? placeholder
        : `${values.length} selected`;

  return (
    <div className="relative" ref={rootRef}>
      {label && (
        <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">
          {label}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm flex items-center justify-between gap-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      >
        <span className={values.length ? "text-[#1A1A2E] dark:text-[#F1F5F9]" : "text-gray-400 dark:text-gray-500"}>
          {summary}
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
              className="w-full text-sm bg-transparent outline-none text-[#1A1A2E] dark:text-[#F1F5F9] placeholder:text-gray-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-400">No matches</div>
            )}
            {filtered.map((o) => {
              const checked = values.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-[#1A1A2E]! dark:text-[#F1F5F9]! hover:bg-gray-50 dark:hover:bg-gray-700/40"
                >
                  <span
                    className={[
                      "w-4 h-4 rounded flex items-center justify-center shrink-0 border",
                      checked ? "bg-primary border-primary" : "border-gray-300 dark:border-gray-600",
                    ].join(" ")}
                  >
                    {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </span>
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
