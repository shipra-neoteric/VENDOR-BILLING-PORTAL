import { useTheme } from "../../context/ThemeContext";
import { FUNNEL_LIGHT, FUNNEL_DARK } from "./palette";

export interface FunnelStage {
  label: string;
  count: number;
}

// A real funnel — decreasing-width trapezoid segments, each showing only its
// raw count (bold, centered) — with the stage name/count/% breakdown living in
// a side legend, not on the shape itself. Width is proportional to count
// relative to the first (widest) stage, floored so a near-zero stage never
// fully disappears. Fixed stage-progression color order (see palette.ts) —
// identity is never color-alone since every row is also text-labeled.
export default function Funnel({ stages }: { stages: FunnelStage[] }) {
  const { isDark } = useTheme();
  const colors = isDark ? FUNNEL_DARK : FUNNEL_LIGHT;

  // With no real counts, every stage would fall back to the same MIN_FRAC width
  // and render as a stack of identical rectangles instead of a taper — there's
  // no real proportion to draw, so show an empty state rather than a fake funnel.
  if (stages.length === 0 || stages.every(s => s.count === 0)) {
    return <div className="text-sm text-gray-400 text-center py-8">No stage data yet.</div>;
  }

  const W = 130;
  const SEG_H = 44;
  const GAP = 2;
  const MIN_FRAC = 0.32;
  const max = Math.max(1, ...stages.map(s => s.count));
  const first = stages[0]?.count || 1;

  const widthFrac = (count: number) => Math.max(MIN_FRAC, max > 0 ? count / max : 0);
  const totalH = stages.length * (SEG_H + GAP) - GAP;

  return (
    <div className="flex items-start gap-4">
      <svg width={W} height={totalH} viewBox={`0 0 ${W} ${totalH}`} className="shrink-0">
        {stages.map((s, i) => {
          const topW = W * widthFrac(s.count);
          const nextCount = i < stages.length - 1 ? stages[i + 1].count : s.count;
          const botW = W * widthFrac(nextCount);
          const y = i * (SEG_H + GAP);
          const color = colors[i % colors.length];
          const pct = first > 0 ? Math.round((s.count / first) * 100) : 0;
          return (
            <g key={s.label}>
              <polygon
                points={`${(W - topW) / 2},${y} ${(W + topW) / 2},${y} ${(W + botW) / 2},${y + SEG_H} ${(W - botW) / 2},${y + SEG_H}`}
                fill={color}
              >
                <title>{s.label}: {s.count} ({pct}% of {stages[0]?.label})</title>
              </polygon>
              {/* paintOrder puts a soft dark halo behind the white number, so it
                  stays legible even where a near-zero segment is too narrow for
                  the fill to fully back it. */}
              <text
                x={W / 2} y={y + SEG_H / 2} textAnchor="middle" dominantBaseline="central"
                fontSize={15} fontWeight={800} fill="#fff"
                stroke="rgba(0,0,0,0.45)" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke"
              >
                {s.count}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex-1 flex flex-col justify-center gap-2.5 min-w-0" style={{ minHeight: totalH }}>
        {stages.map((s, i) => {
          const pct = first > 0 ? Math.round((s.count / first) * 100) : 0;
          return (
            <div key={s.label} className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
              <span className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] flex-1 min-w-0 truncate">{s.label}</span>
              <span className="font-mono font-bold text-[#1A1A2E] dark:text-[#F1F5F9] shrink-0">{s.count}</span>
              <span className="font-mono text-gray-400 shrink-0 w-9 text-right">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
