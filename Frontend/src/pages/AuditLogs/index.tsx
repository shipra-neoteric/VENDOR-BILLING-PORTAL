import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import { FilterRow, SearchFilter, SelectFilter } from "../../ui/Filters";
import { DatePicker } from "../../ui/DatePicker";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import Badge from "../../ui/Badge";
import Pagination from "../../ui/Pagination";
import { Skeleton } from "../../ui/Skeleton";

type Action = "LOGIN" | "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REJECT";

interface LogRow {
  _id: string;
  action: Action;
  module: string;
  userName?: string;
  userEmail?: string;
  description: string;
  entityLabel?: string;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  ip?: string;
  createdAt: string;
}

const ACTION_COLOR: Record<Action, "gray" | "green" | "blue" | "red" | "amber" | "purple"> = {
  LOGIN:   "gray",
  CREATE:  "green",
  UPDATE:  "blue",
  DELETE:  "red",
  APPROVE: "amber",
  REJECT:  "purple",
};

const MODULE_LABELS: Record<string, string> = {
  auth: "Auth",
  "work-orders": "Work Orders",
  "bill-requests": "Bill Requests",
  "billing-payments": "Billing & Payments",
  "accounts-payment": "Accounts Payment",
  "user-management": "Users",
  "advance-payments": "Advance Payments",
};

const fmtVal = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

export default function AuditLogs() {
  const [logs, setLogs]       = useState<LogRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [modules, setModules] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [moduleFilter, setModuleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    apiClient.get("/audit-logs/modules").then(res => setModules(res.data.modules ?? [])).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    apiClient
      .get("/audit-logs", {
        params: {
          module: moduleFilter || undefined,
          action: actionFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          search: search || undefined,
          page,
          limit: pageSize,
        },
      })
      .then(res => {
        setLogs(res.data.logs ?? []);
        setTotal(res.data.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [moduleFilter, actionFilter, dateFrom, dateTo, search, page]);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle="Complete record of who did what, and when — every approval, edit, and login across the system."
        icon={History}
      />

      <FilterRow>
        <SelectFilter
          value={moduleFilter}
          onChange={v => { setModuleFilter(v); setPage(1); }}
          placeholder="All Modules"
          options={modules.map(m => ({ label: MODULE_LABELS[m] || m, value: m }))}
        />
        <SelectFilter
          value={actionFilter}
          onChange={v => { setActionFilter(v); setPage(1); }}
          placeholder="All Actions"
          options={(Object.keys(ACTION_COLOR) as Action[]).map(a => ({ label: a, value: a }))}
        />
        <DatePicker value={dateFrom} onChange={v => { setDateFrom(v); setPage(1); }} />
        <DatePicker value={dateTo} onChange={v => { setDateTo(v); setPage(1); }} />
        <SearchFilter value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search description, user, or record…" />
      </FilterRow>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Action</Th>
              <Th>Module</Th>
              <Th>User</Th>
              <Th>Description</Th>
              <Th>Date / IP</Th>
            </Tr>
          </Thead>
          <Tbody>
            {logs.length === 0 && (
              <Tr><Td colSpan={5}><div className="text-center text-gray-400 py-8">No audit log entries match these filters</div></Td></Tr>
            )}
            {logs.map(row => (
              <>
                <Tr
                  key={row._id}
                  className={row.changes ? "cursor-pointer" : ""}
                  onClick={() => row.changes && toggleExpand(row._id)}
                >
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {row.changes && (expanded.has(row._id) ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />)}
                      <Badge color={ACTION_COLOR[row.action]} small>{row.action}</Badge>
                    </div>
                  </Td>
                  <Td><TdText>{MODULE_LABELS[row.module] || row.module}</TdText></Td>
                  <Td>
                    <div className="font-semibold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{row.userName || "—"}</div>
                    <div className="text-xs text-gray-400">{row.userEmail}</div>
                  </Td>
                  <Td><TdText>{row.description}</TdText></Td>
                  <Td>
                    <div className="text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{dayjs(row.createdAt).format("DD MMM YYYY, hh:mm a")}</div>
                    <div className="text-xs text-gray-400 font-mono">{row.ip || "—"}</div>
                  </Td>
                </Tr>
                {row.changes && expanded.has(row._id) && (
                  <Tr key={row._id + "-detail"} className="hover:!bg-transparent">
                    <Td colSpan={5} className="bg-gray-50 dark:bg-[#162032]">
                      <div className="py-1 space-y-1.5">
                        {Object.entries(row.changes).map(([field, c]) => (
                          <div key={field} className="flex gap-2 text-xs">
                            <strong className="min-w-[140px] text-[#1A1A2E] dark:text-[#F1F5F9]">{field}</strong>
                            <span className="text-gray-400">{fmtVal(c.from)}</span>
                            <span className="text-gray-400">→</span>
                            <span className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{fmtVal(c.to)}</span>
                          </div>
                        ))}
                      </div>
                    </Td>
                  </Tr>
                )}
              </>
            ))}
          </Tbody>
        </Table>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-gray-400">{total} log entries</span>
          <Pagination page={page} totalPages={Math.ceil(total / pageSize)} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
