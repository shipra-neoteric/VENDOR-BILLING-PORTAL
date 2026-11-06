import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Timer, CheckCircle2, Clock, AlertTriangle, Award, TrendingUp, Download, RefreshCw } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import NxStatCard from "../../ui/nexora/StatCard";
import NxCard from "../../ui/nexora/Card";
import { FilterRow, SearchFilter, SelectFilter } from "../../ui/Filters";
import Spinner from "../../ui/Spinner";
import Alert from "../../ui/Alert";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";

interface Stats { total: number; onTime: number; delayed: number; pending: number; ratePct: number; avgTatMinutes: number; avgBreachMinutes: number }
interface ModuleRow extends Stats { key: string; label: string }
interface StageRow extends Stats { module: string; moduleLabel: string; stage: string }
interface Report { cards: Stats; modules: ModuleRow[]; stages: StageRow[] }

function fmtDuration(min: number): string {
  if (!min || min <= 0) return "—";
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
const rateColor = (p: number) => (p >= 90 ? "#16a34a" : p >= 60 ? "#f59e0b" : "#e03b3b");
const dateInput = "h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";
const MODULE_OPTIONS = [{ value: "WorkOrder", label: "Work Order" }, { value: "BillRequest", label: "Bill Request" }];
const GROUP_OPTIONS = [{ value: "module", label: "Group by Module" }, { value: "stage", label: "Group by Stage" }];

function RateCell({ pct }: { pct: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[13px] font-semibold tabular-nums" style={{ color: rateColor(pct) }}>{pct}%</span>
      <div className="w-24 h-1 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: rateColor(pct) }} />
      </div>
    </div>
  );
}

export default function MisReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [groupBy, setGroupBy] = useState("module");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(() => {
    setLoading(true); setError("");
    apiClient.get("/workflows/sla-by-module", { params: { entityType: moduleFilter || undefined, from: from || undefined, to: to || undefined } })
      .then(r => setReport(r.data))
      .catch(() => setError("Could not load the MIS report."))
      .finally(() => setLoading(false));
  }, [moduleFilter, from, to]);
  useEffect(load, [load]);

  const rows = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    if (groupBy === "stage") {
      return report.stages.filter(s => !q || s.stage.toLowerCase().includes(q) || s.moduleLabel.toLowerCase().includes(q))
        .map(s => ({ key: `${s.module}:${s.stage}`, name: s.stage, sub: s.moduleLabel, ...s }));
    }
    return report.modules.filter(m => !q || m.label.toLowerCase().includes(q)).map(m => ({ ...m, name: m.label, sub: "" }));
  }, [report, groupBy, search]);

  const totals = useMemo(() => {
    const t = { total: 0, onTime: 0, delayed: 0, pending: 0 };
    for (const r of rows) { t.total += r.total; t.onTime += r.onTime; t.delayed += r.delayed; t.pending += r.pending; }
    return { ...t, ratePct: t.total ? Math.round((t.onTime / t.total) * 1000) / 10 : 0 };
  }, [rows]);

  function exportCsv() {
    const head = [groupBy === "stage" ? "Stage" : "Module", ...(groupBy === "stage" ? ["Module"] : []), "Total", "On Time", "Delayed", "Pending", "Rate %", "Avg TAT", "Avg Breach"];
    const lines = rows.map(r => [r.name, ...(groupBy === "stage" ? [r.sub] : []), r.total, r.onTime, r.delayed, r.pending, r.ratePct, fmtDuration(r.avgTatMinutes), fmtDuration(r.avgBreachMinutes)]);
    const csv = [head, ...lines].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "mis-report.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const c = report?.cards;
  const actionBtn = "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800";

  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title="MIS Report"
        subtitle="SLA performance of Work Order and Bill Request approvals: on time, delayed and pending."
        actions={
          <div className="flex items-center gap-1">
            <button type="button" className={actionBtn} onClick={exportCsv} disabled={!rows.length}><Download className="w-4 h-4" /> Excel</button>
            <button type="button" className={actionBtn} onClick={load}><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
        }
      />

      <FilterRow>
        <SearchFilter value={search} onChange={setSearch} placeholder="Search module / stage…" />
        <div className="w-44"><SelectFilter value={moduleFilter} onChange={setModuleFilter} options={MODULE_OPTIONS} placeholder="All Modules" /></div>
        <div className="w-48"><SelectFilter value={groupBy} onChange={v => setGroupBy(v || "module")} options={GROUP_OPTIONS} placeholder="Group by Module" /></div>
        <input type="date" className={dateInput} value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} title="From" />
        <span className="text-xs text-gray-400 pb-3">to</span>
        <input type="date" className={dateInput} value={to} min={from || undefined} onChange={e => setTo(e.target.value)} title="To" />
      </FilterRow>

      {error && <Alert type="error" message={error} />}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
        <NxStatCard label="Total SLA Cases" value={c?.total ?? "—"} icon={Timer} />
        <NxStatCard label="Completed" value={c?.onTime ?? "—"} icon={CheckCircle2} />
        <NxStatCard label="Pending" value={c?.pending ?? "—"} icon={Clock} />
        <NxStatCard label="Breached" value={c?.delayed ?? "—"} icon={AlertTriangle} />
        <NxStatCard label="Compliance %" value={c ? `${Math.round(c.ratePct)}%` : "—"} icon={Award} />
        <NxStatCard label="Avg TAT" value={c ? fmtDuration(c.avgTatMinutes) : "—"} icon={TrendingUp} />
        <NxStatCard label="Avg Breach Duration" value={c ? fmtDuration(c.avgBreachMinutes) : "—"} icon={AlertTriangle} />
      </div>

      <NxCard padded={false}>
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{groupBy === "stage" ? "SLA by Stage" : "SLA by Module"}</h2>
          <span className="text-[11px] text-gray-400">{from || to ? `${from || "start"} → ${to || "today"}` : "All period"}</span>
        </div>
        {loading ? <div className="p-10"><Spinner label="Loading…" /></div> : (
          <Table>
            <Thead>
              <Tr>
                <Th>#</Th><Th>{groupBy === "stage" ? "Stage" : "Module"}</Th>
                <Th className="text-right">Total</Th><Th className="text-right">On Time</Th><Th className="text-right">Delayed</Th><Th className="text-right">Pending</Th>
                <Th className="text-center">Rate %</Th><Th className="text-right">Avg TAT</Th><Th className="text-right">Avg Breach</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.length === 0 && <Tr><Td colSpan={9} className="text-center text-gray-400 py-8">No SLA cases found</Td></Tr>}
              {rows.map((r, i) => (
                <Tr key={r.key}>
                  <Td className="text-gray-400 tabular-nums">{i + 1}</Td>
                  <Td><div className="font-semibold">{r.name}</div>{r.sub && <div className="text-[11px] text-gray-400">{r.sub}</div>}</Td>
                  <Td className="text-right font-semibold tabular-nums text-primary">{r.total}</Td>
                  <Td className="text-right tabular-nums">{r.onTime}</Td>
                  <Td className="text-right tabular-nums text-red-600">{r.delayed}</Td>
                  <Td className="text-right tabular-nums text-amber-600">{r.pending}</Td>
                  <Td><RateCell pct={r.ratePct} /></Td>
                  <Td className="text-right tabular-nums">{fmtDuration(r.avgTatMinutes)}</Td>
                  <Td className="text-right tabular-nums">{fmtDuration(r.avgBreachMinutes)}</Td>
                </Tr>
              ))}
            </Tbody>
            {rows.length > 0 && (
              <tfoot>
                <Tr>
                  <Td />
                  <Td className="font-bold">TOTAL ({rows.length})</Td>
                  <Td className="text-right font-bold tabular-nums text-primary">{totals.total}</Td>
                  <Td className="text-right font-bold tabular-nums">{totals.onTime}</Td>
                  <Td className="text-right font-bold tabular-nums text-red-600">{totals.delayed}</Td>
                  <Td className="text-right font-bold tabular-nums text-amber-600">{totals.pending}</Td>
                  <Td><RateCell pct={totals.ratePct} /></Td>
                  <Td /><Td />
                </Tr>
              </tfoot>
            )}
          </Table>
        )}
      </NxCard>
    </div>
  );
}
