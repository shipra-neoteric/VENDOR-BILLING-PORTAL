import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import dayjs from "dayjs";
import { ArrowLeft } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import { FilterRow, SearchFilter, SelectFilter } from "../../ui/Filters";
import { DatePicker } from "../../ui/DatePicker";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import Badge from "../../ui/Badge";
import Btn from "../../ui/Btn";
import Pagination from "../../ui/Pagination";
import { Skeleton } from "../../ui/Skeleton";
import Modal from "../../ui/Modal";
import { AUDIT_MODULES } from "./moduleMeta";
import ActivityDetailDrawer from "./ActivityDetailDrawer";

export type Action = "LOGIN" | "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REJECT";

export interface LogRow {
  _id: string;
  action: Action;
  module: string;
  userName?: string;
  userEmail?: string;
  description: string;
  entityType?: string;
  entityId?: string | null;
  entityLabel?: string;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  ip?: string;
  createdAt: string;
}

const ACTION_COLOR: Record<Action, "gray" | "green" | "blue" | "red" | "amber" | "purple"> = {
  LOGIN: "gray",
  CREATE: "green",
  UPDATE: "blue",
  DELETE: "red",
  APPROVE: "amber",
  REJECT: "purple",
};

// WorkOrder is the only module with a real standalone detail route today
// (/work-items/:id) — every other entity's "detail view" lives inside a
// Modal opened from its own list page, so there's nowhere to deep-link to.
function ResourceCell({ row }: { row: LogRow }) {
  if (!row.entityType) return <span className="text-gray-400">—</span>;
  const label = `${row.entityType}${row.entityLabel ? `: ${row.entityLabel}` : ""}`;
  if (row.entityType === "WorkOrder" && row.entityId) {
    return (
      <Link
        to={`/work-items/${row.entityId}`}
        className="text-primary font-semibold hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {label}
      </Link>
    );
  }
  return <span className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{label}</span>;
}

export default function ModuleLogs() {
  const { module } = useParams<{ module: string }>();
  const navigate = useNavigate();
  const meta = AUDIT_MODULES.find((m) => m.key === module);

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<LogRow | null>(null);

  const [actionFilter, setActionFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const load = () => {
    if (!module) return;
    setLoading(true);
    apiClient
      .get("/audit-logs", {
        params: {
          module,
          action: actionFilter || undefined,
          source: sourceFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          search: search || undefined,
          page,
          limit: pageSize,
        },
      })
      .then((res) => {
        setLogs(res.data.logs ?? []);
        setTotal(res.data.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, actionFilter, sourceFilter, dateFrom, dateTo, search, page]);

  return (
    <div>
      <button
        onClick={() => navigate("/audit-logs")}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-primary mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> All Audit Logs
      </button>

      <PageHeader title={meta?.label ?? module ?? ""} subtitle={meta?.subtitle} icon={meta?.icon} />

      <FilterRow>
        <SelectFilter
          value={actionFilter}
          onChange={(v) => {
            setActionFilter(v);
            setPage(1);
          }}
          placeholder="All Actions"
          options={(Object.keys(ACTION_COLOR) as Action[]).map((a) => ({ label: a, value: a }))}
        />
        <SelectFilter
          value={sourceFilter}
          onChange={(v) => {
            setSourceFilter(v);
            setPage(1);
          }}
          placeholder="All Sources"
          options={[
            { label: "User", value: "user" },
            { label: "System", value: "system" },
          ]}
        />
        <DatePicker
          value={dateFrom}
          onChange={(v) => {
            setDateFrom(v);
            setPage(1);
          }}
        />
        <DatePicker
          value={dateTo}
          onChange={(v) => {
            setDateTo(v);
            setPage(1);
          }}
        />
        <SearchFilter
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search description, user, or record…"
        />
      </FilterRow>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Performed By</Th>
              <Th>Resource</Th>
              <Th>Action</Th>
              <Th>Description</Th>
              <Th>Date</Th>
              <Th>Details</Th>
            </Tr>
          </Thead>
          <Tbody>
            {logs.length === 0 && (
              <Tr>
                <Td colSpan={6}>
                  <div className="text-center text-gray-400 py-8">No audit log entries match these filters</div>
                </Td>
              </Tr>
            )}
            {logs.map((row) => (
              <Tr key={row._id}>
                <Td>
                  <div className="font-semibold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{row.userName || "—"}</div>
                  <div className="text-xs text-gray-400">{row.userEmail}</div>
                </Td>
                <Td>
                  <ResourceCell row={row} />
                </Td>
                <Td>
                  <Badge color={ACTION_COLOR[row.action]} small>
                    {row.action}
                  </Badge>
                </Td>
                <Td>
                  <TdText>{row.description}</TdText>
                </Td>
                <Td>
                  <div className="text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{dayjs(row.createdAt).format("DD MMM YYYY, hh:mm a")}</div>
                </Td>
                <Td>
                  <Btn small outline label="View Details" onClick={() => setSelected(row)} />
                </Td>
              </Tr>
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

      {selected && (
        <Modal
          title="Activity Details"
          subtitle={`${selected.action} · ${selected.entityType || meta?.label || ""}`}
          icon={meta?.icon}
          onClose={() => setSelected(null)}
        >
          <ActivityDetailDrawer row={selected} />
        </Modal>
      )}
    </div>
  );
}
