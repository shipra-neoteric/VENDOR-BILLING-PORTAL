import { useState } from "react";
import { Trophy, HardHat, Check, X, AlertTriangle, ChevronDown } from "lucide-react";
import dayjs from "dayjs";
import { billFinancials } from "../shared/utils/billMath";
import Modal from "../ui/Modal";
import Btn from "../ui/Btn";
import Badge from "../ui/Badge";
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td } from "../ui/Table";

const fmt = (n: number) => "₹" + (n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Per-unit rates are fractional far more often than totals are — rounding
// them for display (as fmt() does) silently turns 130.5 into 131.
const fmtRate = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// One column of the bill's own Verification → L1 AGM → L2 Director → TMS
// chain — same fields AccountsPayment's stepper reads, just laid out as a
// table (matching the Work Order's own "Approval Workflow & Signatures" look)
// instead of a stepper, since a bill has no re-submission cycles to group.
function BillStageCell({ by, at }: { by?: string; at?: string }) {
  if (!by && !at) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  return (
    <div className="flex flex-col gap-1 min-w-[110px]">
      {by && <div className="text-[12.5px] font-bold text-gray-900 dark:text-[#F1F5F9]">{by}</div>}
      {at && <div className="text-[11px] text-gray-400">{dayjs(at).format("DD MMM YYYY, hh:mm A")}</div>}
      <div><Badge color="green" small>{by ? "Approved" : "Done"}</Badge></div>
    </div>
  );
}

export interface BillApprovalHistoryEntry {
  stage: "agm" | "gm";
  action: "approved" | "rejected";
  by?: { name: string } | string | null;
  at?: string;
  remarks?: string;
}

// The Site Progress-side sign-off (AGM → GM) that happens BEFORE a bill
// request ever becomes a RunningBill and reaches Accounts — a separate,
// earlier chain from BillStageCell's Verification → L1 AGM → L2 Director
// one above, which only starts once Accounts has the bill. Same append-only
// shape and rendering convention as SiteProgress's own ApprovalHistoryTimeline.
function BillApprovalHistoryList({ history }: { history?: BillApprovalHistoryEntry[] }) {
  if (!history || history.length === 0) return null;
  const stageLabel = (s: string) => (s === "agm" ? "AGM" : "GM");
  return (
    <div className="flex flex-col gap-2.5">
      {history.map((h, i) => {
        const isReject = h.action === "rejected";
        const name = h.by && typeof h.by !== "string" ? h.by.name : undefined;
        return (
          <div key={i} className="flex items-start gap-2.5">
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                isReject
                  ? "bg-red-50 dark:bg-red-500/10 border-red-500 text-red-600 dark:text-red-400"
                  : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {isReject ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
            </div>
            <div className="text-[13px]">
              <span className="font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">
                {stageLabel(h.stage)} {isReject ? "rejected" : "approved"}
              </span>
              <span className="text-gray-400 dark:text-gray-500 ml-1.5">
                {name ? `${name} · ` : ""}{h.at ? dayjs(h.at).format("DD MMM YYYY, hh:mm A") : ""}
              </span>
              {h.remarks && <div className="text-gray-500 dark:text-gray-400 mt-0.5">{h.remarks}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Quantity billed above the work order's own plannedQty on this line — never
// a new approval happening here, just a permanent copy of the AGM/GM sign-off
// that already had to happen (on the Work Order's progress side) before this
// over-plan quantity could reach a bill in the first place. Purely a display
// of evidence, matching the "display-only" decision — no action buttons.
function LineVarianceEvidence({ item }: { item: BillDetailItem }) {
  const [open, setOpen] = useState(false);
  if (!item.varianceQty || item.varianceQty <= 0) return null;
  return (
    <div className="mt-1">
      <div className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400 font-semibold">
        <AlertTriangle className="w-3 h-3 shrink-0" />
        <span>
          Variance +{item.varianceQty.toLocaleString("en-IN")} {item.varianceApproved ? "— approved" : "— unapproved"}
          {item.varianceApprovedBy?.name ? ` by ${item.varianceApprovedBy.name}` : ""}
          {item.varianceApprovedAt ? ` on ${dayjs(item.varianceApprovedAt).format("DD MMM YYYY")}` : ""}
        </span>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="ml-0.5 inline-flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 font-normal"
        >
          View Evidence <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="mt-1.5 grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-1.5 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-md px-3 py-2">
          {[
            ["Planned", item.plannedQty],
            ["Previously Billed", item.previouslyBilledQty],
            ["This Bill", item.billedQty],
            ["Cumulative", item.cumulativeBilledQty],
            ["Variance", `+${item.varianceQty}`],
          ].map(([label, val]) => (
            <div key={label as string}>
              <div className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{label}</div>
              <div className="text-xs font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{val ?? "—"}</div>
            </div>
          ))}
          <div>
            <div className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Approved</div>
            <div className="text-xs font-semibold">
              {item.varianceApproved ? <span className="text-green-600 dark:text-green-400">Yes</span> : <span className="text-red-600 dark:text-red-400">No</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface BillDetailItem {
  scopeItemId?: string;
  description: string;
  // The DRI's own notes from the day-to-day progress entries billed here —
  // distinct from the scope item's static instruction note.
  progressRemarks?: string;
  unit: string;
  billedQty: number;
  rate?: number;
  amount?: number;
  // Present only on a RunningBill's own lineItems (billId.lineItems below),
  // never on a plain BillRequest.items entry — see billRequestController's
  // gmApprove for where these get snapshotted at bill-creation time.
  plannedQty?: number;
  previouslyBilledQty?: number;
  cumulativeBilledQty?: number;
  varianceQty?: number;
  varianceApproved?: boolean;
  varianceApprovedBy?: { name: string } | null;
  varianceApprovedAt?: string;
  varianceApprovedAtQty?: number;
}

export interface BillDetailRequest {
  _id: string;
  reqNo: string;
  stageNo?: number;
  workOrderNo: string;
  projectName: string;
  vendorName: string;
  category: string;
  subCategory: string;
  items: BillDetailItem[];
  remarks: string;
  periodFrom?: string;
  periodTo?: string;
  status: "pending" | "approved" | "rejected";
  rejectReason?: string;
  requestedBy?: { name: string; email: string };
  // Whoever did the LAST terminal action (gmApprove, or a reject at either
  // stage) — the closest thing to a "GM approved" actor for bills whose
  // approvalHistory is empty (see the fallback in the render body below).
  processedBy?: { name: string } | null;
  processedAt?: string;
  // Site Progress's own AGM→GM sign-off, before this request ever becomes a
  // RunningBill — see BillApprovalHistoryList for why this is a separate
  // chain from billId's Verification/L1/L2 fields below.
  agmApprovedBy?: { name: string } | null;
  agmApprovedAt?: string;
  approvalHistory?: BillApprovalHistoryEntry[];
  billId?: {
    billNo: string;
    status: string;
    amount: number;
    paidAmount?: number;
    retentionPercent?: number;
    retentionAmount?: number;
    advanceRecovery?: number;
    gstPercent?: number;
    adjustmentAmount?: number;
    adjustmentRemark?: string;
    paymentUTR?: string;
    // Verification → L1 AGM → L2 Director sign-off chain, plus the automated
    // TMS handoff/callback — same fields AccountsPayment's own stepper reads.
    verificationBy?: { name: string } | null;
    verificationAt?: string;
    l1ApprovedBy?: { name: string } | null;
    l1ApprovedAt?: string;
    l2ApprovedBy?: { name: string } | null;
    l2ApprovedAt?: string;
    tmsSentAt?: string;
    tmsCallbackReceivedAt?: string;
    // Pre-redesign, RunningBill-level fallback for the AGM stamp — see the
    // approvalHistory fallback below for why this gets read.
    agmApprovedBy?: { name: string } | null;
    agmApprovedAt?: string;
    // The bill's own line items — same shape as BillDetailItem, but this is
    // the authoritative "as actually billed" record (rate is re-read fresh
    // from the WO at bill-creation time, and this is the only place quantity-
    // variance evidence ever gets snapshotted). Preferred over the plain
    // `items` above whenever a bill actually exists.
    lineItems?: BillDetailItem[];
  };
  milestoneAchieved?: boolean;
  milestoneDate?: string;
  createdAt: string;
}

// Read-only view of a bill request — same layout as the BillRequests page's
// view modal, minus approve/reject/milestone actions (not applicable outside that workflow).
export default function BillDetailModal({
  billRequest, open, onClose,
}: {
  billRequest: BillDetailRequest | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || !billRequest) return null;

  // Once a RunningBill actually exists, its own lineItems are the
  // authoritative "as billed" record (fresh rate snapshot, plus the only
  // place quantity-variance evidence is ever recorded) — prefer those over
  // the plain BillRequest.items, which is all there is before a bill exists.
  const displayItems = billRequest.billId?.lineItems ?? billRequest.items;
  const varianceItems = displayItems.filter(it => (it.varianceQty ?? 0) > 0);
  const viewTotal = displayItems.reduce((s, it) => s + (it.rate ?? 0) * it.billedQty, 0);

  // Bills created via the normal single-request flow carry a real
  // approvalHistory. Older/batch-created ones (e.g. a bulk daily-wages run)
  // never wrote it — they only ever set the plain agmApprovedBy/processedBy
  // stamps (on the BillRequest itself, or as a last resort the RunningBill's
  // own pre-redesign agmApprovedBy field). Synthesize an equivalent 2-row
  // history from whichever of those is actually present, so this section
  // still shows something for every approved/rejected bill, not just ones
  // that happened to go through agmApprove/gmApprove individually.
  const approvalHistory: BillApprovalHistoryEntry[] = billRequest.approvalHistory?.length
    ? billRequest.approvalHistory
    : (() => {
        const agmBy = billRequest.agmApprovedBy ?? billRequest.billId?.agmApprovedBy;
        const agmAt = billRequest.agmApprovedAt ?? billRequest.billId?.agmApprovedAt;
        const rows: BillApprovalHistoryEntry[] = [];
        if (agmBy || agmAt) rows.push({ stage: "agm", action: "approved", by: agmBy, at: agmAt });
        if (billRequest.status === "approved" && (billRequest.processedBy || billRequest.processedAt)) {
          rows.push({ stage: "gm", action: "approved", by: billRequest.processedBy, at: billRequest.processedAt });
        } else if (billRequest.status === "rejected" && (billRequest.processedBy || billRequest.processedAt)) {
          // No approvalHistory to say which stage actually rejected it — if AGM
          // had already approved (forwarded to GM), a later reject must be
          // GM's; if AGM never approved at all, it was rejected at AGM itself.
          rows.push({ stage: agmBy || agmAt ? "gm" : "agm", action: "rejected", by: billRequest.processedBy, at: billRequest.processedAt, remarks: billRequest.rejectReason });
        }
        return rows;
      })();

  const headerRows: [string, React.ReactNode][] = [
    ["Work Order",    billRequest.workOrderNo],
    ["Project",       billRequest.projectName],
    ["Contractor",    billRequest.vendorName],
    ["Category",      [billRequest.category, billRequest.subCategory].filter(Boolean).join(" › ")],
    ["Requested By",  billRequest.requestedBy?.name || "—"],
    ["Date",          dayjs(billRequest.createdAt).format("DD MMM YYYY")],
    ...(billRequest.periodFrom ? [["Period", `${dayjs(billRequest.periodFrom).format("DD MMM YYYY")} → ${dayjs(billRequest.periodTo ?? billRequest.createdAt).format("DD MMM YYYY")}`] as [string, React.ReactNode]] : []),
    ...(billRequest.billId ? [["Bill No.", billRequest.billId.billNo + " — " + fmt(billRequest.billId.amount)] as [string, React.ReactNode]] : []),
  ];

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <span>Bill Request — {billRequest.reqNo}</span>
          {billRequest.stageNo && <Badge color="orange" small>Stage {billRequest.stageNo}</Badge>}
          {billRequest.milestoneAchieved && (
            <span className="inline-flex items-center gap-1 bg-primary text-white text-[11px] font-bold px-2 py-0.5 rounded-md">
              <Trophy className="w-3 h-3" /> Milestone
            </span>
          )}
        </div>
      }
      extraWide
      onClose={onClose}
      footer={<Btn label="Close" outline onClick={onClose} />}
    >
      <div className="flex flex-col gap-3.5">
        {/* Header info */}
        <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-gray-800/40 p-3.5 rounded-lg">
          {headerRows.map(([label, val]) => (
            <div key={label}>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
              <div className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] text-[13px]">{val}</div>
            </div>
          ))}
        </div>

        {/* Bill's own approval chain — Verification → L1 AGM → L2 Director → TMS,
            same fields AccountsPayment's stepper reads, just as a table. */}
        {billRequest.billId && (
          <div>
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
                  <Td className="align-top"><BillStageCell by={billRequest.billId.verificationBy?.name} at={billRequest.billId.verificationAt} /></Td>
                  <Td className="align-top"><BillStageCell by={billRequest.billId.l1ApprovedBy?.name} at={billRequest.billId.l1ApprovedAt} /></Td>
                  <Td className="align-top"><BillStageCell by={billRequest.billId.l2ApprovedBy?.name} at={billRequest.billId.l2ApprovedAt} /></Td>
                  <Td className="align-top"><BillStageCell at={billRequest.billId.tmsSentAt} /></Td>
                  <Td className="align-top"><BillStageCell at={billRequest.billId.tmsCallbackReceivedAt} /></Td>
                </Tr>
              </Tbody>
            </Table>
          </div>
        )}

        {/* Items table */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="font-bold text-xs text-gray-600 dark:text-gray-300 uppercase tracking-wide">Scope Items</div>
            {varianceItems.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-full px-2 py-0.5">
                <AlertTriangle className="w-3 h-3" /> Quantity Variance: {varianceItems.length} item{varianceItems.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
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
              {displayItems.map((it, i) => {
                const amt = (it.rate ?? 0) * it.billedQty;
                return (
                  <Tr key={i}>
                    <Td>
                      {it.description}
                      {it.progressRemarks && (
                        <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 flex items-center gap-1">
                          <HardHat className="w-3 h-3" /> {it.progressRemarks}
                        </div>
                      )}
                      <LineVarianceEvidence item={it} />
                    </Td>
                    <Td>{it.unit}</Td>
                    <Td className="text-right font-mono">{it.billedQty.toLocaleString("en-IN")}</Td>
                    <Td className="text-right">{it.rate ? fmtRate(it.rate) : <span className="text-gray-400">pending</span>}</Td>
                    <Td className="text-right font-semibold">{it.rate ? fmt(amt) : <span className="text-gray-400">—</span>}</Td>
                  </Tr>
                );
              })}
            </Tbody>
            {viewTotal > 0 && (
              <Tfoot>
                <Tr className="bg-primary/5">
                  <Td colSpan={4} className="font-bold text-right text-primary">Gross Total</Td>
                  <Td className="font-bold text-right text-[#1A1A2E] dark:text-[#F1F5F9]">{fmt(viewTotal)}</Td>
                </Tr>
                {(billRequest.billId?.retentionPercent ?? 0) > 0 && (
                  <Tr className="bg-red-50 dark:bg-red-500/10">
                    <Td colSpan={4} className="text-right font-semibold text-red-600 dark:text-red-400">
                      Retention @ {billRequest.billId!.retentionPercent}%
                    </Td>
                    <Td className="text-right font-semibold font-mono text-red-600 dark:text-red-400">
                      − {fmt(billRequest.billId!.retentionAmount ?? Math.round(viewTotal * (billRequest.billId!.retentionPercent ?? 0) / 100))}
                    </Td>
                  </Tr>
                )}
                {(billRequest.billId?.retentionPercent ?? 0) > 0 && (
                  <Tr className="bg-emerald-50 dark:bg-emerald-500/10">
                    <Td colSpan={4} className="font-bold text-right text-emerald-600 dark:text-emerald-400">Net Release</Td>
                    <Td className="font-bold text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {fmt(viewTotal - (billRequest.billId!.retentionAmount ?? Math.round(viewTotal * (billRequest.billId!.retentionPercent ?? 0) / 100)))}
                    </Td>
                  </Tr>
                )}
              </Tfoot>
            )}
          </Table>
        </div>

        {billRequest.remarks && (
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-md px-2.5 py-2 text-sm text-amber-800 dark:text-amber-300">
            <strong>Remarks:</strong> {billRequest.remarks}
          </div>
        )}

        {billRequest.status === "approved" && billRequest.billId && (() => {
          const b = billRequest.billId;
          const gross   = b.amount || 0;
          const retAmt  = b.retentionAmount ?? 0;
          const advRec  = b.advanceRecovery ?? 0;
          const { gstAmount: gstAmt, netAfterHold: netPay } = billFinancials({ gross, gstPercent: b.gstPercent ?? 0, retentionAmount: retAmt, advanceRecovery: advRec });
          const paid    = b.paidAmount;
          const tdsAmt  = paid != null ? Math.max(0, Math.round(netPay - paid)) : 0;
          return (
            <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 rounded-lg p-3 text-sm">
              <div className="font-bold mb-2 text-emerald-800 dark:text-emerald-300">
                Running Bill: {b.billNo}
              </div>
              <div className="font-mono text-xs flex flex-col gap-0.5">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Gross Billed</span>
                  <span className="font-semibold">{fmt(gross)}</span>
                </div>
                {retAmt > 0 && (
                  <div className="flex justify-between text-red-600 dark:text-red-400">
                    <span>Hold / Retention{(b.retentionPercent ?? 0) > 0 ? ` @ ${b.retentionPercent}%` : ""}</span>
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
                    <span>GST @ {b.gstPercent}%</span>
                    <span>+ {fmt(gstAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-emerald-300 dark:border-emerald-500/30 pt-1 mt-0.5 font-bold">
                  <span>Net Payable</span>
                  <span>{fmt(netPay)}</span>
                </div>
                {tdsAmt > 0 && (
                  <div className="flex justify-between text-red-600 dark:text-red-400">
                    <span>Less: TDS Deducted</span>
                    <span>− {fmt(tdsAmt)}</span>
                  </div>
                )}
                {(b.adjustmentAmount ?? 0) !== 0 && (
                  <div className={`flex justify-between ${(b.adjustmentAmount ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    <span>Adjustment{b.adjustmentRemark ? ` (${b.adjustmentRemark})` : ""}</span>
                    <span>{(b.adjustmentAmount ?? 0) > 0 ? "+" : "−"} {fmt(Math.abs(b.adjustmentAmount ?? 0))}</span>
                  </div>
                )}
                {paid != null && (
                  <div className="flex justify-between font-bold text-emerald-600 dark:text-emerald-400 text-[13px] mt-1 border-t border-emerald-300 dark:border-emerald-500/30 pt-1">
                    <span>Actually Paid</span>
                    <span>{fmt(paid)}</span>
                  </div>
                )}
              </div>
              {billRequest.milestoneAchieved && billRequest.milestoneDate && (
                <div className="mt-2 text-primary font-semibold flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5" /> Payment Released: {dayjs(billRequest.milestoneDate).format("DD MMM YYYY")}
                  {b.paymentUTR && <span className="font-mono ml-2 text-xs text-purple-600 dark:text-purple-400">UTR: {b.paymentUTR}</span>}
                </div>
              )}
            </div>
          );
        })()}

        {/* AGM → GM sign-off — happens in Site Progress, before this ever
            reaches Accounts as a RunningBill. */}
        {approvalHistory.length > 0 && (
          <div>
            <div className="font-bold text-xs text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
              Approval Chain — Before Accounts
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg p-3.5">
              <BillApprovalHistoryList history={approvalHistory} />
            </div>
          </div>
        )}

        {billRequest.status === "rejected" && billRequest.rejectReason && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-md px-2.5 py-2 text-sm text-red-700 dark:text-red-300">
            <strong>Reject Reason:</strong> {billRequest.rejectReason}
          </div>
        )}
      </div>
    </Modal>
  );
}
