import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Check, X, Eye, Trophy, Inbox, FileText } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import { selectableProjects } from "../../utils/projectOptions";
import { useAuth } from "../../context/AuthContext";
import WorkflowInstanceStepper from "../../components/WorkflowInstanceStepper";
import type { WorkflowInstance } from "../../types/Workflow";
import { billFinancials } from "../../shared/utils/billMath";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Badge from "../../ui/Badge";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import Segmented from "../../ui/Segmented";
import Switch from "../../ui/Switch";
import Field from "../../ui/Field";
import { SearchFilter, DropdownSelectFilter } from "../../ui/Filters";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import Checkbox from "../../ui/Checkbox";
import Spinner from "../../ui/Spinner";
import EmptyState from "../../ui/EmptyState";
import DropdownMenu from "../../ui/DropdownMenu";
import type { DropdownMenuItem } from "../../ui/DropdownMenu";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import Pagination from "../../ui/Pagination";

const fmt = (n: number) => "₹" + (n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Per-unit rates are fractional far more often than totals are — rounding
// them for display (as fmt() does) silently turns 130.5 into 131.
const fmtRate = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CFG: Record<string, { color: "orange" | "blue" | "green" | "red"; label: string }> = {
  pending:      { color: "orange", label: "Pending (L1 — AGM)"  },
  "pending-gm": { color: "blue",   label: "Pending (L2 — GM)"   },
  approved:     { color: "green",  label: "Approved" },
  rejected:     { color: "red",    label: "Rejected" },
};

const PAGE_SIZE = 20;

interface BillItem {
  scopeItemId?: string;
  description: string;
  unit: string;
  billedQty: number;
  rate?: number;
  amount?: number;
}

interface BillRequest {
  _id: string;
  reqNo: string;
  stageNo?: number;
  workOrderId?: string;
  workOrderNo: string;
  projectId?: string;
  projectName: string;
  projectLocation?: string;
  vendorCode?: string;
  vendorName: string;
  category: string;
  subCategory: string;
  items: BillItem[];
  remarks: string;
  periodFrom?: string;
  periodTo?: string;
  status: "pending" | "pending-gm" | "approved" | "rejected";
  rejectReason?: string;
  requestedBy?: { name: string; email: string };
  billId?: { billNo: string; status: string; amount: number; paidAmount?: number; retentionPercent?: number; retentionAmount?: number; advanceRecovery?: number; gstPercent?: number; tdsAmount?: number; adjustmentAmount?: number; adjustmentRemark?: string; paymentDate?: string; paymentMode?: string; paymentUTR?: string; paymentBank?: string; paymentReleasedBy?: string };
  milestoneAchieved?: boolean;
  milestoneDate?: string;
  createdAt: string;
  isArchived?: boolean;
  archivedAt?: string;
}

export default function BillRequests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const openId = searchParams.get("open");
  const [requests,      setRequests]      = useState<BillRequest[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [tab,           setTab]           = useState(openId ? "all" : "pending");

  const [viewReq,       setViewReq]       = useState<BillRequest | null>(null);
  const [slaInstance,   setSlaInstance]   = useState<WorkflowInstance | null>(null);
  const [rejectModal,   setRejectModal]   = useState(false);
  const [rejectTarget,  setRejectTarget]  = useState<string | null>(null);
  const [rejectReason,  setRejectReason]  = useState("");
  const [saving,        setSaving]        = useState(false);

  // AGM's approval — first stage of the bill chain: sets the hold/advance breakdown.
  const [approveModal,     setApproveModal]     = useState(false);
  const [approveTarget,    setApproveTarget]    = useState<string | null>(null);
  const [approveRetention, setApproveRetention] = useState("");
  const [approveAdvance,   setApproveAdvance]   = useState("");

  const [search,            setSearch]            = useState("");
  const [projectFilter,     setProjectFilter]     = useState("");
  const [projectOptions,    setProjectOptions]    = useState<{ label: string; value: string }[]>([]);
  const [showArchived,      setShowArchived]      = useState(false);
  const [selectedIds,       setSelectedIds]       = useState<string[]>([]);
  const [archiving,         setArchiving]         = useState(false);
  const [archiveTarget,     setArchiveTarget]     = useState<BillRequest | null>(null);
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);
  const [page,               setPage]               = useState(1);

  const load = async (status?: string, archived?: boolean) => {
    setLoading(true);
    setSelectedIds([]);
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (archived) params.set("archived", "true");
      const qs = params.toString();
      const res = await apiClient.get(`/bill-requests${qs ? `?${qs}` : ""}`);
      setRequests(res.data.billRequests ?? []);
    } catch { toast.error("Failed to load bill requests"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(tab === "all" ? undefined : tab, showArchived); }, [tab, showArchived]);

  // Deep link from other pages (e.g. the SLA Report's Ongoing Workflows
  // table) — ?open=<billRequestId> auto-opens that request's view modal
  // once the list has loaded.
  useEffect(() => {
    if (!openId || requests.length === 0) return;
    const match = requests.find(r => r._id === openId);
    if (match) setViewReq(match);
  }, [openId, requests]);

  useEffect(() => {
    apiClient.get("/projects")
      .then(res => setProjectOptions(
        selectableProjects((res.data.projects ?? []) as { _id: string; name: string; code: string; parentId?: string | null }[])
          .map(p => ({ label: `${p.name} (${p.code})`, value: p._id }))
      ))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!viewReq) { setSlaInstance(null); return; }
    apiClient.get("/workflows/instances", { params: { entityType: "BillRequest", entityId: viewReq._id } })
      .then(res => setSlaInstance(res.data.instances?.[0] ?? null))
      .catch(() => setSlaInstance(null));
  }, [viewReq]);

  const openApprove = (id: string) => {
    setApproveTarget(id);
    setApproveRetention("");
    setApproveAdvance("");
    setApproveModal(true);
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    setSaving(true);
    try {
      const body: Record<string, number> = {};
      if (approveRetention !== "") body.retentionAmount = Number(approveRetention);
      if (approveAdvance   !== "") body.advanceRecovery = Number(approveAdvance);
      const res = await apiClient.put(`/bill-requests/${approveTarget}/agm-approve`, body);
      toast.success(res.data.message || "Approved & bill generated");
      setApproveModal(false);
      setApproveTarget(null);
      load(tab === "all" ? undefined : tab, showArchived);
      if (viewReq?._id === approveTarget) setViewReq(null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to approve";
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setSaving(true);
    try {
      await apiClient.put(`/bill-requests/${rejectTarget}/reject`, { rejectReason });
      toast.success("Request rejected");
      setRejectModal(false);
      setRejectReason("");
      setRejectTarget(null);
      load(tab === "all" ? undefined : tab, showArchived);
      if (viewReq?._id === rejectTarget) setViewReq(null);
    } catch { toast.error("Failed to reject"); }
    finally { setSaving(false); }
  };

  async function archiveOne() {
    if (!archiveTarget) return;
    try {
      await apiClient.patch(`/bill-requests/${archiveTarget._id}/${showArchived ? "unarchive" : "archive"}`);
      toast.success(showArchived ? `${archiveTarget.reqNo} unarchived` : `${archiveTarget.reqNo} archived`);
      setArchiveTarget(null);
      load(tab === "all" ? undefined : tab, showArchived);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Action failed";
      toast.error(msg);
    }
  }

  async function archiveSelected() {
    if (selectedIds.length === 0) return;
    setArchiving(true);
    try {
      await apiClient.patch(`/bill-requests/${showArchived ? "unarchive-bulk" : "archive-bulk"}`, { ids: selectedIds });
      toast.success(`${selectedIds.length} request(s) ${showArchived ? "unarchived" : "archived"}`);
      setBulkArchiveConfirm(false);
      load(tab === "all" ? undefined : tab, showArchived);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Action failed";
      toast.error(msg);
    } finally {
      setArchiving(false);
    }
  }

  const filtered = (() => {
    let byTab = tab === "all" ? requests : requests.filter(r => r.status === tab);
    if (projectFilter) byTab = byTab.filter(r => r.projectId === projectFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      byTab = byTab.filter(r =>
        r.reqNo.toLowerCase().includes(q) ||
        r.workOrderNo.toLowerCase().includes(q) ||
        r.vendorName.toLowerCase().includes(q) ||
        (r.vendorCode || "").toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q) ||
        (r.category || "").toLowerCase().includes(q)
      );
    }
    return byTab;
  })();
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const viewTotal = viewReq ? viewReq.items.reduce((s, it) => s + (it.rate ?? 0) * it.billedQty, 0) : 0;

  const pendingCount = requests.filter(r => r.status === "pending").length;
  const allSelected = paged.length > 0 && selectedIds.length === paged.length;
  const toggleAll = () => setSelectedIds(allSelected ? [] : paged.map(r => r._id));
  const toggleOne = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div>
      <PageHeader
        title="Bill Requests"
        subtitle="DRI payment requests reviewed and converted to running bills."
        icon={FileText}
      />

      <div className="bg-white/90 dark:bg-gray-800/95 backdrop-blur-xl border border-gray-100 dark:border-gray-700/50 rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-end flex-wrap gap-2.5 mb-3">
          <Segmented
            value={tab}
            onChange={v => { setTab(v); setPage(1); }}
            options={[
              { value: "pending", label: <span className="flex items-center gap-1.5">Pending {pendingCount > 0 && <NxBadge color="amber">{pendingCount}</NxBadge>}</span> },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
              { value: "all", label: "All" },
            ]}
          />
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
          <div className="flex gap-2.5 items-center flex-wrap">
            <SearchFilter value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search by request no, work order, contractor, vendor code or project…" />
            <DropdownSelectFilter
              value={projectFilter}
              onChange={v => { setProjectFilter(v); setPage(1); }}
              placeholder="All Projects"
              resetValue=""
              options={projectOptions}
            />
            <Switch checked={showArchived} onChange={setShowArchived} onLabel="Archived" offLabel="Active" />
            {selectedIds.length > 0 && (
              <NxBtn color="secondary" icon={Inbox} loading={archiving} label={`${showArchived ? "Unarchive" : "Archive"} Selected (${selectedIds.length})`} onClick={() => setBulkArchiveConfirm(true)} />
            )}
            <span className="ml-auto text-gray-400 text-xs whitespace-nowrap">
              {filtered.length} request{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {loading ? (
          <Spinner label="Loading bill requests…" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText} title={search ? `No results for "${search}"` : `No ${tab === "all" ? "" : tab} bill requests`} />
        ) : (
          <>
            <Table>
              <Thead>
                <Tr>
                  <Th><Checkbox checked={allSelected} onChange={toggleAll} /></Th>
                  <Th>Stage / Request</Th>
                  <Th>Work Order</Th>
                  <Th>Project</Th>
                  <Th>Contractor</Th>
                  <Th>Period</Th>
                  <Th>Items</Th>
                  <Th>Requested By</Th>
                  <Th>Date</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {paged.map(r => {
                  const cfg = STATUS_CFG[r.status] ?? { color: "orange" as const, label: r.status };
                  const menuItems: DropdownMenuItem[] = [
                    { key: "archive", label: showArchived ? "Unarchive" : "Archive", icon: Inbox, onClick: () => setArchiveTarget(r) },
                  ];
                  return (
                    <Tr key={r._id}>
                      <Td><Checkbox checked={selectedIds.includes(r._id)} onChange={() => toggleOne(r._id)} /></Td>
                      <Td>
                        <div className="flex gap-1.5 items-center">
                          {r.stageNo && <NxBadge color="orange">S{r.stageNo}</NxBadge>}
                          <button type="button" onClick={() => setViewReq(r)} className="bg-transparent border-none cursor-pointer text-primary font-bold text-[13px] p-0">
                            {r.reqNo}
                          </button>
                        </div>
                        {r.milestoneAchieved && <span className="text-[10px] text-primary flex items-center gap-1"><Trophy className="w-2.5 h-2.5" /> Milestone</span>}
                      </Td>
                      <Td>
                        <span
                          className="cursor-pointer text-blue-600 dark:text-blue-400"
                          onClick={() => r.workOrderId && navigate(`/work-items/${r.workOrderId}`)}
                        >
                          {r.workOrderNo}
                        </span>
                      </Td>
                      <Td>
                        <TdText>{r.projectName}</TdText>
                        {r.projectLocation && <div className="text-[11px] text-gray-400 dark:text-gray-500">{r.projectLocation}</div>}
                      </Td>
                      <Td><TdText>{r.vendorName}</TdText></Td>
                      <Td>
                        {r.periodFrom ? (
                          <span className="text-xs text-gray-500 dark:text-gray-400">{dayjs(r.periodFrom).format("DD MMM")} → {dayjs(r.periodTo ?? r.createdAt).format("DD MMM YYYY")}</span>
                        ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </Td>
                      <Td><TdText>{r.items.length} item{r.items.length !== 1 ? "s" : ""}</TdText></Td>
                      <Td><TdText>{r.requestedBy?.name || "—"}</TdText></Td>
                      <Td><TdText>{dayjs(r.createdAt).format("DD MMM YYYY")}</TdText></Td>
                      <Td><NxBadge color={cfg.color}>{cfg.label}</NxBadge></Td>
                      <Td>
                        <div className="flex items-center gap-1 flex-wrap">
                          <NxBtn color="icon-blue" title="View" icon={Eye} onClick={() => setViewReq(r)} />
                          {r.status === "pending" && (
                            <>
                              <NxBtn color="icon-green" title="Approve" icon={Check} onClick={() => openApprove(r._id)} />
                              <NxBtn color="icon-red" title="Reject" icon={X} onClick={() => { setRejectTarget(r._id); setRejectModal(true); }} />
                            </>
                          )}
                          <DropdownMenu items={menuItems} />
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-gray-400">{filtered.length} requests</span>
                <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* View / Approve Modal */}
      {viewReq && (
        <Modal
          title={
            <div className="flex items-center gap-2">
              <span>Bill Request — {viewReq.reqNo}</span>
              {viewReq.stageNo && <Badge color="orange" small>Stage {viewReq.stageNo}</Badge>}
              {viewReq.milestoneAchieved && (
                <span className="inline-flex items-center gap-1 bg-primary text-white text-[11px] font-bold px-2 py-0.5 rounded-md"><Trophy className="w-3 h-3" /> Milestone</span>
              )}
            </div>
          }
          extraWide
          onClose={() => setViewReq(null)}
          footer={
            viewReq.status === "pending" ? (
              <div className="flex gap-2 justify-end">
                <Btn label="Close" outline onClick={() => setViewReq(null)} />
                <Btn label="Reject" color="red" onClick={() => { setRejectTarget(viewReq._id); setRejectModal(true); setViewReq(null); }} />
                <Btn label="Approve & Generate Bill" color="primary" onClick={() => { openApprove(viewReq._id); setViewReq(null); }} />
              </div>
            ) : viewReq.status === "approved" && !viewReq.milestoneAchieved ? (
              <div className="flex gap-2 justify-end">
                <Btn label="Close" outline onClick={() => setViewReq(null)} />
                <Btn label="Manage in Accounts Payment →" icon={Trophy} color="primary" onClick={() => { setViewReq(null); navigate("/accounts-payment"); }} />
              </div>
            ) : (
              <Btn label="Close" outline onClick={() => setViewReq(null)} />
            )
          }
        >
          <div className="flex flex-col gap-3.5">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-gray-800/40 p-3.5 rounded-lg">
              {[
                ["Work Order",    viewReq.workOrderNo],
                ["Project",       viewReq.projectLocation ? `${viewReq.projectName} — ${viewReq.projectLocation}` : viewReq.projectName],
                ["Contractor",    viewReq.vendorName],
                ["Category",      [viewReq.category, viewReq.subCategory].filter(Boolean).join(" › ")],
                ["Requested By",  viewReq.requestedBy?.name || "—"],
                ["Date",          dayjs(viewReq.createdAt).format("DD MMM YYYY")],
                ...(viewReq.periodFrom ? [["Period", `${dayjs(viewReq.periodFrom).format("DD MMM YYYY")} → ${dayjs(viewReq.periodTo ?? viewReq.createdAt).format("DD MMM YYYY")}`] as [string, string]] : []),
                ...(viewReq.billId ? [["Bill No.", viewReq.billId.billNo + " — " + fmt(viewReq.billId.amount)] as [string, string]] : []),
              ].map(([label, val]) => (
                <div key={label}>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
                  <div className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] text-[13px]">{val}</div>
                </div>
              ))}
            </div>

            {slaInstance && (
              <WorkflowInstanceStepper
                instance={slaInstance}
                userRole={user?.role}
                userId={user?.id}
                onChanged={() => {
                  apiClient.get("/workflows/instances", { params: { entityType: "BillRequest", entityId: viewReq._id } })
                    .then(res => setSlaInstance(res.data.instances?.[0] ?? null))
                    .catch(() => {});
                }}
                compact
              />
            )}

            {/* Items table */}
            <div>
              <div className="font-bold text-xs text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Scope Items</div>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Description</Th>
                    <Th>Unit</Th>
                    <Th className="text-right">Qty Billed</Th>
                    <Th className="text-right">Rate</Th>
                    <Th className="text-right">Amount</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {viewReq.items.map((it, i) => {
                    const amt = (it.rate ?? 0) * it.billedQty;
                    return (
                      <Tr key={i}>
                        <Td>{it.description}</Td>
                        <Td>{it.unit}</Td>
                        <Td className="text-right font-mono">{it.billedQty.toLocaleString("en-IN")}</Td>
                        <Td className="text-right">{it.rate ? fmtRate(it.rate) : <span className="text-gray-400">pending</span>}</Td>
                        <Td className="text-right font-semibold">{it.rate ? fmt(amt) : <span className="text-gray-400">—</span>}</Td>
                      </Tr>
                    );
                  })}
                </Tbody>
                {viewTotal > 0 && (
                  <tfoot>
                    <Tr className="bg-primary/5">
                      <Td colSpan={4} className="font-bold text-right text-primary">Gross Total</Td>
                      <Td className="font-bold text-right text-[#1A1A2E] dark:text-[#F1F5F9]">{fmt(viewTotal)}</Td>
                    </Tr>
                    {(viewReq.billId?.retentionPercent ?? 0) > 0 && (
                      <Tr className="bg-red-50 dark:bg-red-500/10">
                        <Td colSpan={4} className="text-right font-semibold text-red-600 dark:text-red-400">Retention @ {viewReq.billId!.retentionPercent}%</Td>
                        <Td className="text-right font-semibold font-mono text-red-600 dark:text-red-400">
                          − {fmt(viewReq.billId!.retentionAmount ?? Math.round(viewTotal * (viewReq.billId!.retentionPercent ?? 0) / 100))}
                        </Td>
                      </Tr>
                    )}
                    {(viewReq.billId?.retentionPercent ?? 0) > 0 && (
                      <Tr className="bg-emerald-50 dark:bg-emerald-500/10">
                        <Td colSpan={4} className="font-bold text-right text-emerald-600 dark:text-emerald-400">Net Release</Td>
                        <Td className="font-bold text-right font-mono text-emerald-600 dark:text-emerald-400">
                          {fmt(viewTotal - (viewReq.billId!.retentionAmount ?? Math.round(viewTotal * (viewReq.billId!.retentionPercent ?? 0) / 100)))}
                        </Td>
                      </Tr>
                    )}
                  </tfoot>
                )}
              </Table>
            </div>

            {viewReq.remarks && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-md px-2.5 py-2 text-sm text-amber-800 dark:text-amber-300">
                <strong>Remarks:</strong> {viewReq.remarks}
              </div>
            )}

            {viewReq.status === "approved" && viewReq.billId && (() => {
              const b = viewReq.billId;
              const gross   = b.amount || 0;
              const retAmt  = b.retentionAmount ?? 0;
              const advRec  = b.advanceRecovery ?? 0;
              const { gstAmount: gstAmt, netAfterHold: netPay } = billFinancials({ gross, gstPercent: b.gstPercent ?? 0, retentionAmount: retAmt, advanceRecovery: advRec });
              const paid    = b.paidAmount;
              const tdsAmt  = paid != null ? Math.max(0, Math.round(netPay - paid)) : 0;
              return (
                <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 rounded-lg p-3 text-sm">
                  <div className="font-bold mb-2 text-emerald-800 dark:text-emerald-300">Running Bill: {b.billNo}</div>
                  <div className="font-mono text-xs flex flex-col gap-0.5">
                    <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Gross Billed</span><span className="font-semibold">{fmt(gross)}</span></div>
                    {retAmt > 0 && <div className="flex justify-between text-red-600 dark:text-red-400"><span>Hold / Retention{(b.retentionPercent ?? 0) > 0 ? ` @ ${b.retentionPercent}%` : ""}</span><span>− {fmt(retAmt)}</span></div>}
                    {advRec > 0 && <div className="flex justify-between text-amber-600 dark:text-amber-400"><span>Less: Advance Recovery</span><span>− {fmt(advRec)}</span></div>}
                    {gstAmt > 0 && <div className="flex justify-between text-emerald-600 dark:text-emerald-400"><span>GST @ {b.gstPercent}%</span><span>+ {fmt(gstAmt)}</span></div>}
                    <div className="flex justify-between border-t border-emerald-300 dark:border-emerald-500/30 pt-1 mt-0.5 font-bold"><span>Net Payable</span><span>{fmt(netPay)}</span></div>
                    {tdsAmt > 0 && <div className="flex justify-between text-red-600 dark:text-red-400"><span>Less: TDS Deducted</span><span>− {fmt(tdsAmt)}</span></div>}
                    {(b.adjustmentAmount ?? 0) !== 0 && <div className={`flex justify-between ${(b.adjustmentAmount ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}><span>Adjustment{b.adjustmentRemark ? ` (${b.adjustmentRemark})` : ""}</span><span>{(b.adjustmentAmount ?? 0) > 0 ? "+" : "−"} {fmt(Math.abs(b.adjustmentAmount ?? 0))}</span></div>}
                    {paid != null && <div className="flex justify-between font-bold text-emerald-600 dark:text-emerald-400 text-[13px] mt-1 border-t border-emerald-300 dark:border-emerald-500/30 pt-1"><span>Actually Paid</span><span>{fmt(paid)}</span></div>}
                  </div>
                  {viewReq.milestoneAchieved && viewReq.milestoneDate && (
                    <div className="mt-2 text-primary font-semibold flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5" /> Payment Released: {dayjs(viewReq.milestoneDate).format("DD MMM YYYY")}
                      {b.paymentUTR && <span className="ml-2 text-xs text-purple-600 dark:text-purple-400">UTR: {b.paymentUTR}</span>}
                    </div>
                  )}
                </div>
              );
            })()}

            {viewReq.status === "rejected" && viewReq.rejectReason && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-md px-2.5 py-2 text-sm text-red-700 dark:text-red-300">
                <strong>Reject Reason:</strong> {viewReq.rejectReason}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* AGM Approve Modal — stage 1: sets hold/advance breakdown, then approves */}
      {approveModal && (
        <Modal
          title="Approve Bill Request — AGM Sign-off"
          onClose={() => { setApproveModal(false); setApproveTarget(null); }}
          footer={<Btn label="Approve & Generate Bill" color="primary" loading={saving} onClick={handleApprove} />}
        >
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3.5">
            A running bill will be generated for the amounts below. Leave a field blank to use the work order's automatic retention calculation.
          </div>
          <div className="flex flex-col gap-3">
            <Field
              label="Hold / Retention Amount (₹)" type="number" min={0}
              placeholder="Auto-calculated from work order retention %"
              value={approveRetention} onChange={e => setApproveRetention(e.target.value)}
            />
            <Field
              label="Advance Recovery Amount (₹)" type="number" min={0}
              placeholder="0"
              value={approveAdvance} onChange={e => setApproveAdvance(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <Modal
          title="Reject Bill Request"
          onClose={() => { setRejectModal(false); setRejectReason(""); setRejectTarget(null); }}
          footer={<Btn label="Confirm Rejection" color="red" loading={saving} onClick={handleReject} />}
        >
          <Field textarea rows={3} placeholder="Reason for rejection (optional)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
        </Modal>
      )}

      {archiveTarget && (
        <ConfirmModal
          title={showArchived ? `Unarchive ${archiveTarget.reqNo}?` : `Archive ${archiveTarget.reqNo}?`}
          message={showArchived ? "It will reappear in the normal list." : "It will be hidden from the normal list (and its linked bill, if any), but not deleted."}
          confirmLabel={showArchived ? "Unarchive" : "Archive"}
          onConfirm={archiveOne} onCancel={() => setArchiveTarget(null)}
        />
      )}

      {bulkArchiveConfirm && (
        <ConfirmModal
          title={showArchived ? `Unarchive ${selectedIds.length} request(s)?` : `Archive ${selectedIds.length} request(s)?`}
          message={showArchived ? "They will reappear in the normal list." : "They will be hidden from the normal list, but not deleted."}
          confirmLabel={showArchived ? "Unarchive" : "Archive"}
          loading={archiving}
          onConfirm={archiveSelected} onCancel={() => setBulkArchiveConfirm(false)}
        />
      )}
    </div>
  );
}
