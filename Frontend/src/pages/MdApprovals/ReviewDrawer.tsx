import { useEffect, useState } from "react";
import apiClient from "../../services/apiClient";
import Modal from "../../ui/Modal";
import Spinner from "../../ui/Spinner";
import Field from "../../ui/Field";
import WorkOrderDetailView from "../../components/WorkOrderDetailView";
import BillDetailModal from "../../components/BillDetailModal";
import type { BillDetailRequest } from "../../components/BillDetailModal";
import RunningBillDetailView from "../../components/RunningBillDetailView";
import type { RunningBillDetail } from "../../components/RunningBillDetailView";
import type { WorkOrder } from "../../types/VendorBilling";
import type { MdApprovalRow } from "./types";

// This drawer no longer renders its own generic summary — every system it
// reviews already has a real, purpose-built detail view elsewhere in the
// app (WorkItems' WorkOrderDetailView, BillRequests' BillDetailModal,
// AccountsPayment's bill detail — now shared as RunningBillDetailView), and
// this just opens THAT same component/markup against the row being
// reviewed, instead of a bespoke approximation that can drift out of sync
// with what those real pages actually show. Approve/Reject/Send Back stay
// exactly as before — MdApprovals/index.tsx still owns those buttons (passed
// in as `footer`) and still calls the same 6 real per-system endpoints; this
// file only changes what's rendered in the body above that footer.

// ── id-normalizing helpers (same convention AccountsPayment/WorkItems
// already use for their own fetched docs) ──────────────────────────────────
const normalizeId = (obj: Record<string, unknown>) => ({ ...obj, id: (obj._id || obj.id)?.toString() || "" });
const normalizeFullWO = (wo: Record<string, unknown>): WorkOrder => ({
  ...normalizeId(wo),
  scopeItems: ((wo.scopeItems as Record<string, unknown>[]) || []).map((si) => ({
    ...normalizeId(si),
    progressEntries: ((si.progressEntries as Record<string, unknown>[]) || []).map(normalizeId),
    subItems: ((si.subItems as Record<string, unknown>[]) || []).map(normalizeId),
  })),
  paymentMilestones: ((wo.paymentMilestones as Record<string, unknown>[]) || []).map(normalizeId),
} as unknown as WorkOrder);

// A manually-created RunningBill (system 'RunningBill-Manual') never had a
// BillRequest of its own (see RunningBill.js's own comment on why — created
// directly via Billing -> New Bill) — so there's nothing to fetch that's
// already BillDetailRequest-shaped. This builds an equivalent synthetic one
// straight off the bill itself, exactly the "(b) transform client-side"
// option called out in the task: reqNo <- billNo, items <- lineItems,
// requestedBy <- createdBy, and the bill nests into its own `billId` (so
// BillDetailModal's "Bill Approvals"/"Running Bill" sections, which only
// read off billRequest.billId, still render).
function billToSyntheticRequest(bill: Record<string, unknown>): BillDetailRequest {
  const status = bill.manualApprovalStatus === "approved" ? "approved" : bill.manualApprovalStatus === "rejected" ? "rejected" : "pending";
  return {
    _id: String(bill._id || bill.id),
    reqNo: (bill.billNo as string) || "",
    workOrderNo: (bill.workOrderNo as string) || "",
    projectName: (bill.projectName as string) || "",
    vendorName: (bill.vendorName as string) || "",
    category: "",
    subCategory: "",
    items: (bill.lineItems as BillDetailRequest["items"]) || [],
    remarks: (bill.remarks as string) || "",
    status: status as BillDetailRequest["status"],
    rejectReason: (bill.manualRejectReason as string) || "",
    requestedBy: bill.createdBy as BillDetailRequest["requestedBy"],
    processedBy: (bill.manualL4ApprovedBy || bill.manualGmApprovedBy) as BillDetailRequest["processedBy"],
    processedAt: (bill.manualL4ApprovedAt || bill.manualGmApprovedAt) as string | undefined,
    agmApprovedBy: bill.manualAgmApprovedBy as BillDetailRequest["agmApprovedBy"],
    agmApprovedAt: bill.manualAgmApprovedAt as string | undefined,
    billId: {
      billNo: (bill.billNo as string) || "",
      status: (bill.status as string) || "",
      amount: (bill.amount as number) || 0,
      paidAmount: bill.paidAmount as number | undefined,
      retentionPercent: bill.retentionPercent as number | undefined,
      retentionAmount: bill.retentionAmount as number | undefined,
      advanceRecovery: bill.advanceRecovery as number | undefined,
      supersedeDeduction: bill.supersedeDeduction as number | undefined,
      gstPercent: bill.gstPercent as number | undefined,
      adjustmentAmount: bill.adjustmentAmount as number | undefined,
      adjustmentRemark: bill.adjustmentRemark as string | undefined,
      paymentUTR: bill.paymentUTR as string | undefined,
      verificationBy: bill.verificationBy as { name: string } | null,
      verificationAt: bill.verificationAt as string | undefined,
      l1ApprovedBy: bill.l1ApprovedBy as { name: string } | null,
      l1ApprovedAt: bill.l1ApprovedAt as string | undefined,
      l2ApprovedBy: bill.l2ApprovedBy as { name: string } | null,
      l2ApprovedAt: bill.l2ApprovedAt as string | undefined,
      tmsSentAt: bill.tmsSentAt as string | undefined,
      tmsCallbackReceivedAt: bill.tmsCallbackReceivedAt as string | undefined,
      lineItems: bill.lineItems as BillDetailRequest["items"],
    },
    createdAt: (bill.createdAt as string) || "",
  };
}

