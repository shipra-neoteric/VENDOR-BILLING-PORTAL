import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type BtnColor = "primary" | "purple" | "red" | "green" | "amber" | "outline" | "dark";

// `text` is kept separate from `bg` so it can be skipped when the caller
// passes their own `style.color` (e.g. an icon-only button tinted to match
// a category's brand color) — otherwise the two would fight each other.
const COLOR_CLASSES: Record<BtnColor, { bg: string; text: string }> = {
  primary: { bg: "bg-primary hover:bg-primary/90 shadow-md shadow-primary/20", text: "text-white!" },
  purple:  { bg: "bg-[#8B5CF6] hover:bg-[#7c3aed]", text: "text-white!" },
  red:     { bg: "bg-[#EF4444] hover:bg-[#dc2626]", text: "text-white!" },
  green:   { bg: "bg-[#10B981] hover:bg-[#059669]", text: "text-white!" },
  amber:   { bg: "bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20", text: "text-amber-600!" },
  outline: { bg: "border border-gray-200 dark:border-gray-700 bg-white dark:bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800", text: "text-gray-700! dark:text-[#F1F5F9]!" },
  // A true neutral (no blue undertone) — pairs with the orange brand accent
  // better than gray-800/#1E293B's cool blue-slate tint did.
  dark:    { bg: "bg-neutral-800 hover:bg-neutral-700 border border-neutral-700", text: "text-white!" },
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
  disabled, className = "", style, children, ...rest
}: BtnProps) {
  const resolvedColor: BtnColor = outline ? "outline" : color;
  // The trailing `!` on COLOR_CLASSES[...].text forces `!important` — antd
  // injects its own global reset (`input, button, select, optgroup, textarea
  // { color: inherit }`) as plain, unlayered CSS, which otherwise silently
  // beats every Tailwind text-color utility regardless of specificity
  // (Tailwind wraps its own utilities in a CSS layer, and per the Cascade
  // Layers spec, unlayered rules always win over layered ones). Skipped
  // entirely when the caller supplies their own `style.color`, since an
  // author !important class would otherwise beat that inline override too.
  const hasCustomTextColor = !!style?.color;
  return (
    <button
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      style={style}
      className={[
        "inline-flex items-center justify-center gap-1.5 rounded-md font-bold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100",
        small ? "h-[32px] px-3 text-[11px]" : "h-[40px] px-6 text-[13px]",
        COLOR_CLASSES[resolvedColor].bg,
        hasCustomTextColor ? "" : COLOR_CLASSES[resolvedColor].text,
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
