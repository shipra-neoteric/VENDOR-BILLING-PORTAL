import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  sub?: string;
  tone?: "neutral" | "green" | "red" | "amber" | "blue";
  onClick?: () => void;
}

// Flat, minimal stat-card style (label -> big number -> small subtitle, icon
// in a soft rounded box top-right) — deliberately its own component rather
// than reusing the shared NxStatCard (Frontend/src/ui/nexora/StatCard.tsx),
// since that one is a fixed design-system primitive used across 18+ other
// pages; changing it would restyle stat cards app-wide, not just this
// dashboard's KPI row.
const TONE_ICON_BG: Record<string, string> = {
  neutral: "bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400",
  green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
};

export default function KpiCard({ label, value, icon: Icon, sub, tone = "neutral", onClick }: Props) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`h-full bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-4 text-left ${onClick ? "cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-colors" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</span>
        <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${TONE_ICON_BG[tone]}`}>
          <Icon className="w-3.5 h-3.5" strokeWidth={2.25} />
        </span>
      </div>
      <div className="text-xl font-bold text-[#172033] dark:text-white mt-2 tabular-nums truncate">{value}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">{sub}</div>}
    </Wrapper>
  );
}
