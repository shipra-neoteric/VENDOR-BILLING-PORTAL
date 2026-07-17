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
      <div style={{ color: "var(--nx-text-muted)", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
        No category data yet. Assign categories to work orders.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {stats.map(cat => (
        <div key={cat.name}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: cat.color, display: "inline-block" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--nx-text-3)" }}>{cat.name}</span>
              <span style={{ fontSize: 11, color: "var(--nx-text-muted)" }}>({cat.count} WOs)</span>
            </div>
            <span style={{ fontSize: 12, fontFamily: "monospace", color: cat.color, fontWeight: 700 }}>{cat.pct.toFixed(1)}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "var(--nx-fill)", overflow: "hidden" }}>
            <div style={{ width: `${cat.pct}%`, height: "100%", background: cat.color, borderRadius: 4, transition: "width 0.6s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
            <span style={{ fontSize: 11, color: "var(--nx-text-muted)" }}>Billed: {fmtCr(cat.billed)}</span>
            <span style={{ fontSize: 11, color: "var(--nx-text-muted)" }}>Contract: {fmtCr(cat.contract)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
