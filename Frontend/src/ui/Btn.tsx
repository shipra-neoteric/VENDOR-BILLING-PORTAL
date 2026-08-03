import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type BtnColor = "primary" | "purple" | "red" | "green" | "amber" | "outline" | "dark";

const COLOR_CLASSES: Record<BtnColor, string> = {
  primary: "bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20",
  purple:  "bg-[#8B5CF6] text-white hover:bg-[#7c3aed]",
  red:     "bg-[#EF4444] text-white hover:bg-[#dc2626]",
  green:   "bg-[#10B981] text-white hover:bg-[#059669]",
  amber:   "bg-amber-500/10 text-amber-600 border border-amber-500/20 hover:bg-amber-500/20",
  outline: "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-[#F1F5F9] bg-white dark:bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800",
  dark:    "bg-gray-800 dark:bg-[#1E293B] border dark:border-gray-700 text-white hover:bg-gray-700",
};

interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  label?: string;
  icon?: LucideIcon;
  color?: BtnColor;
  small?: boolean;
  outline?: boolean;
  loading?: boolean;
}

export default function Btn({
  label, icon: Icon, color = "dark", small = false, outline = false, loading = false,
  disabled, className = "", children, ...rest
}: BtnProps) {
  const resolvedColor: BtnColor = outline ? "outline" : color;
  return (
    <button
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      className={[
        "inline-flex items-center justify-center gap-1.5 rounded-md font-bold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100",
        small ? "h-[32px] px-3 text-[11px]" : "h-[40px] px-6 text-[13px]",
        COLOR_CLASSES[resolvedColor],
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <Loader2 className={small ? "w-3.5 h-3.5 animate-spin" : "w-4 h-4 animate-spin"} />
      ) : (
        Icon && <Icon className={small ? "w-3.5 h-3.5" : "w-4 h-4"} />
      )}
      {label ?? children}
    </button>
  );
}
