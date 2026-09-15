import { HeartPulse, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import Card from "../../../ui/Card";
import type { ExecutiveDashboardProjectRow } from "../../../types/ExecutiveDashboard";

// Project Health — a 3-way breakdown of the exact same `health` field
// (Healthy/Attention/Critical) already shown per project row in the table
// and computed by Backend/src/utils/projectStageRules.js's computeHealth.
// Pure client-side group-count of data.projects, no new backend field.
// "On Track"/"At Risk" are just friendlier labels for Healthy/Attention —
// the underlying values and thresholds are unchanged.
export default function ProjectHealth({ projects }: { projects: ExecutiveDashboardProjectRow[] }) {
  const counts = { Healthy: 0, Attention: 0, Critical: 0 };
  for (const p of projects) counts[p.health] = (counts[p.health] ?? 0) + 1;

  const tiles = [
    { key: "Healthy", label: "On Track", count: counts.Healthy, icon: CheckCircle2, bg: "bg-emerald-50 dark:bg-emerald-500/10", iconBg: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
    { key: "Attention", label: "At Risk", count: counts.Attention, icon: AlertTriangle, bg: "bg-amber-50 dark:bg-amber-500/10", iconBg: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
    { key: "Critical", label: "Critical", count: counts.Critical, icon: XCircle, bg: "bg-red-50 dark:bg-red-500/10", iconBg: "bg-red-500", text: "text-red-700 dark:text-red-400" },
  ] as const;

  return (
    <Card size="sm">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <HeartPulse className="w-3.5 h-3.5 text-primary" strokeWidth={2.25} />
        </div>
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-[#172033] dark:text-white">Project Health</h2>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {tiles.map(t => {
          const Icon = t.icon;
          return (
            <div key={t.key} className={`flex items-center gap-1.5 rounded-lg ${t.bg} px-2 py-1.5`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${t.iconBg}`}>
                <Icon className="w-3.5 h-3.5 text-white" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <span className={`text-sm font-extrabold tabular-nums ${t.text}`}>{t.count}</span>
                <span className={`text-[10px] font-semibold ml-1 ${t.text}`}>{t.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
