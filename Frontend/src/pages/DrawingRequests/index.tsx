import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Eye, Pencil, Trash2, PenTool } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import {
  DRAWING_TYPE_OPTIONS, STATUS_OPTIONS, STATUS_LABEL, STATUS_COLOR,
  PRIORITY_OPTIONS, PRIORITY_LABEL, PRIORITY_COLOR,
  REVIEW_STATUS_OPTIONS, REVIEW_STATUS_LABEL, REVIEW_STATUS_COLOR,
} from "../../shared/constants/drawingRequestOptions";
import type { DrawingRequest } from "../../shared/constants/drawingRequestOptions";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Badge from "../../ui/Badge";
import { FilterRow, SearchFilter, SelectFilter } from "../../ui/Filters";
import { DateRangePicker } from "../../ui/DatePicker";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import { SkeletonTable } from "../../ui/Skeleton";
import ConfirmModal from "../../ui/ConfirmModal";
import DrawingRequestViewModal from "../../components/DrawingRequestViewModal";
import DrawingRequestEditModal from "../../components/DrawingRequestEditModal";
import DrawingRequestButton from "../../components/DrawingRequestButton";

export default function DrawingRequests() {
  const [requests, setRequests] = useState<DrawingRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [projectOptions, setProjectOptions] = useState<{ label: string; value: string }[]>([]);

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

  useEffect(() => {
    apiClient.get("/projects")
      .then(res => setProjectOptions((res.data.projects ?? []).map((p: { _id: string; name: string }) => ({ label: p.name, value: p._id }))))
      .catch(() => {});
  }, []);

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

  return (
    <div>
      <PageHeader
        title="Drawing Requests"
        subtitle={`Manage drawing requests — ${requests.length} total`}
        icon={PenTool}
        actions={<DrawingRequestButton projectOptions={projectOptions} onSubmitted={load} />}
      />

      <FilterRow>
        <SearchFilter value={search} onChange={setSearch} placeholder="Search project…" />
        <SelectFilter value={typeFilter} onChange={setTypeFilter} placeholder="All Types" options={DRAWING_TYPE_OPTIONS.map(t => ({ label: t, value: t }))} />
        <SelectFilter value={priorityFilter} onChange={setPriorityFilter} placeholder="All Priorities" options={PRIORITY_OPTIONS.map(p => ({ label: PRIORITY_LABEL[p], value: p }))} />
        <SelectFilter value={statusFilter} onChange={setStatusFilter} placeholder="All Statuses" options={STATUS_OPTIONS.map(s => ({ label: STATUS_LABEL[s], value: s }))} />
        <SelectFilter value={reviewStatusFilter} onChange={setReviewStatusFilter} placeholder="All Review Stages" options={REVIEW_STATUS_OPTIONS.map(s => ({ label: REVIEW_STATUS_LABEL[s], value: s }))} />
        <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        <Btn label="Search" icon={Eye} color="purple" onClick={load} />
      </FilterRow>

      {loading ? (
        <SkeletonTable rows={6} cols={14} />
      ) : requests.length === 0 ? (
        <div className="text-center py-14 text-gray-400">No drawing requests match these filters</div>
      ) : (
        <Table className="min-w-[1500px]">
          <Thead>
            <Tr>
              <Th className="w-[7%]">Ticket No</Th>
              <Th className="w-[9%]">Project</Th>
              <Th className="w-[13%]">Description</Th>
              <Th className="w-[7%]">Type</Th>
              <Th className="w-[7%]">Source</Th>
              <Th className="w-[8%]">Requested By</Th>
              <Th className="w-[8%]">Request Date</Th>
              <Th className="w-[7%]">Review</Th>
              <Th className="w-[6%]">Priority</Th>
              <Th className="w-[7%]">Status</Th>
              <Th className="w-[7%]">Plan. Verified</Th>
              <Th className="w-[6%]">Proj. Ack.</Th>
              <Th className="w-[9%]">Remarks</Th>
              <Th className="w-[9%]">Action</Th>
            </Tr>
          </Thead>
          <Tbody>
            {requests.map(r => (
              <Tr key={r._id}>
                <Td className="whitespace-nowrap truncate"><span className="font-mono font-bold text-purple-600 dark:text-purple-400">{r.ticketNo}</span></Td>
                <Td className="whitespace-nowrap truncate"><span className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{r.projectName}</span></Td>
                <Td><span className="max-w-[180px] truncate block" title={r.description}>{r.description}</span></Td>
                <Td className="whitespace-nowrap truncate"><TdText>{r.drawingType}</TdText></Td>
                <Td className="whitespace-nowrap truncate">{r.source ? <TdText>{r.source}</TdText> : <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                <Td className="whitespace-nowrap truncate"><TdText>{r.driName}</TdText></Td>
                <Td className="whitespace-nowrap truncate"><TdText>{dayjs(r.createdAt).format("DD MMM YYYY")}</TdText></Td>
                <Td><Badge color={REVIEW_STATUS_COLOR[r.reviewStatus]} small>{REVIEW_STATUS_LABEL[r.reviewStatus]}</Badge></Td>
                <Td>{r.priority ? <Badge color={PRIORITY_COLOR[r.priority]} small>{PRIORITY_LABEL[r.priority]}</Badge> : <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                <Td><Badge color={STATUS_COLOR[r.status]} small>{STATUS_LABEL[r.status]}</Badge></Td>
                <Td><span className={r.planningVerified ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-gray-400"}>{r.planningVerified ? "Yes" : "No"}</span></Td>
                <Td><span className={r.projectAcknowledged ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-gray-400"}>{r.projectAcknowledged ? "Yes" : "No"}</span></Td>
                <Td>{r.remarks ? <span className="max-w-[140px] truncate block" title={r.remarks}>{r.remarks}</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                <Td>
                  <div className="flex gap-1">
                    <Btn small outline icon={Eye} onClick={() => setViewTarget(r)} />
                    <Btn small outline icon={Pencil} onClick={() => setEditTarget(r)} />
                    <Btn small color="red" icon={Trash2} onClick={() => setDeleteTarget(r)} />
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

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
