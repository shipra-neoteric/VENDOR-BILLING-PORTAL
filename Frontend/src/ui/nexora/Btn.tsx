import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NxBtnColor = "primary" | "secondary" | "danger" | "success" | "icon";

// Matches the guide's §7 Buttons table exactly: primary uses the dynamic
// theme color (never a hardcoded orange), secondary/danger/success are
// static Tailwind, icon-only buttons get the active:scale-95 press feel.
const COLOR_CLASSES: Record<NxBtnColor, string> = {
  primary: "text-white hover:opacity-90",
  secondary: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600",
  danger: "bg-red-600 hover:bg-red-700 text-white",
  success: "bg-green-600 hover:bg-green-700 text-white",
  icon: "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700",
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
  const isIconOnly = color === "icon";
  return (
    <button
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      style={color === "primary" ? { backgroundColor: "var(--theme-primary)" } : undefined}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium text-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
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
