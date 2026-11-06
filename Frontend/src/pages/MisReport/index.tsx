import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { BarChart3, FileText, ClipboardList, Receipt, CheckCircle2, Award, TrendingUp, Download, RefreshCw, X } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import NxStatCard from "../../ui/nexora/StatCard";
import NxCard from "../../ui/nexora/Card";
import { FilterRow, SearchFilter, SelectFilter } from "../../ui/Filters";
import Spinner from "../../ui/Spinner";
import Alert from "../../ui/Alert";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import UserMisDrawer from "./UserMisDrawer";
import { fmtDuration, slaColor, perWeek, docsOf, type UserMisRow } from "./shared";

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

const avgCaption = (total: number, users: number) => `${total} total · ${users} user${users !== 1 ? "s" : ""}`;
function avgValue(loading: boolean, value: React.ReactNode | null, caption: string) {
  if (loading) return "—";
  return (
    <>
      {value === null ? "—" : value}
      <div className="text-[11px] font-normal text-gray-400 mt-0.5 leading-snug">{value === null ? "No activity" : caption}</div>
    </>
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

  // Per-user averages over the people shown (after role / department / search / date filters). Each activity average divides that
  // metric's total by the users who have any of that activity, so people with none do not pull it down. SLA compliance is weighted by
  // cases (all on-time ÷ all cases). TAT is the mean of each person's own average handling time, over people with a completed stage.
  const avg = useMemo(() => {
    const round1 = (v: number) => Math.round(v * 10) / 10;
    const metric = (f: (r: UserMisRow) => number) => {
      const eligible = rows.filter(r => f(r) > 0);
      const total = eligible.reduce((s, r) => s + f(r), 0);
      return { total, users: eligible.length, value: eligible.length ? round1(total / eligible.length) : null };
    };
    const tatUsers = rows.filter(r => r.tatCount > 0);
    const sla = rows.reduce((s, r) => ({ total: s.total + r.slaTotal, onTime: s.onTime + r.slaOnTime, users: s.users + (r.slaTotal > 0 ? 1 : 0), tatSum: s.tatSum + r.tatSum, tatCount: s.tatCount + r.tatCount }),
      { total: 0, onTime: 0, users: 0, tatSum: 0, tatCount: 0 });
    return {
      wo: metric(r => r.workOrders), br: metric(r => r.billRequests), bills: metric(r => r.bills), approvals: metric(r => r.approved),
      tat: { users: tatUsers.length, value: tatUsers.length ? Math.round(tatUsers.reduce((s, r) => s + r.avgTatMinutes, 0) / tatUsers.length) : null,
        weighted: sla.tatCount ? Math.round(sla.tatSum / sla.tatCount) : null },
      sla: { ...sla, pct: sla.total ? Math.round((sla.onTime / sla.total) * 1000) / 10 : null },
    };
  }, [rows]);

  const filtered = !!(search || role || department || from || to);
  const clear = () => { setSearch(""); setRole(""); setDepartment(""); setFrom(""); setTo(""); };

  function exportCsv() {
    const head = ["User", "Role", "Department", "Work Orders", "Bill Requests", "Bills", "Approved", "Rejected", "Sent Back", "SLA Cases", "On Time", "Delayed", "Pending", "SLA Compliance %", "Avg TAT", "Docs / Week", "Approvals / Week", "Last Active"];
    const lines = rows.map(r => [r.name, r.role, r.department, r.workOrders, r.billRequests, r.bills, r.approved, r.rejected, r.sentBack,
      r.slaTotal, r.slaOnTime, r.slaDelayed, r.slaPending, r.slaPct ?? "", fmtDuration(r.avgTatMinutes), perWeek(docsOf(r), r, from, to), perWeek(r.approved, r, from, to), r.lastActiveAt ? dayjs(r.lastActiveAt).format("DD MMM YYYY") : ""]);
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
        <NxStatCard label="Avg Work Orders / User" value={avgValue(loading, avg.wo.value, avgCaption(avg.wo.total, avg.wo.users))} icon={FileText} />
        <NxStatCard label="Avg Bill Requests / User" value={avgValue(loading, avg.br.value, avgCaption(avg.br.total, avg.br.users))} icon={ClipboardList} />
        <NxStatCard label="Avg Bills / User" value={avgValue(loading, avg.bills.value, avgCaption(avg.bills.total, avg.bills.users))} icon={Receipt} />
        <NxStatCard label="Avg Approvals / User" value={avgValue(loading, avg.approvals.value, avgCaption(avg.approvals.total, avg.approvals.users))} icon={CheckCircle2} />
        <NxStatCard
          label="Avg TAT / User"
          value={avgValue(loading, avg.tat.value === null ? null : fmtDuration(avg.tat.value), `${avg.tat.users} user${avg.tat.users !== 1 ? "s" : ""}${avg.tat.weighted ? ` · ${fmtDuration(avg.tat.weighted)} per stage` : ""}`)}
          icon={TrendingUp}
        />
        <NxStatCard
          label="SLA Compliance"
          value={avgValue(loading, avg.sla.pct === null ? null : `${avg.sla.pct}%`, `Weighted · ${avg.sla.onTime}/${avg.sla.total} on time · ${avg.sla.users} user${avg.sla.users !== 1 ? "s" : ""}`)}
          icon={Award}
        />
      </div>

      <NxCard padded={false}>
        {loading ? <div className="p-10"><Spinner label="Loading…" /></div> : (
          <Table containerClassName="max-h-[500px] overflow-y-auto">
            <colgroup><col style={{ width: "12%" }} /><col style={{ width: "6%" }} /><col style={{ width: "7%" }} /><col style={{ width: "7%" }} /><col style={{ width: "6%" }} /><col style={{ width: "7.5%" }} /><col style={{ width: "7%" }} /><col style={{ width: "6.5%" }} /><col style={{ width: "11%" }} /><col style={{ width: "7.5%" }} /><col style={{ width: "7%" }} /><col style={{ width: "7.5%" }} /><col style={{ width: "8%" }} /></colgroup>
            <Thead className="sticky top-0 z-10">
              <Tr>
                <Th dense className="whitespace-normal! leading-tight align-bottom">User</Th><Th dense className="whitespace-normal! leading-tight align-bottom">Role</Th>
                <Th dense className="whitespace-normal! leading-tight align-bottom text-right">Work Orders</Th><Th dense className="whitespace-normal! leading-tight align-bottom text-right">Bill Requests</Th><Th dense className="whitespace-normal! leading-tight align-bottom text-right">Bills</Th>
                <Th dense className="whitespace-normal! leading-tight align-bottom text-right">Approved</Th><Th dense className="whitespace-normal! leading-tight align-bottom text-right">Rejected</Th><Th dense className="whitespace-normal! leading-tight align-bottom text-right">Sent Back</Th>
                <Th dense className="whitespace-normal! leading-tight align-bottom text-right">SLA Compliance</Th>
                <Th dense className="whitespace-normal! leading-tight align-bottom text-right" title="This user's own average time to complete a stage">Avg TAT</Th>
                <Th dense className="whitespace-normal! leading-tight align-bottom text-right" title="Work Orders + Bill Requests + Bills created, per week of the selected period">Docs / Week</Th>
                <Th dense className="whitespace-normal! leading-tight align-bottom text-right" title="Approved decisions per week of the selected period">Approvals / Week</Th>
                <Th dense className="whitespace-normal! leading-tight align-bottom">Last Active</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.length === 0 && <Tr><Td dense colSpan={13} className="text-center text-gray-400 py-8">No users found</Td></Tr>}
              {rows.map(r => (
                <Tr
                  key={r.userId}
                  className="cursor-pointer hover:bg-orange-50/50 dark:hover:bg-gray-800/60"
                  tabIndex={0}
                  onClick={() => setSelected(r)}
                  onKeyDown={e => { if (e.key === "Enter") setSelected(r); }}
                >
                  <Td dense><div className="font-semibold">{r.name}</div>{r.department && <div className="text-[11px] text-gray-400">{cap(r.department)}</div>}</Td>
                  <Td dense className="whitespace-nowrap">{r.role || "—"}</Td>
                  <Td dense className="text-right">{num(r.workOrders)}</Td>
                  <Td dense className="text-right">{num(r.billRequests)}</Td>
                  <Td dense className="text-right">{num(r.bills)}</Td>
                  <Td dense className="text-right">{num(r.approved, "text-emerald-600")}</Td>
                  <Td dense className="text-right">{num(r.rejected, "text-red-600")}</Td>
                  <Td dense className="text-right">{num(r.sentBack, "text-amber-600")}</Td>
                  <Td dense className="text-right"><div className="flex justify-end"><SlaCell row={r} /></div></Td>
                  <Td dense className="text-right tabular-nums whitespace-nowrap">{fmtDuration(r.avgTatMinutes)}</Td>
                  <Td dense className="text-right">{num(perWeek(docsOf(r), r, from, to))}</Td>
                  <Td dense className="text-right">{num(perWeek(r.approved, r, from, to), "text-emerald-600")}</Td>
                  <Td dense className="whitespace-nowrap text-xs text-gray-500">{r.lastActiveAt ? dayjs(r.lastActiveAt).format("DD MMM YYYY") : "—"}</Td>
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
