import { useState } from "react";
import { Link } from "react-router-dom";
import { UserX } from "lucide-react";
import Card from "../../../ui/Card";
import EmptyState from "../../../ui/EmptyState";
import type { ExecutiveDashboardNoApprovalWorkOrder } from "../../../types/ExecutiveDashboard";

// Same real-status labels the 4-level WorkOrder approval chain actually
// uses (see Backend/src/models/WorkOrder.js's approvalStatus enum) — no
// invented role names.
const STATUS_LABEL: Record<ExecutiveDashboardNoApprovalWorkOrder["status"], string> = {
  "draft": "Draft",
  "pending-checker": "Pending Checker",
  "pending-approver": "Pending Approver",
  "pending-final": "Pending Final",
  "sent-back": "Sent Back",
};

export default function NoApprovalWorkOrders({ workOrders }: { workOrders: ExecutiveDashboardNoApprovalWorkOrder[] }) {
  const [showAll, setShowAll] = useState(false);
  // `workOrders` already carries every stuck WO (uncapped) — "View All"
  // really expands into the full list already sitting in memory, no extra
  // fetch needed.
  const visible = showAll ? workOrders : workOrders.slice(0, 8);

  return (
    <Card size="sm">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">
          <UserX className="w-4 h-4 text-red-500" />
          Work Orders — No Approvals
        </h3>
        {workOrders.length > 8 && (
          <button
            type="button"
            onClick={() => setShowAll(v => !v)}
            className="text-xs font-semibold text-primary hover:underline shrink-0"
          >
            {showAll ? "Show Less" : `View All (${workOrders.length})`}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Nothing stuck in approval" message="Every work order has cleared its approval chain in good time." />
      ) : (
        <div className={`space-y-1 ${showAll ? "max-h-[420px] overflow-y-auto pr-0.5" : ""}`}>
          {visible.map(wo => (
            <Link
              key={wo.workOrderId}
              to={`/work-items/${wo.workOrderId}`}
              className="flex items-center gap-2 rounded-lg p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/15 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold truncate text-red-700 dark:text-red-400">{wo.workOrderNo} · {wo.projectName}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{wo.category} · {STATUS_LABEL[wo.status]}</div>
              </div>
              <span className="text-[11px] font-bold text-red-600 dark:text-red-400 whitespace-nowrap">{wo.daysPending}d</span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
