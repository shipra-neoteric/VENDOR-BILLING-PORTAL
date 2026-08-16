// Plain-input equivalents of antd InputNumber's formatter/parser pairs —
// extracted here so every hand-rolled numeric field (NewBillDrawer today,
// WorkItems' ScopeItemsBuilder/DeliverablesBuilder later) formats/parses
// identically instead of reimplementing the same regex per call site.

export function formatThousands(n: number | string | undefined | null): string {
  if (n === undefined || n === null || n === "") return "";
  return `${n}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function parseThousands(v: string): number {
  return Number(v.replace(/,/g, "")) || 0;
}

export function formatPercent(n: number | undefined | null): string {
  return n ? `${n}%` : "";
}

export function parsePercent(v: string): number {
  return Number(v.replace("%", "")) || 0;
}
