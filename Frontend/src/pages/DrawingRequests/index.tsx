import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Eye, Pencil, Trash2, PenTool, Clock, CalendarCheck, CheckCircle2, AlertTriangle } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import {
  DRAWING_TYPE_OPTIONS, STATUS_OPTIONS, STATUS_LABEL, STATUS_COLOR,
  PRIORITY_OPTIONS, PRIORITY_LABEL, PRIORITY_COLOR, delayDays,
  REVIEW_STATUS_OPTIONS, REVIEW_STATUS_LABEL, REVIEW_STATUS_COLOR,
} from "../../shared/constants/drawingRequestOptions";
import type { DrawingRequest } from "../../shared/constants/drawingRequestOptions";
import PageHeader from "../../ui/PageHeader";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import { SearchFilter, DropdownSelectFilter } from "../../ui/Filters";
import { DateRangePicker } from "../../ui/DatePicker";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import { SkeletonTable } from "../../ui/Skeleton";
import EmptyState from "../../ui/EmptyState";
import ConfirmModal from "../../ui/ConfirmModal";
import DropdownMenu from "../../ui/DropdownMenu";
import type { DropdownMenuItem } from "../../ui/DropdownMenu";
import DrawingRequestViewModal from "../../components/DrawingRequestViewModal";
import DrawingRequestEditModal from "../../components/DrawingRequestEditModal";

// The old Badge component's palette includes "purple", which NxBadge doesn't
// — map it onto the closest Nexora semantic color (indigo = in-progress/
// approved-stage) rather than editing the shared drawingRequestOptions.ts
// constants (other not-yet-migrated pages still read those colors too).
function toNxColor(c: "gray" | "blue" | "green" | "red" | "amber" | "purple" | "teal"): NxBadgeColor {
  return c === "purple" ? "indigo" : c;
}

