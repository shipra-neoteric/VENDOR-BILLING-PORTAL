import { useTheme } from "../../context/ThemeContext";
import { CATEGORICAL_LIGHT, CATEGORICAL_DARK } from "./palette";

export interface DonutSegment {
  label: string;
  value: number;
  /** Optional explicit color — falls back to the validated categorical order by position. */
  color?: string;
}

// Proportion-of-whole — category is identity, so categorical color, fixed
// order. Center shows the total; legend (swatch + label + value) is always
// present since this is always ≥2 series.
interface DonutProps {
  segments: DonutSegment[];
  size?: number;
  /** Overrides the default center text (segment total) — e.g. "68%" for a completion ring. */
  centerValue?: string;
  /** Small caption under the center value, e.g. "Overall Progress". */
  centerSub?: string;
  /** "percent" shows each segment's share of the total in the legend instead of its raw count. */
  legendMode?: "count" | "percent";
  /** Renders a plain ring with no center text at all — the legend carries the numbers instead. */
  hideCenter?: boolean;
  /** Omits the legend column entirely — for a small decorative ring sitting beside the caller's own stat text. */
  hideLegend?: boolean;
  /** When set, the legend shows this formatted amount plus its % share (stacked under the label) instead of a single count/percent line. */
  legendValueFormat?: (value: number) => string;
}

export default function Donut({ segments, size = 168, centerValue, centerSub, legendMode = "count", hideCenter = false, hideLegend = false, legendValueFormat }: DonutProps) {
  const { isDark } = useTheme();
  const colors = isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;

  const total = segments.reduce((s, x) => s + x.value, 0);
  const stroke = size * 0.3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  let offsetAcc = 0;

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {total === 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-gray-100 dark:text-gray-700" strokeWidth={stroke} />
        ) : (
          segments.map((seg, i) => {
            const frac = seg.value / total;
            const dash = frac * circumference;
            const color = seg.color || colors[i % colors.length];
            // A round cap adds ~stroke/2 of visual length to each end of the arc —
            // fine for a normal-sized slice, but on a small one (e.g. a 3% sliver)
            // the caps overwhelm the actual arc and it renders as a bulging blob
            // instead of a thin crescent. Fall back to a square cap below that size.
            const cap = dash > stroke * 2 ? "round" : "butt";
            const gap = cap === "round" ? 2 : 0.5;
            const el = (
              <circle
                key={seg.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
                strokeDasharray={`${Math.max(0, dash - gap)} ${circumference - dash + gap}`} strokeDashoffset={-offsetAcc}
                transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap={cap}
              >
                <title>{seg.label}: {seg.value} ({Math.round(frac * 100)}%)</title>
              </circle>
            );
            offsetAcc += dash;
            return el;
          })
        )}
        {hideCenter ? null : centerSub ? (
          <>
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.16} fontWeight={800} className="fill-[#1A1A2E] dark:fill-[#F1F5F9]">
              {centerValue}
            </text>
            <text x="50%" y="63%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.065} fontWeight={600} className="fill-gray-400">
              {centerSub}
            </text>
          </>
        ) : (
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.16} fontWeight={800} className="fill-[#1A1A2E] dark:fill-[#F1F5F9]">
            {centerValue ?? total}
          </text>
        )}
      </svg>
      {!hideLegend && (
        <div className="flex flex-col gap-3 flex-1">
          {segments.map((seg, i) => {
            const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
            return legendValueFormat ? (
              <div key={seg.label} className="flex items-start gap-2.5 text-sm">
                <span className="w-3 h-3 rounded-full shrink-0 mt-0.5" style={{ background: seg.color || colors[i % colors.length] }} />
                <div>
                  <div className="text-gray-700 dark:text-gray-300 font-medium">{seg.label}</div>
                  <div className="text-gray-400 font-mono text-xs">{legendValueFormat(seg.value)} ({pct}%)</div>
                </div>
              </div>
            ) : (
              <div key={seg.label} className="flex items-center gap-2.5 text-sm">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: seg.color || colors[i % colors.length] }} />
                <span className="text-gray-700 dark:text-gray-300 font-medium">{seg.label}</span>
                <span className="text-gray-400 font-mono font-semibold ml-auto">
                  {legendMode === "percent" ? `${pct}%` : `(${seg.value})`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
