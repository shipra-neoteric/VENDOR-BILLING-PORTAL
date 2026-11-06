import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
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
interface UserMisRow {
  userId: string; name: string; role: string; department: string;
  workOrders: number; billRequests: number; bills: number;
  approved: number; rejected: number; sentBack: number;
  total: number; lastActiveAt: string | null;
}

function fmtDuration(min: number): string {
  if (!min || min <= 0) return "—";
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
const num = (n: number, tone = "") => (
  <span className={`tabular-nums ${n ? `font-semibold ${tone}` : "text-gray-300 dark:text-gray-600"}`}>{n || "—"}</span>
);
const dateInput = "h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

export default function MisReport() {
  const [cards, setCards] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserMisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(() => {
    setLoading(true); setError("");
    const params = { from: from || undefined, to: to || undefined };
    Promise.all([
      apiClient.get("/workflows/sla-by-module", { params }),
      apiClient.get("/user-mis", { params }),
    ])
      .then(([sla, mis]) => { setCards(sla.data?.cards ?? null); setUsers(mis.data?.users ?? []); })
      .catch(() => setError("Could not load the MIS report."))
      .finally(() => setLoading(false));
  }, [from, to]);
  useEffect(load, [load]);

  const roleOptions = useMemo(
    () => Array.from(new Set(users.map(u => u.role).filter(Boolean))).sort().map(r => ({ value: r, label: r })),
    [users],
  );
  const rows = useMemo(() => users.filter(u =>
    (!role || u.role === role) && (!search.trim() || u.name.toLowerCase().includes(search.trim().toLowerCase()))), [users, role, search]);

  function exportCsv() {
    const head = ["User", "Role", "Department", "Work Orders", "Bill Requests", "Bills", "Approved", "Rejected", "Sent Back", "Last Active"];
    const lines = rows.map(r => [r.name, r.role, r.department, r.workOrders, r.billRequests, r.bills, r.approved, r.rejected, r.sentBack,
      r.lastActiveAt ? dayjs(r.lastActiveAt).format("DD MMM YYYY") : ""]);
    const csv = [head, ...lines].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "mis-report.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const actionBtn = "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800";

  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title="MIS Report"
        subtitle="SLA performance of approvals, and what each person did: documents created and approvals taken."
        actions={
          <div className="flex items-center gap-1">
            <button type="button" className={actionBtn} onClick={exportCsv} disabled={!rows.length}><Download className="w-4 h-4" /> Excel</button>
            <button type="button" className={actionBtn} onClick={load}><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
        }
      />

      <FilterRow>
        <SearchFilter value={search} onChange={setSearch} placeholder="Search by name…" />
        <div className="w-44"><SelectFilter value={role} onChange={setRole} options={roleOptions} placeholder="All roles" /></div>
        <input type="date" className={dateInput} value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} title="From" />
        <span className="text-xs text-gray-400 pb-3">to</span>
        <input type="date" className={dateInput} value={to} min={from || undefined} onChange={e => setTo(e.target.value)} title="To" />
      </FilterRow>

      {error && <Alert type="error" message={error} />}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
        <NxStatCard label="Total SLA Cases" value={cards?.total ?? "—"} icon={Timer} />
        <NxStatCard label="Completed" value={cards?.onTime ?? "—"} icon={CheckCircle2} />
        <NxStatCard label="Pending" value={cards?.pending ?? "—"} icon={Clock} />
        <NxStatCard label="Breached" value={cards?.delayed ?? "—"} icon={AlertTriangle} />
        <NxStatCard label="Compliance %" value={cards ? `${Math.round(cards.ratePct)}%` : "—"} icon={Award} />
        <NxStatCard label="Avg TAT" value={cards ? fmtDuration(cards.avgTatMinutes) : "—"} icon={TrendingUp} />
        <NxStatCard label="Avg Breach Duration" value={cards ? fmtDuration(cards.avgBreachMinutes) : "—"} icon={AlertTriangle} />
      </div>

      <NxCard padded={false}>
        {loading ? <div className="p-10"><Spinner label="Loading…" /></div> : (
          <Table>
            <Thead>
              <Tr>
                <Th>User</Th><Th>Role</Th>
                <Th className="text-right">Work Orders</Th><Th className="text-right">Bill Requests</Th><Th className="text-right">Bills</Th>
                <Th className="text-right">Approved</Th><Th className="text-right">Rejected</Th><Th className="text-right">Sent Back</Th>
                <Th>Last Active</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.length === 0 && <Tr><Td colSpan={9} className="text-center text-gray-400 py-8">No users found</Td></Tr>}
              {rows.map(r => (
                <Tr key={r.userId}>
                  <Td><div className="font-semibold">{r.name}</div>{r.department && <div className="text-[11px] text-gray-400 capitalize">{r.department}</div>}</Td>
                  <Td className="whitespace-nowrap">{r.role || "—"}</Td>
                  <Td className="text-right">{num(r.workOrders)}</Td>
                  <Td className="text-right">{num(r.billRequests)}</Td>
                  <Td className="text-right">{num(r.bills)}</Td>
                  <Td className="text-right">{num(r.approved, "text-emerald-600")}</Td>
                  <Td className="text-right">{num(r.rejected, "text-red-600")}</Td>
                  <Td className="text-right">{num(r.sentBack, "text-amber-600")}</Td>
                  <Td className="whitespace-nowrap text-xs text-gray-500">{r.lastActiveAt ? dayjs(r.lastActiveAt).format("DD MMM YYYY") : "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </NxCard>
    </div>
  );
}
