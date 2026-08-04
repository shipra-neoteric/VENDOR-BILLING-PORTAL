interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  onLabel?: string;
  offLabel?: string;
  disabled?: boolean;
}

export default function Switch({ checked, onChange, onLabel, offLabel, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 ${disabled ? "opacity-50" : "cursor-pointer"}`}
    >
      <span className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${checked ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
      </span>
      {(onLabel || offLabel) && (
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 min-w-[48px]">
          {checked ? (onLabel ?? "") : (offLabel ?? "")}
        </span>
      )}
    </button>
  );
}
