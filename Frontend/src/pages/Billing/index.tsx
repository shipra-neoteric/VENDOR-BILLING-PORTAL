import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Receipt, FileText, Ban, CheckCircle2, Eye, Download, Printer } from "lucide-react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import apiClient from "../../services/apiClient";
import { printBill, resolvePrintParty } from "../../shared/utils/printBill";
import PageHeader from "../../ui/PageHeader";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import Modal from "../../ui/Modal";
import { Descriptions, DescItem } from "../../ui/Descriptions";
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import Spinner from "../../ui/Spinner";
import EmptyState from "../../ui/EmptyState";
import { SearchFilter, DropdownSelectFilter } from "../../ui/Filters";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import { selectableProjects } from "../../utils/projectOptions";
import { useAuth } from "../../context/AuthContext";
import type { AuthUser } from "../../context/AuthContext";
import { BILL_TYPE_CFG } from "../../shared/constants/billOptions";
import { BILL_STATUS, BILL_STATUS_LABEL } from "../../shared/constants/billStatus";
import { billFinancials } from "../../shared/utils/billMath";
import NewBillDrawer from "./NewBillDrawer";
import { BillStageCell, BillApprovalHistoryList, deriveBillApprovalHistory } from "../../components/BillDetailModal";
import type { BillApprovalHistoryEntry } from "../../components/BillDetailModal";

// ── Types — a read-only slice of what AccountsPayment's own Bill looks
// like; this page never edits a bill, only lists/views + creates new ones ──

interface BillLineItem {
  description: string;
  unit: string;
  plannedQty: number;
  billedQty: number;
  rate: number;
  amount: number;
}

interface Bill {
  id: string;
  billNo: string;
  workOrderId?: string;
  workOrderNo?: string;
  projectId?: string;
  projectName?: string;
  vendorCode?: string;
  vendorName?: string;
  companyName?: string;
  billDate: string;
  generatedBy?: string;
  lineItems: BillLineItem[];
  amount: number;
  gstPercent: number;
  retentionPercent?: number;
  retentionAmount?: number;
  advanceRecovery?: number;
  tdsPercent?: number;
  tdsAmount?: number;
  remarks?: string;
  status: string;
  manualApprovalStatus?: "pending" | "pending-gm" | "approved" | "rejected";
  billType?: string;
  createdAt?: string;

  // ── Accounts Payment's own Verification → L1 AGM → L2 Director → TMS
  // chain — always present on the bill itself (regardless of how it was
  // created), just empty until each stage is actually reached.
  verificationBy?: { name: string } | null;
  verificationAt?: string;
  l1ApprovedBy?: { name: string } | null;
  l1ApprovedAt?: string;
  l2ApprovedBy?: { name: string } | null;
  l2ApprovedAt?: string;
  tmsSentAt?: string;
  tmsCallbackReceivedAt?: string;
  paidAmount?: number;
  adjustmentAmount?: number;
  adjustmentRemark?: string;
  paymentUTR?: string;

  // ── Pre-Accounts sign-off ────────────────────────────────────
  // A progress-driven bill's AGM/GM approval happened on its originating
  // BillRequest, fetched separately (see loadApprovalHistory) — these are
  // only the RunningBill-level fallbacks for older/batch-created bills.
  agmApprovedBy?: { name: string } | null;
  agmApprovedAt?: string;
  // A manually created bill (Billing → New Bill) has no BillRequest at all —
  // this is its own, separate AGM/GM sign-off chain instead.
  manualAgmApprovedBy?: { name: string } | null;
  manualAgmApprovedAt?: string;
  manualGmApprovedBy?: { name: string } | null;
  manualGmApprovedAt?: string;
  manualRejectedBy?: { name: string } | null;
  manualRejectReason?: string;
}

interface ProjectOpt { id: string; name: string; code: string; parentId?: string | null; }

const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Per-unit rates are fractional far more often than totals are — rounding
// them for display (as fmt() does) silently turns 130.5 into 131.
const fmtRate = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const netAfterAdvance = (b: Bill) =>
  billFinancials({
    gross: b.amount || 0, gstPercent: b.gstPercent ?? 0,
    retentionAmount: b.retentionAmount ?? 0, advanceRecovery: b.advanceRecovery ?? 0,
  }).netPayable;
const normalizeId = (obj: Record<string, unknown>) => ({ ...obj, id: (obj._id || obj.id)?.toString() || "" });

