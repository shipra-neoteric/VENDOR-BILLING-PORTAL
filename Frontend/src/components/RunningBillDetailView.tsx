import type { ReactNode } from "react";
import { CheckCircle2, XCircle, AlertCircle, Eye } from "lucide-react";
import dayjs from "dayjs";
import type { StepItem } from "../ui/Steps";
import Badge from "../ui/Badge";
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td } from "../ui/Table";
import { billFinancials } from "../shared/utils/billMath";
import { BILL_TYPE_CFG } from "../shared/constants/billOptions";

// ── The real "bill detail" markup shared by AccountsPayment's own drawer
// (Verification → L1 → L2 Director → Sent to TMS → Paid, the FULL lifecycle
// view) and MD/CEO Approvals' Review drawer (which only ever shows a bill at
// the L2 Director stage) — extracted so there's exactly one implementation
// of this rendering, not two that can silently drift apart. Every
// stage-specific action (Verify/L1/L2/Hold/Reject/etc.) is deliberately left
// OUT of this component — callers pass their own `renderActionSection`, so
// each page keeps its own state/handlers/permissions wired to whichever
// backend routes are appropriate for that context.

export interface RunningBillUser { _id?: string; name?: string; role?: string; }

export interface RunningBillHistoryEntry {
  stage: string;
  action: string;
  by?: RunningBillUser | string | null;
  at?: string;
  remarks?: string;
}

export interface RunningBillLineItem {
  description: string;
  remarks?: string;
  progressRemarks?: string;
  unit?: string;
  billedQty?: number;
  rate?: number;
  amount?: number;
}

export interface RunningBillDetail {
  id: string;
  billNo: string;
  workOrderId?: string;
  workOrderNo?: string;
  projectName?: string;
  vendorName?: string;
  companyName?: string;
  billDate?: string;
  status: string;
  lineItems: RunningBillLineItem[];
  amount: number;
  gstPercent?: number;
  retentionPercent?: number;
  retentionAmount?: number;
  advanceRecovery?: number;
  supersedeDeduction?: number;
  tdsPercent?: number;
  tdsAmount?: number;
  adjustmentAmount?: number;
  adjustmentRemark?: string;
  paidAmount?: number;
  retentionReleased?: number;
  retentionReleaseRemark?: string;
  remarks?: string;
  verificationBy?: RunningBillUser | null;
  verificationAt?: string;
  l1ApprovedBy?: RunningBillUser | null;
  l1ApprovedAt?: string;
  l2ApprovedBy?: RunningBillUser | null;
  l2ApprovedAt?: string;
  tmsSentAt?: string;
  tmsCallbackReceivedAt?: string;
  billType?: string;
  billingCycle?: number;
  linkedBills?: { billId: string; billNo: string; relationshipType: string; amount?: number; description?: string }[];
  isActive?: boolean;
  supersededBy?: { _id: string; billNo: string; billType?: string } | null;
  approvalHistory?: RunningBillHistoryEntry[];
}

export const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const getLineItemsGross = (bill: RunningBillDetail) =>
  (bill.lineItems || []).reduce((sum, li) => sum + (Number(li.amount) || 0), 0);

export const netAfterAdvance = (b: RunningBillDetail) =>
  billFinancials({
    gross: b.amount || 0, gstPercent: b.gstPercent ?? 0,
    retentionAmount: b.retentionAmount ?? 0, advanceRecovery: b.advanceRecovery ?? 0,
    supersedeDeduction: b.supersedeDeduction ?? 0,
  }).netPayable;

export function SectionLabel({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <div className="w-1 h-[15px] rounded bg-[#ff7a00]" />
      <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</div>
    </div>
  );
}

