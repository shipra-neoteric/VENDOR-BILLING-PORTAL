import { BarChart3 } from "lucide-react";
import Card from "../../../ui/Card";
import EmptyState from "../../../ui/EmptyState";
import { fmtCr } from "../utils";
import type { ExecutiveDashboardTrendPoint } from "../../../types/ExecutiveDashboard";

const CHART_HEIGHT = 224; // px — matches the h-56 bar area below

// Catmull-Rom -> cubic Bezier conversion — turns the Billed trend's straight
// polyline into a smooth curve through the same data points (no new data,
// just a smoother interpolation between the exact same values). Endpoints
// are clamped by repeating the first/last point as their own neighbor.
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  const p = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export default function BillingVsPaymentTrend({ trend }: { trend: ExecutiveDashboardTrendPoint[] }) {
  const hasData = trend.some(m => m.billed > 0 || m.paid > 0);
  const max = Math.max(1, ...trend.map(m => Math.max(m.billed, m.paid)));
  const n = trend.length;

  // SVG viewBox is one unit wide per month (0..n on x) and 0..100 on y
  // (percent of max, y=0 at top/max, y=100 at bottom/zero) — `preserveAspectRatio="none"`
  // so it stretches to fill the container regardless of month count, while
  // every bar/line coordinate is computed as a plain percentage of `max`.
  const barW = 0.16;
  const gap = 0.03;
  const points = trend.map((m, i) => {
    const x = i + 0.5;
    return { x, billedY: 100 - (m.billed / max) * 100, paidY: 100 - (m.paid / max) * 100, m };
  });
  const smoothLinePath = smoothPath(points.map(p => ({ x: p.x, y: p.billedY })));

  return (
    <Card size="sm" className="h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">
          <BarChart3 className="w-4 h-4 text-primary" />
          Monthly Billing vs Payment Trend
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Billed (trend)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> Paid</span>
        </div>
      </div>

      {!hasData ? (
        <EmptyState title="No billing activity yet" message="Monthly billed vs paid amounts will appear here once bills are raised." />
      ) : (
        <>
          <div className="flex gap-2">
            {/* Y-axis scale labels — 0 / half-max / max of the current data */}
            <div className="flex flex-col justify-between text-[10px] text-gray-400 shrink-0 py-0" style={{ height: CHART_HEIGHT }}>
              <span>{fmtCr(max)}</span>
              <span>{fmtCr(max / 2)}</span>
              <span>₹0</span>
            </div>

            <div className="relative flex-1 min-w-0" style={{ height: CHART_HEIGHT }}>
              {/* Horizontal gridlines at 0% / 50% / 100% */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                <div className="border-t border-gray-100 dark:border-gray-700/40" />
                <div className="border-t border-dashed border-gray-100 dark:border-gray-700/40" />
                <div className="border-t border-gray-100 dark:border-gray-700/40" />
              </div>

              <svg
                className="absolute inset-0 w-full h-full overflow-visible"
                viewBox={`0 0 ${n} 100`}
                preserveAspectRatio="none"
              >
                {points.map(p => (
                  <g key={p.m.month}>
                    <rect
                      x={p.x - barW - gap / 2}
                      y={p.billedY}
                      width={barW}
                      height={Math.max(0.6, 100 - p.billedY)}
                      className="fill-blue-500/25"
                    />
                    <rect
                      x={p.x + gap / 2}
                      y={p.paidY}
                      width={barW}
                      height={Math.max(0.6, 100 - p.paidY)}
                      className="fill-emerald-500"
                    />
                  </g>
                ))}
                <path
                  d={smoothLinePath}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={2}
                  strokeLinecap="round"
                  className="stroke-blue-500"
                />
              </svg>

              {/* Dot markers as plain HTML (not SVG) — the SVG's viewBox is
                  intentionally non-uniform (n months wide, 100 tall) so bars
                  and the line position correctly, but that same non-uniform
                  scaling would stretch an SVG <circle> into an ellipse. A
                  fixed-size HTML dot positioned by percentage avoids that. */}
              {points.map(p => (
                <div
                  key={`${p.m.month}-dot`}
                  className="absolute w-2 h-2 rounded-full bg-blue-500 -translate-x-1/2 -translate-y-1/2 ring-2 ring-white dark:ring-[#1E293B]"
                  style={{ left: `${(p.x / n) * 100}%`, top: `${p.billedY}%` }}
                  title={`${p.m.month}\nBilled: ${fmtCr(p.m.billed)}\nPaid: ${fmtCr(p.m.paid)}`}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-1">
            <div className="w-8 shrink-0" />
            <div className="flex-1 flex">
              {trend.map(m => (
                <span key={m.month} className="flex-1 text-center text-[10px] text-gray-400 truncate">{m.month}</span>
              ))}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto -mx-1">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700/40">
                  <th className="text-left font-semibold text-gray-400 px-2 py-2 whitespace-nowrap">Metric</th>
                  {trend.map(m => (
                    <th key={m.month} className="text-right font-semibold text-gray-400 px-2 py-2 whitespace-nowrap">{m.month}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                <tr>
                  <td className="px-2 py-2 flex items-center gap-1.5 text-[#172033] dark:text-[#F1F5F9] font-medium whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" /> Billed
                  </td>
                  {trend.map(m => <td key={m.month} className="text-right px-2 py-2 tabular-nums">{fmtCr(m.billed)}</td>)}
                </tr>
                <tr>
                  <td className="px-2 py-2 flex items-center gap-1.5 text-[#172033] dark:text-[#F1F5F9] font-medium whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" /> Paid
                  </td>
                  {trend.map(m => <td key={m.month} className="text-right px-2 py-2 tabular-nums">{fmtCr(m.paid)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
