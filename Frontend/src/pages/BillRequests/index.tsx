import { useState, useEffect } from "react";
import {
  Button, Tag, Table, Modal, Input, InputNumber, message, Popconfirm, Spin, Empty, Tabs, Badge, Select, Switch,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckCircleOutlined, CloseCircleOutlined, EyeOutlined, TrophyOutlined, InboxOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import { selectableProjects } from "../../utils/projectOptions";
import { useAuth } from "../../context/AuthContext";
import WorkflowInstanceStepper from "../../components/WorkflowInstanceStepper";
import type { WorkflowInstance } from "../../types/Workflow";

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
  projectId?: string;
  projectName: string;
  projectLocation?: string;
  vendorCode?: string;
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
  billId?: { billNo: string; status: string; amount: number; paidAmount?: number; retentionPercent?: number; retentionAmount?: number; advanceRecovery?: number; gstPercent?: number; tdsAmount?: number; paymentDate?: string; paymentMode?: string; paymentUTR?: string; paymentBank?: string; paymentReleasedBy?: string };
  milestoneAchieved?: boolean;
  milestoneDate?: string;
  createdAt: string;
  isArchived?: boolean;
  archivedAt?: string;
}

export default function BillRequests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [requests,      setRequests]      = useState<BillRequest[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [tab,           setTab]           = useState("pending");

  const [viewReq,       setViewReq]       = useState<BillRequest | null>(null);
  const [slaInstance,   setSlaInstance]   = useState<WorkflowInstance | null>(null);
  const [rejectModal,   setRejectModal]   = useState(false);
  const [rejectTarget,  setRejectTarget]  = useState<string | null>(null);
  const [rejectReason,  setRejectReason]  = useState("");
  const [saving,        setSaving]        = useState(false);

  // AGM's approval — first stage of the bill chain: sets the hold/advance breakdown.
  const [approveModal,     setApproveModal]     = useState(false);
  const [approveTarget,    setApproveTarget]    = useState<string | null>(null);
  const [approveRetention, setApproveRetention] = useState<number | null>(null);
  const [approveAdvance,   setApproveAdvance]   = useState<number | null>(null);

  const [search,            setSearch]            = useState("");
  const [projectFilter,     setProjectFilter]     = useState<string | undefined>(undefined);
  const [projectOptions,    setProjectOptions]    = useState<{ label: string; value: string }[]>([]);
  const [showArchived,      setShowArchived]      = useState(false);
  const [selectedRowKeys,   setSelectedRowKeys]   = useState<string[]>([]);
  const [archiving,         setArchiving]         = useState(false);

  const load = async (status?: string, archived?: boolean) => {
    setLoading(true);
    setSelectedRowKeys([]);
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (archived) params.set("archived", "true");
      const qs = params.toString();
      const res = await apiClient.get(`/bill-requests${qs ? `?${qs}` : ""}`);
      setRequests(res.data.billRequests ?? []);
    } catch { message.error("Failed to load bill requests"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(tab === "all" ? undefined : tab, showArchived); }, [tab, showArchived]);

  useEffect(() => {
    apiClient.get("/projects")
      .then(res => setProjectOptions(
        selectableProjects((res.data.projects ?? []) as { _id: string; name: string; code: string; parentId?: string | null }[])
          .map(p => ({ label: `${p.name} (${p.code})`, value: p._id }))
      ))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!viewReq) { setSlaInstance(null); return; }
    apiClient.get("/workflows/instances", { params: { entityType: "BillRequest", entityId: viewReq._id } })
      .then(res => setSlaInstance(res.data.instances?.[0] ?? null))
      .catch(() => setSlaInstance(null));
  }, [viewReq]);

  const openApprove = (id: string) => {
    setApproveTarget(id);
    setApproveRetention(null);
    setApproveAdvance(null);
    setApproveModal(true);
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    setSaving(true);
    try {
      const body: Record<string, number> = {};
      if (approveRetention != null) body.retentionAmount = approveRetention;
      if (approveAdvance   != null) body.advanceRecovery = approveAdvance;
      const res = await apiClient.put(`/bill-requests/${approveTarget}/approve`, body);
      message.success(res.data.message || "Approved & bill generated");
      setApproveModal(false);
      setApproveTarget(null);
      load(tab === "all" ? undefined : tab, showArchived);
      if (viewReq?._id === approveTarget) setViewReq(null);
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
      load(tab === "all" ? undefined : tab, showArchived);
      if (viewReq?._id === rejectTarget) setViewReq(null);
    } catch { message.error("Failed to reject"); }
    finally { setSaving(false); }
  };

  async function archiveOne(r: BillRequest) {
    try {
      await apiClient.patch(`/bill-requests/${r._id}/${showArchived ? "unarchive" : "archive"}`);
      message.success(showArchived ? `${r.reqNo} unarchived` : `${r.reqNo} archived`);
      load(tab === "all" ? undefined : tab, showArchived);
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Action failed");
    }
  }

  async function archiveSelected() {
    if (selectedRowKeys.length === 0) return;
    setArchiving(true);
    try {
      await apiClient.patch(`/bill-requests/${showArchived ? "unarchive-bulk" : "archive-bulk"}`, { ids: selectedRowKeys });
      message.success(`${selectedRowKeys.length} request(s) ${showArchived ? "unarchived" : "archived"}`);
      load(tab === "all" ? undefined : tab, showArchived);
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Action failed");
    } finally {
      setArchiving(false);
    }
  }

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
    {
      title: "Project",
      dataIndex: "projectName",
      render: (name: string, r: BillRequest) => (
        <div>
          <div>{name}</div>
          {r.projectLocation && (
            <div style={{ fontSize: 11, color: "#9ba3b8" }}>{r.projectLocation}</div>
          )}
        </div>
      ),
    },
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
              <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => openApprove(r._id)}>Approve</Button>
              <Button
                size="small" danger icon={<CloseCircleOutlined />}
                onClick={() => { setRejectTarget(r._id); setRejectModal(true); }}
              >
                Reject
              </Button>
            </>
          )}
          <Popconfirm
            title={showArchived ? `Unarchive ${r.reqNo}?` : `Archive ${r.reqNo}?`}
            description={showArchived ? "It will reappear in the normal list." : "It will be hidden from the normal list (and its linked bill, if any), but not deleted."}
            onConfirm={() => archiveOne(r)}
          >
            <Button size="small" icon={<InboxOutlined />} style={{ color: "#6B7280" }}>
              {showArchived ? "Unarchive" : "Archive"}
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  const filtered = (() => {
    let byTab = tab === "all" ? requests : requests.filter(r => r.status === tab);
    if (projectFilter) byTab = byTab.filter(r => r.projectId === projectFilter);
    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(r =>
      r.reqNo.toLowerCase().includes(q) ||
      r.workOrderNo.toLowerCase().includes(q) ||
      r.vendorName.toLowerCase().includes(q) ||
      (r.vendorCode || "").toLowerCase().includes(q) ||
      r.projectName.toLowerCase().includes(q) ||
      (r.category || "").toLowerCase().includes(q)
    );
  })();
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

      <div style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Input
          allowClear
          placeholder="Search by request no, work order, contractor, vendor code or project…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 440, borderRadius: 8 }}
          prefix={<span style={{ color: "#9ca3af", marginRight: 4 }}>🔍</span>}
        />
        <Select
          allowClear
          showSearch
          placeholder="Filter by project…"
          value={projectFilter}
          onChange={setProjectFilter}
          options={projectOptions}
          filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
          style={{ minWidth: 240 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6B7280" }}>
          <Switch size="small" checked={showArchived} onChange={setShowArchived} />
          Show Archived
        </label>
        {selectedRowKeys.length > 0 && (
          <Popconfirm
            title={showArchived ? `Unarchive ${selectedRowKeys.length} request(s)?` : `Archive ${selectedRowKeys.length} request(s)?`}
            onConfirm={archiveSelected}
          >
            <Button icon={<InboxOutlined />} loading={archiving}>
              {showArchived ? "Unarchive" : "Archive"} Selected ({selectedRowKeys.length})
            </Button>
          </Popconfirm>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div>
      ) : filtered.length === 0 ? (
        <Empty description={search ? `No results for "${search}"` : `No ${tab === "all" ? "" : tab} bill requests`} />
      ) : (
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="_id"
          size="middle"
          pagination={{ pageSize: 20 }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as string[]),
          }}
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
              <Button type="primary" onClick={() => { openApprove(viewReq._id); setViewReq(null); }}>Approve & Generate Bill</Button>
            </div>
          ) : viewReq?.status === "approved" && !viewReq?.milestoneAchieved ? (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button onClick={() => setViewReq(null)}>Close</Button>
              <Button
                type="primary"
                icon={<TrophyOutlined />}
                style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
                onClick={() => { setViewReq(null); navigate("/accounts-payment"); }}
              >
                Manage in Accounts Payment →
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
                ["Project",       viewReq.projectLocation ? `${viewReq.projectName} — ${viewReq.projectLocation}` : viewReq.projectName],
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

            {slaInstance && (
              <WorkflowInstanceStepper
                instance={slaInstance}
                userRole={user?.role}
                userId={user?.id}
                onChanged={() => {
                  apiClient.get("/workflows/instances", { params: { entityType: "BillRequest", entityId: viewReq._id } })
                    .then(res => setSlaInstance(res.data.instances?.[0] ?? null))
                    .catch(() => {});
                }}
                compact
              />
            )}

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
                      <td colSpan={4} style={{ padding: "8px 10px", fontWeight: 700, textAlign: "right", color: "#FF7A00" }}>Gross Total</td>
                      <td style={{ padding: "8px 10px", fontWeight: 700, color: "#111827", textAlign: "right" }}>{fmt(viewTotal)}</td>
                    </tr>
                    {(viewReq?.billId?.retentionPercent ?? 0) > 0 && (
                      <tr style={{ background: "#fff1f2" }}>
                        <td colSpan={4} style={{ padding: "6px 10px", textAlign: "right", color: "#e03b3b", fontWeight: 600 }}>
                          Retention @ {viewReq!.billId!.retentionPercent}%
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", color: "#e03b3b", fontWeight: 600, fontFamily: "monospace" }}>
                          − {fmt(viewReq!.billId!.retentionAmount ?? Math.round(viewTotal * (viewReq!.billId!.retentionPercent ?? 0) / 100))}
                        </td>
                      </tr>
                    )}
                    {(viewReq?.billId?.retentionPercent ?? 0) > 0 && (
                      <tr style={{ background: "#f0fdf4" }}>
                        <td colSpan={4} style={{ padding: "8px 10px", fontWeight: 700, textAlign: "right", color: "#16a34a" }}>Net Release</td>
                        <td style={{ padding: "8px 10px", fontWeight: 700, color: "#16a34a", textAlign: "right", fontFamily: "monospace" }}>
                          {fmt(viewTotal - (viewReq!.billId!.retentionAmount ?? Math.round(viewTotal * (viewReq!.billId!.retentionPercent ?? 0) / 100)))}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </div>

            {viewReq.remarks && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: 10, fontSize: 13 }}>
                <strong>Remarks:</strong> {viewReq.remarks}
              </div>
            )}

            {viewReq.status === "approved" && viewReq.billId && (() => {
              const b = viewReq.billId;
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
                  {viewReq.milestoneAchieved && viewReq.milestoneDate && (
                    <div style={{ marginTop: 8, color: "#FF7A00", fontWeight: 600 }}>
                      🏆 Payment Released: {dayjs(viewReq.milestoneDate).format("DD MMM YYYY")}
                      {b.paymentUTR && <span style={{ fontFamily: "monospace", marginLeft: 8, fontSize: 12, color: "#7c3aed" }}>UTR: {b.paymentUTR}</span>}
                    </div>
                  )}
                </div>
              );
            })()}

            {viewReq.status === "rejected" && viewReq.rejectReason && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: 10, fontSize: 13 }}>
                <strong>Reject Reason:</strong> {viewReq.rejectReason}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* AGM Approve Modal — stage 1: sets hold/advance breakdown, then approves */}
      <Modal
        open={approveModal}
        onCancel={() => { setApproveModal(false); setApproveTarget(null); }}
        onOk={handleApprove}
        title="Approve Bill Request — AGM Sign-off"
        okText="Approve & Generate Bill"
        okButtonProps={{ loading: saving }}
        destroyOnClose
      >
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 14 }}>
          A running bill will be generated for the amounts below. Leave a field blank to use the work order's automatic retention calculation.
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Hold / Retention Amount (₹)</div>
          <InputNumber
            style={{ width: "100%" }} min={0}
            placeholder="Auto-calculated from work order retention %"
            value={approveRetention}
            onChange={v => setApproveRetention(v)}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Advance Recovery Amount (₹)</div>
          <InputNumber
            style={{ width: "100%" }} min={0}
            placeholder="0"
            value={approveAdvance}
            onChange={v => setApproveAdvance(v)}
          />
        </div>
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
