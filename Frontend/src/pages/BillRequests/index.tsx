import { useState, useEffect } from "react";
import {
  Button, Tag, Table, Modal, Input, InputNumber, message, Popconfirm, Spin, Empty, Tabs, Badge,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckCircleOutlined, CloseCircleOutlined, EyeOutlined, TrophyOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

const STATUS_CFG: Record<string, { color: string; label: string }> = {
  pending:  { color: "orange", label: "Pending"  },
  approved: { color: "green",  label: "Approved" },
  rejected: { color: "red",    label: "Rejected" },
};

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
  projectName: string;
  vendorName: string;
  category: string;
  subCategory: string;
  items: BillItem[];
  remarks: string;
  periodFrom?: string;
  periodTo?: string;
  status: "pending" | "approved" | "rejected";
  rejectReason?: string;
  requestedBy?: { name: string; email: string };
  billId?: { billNo: string; status: string; amount: number; paidAmount?: number; paymentDate?: string };
  milestoneAchieved?: boolean;
  milestoneDate?: string;
  createdAt: string;
}

export default function BillRequests() {
  const navigate = useNavigate();
  const [requests,      setRequests]      = useState<BillRequest[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [tab,           setTab]           = useState("pending");

  const [viewReq,       setViewReq]       = useState<BillRequest | null>(null);
  const [rejectModal,   setRejectModal]   = useState(false);
  const [rejectTarget,  setRejectTarget]  = useState<string | null>(null);
  const [rejectReason,  setRejectReason]  = useState("");
  const [saving,        setSaving]        = useState(false);

  const [milestoneTarget, setMilestoneTarget] = useState<string | null>(null);
  const [paymentUTR,      setPaymentUTR]      = useState("");
  const [utrModal,        setUTRModal]        = useState(false);

  const [paymentAmount,   setPaymentAmount]   = useState<number | null>(null);
  const [milestoneReq,    setMilestoneReq]    = useState<BillRequest | null>(null);

  const load = async (status?: string) => {
    setLoading(true);
    try {
      const params = status && status !== "all" ? `?status=${status}` : "";
      const res = await apiClient.get(`/bill-requests${params}`);
      setRequests(res.data.billRequests ?? []);
    } catch { message.error("Failed to load bill requests"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(tab === "all" ? undefined : tab); }, [tab]);

  const handleApprove = async (id: string) => {
    setSaving(true);
    try {
      const res = await apiClient.put(`/bill-requests/${id}/approve`, {});
      message.success(res.data.message || "Approved & bill generated");
      load(tab === "all" ? undefined : tab);
      if (viewReq?._id === id) setViewReq(null);
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to approve");
    } finally { setSaving(false); }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setSaving(true);
    try {
      await apiClient.put(`/bill-requests/${rejectTarget}/reject`, { rejectReason });
      message.success("Request rejected");
      setRejectModal(false);
      setRejectReason("");
      setRejectTarget(null);
      load(tab === "all" ? undefined : tab);
      if (viewReq?._id === rejectTarget) setViewReq(null);
    } catch { message.error("Failed to reject"); }
    finally { setSaving(false); }
  };

  const handleMilestone = async () => {
    if (!milestoneTarget) return;
    setSaving(true);
    try {
      const billAmt = milestoneReq?.billId?.amount ?? null;
      const body: Record<string, unknown> = {};
      if (paymentUTR) body.paymentUTR = paymentUTR;
      if (paymentAmount != null && paymentAmount !== billAmt) body.paidAmount = paymentAmount;
      const res = await apiClient.put(`/bill-requests/${milestoneTarget}/milestone`, body);
      message.success(res.data?.message || "Milestone marked!");
      setUTRModal(false);
      setMilestoneTarget(null);
      setPaymentUTR("");
      setPaymentAmount(null);
      setMilestoneReq(null);
      load(tab === "all" ? undefined : tab);
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to mark milestone");
    } finally { setSaving(false); }
  };

  const columns: ColumnsType<BillRequest> = [
    {
      title: "Stage / Request",
      width: 140,
      render: (_, r) => (
        <div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {r.stageNo && (
              <span style={{ background: "#FFF4E8", border: "1px solid #FF7A00", color: "#FF7A00", fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 6 }}>
                S{r.stageNo}
              </span>
            )}
            <button
              type="button"
              onClick={() => setViewReq(r)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#FF7A00", fontWeight: 700, fontFamily: "monospace", fontSize: 13, padding: 0 }}
            >
              {r.reqNo}
            </button>
          </div>
          {r.milestoneAchieved && (
            <span style={{ fontSize: 10, color: "#FF7A00" }}>🏆 Milestone</span>
          )}
        </div>
      ),
    },
    { title: "Work Order", dataIndex: "workOrderNo", render: (v, r) => (
      <div>
        <code style={{ cursor: "pointer", color: "#3b82f6" }} onClick={() => r.workOrderId && navigate(`/work-items/${r.workOrderId}`)}>{v}</code>
      </div>
    )},
    { title: "Project",    dataIndex: "projectName" },
    { title: "Contractor", dataIndex: "vendorName"  },
    {
      title: "Period",
      render: (_, r) => r.periodFrom ? (
        <div style={{ fontSize: 12, color: "#6B7280" }}>
          {dayjs(r.periodFrom).format("DD MMM")} → {dayjs(r.periodTo ?? r.createdAt).format("DD MMM YYYY")}
        </div>
      ) : <span style={{ color: "#9CA3AF" }}>—</span>,
    },
    {
      title: "Items",
      dataIndex: "items",
      render: (items: BillItem[]) => <span>{items.length} item{items.length !== 1 ? "s" : ""}</span>,
    },
    {
      title: "Requested By",
      dataIndex: "requestedBy",
      render: (u) => u?.name || "—",
    },
    {
      title: "Date",
      dataIndex: "createdAt",
      render: (d) => dayjs(d).format("DD MMM YYYY"),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (s: string) => {
        const cfg = STATUS_CFG[s] ?? { color: "default", label: s };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: "Actions",
      render: (_, r) => (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setViewReq(r)}>View</Button>
          {r.status === "pending" && (
            <>
              <Popconfirm
                title="Approve this bill request?"
                description="A running bill will be auto-generated."
                onConfirm={() => handleApprove(r._id)}
                okText="Approve"
              >
                <Button size="small" type="primary" icon={<CheckCircleOutlined />} loading={saving}>Approve</Button>
              </Popconfirm>
              <Button
                size="small" danger icon={<CloseCircleOutlined />}
                onClick={() => { setRejectTarget(r._id); setRejectModal(true); }}
              >
                Reject
              </Button>
            </>
          )}
          {r.status === "approved" && !r.milestoneAchieved && (
            <Button
              size="small"
              icon={<TrophyOutlined />}
              style={{ color: "#FF7A00", borderColor: "#FF7A00" }}
              onClick={() => { setMilestoneTarget(r._id); setMilestoneReq(r); setPaymentUTR(""); setPaymentAmount(r.billId?.amount ?? null); setUTRModal(true); }}
            >
              Release Payment
            </Button>
          )}
        </div>
      ),
    },
  ];

  const filtered = tab === "all" ? requests : requests.filter(r => r.status === tab);
  const viewTotal = viewReq ? viewReq.items.reduce((s, it) => s + (it.rate ?? 0) * it.billedQty, 0) : 0;

  return (
    <PageShell
      title="Bill Requests"
      description="DRI payment requests reviewed and converted to running bills."
    >
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "pending",  label: <span>Pending {requests.filter(r => r.status === "pending").length > 0 && <Badge count={requests.filter(r => r.status === "pending").length} style={{ background: "#f59e0b" }} />}</span>  },
          { key: "approved", label: "Approved" },
          { key: "rejected", label: "Rejected" },
          { key: "all",      label: "All"      },
        ]}
        style={{ marginBottom: 16 }}
      />

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div>
      ) : filtered.length === 0 ? (
        <Empty description={`No ${tab === "all" ? "" : tab} bill requests`} />
      ) : (
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="_id"
          size="middle"
          pagination={{ pageSize: 20 }}
        />
      )}

      {/* View / Approve Modal */}
      <Modal
        open={!!viewReq}
        onCancel={() => setViewReq(null)}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Bill Request — {viewReq?.reqNo}</span>
            {viewReq?.stageNo && (
              <span style={{ background: "#FFF4E8", border: "1px solid #FF7A00", color: "#FF7A00", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 6 }}>
                Stage {viewReq.stageNo}
              </span>
            )}
            {viewReq?.milestoneAchieved && (
              <span style={{ background: "#FF7A00", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>
                🏆 Milestone
              </span>
            )}
          </div>
        }
        width={720}
        footer={
          viewReq?.status === "pending" ? (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button onClick={() => setViewReq(null)}>Close</Button>
              <Button danger onClick={() => { setRejectTarget(viewReq._id); setRejectModal(true); setViewReq(null); }}>Reject</Button>
              <Popconfirm title="Approve & generate running bill?" onConfirm={() => handleApprove(viewReq._id)} okText="Confirm">
                <Button type="primary" loading={saving}>Approve & Generate Bill</Button>
              </Popconfirm>
            </div>
          ) : viewReq?.status === "approved" && !viewReq?.milestoneAchieved ? (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button onClick={() => setViewReq(null)}>Close</Button>
              <Button
                type="primary"
                icon={<TrophyOutlined />}
                style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
                onClick={() => { setMilestoneTarget(viewReq._id); setMilestoneReq(viewReq); setPaymentUTR(""); setPaymentAmount(viewReq.billId?.amount ?? null); setUTRModal(true); setViewReq(null); }}
              >
                Release Payment — Mark Milestone
              </Button>
            </div>
          ) : (
            <Button onClick={() => setViewReq(null)}>Close</Button>
          )
        }
      >
        {viewReq && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Header info */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "#f9fafb", padding: 14, borderRadius: 8 }}>
              {[
                ["Work Order",    viewReq.workOrderNo],
                ["Project",       viewReq.projectName],
                ["Contractor",    viewReq.vendorName],
                ["Category",      [viewReq.category, viewReq.subCategory].filter(Boolean).join(" › ")],
                ["Requested By",  viewReq.requestedBy?.name || "—"],
                ["Date",          dayjs(viewReq.createdAt).format("DD MMM YYYY")],
                ...(viewReq.periodFrom ? [["Period", `${dayjs(viewReq.periodFrom).format("DD MMM YYYY")} → ${dayjs(viewReq.periodTo ?? viewReq.createdAt).format("DD MMM YYYY")}`]] : []),
                ...(viewReq.billId ? [["Bill No.", viewReq.billId.billNo + " — " + fmt(viewReq.billId.amount)]] : []),
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
                  {viewReq.items.map((it, i) => {
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
                      <td colSpan={4} style={{ padding: "8px 10px", fontWeight: 700, textAlign: "right", color: "#FF7A00" }}>Total</td>
                      <td style={{ padding: "8px 10px", fontWeight: 700, color: "#111827", textAlign: "right" }}>{fmt(viewTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {viewReq.remarks && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: 10, fontSize: 13 }}>
                <strong>Remarks:</strong> {viewReq.remarks}
              </div>
            )}

            {viewReq.status === "approved" && viewReq.billId && (
              <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, padding: 10, fontSize: 13 }}>
                <strong>Running Bill Generated:</strong> {viewReq.billId.billNo} — {fmt(viewReq.billId.amount)}
                {viewReq.billId.paidAmount != null && viewReq.billId.paidAmount !== viewReq.billId.amount && (
                  <div style={{ marginTop: 4, color: "#374151" }}>
                    <strong>Actual Paid:</strong>{" "}
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#16a34a" }}>
                      {fmt(viewReq.billId.paidAmount)}
                    </span>
                    <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: 6 }}>
                      (billed: {fmt(viewReq.billId.amount)})
                    </span>
                  </div>
                )}
                {viewReq.milestoneAchieved && viewReq.milestoneDate && (
                  <div style={{ marginTop: 4, color: "#FF7A00" }}>
                    🏆 Payment Released: {dayjs(viewReq.milestoneDate).format("DD MMM YYYY")}
                  </div>
                )}
              </div>
            )}

            {viewReq.status === "rejected" && viewReq.rejectReason && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: 10, fontSize: 13 }}>
                <strong>Reject Reason:</strong> {viewReq.rejectReason}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal
        open={rejectModal}
        onCancel={() => { setRejectModal(false); setRejectReason(""); setRejectTarget(null); }}
        onOk={handleReject}
        title="Reject Bill Request"
        okText="Confirm Rejection"
        okButtonProps={{ danger: true, loading: saving }}
      >
        <Input.TextArea
          rows={3}
          placeholder="Reason for rejection (optional)"
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
        />
      </Modal>

      {/* Release Payment / Milestone Modal */}
      <Modal
        open={utrModal}
        onCancel={() => { setUTRModal(false); setMilestoneTarget(null); setPaymentUTR(""); setPaymentAmount(null); setMilestoneReq(null); }}
        onOk={handleMilestone}
        title="Release Payment — Mark Milestone"
        okText="Confirm Payment Released"
        okButtonProps={{ loading: saving, style: { background: "#FF7A00", borderColor: "#FF7A00" } }}
        destroyOnClose
      >
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: 12, background: "#FFF4E8", border: "1px solid #FED7AA", borderRadius: 8, fontSize: 13, color: "#92400e" }}>
            This will mark the stage as <strong>Milestone Achieved</strong> and update the bill status to <strong>Paid</strong>.
          </div>

          {milestoneReq?.billId?.amount != null && (
            <div style={{ background: "#f9fafb", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 2 }}>Billed Amount (calculated)</div>
              <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 16, color: "#374151" }}>
                {fmt(milestoneReq.billId.amount)}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
              Actual Amount Released
            </div>
            <InputNumber
              style={{ width: "100%" }}
              prefix="₹"
              value={paymentAmount}
              onChange={v => setPaymentAmount(v)}
              min={0}
              step={1}
              precision={0}
              placeholder="Enter actual payment amount"
            />
            {milestoneReq?.billId?.amount != null && paymentAmount != null && paymentAmount !== milestoneReq.billId.amount && (
              <div style={{ fontSize: 12, color: "#d97706", marginTop: 6 }}>
                Difference: {paymentAmount < milestoneReq.billId.amount ? "−" : "+"}{fmt(Math.abs(paymentAmount - milestoneReq.billId.amount))} from billed amount
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Payment UTR / Reference (optional)</div>
            <Input placeholder="e.g. UTR123456789" value={paymentUTR} onChange={e => setPaymentUTR(e.target.value)} />
          </div>
        </div>
      </Modal>
    </PageShell>
  );
}
