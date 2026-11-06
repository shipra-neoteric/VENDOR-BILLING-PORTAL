export interface UserMisRow {
  userId: string; name: string; role: string; department: string;
  workOrders: number; billRequests: number; bills: number;
  approved: number; rejected: number; sentBack: number;
  slaTotal: number; slaOnTime: number; slaDelayed: number; slaPending: number;
  tatSum: number; tatCount: number;
  slaPct: number | null; avgTatMinutes: number;
  total: number; lastActiveAt: string | null; firstActiveAt: string | null;
}

// Length of the period a person's counts cover, in weeks (at least 1): the selected From/To range, or — when no From is chosen —
// from that person's first recorded activity to today (or the To date). Used for their own "per week" averages.
export function periodWeeks(row: UserMisRow, from: string, to: string): number | null {
  const start = from || row.firstActiveAt;
  if (!start) return null;
  const end = to ? new Date(to) : new Date();
  const days = Math.max(1, Math.floor((end.getTime() - new Date(start).setHours(0, 0, 0, 0)) / 86400000) + 1);
  return Math.max(1, days / 7);
}

export function perWeek(count: number, row: UserMisRow, from: string, to: string): number {
  const weeks = periodWeeks(row, from, to);
  return weeks === null || !count ? 0 : Math.round((count / weeks) * 10) / 10;
}
export const docsOf = (r: UserMisRow) => r.workOrders + r.billRequests + r.bills;

export function fmtDuration(min: number): string {
  if (!min || min <= 0) return "—";
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const slaColor = (pct: number) => (pct >= 90 ? "#16a34a" : pct >= 60 ? "#f59e0b" : "#e03b3b");
