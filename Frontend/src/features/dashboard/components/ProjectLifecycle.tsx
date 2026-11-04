import {
  ChevronRight, ClipboardList, FileSignature, HardHat, Receipt, Hourglass,
  TrendingUp, Briefcase, BarChart3, ReceiptText, UserCheck, PenTool,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Card from "../../../ui/Card";
import Btn from "../../../ui/Btn";
import type { ExecutiveDashboardActivity, ExecutiveDashboardKPIs, ExecutiveDashboardStageSummaryEntry } from "../../../types/ExecutiveDashboard";

type Tone = "blue" | "green" | "purple" | "amber" | "red" | "gray";

const TONE = {
  blue:   { icon: "text-blue-600 dark:text-blue-400", tile: "bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20", text: "text-blue-600 dark:text-blue-400" },
  green:  { icon: "text-emerald-600 dark:text-emerald-400", tile: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20", text: "text-emerald-600 dark:text-emerald-400" },
  purple: { icon: "text-purple-600 dark:text-purple-400", tile: "bg-purple-50 dark:bg-purple-500/10 border-purple-100 dark:border-purple-500/20", text: "text-purple-600 dark:text-purple-400" },
  amber:  { icon: "text-amber-600 dark:text-amber-400", tile: "bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20", text: "text-amber-600 dark:text-amber-400" },
  red:    { icon: "text-red-600 dark:text-red-400", tile: "bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20", text: "text-red-600 dark:text-red-400" },
  gray:   { icon: "text-gray-500 dark:text-gray-400", tile: "bg-gray-50 dark:bg-gray-700/40 border-gray-100 dark:border-gray-700/40", text: "text-gray-600 dark:text-gray-400" },
} satisfies Record<Tone, { icon: string; tile: string; text: string }>;

const STAGE_TILES: { stage: ExecutiveDashboardStageSummaryEntry["stage"]; label: string; icon: LucideIcon; tone: Tone }[] = [
  { stage: "Planning", label: "Planning", icon: ClipboardList, tone: "blue" },
  { stage: "Work Orders Issued", label: "Work Orders Issued", icon: FileSignature, tone: "blue" },
  { stage: "Work in Progress", label: "Work in Progress", icon: HardHat, tone: "green" },
  { stage: "Billing", label: "Billing", icon: Receipt, tone: "purple" },
  { stage: "Payment Pending", label: "Payment Pending", icon: Hourglass, tone: "amber" },
];

// Current operational workload, one compact item per data.activity field (see ExecutiveDashboardActivity's own
// comment in Frontend/src/types/ExecutiveDashboard.ts, and executiveDashboardController.js's `activity` block).
const ACTIVITY_TILES: { key: keyof ExecutiveDashboardActivity; label: string; status: string; icon: LucideIcon; tone: Tone }[] = [
  { key: "workOrdersActive", label: "Work Orders", status: "Active", icon: Briefcase, tone: "blue" },
  { key: "siteProgressPending", label: "Site Progress / DPR", status: "Pending", icon: BarChart3, tone: "purple" },
  { key: "billsAwaitingVerification", label: "Bills", status: "Awaiting Verification", icon: ReceiptText, tone: "amber" },
  { key: "approvalsPending", label: "Approvals", status: "Pending", icon: UserCheck, tone: "red" },
  { key: "drawingRequestsOpen", label: "Drawing Requests", status: "Open", icon: PenTool, tone: "green" },
];

// Stage summary tiles (tinted, one per stage) followed by an "Activity at a Glance" card: the five workload counts
// in one row, and the overall progress (work executed ÷ contract value) as a bar underneath.
export default function ProjectLifecycle({
  stageSummary, kpis, activity, activeStage, onSelectStage, onViewDetails, className = "",
}: {
  stageSummary: ExecutiveDashboardStageSummaryEntry[];
  kpis: ExecutiveDashboardKPIs;
  activity: ExecutiveDashboardActivity;
  activeStage?: string | null;
  onSelectStage?: (stage: ExecutiveDashboardStageSummaryEntry["stage"]) => void;
  onViewDetails?: () => void;
  className?: string;
}) {
  const countByStage = new Map(stageSummary.map(s => [s.stage, s.count]));

  const overallProgress = kpis.totalContractValue > 0
    ? Math.round((kpis.workExecuted / kpis.totalContractValue) * 100)
    : 0;

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {onViewDetails && (
        <div className="flex justify-end">
          <Btn label="View Details" icon={TrendingUp} outline small onClick={onViewDetails} />
        </div>
      )}

      <div className="grid grid-cols-[repeat(5,minmax(120px,1fr))] gap-4 overflow-x-auto">
        {STAGE_TILES.map((s, i) => {
          const Icon = s.icon;
          const t = TONE[s.tone];
          const active = activeStage === s.stage;
          return (
            <div key={s.stage} className="relative flex">
              <button
                type="button"
                onClick={() => onSelectStage?.(s.stage)}
                aria-pressed={active}
                aria-label={`Filter by ${s.label}`}
                className={`flex-1 flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 transition-shadow hover:shadow-md ${t.tile} ${active ? "ring-2 ring-primary" : ""}`}
              >
                <span className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center shrink-0">
                  <Icon className={`w-4 h-4 ${t.icon}`} strokeWidth={2.25} />
                </span>
                <span className={`text-xl font-extrabold tabular-nums leading-none ${t.text}`}>{countByStage.get(s.stage) ?? 0}</span>
                <span className="text-[11px] text-gray-600 dark:text-gray-300 text-center leading-snug">{s.label}</span>
              </button>
              {i < STAGE_TILES.length - 1 && (
                <ChevronRight className="absolute -right-[15px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
              )}
            </div>
          );
        })}
      </div>

      <Card>
        <h3 className="text-sm font-bold text-[#172033] dark:text-white mb-4">Activity at a Glance</h3>
        <div className="grid grid-cols-[repeat(5,minmax(130px,1fr))] gap-4 overflow-x-auto">
          {ACTIVITY_TILES.map((n) => {
            const Icon = n.icon;
            const t = TONE[n.tone];
            return (
              <div key={n.key} className="flex items-center gap-3 min-w-0">
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${t.tile}`}>
                  <Icon className={`w-4 h-4 ${t.icon}`} strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <div className="text-lg font-extrabold tabular-nums leading-none text-[#172033] dark:text-white">{activity[n.key]}</div>
                  <div className="text-[11px] text-gray-600 dark:text-gray-300 truncate mt-1">{n.label}</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{n.status}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-lg border border-gray-100 dark:border-gray-700/40 px-3 py-2.5">
          <TrendingUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" strokeWidth={2.25} />
          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">Overall Progress</span>
          <span className="text-xs font-extrabold tabular-nums text-blue-600 dark:text-blue-400 shrink-0">{overallProgress}%</span>
          <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, overallProgress)}%` }} />
          </div>
        </div>
      </Card>
    </div>
  );
}
