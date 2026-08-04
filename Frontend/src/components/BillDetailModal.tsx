import { Trophy, HardHat } from "lucide-react";
import dayjs from "dayjs";
import { billFinancials } from "../shared/utils/billMath";
import Modal from "../ui/Modal";
import Btn from "../ui/Btn";
import Badge from "../ui/Badge";
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td } from "../ui/Table";

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
// Per-unit rates are fractional far more often than totals are — rounding
// them for display (as fmt() does) silently turns 130.5 into 131.
const fmtRate = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

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
  billId?: {
    billNo: string;
    status: string;
    amount: number;
    paidAmount?: number;
    retentionPercent?: number;
    retentionAmount?: number;
    advanceRecovery?: number;
    gstPercent?: number;
    paymentUTR?: string;
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

  const viewTotal = billRequest.items.reduce((s, it) => s + (it.rate ?? 0) * it.billedQty, 0);

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
      wide
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
              {billRequest.items.map((it, i) => {
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
          const { gstAmount: gstAmt, netAfterHold: netPay } = billFinancials({ gross, gstPercent: b.gstPercent ?? 0, retentionAmount: retAmt });
          const paid    = b.paidAmount;
          const tdsAmt  = paid != null ? Math.max(0, Math.round(netPay - advRec - paid)) : 0;
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
                {advRec > 0 && (
                  <div className="flex justify-between mt-0.5 text-amber-600 dark:text-amber-400">
                    <span>Less: Advance Recovery</span>
                    <span>− {fmt(advRec)}</span>
                  </div>
                )}
                {tdsAmt > 0 && (
                  <div className="flex justify-between text-red-600 dark:text-red-400">
                    <span>Less: TDS Deducted</span>
                    <span>− {fmt(tdsAmt)}</span>
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

        {billRequest.status === "rejected" && billRequest.rejectReason && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-md px-2.5 py-2 text-sm text-red-700 dark:text-red-300">
            <strong>Reject Reason:</strong> {billRequest.rejectReason}
          </div>
        )}
      </div>
    </Modal>
  );
}
