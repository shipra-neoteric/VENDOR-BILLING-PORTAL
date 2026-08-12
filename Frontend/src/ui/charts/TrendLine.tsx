import { useState } from "react";

export interface TrendPoint {
  date: string;
  value: number;
}

// Single-series magnitude over time — sequential hue (the app's primary
// blue), thin 2px line + soft area fill, with a hover crosshair + tooltip
// (a line/area chart is interactive by default, not a static image).
export default function TrendLine({
  points, height = 130, color = "#2a78d6", formatValue,
}: {
  points: TrendPoint[];
  height?: number;
  color?: string;
  formatValue?: (n: number) => string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length < 2) {
    return <div className="text-sm text-gray-400 text-center py-6">Not enough data yet.</div>;
  }

  const W = 600, H = height, pad = 20;
  const values = points.map(p => p.value);
  const max = Math.max(1, ...values);
  const xStep = (W - pad * 2) / (points.length - 1);
  const toY = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const linePts = points.map((p, i) => `${pad + i * xStep},${toY(p.value)}`).join(" ");
  const areaPts = `${pad},${H - pad} ${linePts} ${pad + (points.length - 1) * xStep},${H - pad}`;

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round((relX - pad) / xStep);
    setHoverIdx(Math.min(points.length - 1, Math.max(0, idx)));
  };

  const hover = hoverIdx !== null ? points[hoverIdx] : null;
  const hoverX = hoverIdx !== null ? pad + hoverIdx * xStep : 0;

  return (
    <div className="relative">
      <svg
        width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        onMouseMove={handleMove} onMouseLeave={() => setHoverIdx(null)}
      >
        <polygon points={areaPts} fill={color} opacity={0.1} />
        <polyline points={linePts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {hover && (
          <>
            <line x1={hoverX} y1={pad * 0.2} x2={hoverX} y2={H - pad} stroke={color} strokeOpacity={0.25} strokeWidth={1} />
            <circle cx={hoverX} cy={toY(hover.value)} r={4} fill={color} stroke="white" strokeWidth={1.5} />
          </>
        )}
      </svg>
      {hover && (
        <div
          className="absolute -translate-x-1/2 -translate-y-full bg-[#1A1A2E] dark:bg-gray-700 text-white text-[11px] font-medium rounded-md px-2.5 py-1.5 pointer-events-none whitespace-nowrap shadow-lg"
          style={{ left: `${(hoverX / W) * 100}%`, top: -6 }}
        >
          {hover.date} · {formatValue ? formatValue(hover.value) : hover.value}
        </div>
      )}
    </div>
  );
}