// Nexora semantic mapping for each backend bill status — gray/amber for the
// early not-yet-approved stages, blue/indigo/cyan as it moves through the
// approval chain, orange for the on-hold warning state, green once paid,
// red once rejected. Mirrors BILL_STATUS_COLOR's ordering, just recolored
// onto the fixed Nexora badge palette instead of arbitrary hex.
const BILL_STATUS_BADGE_COLOR: Record<string, NxBadgeColor> = {
  draft: "gray",
  "verify-done": "amber",
  "l1-approved": "blue",
  approved: "indigo",
  "sent-to-tms": "cyan",
  hold: "orange",
  paid: "green",
  rejected: "red",
};

function hasPerm(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return !!user.permissions?.find((p) => p.module === "billing")?.actions.includes(action);
}

export default function Billing() {
  const { user } = useAuth();
  const canCreate = hasPerm(user, "create");

  const [bills, setBills] = useState<Bill[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);

  const [viewBillId, setViewBillId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // The pre-Accounts AGM/GM sign-off happened on this bill's originating
  // BillRequest, not on the RunningBill itself — a progress-driven bill only,
  // fetched on demand (never present on /bills' own response) once a bill is
  // opened for viewing. Stays null for a manually created bill (no
  // BillRequest exists) or once loading finishes with no match found.
  const [viewApprovalHistory, setViewApprovalHistory] = useState<BillApprovalHistoryEntry[] | null>(null);

  // Same print-ready template Accounts Payment/Site Progress already use for
  // a bill — opens a new window and triggers window.print(), where "Save as
  // PDF" is the actual "download". The list here already carries every field
  // the template needs (lineItems, gstPercent, etc. — see the Bill interface
  // above), so only the vendor's (Contractor or Consultant) bank details need
  // a fresh lookup.
  async function handleDownload(bill: Bill) {
    setDownloadingId(bill.id);
    try {
      const contractor = await resolvePrintParty(bill.vendorCode);
      printBill(bill, contractor, bill.status === "paid" ? "post" : "pre");
    } catch {
      toast.error("Failed to prepare the bill for download");
    } finally {
      setDownloadingId(null);
    }
  }

  const loadBills = useCallback(() => {
    setLoading(true);
    apiClient.get<{ bills: Record<string, unknown>[] }>("/bills")
      .then((r) => setBills((r.data.bills || []).map((b) => normalizeId(b) as unknown as Bill)))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadBills(); }, [loadBills]);

  useEffect(() => {
    apiClient.get<{ projects: Record<string, unknown>[] }>("/projects")
      .then((r) => setProjects((r.data.projects || []).map((p) => normalizeId(p) as unknown as ProjectOpt)))
      .catch(() => { });
  }, []);

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        (b.billNo || "").toLowerCase().includes(q) ||
        (b.vendorName || "").toLowerCase().includes(q) ||
        (b.workOrderNo || "").toLowerCase().includes(q) ||
        (b.projectName || "").toLowerCase().includes(q) ||
        (b.generatedBy || "").toLowerCase().includes(q);
      const matchProject = !projectFilter || b.projectId === projectFilter;
      const matchStatus = !statusFilter || b.status === statusFilter;
      const matchDate = inDateRange(b.billDate, dateFrom, dateTo);
      return matchSearch && matchProject && matchStatus && matchDate;
    }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [bills, search, projectFilter, statusFilter, dateFrom, dateTo]);

  const { page, totalPages, setPage, pageItems: pagedBills } = usePagination(filteredBills, 20);

  // Computed off the raw (unfiltered) list so clicking a stat card always
  // shows the true total for that bucket, not a number depressed by
  // whatever filter is already active — same convention as WorkItems.
  const statusCounts = useMemo(() => {
    const c = { total: bills.length, draft: 0, hold: 0, paid: 0 };
    for (const b of bills) {
      if (b.status === "draft") c.draft++;
      else if (b.status === "hold") c.hold++;
      else if (b.status === "paid") c.paid++;
    }
    return c;
  }, [bills]);

  const viewBill = useMemo(
    () => (viewBillId ? bills.find((b) => b.id === viewBillId) || null : null),
    [bills, viewBillId]
  );

  useEffect(() => {
    setViewApprovalHistory(null);
    if (!viewBill?.workOrderId) return;
    apiClient.get<{ billRequests: Record<string, unknown>[] }>(`/bill-requests?workOrderId=${viewBill.workOrderId}`)
      .then((r) => {
        const match = (r.data.billRequests || []).find((br) => {
          const billId = br.billId as { _id?: string } | string | undefined;
          const id = typeof billId === "string" ? billId : billId?._id;
          return id === viewBill.id;
        });
        if (match) setViewApprovalHistory(deriveBillApprovalHistory(match as Parameters<typeof deriveBillApprovalHistory>[0]));
      })
      .catch(() => { });
  }, [viewBill?.workOrderId, viewBill?.id]);

  return (
    <div>
      <PageHeader
        icon={Receipt}
        title="Billing"
        subtitle="Every bill in the system — from DRI-progress → AGM → GM approvals, or created directly here — still processed through Accounts Payment"
        actions={
          canCreate ? (
            <NxBtn color="primary" icon={Plus} label="New Bill" onClick={() => setNewOpen(true)} />
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <NxStatCard label="Total Bills" value={statusCounts.total} icon={Receipt} />
        <NxStatCard
          label="Awaiting Verification" value={statusCounts.draft} icon={FileText}
          active={statusFilter === BILL_STATUS.DRAFT}
          onClick={() => setStatusFilter(statusFilter === BILL_STATUS.DRAFT ? "" : BILL_STATUS.DRAFT)}
        />
        <NxStatCard
          label="Hold" value={statusCounts.hold} icon={Ban}
          active={statusFilter === BILL_STATUS.HOLD}
          onClick={() => setStatusFilter(statusFilter === BILL_STATUS.HOLD ? "" : BILL_STATUS.HOLD)}
        />
        <NxStatCard
          label="Paid" value={statusCounts.paid} icon={CheckCircle2}
          active={statusFilter === BILL_STATUS.PAID}
          onClick={() => setStatusFilter(statusFilter === BILL_STATUS.PAID ? "" : BILL_STATUS.PAID)}
        />
      </div>

      <div className="bg-white/90 dark:bg-gray-800/95 backdrop-blur-xl border border-gray-100 dark:border-gray-700/50 rounded-xl shadow-sm p-5">
        <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
          <div className="flex gap-2.5 items-center flex-wrap">
            <SearchFilter placeholder="Search bill no., vendor, WO, project…" value={search} onChange={setSearch} />
            <DropdownSelectFilter
              value={projectFilter}
              onChange={setProjectFilter}
              placeholder="All Projects"
              resetValue=""
              options={selectableProjects(projects).map((p) => ({ value: p.id, label: p.name }))}
            />
            <DropdownSelectFilter
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="All Statuses"
              resetValue=""
              options={Object.values(BILL_STATUS).map((s) => ({ value: s, label: BILL_STATUS_LABEL[s] || s }))}
            />
            <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
            <span className="ml-auto text-gray-400 text-xs whitespace-nowrap">
              {filteredBills.length} bill{filteredBills.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {loading ? (
          <Spinner size="large" />
        ) : filteredBills.length === 0 ? (
          <EmptyState icon={FileText} title="No bills found" message="Try adjusting your search or filters." />
        ) : (
          <>
            <Table className="min-w-[1300px]">
              <Thead>
                <Tr>
                  <Th className="w-[100px]">Bill No.</Th>
                  <Th className="w-[140px]">Bill Type</Th>
                  <Th className="w-[110px]">Work Order</Th>
                  <Th className="w-[160px]">Vendor</Th>
                  <Th className="w-[150px]">Project</Th>
                  <Th className="text-right w-[120px]">Amount</Th>
                  <Th className="w-[150px]">Approval</Th>
                  <Th className="w-[170px]">Accounts</Th>
                  <Th className="w-[110px] whitespace-nowrap">Date</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pagedBills.map((r) => (
                  <Tr key={r.id} className="cursor-pointer" onClick={() => setViewBillId(r.id)}>
                    <Td className="font-bold text-primary whitespace-nowrap truncate" title={r.billNo}>{r.billNo}</Td>
                    <Td className="whitespace-nowrap">
                      {r.billType ? (
                        <NxBadge color="blue">{BILL_TYPE_CFG[r.billType]?.label || r.billType}</NxBadge>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap truncate" title={r.workOrderNo || ""}>{r.workOrderNo || <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                    <Td className="whitespace-nowrap truncate" title={r.vendorName || ""}>{r.vendorName || <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                    <Td className="whitespace-nowrap truncate" title={r.projectName || ""}>{r.projectName || <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                    <Td className="text-right font-bold whitespace-nowrap">{fmt(netAfterAdvance(r))}</Td>
                    <Td>
                      {(r.manualApprovalStatus === "pending" || r.manualApprovalStatus === "pending-gm" || r.manualApprovalStatus === "rejected") ? (
                        <>
                          {r.manualApprovalStatus === "pending" && <NxBadge color="orange">Pending L1 (AGM)</NxBadge>}
                          {r.manualApprovalStatus === "pending-gm" && <NxBadge color="orange">Pending L2 (GM)</NxBadge>}
                          {r.manualApprovalStatus === "rejected" && <NxBadge color="red">AGM/GM Rejected</NxBadge>}
                        </>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </Td>
                    <Td>
                      <NxBadge color={BILL_STATUS_BADGE_COLOR[r.status] ?? "gray"}>{BILL_STATUS_LABEL[r.status] || r.status}</NxBadge>
                    </Td>
                    <Td>{r.billDate ? dayjs(r.billDate).format("DD MMM YYYY") : "—"}</Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <NxBtn color="icon-blue" title="View" icon={Eye} onClick={() => setViewBillId(r.id)} />
                        <NxBtn color="icon-pink" title="Download" icon={Download} loading={downloadingId === r.id} onClick={() => handleDownload(r)} />
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination page={page} totalPages={totalPages} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {viewBill && (
        <Modal
          extraWide
          title={viewBill.billNo}
          subtitle="Read-only — process this bill in Accounts Payment"
          onClose={() => setViewBillId(null)}
          footer={
            <div className="flex justify-end gap-2">
              <NxBtn color="secondary" icon={Eye} label="View" loading={downloadingId === viewBill.id} onClick={() => handleDownload(viewBill)} />
              <NxBtn color="secondary" icon={Printer} label="Print" loading={downloadingId === viewBill.id} onClick={() => handleDownload(viewBill)} />
            </div>
          }
        >
          <Descriptions columns={2}>
            <DescItem label="Status"><NxBadge color={BILL_STATUS_BADGE_COLOR[viewBill.status] ?? "gray"}>{BILL_STATUS_LABEL[viewBill.status] || viewBill.status}</NxBadge></DescItem>
            <DescItem label="Bill Date">{viewBill.billDate ? dayjs(viewBill.billDate).format("DD MMM YYYY") : "—"}</DescItem>
            <DescItem label="Project">{viewBill.projectName || "—"}</DescItem>
            <DescItem label="Work Order">{viewBill.workOrderNo || "—"}</DescItem>
            <DescItem label="Vendor">{viewBill.vendorName || "—"}</DescItem>
            <DescItem label="Generated By">{viewBill.generatedBy || "—"}</DescItem>
          </Descriptions>

          <div className="border-t border-gray-200 dark:border-gray-700/40 my-4" />

          {/* Accounts Payment's own Verification → L1 AGM → L2 Director → TMS
              chain — same table the Work Order's own bill view shows. */}
          <div className="mb-4">
            <div className="font-bold text-xs text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
              Bill Approvals
            </div>
            <Table>
              <Thead>
                <Tr>
                  <Th>Verification</Th>
                  <Th>L1 AGM</Th>
                  <Th>L2 Director</Th>
                  <Th>Sent to TMS</Th>
                  <Th>Paid</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td className="align-top"><BillStageCell by={viewBill.verificationBy?.name} at={viewBill.verificationAt} /></Td>
                  <Td className="align-top"><BillStageCell by={viewBill.l1ApprovedBy?.name} at={viewBill.l1ApprovedAt} /></Td>
                  <Td className="align-top"><BillStageCell by={viewBill.l2ApprovedBy?.name} at={viewBill.l2ApprovedAt} /></Td>
                  <Td className="align-top"><BillStageCell at={viewBill.tmsSentAt} /></Td>
                  <Td className="align-top"><BillStageCell at={viewBill.tmsCallbackReceivedAt} /></Td>
                </Tr>
              </Tbody>
            </Table>
          </div>

          <div className="font-bold text-xs text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Scope Items</div>
          <div className="mb-4">
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
                {(viewBill.lineItems || []).map((li, i) => (
                  <Tr key={i}>
                    <Td>{li.description}</Td>
                    <Td>{li.unit}</Td>
                    <Td className="text-right font-mono">{li.billedQty.toLocaleString("en-IN")}</Td>
                    <Td className="text-right">{fmtRate(li.rate)}</Td>
                    <Td className="text-right font-bold">{fmt(li.amount)}</Td>
                  </Tr>
                ))}
              </Tbody>
              <Tfoot>
                <Tr className="bg-primary/5">
                  <Td colSpan={4} className="font-bold text-right text-primary">Gross Total</Td>
                  <Td className="font-bold text-right text-[#1A1A2E] dark:text-[#F1F5F9]">{fmt(viewBill.amount)}</Td>
                </Tr>
              </Tfoot>
            </Table>
          </div>

          {(() => {
            const gross = viewBill.amount || 0;
            const retAmt = viewBill.retentionAmount ?? 0;
            const advRec = viewBill.advanceRecovery ?? 0;
            const { gstAmount: gstAmt, netAfterHold: netPay } = billFinancials({ gross, gstPercent: viewBill.gstPercent ?? 0, retentionAmount: retAmt, advanceRecovery: advRec });
            const paid = viewBill.paidAmount;
            return (
              <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 rounded-lg p-3 text-sm mb-4">
                <div className="font-bold mb-2 text-emerald-800 dark:text-emerald-300">
                  Running Bill: {viewBill.billNo}
                </div>
                <div className="font-mono text-xs flex flex-col gap-0.5">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Gross Billed</span>
                    <span className="font-semibold">{fmt(gross)}</span>
                  </div>
                  {retAmt > 0 && (
                    <div className="flex justify-between text-red-600 dark:text-red-400">
                      <span>Hold / Retention{(viewBill.retentionPercent ?? 0) > 0 ? ` @ ${viewBill.retentionPercent}%` : ""}</span>
                      <span>− {fmt(retAmt)}</span>
                    </div>
                  )}
                  {advRec > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>Less: Advance Recovery</span>
                      <span>− {fmt(advRec)}</span>
                    </div>
                  )}
                  {gstAmt > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>GST @ {viewBill.gstPercent}%</span>
                      <span>+ {fmt(gstAmt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-emerald-300 dark:border-emerald-500/30 pt-1 mt-0.5 font-bold">
                    <span>Net Payable</span>
                    <span>{fmt(netPay)}</span>
                  </div>
                  {(viewBill.adjustmentAmount ?? 0) !== 0 && (
                    <div className={`flex justify-between ${(viewBill.adjustmentAmount ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      <span>Adjustment{viewBill.adjustmentRemark ? ` (${viewBill.adjustmentRemark})` : ""}</span>
                      <span>{(viewBill.adjustmentAmount ?? 0) > 0 ? "+" : "−"} {fmt(Math.abs(viewBill.adjustmentAmount ?? 0))}</span>
                    </div>
                  )}
                  {paid != null && (
                    <div className="flex justify-between font-bold text-emerald-600 dark:text-emerald-400 text-[13px] mt-1 border-t border-emerald-300 dark:border-emerald-500/30 pt-1">
                      <span>Actually Paid</span>
                      <span>{fmt(paid)}</span>
                    </div>
                  )}
                </div>
                {viewBill.paymentUTR && (
                  <div className="mt-2 font-mono text-xs text-purple-600 dark:text-purple-400">UTR: {viewBill.paymentUTR}</div>
                )}
              </div>
            );
          })()}

          {viewBill.remarks && (
            <div className="mb-4 text-gray-500 dark:text-gray-400 text-[13px]"><strong>Remarks:</strong> {viewBill.remarks}</div>
          )}

          {/* AGM → GM sign-off — happens in Site Progress (or, for a manual
              bill with no BillRequest, Billing's own pre-Accounts step),
              before this ever reaches Accounts as a RunningBill. */}
          {(() => {
            const history = viewApprovalHistory ?? (
              !viewBill.workOrderId
                ? deriveBillApprovalHistory({
                  agmApprovedBy: viewBill.manualAgmApprovedBy, agmApprovedAt: viewBill.manualAgmApprovedAt,
                  status: viewBill.manualApprovalStatus === "rejected" ? "rejected" : viewBill.manualApprovalStatus === "approved" ? "approved" : "pending",
                  processedBy: viewBill.manualGmApprovedBy ?? viewBill.manualRejectedBy, processedAt: viewBill.manualGmApprovedAt,
                  rejectReason: viewBill.manualRejectReason,
                })
                : []
            );
            if (history.length === 0) return null;
            return (
              <div className="mb-4">
                <div className="font-bold text-xs text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                  Approval Chain — Before Accounts
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg p-3.5">
                  <BillApprovalHistoryList history={history} />
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      <NewBillDrawer
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(bill) => {
          setBills((prev) => [normalizeId(bill) as unknown as Bill, ...prev]);
        }}
      />
    </div>
  );
}