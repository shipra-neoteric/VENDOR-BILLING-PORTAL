import { useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { PAIR_LIGHT, PAIR_DARK } from "./palette";

export interface GroupedBarGroup {
  label: string;
  values: [number, number];
}

// Picks a "nice" axis step (1/2/5 × a power of ten) for ~targetTicks gridlines,
// so the axis reads 0/10/20/30/40 instead of an arbitrary raw-data interval.
function niceStep(max: number, targetTicks = 4): number {
  const rough = max / targetTicks || 1;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const stepUnit = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return stepUnit * mag;
}

// Two-series magnitude comparison per category (month) — thin rounded bars, a
// recessive Y-axis with gridlines, a legend (always present for ≥2 series),
// and a per-mark hover tooltip + dim-the-others highlight on the paired bar.
export default function GroupedBar({
  groups, seriesLabels, formatValue = (n: number) => String(n), formatAxisValue, height = 200,
}: { groups: GroupedBarGroup[]; seriesLabels: [string, string]; formatValue?: (n: number) => string; formatAxisValue?: (n: number) => string; height?: number }) {
  const { isDark } = useTheme();
  const colors = isDark ? PAIR_DARK : PAIR_LIGHT;
  const [hover, setHover] = useState<{ groupIdx: number; seriesIdx: number } | null>(null);

  if (groups.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">No data yet.</div>;
  }

  const rawMax = Math.max(1, ...groups.flatMap(g => g.values));
  const step = niceStep(rawMax);
  const axisMax = Math.ceil(rawMax / step) * step;
  const ticks = Array.from({ length: Math.round(axisMax / step) + 1 }, (_, i) => i * step);
  const axisFmt = formatAxisValue ?? ((n: number) => String(n));

  const W = 600, H = height, padTop = 10, padBottom = 24, padLeft = 40, padRight = 8;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;
  const groupW = plotW / groups.length;
  const barW = Math.min(22, groupW * 0.28);
  const barGap = 4;
  const yFor = (v: number) => padTop + plotH - (v / axisMax) * plotH;

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        {seriesLabels.map((label, i) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colors[i] }} />
            {label}
          </span>
        ))}
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {ticks.map(t => {
          const y = yFor(t);
          return (
            <g key={t}>
              <line x1={padLeft} y1={y} x2={W - padRight} y2={y} stroke="currentColor" className="text-gray-100 dark:text-gray-700" strokeWidth={1} />
              <text x={padLeft - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize={10} className="fill-gray-400">{axisFmt(t)}</text>
            </g>
          );
        })}
        {groups.map((g, gi) => {
          const cx = padLeft + groupW * gi + groupW / 2;
          return (
            // Keyed by position, not g.label — labels are short month abbreviations
            // ("Apr") that repeat across years in a multi-year range, which would
            // otherwise collide as React keys.
            <g key={gi}>
              {g.values.map((v, si) => {
                const x = cx - barW - barGap / 2 + si * (barW + barGap);
                const y = yFor(v);
                const h = padTop + plotH - y;
                return (
                  <rect
                    key={si} x={x} y={y} width={barW} height={Math.max(0, h)} rx={3}
                    fill={colors[si]}
                    opacity={hover && hover.groupIdx === gi && hover.seriesIdx !== si ? 0.35 : 1}
                    onMouseEnter={() => setHover({ groupIdx: gi, seriesIdx: si })}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>{seriesLabels[si]} · {g.label}: {formatValue(v)}</title>
                  </rect>
                );
              })}
              <text x={cx} y={H - padBottom + 15} textAnchor="middle" fontSize={10} className="fill-gray-400">{g.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