// Verification → L1 AGM → L2 Director → Sent to TMS → Paid stepper, driven
// off the real fields on the bill.
export function buildSteps(bill: RunningBillDetail): StepItem[] {
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
    { title: "L1", by: bill.l1ApprovedBy?.name, at: bill.l1ApprovedAt },
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

export function ApprovalStepper({ items }: { items: StepItem[] }) {
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

const HISTORY_STAGE_LABEL: Record<string, string> = {
  verify: "Verification", "l1-agm": "L1", "l2-director": "L2 Director", hold: "Hold",
  "tms-handoff": "Send to TMS", "tms-callback": "TMS Callback",
};

function historyEventTitle(h: RunningBillHistoryEntry): string {
  if (h.action === "sent-back") return "SENT BACK";
  if (h.action === "send-failed") return "TMS SEND FAILED";
  if (h.action === "rejected") return "REJECTED";
  switch (h.stage) {
    case "verify": return "BILL VERIFIED";
    case "l1-agm": return "L1 APPROVED";
    case "l2-director": return "APPROVED FOR PAYMENT";
    case "hold": return h.action === "released-hold" ? "HOLD RELEASED" : "PAYMENT HELD";
    case "tms-handoff": return "SENT TO TMS";
    case "tms-callback": return "PAID";
    case "manual-agm": return "MANUAL AGM APPROVED";
    case "manual-gm": return "MANUAL GM APPROVED";
    default: return `${HISTORY_STAGE_LABEL[h.stage] || h.stage} ${h.action}`.toUpperCase();
  }
}

function historyEventByLabel(h: RunningBillHistoryEntry): string {
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

function historyEventStyle(h: RunningBillHistoryEntry): { border: string; header: string; title: string; icon: string; iconGlyph: string } {
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
  return { border: "border-emerald-200 dark:border-emerald-500/30", header: "bg-emerald-50 dark:bg-emerald-500/10", title: "text-emerald-700 dark:text-emerald-400", icon: "bg-emerald-500 text-white", iconGlyph: "✓" };
}

export function BillHistoryTimeline({ history }: { history: RunningBillHistoryEntry[] }) {
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

// ── The main shared view — Bill/WO header, stepper, billing chain, line
// items, financial summary, stage action slot(s), history, remarks.
// `renderActionSection` is called at BOTH the pre-financial-summary slot
// (used historically only while status === 'draft', for Verification) and
// the post-financial-summary slot (every other status) — callers decide what
// (if anything) to render for a given bill.status, exactly like
// AccountsPayment's own renderActionSection already does.
export default function RunningBillDetailView({
  bill, woCategory, onViewWorkOrder, supersededByNumbers, renderActionSection,
}: {
  bill: RunningBillDetail;
  woCategory?: string;
  onViewWorkOrder?: () => void;
  supersededByNumbers?: string[];
  // Deliberately typed loosely (not `(bill: RunningBillDetail) => ReactNode`)
  // — callers (e.g. AccountsPayment) pass their own richer bill type here
  // (many more stage-specific fields than this shared view needs), and a
  // stricter contravariant parameter type would reject that at compile time
  // even though it's perfectly safe: this component only ever calls the
  // callback with the same `bill` object the caller already owns.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderActionSection?: (bill: any) => ReactNode;
}) {
  return (
    <>
      {/* ── Bill + Work Order — compact comparison table ── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 overflow-hidden bg-white dark:bg-[#1E293B]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/40">
              <th colSpan={2} className="w-1/2 px-3 py-2 text-left border-r border-gray-200 dark:border-gray-700/40">
                <SectionLabel title="Bill" />
              </th>
              <th colSpan={2} className="w-1/2 px-3 py-2 text-left">
                <SectionLabel title="Work Order" />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-200 dark:border-gray-700/40">
              <td className="w-[13%] px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">Bill No.</td>
              <td className="w-[37%] px-3 py-2 font-bold text-[#ff7a00] border-r border-gray-200 dark:border-gray-700/40">{bill.billNo}</td>
              <td className="w-[13%] px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">WO No.</td>
              <td className="w-[37%] px-3 py-2 font-bold text-[#ff7a00]">{bill.workOrderNo || "—"}</td>
            </tr>
            <tr className="border-t border-gray-200 dark:border-gray-700/40">
              <td className="px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">Vendor</td>
              <td className="px-3 py-2 font-medium border-r border-gray-200 dark:border-gray-700/40">{bill.vendorName || "—"}</td>
              <td className="px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">Category</td>
              <td className="px-3 py-2 font-medium">{woCategory || "—"}</td>
            </tr>
            <tr className="border-t border-gray-200 dark:border-gray-700/40">
              <td className="px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">Amount</td>
              <td className="px-3 py-2 font-mono font-bold border-r border-gray-200 dark:border-gray-700/40">{fmt(netAfterAdvance(bill))}</td>
              <td className="px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">Issuing Company</td>
              <td className="px-3 py-2 font-medium">{bill.companyName || "—"}</td>
            </tr>
            <tr className="border-t border-gray-200 dark:border-gray-700/40">
              <td className="px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">Bill Date</td>
              <td className="px-3 py-2 font-medium border-r border-gray-200 dark:border-gray-700/40">{bill.billDate ? dayjs(bill.billDate).format("DD MMM YYYY") : "—"}</td>
              <td className="px-3 py-2 text-gray-400 border-r border-gray-200 dark:border-gray-700/40">Date</td>
              <td className="px-3 py-2 font-medium">{bill.billDate ? dayjs(bill.billDate).format("DD MMM YYYY") : "—"}</td>
            </tr>
            <tr className="border-t border-gray-200 dark:border-gray-700/40">
              <td className="px-3 py-2 text-gray-400 border-r border-gray-700/40">Project</td>
              <td className="px-3 py-2 font-medium border-r border-gray-200 dark:border-gray-700/40">{bill.projectName || "—"}</td>
              <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700/40" />
              <td className="px-3 py-2">
                {bill.workOrderId && onViewWorkOrder && (
                  <button
                    type="button"
                    onClick={onViewWorkOrder}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-500/10 dark:border-blue-500/30 transition-colors"
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

      {/* ── Approval stepper ── */}
      <div className="mt-4">
        <ApprovalStepper items={buildSteps(bill)} />
      </div>

      {/* ── Billing Chain ── */}
      {(bill.billType || bill.billingCycle || bill.linkedBills?.length || bill.supersededBy || supersededByNumbers?.length) && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 p-3.5 mt-4 bg-gray-50/60 dark:bg-gray-800/20">
          <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2.5">Billing Chain</div>
          <div className="flex flex-col gap-2">
            {(bill.billType || bill.billingCycle) && (
              <div className="flex items-center gap-4 text-[12.5px]">
                {bill.billType && (
                  <span className="flex items-center gap-1.5">
                    <span className="text-gray-400">Bill Type:</span>
                    <Badge color="blue" small>{BILL_TYPE_CFG[bill.billType]?.label || bill.billType}</Badge>
                  </span>
                )}
                {bill.billingCycle && (
                  <span className="flex items-center gap-1.5">
                    <span className="text-gray-400">Billing Cycle:</span>
                    <Badge color="gray" small>#{bill.billingCycle}</Badge>
                  </span>
                )}
              </div>
            )}
            {bill.isActive === false && bill.supersededBy && (
              <div className="text-purple-600 text-[12.5px] font-semibold">
                ↩ Superseded By <span>{bill.supersededBy.billNo}</span>
              </div>
            )}
            {supersededByNumbers?.length ? (
              <div className="text-purple-600 text-[12.5px] font-semibold">
                ↩ Superseded by <span>{supersededByNumbers.join(", ")}</span> — this bill stays active/unchanged, only its amount was deducted there
              </div>
            ) : null}
            {bill.linkedBills && bill.linkedBills.length > 0 && (
              <div className="flex items-start gap-1.5 text-[12.5px]">
                <span className="text-gray-400 shrink-0">Linked Bills:</span>
                <div className="flex flex-wrap gap-1.5">
                  {bill.linkedBills.map((l, i) => (
                    <span key={i} className="inline-flex items-center gap-1" title={l.description || undefined}>
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

      {/* ── Line Items ── */}
      <div className="font-bold text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] mt-5 mb-2.5">Line Items</div>
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
            {(bill.lineItems || []).map((li, i) => (
              <Tr key={i}>
                <Td className="font-semibold">
                  {li.description}
                  {li.remarks && <div className="text-[11px] font-normal text-amber-600 mt-0.5">📌 {li.remarks}</div>}
                  {li.progressRemarks && <div className="text-[11px] font-normal text-blue-600 mt-0.5">👷 {li.progressRemarks}</div>}
                </Td>
                <Td className="text-right text-gray-400">{li.unit || "—"}</Td>
                <Td className="text-right font-mono font-bold text-[#ff7a00]">{(li.billedQty || 0).toLocaleString("en-IN")}</Td>
                <Td className="text-right font-mono">{(li.rate || 0).toLocaleString("en-IN")}</Td>
                <Td className="text-right font-mono font-bold text-emerald-600">{fmt(li.amount ?? 0)}</Td>
              </Tr>
            ))}
          </Tbody>
          <Tfoot>
            <Tr>
              <Td colSpan={4} className="text-right font-bold text-gray-500 dark:text-gray-400">Total Billed Amount</Td>
              <Td className="text-right font-mono font-bold text-[#ff7a00] text-[14px]">{fmt(bill.amount)}</Td>
            </Tr>
          </Tfoot>
        </Table>
      </div>

      {/* Verification-stage action slot — sits right under Line Items, since
          TDS/Adjustment there are calculated off the Line Items total. */}
      {bill.status === "draft" && renderActionSection?.(bill)}

      {/* ── Financial summary ── */}
      {(() => {
        const isVerifyStage = bill.status === "draft";
        const gross = isVerifyStage ? getLineItemsGross(bill) : (bill.amount || 0);
        const gstPct = bill.gstPercent ?? 0;
        const retAmt = bill.retentionAmount ?? 0;
        const retPct = bill.retentionPercent ?? 0;
        const advRec = bill.advanceRecovery ?? 0;
        const paid = bill.paidAmount;
        const retRel = bill.retentionReleased ?? 0;
        const tdsPctDisplay = bill.tdsPercent;
        const tdsAmt = bill.tdsAmount ?? 0;
        const adjAmt = bill.adjustmentAmount ?? 0;
        const adjRemark = bill.adjustmentRemark || "";

        const { gstAmount: gstAmt, netPayable: finalNetPayable } = billFinancials({
          gross, gstPercent: gstPct, retentionAmount: retAmt, advanceRecovery: advRec, tdsAmount: tdsAmt, adjustmentAmount: adjAmt,
          supersedeDeduction: bill.supersedeDeduction ?? 0,
        });
        const retReleaseRemark = bill.retentionReleaseRemark;

        type SummaryRow = { label: string; value: string; colorClass: string; bold?: boolean; borderTop?: boolean; bg?: string };
        const rows: SummaryRow[] = [
          { label: "Gross Amount", value: fmt(gross), colorClass: "text-[#1A1A2E] dark:text-[#F1F5F9]" },
        ];
        if (retAmt > 0) rows.push({ label: `Hold / Retention${retPct > 0 ? ` @ ${retPct}%` : ""}`, value: `− ${fmt(retAmt)}`, colorClass: "text-red-600" });
        if (advRec > 0) rows.push({ label: "Less: Advance Recovery", value: `− ${fmt(advRec)}`, colorClass: "text-amber-600" });
        if (gstAmt > 0) rows.push({ label: `GST @ ${gstPct}%`, value: `+ ${fmt(gstAmt)}`, colorClass: "text-emerald-600" });
        if ((bill.supersedeDeduction ?? 0) > 0) {
          rows.push({ label: "Less: Superseded Bills", value: "", colorClass: "text-red-600 font-semibold" });
          for (const l of bill.linkedBills ?? []) {
            if (l.relationshipType !== "SUPERSEDES") continue;
            rows.push({ label: `  ${l.billNo}${l.description ? ` — ${l.description}` : ""}`, value: `− ${fmt(l.amount ?? 0)}`, colorClass: "text-red-600" });
          }
        }
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

      {/* Every other stage's action slot (L1 AGM, L2 Director, Hold, TMS,
          Rejection) renders here, alongside History. */}
      {bill.status !== "draft" && renderActionSection?.(bill)}

      <BillHistoryTimeline history={bill.approvalHistory || []} />

      {bill.remarks && (
        <>
          <div className="border-t border-gray-200 dark:border-gray-700/40 mt-4 mb-2.5" />
          <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Remarks</div>
          <div className="text-gray-600 dark:text-gray-300 text-[13px]">{bill.remarks}</div>
        </>
      )}
    </>
  );
}
