import type { CategoryOption } from "../../../hooks/useCategories";
import type { WORow, BillRow } from "../utils";
import { billsByWOMap, fmtCr } from "../utils";

interface Props {
  categories: CategoryOption[];
  workOrders: WORow[];
  bills:      BillRow[];
}

export function CategoryProgress({ categories, workOrders, bills }: Props) {
  const billMap = billsByWOMap(bills);

  const stats = categories
    .map(cat => {
      const catWOs    = workOrders.filter(wo => wo.category === cat.name);
      const contract  = catWOs.reduce((s, wo) => s + (wo.contractValue ?? 0), 0);
      const billed    = catWOs.reduce((s, wo) => s + (billMap[wo._id] ?? 0), 0);
      const pct       = contract > 0 ? Math.min(100, (billed / contract) * 100) : 0;
      return { name: cat.name, color: cat.color, contract, billed, pct, count: catWOs.length };
    })
    .filter(c => c.count > 0);

  if (stats.length === 0) {
    return (
      <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
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
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{cat.name}</span>
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>({cat.count} WOs)</span>
            </div>
            <span style={{ fontSize: 12, fontFamily: "monospace", color: cat.color, fontWeight: 700 }}>{cat.pct.toFixed(1)}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "#F3F4F6", overflow: "hidden" }}>
            <div style={{ width: `${cat.pct}%`, height: "100%", background: cat.color, borderRadius: 4, transition: "width 0.6s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>Billed: {fmtCr(cat.billed)}</span>
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>Contract: {fmtCr(cat.contract)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
