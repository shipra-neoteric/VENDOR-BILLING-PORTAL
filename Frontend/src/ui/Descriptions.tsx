import type { ReactNode } from "react";

export function Descriptions({ columns = 2, children }: { columns?: number; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}>
      {children}
    </div>
  );
}

export function DescItem({ label, span = 1, children }: { label: string; span?: number; children?: ReactNode }) {
  return (
    <div style={{ gridColumn: `span ${span} / span ${span}` }}>
      <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-0.5">{label}</div>
      <div className="text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{children ?? "—"}</div>
    </div>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700/40 pb-2 mb-4 mt-6 first:mt-0">
      {children}
    </div>
  );
}
