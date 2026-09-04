import { useEffect, useMemo, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  CheckCircle2, XCircle, IndianRupee, AlertCircle, FilePlus,
  PauseCircle, Printer, ShieldCheck, Send, FileText, ClipboardList, Building2, Wallet, Pencil,
  Eye,
} from "lucide-react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import Field from "../../ui/Field";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import Badge from "../../ui/Badge";
import type { StepItem } from "../../ui/Steps";
import Alert from "../../ui/Alert";
import EmptyState from "../../ui/EmptyState";
import Spinner from "../../ui/Spinner";
import { Descriptions, DescItem } from "../../ui/Descriptions";
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import { SearchFilter, FilterRow, DropdownSelectFilter } from "../../ui/Filters";
import apiClient from "../../services/apiClient";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import { selectableProjects } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";
import { useAuth } from "../../context/AuthContext";
import type { AuthUser } from "../../context/AuthContext";
import StatusBadge from "../../ui/StatusBadge";
import WorkOrderDetailView from "../../components/WorkOrderDetailView";
import ContractorDetailView from "../../components/ContractorDetailView";
import type { WorkOrder, Contractor } from "../../types/VendorBilling";
import { printBill, resolvePrintParty } from "../../shared/utils/printBill";
import { billFinancials } from "../../shared/utils/billMath";
import { BILL_TYPE_CFG } from "../../shared/constants/billOptions";

// ── Types ────────────────────────────────────────────────────────

type BillStatus = "draft" | "verify-done" | "l1-approved" | "approved" | "sent-to-tms" | "hold" | "rejected" | "paid";

interface BillUser { _id?: string; name?: string; role?: string; }

interface ApprovalHistoryEntry {
  stage: string;
  action: string;
  by?: BillUser | string | null;
  at?: string;
  remarks?: string;
}

interface LineItem {
  key: number;
  scopeItemId?: string;
  description: string;
  remarks?: string;
  // The DRI's own notes from the day-to-day progress entries billed here —
  // distinct from `remarks`, which is the scope item's static instruction note.
  progressRemarks?: string;
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
  projectLocation?: string;
  vendorCode?: string;
  vendorName?: string;
  companyName?: string;
  billDate: string;
  billingPeriodFrom?: string;
  billingPeriodTo?: string;
  contractorRefNo?: string;
  generatedBy?: string;
  lineItems: Omit<LineItem, "key">[];
  amount: number;
  gstPercent: number;
  retentionPercent?: number;
  retentionAmount?: number;
  advanceRecovery?: number;
  tdsPercent: number;
  remarks?: string;
  status: BillStatus;
  // Only meaningful for a bill created directly via Billing -> New Bill —
  // its own pre-Accounts AGM/GM sign-off (see billController's
  // manualAgmApprove/manualGmApprove), reviewed on Site Progress's Bill
  // Requests tab, not here. A progress-driven bill is born 'approved'.
  manualApprovalStatus?: "pending" | "pending-gm" | "approved" | "rejected";
  agmApprovedBy?: BillUser | null;
  agmApprovedAt?: string;
  verificationBy?: BillUser | null;
  verificationAt?: string;
  l1ApprovedBy?: BillUser | null;
  l1ApprovedAt?: string;
  l2ApprovedBy?: BillUser | null;
  l2ApprovedAt?: string;
  tdsAmount?: number;
  adjustmentAmount?: number;
  adjustmentRemark?: string;
  approvalHistory?: ApprovalHistoryEntry[];
  holdBy?: BillUser | null;
  holdAt?: string;
  holdReason?: string;
  holdReleasedBy?: BillUser | null;
  holdReleasedAt?: string;
  rejectedBy?: BillUser | null;
  rejectReason?: string;
  tmsSentAt?: string;
  tmsSendAttempts?: number;
  tmsLastAttemptAt?: string;
  tmsLastError?: string;
  tmsCallbackReceivedAt?: string;
  paymentDate?: string;
  paymentUTR?: string;
  paymentChequeNo?: string;
  paymentMode?: string;
  paymentReleasedBy?: string;
  paymentBank?: string;
  paidAmount?: number;
  retentionReleased?: number;
  retentionReleaseRemark?: string;
  createdAt?: string;
  // Bill Relationship Engine
  billType?: string;
  relationshipType?: string;
  linkedBills?: { billId: string; billNo: string; relationshipType: string }[];
  billingCycle?: number;
  isActive?: boolean;
  supersededBy?: { _id: string; billNo: string; billType?: string } | null;
  isArchived?: boolean;
  archivedAt?: string;
}

interface ProjectOpt { id: string; name: string; code: string; parentId?: string | null; }
// Bills only carry the issuing company as a denormalized name string (see
// RunningBill.companyName, copied once from WorkOrder.companyName at bill
// creation) — no companyId to match against, so this filter compares by name.
interface CompanyOpt { id: string; name: string; }

// ── Helpers ──────────────────────────────────────────────────────

