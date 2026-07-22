import { useEffect, useState, useCallback } from "react";
import type { Dayjs } from "dayjs";
import {
  Tabs, Button, Tag, Modal, Form, Input, InputNumber,
  Descriptions, Row, Col, Empty, Spin, Alert, message,
} from "antd";
import {
  CheckOutlined, CloseOutlined, SafetyCertificateOutlined, ReloadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import { useAuth } from "../../context/AuthContext";

// ── Types ─────────────────────────────────────────────────────
type BillStatus = "draft" | "submitted" | "verified" | "approved" | "payment-initiated" | "rejected" | "paid";
type ActionType = "verify" | "approve" | "initiate" | "reject" | "view";

interface BillUser { name?: string; role?: string; }
interface Bill {
  _id: string;
  billNo: string;
  workOrderId?: string;
  workOrderNo?: string;
  projectName?: string;
  vendorCode?: string;
  vendorName?: string;
  billDate: string;
  billRefNo?: string;
  generatedBy?: string;
  lineItems?: { description: string; unit: string; billedQty: number; rate: number; amount: number }[];
  amount: number;
  gstPercent: number;
  tdsPercent: number;
  retentionAmount?: number;
  advanceRecovery?: number;
  tdsAmount?: number;
  remarks?: string;
  status: BillStatus;
  submittedAt?: string;
  agmApprovedBy?: BillUser | null;
  agmApprovedAt?: string;
  verifiedBy?: BillUser | null;
  verifiedAt?: string;
  approvedBy?: BillUser | null;
  approvedAt?: string;
  paymentInitiatedBy?: BillUser | null;
  paymentInitiatedAt?: string;
  rejectedBy?: BillUser | null;
  rejectReason?: string;
  createdAt?: string;
}

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");

function calcAmounts(b: Bill) {
  const gstAmt = (b.amount * (b.gstPercent ?? 18)) / 100;
  const gross  = b.amount + gstAmt;
  const tdsAmt = (gross * (b.tdsPercent ?? 1)) / 100;
  const retention = b.retentionAmount ?? 0;
  const advance   = b.advanceRecovery ?? 0;
  const net    = gross - tdsAmt - retention - advance;
  return { gstAmt, gross, tdsAmt, retention, advance, net };
}

const STATUS_CFG: Record<BillStatus, { color: string; label: string }> = {
  draft:              { color: "default", label: "Draft" },
  submitted:          { color: "blue",    label: "AGM Approved · Hold" },
  verified:           { color: "cyan",    label: "GM Approved · Hold" },
  approved:           { color: "gold",    label: "Accounts Verified · Hold" },
  "payment-initiated":{ color: "geekblue",label: "Payment Initiated · Hold" },
  rejected:           { color: "red",     label: "Rejected" },
  paid:               { color: "purple",  label: "Paid" },
};

// ── Bill action card ──────────────────────────────────────────
function BillCard({
  bill, showVerify, showApprove, showInitiate, showReject = true, onAction,
}: {
  bill: Bill; showVerify?: boolean; showApprove?: boolean; showInitiate?: boolean; showReject?: boolean;
  onAction: (bill: Bill, type: ActionType) => void;
}) {
  const { gross, net } = calcAmounts(bill);
  return (
    <div
      style={{
        background: "var(--nx-white)", border: "1px solid #e4e7ee", borderRadius: 12,
        padding: 16, marginBottom: 10, display: "flex", alignItems: "flex-start",
        gap: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", transition: "border-color 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#f8c9a0"; e.currentTarget.style.boxShadow = "0 3px 10px rgba(243,121,22,0.08)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#e4e7ee"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#f37916", fontSize: 14 }}>
            {bill.billNo}
          </span>
          {bill.workOrderNo && (
            <Tag color="orange" style={{ fontFamily: "monospace", marginLeft: 0 }}>{bill.workOrderNo}</Tag>
          )}
          <Tag color={STATUS_CFG[bill.status].color} style={{ marginLeft: 0 }}>
            {STATUS_CFG[bill.status].label.toUpperCase()}
          </Tag>
        </div>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--nx-text)" }}>{bill.vendorName || "—"}</div>
        <div style={{ fontSize: 11, color: "#5a6278", marginTop: 2 }}>
          {bill.projectName}
          {bill.billRefNo && ` · Ref: ${bill.billRefNo}`}
        </div>
        <div style={{ fontSize: 11, color: "#9ba3b8", marginTop: 3 }}>
          {dayjs(bill.billDate).format("DD MMM YYYY")}
          {bill.submittedAt && ` · Submitted ${dayjs(bill.submittedAt).format("DD MMM YYYY")}`}
        </div>
        {bill.remarks && (
          <div style={{ fontSize: 11, color: "#9ba3b8", marginTop: 3, fontStyle: "italic" }}>{bill.remarks}</div>
        )}
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {showVerify && (
            <Button size="small" icon={<CheckOutlined />}
              style={{ background: "#16a85a", borderColor: "#16a85a", color: "#fff" }}
              onClick={() => onAction(bill, "verify")}
            >GM Approve</Button>
          )}
          {showApprove && (
            <Button size="small" icon={<SafetyCertificateOutlined />} type="primary"
              style={{ background: "#f37916", borderColor: "#f37916" }}
              onClick={() => onAction(bill, "approve")}
            >Verify & Approve</Button>
          )}
          {showInitiate && (
            <Button size="small" type="primary"
              style={{ background: "#3730a3", borderColor: "#3730a3" }}
              onClick={() => onAction(bill, "initiate")}
            >Initiate Payment</Button>
          )}
          {showReject && (
            <Button size="small" icon={<CloseOutlined />} danger onClick={() => onAction(bill, "reject")}>
              Reject
            </Button>
          )}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "#f37916" }}>
          {fmt(gross)}
        </div>
        <div style={{ fontSize: 10, color: "#9ba3b8" }}>incl. GST</div>
        <div style={{ fontFamily: "monospace", fontSize: 13, color: "#16a85a", fontWeight: 600, marginTop: 6 }}>
          {fmt(net)}
        </div>
        <div style={{ fontSize: 10, color: "#9ba3b8" }}>net payable</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function Approvals() {
  const { user } = useAuth();
  const canGM       = user?.role === "owner" || user?.role === "gm";
  const canAccounts = user?.role === "owner" || user?.role === "accounts";

  const [bills, setBills]       = useState<Bill[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [activeTab, setActiveTab] = useState("queue");
  const [actionBill, setActionBill] = useState<Bill | null>(null);
  const [actionType, setActionType] = useState<ActionType>("verify");
  const [modalOpen, setModalOpen]   = useState(false);
  const [remarks, setRemarks]       = useState("");
  const [tdsAmount, setTdsAmount]   = useState<number | null>(null);
  // GM can see + optionally overwrite the hold/retention and advance figures
  // AGM set at approval time — left as AGM's value unless GM actually edits it.
  const [verifyRetention, setVerifyRetention] = useState<number | null>(null);
  const [verifyAdvance,   setVerifyAdvance]   = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dateFrom, setDateFrom]     = useState<Dayjs | null>(null);
  const [dateTo, setDateTo]         = useState<Dayjs | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.get("/bills");
      setBills(res.data.bills ?? []);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to load bills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredByDate  = bills.filter(b => inDateRange(b.billDate, dateFrom, dateTo));
  const submitted       = filteredByDate.filter(b => b.status === "submitted");
  const verified        = filteredByDate.filter(b => b.status === "verified");
  const readyToInitiate = filteredByDate.filter(b => b.status === "approved");
  const initiated       = filteredByDate.filter(b => b.status === "payment-initiated");
  const approved        = filteredByDate.filter(b => b.status === "approved" || b.status === "payment-initiated" || b.status === "paid");
  const rejected        = filteredByDate.filter(b => b.status === "rejected");
  const totalPending    = submitted.length + verified.length + readyToInitiate.length;

  function openAction(bill: Bill, type: ActionType) {
    setActionBill(bill);
    setActionType(type);
    setRemarks("");
    setTdsAmount(null);
    setVerifyRetention(bill.retentionAmount ?? null);
    setVerifyAdvance(bill.advanceRecovery ?? null);
    setModalOpen(true);
  }

  async function executeAction() {
    if (!actionBill || actionType === "view") return;
    setSubmitting(true);
    try {
      const endpoint = actionType === "verify" ? "verify"
                     : actionType === "approve" ? "approve"
                     : actionType === "initiate" ? "initiate-payment"
                     : "reject";
      const body = actionType === "reject"
        ? { reason: remarks || "No reason given" }
        : actionType === "initiate"
        ? { tdsAmount: tdsAmount ?? 0, remarks }
        : actionType === "verify"
        ? { remarks, retentionAmount: verifyRetention, advanceRecovery: verifyAdvance }
        : { remarks };
      await apiClient.patch(`/bills/${actionBill._id}/${endpoint}`, body);
      const msgs: Partial<Record<ActionType, string>> = {
        verify:   "GM approved — forwarded to Accounts for verification",
        approve:  "Accounts verified & approved — ready for payment initiation",
        initiate: "Payment initiated — on hold pending release",
        reject:   "Bill rejected",
      };
      message.success(msgs[actionType]);
      setModalOpen(false);
      await load();
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message || "Action failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
        <Spin size="large" tip="Loading approvals…" />
      </div>
    );
  }

  if (error) return <Alert type="error" message={error} style={{ margin: 24 }} />;

  const allBillsSorted = [...bills].sort((a, b) =>
    (b.billDate || "").localeCompare(a.billDate || "")
  );

  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "var(--nx-text)" }}>Approvals</h1>
          <p style={{ color: "#5a6278", marginTop: 4, marginBottom: 0, fontSize: 13 }}>
            Review and action running bills through the verification → approval workflow.
          </p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </div>

      {/* Stats row */}
      <Row gutter={12} style={{ marginBottom: 24 }}>
        {[
          { label: "Pending Action", value: totalPending, color: "#f37916", sub: "bills awaiting review" },
          { label: "Needs GM Approval", value: submitted.length, color: "#2563eb", sub: "AGM approved, awaiting GM" },
          { label: "Needs Accounts Verification", value: verified.length, color: "#0d9488", sub: "GM approved, awaiting Accounts" },
          { label: "Ready to Initiate Payment", value: readyToInitiate.length, color: "#3730a3", sub: "verified, awaiting TDS entry" },
        ].map(s => (
          <Col key={s.label} xs={12} sm={6}>
            <div style={{ background: "var(--nx-white)", border: "1px solid #e4e7ee", borderRadius: 12, padding: "16px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ba3b8", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#5a6278", marginTop: 3 }}>{s.sub}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Date filter */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
        <span style={{ color: "#9ba3b8", fontSize: 12 }}>
          {filteredByDate.length} bill{filteredByDate.length !== 1 ? "s" : ""}
        </span>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "queue",
            label: `Action Queue${totalPending ? ` (${totalPending})` : ""}`,
            children: (
              <>
                {/* Pending GM Approval */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#5a6278", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Pending GM Approval
                    </span>
                    <span style={{ background: "#eff4ff", color: "#2563eb", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                      {submitted.length}
                    </span>
                  </div>
                  {submitted.length === 0
                    ? <Empty description="No bills pending GM approval" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    : submitted.map(b => (
                        <BillCard key={b._id} bill={b} showVerify={canGM} onAction={openAction} />
                      ))
                  }
                </div>

                <div style={{ height: 1, background: "#e4e7ee", margin: "24px 0" }} />

                {/* Pending Accounts Verification */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#5a6278", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Pending Accounts Verification
                    </span>
                    <span style={{ background: "#e8fff8", color: "#0d9488", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                      {verified.length}
                    </span>
                  </div>
                  {verified.length === 0
                    ? <Empty description="No bills pending Accounts verification" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    : verified.map(b => (
                        <BillCard key={b._id} bill={b} showApprove={canAccounts} onAction={openAction} />
                      ))
                  }
                </div>

                <div style={{ height: 1, background: "#e4e7ee", margin: "24px 0" }} />

                {/* Ready to Initiate Payment */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#5a6278", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Ready to Initiate Payment
                    </span>
                    <span style={{ background: "#eef2ff", color: "#3730a3", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                      {readyToInitiate.length}
                    </span>
                  </div>
                  {readyToInitiate.length === 0
                    ? <Empty description="No bills ready for payment initiation" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    : readyToInitiate.map(b => (
                        <BillCard key={b._id} bill={b} showInitiate={canAccounts} onAction={openAction} />
                      ))
                  }
                </div>

                {initiated.length > 0 && (
                  <>
                    <div style={{ height: 1, background: "#e4e7ee", margin: "24px 0" }} />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#5a6278", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Payment Initiated — Awaiting Release
                        </span>
                        <span style={{ background: "#eef2ff", color: "#3730a3", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                          {initiated.length}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 10 }}>
                        TDS has been entered — release the payment from the Billing & Payments page.
                      </div>
                      {initiated.map(b => (
                        <BillCard key={b._id} bill={b} showReject={false} onAction={openAction} />
                      ))}
                    </div>
                  </>
                )}

                {totalPending === 0 && (
                  <div style={{ textAlign: "center", padding: "48px 20px", color: "#9ba3b8" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                    <div style={{ fontSize: 14, color: "#5a6278", fontWeight: 600 }}>All clear!</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>No bills pending your action right now.</div>
                  </div>
                )}
              </>
            ),
          },
          {
            key: "approved",
            label: `Approved / Paid (${approved.length})`,
            children: approved.length === 0
              ? <Empty description="No approved bills yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              : approved.map(b => <BillCard key={b._id} bill={b} showReject={b.status !== "paid"} onAction={openAction} />),
          },
          {
            key: "rejected",
            label: `Rejected (${rejected.length})`,
            children: rejected.length === 0
              ? <Empty description="No rejected bills" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              : rejected.map(b => (
                  <div key={b._id} style={{ background: "var(--nx-white)", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#f37916" }}>{b.billNo}</span>
                        {" "}<Tag color="red">REJECTED</Tag>
                        <div style={{ fontSize: 12, color: "#5a6278", marginTop: 4 }}>{b.vendorName} · {b.projectName}</div>
                        {b.rejectReason && (
                          <div style={{ fontSize: 12, color: "#e03b3b", marginTop: 6, background: "#fef2f2", padding: "6px 10px", borderRadius: 6 }}>
                            Reason: {b.rejectReason}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "monospace", fontWeight: 700, color: "#9ba3b8" }}>{fmt(calcAmounts(b).gross)}</div>
                        <div style={{ fontSize: 11, color: "#9ba3b8" }}>{dayjs(b.billDate).format("DD MMM YYYY")}</div>
                      </div>
                    </div>
                  </div>
                )),
          },
          {
            key: "history",
            label: "All Bills",
            children: (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f5f6f8" }}>
                      {["Bill No.", "Date", "Work Order", "Vendor", "Gross (incl. GST)", "Net Payable", "Status", "Approval Stages", ""].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ba3b8", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e4e7ee", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allBillsSorted.map(b => {
                      const { gross, net } = calcAmounts(b);
                      return (
                        <tr key={b._id} style={{ borderBottom: "1px solid #f0f0f0" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#fffaf6")}
                          onMouseLeave={e => (e.currentTarget.style.background = "")}
                        >
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#f37916", fontWeight: 600 }}>{b.billNo}</td>
                          <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{dayjs(b.billDate).format("DD MMM YYYY")}</td>
                          <td style={{ padding: "10px 12px" }}>
                            {b.workOrderNo ? <Tag color="orange" style={{ fontFamily: "monospace" }}>{b.workOrderNo}</Tag> : <span style={{ color: "#9ba3b8" }}>—</span>}
                          </td>
                          <td style={{ padding: "10px 12px" }}>{b.vendorName || "—"}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#f37916" }}>{fmt(gross)}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#16a85a", fontWeight: 600 }}>{fmt(net)}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <Tag color={STATUS_CFG[b.status].color}>{STATUS_CFG[b.status].label.toUpperCase()}</Tag>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            {b.rejectedBy ? (
                              <span style={{ color: "#e03b3b", fontSize: 12 }}>Rejected by {typeof b.rejectedBy === "object" ? b.rejectedBy.name : b.rejectedBy}{b.rejectReason ? ` — ${b.rejectReason}` : ""}</span>
                            ) : (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {[
                                  { label: "AGM", done: !!b.agmApprovedBy },
                                  { label: "GM", done: !!b.verifiedBy },
                                  { label: "Accounts", done: !!b.approvedBy },
                                  { label: "Initiated", done: !!b.paymentInitiatedBy },
                                  { label: "Paid", done: b.status === "paid" },
                                ].map(s => (
                                  <span key={s.label} style={{
                                    fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                                    background: s.done ? "#f0fdf4" : "#f5f6f8",
                                    color: s.done ? "#16a85a" : "#9ba3b8",
                                    border: `1px solid ${s.done ? "#bbf7d0" : "#e4e7ee"}`,
                                  }}>
                                    {s.done ? "✓ " : ""}{s.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <Button size="small" onClick={() => openAction(b, "view")}>View</Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {allBillsSorted.length === 0 && (
                  <Empty description="No bills yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: "40px 0" }} />
                )}
              </div>
            ),
          },
        ]}
      />

      {/* Action Modal */}
      <Modal
        open={modalOpen}
        title={
          actionType === "verify" ? "GM Approval"
          : actionType === "approve" ? "Accounts Verification & Approval"
          : actionType === "initiate" ? "Initiate Payment — Accounts"
          : actionType === "view" ? "Bill Details"
          : "Reject Bill"
        }
        onCancel={() => setModalOpen(false)}
        onOk={actionType === "view" ? () => setModalOpen(false) : executeAction}
        okText={
          actionType === "verify" ? "✓  GM Approve"
          : actionType === "approve" ? "✓  Verify & Approve"
          : actionType === "initiate" ? "Initiate Payment"
          : actionType === "view" ? "Close"
          : "✗  Reject Bill"
        }
        cancelButtonProps={actionType === "view" ? { style: { display: "none" } } : undefined}
        confirmLoading={submitting}
        okButtonProps={{
          style: actionType === "reject"
            ? { background: "#e03b3b", borderColor: "#e03b3b" }
            : actionType === "approve"
            ? { background: "#f37916", borderColor: "#f37916" }
            : actionType === "initiate"
            ? { background: "#3730a3", borderColor: "#3730a3" }
            : actionType === "view"
            ? {}
            : { background: "#16a85a", borderColor: "#16a85a" },
        }}
        destroyOnHidden
        width={480}
      >
        {actionBill && (() => {
          const { gstAmt, gross, tdsAmt, retention, advance, net } = calcAmounts(actionBill);
          return (
            <>
              <Descriptions size="small" column={1} style={{ marginBottom: 16, marginTop: 8 }}>
                <Descriptions.Item label="Bill No.">
                  <span style={{ fontFamily: "monospace", color: "#f37916", fontWeight: 600 }}>{actionBill.billNo}</span>
                </Descriptions.Item>
                {actionBill.workOrderNo && (
                  <Descriptions.Item label="Work Order">
                    <Tag color="orange" style={{ fontFamily: "monospace" }}>{actionBill.workOrderNo}</Tag>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Vendor">{actionBill.vendorName}</Descriptions.Item>
                <Descriptions.Item label="Project">{actionBill.projectName}</Descriptions.Item>
                <Descriptions.Item label="Date">{dayjs(actionBill.billDate).format("DD MMM YYYY")}</Descriptions.Item>
                {actionBill.remarks && (
                  <Descriptions.Item label="Remarks">{actionBill.remarks}</Descriptions.Item>
                )}
              </Descriptions>

              {/* Financial breakdown */}
              <div style={{ background: "#fff8f3", border: "1px solid #f8c9a0", borderRadius: 10, padding: "14px 16px", marginBottom: 16, fontFamily: "monospace", fontSize: 13 }}>
                {[
                  { label: "Base Amount",              value: fmt(actionBill.amount), color: "#5a6278" },
                  { label: `GST @ ${actionBill.gstPercent ?? 18}%`, value: `+ ${fmt(gstAmt)}`, color: "#16a34a" },
                  { label: "Gross Amount",             value: fmt(gross),   color: "#d4620c", bold: true },
                  { label: `TDS @ ${actionBill.tdsPercent ?? 1}%`,  value: `(${fmt(tdsAmt)})`, color: "#dc2626" },
                  ...(retention > 0 ? [{ label: "Retention Held",  value: `(${fmt(retention)})`, color: "#dc2626" }] : []),
                  ...(advance > 0 ? [{ label: "Advance Recovered", value: `(${fmt(advance)})`, color: "#dc2626" }] : []),
                ].map(r => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", color: r.color, fontWeight: r.bold ? 700 : 400, borderTop: r.bold ? "1px solid #f8c9a0" : undefined, marginTop: r.bold ? 4 : 0, paddingTop: r.bold ? 8 : 4 }}>
                    <span>{r.label}</span><span>{r.value}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", borderTop: "1px solid #f8c9a0", marginTop: 4, color: "#16a85a", fontWeight: 700, fontSize: 14 }}>
                  <span>NET PAYABLE</span><span>{fmt(net)}</span>
                </div>
              </div>

              {/* Line items if present */}
              {actionBill.lineItems && actionBill.lineItems.length > 0 && (
                <div style={{ marginBottom: 16, overflowX: "auto" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9ba3b8", textTransform: "uppercase", marginBottom: 6 }}>Work Items</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f5f6f8" }}>
                        {["Description", "Unit", "Qty", "Rate", "Amount"].map(h => (
                          <th key={h} style={{ padding: "6px 8px", textAlign: h === "Description" ? "left" : "right", fontSize: 10, fontWeight: 600, color: "#9ba3b8", borderBottom: "1px solid #e4e7ee" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {actionBill.lineItems.map((li, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "6px 8px" }}>{li.description}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", color: "#9ba3b8" }}>{li.unit}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>{li.billedQty?.toLocaleString("en-IN")}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>₹{li.rate?.toLocaleString("en-IN")}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: "#f37916" }}>{fmt(li.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {actionType === "verify" && (
                <div style={{ marginBottom: 12, padding: "10px 12px", background: "#FFF8F3", border: "1px solid #f8c9a0", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 8 }}>
                    {actionBill.agmApprovedBy?.name
                      ? <>Set by AGM — <strong style={{ color: "#374151" }}>{actionBill.agmApprovedBy.name}</strong>. You can leave as-is or overwrite before approving.</>
                      : "No AGM figures on record — enter if needed."}
                  </div>
                  <Row gutter={10}>
                    <Col span={12}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Hold / Retention (₹)</div>
                      <InputNumber style={{ width: "100%" }} min={0} value={verifyRetention} onChange={setVerifyRetention} />
                    </Col>
                    <Col span={12}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Advance Recovery (₹)</div>
                      <InputNumber style={{ width: "100%" }} min={0} value={verifyAdvance} onChange={setVerifyAdvance} />
                    </Col>
                  </Row>
                </div>
              )}

              {actionType === "initiate" && (
                <Form.Item label="TDS Amount to Deduct (₹)" style={{ marginBottom: 12 }}>
                  <InputNumber
                    style={{ width: "100%" }} min={0}
                    placeholder="0"
                    value={tdsAmount}
                    onChange={v => setTdsAmount(v)}
                  />
                  <div style={{ fontSize: 11, color: "#9ba3b8", marginTop: 4 }}>
                    The bill will go on hold until Accounts releases the payment.
                  </div>
                </Form.Item>
              )}

              {actionType !== "view" && (
                <Form.Item label="Remarks" style={{ marginBottom: 0 }} required={actionType === "reject"}>
                  <Input.TextArea
                    rows={2}
                    placeholder={actionType === "reject" ? "Reason for rejection…" : "Add remarks or conditions (optional)…"}
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                  />
                </Form.Item>
              )}
            </>
          );
        })()}
      </Modal>
    </div>
  );
}
