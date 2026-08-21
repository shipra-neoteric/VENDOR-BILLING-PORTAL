import type { ReactNode } from "react";

// Guide §3.4's exact STATUS_BADGE semantic map — reuse these colors for any
// status badge rather than inventing new ones. amber = pending/waiting,
// blue/indigo = in-progress/approved-stage, green/teal = success/complete,
// red = rejected/blocked/cancelled, gray/slate = neutral/paused,
// orange = variance/warning.
export type NxBadgeColor = "gray" | "amber" | "blue" | "indigo" | "teal" | "orange" | "cyan" | "green" | "slate" | "red";

const COLOR_CLASSES: Record<NxBadgeColor, string> = {
  gray:   "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  amber:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  blue:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  teal:   "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  cyan:   "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  green:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  slate:  "bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300",
  red:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export default function NxBadge({ children, color = "gray" }: { children: ReactNode; color?: NxBadgeColor }) {
  return (
    <span className={["inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-medium", COLOR_CLASSES[color]].join(" ")}>
      {children}
    </span>
  );
}
