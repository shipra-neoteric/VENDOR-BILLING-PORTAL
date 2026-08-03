import type { ReactNode } from "react";

type BadgeColor = "gray" | "orange" | "green" | "red" | "amber" | "blue" | "purple";

const COLOR_CLASSES: Record<BadgeColor, string> = {
  gray:   "bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300",
  orange: "bg-primary/10 text-primary",
  green:  "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
  red:    "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
  amber:  "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  blue:   "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
  purple: "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400",
};

interface BadgeProps {
  children: ReactNode;
  color?: BadgeColor;
  small?: boolean;
}

export default function Badge({ children, color = "gray", small = false }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-md font-bold uppercase tracking-wide",
        small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]",
        COLOR_CLASSES[color],
      ].join(" ")}
    >
      {children}
    </span>
  );
}
