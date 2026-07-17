// Small, dependency-free chart primitives (hand-rolled SVG) shared by the
// Operational and Financial dashboard views — keeps bundle size unchanged,
// no charting library needed for this scale of data.
import { Drawer } from "antd";
import type { DPRDetailRow } from "../../../types/DPR";

export type ComparisonMode = "none" | "yesterday" | "avg7d" | "avg30d";
export const COMPARISON_LABELS: Record<Exclude<ComparisonMode, "none">, string> = {
  yesterday: "vs yesterday",
  avg7d: "vs 7-day avg",
  avg30d: "vs 30-day avg",
};

export function Gauge({ score, size = 140, color }: { score: number; size?: number; color?: string }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  const c = color || (score >= 90 ? "#16a34a" : score >= 70 ? "#f59e0b" : "#e03b3b");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.24} fontWeight={800} fill={c}>{score}%</text>
    </svg>
  );
}

export function BarRow({ label, value, max, count, color = "#f37916" }: { label: string; value: number; max: number; count?: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span style={{ width: 140, fontSize: 12.5, color: "#374151", flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={label}>{label}</span>
      <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 4, height: 16 }}>
        <div style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`, background: color, height: "100%", borderRadius: 4, minWidth: value > 0 ? 4 : 0, transition: "width 0.4s" }} />
      </div>
      <span style={{ width: 90, fontSize: 12.5, fontWeight: 700, color: "#374151", textAlign: "right", flexShrink: 0 }}>{count !== undefined ? count : value}</span>
    </div>
  );
}

export function TrendLine({ points, height = 120, color = "#2563eb", formatValue }: { points: { date: string; value: number }[]; height?: number; color?: string; formatValue?: (n: number) => string }) {
  if (points.length < 2) return <div style={{ fontSize: 12.5, color: "#9CA3AF", padding: "20px 0", textAlign: "center" }}>Not enough data yet.</div>;
  const W = 600, H = height, pad = 20;
  const values = points.map(p => p.value);
  const max = Math.max(1, ...values);
  const xStep = (W - pad * 2) / (points.length - 1);
  const toY = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const linePts = points.map((p, i) => `${pad + i * xStep},${toY(p.value)}`).join(" ");
  const areaPts = `${pad},${H - pad} ${linePts} ${pad + (points.length - 1) * xStep},${H - pad}`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polygon points={areaPts} fill={color} opacity={0.08} />
      <polyline points={linePts} fill="none" stroke={color} strokeWidth={2.5} />
      {points.map((p, i) => (
        <circle key={p.date} cx={pad + i * xStep} cy={toY(p.value)} r={2.6} fill={color}>
          <title>{p.date}: {formatValue ? formatValue(p.value) : p.value}</title>
        </circle>
      ))}
    </svg>
  );
}

export function Donut({ segments, size = 160 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const stroke = size * 0.22;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  let offsetAcc = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        {total === 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={stroke} />
        ) : segments.map(seg => {
          const frac = seg.value / total;
          const dash = frac * circumference;
          const el = (
            <circle
              key={seg.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={seg.color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offsetAcc}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offsetAcc += dash;
          return el;
        })}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.16} fontWeight={800} fill="#374151">{total}</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {segments.map(seg => (
          <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: seg.color, display: "inline-block", flexShrink: 0 }} />
            <span style={{ color: "#374151" }}>{seg.label}</span>
            <span style={{ color: "#9CA3AF" }}>({seg.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Funnel({ stages, colorFor }: { stages: { label: string; count: number }[]; colorFor?: (i: number, count: number) => string }) {
  return (
    <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
      {stages.map((s, i) => {
        const color = colorFor ? colorFor(i, s.count) : "#f37916";
        return (
          <div key={s.label} style={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}>
            <div style={{ minWidth: 110, textAlign: "center", padding: "0 6px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={s.label}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color }}>{s.count}</div>
            </div>
            {i < stages.length - 1 && <div style={{ width: 22, height: 2, background: "#D1D5DB", flexShrink: 0 }} />}
          </div>
        );
      })}
    </div>
  );
}

export function Panel({ title, sub, children, tall }: { title: string; sub?: string; children: React.ReactNode; tall?: boolean }) {
  return (
    <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 16, boxShadow: "0 1px 6px rgba(0,0,0,0.04)", overflow: "hidden", height: tall ? "100%" : undefined }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6" }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#374151" }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

export function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>{children}</div>;
}

export function BriefBanner({ icon, title, briefs }: { icon: string; title: string; briefs: string[] }) {
  return (
    <div style={{ background: "linear-gradient(135deg, #1F2937 0%, #111827 100%)", borderRadius: 18, padding: 26, marginBottom: 24, color: "#fff" }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
        {icon} {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {briefs.map((b, i) => (
          <div key={i} style={{ fontSize: 13.5, color: "#E5E7EB", display: "flex", gap: 8 }}>
            <span style={{ color: "#f37916", flexShrink: 0 }}>•</span>
            <span>{b}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const fmtMoney = (n: number) => n ? "₹" + Math.round(n).toLocaleString("en-IN") : "₹0";
export const statusColor = (pct: number) => pct >= 90 ? "#16a34a" : pct >= 60 ? "#f59e0b" : "#e03b3b";

export function KpiCard({
  icon, label, value, color = "#374151", change, comparisonMode, onClick,
}: {
  icon: string; label: string; value: React.ReactNode; color?: string;
  change?: number | null; comparisonMode?: ComparisonMode; onClick?: () => void;
}) {
  const showChange = comparisonMode && comparisonMode !== "none" && change !== undefined;
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 14, padding: "16px 18px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)", cursor: onClick ? "pointer" : undefined,
        transition: "box-shadow 0.15s, transform 0.15s",
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; }}
    >
      <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 10.5, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 3 }}>{value}</div>
      {showChange && (
        <div style={{ fontSize: 11, marginTop: 5, color: change === null ? "#9CA3AF" : change > 0 ? "#16a34a" : change < 0 ? "#e03b3b" : "#9CA3AF" }}>
          {change === null ? "New activity" : `${change > 0 ? "▲" : change < 0 ? "▼" : "–"} ${Math.abs(change)}% ${COMPARISON_LABELS[comparisonMode as Exclude<ComparisonMode, "none">]}`}
        </div>
      )}
    </div>
  );
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 24 }}>{children}</div>;
}

export function DrillDownDrawer({
  open, onClose, title, rows, formatValue = fmtMoney,
}: {
  open: boolean; onClose: () => void; title: string; rows: DPRDetailRow[]; formatValue?: (n: number) => string;
}) {
  return (
    <Drawer title={title} open={open} onClose={onClose} width={460}>
      {rows.length === 0 ? (
        <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No records for this metric.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r, i) => (
            <div key={r.id || i} style={{ border: "1px solid #F3F4F6", borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>{r.label}</span>
                {r.value > 0 && <span style={{ fontSize: 12.5, fontWeight: 700, color: "#2563eb" }}>{formatValue(r.value)}</span>}
              </div>
              <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 2 }}>{r.project}{r.vendor ? ` · ${r.vendor}` : ""}</div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
