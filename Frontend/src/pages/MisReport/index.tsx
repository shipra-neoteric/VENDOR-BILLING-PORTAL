import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { BarChart3, Timer, CheckCircle2, Clock, AlertTriangle, Award, TrendingUp, Download, RefreshCw, X } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import NxStatCard from "../../ui/nexora/StatCard";
import NxCard from "../../ui/nexora/Card";
import { FilterRow, SearchFilter, SelectFilter } from "../../ui/Filters";
import Spinner from "../../ui/Spinner";
import Alert from "../../ui/Alert";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import UserMisDrawer from "./UserMisDrawer";
import { fmtDuration, slaColor, type UserMisRow } from "./shared";

const num = (n: number, tone = "") => (
  <span className={`tabular-nums ${n ? `font-semibold ${tone}` : "text-gray-300 dark:text-gray-600"}`}>{n || "—"}</span>
);
const dateInput = "h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";
const cap = (s: string) => s.replace(/^\w/, c => c.toUpperCase());

function SlaCell({ row }: { row: UserMisRow }) {
  if (row.slaPct === null) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  return (
    <div className="flex flex-col items-end gap-1 min-w-[84px]">
      <span className="text-[13px] font-semibold tabular-nums" style={{ color: slaColor(row.slaPct) }}>{row.slaPct}%</span>
      <div className="w-20 h-1 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, row.slaPct)}%`, background: slaColor(row.slaPct) }} />
      </div>
      <span className="text-[10px] text-gray-400 tabular-nums">{row.slaOnTime}/{row.slaTotal} on time</span>
    </div>
  );
}

