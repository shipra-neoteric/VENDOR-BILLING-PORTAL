import type { ReactNode } from "react";
import { Check } from "lucide-react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}

export default function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  return (
    <label className={`inline-flex items-center gap-2 select-none ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          "w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 transition-colors",
          checked ? "bg-primary border-primary" : "bg-white dark:bg-transparent border-gray-300 dark:border-gray-600",
        ].join(" ")}
      >
        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </button>
      {label && <span className="text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{label}</span>}
    </label>
  );
}
