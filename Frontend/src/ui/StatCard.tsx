import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  iconColorClass?: string;
  /** Makes the card a filter toggle — clicking it should narrow the page's list to this metric. */
  onClick?: () => void;
  /** Highlights the card as the currently-applied filter (only meaningful alongside onClick). */
  active?: boolean;
}

// Plain stat card — icon sits bottom-right instead of a colored left border
// (that's KPICard's shape). Grid wrapper: grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4.
// Pass onClick to make it act as a filter for the list/table below it — active
// gets an orange border, matching this app's "active = orange, not a fill" convention.
export default function StatCard({ label, value, icon: Icon, iconColorClass = "text-primary", onClick, active = false }: StatCardProps) {
  return (
    <div
      className={[
        "bg-white dark:bg-[#1E293B] border rounded-lg shadow-sm p-3 sm:p-4 relative",
        active ? "border-primary" : "border-gray-200 dark:border-gray-700/40",
        onClick ? "cursor-pointer hover:shadow-md transition-shadow text-left" : "",
      ].join(" ")}
      {...(onClick ? { onClick, role: "button", tabIndex: 0 } : {})}
    >
      <div className="flex flex-col h-full justify-between relative z-10 pr-6">
        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{label}</p>
        <p className="text-xl sm:text-2xl font-medium text-[#1A1A2E] dark:text-[#F1F5F9] mt-2 tabular-nums leading-snug break-words">{value}</p>
      </div>
      <Icon className={`absolute bottom-2 right-2 w-6 h-6 ${iconColorClass}`} strokeWidth={2.5} />
    </div>
  );
}
