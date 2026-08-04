import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

type AlertType = "error" | "success" | "info" | "warning";

const CFG: Record<AlertType, { icon: typeof Info; classes: string; iconClasses: string }> = {
  error:   { icon: XCircle,       classes: "bg-red-50 border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300",       iconClasses: "text-red-500" },
  success: { icon: CheckCircle2,  classes: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300", iconClasses: "text-emerald-500" },
  info:    { icon: Info,          classes: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300",   iconClasses: "text-blue-500" },
  warning: { icon: AlertTriangle, classes: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300", iconClasses: "text-amber-500" },
};

export default function Alert({
  type = "info", message, description,
}: {
  type?: AlertType;
  message: ReactNode;
  description?: ReactNode;
}) {
  const cfg = CFG[type];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${cfg.classes}`}>
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${cfg.iconClasses}`} />
      <div>
        <div className="text-sm font-semibold">{message}</div>
        {description && <div className="text-sm mt-0.5 opacity-90">{description}</div>}
      </div>
    </div>
  );
}
