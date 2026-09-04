import type { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NxStatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
  // Optional trend line under the value (e.g. "12% vs yesterday") — used by
  // the Operational/Financial dashboards' comparison mode. Omitted entirely
  // when there's nothing to compare against, matching every other page's
  // plain stat cards.
  delta?: string;
  deltaDown?: boolean;
  // "sm" is a more compact variant (less padding, smaller value text) for
  // pages that pack several cards into a tight row — e.g. User Management's
  // Total/Active/Inactive row. Defaults to the original full size everywhere
  // else so no other existing usage changes.
  size?: "default" | "sm";
}

// Matches guide §6 exactly: decorative icon bottom-right (faded, grows on
// hover — not itself a button), value in font-medium (not bold), shadow
// (not border) as the resting-state edge.
export default function NxStatCard({ label, value, icon: Icon, active = false, onClick, delta, deltaDown, size = "default" }: NxStatCardProps) {
  const DeltaIcon = deltaDown ? TrendingDown : TrendingUp;
  const compact = size === "sm";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={[
        "h-full bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-all duration-200 text-left relative overflow-hidden group",
        compact ? "p-1.5 min-w-[110px]" : "p-3 sm:p-4 w-full",
        onClick ? "cursor-pointer" : "cursor-default",
        active ? "ring-2" : "",
      ].join(" ")}
      style={active ? { boxShadow: "0 0 0 2px var(--theme-primary)" } : undefined}
    >
      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">{label}</p>
      <p className={`text-lg sm:text-xl font-medium text-gray-900 dark:text-white tabular-nums break-words leading-tight ${compact ? "mt-0.5" : "mt-2"}`}>{value}</p>
      {delta && (
        <p className={`text-xs font-semibold mt-1.5 flex items-center gap-1 ${deltaDown ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
          <DeltaIcon className="w-3 h-3" /> {delta}
        </p>
      )}
      <Icon
        className={`absolute text-gray-400 transition-all duration-300 group-hover:scale-110 ${compact ? "bottom-1.5 right-1.5 w-4 h-4" : "bottom-2 right-2 w-6 h-6"}`}
        strokeWidth={2.5}
      />
    </button>
  );
}