export default function ReviewDrawer({
  row,
  onClose,
  footer,
}: {
  row: MdApprovalRow;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Exactly one of these is populated, depending on row.system.
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [billRequest, setBillRequest] = useState<BillDetailRequest | null>(null);
  const [runningBill, setRunningBill] = useState<RunningBillDetail | null>(null);
  const [woCategory, setWoCategory] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setWorkOrder(null);
    setBillRequest(null);
    setRunningBill(null);
    setWoCategory(undefined);

    async function load() {
      try {
        if (row.system === "WorkOrder") {
          // Same route WorkItems' own View drawer uses — full, current
          // WorkOrderDetailView data, not a trimmed aggregator projection.
          const res = await apiClient.get<{ workOrder: Record<string, unknown> }>(`/work-orders/${row.id}`);
          if (cancelled) return;
          setWorkOrder(res.data.workOrder ? normalizeFullWO(res.data.workOrder) : null);
        } else if (row.system === "BillRequest") {
          // The aggregator's own detail endpoint, populated with everything
          // BillDetailModal needs under `billRequestRaw` (see
          // mdApprovalsController.getMdApprovalDetail) — BillRequests has no
          // standalone GET /bill-requests/:id route to call directly.
          const res = await apiClient.get<{ item: { billRequestRaw?: BillDetailRequest } }>(`/md/approvals/BillRequest/${row.id}`);
          if (cancelled) return;
          setBillRequest(res.data.item.billRequestRaw ?? null);
        } else if (row.system === "RunningBill-Manual") {
          // Real bill record — same route AccountsPayment uses — reshaped
          // client-side into BillDetailModal's expected shape (see
          // billToSyntheticRequest's own note on why: this bill never had a
          // real BillRequest of its own).
          const res = await apiClient.get<{ bill: Record<string, unknown> }>(`/bills/${row.id}`);
          if (cancelled) return;
          setBillRequest(res.data.bill ? billToSyntheticRequest(res.data.bill) : null);
        } else if (row.system === "RunningBill-Accounts") {
          const res = await apiClient.get<{ bill: Record<string, unknown> }>(`/bills/${row.id}`);
          if (cancelled) return;
          const bill = res.data.bill ? (normalizeId(res.data.bill) as unknown as RunningBillDetail) : null;
          setRunningBill(bill);
          if (bill?.workOrderId) {
            apiClient.get<{ workOrder: Record<string, unknown> }>(`/work-orders/${bill.workOrderId}`)
              .then((r) => { if (!cancelled) setWoCategory((r.data.workOrder?.category as string) || undefined); })
              .catch(() => {});
          }
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [row.system, row.id]);

  // BillRequest / RunningBill-Manual — BillDetailModal renders its OWN Modal
  // chrome (same as it does on BillRequests' page), so this is a direct,
  // unwrapped render rather than nesting it inside a second Modal.
  if (row.system === "BillRequest" || row.system === "RunningBill-Manual") {
    if (loading) {
      return (
        <Modal title={row.referenceNumber || "Review"} onClose={onClose} extraWide footer={footer}>
          <div className="flex justify-center py-16"><Spinner size="large" /></div>
        </Modal>
      );
    }
    if (error || !billRequest) {
      return (
        <Modal title={row.referenceNumber || "Review"} onClose={onClose} extraWide footer={footer}>
          <div className="text-sm text-gray-400 py-10 text-center">Could not load this item's details.</div>
        </Modal>
      );
    }
    return <BillDetailModal billRequest={billRequest} open onClose={onClose} footer={footer} />;
  }

  // WorkOrder / RunningBill-Accounts — neither WorkOrderDetailView nor
  // RunningBillDetailView renders its own Modal (they're embed-style, same
  // as WorkItems/AccountsPayment already use them), so this drawer supplies
  // the chrome, same title/footer convention as before.
  return (
    <Modal title={row.referenceNumber || "Review"} subtitle={row.approvalType} onClose={onClose} extraWide footer={footer}>
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="large" /></div>
      ) : row.system === "WorkOrder" ? (
        workOrder ? (
          <WorkOrderDetailView workOrder={workOrder} readOnly />
        ) : (
          <div className="text-sm text-gray-400 py-10 text-center">Could not load this item's details.</div>
        )
      ) : row.system === "RunningBill-Accounts" ? (
        runningBill ? (
          <RunningBillDetailView
            bill={runningBill}
            woCategory={woCategory}
            renderActionSection={(bill) =>
              bill.status === "l1-approved" ? (
                <div className="border border-indigo-200 dark:border-indigo-500/30 rounded-lg p-3.5 mt-4 bg-indigo-50 dark:bg-indigo-500/10">
                  <div className="font-bold text-[13px] text-indigo-700 dark:text-indigo-300 mb-2">L2 Director Approval</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    This is the last internal sign-off — approving sends this bill straight to TMS for payment.
                  </div>
                  {/* Purely informational here — remarks aren't wired into a
                      second, competing approve call: Approve/Reject below
                      already go through MdApprovals' own existing
                      l2-director-approve/reject endpoints (see
                      ACTION_ENDPOINTS in MdApprovals/index.tsx). */}
                  <Field textarea disabled placeholder="Remarks are captured from the Approve action below." value="" onChange={() => {}} />
                </div>
              ) : null
            }
          />
        ) : (
          <div className="text-sm text-gray-400 py-10 text-center">Could not load this item's details.</div>
        )
      ) : null}
    </Modal>
  );
}
