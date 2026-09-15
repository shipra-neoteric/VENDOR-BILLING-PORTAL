import { Link } from "react-router-dom";
import { PieChart, ChevronRight } from "lucide-react";
import Card from "../../../ui/Card";
import EmptyState from "../../../ui/EmptyState";
import { fmtCr } from "../utils";
import type { ExecutiveDashboardCategorySpend } from "../../../types/ExecutiveDashboard";

// Fixed categorical order (this app has no chart-color ramp of its own yet —
// these are the same badge hues Badge.tsx already ships, assigned in a fixed
// sequence rather than cycled/generated per render) — a category beyond the
// 8th just repeats the last hue rather than inventing a new one.
const BAR_COLORS = [
  "bg-primary", "bg-blue-500", "bg-emerald-500", "bg-purple-500",
  "bg-amber-500", "bg-teal-500", "bg-red-400", "bg-gray-400",
];

export default function SpendByCategory({ categorySpend }: { categorySpend: ExecutiveDashboardCategorySpend[] }) {
  const top = categorySpend.slice(0, 8);
  return (
    <Card size="sm">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">
          <PieChart className="w-4 h-4 text-primary" />
          Spend by Category
        </h3>
        <Link to="/categories" className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5 shrink-0">
          View All <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {top.length === 0 ? (
        <EmptyState title="No billed spend yet" message="Categories will appear here once bills are raised against work orders." />
      ) : (
        <div className="space-y-2">
          {top.map((c, i) => (
            <div key={c.category}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="font-semibold text-[#172033] dark:text-[#F1F5F9] truncate">{c.category}</span>
                <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">{fmtCr(c.amount)} · {c.percent}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${BAR_COLORS[Math.min(i, BAR_COLORS.length - 1)]}`}
                  style={{ width: `${Math.max(2, Math.min(100, c.percent))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
