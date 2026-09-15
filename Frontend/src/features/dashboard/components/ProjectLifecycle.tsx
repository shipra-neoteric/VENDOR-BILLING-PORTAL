import {
  Activity, ChevronRight, ClipboardList, FileSignature, HardHat, Receipt, Hourglass,
  FileText, FileCheck2, Stamp, Banknote, TrendingUp, PieChart, CircleDot, AlertCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import Card from "../../../ui/Card";
import Btn from "../../../ui/Btn";
import { fmtCr } from "../utils";
import type { ExecutiveDashboardKPIs, ExecutiveDashboardStageSummaryEntry } from "../../../types/ExecutiveDashboard";

type Tone = "blue" | "green" | "purple" | "amber" | "red" | "gray";

const TONE = {
  blue:   { icon: "text-blue-600 dark:text-blue-400", ring: "bg-blue-50 dark:bg-blue-500/10", bar: "bg-blue-500", text: "text-blue-600 dark:text-blue-400" },
  green:  { icon: "text-emerald-600 dark:text-emerald-400", ring: "bg-emerald-50 dark:bg-emerald-500/10", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  purple: { icon: "text-purple-600 dark:text-purple-400", ring: "bg-purple-50 dark:bg-purple-500/10", bar: "bg-purple-500", text: "text-purple-600 dark:text-purple-400" },
  amber:  { icon: "text-amber-600 dark:text-amber-400", ring: "bg-amber-50 dark:bg-amber-500/10", bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  red:    { icon: "text-red-600 dark:text-red-400", ring: "bg-red-50 dark:bg-red-500/10", bar: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  gray:   { icon: "text-gray-500 dark:text-gray-400", ring: "bg-gray-100 dark:bg-gray-700/40", bar: "bg-gray-400", text: "text-gray-600 dark:text-gray-400" },
} satisfies Record<Tone, { icon: string; ring: string; bar: string; text: string }>;

const STAGE_TILES: { stage: ExecutiveDashboardStageSummaryEntry["stage"]; label: string; icon: LucideIcon; tone: Tone }[] = [
  { stage: "Planning", label: "Planning", icon: ClipboardList, tone: "blue" },
  { stage: "Work Orders Issued", label: "Work Orders Issued", icon: FileSignature, tone: "blue" },
  { stage: "Work in Progress", label: "Work in Progress", icon: HardHat, tone: "green" },
  { stage: "Billing", label: "Billing", icon: Receipt, tone: "purple" },
  { stage: "Payment Pending", label: "Payment Pending", icon: Hourglass, tone: "amber" },
];

const FLOW_TILES: { key: keyof ExecutiveDashboardKPIs; label: string; icon: LucideIcon; tone: Tone; to: string }[] = [
  { key: "totalContractValue", label: "Contract", icon: FileText, tone: "blue", to: "/work-items" },
  { key: "workExecuted", label: "Executed", icon: FileCheck2, tone: "blue", to: "/work-progress" },
  { key: "totalBilled", label: "Billed", icon: Receipt, tone: "purple", to: "/billing" },
  { key: "totalCertified", label: "Certified", icon: Stamp, tone: "amber", to: "/accounts-payment" },
  { key: "totalPaid", label: "Paid", icon: Banknote, tone: "green", to: "/ledger" },
];

// One unified "Project Lifecycle" card combining the stage funnel and the
// contract-to-payment flow (previously two separate cards) plus a bottom
// stats strip — built entirely from numbers already on data.kpis/
// data.stageSummary, no new backend fields. Overall Progress and Paid vs
// Billed are simple ratios of existing totals (workExecuted/contractValue,
// totalPaid/totalBilled), not new metrics.
export default function ProjectLifecycle({
  stageSummary, kpis, activeStage, onSelectStage, onViewDetails, className = "",
}: {
  stageSummary: ExecutiveDashboardStageSummaryEntry[];
  kpis: ExecutiveDashboardKPIs;
  activeStage?: string | null;
  onSelectStage?: (stage: ExecutiveDashboardStageSummaryEntry["stage"]) => void;
  onViewDetails?: () => void;
  className?: string;
}) {
  const countByStage = new Map(stageSummary.map(s => [s.stage, s.count]));

  const overallProgress = kpis.totalContractValue > 0
    ? Math.round((kpis.workExecuted / kpis.totalContractValue) * 100)
    : 0;
  const paidVsBilled = kpis.totalBilled > 0
    ? Math.round((kpis.totalPaid / kpis.totalBilled) * 100)
    : 0;

  return (
    <Card size="sm" className={`flex flex-col ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-primary" strokeWidth={2.25} />
          </div>
          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-wide text-[#172033] dark:text-white">Project Lifecycle</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Real-time project pipeline and financial progress</p>
          </div>
        </div>
        {onViewDetails && (
          <Btn label="View Details" icon={TrendingUp} outline small onClick={onViewDetails} />
        )}
      </div>

      {/* Everything below the header shares out any extra vertical space
          (from matching the taller "Needs Your Attention" panel's height)
          evenly between the three sections via justify-around, instead of
          dumping it all as one large gap in a single spot. */}
      <div className="flex-1 flex flex-col justify-around gap-4">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-[#172033] dark:text-gray-300 mb-2">Project Stage Summary</h3>
          <div className="flex items-stretch gap-1.5 overflow-x-auto">
            {STAGE_TILES.map((s, i) => {
              const Icon = s.icon;
              const t = TONE[s.tone];
              const active = activeStage === s.stage;
              return (
                <div key={s.stage} className="flex items-center flex-1 min-w-[108px]">
                  <button
                    type="button"
                    onClick={() => onSelectStage?.(s.stage)}
                    aria-pressed={active}
                    aria-label={`Filter by ${s.label}`}
                    className={`flex-1 flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 transition-colors ${active ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700/40 hover:bg-gray-50 dark:hover:bg-gray-700/20"}`}
                  >
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${t.ring}`}>
                      <Icon className={`w-4 h-4 ${t.icon}`} strokeWidth={2.25} />
                    </span>
                    <span className={`text-base font-extrabold tabular-nums leading-none ${t.text}`}>{countByStage.get(s.stage) ?? 0}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center leading-snug whitespace-normal">{s.label}</span>
                    <span className={`w-7 h-0.5 rounded-full shrink-0 ${t.bar}`} />
                  </button>
                  {i < STAGE_TILES.length - 1 && (
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 shrink-0 mx-0.5" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-dashed border-gray-200 dark:border-gray-700/40" />

        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-[#172033] dark:text-gray-300 mb-2">Financial Progress</h3>
          <div className="flex items-stretch gap-0 overflow-x-auto">
            {FLOW_TILES.map((n, i) => {
              const Icon = n.icon;
              const t = TONE[n.tone];
              return (
                <div key={n.key} className="flex items-center flex-1 min-w-[92px]">
                  <Link
                    to={n.to}
                    className={`flex-1 flex flex-col items-center gap-1 rounded-lg border-t-2 border-x border-b border-gray-200 dark:border-gray-700/40 px-1.5 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors ${t.text}`}
                    style={{ borderTopColor: "currentColor" }}
                  >
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center ${t.ring} ${t.text}`}>
                      <Icon className={`w-4 h-4 ${t.icon}`} strokeWidth={2.25} />
                    </span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">{n.label}</span>
                    <span className="w-full border-t border-dashed border-gray-200 dark:border-gray-700/40" />
                    <span className="text-sm font-extrabold text-[#172033] dark:text-white tabular-nums">{fmtCr(kpis[n.key] as number)}</span>
                  </Link>
                  {i < FLOW_TILES.length - 1 && (
                    <div className="flex items-center w-3 sm:w-4 shrink-0">
                      <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700/40" />
                      <span className={`w-1.5 h-1.5 rounded-full border-2 shrink-0 ${TONE[n.tone].text}`} style={{ borderColor: "currentColor" }} />
                      <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700/40" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-gray-100 dark:border-gray-700/40 px-3 py-2">
          <StatChip icon={TrendingUp} tone="blue" label="Overall Progress" value={`${overallProgress}%`} />
          <Divider />
          <StatChip icon={PieChart} tone="green" label="Paid vs Billed" value={`${paidVsBilled}%`} />
          <Divider />
          <StatChip icon={CircleDot} tone="amber" label="Outstanding Amount" value={fmtCr(kpis.outstandingAmount)} />
          <Divider />
          <StatChip icon={AlertCircle} tone="red" label="Overdue Amount" value={fmtCr(kpis.overdueAmount)} />
        </div>
      </div>
    </Card>
  );
}

function Divider() {
  return <span className="hidden sm:block w-px h-4 bg-gray-200 dark:bg-gray-700/40" />;
}

function StatChip({ icon: Icon, tone, label, value }: { icon: LucideIcon; tone: Tone; label: string; value: string }) {
  const t = TONE[tone];
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <Icon className={`w-3.5 h-3.5 ${t.icon}`} strokeWidth={2.25} />
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`font-extrabold tabular-nums ${t.text}`}>{value}</span>
    </span>
  );
}
