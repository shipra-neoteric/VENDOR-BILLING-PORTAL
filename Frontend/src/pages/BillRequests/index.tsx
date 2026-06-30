import { useState, useEffect } from "react";
import {
  Button, Tag, Table, Modal, Input, message, Popconfirm, Spin, Empty, Tabs,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckCircleOutlined, CloseCircleOutlined, EyeOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

const STATUS_CFG: Record<string, { color: string; label: string }> = {
  pending:  { color: "orange",  label: "Pending"  },
  approved: { color: "green",   label: "Approved" },
  rejected: { color: "red",     label: "Rejected" },
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
  workOrderNo: string;
  projectName: string;
  vendorName: string;
  category: string;
  subCategory: string;
  items: BillItem[];
  remarks: string;
  status: "pending" | "approved" | "rejected";
  rejectReason?: string;
  requestedBy?: { name: string; email: string };
  billId?: { billNo: string; status: string; amount: number };
  createdAt: string;
}

export default function BillRequests() {
  const [requests, setRequests] = useState<BillRequest[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState("pending");

  const [viewReq,      setViewReq]      = useState<BillRequest | null>(null);
  const [rejectModal,  setRejectModal]  = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [saving,       setSaving]       = useState(false);

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

  const columns: ColumnsType<BillRequest> = [
    {
      title: "Request No",
      dataIndex: "reqNo",
      render: (v, r) => (
        <button
          type="button"
          onClick={() => setViewReq(r)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#FF7A00", fontWeight: 700, fontFamily: "monospace", fontSize: 13, padding: 0 }}
        >
          {v}
        </button>
      ),
    },
    { title: "Work Order", dataIndex: "workOrderNo", render: v => <code>{v}</code> },
    { title: "Project",    dataIndex: "projectName" },
    { title: "Contractor", dataIndex: "vendorName"  },
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
        <div style={{ display: "flex", gap: 6 }}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setViewReq(r)}>View</Button>
          {r.status === "pending" && (
            <>
              <Popconfirm
                title="Approve this bill request?"
                description="A running bill will be auto-generated."
                onConfirm={() => handleApprove(r._id)}
                okText="Approve"
              >
                <Button size="small" type="primary" icon={<CheckCircleOutlined />} loading={saving}>
                  Approve
                </Button>
              </Popconfirm>
              <Button
                size="small" danger icon={<CloseCircleOutlined />}
                onClick={() => { setRejectTarget(r._id); setRejectModal(true); }}
              >
                Reject
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const filtered = tab === "all" ? requests : requests.filter(r => r.status === tab);

  // Compute totals for view modal (using rate × qty)
  const viewTotal = viewReq
    ? viewReq.items.reduce((s, it) => s + (it.rate ?? 0) * it.billedQty, 0)
    : 0;

  return (
    <PageShell
      title="Bill Requests"
      description="DRI payment requests reviewed and converted to running bills."
    >
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "pending",  label: "Pending"  },
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
        title={`Bill Request — ${viewReq?.reqNo}`}
        width={700}
        footer={
          viewReq?.status === "pending" ? (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button onClick={() => setViewReq(null)}>Close</Button>
              <Button
                danger
                onClick={() => { setRejectTarget(viewReq._id); setRejectModal(true); setViewReq(null); }}
              >
                Reject
              </Button>
              <Popconfirm
                title="Approve & generate running bill?"
                onConfirm={() => handleApprove(viewReq._id)}
                okText="Confirm"
              >
                <Button type="primary" loading={saving}>Approve & Generate Bill</Button>
              </Popconfirm>
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
                ["Work Order", viewReq.workOrderNo],
                ["Project",    viewReq.projectName],
                ["Contractor", viewReq.vendorName],
                ["Category",   [viewReq.category, viewReq.subCategory].filter(Boolean).join(" › ")],
                ["Requested By", viewReq.requestedBy?.name || "—"],
                ["Date",       dayjs(viewReq.createdAt).format("DD MMM YYYY")],
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
                    {["Description", "Unit", "Qty (Billed)", "Rate", "Amount"].map(h => (
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
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>{it.billedQty.toLocaleString("en-IN")}</td>
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
    </PageShell>
  );
}
