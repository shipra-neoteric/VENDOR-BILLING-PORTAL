import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NxBtnColor =
  | "primary" | "secondary" | "danger" | "success" | "icon"
  // Named icon-only colors — a fixed per-action-type palette for row-action
  // icons (view/download/edit/lock/approve/reject/cancel/delete), so the same
  // action always reads as the same color everywhere it appears, instead of
  // every icon defaulting to the same neutral gray.
  | "icon-blue" | "icon-pink" | "icon-gray" | "icon-amber" | "icon-green" | "icon-red";

// Matches the guide's §7 Buttons table exactly: primary uses the dynamic
// theme color (never a hardcoded orange), secondary/danger/success are
// static Tailwind, icon-only buttons get the active:scale-95 press feel.
const COLOR_CLASSES: Record<NxBtnColor, string> = {
  // `!` forces !important — antd (still loaded during the Nexora migration)
  // injects its own global, unlayered `button { color: inherit }` reset
  // that otherwise silently beats this Tailwind utility (see ui/Btn.tsx's
  // identical note, and index.css's "Direct Button Target" section).
  primary: "text-white! hover:opacity-90",
  secondary: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600",
  danger: "bg-red-600 hover:bg-red-700 text-white",
  success: "bg-green-600 hover:bg-green-700 text-white",
  icon: "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700",
  "icon-blue":  "text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-500/10",
  "icon-pink":  "text-pink-500 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 hover:bg-pink-50 dark:hover:bg-pink-500/10",
  "icon-gray":  "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700",
  "icon-amber": "text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10",
  "icon-green": "text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-500/10",
  "icon-red":   "text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10",
};

interface NxBtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  label?: string;
  icon?: LucideIcon;
  color?: NxBtnColor;
  loading?: boolean;
}

export default function NxBtn({
  label, icon: Icon, color = "primary", loading = false, disabled, className = "", children, ...rest
}: NxBtnProps) {
  const isIconOnly = color === "icon" || color.startsWith("icon-");
  return (
    <button
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      style={color === "primary" ? { backgroundColor: "var(--theme-primary)" } : undefined}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
        isIconOnly ? "w-8 h-8" : "px-4 py-2",
        COLOR_CLASSES[color],
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        Icon && <Icon className="w-4 h-4" />
      )}
      {!isIconOnly && (label ?? children)}
    </button>
  );
}
