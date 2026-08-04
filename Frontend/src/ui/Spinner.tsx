import { Loader2 } from "lucide-react";

export default function Spinner({ label, size = "large" }: { label?: string; size?: "small" | "large" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10">
      <Loader2 className={size === "large" ? "w-8 h-8 animate-spin text-primary" : "w-4 h-4 animate-spin text-primary"} />
      {label && <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>}
    </div>
  );
}
