import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface NxStatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
}

// Matches guide §6 exactly: decorative icon bottom-right (faded, grows on
// hover — not itself a button), value in font-medium (not bold), shadow
// (not border) as the resting-state edge.
export default function NxStatCard({ label, value, icon: Icon, active = false, onClick }: NxStatCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={[
        "h-full bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 shadow hover:shadow-lg transition-all duration-200 text-left relative overflow-hidden group",
        onClick ? "cursor-pointer" : "cursor-default",
        active ? "ring-2" : "",
      ].join(" ")}
      style={active ? { boxShadow: "0 0 0 2px var(--theme-primary)" } : undefined}
    >
      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{label}</p>
      <p className="text-2xl sm:text-3xl font-medium text-gray-900 dark:text-white mt-2 tabular-nums">{value}</p>
      <Icon
        className="absolute bottom-2 right-2 w-6 h-6 text-gray-400 transition-all duration-300 group-hover:scale-110"
        strokeWidth={2.5}
      />
    </button>
  );
}