const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Net payable after Hold/Retention (off the gross) + GST (on what's left of
// the gross after Hold), minus advance recovery — before TDS.
const netAfterAdvance = (b: Bill) =>
  billFinancials({
    gross: b.amount || 0, gstPercent: b.gstPercent ?? 0,
    retentionAmount: b.retentionAmount ?? 0, advanceRecovery: b.advanceRecovery ?? 0,
  }).netPayable;
// The true bottom line — same Gross → Hold/Advance → GST → TDS → Adjustment
// chain as the drawer's own Payment Summary, so a Paid bill's displayed
// amount always matches what was actually calculated for it (only used as a
// fallback for a bill whose paidAmount TMS callback hasn't landed yet).
const netPayableFinal = (b: Bill) =>
  billFinancials({
    gross: b.amount || 0, gstPercent: b.gstPercent ?? 0,
    retentionAmount: b.retentionAmount ?? 0, advanceRecovery: b.advanceRecovery ?? 0,
    tdsAmount: b.tdsAmount ?? 0, adjustmentAmount: b.adjustmentAmount ?? 0,
  }).netPayable;
// What the list/search should treat as "the amount" for a bill — once a bill
// is Paid, that's its actual paidAmount (post-TDS/adjustment, from TMS), not
// the pre-TDS netAfterAdvance figure still shown for bills in earlier stages.
const displayAmount = (b: Bill) =>
  b.status === "paid" ? (b.paidAmount ?? netPayableFinal(b)) : netAfterAdvance(b);
const getLineItemsGross = (bill: Bill) =>
  (bill.lineItems || []).reduce(
    (sum, li) => sum + (Number(li.amount) || 0),
    0
  );
const normalizeId = (obj: Record<string, unknown>) => ({ ...obj, id: (obj._id || obj.id)?.toString() || "" });

// Full-fidelity normalize — for the WO quick-view drawer, which
// needs the exact same shape WorkOrderDetailView already renders elsewhere.
const normalizeFullWO = (wo: Record<string, unknown>): WorkOrder => ({
  ...normalizeId(wo),
  scopeItems: ((wo.scopeItems as Record<string, unknown>[]) || []).map((si) => ({
    ...normalizeId(si),
    progressEntries: ((si.progressEntries as Record<string, unknown>[]) || []).map(normalizeId),
    subItems: ((si.subItems as Record<string, unknown>[]) || []).map(normalizeId),
  })),
  paymentMilestones: ((wo.paymentMilestones as Record<string, unknown>[]) || []).map(normalizeId),
} as unknown as WorkOrder);

// A grant for module 'accounts-payment' with the given action name.
function hasPerm(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  return !!user.permissions?.find((p) => p.module === "accounts-payment")?.actions.includes(action);
}

// Segregation-of-duties guard: is `user` the same person who acted as `actor` at the
// previous stage?
function sameActor(user: AuthUser | null, actor?: BillUser | null): boolean {
  if (!user || !actor?._id) return false;
  return actor._id === user.id;
}

// List-table status pill — mirrors BILL_STATUS_LABEL's wording (see
// shared/constants/billStatus.ts, still used as-is by <StatusBadge> inside
// the bill drawer) but maps each stage onto the fixed Nexora badge palette
// instead of a bespoke hex color, matching WorkItems' displayStatus() precedent.
const BILL_LIST_STATUS_CFG: Record<BillStatus, { label: string; color: NxBadgeColor }> = {
  draft: { label: "Awaiting Verification", color: "gray" },
  "verify-done": { label: "Pending L1 (AGM)", color: "amber" },
  "l1-approved": { label: "Pending L2 (GM)", color: "cyan" },
  approved: { label: "Ready for TMS", color: "blue" },
  "sent-to-tms": { label: "Sent to TMS", color: "indigo" },
  hold: { label: "Hold", color: "orange" },
  paid: { label: "Paid", color: "green" },
  rejected: { label: "Rejected", color: "red" },
};

// ── Small visual building blocks ──────────────────────────────────

// One accent-barred section title, reused by the Bill/Work Order columns
// that now live inside a single combined card instead of two separate ones.
function SectionLabel({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <div className="w-1 h-[15px] rounded bg-[#ff7a00]" />
      <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</div>
    </div>
  );
}

function MutedNote({ text }: { text: string }) {
  return (
    <div className="mt-4 px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800/30 border border-dashed border-gray-200 dark:border-gray-700/40 rounded-lg text-gray-400 text-[12.5px]">
      {text}
    </div>
  );
}

const sectionPanelClass = "border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mt-4 bg-gray-50 dark:bg-gray-800/40";

// Verification → L1 AGM → L2 Director → Sent to TMS → Paid stepper, driven
// from the real fields on the bill rather than any separately-tracked UI
// state. A bill on Hold still shows its progress up to the point it was
// paused (see the Hold banner rendered alongside this in the drawer).
function buildSteps(bill: Bill): StepItem[] {
  const doneFlags = [
    !!bill.verificationBy,
    !!bill.l1ApprovedBy,
    !!bill.l2ApprovedBy,
    !!bill.tmsSentAt,
    bill.status === "paid",
  ];
  let currentIdx = doneFlags.findIndex((d) => !d);
  if (currentIdx === -1) currentIdx = doneFlags.length;

  const meta = [
    { title: "Verification", by: bill.verificationBy?.name, at: bill.verificationAt },
    { title: "L1 AGM", by: bill.l1ApprovedBy?.name, at: bill.l1ApprovedAt },
    { title: "L2 Director", by: bill.l2ApprovedBy?.name, at: bill.l2ApprovedAt },
    { title: "Sent to TMS", by: undefined, at: bill.tmsSentAt },
    { title: "Paid", by: undefined, at: bill.tmsCallbackReceivedAt },
  ];

  return meta.map((m, idx): StepItem => {
    const done = doneFlags[idx];
    const isCurrent = idx === currentIdx;
    let status: StepItem["status"] = "wait";
    let icon: ReactNode = undefined;
    if (done) {
      status = "finish";
      icon = <CheckCircle2 className="w-3.5 h-3.5" />;
    } else if (bill.status === "rejected" && isCurrent) {
      status = "error";
      icon = <XCircle className="w-3.5 h-3.5" />;
    } else if (isCurrent) {
      status = "process";
      icon = <AlertCircle className="w-3.5 h-3.5" />;
    }
    const description = done
      ? `${m.by || "—"}${m.at ? " · " + dayjs(m.at).format("DD MMM") : ""}`
      : bill.status === "rejected" && isCurrent
        ? "Rejected here"
        : "";
    return { title: m.title, description, icon, status };
  });
}

const HISTORY_STAGE_LABEL: Record<string, string> = {
  verify: "Verification", "l1-agm": "L1 AGM", "l2-director": "L2 Director", hold: "Hold",
  "tms-handoff": "Send to TMS", "tms-callback": "TMS Callback",
};

// Append-only timeline built directly from approvalHistory — mirrors
// WorkOrderApprovalWorkflow's ApprovalTimeline so a bill that cycles through
// send-back → resubmit multiple times never loses any stage's remarks (the
// single overwritable `remarks` field can't show this).
// Stage+action → the human title shown on each history card. Reads only
// h.stage/h.action — same approvalHistory fields/shape as before, no backend
// or data-structure change.
function historyEventTitle(h: ApprovalHistoryEntry): string {
  if (h.action === "sent-back") return "SENT BACK";
  if (h.action === "send-failed") return "TMS SEND FAILED";
  if (h.action === "rejected") return "REJECTED";
  switch (h.stage) {
    case "verify": return "BILL VERIFIED";
    case "l1-agm": return "L1 AGM APPROVED";
    case "l2-director": return "APPROVED FOR PAYMENT";
    case "hold": return h.action === "released-hold" ? "HOLD RELEASED" : "PAYMENT HELD";
    case "tms-handoff": return "SENT TO TMS";
    case "tms-callback": return "PAID";
    case "manual-agm": return "MANUAL AGM APPROVED";
    case "manual-gm": return "MANUAL GM APPROVED";
    default: return `${HISTORY_STAGE_LABEL[h.stage] || h.stage} ${h.action}`.toUpperCase();
  }
}

// Same stage+action → the "who did it" body label (per the reference card's
// "Verified by" / "Approved by" / "Held by" / "Sent by" rows).
function historyEventByLabel(h: ApprovalHistoryEntry): string {
  if (h.action === "sent-back") return "Sent back by";
  if (h.action === "send-failed") return "Attempted by";
  if (h.action === "rejected") return "Rejected by";
  switch (h.stage) {
    case "verify": return "Verified by";
    case "l1-agm": case "l2-director": case "manual-agm": case "manual-gm": return "Approved by";
    case "hold": return h.action === "released-hold" ? "Released by" : "Held by";
    case "tms-handoff": return "Sent by";
    case "tms-callback": return "Confirmed by";
    default: return "By";
  }
}

// Color system — one distinct tint per stage/action, per the reference:
// verify=green, l1-agm=teal, l2-director=blue, tms-handoff=indigo,
// tms-callback(paid)=green, hold(held)=purple, hold(released)=amber,
// sent-back/send-failed/rejected=red. Only the header gets tinted — the
// body stays plain (white / drawer-default) per the reference card.
function historyEventStyle(h: ApprovalHistoryEntry): { border: string; header: string; title: string; icon: string; iconGlyph: string } {
  if (h.action === "sent-back" || h.action === "send-failed" || h.action === "rejected") {
    return { border: "border-red-200 dark:border-red-500/30", header: "bg-red-50 dark:bg-red-500/10", title: "text-red-700 dark:text-red-400", icon: "bg-red-500 text-white", iconGlyph: "✕" };
  }
  if (h.stage === "hold") {
    return h.action === "released-hold"
      ? { border: "border-amber-200 dark:border-amber-500/30", header: "bg-amber-50 dark:bg-amber-500/10", title: "text-amber-700 dark:text-amber-400", icon: "bg-amber-500 text-white", iconGlyph: "▶" }
      : { border: "border-purple-200 dark:border-purple-500/30", header: "bg-purple-50 dark:bg-purple-500/10", title: "text-purple-700 dark:text-purple-400", icon: "bg-purple-500 text-white", iconGlyph: "⏸" };
  }
  if (h.stage === "tms-handoff") {
    return { border: "border-indigo-200 dark:border-indigo-500/30", header: "bg-indigo-50 dark:bg-indigo-500/10", title: "text-indigo-700 dark:text-indigo-400", icon: "bg-indigo-500 text-white", iconGlyph: "▣" };
  }
  if (h.stage === "l1-agm" || h.stage === "manual-agm") {
    return { border: "border-teal-200 dark:border-teal-500/30", header: "bg-teal-50 dark:bg-teal-500/10", title: "text-teal-700 dark:text-teal-400", icon: "bg-teal-500 text-white", iconGlyph: "✓" };
  }
  if (h.stage === "l2-director" || h.stage === "manual-gm") {
    return { border: "border-blue-200 dark:border-blue-500/30", header: "bg-blue-50 dark:bg-blue-500/10", title: "text-blue-700 dark:text-blue-400", icon: "bg-blue-500 text-white", iconGlyph: "✓" };
  }
  // verify / tms-callback (paid) / anything unmapped falls back to green.
  return { border: "border-emerald-200 dark:border-emerald-500/30", header: "bg-emerald-50 dark:bg-emerald-500/10", title: "text-emerald-700 dark:text-emerald-400", icon: "bg-emerald-500 text-white", iconGlyph: "✓" };
}

function BillHistoryTimeline({ history }: { history: ApprovalHistoryEntry[] }) {
  if (!history || history.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2.5">
        History
      </div>
      <div className="flex flex-col gap-3">
        {history.map((h, i) => {
          const s = historyEventStyle(h);
          const actorName = typeof h.by === "object" && h.by ? h.by.name : undefined;
          return (
            <div key={i} className={`rounded-xl border ${s.border} overflow-hidden`}>
              {/* Header — tinted per stage/action, stronger weight than the body */}
              <div className={`flex items-center justify-between gap-3 px-3 py-2 ${s.header}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${s.icon}`}>
                    {s.iconGlyph}
                  </span>
                  <span className={`text-[12px] font-bold uppercase tracking-wide truncate ${s.title}`}>
                    {historyEventTitle(h)}
                  </span>
                </div>
                <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">
                  {h.at ? dayjs(h.at).format("DD-MM-YYYY · hh:mm A") : "—"}
                </span>
              </div>
              {/* Body — plain background, only rows that actually exist */}
              <div className="px-3 py-2 bg-white dark:bg-[#1E293B] flex flex-col gap-1">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-gray-500 dark:text-gray-400">{historyEventByLabel(h)}</span>
                  <span className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">
                    {actorName || (h.stage === "tms-callback" ? "TMS" : "—")}
                  </span>
                </div>
                {h.remarks && (
                  <>
                    <div className="border-t border-gray-100 dark:border-gray-700/40 my-1" />
                    <div className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wide">Remark</div>
                    <div className="text-[12px] text-gray-600 dark:text-gray-300 italic">“{h.remarks}”</div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Compact horizontal chip stepper — a pure presentation layer over
// buildSteps()'s StepItem[] output (same data/status logic the shared
// ui/Steps.tsx component elsewhere renders as circles-and-line) — this page
// just wants the more compact colored-chip look, without touching that
// shared component (also used by DrawingRequestReviewWorkflow) or buildSteps
// itself.
function ApprovalStepper({ items }: { items: StepItem[] }) {
  const STYLES: Record<StepItem["status"], { chip: string; circle: string; title: string; desc: string }> = {
    finish: {
      chip: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30",
      circle: "bg-emerald-500 text-white",
      title: "text-emerald-700 dark:text-emerald-400",
      desc: "text-emerald-600 dark:text-emerald-400",
    },
    process: {
      chip: "bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/40 shadow-sm",
      circle: "bg-blue-600 text-white",
      title: "text-blue-700 dark:text-blue-400",
      desc: "text-blue-600 dark:text-blue-400",
    },
    error: {
      chip: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30",
      circle: "bg-red-500 text-white",
      title: "text-red-700 dark:text-red-400",
      desc: "text-red-600 dark:text-red-400",
    },
    wait: {
      chip: "bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700/40",
      circle: "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500",
      title: "text-gray-400 dark:text-gray-500",
      desc: "text-gray-400 dark:text-gray-500",
    },
  };
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 bg-gray-50/60 dark:bg-gray-800/20 p-3 overflow-x-auto">
      <div className="flex items-center min-w-max">
        {items.map((step, i) => {
          const s = STYLES[step.status];
          return (
            <div key={i} className={`flex items-center ${i < items.length - 1 ? "flex-1" : ""}`}>
              <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${s.chip}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${s.circle}`}>
                  {step.status === "finish" ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <div className="min-w-0">
                  <div className={`text-[12px] font-bold leading-tight whitespace-nowrap ${s.title}`}>{step.title}</div>
                  {step.description && <div className={`text-[10.5px] leading-tight whitespace-nowrap ${s.desc}`}>{step.description}</div>}
                </div>
              </div>
              {i < items.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1.5 rounded ${step.status === "finish" ? "bg-emerald-400" : "bg-gray-200 dark:bg-gray-700"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Read-only "paid" summary — the payment fields (mode/UTR/bank/released-by/
// amount) are now populated entirely by TMS's callback, not entered here.
// Owner keeps an inline deductions editor for post-hoc corrections.
const PAYMENT_MODE_LABEL: Record<string, string> = {
  neft: "NEFT", rtgs: "RTGS", imps: "IMPS", internet_banking: "Internet Banking", upi: "UPI", cheque: "Cheque", dd: "DD", cash: "Cash",
};

function PaidPanel({ bill, canEditDeductions, onUpdated }: { bill: Bill; canEditDeductions: boolean; onUpdated: (b: Bill) => void }) {
  const [editing, setEditing] = useState(false);
  const [retention, setRetention] = useState(bill.retentionAmount ?? 0);
  const [advance, setAdvance] = useState(bill.advanceRecovery ?? 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRetention(bill.retentionAmount ?? 0);
    setAdvance(bill.advanceRecovery ?? 0);
    setEditing(false);
  }, [bill.id]);

  async function save() {
    setSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${bill.id}/deductions`, {
        advanceRecovery: advance, retentionAmount: retention,
      });
      onUpdated(normalizeId(res.data.bill) as unknown as Bill);
      toast.success("Deductions updated");
      setEditing(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to update deductions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-lg p-3.5">
      <div className="flex justify-between items-center mb-2.5">
        <div className="font-bold text-[13px] text-purple-700 dark:text-purple-300">Paid — confirmed by TMS</div>
        {canEditDeductions && !editing && (
          <Btn small outline icon={Pencil} label="Edit Deductions" onClick={() => setEditing(true)} />
        )}
      </div>
      {editing ? (
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hold / Retention (₹)" type="number" min="0" value={retention} onChange={(e) => setRetention(Number(e.target.value) || 0)} />
            <Field label="Advance Recovery (₹)" type="number" min="0" value={advance} onChange={(e) => setAdvance(Number(e.target.value) || 0)} />
          </div>
          <div className="flex gap-2 mt-2.5">
            <Btn small color="purple" loading={saving} label="Save" onClick={save} />
            <Btn small outline label="Cancel" onClick={() => setEditing(false)} />
          </div>
        </div>
      ) : (
        <Descriptions columns={2}>
          <DescItem label="Payment Date">{bill.paymentDate ? dayjs(bill.paymentDate).format("DD MMM YYYY") : "—"}</DescItem>
          <DescItem label="Mode"><Badge color="purple">{PAYMENT_MODE_LABEL[bill.paymentMode || ""] || bill.paymentMode?.toUpperCase() || "—"}</Badge></DescItem>
          <DescItem label="UTR / Ref"><span className="font-bold">{bill.paymentUTR || "—"}</span></DescItem>
          <DescItem label="Bank">{bill.paymentBank || "—"}</DescItem>
          <DescItem label="Released By">{bill.paymentReleasedBy || "—"}</DescItem>
          <DescItem label="Amount Paid"><span className="font-mono font-bold text-emerald-600">{bill.paidAmount != null ? fmt(bill.paidAmount) : "—"}</span></DescItem>
        </Descriptions>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function AccountsPayment() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canVerify = hasPerm(user, "verify");
  const canL1Agm = hasPerm(user, "l1-agm-approve");
  const canL2Director = hasPerm(user, "l2-director-approve");
  const canHold = hasPerm(user, "hold");
  const canReleaseHold = hasPerm(user, "release-hold");
  const canRetryTms = hasPerm(user, "retry-tms");
  const canRejectAny = canVerify || canL1Agm || canL2Director || hasPerm(user, "reject");
  const canEditDeductions = hasPerm(user, "edit");

  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);

  const [activeTab, setActiveTab] = useState("all");

  // Filters
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // ── The one shared bill detail Drawer ─────────────────────────
  const [drawerBillId, setDrawerBillId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerWOCategory, setDrawerWOCategory] = useState<string | undefined>(undefined);

  // Reject (inline, any stage)
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);

  // Verification (Stage 1 — merged Maker+Checker) — checks the bill against
  // its WO/vendor details and sets TDS. Retention/advance are decided
  // upstream now (bill-creation time, or AGM/GM's own Site Progress approval).
  const [verifyTdsPercent, setVerifyTdsPercent] = useState(1);
  const [verifyTdsAmount, setVerifyTdsAmount] = useState(0);
  // UI-only — which of the two synced TDS fields (verifyTdsPercent/
  // verifyTdsAmount) the compact TDS row's single input currently edits.
  // Doesn't touch the verify payload; both values stay in sync exactly as
  // before regardless of which one is being typed into.
  const [verifyTdsInputMode, setVerifyTdsInputMode] = useState<"percent" | "amount">("percent");
  const [verifyRemarks, setVerifyRemarks] = useState("");
  const [verifySaving, setVerifySaving] = useState(false);
  // Optional one-off correction to net payable — e.g. clawing back a small
  // overpayment from a prior cycle. Stored/sent as a single signed amount;
  // the sign toggle just controls which way verifyAdjustmentMagnitude counts.
  const [verifyAdjustmentSign, setVerifyAdjustmentSign] = useState<"add" | "subtract">("subtract");
  const [verifyAdjustmentMagnitude, setVerifyAdjustmentMagnitude] = useState<number | null>(null);
  const [verifyAdjustmentRemark, setVerifyAdjustmentRemark] = useState("");
  const verifyAdjustmentAmount = (verifyAdjustmentMagnitude || 0) * (verifyAdjustmentSign === "subtract" ? -1 : 1);

  // L1 AGM / L2 Director — pure approve-and-forward.
  const [l1Remarks, setL1Remarks] = useState("");
  const [l1Saving, setL1Saving] = useState(false);
  const [l2Remarks, setL2Remarks] = useState("");
  const [l2Saving, setL2Saving] = useState(false);

  // Hold / release hold (only reachable from 'approved' — the last safety
  // valve before the now-irreversible TMS handoff).
  const [holding, setHolding] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [holdSaving, setHoldSaving] = useState(false);
  const [releaseHoldSaving, setReleaseHoldSaving] = useState(false);

  // Send to TMS — serves both the first send and manual retries.
  const [sendTmsSaving, setSendTmsSaving] = useState(false);

  // Work Order / Vendor quick-view drawers — opened from a table row click,
  // independent of the main bill drawer's lifecycle.
  const [woDrawerId, setWoDrawerId] = useState<string | null>(null);
  const [woDrawerData, setWoDrawerData] = useState<WorkOrder | null>(null);
  const [vendorDrawerCode, setVendorDrawerCode] = useState<string | null>(null);

  // Archive / unarchive confirm
  const [archiveTarget, setArchiveTarget] = useState<Bill | null>(null);
  const [archiving, setArchiving] = useState(false);

  // ── Load data ────────────────────────────────────────────────

  const loadBills = useCallback((archived: boolean) => {
    setLoading(true);
    apiClient
      .get<{ bills: Record<string, unknown>[] }>(`/bills${archived ? "?archived=true" : ""}`)
      .then((r) => setBills((r.data.bills || []).map((b) => normalizeId(b) as unknown as Bill)))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadBills(showArchived);
  }, [loadBills, showArchived]);

  // Deep link from Slack's "View & Decide" button (?bill=<id>) — opens the
  // same drawer a normal click would, then drops the param so closing/reopening
  // behaves normally.
  useEffect(() => {
    const billId = searchParams.get("bill");
    if (!billId || loading) return;
    const bill = bills.find((b) => b.id === billId);
    if (bill) openDrawer(bill);
    setSearchParams((prev) => { prev.delete("bill"); return prev; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, bills, loading]);

  useEffect(() => {
    apiClient.get<{ projects: Record<string, unknown>[] }>("/projects")
      .then((r) => setProjects((r.data.projects || []).map((p) => normalizeId(p) as unknown as ProjectOpt)))
      .catch(() => { });
    apiClient.get<{ contractors: Record<string, unknown>[] }>("/contractors")
      .then((r) => setContractors((r.data.contractors || []).map((c) => normalizeId(c) as unknown as Contractor)))
      .catch(() => { });
    apiClient.get<{ companies: Record<string, unknown>[] }>("/companies")
      .then((r) => setCompanies((r.data.companies || []).map((c) => normalizeId(c) as unknown as CompanyOpt)))
      .catch(() => { });
  }, []);

  // ── Derived ──────────────────────────────────────────────────

  const draftBills = useMemo(() => bills.filter((b) => b.status === "draft"), [bills]);
  const verifyDoneBills = useMemo(() => bills.filter((b) => b.status === "verify-done"), [bills]);
  const l1ApprovedBills = useMemo(() => bills.filter((b) => b.status === "l1-approved"), [bills]);
  const approvedBills = useMemo(() => bills.filter((b) => b.status === "approved"), [bills]);
  const sentToTmsBills = useMemo(() => bills.filter((b) => b.status === "sent-to-tms"), [bills]);
  const holdBills = useMemo(() => bills.filter((b) => b.status === "hold"), [bills]);
  const paidBills = useMemo(() => bills.filter((b) => b.status === "paid"), [bills]);
  const rejectedBills = useMemo(() => bills.filter((b) => b.status === "rejected"), [bills]);

  // Flashcard-level groupings — "Verified" covers both approval stages
  // (L1 AGM + L2 Director) and "Pending Payment" covers both TMS stages
  // (ready to send + already sent, still awaiting payment confirmation).
  // The underlying per-stage tabs/pills below the flashcards are untouched.
  const verifiedBills = useMemo(() => bills.filter((b) => b.status === "verify-done" || b.status === "l1-approved"), [bills]);
  const pendingPaymentBills = useMemo(() => bills.filter((b) => b.status === "approved" || b.status === "sent-to-tms"), [bills]);

  const stats = useMemo(() => {
    const now = dayjs();
    const paidThisMonth = bills.filter((b) => b.status === "paid" && b.paymentDate && dayjs(b.paymentDate).isSame(now, "month"));
    return {
      paidThisMonthCount: paidThisMonth.length,
      paidThisMonthAmt: paidThisMonth.reduce((s, b) => s + (b.paidAmount ?? netPayableFinal(b)), 0),
    };
  }, [bills]);

  function matchesTab(b: Bill, tab: string): boolean {
    switch (tab) {
      case "draft": return b.status === "draft";
      case "verifyDone": return b.status === "verify-done";
      case "l1Approved": return b.status === "l1-approved";
      case "verified": return b.status === "verify-done" || b.status === "l1-approved";
      case "approved": return b.status === "approved";
      case "sentToTms": return b.status === "sent-to-tms";
      case "pendingPayment": return b.status === "approved" || b.status === "sent-to-tms";
      case "hold": return b.status === "hold";
      case "paid": return b.status === "paid";
      case "rejected": return b.status === "rejected";
      default: return true; // "all"
    }
  }

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        (b.billNo || "").toLowerCase().includes(q) ||
        (b.vendorName || "").toLowerCase().includes(q) ||
        (b.vendorCode || "").toLowerCase().includes(q) ||
        (b.companyName || "").toLowerCase().includes(q) ||
        (b.workOrderNo || "").toLowerCase().includes(q) ||
        (b.projectName || "").toLowerCase().includes(q) ||
        (b.generatedBy || "").toLowerCase().includes(q) ||
        (b.amount ?? 0).toFixed(2).includes(q) ||
        displayAmount(b).toFixed(2).includes(q);
      const matchTab = matchesTab(b, activeTab);
      const matchProject = !projectFilter || b.projectId === projectFilter;
      const matchVendor = !vendorFilter || b.vendorCode === vendorFilter;
      const matchCompany = !companyFilter || b.companyName === companyFilter;
      const matchDate = inDateRange(b.billDate, dateFrom, dateTo);
      return matchSearch && matchTab && matchProject && matchVendor && matchCompany && matchDate;
    });
  }, [bills, search, activeTab, projectFilter, vendorFilter, companyFilter, dateFrom, dateTo]);

  const { page, totalPages, setPage, pageItems: pagedBills } = usePagination(filteredBills, 10);

  interface TabDef { key: string; label: string; count: number; }
  const tabs: TabDef[] = [
    { key: "all", label: "All", count: 0 },
    { key: "draft", label: "Awaiting Verification", count: draftBills.length },
    { key: "verifyDone", label: "Pending L1 (AGM)", count: verifyDoneBills.length },
    { key: "l1Approved", label: "Pending L2 (GM)", count: l1ApprovedBills.length },
    { key: "approved", label: "Ready for TMS", count: approvedBills.length },
    { key: "sentToTms", label: "Sent to TMS", count: sentToTmsBills.length },
    { key: "hold", label: "Hold", count: holdBills.length },
    { key: "paid", label: "Paid", count: paidBills.length },
    { key: "rejected", label: "Rejected", count: rejectedBills.length },
  ];

  const drawerBill = useMemo(
    () => (drawerBillId ? bills.find((b) => b.id === drawerBillId) || null : null),
    [bills, drawerBillId]
  );

  // Reset every action section's local state whenever the drawer is opened for
  // a bill, or the open bill's own stage changes underneath it (e.g. right
  // after verifying succeeds, so the L1 AGM section is ready to go without
  // needing to close and reopen the drawer).
  useEffect(() => {
    if (!drawerOpen || !drawerBill) return;
    setRejecting(false);
    setRejectReason("");
    setHolding(false);
    setHoldReason("");
    setVerifyTdsPercent(drawerBill.tdsPercent ?? 1);
    setVerifyTdsAmount(drawerBill.tdsAmount ?? 0);
    setVerifyRemarks("");
    const priorAdjustment = drawerBill.adjustmentAmount ?? 0;
    setVerifyAdjustmentSign(priorAdjustment < 0 ? "subtract" : "add");
    setVerifyAdjustmentMagnitude(priorAdjustment !== 0 ? Math.abs(priorAdjustment) : null);
    setVerifyAdjustmentRemark(drawerBill.adjustmentRemark || "");
    setL1Remarks("");
    setL2Remarks("");

    if (drawerBill.workOrderId) {
      setDrawerWOCategory(undefined);
      apiClient.get<{ workOrder: Record<string, unknown> }>(`/work-orders/${drawerBill.workOrderId}`)
        .then((r) => setDrawerWOCategory((r.data.workOrder?.category as string) || ""))
        .catch(() => setDrawerWOCategory(undefined));
    } else {
      setDrawerWOCategory(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen, drawerBillId, drawerBill?.status]);

  // ── Download / Print ─────────────────────────────────────────

  const downloadBill = useCallback(
    async (bill: Bill, mode: 'pre' | 'post' = 'pre') => {
      const contractor = await resolvePrintParty(bill.vendorCode);
      printBill(bill, contractor, mode);
    },
    []
  );

  // ── Drawer open/close ─────────────────────────────────────────

  function openDrawer(bill: Bill) {
    setDrawerBillId(bill.id);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDrawerBillId(null);
  }

  function updateBillInList(updated: Bill) {
    setBills((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }

  // ── Work Order / Vendor quick-view (opened from a table row, without
  // leaving this page — accounts staff routinely need to cross-check both) ──
  function openWODrawer(workOrderId: string) {
    setWoDrawerId(workOrderId);
    setWoDrawerData(null);
    apiClient.get<{ workOrder: Record<string, unknown> }>(`/work-orders/${workOrderId}`)
      .then((r) => setWoDrawerData(r.data.workOrder ? normalizeFullWO(r.data.workOrder) : null))
      .catch(() => setWoDrawerData(null));
  }
  function closeWODrawer() { setWoDrawerId(null); setWoDrawerData(null); }

  function openVendorDrawer(vendorCode: string) {
    setVendorDrawerCode(vendorCode);
  }
  function closeVendorDrawer() { setVendorDrawerCode(null); }

  const vendorDrawerContractor = useMemo(
    () => (vendorDrawerCode ? contractors.find((c) => c.vendorCode === vendorDrawerCode) || null : null),
    [contractors, vendorDrawerCode]
  );

  // Every OTHER bill already loaded for this page against the same work order —
  // feeds WorkOrderDetailView's Billing Summary bar without a separate fetch.
  const woDrawerBills = useMemo(
    () => (woDrawerId ? bills.filter((b) => b.workOrderId === woDrawerId).map((b) => ({ status: b.status, amount: b.amount })) : []),
    [bills, woDrawerId]
  );

  // ── Stage actions (all fire from the single drawer) ───────────

  async function handleVerify() {
    if (!drawerBillId) return;
    if (verifyAdjustmentAmount !== 0 && !verifyAdjustmentRemark.trim()) {
      toast.error("A remark is required when adjusting the net payable amount");
      return;
    }
    setVerifySaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/verify`, {
        tdsPercent: verifyTdsPercent,
        tdsAmount: verifyTdsAmount,
        adjustmentAmount: verifyAdjustmentAmount,
        adjustmentRemark: verifyAdjustmentAmount !== 0 ? verifyAdjustmentRemark.trim() : undefined,
        remarks: verifyRemarks || undefined,
      });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      toast.success("Verified — ready for L1 AGM approval");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Verification failed");
    } finally {
      setVerifySaving(false);
    }
  }

  async function handleL1AgmApprove() {
    if (!drawerBillId) return;
    setL1Saving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/l1-agm-approve`, {
        remarks: l1Remarks || undefined,
      });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      toast.success("L1 AGM approved — ready for L2 Director approval");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "L1 AGM approval failed");
    } finally {
      setL1Saving(false);
    }
  }

  async function handleL2DirectorApprove() {
    if (!drawerBillId) return;
    setL2Saving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/l2-director-approve`, {
        remarks: l2Remarks || undefined,
      });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      toast.success("L2 Director approved — sending to TMS…");
      // Fires right after a successful L2 approval so it still feels like one
      // click, while the two backend actions stay independently retryable.
      await handleSendToTms(drawerBillId);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "L2 Director approval failed");
    } finally {
      setL2Saving(false);
    }
  }

  async function handleSendToTms(billId?: string) {
    const id = billId || drawerBillId;
    if (!id) return;
    setSendTmsSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${id}/send-to-tms`, {});
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      toast.success("Sent to TMS — awaiting payment confirmation");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; data?: { bill?: Record<string, unknown> } } } };
      toast.error(e?.response?.data?.message || "Failed to send to TMS — you can retry from this bill");
      // Even on failure, the bill's tmsLastError/tmsSendAttempts were updated
      // server-side — refetch it so the drawer shows the retry state.
      try {
        const r = await apiClient.get<{ bill: Record<string, unknown> }>(`/bills/${id}`);
        updateBillInList(normalizeId(r.data.bill) as unknown as Bill);
      } catch { /* ignore */ }
    } finally {
      setSendTmsSaving(false);
    }
  }

  async function handleHoldConfirm() {
    if (!drawerBillId || !holdReason.trim()) return;
    setHoldSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/hold`, { reason: holdReason });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      toast.success("Payment held");
      setHolding(false);
      setHoldReason("");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to hold payment");
    } finally {
      setHoldSaving(false);
    }
  }

  async function handleReleaseHold() {
    if (!drawerBillId) return;
    setReleaseHoldSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/release-hold`, {});
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      toast.success("Hold released — ready to send to TMS");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to release hold");
    } finally {
      setReleaseHoldSaving(false);
    }
  }

  async function handleRejectConfirm() {
    if (!drawerBillId || !rejectReason.trim()) return;
    setRejectSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/reject`, { reason: rejectReason });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      toast.success("Bill rejected");
      setRejecting(false);
      setRejectReason("");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to reject");
    } finally {
      setRejectSaving(false);
    }
  }

  // ── Archive / Unarchive ──────────────────────────────────────────

  async function archiveOne(bill: Bill) {
    setArchiving(true);
    try {
      await apiClient.patch(`/bills/${bill.id}/${showArchived ? "unarchive" : "archive"}`);
      toast.success(showArchived ? `${bill.billNo} unarchived` : `${bill.billNo} archived`);
      setArchiveTarget(null);
      loadBills(showArchived);
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Action failed");
    } finally {
      setArchiving(false);
    }
  }

  // ── Drawer: contextual action section (per stage + permission) ───

  function renderActionSection(bill: Bill): ReactNode {
    if (rejecting) {
      const sendBackTo = bill.status === "approved" ? "L1 AGM" : bill.status === "l1-approved" ? "Verification" : bill.status === "verify-done" ? "Verification" : null;
      return (
        <div className={`${sectionPanelClass} !bg-red-50 dark:!bg-red-500/10 !border-red-200 dark:!border-red-500/30`}>
          <div className="font-bold text-[13px] text-red-600 mb-2">
            {sendBackTo ? `Send Back to ${sendBackTo}` : "Reject Bill"}
          </div>
          <Field
            textarea placeholder="Explain what needs to be corrected…"
            value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex gap-2 mt-2.5">
            <Btn color="red" loading={rejectSaving} disabled={!rejectReason.trim()} label={sendBackTo ? "Confirm Send Back" : "Confirm Rejection"} onClick={handleRejectConfirm} />
            <Btn outline label="Cancel" onClick={() => { setRejecting(false); setRejectReason(""); }} />
          </div>
        </div>
      );
    }
    if (holding) {
      return (
        <div className={`${sectionPanelClass} !bg-purple-50 dark:!bg-purple-500/10 !border-purple-200 dark:!border-purple-500/30`}>
          <div className="font-bold text-[13px] text-purple-700 mb-2">Hold Payment</div>
          <Field
            textarea placeholder="Explain why this payment is being held…"
            value={holdReason} onChange={(e) => setHoldReason(e.target.value)}
          />
          <div className="flex gap-2 mt-2.5">
            <Btn color="purple" loading={holdSaving} disabled={!holdReason.trim()} label="Confirm Hold" onClick={handleHoldConfirm} />
            <Btn outline label="Cancel" onClick={() => { setHolding(false); setHoldReason(""); }} />
          </div>
        </div>
      );
    }

    switch (bill.status) {
      case "draft": {
        if (bill.manualApprovalStatus && bill.manualApprovalStatus !== "approved") {
          const stageText = bill.manualApprovalStatus === "pending-gm" ? "L2" : bill.manualApprovalStatus === "rejected" ? null : "L1";
          return (
            <MutedNote text={
              stageText
                ? `This manually-created bill needs ${stageText} sign-off on Site Progress's Bill Requests tab before it can be verified.`
                : "This manually-created bill was rejected during L1/L2 sign-off — see Site Progress's Bill Requests tab."
            } />
          );
        }

        if (!canVerify) return <MutedNote text="Awaiting Verification against its work order and vendor details." />;
        const tdsBase = () => billFinancials({
          gross: getLineItemsGross(bill), retentionAmount: bill.retentionAmount ?? 0, advanceRecovery: bill.advanceRecovery ?? 0,
        }).netBeforeGst;
        return (
          <>
            {/* Compact TDS + Adjustment — sit directly under Line Items'
                own "Total Billed Amount" row, right-aligned under it, same
                as that row's own width/position. No card/border — just the
                two small rows themselves. */}
            <div className="flex justify-end">
              <div className="w-full max-w-[320px] flex flex-col gap-2 py-2">
                {/* TDS row: %/₹ toggle → small input → calculated TDS Amount */}
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="text-gray-400 shrink-0">TDS</span>
                  <div className="inline-flex items-center rounded border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
                    {(["percent", "amount"] as const).map((m) => (
                      <button
                        key={m} type="button" onClick={() => setVerifyTdsInputMode(m)}
                        className={`w-6 h-6 text-[11px] font-bold ${verifyTdsInputMode === m ? "bg-primary text-white" : "bg-white dark:bg-transparent text-gray-500 dark:text-gray-400"}`}
                      >
                        {m === "percent" ? "%" : "₹"}
                      </button>
                    ))}
                  </div>
                  {verifyTdsInputMode === "percent" ? (
                    <input
                      type="number" min="0" max="100" value={verifyTdsPercent}
                      onChange={(e) => {
                        const pct = Number(e.target.value) || 0;
                        setVerifyTdsPercent(pct);
                        // TDS applies to what's actually payable now — gross minus Hold
                        // and Advance Recovery (neither is the contractor's taxable
                        // value), before GST (a pass-through tax, not the contractor's
                        // income). Never on the raw gross or the GST-inclusive figure.
                        setVerifyTdsAmount(Math.round(tdsBase() * pct / 100));
                      }}
                      className="w-16 h-7 px-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-transparent text-[13px] text-right"
                    />
                  ) : (
                    <input
                      type="number" min="0" value={verifyTdsAmount}
                      onChange={(e) => {
                        const amt = Number(e.target.value) || 0;
                        setVerifyTdsAmount(amt);
                        const base = tdsBase();
                        setVerifyTdsPercent(base > 0 ? Math.round((amt / base) * 10000) / 100 : 0);
                      }}
                      className="w-16 h-6 px-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-transparent text-[13px] text-right"
                    />
                  )}
                  <span className="text-gray-400 ml-auto shrink-0" pl-4>TDS Amount</span>
                  <span className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] shrink-0">{fmt(verifyTdsAmount)}</span>
                </div>

                {/* Adjustment row: −/+ toggle → small Amount input */}
                <div className="flex items-center gap-2.5 text-[13px]">
                  <span className="text-gray-400 shrink-0">Adjustment</span>
                  <div className="inline-flex items-center rounded border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0">
                    {(["subtract", "add"] as const).map((s) => (
                      <button
                        key={s} type="button" onClick={() => setVerifyAdjustmentSign(s)}
                        className={`px-2 h-6 text-[12px] font-bold whitespace-nowrap ${verifyAdjustmentSign === s ? "bg-primary text-white" : "bg-white dark:bg-transparent text-gray-500 dark:text-gray-400"}`}
                      >
                        {s === "subtract" ? "− Subtract" : "+ Add"}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number" min="0" placeholder="0"
                    value={verifyAdjustmentMagnitude ?? ""}
                    onChange={(e) => setVerifyAdjustmentMagnitude(e.target.value === "" ? null : Number(e.target.value))}
                    className="w-20 h-7 px-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-transparent text-[13px] text-right ml-auto"
                  />
                  {!!verifyAdjustmentMagnitude && (
                    <span className={`font-bold shrink-0 ${verifyAdjustmentSign === "subtract" ? "text-red-600" : "text-emerald-600"}`}>
                      {verifyAdjustmentSign === "subtract" ? "−" : "+"}{fmt(verifyAdjustmentMagnitude)}
                    </span>
                  )}
                </div>

                {!!verifyAdjustmentMagnitude && (
                  <Field
                    placeholder='Remark — required, e.g. "₹250 overpaid on RA-0198, recovering now"'
                    value={verifyAdjustmentRemark}
                    onChange={(e) => setVerifyAdjustmentRemark(e.target.value)}
                    error={!verifyAdjustmentRemark.trim() ? "Required" : undefined}
                  />
                )}
              </div>
            </div>

            <div className="px-1">
              <Field textarea placeholder="Remarks (optional)" value={verifyRemarks} onChange={(e) => setVerifyRemarks(e.target.value)} />
            </div>
          </>
        );
      }

      case "verify-done": {
        if (!canL1Agm) return <MutedNote text="Pending L1 (AGM) approval." />;
        const guard = sameActor(user, bill.verificationBy) ? "You verified this bill — a different user must give L1 AGM approval." : undefined;
        return (
          <div className={sectionPanelClass}>
            <div className="font-bold text-[13px] text-cyan-700 mb-2">L1 AGM Approval</div>
            {guard && <div className="text-xs text-amber-600 mb-2">⚠ {guard}</div>}
            <Descriptions columns={2}>
              <DescItem label="Hold / Retention">{fmt(bill.retentionAmount ?? 0)}</DescItem>
              <DescItem label="Advance Recovery">{fmt(bill.advanceRecovery ?? 0)}</DescItem>
              <DescItem label="TDS %">{bill.tdsPercent ?? 0}%</DescItem>
              <DescItem label="TDS Amount">{fmt(bill.tdsAmount ?? 0)}</DescItem>
            </Descriptions>
            <div className="mt-2.5">
              <Field textarea placeholder="Remarks (optional)" value={l1Remarks} onChange={(e) => setL1Remarks(e.target.value)} />
            </div>
          </div>
        );
      }

      case "hold":
        return (
          <div className="mt-4">
            <Alert
              type="warning"
              message={<><strong>Payment held:</strong> {bill.holdReason}{bill.holdBy?.name ? ` — ${bill.holdBy.name}` : ""}{bill.holdAt ? ` · ${dayjs(bill.holdAt).format("DD MMM YYYY")}` : ""}</>}
            />
            {!canReleaseHold && <MutedNote text="Only someone with Release Hold access can resume this bill." />}
          </div>
        );

      case "l1-approved": {
        if (!canL2Director) return <MutedNote text="Pending L2 (GM) approval." />;
        const guard = sameActor(user, bill.l1ApprovedBy) ? "You gave L1 AGM approval — a different user must give L2 Director approval." : undefined;
        return (
          <div className={sectionPanelClass}>
            <div className="font-bold text-[13px] text-indigo-700 mb-2">L2 Director Approval</div>
            {guard && <div className="text-xs text-amber-600 mb-2">⚠ {guard}</div>}
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              This is the last internal sign-off — approving sends this bill straight to TMS for payment.
            </div>
            <Field textarea placeholder="Remarks (optional)" value={l2Remarks} onChange={(e) => setL2Remarks(e.target.value)} />
          </div>
        );
      }

      case "approved": {
        if (!canRetryTms) return <MutedNote text="L2 Director approved — awaiting handoff to TMS." />;
        return (
          <div className={sectionPanelClass}>
            <div className="font-bold text-[13px] text-purple-700 mb-2">Ready for TMS</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2.5">
              L2 Director approved this bill — send it to the Transaction Management System to process the payment.
            </div>
            {bill.tmsLastError && (
              <Alert
                type="error"
                message={<><strong>Last attempt failed{bill.tmsSendAttempts ? ` (attempt ${bill.tmsSendAttempts})` : ""}:</strong> {bill.tmsLastError}</>}
              />
            )}
          </div>
        );
      }

      case "sent-to-tms":
        return (
          <div className="mt-4">
            <Alert
              type="info"
              message={<><strong>Sent to TMS</strong>{bill.tmsSentAt ? ` on ${dayjs(bill.tmsSentAt).format("DD MMM YYYY, hh:mm A")}` : ""} — awaiting payment confirmation. TMS owns this bill from here; no action is available in this system until it reports back.</>}
            />
          </div>
        );

      case "paid":
        return <PaidPanel bill={bill} canEditDeductions={canEditDeductions} onUpdated={updateBillInList} />;

      case "rejected":
        return bill.rejectReason ? (
          <div className="mt-4">
            <Alert
              type="error"
              message={<><strong>Rejection Reason:</strong> {bill.rejectReason}{bill.rejectedBy?.name ? ` — ${bill.rejectedBy.name}` : ""}</>}
            />
          </div>
        ) : null;

      default:
        return null;
    }
  }

  type BtnColor = "primary" | "purple" | "red" | "green" | "amber" | "blue" | "outline" | "dark";

  function footerPrimary(bill: Bill): { label: string; color: BtnColor; onClick: () => void; loading: boolean; disabled?: boolean; tooltip?: string } | null {
    switch (bill.status) {
      case "draft":
        return canVerify ? { label: "Verify", color: "primary", onClick: handleVerify, loading: verifySaving } : null;
      case "verify-done": {
        if (!canL1Agm) return null;
        const guard = sameActor(user, bill.verificationBy) ? "You verified this bill — a different user must give L1 AGM approval." : undefined;
        return { label: "L1 AGM Approve", color: "blue", onClick: handleL1AgmApprove, loading: l1Saving, disabled: !!guard, tooltip: guard };
      }
      case "hold":
        return canReleaseHold ? { label: "Release Hold", color: "purple", onClick: handleReleaseHold, loading: releaseHoldSaving } : null;
      case "l1-approved": {
        if (!canL2Director) return null;
        const guard = sameActor(user, bill.l1ApprovedBy) ? "You gave L1 AGM approval — a different user must give L2 Director approval." : undefined;
        return { label: "L2 Director Approve & Send to TMS", color: "blue", onClick: handleL2DirectorApprove, loading: l2Saving, disabled: !!guard, tooltip: guard };
      }
      case "approved":
        return canRetryTms ? { label: bill.tmsLastError ? "Retry Send to TMS" : "Send to TMS", color: "purple", onClick: () => handleSendToTms(), loading: sendTmsSaving } : null;
      default:
        return null;
    }
  }

  // ── Render ───────────────────────────────────────────────────────

  const primaryAction = drawerBill ? footerPrimary(drawerBill) : null;

  return (
    <div>
      <PageHeader
        icon={Wallet}
        title="Accounts Payment"
        subtitle="Verification → L1 AGM → L2 Director — then handed off to TMS for payment"
        actions={<NxBtn color="secondary" label="Procurement Tracker" onClick={() => navigate("/procurement-tracker")} />}
      />

      {/* Stat cards — each doubles as a shortcut into the matching tab filter below */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <NxStatCard
          label="Draft" value={<>{draftBills.length}<div className="text-[11px] font-normal text-gray-400 mt-0.5">Awaiting verification</div></>}
          icon={FilePlus}
          active={activeTab === "draft"} onClick={() => setActiveTab(activeTab === "draft" ? "all" : "draft")}
        />
        <NxStatCard
          label="Verified" value={<>{verifiedBills.length}<div className="text-[11px] font-normal text-gray-400 mt-0.5">L1 + L2 approval</div></>}
          icon={ShieldCheck}
          active={activeTab === "verified"} onClick={() => setActiveTab(activeTab === "verified" ? "all" : "verified")}
        />
        <NxStatCard
          label="Pending Payment" value={<>{pendingPaymentBills.length}<div className="text-[11px] font-normal text-gray-400 mt-0.5">Ready + sent to TMS</div></>}
          icon={Send}
          active={activeTab === "pendingPayment"} onClick={() => setActiveTab(activeTab === "pendingPayment" ? "all" : "pendingPayment")}
        />
        <NxStatCard
          label="Hold" value={<>{holdBills.length}<div className="text-[11px] font-normal text-gray-400 mt-0.5">Paused before TMS</div></>}
          icon={PauseCircle}
          active={activeTab === "hold"} onClick={() => setActiveTab(activeTab === "hold" ? "all" : "hold")}
        />
        <NxStatCard
          label="Paid" value={<>{paidBills.length}<div className="text-[11px] font-normal text-gray-400 mt-0.5">{fmt(stats.paidThisMonthAmt)} this month</div></>}
          icon={IndianRupee}
          active={activeTab === "paid"} onClick={() => setActiveTab(activeTab === "paid" ? "all" : "paid")}
        />
        <NxStatCard
          label="Rejected" value={<>{rejectedBills.length}<div className="text-[11px] font-normal text-gray-400 mt-0.5">Bills rejected</div></>}
          icon={XCircle}
          active={activeTab === "rejected"} onClick={() => setActiveTab(activeTab === "rejected" ? "all" : "rejected")}
        />
      </div>

      {/* Status filter chips — exact same toggle/chip colors as Work Items'
          Step-toggle row: active = theme-text (orange) on a
          --theme-primary-tint fill, no border; inactive = plain gray pill
          (bg-gray-100/dark:bg-gray-700 + gray text). Archived shares the
          identical chip styling, still driven by its own `showArchived`
          boolean since a bill can be archived at any status (not a
          mutually-exclusive activeTab value). */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {tabs.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={
                active
                  ? "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold theme-text focus:outline-none inline-flex items-center gap-1.5"
                  : "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-500! dark:text-gray-400! focus:outline-none inline-flex items-center gap-1.5"
              }
              style={active ? { backgroundColor: "var(--theme-primary-tint)" } : undefined}
            >
              {t.label}
              {t.count > 0 && <Badge color="green" small>{t.count}</Badge>}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setShowArchived((a) => !a)}
          className={
            showArchived
              ? "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold theme-text focus:outline-none"
              : "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-500! dark:text-gray-400! focus:outline-none"
          }
          style={showArchived ? { backgroundColor: "var(--theme-primary-tint)" } : undefined}
        >
          Archived
        </button>
      </div>


      {/* Filter row */}
      < FilterRow >
        <SearchFilter placeholder="Search by bill no, vendor, work order, project…" value={search} onChange={setSearch} />
        <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
        <DropdownSelectFilter
          placeholder="All Projects" resetValue=""
          value={projectFilter}
          onChange={setProjectFilter}
          options={selectableProjects(projects).map((p) => ({ label: p.name, value: p.id }))}
        />
        <DropdownSelectFilter
          placeholder="All Vendors" resetValue=""
          value={vendorFilter}
          onChange={setVendorFilter}
          options={contractors.map((c) => ({ label: `${vendorLabel(c.companyName, c.shortCode)} (${c.vendorCode})`, value: c.vendorCode }))}
        />
        <DropdownSelectFilter
          placeholder="All Companies" resetValue=""
          value={companyFilter}
          onChange={setCompanyFilter}
          options={companies.map((c) => ({ label: c.name, value: c.name }))}
        />
        <span className="ml-auto text-gray-400 text-xs">
          {filteredBills.length} bill{filteredBills.length !== 1 ? "s" : ""}
        </span>
      </FilterRow >

      {
        loading ? (
          <Spinner size="large" />
        ) : filteredBills.length === 0 ? (
          <EmptyState icon={FileText} title="No bills found" message="New bills are created from the Billing module." />
        ) : (
          <>
            <Table className="min-w-[1100px]">
              <Thead>
                <Tr>
                  <Th className="w-[10%]">Bill No.</Th>
                  <Th className="w-[11%]">Work Order</Th>
                  <Th className="w-[16%]">Vendor</Th>
                  <Th className="w-[15%]">Project</Th>
                  <Th className="text-right w-[12%]">Amount</Th>
                  <Th className="w-[15%]">Status</Th>
                  <Th className="w-[11%]">Date</Th>
                  <Th className="w-[10%]">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pagedBills.map((r) => (
                  <Tr key={r.id} className="cursor-pointer" onClick={() => openDrawer(r)}>
                    <Td className="font-bold text-blue-600 whitespace-nowrap truncate">{r.billNo}</Td>
                    <Td className="whitespace-nowrap truncate">
                      {r.workOrderNo && r.workOrderId ? (
                        // Opens the same full bill drawer as clicking anywhere
                        // else on the row (Bill + Work Order cards,
                        // Verification, Billing Chain, Line Items, Financial
                        // Summary, approval sections) — the WO-only quick-view
                        // (WorkOrderDetailView) is still one click away from
                        // there via that drawer's own "View Work Order →" button.
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openDrawer(r); }}
                          className="text-sm font-medium hover:underline"
                          style={{ color: "#ff7a00" }} >
                          {r.workOrderNo}
                        </button>
                      ) : <span className="text-gray-300">—</span>}
                    </Td>
                    <Td className="whitespace-nowrap truncate">
                      {r.vendorName && r.vendorCode ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openVendorDrawer(r.vendorCode!); }}
                          className="text-blue-600 hover:underline"
                        >
                          {r.vendorName}
                        </button>
                      ) : (r.vendorName || <span className="text-gray-300">—</span>)}
                    </Td>
                    <Td className="whitespace-nowrap truncate">{r.projectName || <span className="text-gray-300">—</span>}</Td>
                    <Td className="text-right font-mono font-bold whitespace-nowrap">{fmt(displayAmount(r))}</Td>
                    <Td className="whitespace-nowrap truncate"><NxBadge color={BILL_LIST_STATUS_CFG[r.status].color}>{BILL_LIST_STATUS_CFG[r.status].label}</NxBadge></Td>
                    <Td className="whitespace-nowrap">{r.billDate ? dayjs(r.billDate).format("DD MMM YYYY") : "—"}</Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <NxBtn
                        color="icon"
                        title="View"
                        icon={Eye}
                        onClick={() => openDrawer(r)}
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {totalPages > 1 && <div className="mt-4"><Pagination page={page} totalPages={totalPages} onChange={setPage} /></div>}
          </>
        )
      }

      {
        archiveTarget && (
          <ConfirmModal
            title={showArchived ? `Unarchive ${archiveTarget.billNo}?` : `Archive ${archiveTarget.billNo}?`}
            message={showArchived ? "It will reappear in the normal bill list." : "It will be hidden from the normal bill list, but not deleted."}
            confirmLabel={showArchived ? "Unarchive" : "Archive"}
            loading={archiving}
            onConfirm={() => archiveOne(archiveTarget)}
            onCancel={() => setArchiveTarget(null)}
          />
        )
      }

      {/* ── The one shared Bill Detail Drawer ─────────────────────── */}
      {
        drawerOpen && drawerBill && (
          <Modal
            icon={FileText}
            title={
              <span className="inline-flex items-center gap-2">
                <span className="text-blue-600 font-extrabold">
                  {drawerBill.billNo}
                </span>
                <StatusBadge status={drawerBill.status} />
              </span>
            }
            subtitle={undefined}
            extraWide
            onClose={closeDrawer}
            footer={
              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  <Btn
                    outline
                    icon={Printer}
                    label="Print"
                    onClick={() => downloadBill(
                      drawerBill,
                      drawerBill.status === "paid" ? "post" : "pre"
                    )}
                  />
                </div>
                <div className="flex gap-2">
                  {!rejecting && !holding && drawerBill.status === "approved" && canHold && (
                    <Btn color="purple" label="Hold Payment" onClick={() => setHolding(true)} />
                  )}
                  {!rejecting && !holding && canRejectAny && !["paid", "rejected", "hold", "sent-to-tms"].includes(drawerBill.status) && (
                    <Btn color="red" icon={XCircle} label={drawerBill.status === "draft" ? "Reject" : "Send Back"} onClick={() => setRejecting(true)} />
                  )}
                  {!rejecting && !holding && primaryAction && (
                    <Btn
                      color={primaryAction.color}
                      loading={primaryAction.loading}
                      disabled={primaryAction.disabled}
                      title={primaryAction.tooltip}
                      label={primaryAction.label}
                      onClick={primaryAction.onClick}
                    />
                  )}
                </div>
              </div>
            }
          >
            {/* ── 1. Bill + Work Order — compact comparison table ── */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 overflow-hidden bg-white dark:bg-[#1E293B]">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/40">
                    <th
                      colSpan={2}
                      className="w-1/2 px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700/40"
                    >
                      <SectionLabel title="Bill" />
                    </th>

                    <th
                      colSpan={2}
                      className="w-1/2 px-3 py-2 text-left"
                    >
                      <SectionLabel title="Work Order" />
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {/* Bill No / WO No */}
                  <tr className="border-t border-gray-200 dark:border-gray-700/40">
                    <td className="w-[13%] px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">
                      Bill No.
                    </td>
                    <td className="w-[37%] px-3 py-2 font-bold text-[#ff7a00] border-r border-gray-200 dark:border-gray-700/40">
                      {drawerBill.billNo}
                    </td>

                    <td className="w-[13%] px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">
                      WO No.
                    </td>
                    <td className="w-[37%] px-3 py-2 font-bold text-[#ff7a00]">
                      {drawerBill.workOrderNo || "—"}
                    </td>
                  </tr>

                  {/* Vendor / Category */}
                  <tr className="border-t border-gray-200 dark:border-gray-700/40">
                    <td className="px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">
                      Vendor
                    </td>
                    <td className="px-3 py-2 font-medium border-r border-gray-200 dark:border-gray-700/40">
                      {drawerBill.vendorName || "—"}
                    </td>

                    <td className="px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">
                      Category
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {drawerWOCategory || "—"}
                    </td>
                  </tr>

                  {/* Amount / Issuing Company */}
                  <tr className="border-t border-gray-200 dark:border-gray-700/40">
                    <td className="px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">
                      Amount
                    </td>
                    <td className="px-3 py-2 font-mono font-bold border-r border-gray-200 dark:border-gray-700/40">
                      {fmt(netAfterAdvance(drawerBill))}
                    </td>

                    <td className="px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">
                      Issuing Company
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {drawerBill.companyName || "—"}
                    </td>
                  </tr>

                  {/* Bill Date / Date */}
                  <tr className="border-t border-gray-200 dark:border-gray-700/40">
                    <td className="px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">
                      Bill Date
                    </td>
                    <td className="px-3 py-2 font-medium border-r border-gray-200 dark:border-gray-700/40">
                      {drawerBill.billDate
                        ? dayjs(drawerBill.billDate).format("DD MMM YYYY")
                        : "—"}
                    </td>

                    <td className="px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">
                      Date
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {drawerBill.billDate
                        ? dayjs(drawerBill.billDate).format("DD MMM YYYY")
                        : "—"}
                    </td>
                  </tr>

                  {/* Project / View Work Order */}
                  <tr className="border-t border-gray-200 dark:border-gray-700/40">
                    <td className="px-3 py-2 text-gray-400 border-r border-gray-700/40">
                      Project
                    </td>
                    <td className="px-3 py-2 font-medium border-r border-gray-200 dark:border-gray-700/40">
                      {drawerBill.projectName || "—"}
                    </td>

                    <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700/40">
                      {/* intentionally empty label cell */}
                    </td>

                    <td className="px-3 py-2">
                      {drawerBill.workOrderId && (
                        <button
                          type="button"
                          onClick={() => openWODrawer(drawerBill.workOrderId!)}
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5
                         text-[12px] font-semibold
                         text-blue-600 bg-blue-50
                         border border-blue-200
                         hover:bg-blue-100
                         dark:text-blue-400
                         dark:bg-blue-500/10
                         dark:border-blue-500/30
                         transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          View Work Order
                        </button>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── 2. Approval / history timeline — stacked cards ── */}
            <div className="mt-4">
              <ApprovalStepper items={buildSteps(drawerBill)} />
            </div>

            {/* ── 4. Billing Chain ── */}
            {(drawerBill.billType || drawerBill.billingCycle || drawerBill.linkedBills?.length || drawerBill.supersededBy) && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 p-3.5 mt-4 bg-gray-50/60 dark:bg-gray-800/20">
                <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2.5">Billing Chain</div>
                <div className="flex flex-col gap-2">
                  {(drawerBill.billType || drawerBill.billingCycle) && (
                    <div className="flex items-center gap-4 text-[12.5px]">
                      {drawerBill.billType && (
                        <span className="flex items-center gap-1.5">
                          <span className="text-gray-400">Bill Type:</span>
                          <Badge color="blue" small>{BILL_TYPE_CFG[drawerBill.billType]?.label || drawerBill.billType}</Badge>
                        </span>
                      )}
                      {drawerBill.billingCycle && (
                        <span className="flex items-center gap-1.5">
                          <span className="text-gray-400">Billing Cycle:</span>
                          <Badge color="gray" small>#{drawerBill.billingCycle}</Badge>
                        </span>
                      )}
                    </div>
                  )}
                  {drawerBill.isActive === false && drawerBill.supersededBy && (
                    <div className="text-purple-600 text-[12.5px] font-semibold">
                      ↩ Superseded By <span>{drawerBill.supersededBy.billNo}</span>
                    </div>
                  )}
                  {drawerBill.linkedBills && drawerBill.linkedBills.length > 0 && (
                    <div className="flex items-start gap-1.5 text-[12.5px]">
                      <span className="text-gray-400 shrink-0">Linked Bills:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {drawerBill.linkedBills.map((l, i) => (
                          <span key={i} className="inline-flex items-center gap-1">
                            <Badge color="blue" small>{l.billNo}</Badge>
                            <span className="text-[10px] text-purple-600">{l.relationshipType}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── 5. Line Items ── */}
            <div className="font-bold text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] mt-5 mb-2.5">
              Line Items
            </div>

            <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700/40">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Description</Th>
                    <Th className="text-right">Unit</Th>
                    <Th className="text-right">Qty</Th>
                    <Th className="text-right">Rate (₹)</Th>
                    <Th className="text-right">Amount</Th>
                  </Tr>
                </Thead>

                <Tbody>
                  {(drawerBill.lineItems || []).map((li, i) => (
                    <Tr key={i}>
                      <Td className="font-semibold">
                        {li.description}

                        {li.remarks && (
                          <div className="text-[11px] font-normal text-amber-600 mt-0.5">
                            📌 {li.remarks}
                          </div>
                        )}

                        {li.progressRemarks && (
                          <div className="text-[11px] font-normal text-blue-600 mt-0.5">
                            👷 {li.progressRemarks}
                          </div>
                        )}
                      </Td>

                      <Td className="text-right text-gray-400">
                        {li.unit || "—"}
                      </Td>

                      <Td className="text-right font-mono font-bold text-[#ff7a00]">
                        {(li.billedQty || 0).toLocaleString("en-IN")}
                      </Td>

                      <Td className="text-right font-mono">
                        {(li.rate || 0).toLocaleString("en-IN")}
                      </Td>

                      <Td className="text-right font-mono font-bold text-emerald-600">
                        {fmt(li.amount)}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>

                <Tfoot>
                  <Tr>
                    <Td
                      colSpan={4}
                      className="text-right font-bold text-gray-500 dark:text-gray-400"
                    >
                      Total Billed Amount
                    </Td>

                    <Td className="text-right font-mono font-bold text-[#ff7a00] text-[14px]">
                      {fmt(drawerBill.amount)}
                    </Td>
                  </Tr>
                </Tfoot>
              </Table>
            </div>

            {/* ── 5b. Verification — while the bill is still at the Draft/
                Verification stage, its action form (TDS/Adjustment/remarks)
                sits right under Line Items, right before Financial Summary,
                since TDS/Adjustment are calculated off the Line Items total.
                Every later stage's action section (L1 AGM, L2 Director,
                Hold, TMS, Rejection) instead renders down at ── 7. ── below,
                alongside History — same single renderActionSection(), just
                placed differently depending on drawerBill.status. */}
            {drawerBill.status === "draft" && renderActionSection(drawerBill)}

            {/* ── 6. Financial summary ── */}
            {(() => {
              const bill = drawerBill;
              // While Verification is actively setting TDS (status draft),
              // preview against what's being typed above — the saved bill
              // record still has tdsAmount at 0/unset until they submit.
              const isVerifyStage = bill.status === "draft";
              const gross = isVerifyStage ? getLineItemsGross(bill) : (bill.amount || 0);
              const gstPct = bill.gstPercent ?? 0;
              const retAmt = bill.retentionAmount ?? 0;
              const retPct = bill.retentionPercent ?? 0;
              const advRec = bill.advanceRecovery ?? 0;
              const paid = bill.paidAmount;
              const retRel = bill.retentionReleased ?? 0;
              const tdsPctDisplay = isVerifyStage ? verifyTdsPercent : bill.tdsPercent;
              const tdsAmt = isVerifyStage ? verifyTdsAmount : (bill.tdsAmount ?? 0);
              const adjAmt = isVerifyStage ? verifyAdjustmentAmount : (bill.adjustmentAmount ?? 0);
              const adjRemark = isVerifyStage ? verifyAdjustmentRemark : (bill.adjustmentRemark || "");

              // Hold comes off the gross first (it's a deposit against the
              // contractor's own basic value, not the GST); GST is then calculated
              // on what's left. Net Payable is the true bottom line — Hold,
              // Advance Recovery, and TDS all land above it now, not after it.
              // Adjustment (a manual Verify-time correction) lands last, after TDS.
              const { gstAmount: gstAmt, netPayable: finalNetPayable } = billFinancials({
                gross, gstPercent: gstPct, retentionAmount: retAmt, advanceRecovery: advRec, tdsAmount: tdsAmt, adjustmentAmount: adjAmt,
              });
              const retReleaseRemark = bill.retentionReleaseRemark;

              type SummaryRow = { label: string; value: string; colorClass: string; bold?: boolean; borderTop?: boolean; bg?: string };
              const rows: SummaryRow[] = [
                { label: "Gross Amount", value: fmt(gross), colorClass: "text-[#1A1A2E] dark:text-[#F1F5F9]" },
              ];
              if (retAmt > 0) rows.push({ label: `Hold / Retention${retPct > 0 ? ` @ ${retPct}%` : ""}`, value: `− ${fmt(retAmt)}`, colorClass: "text-red-600" });
              if (advRec > 0) rows.push({ label: "Less: Advance Recovery", value: `− ${fmt(advRec)}`, colorClass: "text-amber-600" });
              if (gstAmt > 0) rows.push({ label: `GST @ ${gstPct}%`, value: `+ ${fmt(gstAmt)}`, colorClass: "text-emerald-600" });
              if (tdsAmt > 0) rows.push({ label: `Less: TDS Deducted${tdsPctDisplay ? ` (${tdsPctDisplay}%)` : ""}`, value: `− ${fmt(tdsAmt)}`, colorClass: "text-red-600" });
              if (adjAmt !== 0) rows.push({ label: `Adjustment${adjRemark ? ` (${adjRemark})` : ""}`, value: `${adjAmt > 0 ? "+" : "−"} ${fmt(Math.abs(adjAmt))}`, colorClass: adjAmt > 0 ? "text-emerald-600" : "text-red-600" });
              rows.push({ label: "NET PAYABLE", value: fmt(finalNetPayable), colorClass: "text-purple-600", bold: true, borderTop: true });
              if (retRel > 0) rows.push({ label: `Hold Released${retReleaseRemark ? ` (${retReleaseRemark})` : ""}`, value: `+ ${fmt(retRel)}`, colorClass: "text-blue-700" });
              if (paid != null) rows.push({ label: "ACTUALLY PAID", value: fmt(paid), colorClass: "text-emerald-600", bold: true, borderTop: true, bg: "bg-emerald-50 dark:bg-emerald-500/10" });
              return (
                <div className="border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-hidden font-mono text-[13px] mb-4">
                  <div className="bg-gray-50 dark:bg-gray-800/40 px-3.5 py-2 font-bold text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Financial Summary
                  </div>
                  <div className="px-3.5 py-2">
                    {rows.map((r, i) => (
                      <div
                        key={i}
                        className={`flex justify-between py-1.5 ${r.borderTop ? "border-t-2 border-gray-200 dark:border-gray-700/40 mt-1" : ""} ${r.bg || ""} ${r.colorClass} ${r.bold ? "font-bold text-[14px]" : "font-normal"}`}
                      >
                        <span>{r.label}</span><span>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── 7. Stage-specific approval / action section — L1 AGM, L2
                Director, Hold, TMS, Rejection. (Verification/Draft already
                rendered up at ── 3. ── instead, right under the stepper.) */}
            {drawerBill.status !== "draft" && renderActionSection(drawerBill)}

            {/* ── 7b. History ── */}
            <BillHistoryTimeline history={drawerBill.approvalHistory || []} />

            {/* ── 8. Remarks ── */}
            {drawerBill.remarks && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700/40 mt-4 mb-2.5" />
                <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Remarks</div>
                <div className="text-gray-600 dark:text-gray-300 text-[13px]">{drawerBill.remarks}</div>
              </>
            )}
          </Modal>
        )
      }

      {/* ── Work Order quick-view — opened from a bill row, no navigation away.
          Exact same detail as the Work Orders page's own view, minus any
          editing/approval actions — accounts staff can cross-check everything
          without leaving this page or being able to act on the work order.
          Stacks above the bill drawer (via the new zIndex prop) since it can
          be opened from the "View Work Order →" button inside that drawer. */}
      {
        woDrawerId && (
          <Modal
            icon={ClipboardList}
            title={woDrawerData?.workOrderNo || "Work Order"}
            subtitle={woDrawerData?.projectName || ""}
            extraWide
            zIndex={210}
            onClose={closeWODrawer}
            footer={
              <div className="flex justify-end gap-2">
                <Btn outline label="Close" onClick={closeWODrawer} />
                <Btn color="primary" label="Open Full Page →" onClick={() => navigate(`/work-items/${woDrawerId}`)} />
              </div>
            }
          >
            {!woDrawerData ? <Spinner size="large" /> : (
              <WorkOrderDetailView workOrder={woDrawerData} bills={woDrawerBills} readOnly />
            )}
          </Modal>
        )
      }

      {/* ── Vendor quick-view — opened from a bill row, no navigation away.
          Exact same complete profile as the Contractors page's own view. */}
      {
        vendorDrawerCode && (
          <Modal
            icon={Building2}
            title={vendorDrawerContractor?.companyName || vendorDrawerCode}
            subtitle={vendorDrawerCode}
            extraWide
            onClose={closeVendorDrawer}
            footer={<div className="flex justify-end"><Btn outline label="Close" onClick={closeVendorDrawer} /></div>}
          >
            {!vendorDrawerContractor ? <Spinner size="large" /> : (
              <ContractorDetailView contractor={vendorDrawerContractor} />
            )}
          </Modal>
        )
      }
    </div >
  );
}