export default function DrawingRequests() {
  const [requests, setRequests] = useState<DrawingRequest[]>([]);
  const [loading, setLoading]   = useState(true);

  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter]     = useState("");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [typeFilter, setTypeFilter]         = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");

  const [viewTarget, setViewTarget]     = useState<DrawingRequest | null>(null);
  const [editTarget, setEditTarget]     = useState<DrawingRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DrawingRequest | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    apiClient.get("/drawing-requests", {
      params: {
        search: search || undefined,
        status: statusFilter || undefined,
        reviewStatus: reviewStatusFilter || undefined,
        priority: priorityFilter || undefined,
        drawingType: typeFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      },
    })
      .then(res => setRequests(res.data.requests ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, statusFilter, reviewStatusFilter, priorityFilter, typeFilter, dateFrom, dateTo]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/drawing-requests/${deleteTarget._id}`);
      toast.success(`${deleteTarget.ticketNo} deleted`);
      setDeleteTarget(null);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Delete failed";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  // Reflects whatever the current filters already returned from the server
  // (status is filtered server-side, not client-side) — so with a status
  // filter active, the other status cards will read 0 rather than a true
  // unfiltered total. Clicking a card still works as a quick toggle since it
  // just drives the same statusFilter the dropdown already uses.
  const statusCounts = useMemo(() => ({
    pending:   requests.filter(r => r.status === "pending").length,
    committed: requests.filter(r => r.status === "committed").length,
    completed: requests.filter(r => r.status === "completed").length,
    delayed:   requests.filter(r => r.status === "delayed").length,
  }), [requests]);

  const pager = usePagination(requests, 10);

  return (
    <div>
      <PageHeader
        title="Drawing Requests"
        subtitle={`Manage drawing requests — ${requests.length} total`}
        icon={PenTool}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <NxStatCard
          label="Pending" value={statusCounts.pending} icon={Clock}
          active={statusFilter === "pending"} onClick={() => setStatusFilter(statusFilter === "pending" ? "" : "pending")}
        />
        <NxStatCard
          label="Committed" value={statusCounts.committed} icon={CalendarCheck}
          active={statusFilter === "committed"} onClick={() => setStatusFilter(statusFilter === "committed" ? "" : "committed")}
        />
        <NxStatCard
          label="Completed" value={statusCounts.completed} icon={CheckCircle2}
          active={statusFilter === "completed"} onClick={() => setStatusFilter(statusFilter === "completed" ? "" : "completed")}
        />
        <NxStatCard
          label="Delayed" value={statusCounts.delayed} icon={AlertTriangle}
          active={statusFilter === "delayed"} onClick={() => setStatusFilter(statusFilter === "delayed" ? "" : "delayed")}
        />
      </div>

      <div className="bg-white/90 dark:bg-gray-800/95 backdrop-blur-xl border border-gray-100 dark:border-gray-700/50 rounded-xl shadow-sm p-5">
        <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
          <div className="flex gap-2.5 items-center flex-wrap">
            <SearchFilter value={search} onChange={setSearch} placeholder="Search project…" />
            <DropdownSelectFilter
              value={typeFilter} onChange={setTypeFilter} placeholder="All Types" resetValue=""
              options={DRAWING_TYPE_OPTIONS.map(t => ({ label: t, value: t }))}
            />
            <DropdownSelectFilter
              value={priorityFilter} onChange={setPriorityFilter} placeholder="All Priorities" resetValue=""
              options={PRIORITY_OPTIONS.map(p => ({ label: PRIORITY_LABEL[p], value: p }))}
            />
            <DropdownSelectFilter
              value={statusFilter} onChange={setStatusFilter} placeholder="All Statuses" resetValue=""
              options={STATUS_OPTIONS.map(s => ({ label: STATUS_LABEL[s], value: s }))}
            />
            <DropdownSelectFilter
              value={reviewStatusFilter} onChange={setReviewStatusFilter} placeholder="All Review Stages" resetValue=""
              options={REVIEW_STATUS_OPTIONS.map(s => ({ label: REVIEW_STATUS_LABEL[s], value: s }))}
            />
            <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
            <NxBtn color="secondary" icon={Eye} label="Search" onClick={load} />
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={11} />
        ) : requests.length === 0 ? (
          <EmptyState icon={PenTool} title="No drawing requests" message="No drawing requests match these filters." />
        ) : (
          <>
            <Table>
              <Thead>
                <Tr>
                  <Th>Ticket No</Th>
                  <Th>Project</Th>
                  <Th>Description</Th>
                  <Th>Type</Th>
                  <Th>Source</Th>
                  <Th>Requested By</Th>
                  <Th>Request Date</Th>
                  <Th>Review</Th>
                  <Th>Assigned To</Th>
                  <Th>Priority</Th>
                  <Th>Status</Th>
                  <Th>Committed</Th>
                  <Th>Actual Completion</Th>
                  <Th>Delay</Th>
                  <Th>Plan. Verified</Th>
                  <Th>Proj. Ack.</Th>
                  <Th>Remarks</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pager.pageItems.map(r => {
                  const delay = delayDays(r);
                  const menuItems: DropdownMenuItem[] = [
                    { key: "delete", label: "Delete", icon: Trash2, danger: true, onClick: () => setDeleteTarget(r) },
                  ];
                  return (
                    <Tr key={r._id}>
                      <Td><span className="font-bold text-primary">{r.ticketNo}</span></Td>
                      <Td><span className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{r.projectName}</span></Td>
                      <Td><span className="max-w-[180px] truncate block" title={r.description}><TdText>{r.description}</TdText></span></Td>
                      <Td><TdText>{r.drawingType}</TdText></Td>
                      <Td>{r.source ? <TdText>{r.source}</TdText> : <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                      <Td><TdText>{r.driName}</TdText></Td>
                      <Td><TdText>{dayjs(r.createdAt).format("DD MMM YYYY")}</TdText></Td>
                      <Td><NxBadge color={toNxColor(REVIEW_STATUS_COLOR[r.reviewStatus])}>{REVIEW_STATUS_LABEL[r.reviewStatus]}</NxBadge></Td>
                      <Td>{r.assignedTo ? <TdText>{r.assignedTo.name}</TdText> : <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                      <Td>{r.priority ? <NxBadge color={toNxColor(PRIORITY_COLOR[r.priority])}>{PRIORITY_LABEL[r.priority]}</NxBadge> : <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                      <Td><NxBadge color={toNxColor(STATUS_COLOR[r.status])}>{STATUS_LABEL[r.status]}</NxBadge></Td>
                      <Td>{r.committedDate ? <TdText>{dayjs(r.committedDate).format("DD MMM YYYY")}</TdText> : <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                      <Td>{r.actualCompletionDate ? <TdText>{dayjs(r.actualCompletionDate).format("DD MMM YYYY")}</TdText> : <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                      <Td>{delay !== null ? <NxBadge color={delay > 0 ? "red" : "green"}>{delay > 0 ? `+${delay}d` : `${delay}d`}</NxBadge> : <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                      <Td>{r.planningVerified ? <NxBadge color="green">Yes</NxBadge> : <NxBadge color="gray">No</NxBadge>}</Td>
                      <Td>{r.projectAcknowledged ? <NxBadge color="green">Yes</NxBadge> : <NxBadge color="gray">No</NxBadge>}</Td>
                      <Td>{r.remarks ? <span className="max-w-[140px] truncate block" title={r.remarks}><TdText>{r.remarks}</TdText></span> : <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                      <Td>
                        <div className="flex items-center gap-1">
                          <NxBtn color="icon" title="View" icon={Eye} onClick={() => setViewTarget(r)} />
                          <NxBtn color="icon" title="Edit" icon={Pencil} onClick={() => setEditTarget(r)} />
                          <DropdownMenu items={menuItems} />
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
            {pager.totalPages > 1 && <div className="mt-4"><Pagination page={pager.page} totalPages={pager.totalPages} onChange={pager.setPage} /></div>}
          </>
        )}
      </div>

      {viewTarget && (
        <DrawingRequestViewModal
          request={viewTarget}
          onClose={() => setViewTarget(null)}
          onUpdated={(updated) => {
            setRequests(prev => prev.map(r => r._id === updated._id ? updated : r));
            setViewTarget(updated);
          }}
        />
      )}

      {editTarget && (
        <DrawingRequestEditModal
          request={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={updated => {
            setRequests(prev => prev.map(r => r._id === updated._id ? updated : r));
            setEditTarget(null);
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete ${deleteTarget.ticketNo}?`}
          message="This cannot be undone."
          confirmLabel="Delete" danger loading={deleting}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
