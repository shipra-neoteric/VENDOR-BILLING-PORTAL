import type { CategoryOption } from "../../../hooks/useCategories";
import type { WORow, BillRow } from "../utils";
import { billsByWOMap, fmtCr } from "../utils";

interface Props {
  categories: CategoryOption[];
  workOrders: WORow[];
  bills:      BillRow[];
  limit?: number;
}

export function CategoryProgress({ categories, workOrders, bills, limit }: Props) {
  const billMap = billsByWOMap(bills);

  const allStats = categories
    .map(cat => {
      const catWOs    = workOrders.filter(wo => wo.category === cat.name);
      const contract  = catWOs.reduce((s, wo) => s + (wo.contractValue ?? 0), 0);
      const billed    = catWOs.reduce((s, wo) => s + (billMap[wo._id] ?? 0), 0);
      const pct       = contract > 0 ? Math.min(100, (billed / contract) * 100) : 0;
      return { name: cat.name, color: cat.color, contract, billed, pct, count: catWOs.length };
    })
    .filter(c => c.count > 0);
  const stats = limit ? allStats.slice(0, limit) : allStats;

  if (stats.length === 0) {
    return (
      <div className="text-[13px] text-gray-400 text-center py-6">
        No category data yet. Assign categories to work orders.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {stats.map(cat => (
        <div key={cat.name}>
          <div className="flex justify-between items-center mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cat.color }} />
              <span className="text-[13px] font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{cat.name}</span>
              <span className="text-[11px] text-gray-400">({cat.count} WOs)</span>
            </div>
            <span className="text-xs font-mono font-bold" style={{ color: cat.color }}>{cat.pct.toFixed(1)}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${cat.pct}%`, background: cat.color }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[11px] text-gray-400">Billed: {fmtCr(cat.billed)}</span>
            <span className="text-[11px] text-gray-400">Contract: {fmtCr(cat.contract)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
