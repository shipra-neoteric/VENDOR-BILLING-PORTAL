export interface UserMisRow {
  userId: string; name: string; role: string; department: string;
  workOrders: number; billRequests: number; bills: number;
  approved: number; rejected: number; sentBack: number;
  slaTotal: number; slaOnTime: number; slaDelayed: number; slaPending: number;
  tatSum: number; tatCount: number;
  slaPct: number | null; avgTatMinutes: number;
  total: number; lastActiveAt: string | null;
}

export function fmtDuration(min: number): string {
  if (!min || min <= 0) return "—";
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const slaColor = (pct: number) => (pct >= 90 ? "#16a34a" : pct >= 60 ? "#f59e0b" : "#e03b3b");
