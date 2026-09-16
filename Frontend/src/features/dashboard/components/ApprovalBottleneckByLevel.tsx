import { GaugeCircle } from "lucide-react";
import Card from "../../../ui/Card";
import EmptyState from "../../../ui/EmptyState";
import type { ExecutiveDashboardApprovalLevel } from "../../../types/ExecutiveDashboard";

// avgDays severity — same 15/30-day "stuck status" bands
// HEALTH_THRESHOLDS.stuckStatusAttentionDays/stuckStatusCriticalDays already
// use elsewhere in this app (see Backend/src/utils/projectStageRules.js).
function severity(avgDays: number): "red" | "amber" | "green" {
  if (avgDays >= 30) return "red";
  if (avgDays >= 15) return "amber";
  return "green";
}
const TONE = {
  red:   { chip: "bg-red-50 dark:bg-red-500/10", text: "text-red-600 dark:text-red-400", count: "text-red-700 dark:text-red-400" },
  amber: { chip: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", count: "text-amber-700 dark:text-amber-400" },
  green: { chip: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", count: "text-emerald-700 dark:text-emerald-400" },
};

// Where approvals are actually stuck right now — every level of both the
// WorkOrder (checker/approver/final) and BillRequest (L1-L4) chains, each
// with how many items are pending at that exact level and the average days
// they've been sitting there. Data already computed in
// Backend/src/controllers/executiveDashboardController.js's
// `approvalsByLevel` (only non-zero levels, sorted by count) — this is
// purely the visual, no new backend logic. Compact tiles (not a bar list)
// so the card still reads well whether 1 level or all 7 have something
// stuck, instead of a single thin bar leaving most of the card empty.
export default function ApprovalBottleneckByLevel({ approvalsByLevel }: { approvalsByLevel: ExecutiveDashboardApprovalLevel[] }) {
  return (
    <Card size="sm" className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">
          <GaugeCircle className="w-4 h-4 text-primary" />
          Approval Bottleneck by Level
        </h3>
      </div>

      {approvalsByLevel.length === 0 ? (
        <div className="flex-1 flex items-center">
          <EmptyState title="Nothing stuck in approval" message="Every work order and bill request has cleared its approval chain." />
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-2 gap-2 content-start">
          {approvalsByLevel.map(l => {
            const t = TONE[severity(l.avgDays)];
            return (
              <div key={l.level} className={`rounded-lg p-2.5 ${t.chip}`}>
                <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 truncate mb-1" title={l.label}>
                  {l.label}
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-lg font-extrabold tabular-nums ${t.count}`}>{l.count}</span>
                  <span className={`text-[11px] font-semibold whitespace-nowrap ${t.text}`}>avg {l.avgDays}d</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
