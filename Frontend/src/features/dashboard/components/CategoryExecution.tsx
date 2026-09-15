import { HardHat } from "lucide-react";
import Card from "../../../ui/Card";
import EmptyState from "../../../ui/EmptyState";
import { fmtCr } from "../utils";
import type { ExecutiveDashboardCategoryExecution } from "../../../types/ExecutiveDashboard";

export default function CategoryExecution({ categoryExecution }: { categoryExecution: ExecutiveDashboardCategoryExecution[] }) {
  const top = categoryExecution.slice(0, 8);
  return (
    <Card size="sm">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">
          <HardHat className="w-4 h-4 text-primary" />
          Work Order Execution by Category
        </h3>
      </div>

      {top.length === 0 ? (
        <EmptyState title="No work orders yet" message="Category execution will appear here once work orders are raised." />
      ) : (
        <div className="space-y-2.5">
          {top.map(c => (
            <div key={c.category}>
              <div className="flex items-center justify-between text-xs mb-0.5 gap-2">
                <span className="font-semibold text-[#172033] dark:text-[#F1F5F9] truncate">
                  {c.category} <span className="text-gray-400 font-normal">({c.totalWorkOrders} WOs)</span>
                </span>
                <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {fmtCr(c.executedValue)} exec. {"·"} {fmtCr(c.remainingValue)} left
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(2, c.completedPercent)}%` }} />
                </div>
                <span className="text-[11px] font-semibold tabular-nums w-8 text-right shrink-0">{c.completedPercent}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
