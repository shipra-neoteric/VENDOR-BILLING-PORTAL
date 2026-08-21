import { useEffect, useMemo, useState } from "react";
import { Briefcase, FileText, PlayCircle, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import apiClient from "../../services/apiClient";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import { Skeleton } from "../../ui/Skeleton";
import NxCard from "../../ui/nexora/Card";
import NxBadge from "../../ui/nexora/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import { NxFilterRow, NxSearchFilter, NxSelectFilter } from "../../ui/nexora/Filters";
import type { NxBadgeColor } from "../../ui/nexora/Badge";

interface PreviewWO {
  _id: string;
  workOrderNo: string;
  projectName: string;
  category?: string;
  vendorName?: string;
  companyName?: string;
  contractValue?: number;
  status: string;
}

const STATUS_BADGE: Record<string, NxBadgeColor> = {
  draft: "gray",
  issued: "blue",
  "in-progress": "amber",
  completed: "green",
  cancelled: "red",
};

const PAGE_SIZE = 10;

// A self-contained, read-only demo of the Nexora IMS style guide (dynamic
// theme color, stat cards, table, badges, filters) applied to real work
// order data — deliberately separate from the real Work Orders page and
// its ui/ components, so nothing else in the app changes until this look
// is approved and the real pages are switched over to it.
export default function NexoraPreview() {
  const [workOrders, setWorkOrders] = useState<PreviewWO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    apiClient
      .get("/work-orders")
      .then((res) => setWorkOrders(res.data.workOrders ?? res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c = { total: workOrders.length, draft: 0, inProgress: 0, completed: 0 };
    for (const wo of workOrders) {
      if (wo.status === "draft") c.draft++;
      else if (wo.status === "in-progress" || wo.status === "issued") c.inProgress++;
      else if (wo.status === "completed") c.completed++;
    }
    return c;
  }, [workOrders]);

  const categories = useMemo(
    () => Array.from(new Set(workOrders.map((w) => w.category).filter(Boolean))) as string[],
    [workOrders]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workOrders.filter((wo) => {
      const matchSearch = !q || wo.workOrderNo.toLowerCase().includes(q) || wo.projectName?.toLowerCase().includes(q);
      const matchStatus = !statusFilter || wo.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [workOrders, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="max-w-6xl">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Style Pilot — Not a real page
        </span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Work Orders</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Read-only preview of the Nexora IMS style guide applied to real work order data.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <NxStatCard label="Total Work Orders" value={counts.total} icon={Briefcase} />
        <NxStatCard
          label="Draft" value={counts.draft} icon={FileText}
          active={statusFilter === "draft"} onClick={() => { setStatusFilter(statusFilter === "draft" ? "" : "draft"); setPage(1); }}
        />
        <NxStatCard
          label="In Progress" value={counts.inProgress} icon={PlayCircle}
          active={statusFilter === "in-progress"} onClick={() => { setStatusFilter(statusFilter === "in-progress" ? "" : "in-progress"); setPage(1); }}
        />
        <NxStatCard
          label="Completed" value={counts.completed} icon={CheckCircle2}
          active={statusFilter === "completed"} onClick={() => { setStatusFilter(statusFilter === "completed" ? "" : "completed"); setPage(1); }}
        />
      </div>

      <NxCard className="mb-4">
        <NxFilterRow>
          <NxSearchFilter value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by WO No or project…" />
          <NxSelectFilter
            value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} placeholder="All Statuses"
            options={[
              { label: "Draft", value: "draft" }, { label: "Issued", value: "issued" },
              { label: "In Progress", value: "in-progress" }, { label: "Completed", value: "completed" },
              { label: "Cancelled", value: "cancelled" },
            ]}
          />
          {categories.length > 0 && (
            <NxSelectFilter value="" onChange={() => {}} placeholder="All Categories" options={categories.map((c) => ({ label: c, value: c }))} />
          )}
        </NxFilterRow>
      </NxCard>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>WO No</Th>
              <Th>Project</Th>
              <Th>Vendor</Th>
              <Th>Contract Value</Th>
              <Th>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {pageRows.length === 0 && (
              <Tr><Td colSpan={5}><div className="text-center text-gray-400 py-8">No work orders match these filters</div></Td></Tr>
            )}
            {pageRows.map((wo) => (
              <Tr key={wo._id} className="cursor-pointer">
                <Td><TdText>{wo.workOrderNo}</TdText></Td>
                <Td><TdText>{wo.projectName}</TdText></Td>
                <Td><TdText>{wo.vendorName || "—"}</TdText></Td>
                <Td className="text-right font-bold">₹{(wo.contractValue ?? 0).toLocaleString("en-IN")}</Td>
                <Td>
                  <NxBadge color={STATUS_BADGE[wo.status] ?? "gray"}>
                    {wo.status.replace("-", " ")}
                  </NxBadge>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 px-3 sm:px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg mt-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 border rounded disabled:opacity-40 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Prev</span>
          </button>
          {Array.from({ length: totalPages }).slice(0, 5).map((_, i) => (
            <button
              key={i} type="button" onClick={() => setPage(i + 1)}
              className={`px-2.5 sm:px-3 py-1.5 min-w-[32px] border rounded ${
                page === i + 1 ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 border rounded disabled:opacity-40 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
          >
            <span className="hidden sm:inline">Next</span> <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