export default function MisReport() {
  const [users, setUsers] = useState<UserMisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<UserMisRow | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError("");
    apiClient.get("/user-mis", { params: { from: from || undefined, to: to || undefined } })
      .then(r => setUsers(r.data?.users ?? []))
      .catch(() => setError("Could not load the MIS report."))
      .finally(() => setLoading(false));
  }, [from, to]);
  useEffect(load, [load]);

  const roleOptions = useMemo(() => Array.from(new Set(users.map(u => u.role).filter(Boolean))).sort().map(r => ({ value: r, label: r })), [users]);
  const deptOptions = useMemo(() => Array.from(new Set(users.map(u => u.department).filter(Boolean))).sort().map(d => ({ value: d, label: cap(d) })), [users]);
  const rows = useMemo(() => users.filter(u =>
    (!role || u.role === role) && (!department || u.department === department)
    && (!search.trim() || u.name.toLowerCase().includes(search.trim().toLowerCase()))), [users, role, department, search]);

  // KPI cards add up exactly the people shown in the table, from the same workflow-stage records.
  const kpi = useMemo(() => {
    const t = { total: 0, onTime: 0, pending: 0, delayed: 0, tatSum: 0, tatCount: 0 };
    for (const r of rows) { t.total += r.slaTotal; t.onTime += r.slaOnTime; t.pending += r.slaPending; t.delayed += r.slaDelayed; t.tatSum += r.tatSum; t.tatCount += r.tatCount; }
    return { ...t, pct: t.total ? Math.round((t.onTime / t.total) * 100) : null, avgTat: t.tatCount ? Math.round(t.tatSum / t.tatCount) : 0 };
  }, [rows]);

  const filtered = !!(search || role || department || from || to);
  const clear = () => { setSearch(""); setRole(""); setDepartment(""); setFrom(""); setTo(""); };

  function exportCsv() {
    const head = ["User", "Role", "Department", "Work Orders", "Bill Requests", "Bills", "Approved", "Rejected", "Sent Back", "SLA Cases", "On Time", "Delayed", "Pending", "SLA Compliance %", "Avg TAT", "Last Active"];
    const lines = rows.map(r => [r.name, r.role, r.department, r.workOrders, r.billRequests, r.bills, r.approved, r.rejected, r.sentBack,
      r.slaTotal, r.slaOnTime, r.slaDelayed, r.slaPending, r.slaPct ?? "", fmtDuration(r.avgTatMinutes), r.lastActiveAt ? dayjs(r.lastActiveAt).format("DD MMM YYYY") : ""]);
    const csv = [head, ...lines].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "mis-report.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const actionBtn = "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40";

  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title="MIS Report"
        subtitle="User-wise performance: documents created, approvals taken and SLA compliance. Click a user for the full activity history."
        actions={
          <div className="flex items-center gap-1">
            <button type="button" className={actionBtn} onClick={exportCsv} disabled={!rows.length}><Download className="w-4 h-4" /> Excel</button>
            <button type="button" className={actionBtn} onClick={load} title="Refresh"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
        }
      />

      <FilterRow>
        <SearchFilter value={search} onChange={setSearch} placeholder="Search by name…" />
        <div className="w-40"><SelectFilter value={role} onChange={setRole} options={roleOptions} placeholder="All roles" /></div>
        <div className="w-44"><SelectFilter value={department} onChange={setDepartment} options={deptOptions} placeholder="All departments" /></div>
        <input type="date" className={dateInput} value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} title="From" />
        <span className="text-xs text-gray-400 pb-3">to</span>
        <input type="date" className={dateInput} value={to} min={from || undefined} onChange={e => setTo(e.target.value)} title="To" />
        {filtered && <button type="button" className={`${actionBtn} mb-0.5`} onClick={clear}><X className="w-4 h-4" /> Clear</button>}
      </FilterRow>

      {error && <Alert type="error" message={error} />}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <NxStatCard label="Total Cases" value={loading ? "—" : kpi.total} icon={Timer} />
        <NxStatCard label="Completed (on time)" value={loading ? "—" : kpi.onTime} icon={CheckCircle2} />
        <NxStatCard label="Pending" value={loading ? "—" : kpi.pending} icon={Clock} />
        <NxStatCard label="Breached" value={loading ? "—" : kpi.delayed} icon={AlertTriangle} />
        <NxStatCard label="SLA Compliance" value={loading || kpi.pct === null ? "—" : `${kpi.pct}%`} icon={Award} />
        <NxStatCard label="Avg TAT" value={loading ? "—" : fmtDuration(kpi.avgTat)} icon={TrendingUp} />
      </div>

      <NxCard padded={false}>
        {loading ? <div className="p-10"><Spinner label="Loading…" /></div> : (
          <Table>
            <Thead>
              <Tr>
                <Th>User</Th><Th>Role</Th>
                <Th className="text-right">Work Orders</Th><Th className="text-right">Bill Requests</Th><Th className="text-right">Bills</Th>
                <Th className="text-right">Approved</Th><Th className="text-right">Rejected</Th><Th className="text-right">Sent Back</Th>
                <Th className="text-right">SLA Compliance</Th>
                <Th>Last Active</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.length === 0 && <Tr><Td colSpan={10} className="text-center text-gray-400 py-8">No users found</Td></Tr>}
              {rows.map(r => (
                <Tr
                  key={r.userId}
                  className="cursor-pointer hover:bg-orange-50/50 dark:hover:bg-gray-800/60"
                  tabIndex={0}
                  onClick={() => setSelected(r)}
                  onKeyDown={e => { if (e.key === "Enter") setSelected(r); }}
                >
                  <Td><div className="font-semibold">{r.name}</div>{r.department && <div className="text-[11px] text-gray-400">{cap(r.department)}</div>}</Td>
                  <Td className="whitespace-nowrap">{r.role || "—"}</Td>
                  <Td className="text-right">{num(r.workOrders)}</Td>
                  <Td className="text-right">{num(r.billRequests)}</Td>
                  <Td className="text-right">{num(r.bills)}</Td>
                  <Td className="text-right">{num(r.approved, "text-emerald-600")}</Td>
                  <Td className="text-right">{num(r.rejected, "text-red-600")}</Td>
                  <Td className="text-right">{num(r.sentBack, "text-amber-600")}</Td>
                  <Td className="text-right"><div className="flex justify-end"><SlaCell row={r} /></div></Td>
                  <Td className="whitespace-nowrap text-xs text-gray-500">{r.lastActiveAt ? dayjs(r.lastActiveAt).format("DD MMM YYYY") : "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </NxCard>
      {!loading && <div className="text-[11px] text-gray-400 mt-2">{rows.length} user{rows.length !== 1 ? "s" : ""}{from || to ? ` · ${from || "start"} → ${to || "today"}` : " · all period"}</div>}

      {selected && <UserMisDrawer user={selected} from={from} to={to} onClose={() => setSelected(null)} />}
    </div>
  );
}
