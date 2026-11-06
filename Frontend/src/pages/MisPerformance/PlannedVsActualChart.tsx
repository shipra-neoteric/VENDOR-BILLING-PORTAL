import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useTheme } from "../../context/ThemeContext";
import type { PeriodRow } from "./shared";

const short = (r: PeriodRow, groupBy: "week" | "month") => {
  if (groupBy === "month") return r.label.replace(/ \d{4}$/, "").slice(0, 3) + " " + r.label.slice(-2);
  return `${r.monthLabel.slice(0, 3)} W${r.weekNo}`;
};

// Planned vs actual (Work Done) per week / month, with the completion % line.
export default function PlannedVsActualChart({ rows, groupBy, height = 280 }: { rows: PeriodRow[]; groupBy: "week" | "month"; height?: number }) {
  const { isDark } = useTheme();
  const grid = isDark ? "#273549" : "#F3F4F6";
  const tick = isDark ? "#94A3B8" : "#6B7280";
  const data = rows.map(r => ({ name: short(r, groupBy), full: r.label, Planned: r.planned, "Work Done": r.done, "Completion %": r.completionPct }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={3}>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: tick }} axisLine={false} tickLine={false} interval={0} angle={rows.length > 10 ? -35 : 0} textAnchor={rows.length > 10 ? "end" : "middle"} height={rows.length > 10 ? 52 : 28} />
        <YAxis yAxisId="n" tick={{ fontSize: 11, fill: tick }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis yAxisId="p" orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: tick }} axisLine={false} tickLine={false} />
        <Tooltip
          labelFormatter={(_l, p) => p?.[0]?.payload?.full ?? ""}
          contentStyle={{ borderRadius: 8, border: `1px solid ${isDark ? "#334155" : "#E5E7EB"}`, fontSize: 12, background: isDark ? "#1E293B" : "#fff", color: isDark ? "#F1F5F9" : "#111827" }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
        <Bar yAxisId="n" dataKey="Planned" fill="#FDD7B0" radius={[3, 3, 0, 0]} maxBarSize={22} />
        <Bar yAxisId="n" dataKey="Work Done" fill="#FF7A00" radius={[3, 3, 0, 0]} maxBarSize={22} />
        <Line yAxisId="p" type="monotone" dataKey="Completion %" stroke="#1A1A2E" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
