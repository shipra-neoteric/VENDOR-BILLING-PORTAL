import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { BillRow } from "../utils";
import { getMonthlyBillingTrend } from "../utils";
import { useTheme } from "../../../context/ThemeContext";

interface Props { bills: BillRow[]; }

const tickFmt = (v: number) =>
  v >= 100_000 ? `${(v / 100_000).toFixed(0)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tooltipFmt = (v: any) => [`₹${Number(v ?? 0).toLocaleString("en-IN")}`, ""];

export function BillingChart({ bills }: Props) {
  const { isDark } = useTheme();
  const data = getMonthlyBillingTrend(bills);
  if (data.length === 0) return null;

  const gridColor  = isDark ? "#273549" : "#F3F4F6";
  const tickColor  = isDark ? "#64748B" : "#6B7280";
  const tickColor2 = isDark ? "#64748B" : "#9CA3AF";
  const tooltipBg  = isDark ? "#1E293B" : "#ffffff";
  const tooltipBorder = isDark ? "#334155" : "#E5E7EB";

  return (
    <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "20px 24px", marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--nx-text-3)", marginBottom: 16 }}>Monthly Billing Trend</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barSize={16} barGap={4} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: tickColor }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={tickFmt} tick={{ fontSize: 11, fill: tickColor2 }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={tooltipFmt}
            contentStyle={{ borderRadius: 8, border: `1px solid ${tooltipBorder}`, fontSize: 12, background: tooltipBg, color: isDark ? "#F1F5F9" : "#111827" }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Bar dataKey="submitted" name="Submitted/Verified" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          <Bar dataKey="approved"  name="Approved"           fill="#16a34a" radius={[3, 3, 0, 0]} />
          <Bar dataKey="paid"      name="Paid"               fill="#0d9488" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
