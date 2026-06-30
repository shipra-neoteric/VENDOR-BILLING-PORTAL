interface CurrencyDisplayProps {
  amount:  number;
  compact?: boolean;
  color?:  string;
  weight?: number;
}

function formatCompact(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 1_00_000)   return `₹${(n / 1_00_000).toFixed(2)} L`;
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatFull(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export default function CurrencyDisplay({ amount, compact = false, color, weight = 600 }: CurrencyDisplayProps) {
  const text = compact ? formatCompact(amount) : formatFull(amount);
  return (
    <span style={{ fontFamily: "monospace", fontWeight: weight, color: color ?? "inherit" }}>
      {text}
    </span>
  );
}

export { formatCompact as fmtCompact, formatFull as fmtFull };
