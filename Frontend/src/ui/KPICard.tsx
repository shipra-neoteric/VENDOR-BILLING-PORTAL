import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type TintColor = "gray" | "green" | "red" | "blue" | "orange" | "amber" | "purple" | "teal";

// A fully-tinted alternative to the default left-border-on-white look, for
// contexts (e.g. a credit/debit/net-flow style summary row) that want the
// whole card colored by meaning rather than just an accent stripe. Opt-in via
// `tint` so the many existing default-style KPICard call sites are unaffected.
const TINT_CLASSES: Record<TintColor, { card: string; iconChip: string; icon: string; value: string }> = {
  gray:   { card: "bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/40",       iconChip: "bg-gray-200/70 dark:bg-gray-700/50",       icon: "text-gray-500 dark:text-gray-400",       value: "text-[#1A1A2E] dark:text-[#F1F5F9]" },
  green:  { card: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20", iconChip: "bg-emerald-100 dark:bg-emerald-500/15",   icon: "text-emerald-600 dark:text-emerald-400", value: "text-emerald-700 dark:text-emerald-300" },
  red:    { card: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20",           iconChip: "bg-red-100 dark:bg-red-500/15",           icon: "text-red-600 dark:text-red-400",         value: "text-red-700 dark:text-red-300" },
  blue:   { card: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20",         iconChip: "bg-blue-100 dark:bg-blue-500/15",         icon: "text-blue-600 dark:text-blue-400",       value: "text-blue-700 dark:text-blue-300" },
  orange: { card: "bg-primary/5 dark:bg-primary/10 border-primary/20",                              iconChip: "bg-primary/10 dark:bg-primary/15",        icon: "text-primary",                           value: "text-primary" },
  amber:  { card: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20",     iconChip: "bg-amber-100 dark:bg-amber-500/15",       icon: "text-amber-600 dark:text-amber-400",     value: "text-amber-700 dark:text-amber-300" },
  purple: { card: "bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20", iconChip: "bg-purple-100 dark:bg-purple-500/15",     icon: "text-purple-600 dark:text-purple-400",   value: "text-purple-700 dark:text-purple-300" },
  teal:   { card: "bg-teal-50 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/20",         iconChip: "bg-teal-100 dark:bg-teal-500/15",         icon: "text-teal-600 dark:text-teal-400",       value: "text-teal-700 dark:text-teal-300" },
};

interface KPICardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  accent?: string;
  /** Opt-in full-color-tint variant (background/icon/value all colored by meaning). Omit for the default left-border-on-white card. */
  tint?: TintColor;
}

export default function KPICard({ label, value, sub, icon: Icon, accent = "#FF7A00", tint }: KPICardProps) {
  if (tint) {
    const t = TINT_CLASSES[tint];
    return (
      <div className={`border rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow ${t.card}`}>
        {Icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${t.iconChip}`}>
            <Icon className={`w-4.5 h-4.5 ${t.icon}`} />
          </div>
        )}
        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
          {label}
        </div>
        <div className={`text-lg font-bold font-mono leading-tight break-words ${t.value}`}>
          {value}
        </div>
        {sub && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</div>}
      </div>
    );
  }

  return (
    <div
      className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      {Icon && (
        <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2" style={{ background: `${accent}1A` }}>
          <Icon className="w-4.5 h-4.5" style={{ color: accent }} />
        </div>
      )}
      <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
        {label}
      </div>
      <div className="text-lg font-bold font-mono text-[#1A1A2E] dark:text-[#F1F5F9] leading-tight break-words">
        {value}
      </div>
      {sub && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
