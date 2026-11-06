import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";

export interface Stats {
  planned: number; done: number; notDone: number; pending: number; overdue: number;
  onTime: number; late: number; breached: number;
  completionPct: number | null; notDonePct: number | null; onTimePct: number | null; latePct: number | null;
  difference: number; gapPct: number | null; avgDelayMinutes: number | null; avgTatMinutes: number | null;
}
export interface PeriodRow extends Stats { key: string; label: string; monthLabel: string; monthKey: string; weekNo: number | null; start: string; end: string }
export interface MonthGroup { monthKey: string; monthLabel: string; rows: PeriodRow[]; total: Stats }
export interface DeptRow extends Stats { name: string; users: number; plannedPerUser: number | null; donePerUser: number | null }
export interface UserRow extends Stats { userId: string; name: string; role: string; department: string; avgPlannedPerPeriod: number; avgDonePerPeriod: number }
export interface UserAverage { users: number; avgPlanned: number | null; avgDone: number | null; avgNotDone: number | null; avgDonePerPeriod: number | null; weightedCompletionPct: number | null; meanCompletionPct: number | null; weightedOnTimePct: number | null; avgTatMinutes: number | null;
  avgOnTime: number | null; avgLate: number | null; avgBreached: number | null; weightedNotDonePct: number | null; weightedLatePct: number | null; avgDelayMinutes: number | null }
export interface DeptAverage { departments: number; avgPlanned: number | null; avgDone: number | null; weightedCompletionPct: number | null; meanCompletionPct: number | null; weightedOnTimePct: number | null; avgUsersPerDept: number | null }
export interface Person { id: string; name: string; role: string; department: string }
export interface Performance {
  meta: { from: string; to: string; groupBy: "week" | "month"; periodCount: number; generatedAt: string; filters: { department: string; userId: string; userName: string; role: string } };
  kpis: Stats; rows: PeriodRow[]; groups: MonthGroup[]; total: Stats;
  departments: DeptRow[]; users: UserRow[]; userAverage: UserAverage; departmentAverage: DeptAverage;
  options: { departments: string[]; roles: string[]; users: Person[] };
}

export interface MisFilters { from: string; to: string; groupBy: "week" | "month"; department: string; userId: string; role: string }

export const defaultFilters = (): MisFilters => ({
  from: dayjs().startOf("day").subtract((dayjs().day() + 6) % 7 + 77, "day").format("YYYY-MM-DD"), // Monday, 11 weeks back
  to: dayjs().format("YYYY-MM-DD"),
  groupBy: "week", department: "", userId: "", role: "",
});

export const fmtNum = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-IN"));
export const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`);
export const fmtGap = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v}%`);
export function fmtDuration(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—"; // no completed stage to average
  if (min <= 0) return "<1m"; // completed, but in under a minute
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}
export const pctColor = (p: number | null) => (p === null ? "#9CA3AF" : p >= 90 ? "#16a34a" : p >= 60 ? "#f59e0b" : "#e03b3b");
export const gapColor = (g: number | null) => (g === null ? "#9CA3AF" : g >= 0 ? "#16a34a" : g > -25 ? "#f59e0b" : "#e03b3b");

// Loads the performance data for the given filters (the same endpoint feeds the Dashboard, the Report, and both exports).
export function useMisPerformance(filters: MisFilters) {
  const [data, setData] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const params = useMemo(() => ({
    from: filters.from, to: filters.to, groupBy: filters.groupBy,
    department: filters.department || undefined, userId: filters.userId || undefined, role: filters.role || undefined,
  }), [filters]);
  const load = useCallback(() => {
    setLoading(true); setError("");
    let live = true;
    apiClient.get("/mis-performance", { params })
      .then(r => { if (live) setData(r.data); })
      .catch(e => { if (live) setError(e?.response?.data?.message || "Could not load the MIS data."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [params]);
  useEffect(() => load(), [load]);
  return { data, loading, error, reload: load, params };
}

export async function downloadExcel(params: Record<string, string | undefined>) {
  const res = await apiClient.get("/mis-performance/export.xlsx", { params, responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mis-${params.groupBy}ly-report-${params.from}-to-${params.to}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
