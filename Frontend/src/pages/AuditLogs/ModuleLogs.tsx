import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import dayjs from "dayjs";
import { ArrowLeft, FileText, History } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import { FilterRow, SearchFilter, SelectFilter } from "../../ui/Filters";
import DateRangeFilter from "../../components/DateRangeFilter";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import Badge from "../../ui/Badge";
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

function initials(name?: string) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

// Deterministic (hash of the name) so the same person always gets the same
// color across rows, instead of a random one re-rolling on every render.
const AVATAR_COLORS = ["#F97316", "#0EA5E9", "#8B5CF6", "#10B981", "#EF4444", "#EAB308", "#EC4899"];
function avatarColor(name?: string) {
  const s = name || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function PerformedByCell({ row }: { row: LogRow }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
        style={{ backgroundColor: avatarColor(row.userName) }}
      >
        {initials(row.userName)}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-sm text-[#1A1A2E] dark:text-[#F1F5F9] truncate">{row.userName || "System"}</div>
        <div className="text-xs text-gray-400 truncate">{row.userEmail}</div>
      </div>
    </div>
  );
}

// WorkOrder is the only module with a real standalone detail route today
// (/work-items/:id) — every other entity's "detail view" lives inside a
// Modal opened from its own list page, so there's nowhere to deep-link to.
function ResourceCell({ row }: { row: LogRow }) {
  if (!row.entityType) return <span className="text-gray-400">—</span>;
  const inner = row.entityType === "WorkOrder" && row.entityId ? (
    <Link
      to={`/work-items/${row.entityId}`}
      className="block truncate font-semibold text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {row.entityType}
    </Link>
  ) : (
    <span className="block truncate font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{row.entityType}</span>
  );
  return (
    <div className="flex items-start gap-2 min-w-0" title={`${row.entityType}${row.entityLabel ? `: ${row.entityLabel}` : ""}`}>
      <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
      <div className="min-w-0">
        {inner}
        {/* Skip the subtitle when it's just the same email already shown
            under Performed By (e.g. a login's "User: <email>") — repeating
            it added width/clutter with no new information. */}
        {row.entityLabel && row.entityLabel !== row.userEmail && (
          <div className="text-xs text-gray-400 truncate">{row.entityLabel}</div>
        )}
      </div>
    </div>
  );
}

export default function ModuleLogs() {
  const { module } = useParams<{ module: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const meta = AUDIT_MODULES.find((m) => m.key === module);
  // "all" (navigated here from Audit Logs' own "By User" tab) means every
  // module for this one user, not one module for every user — the inverse
  // of this page's usual scope — so it's never sent as a module filter.
  const isAllModules = module === "all";

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<LogRow | null>(null);

  const [actionFilter, setActionFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [userFilter, setUserFilter] = useState(() => searchParams.get("user") || "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [userOptions, setUserOptions] = useState<{ label: string; value: string }[]>([]);

  const load = () => {
    if (!module) return;
    setLoading(true);
    apiClient
      .get("/audit-logs", {
        params: {
          module: isAllModules ? undefined : module,
          action: actionFilter || undefined,
          source: sourceFilter || undefined,
          userEmail: userFilter || undefined,
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
  }, [module, actionFilter, sourceFilter, userFilter, dateFrom, dateTo, search, page]);

  // Populated once per module — every distinct actor who has logged
  // something here, newest-active first, for the "All Users" filter below.
  useEffect(() => {
    if (!module) return;
    apiClient.get("/audit-logs/users", { params: { module: isAllModules ? undefined : module } })
      .then((res) => setUserOptions(
        (res.data.users ?? []).map((u: { userEmail: string; userName?: string }) => ({
          label: u.userName ? `${u.userName} (${u.userEmail})` : (u.userEmail || "System"),
          value: u.userEmail,
        }))
      ))
      .catch(() => {});
  }, [module]);

  return (
    <div>
      <PageHeader
        title={isAllModules ? "All Activity" : (meta?.label ?? module ?? "")}
        subtitle={isAllModules ? "Every module's activity for this user" : meta?.subtitle}
        icon={isAllModules ? History : meta?.icon}
        actions={
          <button
            onClick={() => navigate("/audit-logs")}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-primary"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> All Audit Logs
          </button>
        }
      />

      <FilterRow>
        <SearchFilter
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search description, user, or record…"
        />
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
        <SelectFilter
          value={userFilter}
          onChange={(v) => {
            setUserFilter(v);
            setPage(1);
          }}
          placeholder="All Users"
          options={userOptions}
        />
        <DateRangeFilter
          onChange={(from, to) => {
            setDateFrom(from ? from.format("YYYY-MM-DD") : "");
            setDateTo(to ? to.format("YYYY-MM-DD") : "");
            setPage(1);
          }}
        />
      </FilterRow>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <Table className="table-fixed min-w-[1000px]">
          <Thead>
            <Tr>
              <Th className="w-[16%]">Performed By</Th>
              {isAllModules && <Th className="w-[12%]">Module</Th>}
              <Th className={isAllModules ? "w-[13%]" : "w-[16%]"}>Resource</Th>
              <Th className="w-[9%]">Action</Th>
              <Th className={isAllModules ? "w-[29%]" : "w-[34%]"}>Description</Th>
              <Th className="w-[21%]">Date</Th>
            </Tr>
          </Thead>
          <Tbody>
            {logs.length === 0 && (
              <Tr>
                <Td colSpan={isAllModules ? 6 : 5}>
                  <div className="text-center text-gray-400 py-8">No audit log entries match these filters</div>
                </Td>
              </Tr>
            )}
            {logs.map((row) => (
              <Tr
                key={row._id}
                onClick={() => setSelected(row)}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40"
              >
                <Td className="whitespace-nowrap truncate">
                  <PerformedByCell row={row} />
                </Td>
                {isAllModules && (
                  <Td className="whitespace-nowrap truncate">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {AUDIT_MODULES.find((m) => m.key === row.module)?.label ?? row.module}
                    </span>
                  </Td>
                )}
                <Td className="whitespace-nowrap truncate">
                  <ResourceCell row={row} />
                </Td>
                <Td className="whitespace-nowrap">
                  <Badge color={ACTION_COLOR[row.action]} small>
                    {row.action}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap truncate">
                  <TdText>{row.description}</TdText>
                </Td>
                <Td className="whitespace-nowrap">
                  <div className="text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{dayjs(row.createdAt).format("DD MMM YYYY, hh:mm a")}</div>
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
