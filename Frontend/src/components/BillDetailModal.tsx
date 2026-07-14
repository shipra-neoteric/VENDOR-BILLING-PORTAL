import { Modal, Button } from "antd";
import dayjs from "dayjs";

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export interface BillDetailItem {
  scopeItemId?: string;
  description: string;
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
  const viewTotal = billRequest ? billRequest.items.reduce((s, it) => s + (it.rate ?? 0) * it.billedQty, 0) : 0;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Bill Request — {billRequest?.reqNo}</span>
          {billRequest?.stageNo && (
            <span style={{ background: "#FFF4E8", border: "1px solid #FF7A00", color: "#FF7A00", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 6 }}>
              Stage {billRequest.stageNo}
            </span>
          )}
          {billRequest?.milestoneAchieved && (
            <span style={{ background: "#FF7A00", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>
              🏆 Milestone
            </span>
          )}
        </div>
      }
      width={720}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {billRequest && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Header info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "#f9fafb", padding: 14, borderRadius: 8 }}>
            {[
              ["Work Order",    billRequest.workOrderNo],
              ["Project",       billRequest.projectName],
              ["Contractor",    billRequest.vendorName],
              ["Category",      [billRequest.category, billRequest.subCategory].filter(Boolean).join(" › ")],
              ["Requested By",  billRequest.requestedBy?.name || "—"],
              ["Date",          dayjs(billRequest.createdAt).format("DD MMM YYYY")],
              ...(billRequest.periodFrom ? [["Period", `${dayjs(billRequest.periodFrom).format("DD MMM YYYY")} → ${dayjs(billRequest.periodTo ?? billRequest.createdAt).format("DD MMM YYYY")}`]] : []),
              ...(billRequest.billId ? [["Bill No.", billRequest.billId.billNo + " — " + fmt(billRequest.billId.amount)]] : []),
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                <div style={{ fontWeight: 600, color: "#111827", fontSize: 13 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Items table */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Scope Items</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#1F2937", color: "#fff" }}>
                  {["Description", "Unit", "Qty Billed", "Rate", "Amount"].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {billRequest.items.map((it, i) => {
                  const amt = (it.rate ?? 0) * it.billedQty;
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #E5E7EB", background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                      <td style={{ padding: "6px 10px" }}>{it.description}</td>
                      <td style={{ padding: "6px 10px" }}>{it.unit}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "monospace" }}>{it.billedQty.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right" }}>
                        {it.rate ? fmt(it.rate) : <span style={{ color: "#9CA3AF" }}>pending</span>}
                      </td>
                      <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600 }}>
                        {it.rate ? fmt(amt) : <span style={{ color: "#9CA3AF" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {viewTotal > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid #FF7A00", background: "#FFF8F3" }}>
                    <td colSpan={4} style={{ padding: "8px 10px", fontWeight: 700, textAlign: "right", color: "#FF7A00" }}>Gross Total</td>
                    <td style={{ padding: "8px 10px", fontWeight: 700, color: "#111827", textAlign: "right" }}>{fmt(viewTotal)}</td>
                  </tr>
                  {(billRequest.billId?.retentionPercent ?? 0) > 0 && (
                    <tr style={{ background: "#fff1f2" }}>
                      <td colSpan={4} style={{ padding: "6px 10px", textAlign: "right", color: "#e03b3b", fontWeight: 600 }}>
                        Retention @ {billRequest.billId!.retentionPercent}%
                      </td>
                      <td style={{ padding: "6px 10px", textAlign: "right", color: "#e03b3b", fontWeight: 600, fontFamily: "monospace" }}>
                        − {fmt(billRequest.billId!.retentionAmount ?? Math.round(viewTotal * (billRequest.billId!.retentionPercent ?? 0) / 100))}
                      </td>
                    </tr>
                  )}
                  {(billRequest.billId?.retentionPercent ?? 0) > 0 && (
                    <tr style={{ background: "#f0fdf4" }}>
                      <td colSpan={4} style={{ padding: "8px 10px", fontWeight: 700, textAlign: "right", color: "#16a34a" }}>Net Release</td>
                      <td style={{ padding: "8px 10px", fontWeight: 700, color: "#16a34a", textAlign: "right", fontFamily: "monospace" }}>
                        {fmt(viewTotal - (billRequest.billId!.retentionAmount ?? Math.round(viewTotal * (billRequest.billId!.retentionPercent ?? 0) / 100)))}
                      </td>
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
          </div>

          {billRequest.remarks && (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: 10, fontSize: 13 }}>
              <strong>Remarks:</strong> {billRequest.remarks}
            </div>
          )}

          {billRequest.status === "approved" && billRequest.billId && (() => {
            const b = billRequest.billId;
            const gross   = b.amount || 0;
            const gstAmt  = Math.round(gross * (b.gstPercent ?? 0) / 100);
            const retAmt  = b.retentionAmount ?? 0;
            const advRec  = b.advanceRecovery ?? 0;
            const netPay  = gross + gstAmt - retAmt;
            const paid    = b.paidAmount;
            const tdsAmt  = paid != null ? Math.max(0, Math.round(netPay - advRec - paid)) : 0;
            return (
              <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: 12, fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: "#166534" }}>
                  Running Bill: {b.billNo}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#6B7280" }}>Gross Billed</span>
                    <span style={{ fontWeight: 600 }}>{fmt(gross)}</span>
                  </div>
                  {gstAmt > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#16a34a" }}>GST @ {b.gstPercent}%</span>
                    <span style={{ color: "#16a34a" }}>+ {fmt(gstAmt)}</span>
                  </div>}
                  {retAmt > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#dc2626" }}>Hold / Retention{(b.retentionPercent ?? 0) > 0 ? ` @ ${b.retentionPercent}%` : ""}</span>
                    <span style={{ color: "#dc2626" }}>− {fmt(retAmt)}</span>
                  </div>}
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #86efac", paddingTop: 4, marginTop: 2, fontWeight: 700 }}>
                    <span>Net Payable</span>
                    <span>{fmt(netPay)}</span>
                  </div>
                  {advRec > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                    <span style={{ color: "#d97706" }}>Less: Advance Recovery</span>
                    <span style={{ color: "#d97706" }}>− {fmt(advRec)}</span>
                  </div>}
                  {tdsAmt > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#dc2626" }}>Less: TDS Deducted</span>
                    <span style={{ color: "#dc2626" }}>− {fmt(tdsAmt)}</span>
                  </div>}
                  {paid != null && <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#16a34a", fontSize: 13, marginTop: 4, borderTop: "1px solid #86efac", paddingTop: 4 }}>
                    <span>Actually Paid</span>
                    <span>{fmt(paid)}</span>
                  </div>}
                </div>
                {billRequest.milestoneAchieved && billRequest.milestoneDate && (
                  <div style={{ marginTop: 8, color: "#FF7A00", fontWeight: 600 }}>
                    🏆 Payment Released: {dayjs(billRequest.milestoneDate).format("DD MMM YYYY")}
                    {b.paymentUTR && <span style={{ fontFamily: "monospace", marginLeft: 8, fontSize: 12, color: "#7c3aed" }}>UTR: {b.paymentUTR}</span>}
                  </div>
                )}
              </div>
            );
          })()}

          {billRequest.status === "rejected" && billRequest.rejectReason && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: 10, fontSize: 13 }}>
              <strong>Reject Reason:</strong> {billRequest.rejectReason}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
