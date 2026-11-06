import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Users } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import { FilterRow, SearchFilter, SelectFilter } from "../../ui/Filters";
import NxCard from "../../ui/nexora/Card";
import Spinner from "../../ui/Spinner";
import Alert from "../../ui/Alert";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";

interface UserMisRow {
  userId: string; name: string; role: string; department: string;
  workOrders: number; billRequests: number; bills: number;
  approved: number; rejected: number; sentBack: number;
  total: number; lastActiveAt: string | null;
}

const num = (n: number, tone = "") => (
  <span className={`tabular-nums ${n ? `font-semibold ${tone}` : "text-gray-300 dark:text-gray-600"}`}>{n || "—"}</span>
);
const dateInput = "h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

export default function UserMis() {
  const [rows, setRows] = useState<UserMisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true); setError("");
    apiClient.get("/user-mis", { params: { from: from || undefined, to: to || undefined } })
      .then(r => { if (live) setRows(r.data?.users ?? []); })
      .catch(() => { if (live) setError("Could not load User MIS."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [from, to]);

  const roleOptions = useMemo(
    () => Array.from(new Set(rows.map(r => r.role).filter(Boolean))).sort().map(r => ({ value: r, label: r })),
    [rows],
  );
  const shown = useMemo(() => rows.filter(r =>
    (!role || r.role === role) && (!search.trim() || r.name.toLowerCase().includes(search.trim().toLowerCase()))), [rows, role, search]);
  const active = shown.filter(r => r.total > 0).length;

  return (
    <div>
      <PageHeader
        icon={Users}
        title="User MIS"
        subtitle="What each person did: work orders, bill requests and bills created, and approvals they took."
      />
      <FilterRow>
        <SearchFilter value={search} onChange={setSearch} placeholder="Search by name…" />
        <div className="w-44"><SelectFilter value={role} onChange={setRole} options={roleOptions} placeholder="All roles" /></div>
        <input type="date" className={dateInput} value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} title="From" />
        <span className="text-xs text-gray-400 pb-3">to</span>
        <input type="date" className={dateInput} value={to} min={from || undefined} onChange={e => setTo(e.target.value)} title="To" />
      </FilterRow>

      {error && <Alert type="error" message={error} />}
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
              {shown.length === 0 && <Tr><Td colSpan={9} className="text-center text-gray-400 py-8">No users found</Td></Tr>}
              {shown.map(r => (
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
      {!loading && <div className="text-[11px] text-gray-400 mt-2">{active} of {shown.length} users have activity in this period.</div>}
    </div>
  );
}
