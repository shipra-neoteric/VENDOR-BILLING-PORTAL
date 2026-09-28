import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GaugeCircle, ChevronRight } from "lucide-react";
import Card from "../../../ui/Card";
import Modal from "../../../ui/Modal";
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

// Where each level's items actually live — clicking a row deep-links straight
// into that exact document's own detail drawer on its real page, via the
// same auto-open query params those pages already read (WorkItems' ?wo=,
// BillRequests' ?open=, AccountsPayment's ?bill=), instead of duplicating
// any detail view here.
function linkFor(type: ExecutiveDashboardApprovalLevel["type"], id: string): string {
  if (type === "work-order") return `/work-items?wo=${id}`;
  if (type === "bill-request") return `/bill-requests?open=${id}`;
  return `/accounts-payment?bill=${id}`;
}

const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN");

// Where approvals are actually stuck right now — every level of the
// WorkOrder (checker/approver/final), BillRequest (L1-L4) and Accounts
// Payment (Verification/L1/L2 Director) chains, each with how many items are
// pending at that exact level and the average days they've been sitting
// there. Data already computed in
// Backend/src/controllers/executiveDashboardController.js's
// `approvalsByLevel` (only non-zero levels, sorted by count) — this is
// purely the visual, no new backend logic beyond exposing the per-item list.
// Clicking a tile opens a side drawer listing every item stuck at that
// level; clicking one of those navigates to its own page and opens its
// detail drawer there.
export default function ApprovalBottleneckByLevel({ approvalsByLevel }: { approvalsByLevel: ExecutiveDashboardApprovalLevel[] }) {
  const navigate = useNavigate();
  const [openLevel, setOpenLevel] = useState<ExecutiveDashboardApprovalLevel | null>(null);

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
              <button
                key={l.level}
                type="button"
                onClick={() => setOpenLevel(l)}
                className={`text-left rounded-lg p-2.5 transition-opacity hover:opacity-80 ${t.chip}`}
              >
                <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 truncate mb-1" title={l.label}>
                  {l.label}
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-lg font-extrabold tabular-nums ${t.count}`}>{l.count}</span>
                  <span className={`text-[11px] font-semibold whitespace-nowrap ${t.text}`}>avg {l.avgDays}d</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {openLevel && (
        <Modal
          icon={GaugeCircle}
          title={openLevel.label}
          subtitle={`${openLevel.count} item${openLevel.count !== 1 ? "s" : ""} pending at this stage — click one to open it`}
          onClose={() => setOpenLevel(null)}
        >
          <div className="flex flex-col gap-1.5">
            {openLevel.items.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => { navigate(linkFor(openLevel.type, item.id)); setOpenLevel(null); }}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700/40 px-3 py-2.5 text-left hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-bold text-sm text-[#172033] dark:text-[#F1F5F9] truncate">{item.primary}</div>
                  {item.secondary && <div className="text-xs text-gray-400 truncate">{item.secondary}</div>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-xs font-semibold text-[#172033] dark:text-[#F1F5F9]">{fmt(item.amount)}</div>
                    <div className="text-[11px] text-gray-400">{item.daysPending}d pending</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </Card>
  );
}
