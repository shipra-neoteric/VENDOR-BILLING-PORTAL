import { Fragment, useEffect, useMemo, useState } from "react";
import { Select, Table, Tag, Button, Modal, Input, InputNumber, Checkbox, Empty, Spin, message, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { CheckCircleOutlined, CloseCircleOutlined, WarningOutlined, EyeOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import WorkflowInstanceStepper from "../../components/WorkflowInstanceStepper";
import type { WorkflowInstance } from "../../types/Workflow";

// ── Types ─────────────────────────────────────────────────────────────────────
interface SubItemDetail {
  _id: string; description: string; remarks?: string; unit: string;
  plannedQty: number; completedQty: number; lastBilledQty: number;
  status?: string; varianceApproved?: boolean;
}
interface ScopeItemDetail {
  _id: string; description: string; remarks?: string; unit: string;
  plannedQty: number; completedQty: number; lastBilledQty: number;
  status?: string; varianceApproved?: boolean;
  subItems?: SubItemDetail[];
}
interface WORow {
  _id: string; workOrderNo: string; projectName: string;
  projectId?: string | { _id: string; name: string };
  vendorName?: string; vendorCode?: string; category?: string; status: string;
  assignedDRI?: { _id: string; name: string }[];
}
interface WODetail extends WORow {
  contractValue?: number;
  scopeItems: ScopeItemDetail[];
}
interface ProjectOption { _id: string; name: string; code?: string; parentId?: string | null; }
interface ActivityEvent {
  _id: string; type: string; workOrderId?: string; workOrderNo?: string; vendorName?: string;
  projectId?: { _id: string; name: string } | string;
  performedByName?: string; remarks?: string;
  metadata?: { scopeItem?: string; qtyAdded?: number; unit?: string; plannedQty?: number; completedQty?: number };
  createdAt: string;
}
interface BillItem {
  scopeItemId?: string; description: string; unit: string; billedQty: number;
  rate?: number; amount?: number; progressRemarks?: string;
}
interface BillRequestRow {
  _id: string; reqNo: string; stageNo?: number;
  workOrderId?: string; workOrderNo: string;
  projectId?: string; projectName: string; projectLocation?: string;
  vendorCode?: string; vendorName: string; category?: string; subCategory?: string;
  items: BillItem[]; remarks?: string;
  periodFrom?: string; periodTo?: string;
  status: "pending" | "approved" | "rejected";
  requestedBy?: { name: string; email: string };
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt  = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const fmtN = (n: number) => (n ?? 0).toLocaleString("en-IN");
const pctOf = (c: number, p: number) => p > 0 ? Math.min(100, Math.round((c / p) * 100)) : 0;

type VarianceLevel = "none" | "yellow" | "red";
function varianceLevel(plannedQty: number, completedQty: number): VarianceLevel {
  if (!(plannedQty > 0) || completedQty <= plannedQty) return "none";
  const overPct = ((completedQty - plannedQty) / plannedQty) * 100;
  return overPct <= 10 ? "yellow" : "red";
}
function itemHasUnapprovedVariance(si: ScopeItemDetail): boolean {
  if (si.subItems && si.subItems.length > 0) {
    return si.subItems.some(sub => varianceLevel(sub.plannedQty, sub.completedQty) !== "none" && !sub.varianceApproved);
  }
  return varianceLevel(si.plannedQty, si.completedQty) !== "none" && !si.varianceApproved;
}

function VarianceTag({ level }: { level: VarianceLevel }) {
  if (level === "none") return null;
  return level === "yellow" ? (
    <Tag color="gold" icon={<WarningOutlined />}>Over plan ≤10%</Tag>
  ) : (
    <Tag color="red" icon={<WarningOutlined />}>Over plan &gt;10%</Tag>
  );
}

function getProjId(row: WORow): string | undefined {
  if (!row.projectId) return undefined;
  return typeof row.projectId === "string" ? row.projectId : row.projectId._id;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function BillReview() {
  const { user } = useAuth();

  const [loading, setLoading]   = useState(true);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [allWOs,   setAllWOs]   = useState<WORow[]>([]);
  const [billReqs, setBillReqs] = useState<BillRequestRow[]>([]);

  const [selProjectId, setSelProjectId] = useState<string | undefined>(undefined);
  const [woDetails,     setWoDetails]     = useState<Map<string, WODetail>>(new Map());
  const [detailLoading, setDetailLoading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get("/projects/activity", { params: { limit: 60 } }),
      apiClient.get("/projects"),
      apiClient.get("/work-orders"),
      apiClient.get("/bill-requests", { params: { status: "pending" } }),
    ])
      .then(([actR, projR, woR, brR]) => {
        setActivity(actR.data.events ?? []);
        setProjects(projR.data.projects ?? []);
        setAllWOs(woR.data.workOrders ?? []);
        setBillReqs(brR.data.billRequests ?? []);
      })
      .catch(() => message.error("Failed to load Bill Review data"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const projectWOs = useMemo(
    () => selProjectId ? allWOs.filter(wo => getProjId(wo) === selProjectId) : [],
    [allWOs, selProjectId]
  );

  useEffect(() => {
    if (!projectWOs.length) { setWoDetails(new Map()); return; }
    setDetailLoading(true);
    Promise.all(projectWOs.map(wo => apiClient.get(`/work-orders/${wo._id}`)))
      .then(results => {
        const map = new Map<string, WODetail>();
        results.forEach(r => { const d = r.data.workOrder; if (d) map.set(d._id, d); });
        setWoDetails(map);
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [projectWOs]);

  const reloadWODetail = async (woId: string) => {
    const r = await apiClient.get(`/work-orders/${woId}`);
    setWoDetails(prev => new Map(prev).set(woId, r.data.workOrder));
  };

  // ── Work order detail + bill-generation modal ───────────────────────────────
  const [viewWOId, setViewWOId] = useState<string | null>(null);
  const [checked,  setChecked]  = useState<Set<string>>(new Set());
  const [slaInstance, setSlaInstance] = useState<WorkflowInstance | null>(null);
  const [billRemarks, setBillRemarks] = useState("");
  const [generating,  setGenerating]  = useState(false);
  const [approvingVariance, setApprovingVariance] = useState<string | null>(null);

  const viewWO = viewWOId ? woDetails.get(viewWOId) ?? null : null;

  const openWO = async (woId: string, projectIdHint?: string) => {
    if (projectIdHint && projectIdHint !== selProjectId) setSelProjectId(projectIdHint);
    setViewWOId(woId);
    setChecked(new Set());
    setBillRemarks("");
    if (!woDetails.has(woId)) {
      try {
        const r = await apiClient.get(`/work-orders/${woId}`);
        setWoDetails(prev => new Map(prev).set(woId, r.data.workOrder));
      } catch { /* modal will just show a spinner state */ }
    }
  };

  useEffect(() => {
    if (!viewWOId) { setSlaInstance(null); return; }
    apiClient.get("/workflows/instances", { params: { entityType: "WorkOrder", entityId: viewWOId } })
      .then(res => setSlaInstance(res.data.instances?.[0] ?? null))
      .catch(() => setSlaInstance(null));
  }, [viewWOId]);

  const toggleCheck = (itemId: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  const handleApproveVariance = async (item: ScopeItemDetail, subItem?: SubItemDetail) => {
    if (!viewWO) return;
    const key = subItem ? subItem._id : item._id;
    setApprovingVariance(key);
    try {
      const path = subItem
        ? `/work-orders/${viewWO._id}/scope-items/${item._id}/sub-items/${subItem._id}/approve-variance`
        : `/work-orders/${viewWO._id}/scope-items/${item._id}/approve-variance`;
      await apiClient.patch(path);
      message.success("Variance approved");
      await reloadWODetail(viewWO._id);
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to approve variance");
    } finally {
      setApprovingVariance(null);
    }
  };

  const handleGenerateBill = async () => {
    if (!viewWO || checked.size === 0) return;
    setGenerating(true);
    try {
      const res = await apiClient.post("/bill-requests", {
        workOrderId: viewWO._id,
        scopeItemIds: Array.from(checked),
        remarks: billRemarks,
      });
      message.success(res.data?.message || "Bill request submitted");
      setViewWOId(null);
      setChecked(new Set());
      setBillRemarks("");
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to generate bill request");
    } finally {
      setGenerating(false);
    }
  };

  const pendingBRForWO = (woId: string) => billReqs.find(br => br.workOrderId === woId);

  // ── Bill request view / approve / reject (adapted from Bill Requests page) ──
  const [viewReq, setViewReq] = useState<BillRequestRow | null>(null);
  const [approveModal,     setApproveModal]     = useState(false);
  const [approveTarget,    setApproveTarget]    = useState<string | null>(null);
  const [approveRetention, setApproveRetention] = useState<number | null>(null);
  const [approveAdvance,   setApproveAdvance]   = useState<number | null>(null);
  const [rejectModal,  setRejectModal]  = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);

  const openApprove = (id: string) => {
    setApproveTarget(id); setApproveRetention(null); setApproveAdvance(null); setApproveModal(true);
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
      setApproveModal(false); setApproveTarget(null); setViewReq(null);
      load();
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
      setRejectModal(false); setRejectReason(""); setRejectTarget(null); setViewReq(null);
      load();
    } catch { message.error("Failed to reject"); }
    finally { setSaving(false); }
  };

  const viewTotal = viewReq ? viewReq.items.reduce((s, it) => s + (it.rate ?? 0) * it.billedQty, 0) : 0;

  // ── Activity feed row click → jump straight to that work order ─────────────
  const openFromActivity = (ev: ActivityEvent) => {
    if (!ev.workOrderId) return;
    const projId = typeof ev.projectId === "object" ? ev.projectId?._id : ev.projectId;
    openWO(ev.workOrderId, projId);
  };

  const activityColumns: ColumnsType<ActivityEvent> = [
    { title: "When", dataIndex: "createdAt", width: 130, render: d => dayjs(d).format("DD MMM, hh:mm a") },
    {
      title: "Project / Work Order", render: (_, ev) => (
        <div>
          <div style={{ fontWeight: 600 }}>{typeof ev.projectId === "object" ? ev.projectId?.name : "—"}</div>
          <button
            type="button"
            onClick={() => openFromActivity(ev)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#FF7A00", fontFamily: "monospace", fontSize: 12 }}
          >
            {ev.workOrderNo}
          </button>
        </div>
      ),
    },
    { title: "DRI", dataIndex: "performedByName", width: 130, render: v => v || "—" },
    {
      title: "Progress", render: (_, ev) => {
        const m = ev.metadata || {};
        const level = m.plannedQty != null && m.completedQty != null ? varianceLevel(m.plannedQty, m.completedQty) : "none";
        return (
          <div>
            <div style={{ fontSize: 13 }}>{m.scopeItem} <span style={{ fontFamily: "monospace", color: "#16a34a", fontWeight: 700 }}>+{fmtN(m.qtyAdded || 0)} {m.unit}</span></div>
            {level !== "none" && <VarianceTag level={level} />}
          </div>
        );
      },
    },
    { title: "Remarks", dataIndex: "remarks", render: v => v ? <span style={{ color: "#6B7280", fontSize: 12 }}>📌 {v}</span> : <span style={{ color: "#D1D5DB" }}>—</span> },
  ];

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><Spin size="large" /></div>;
  }

  return (
    <PageShell
      title="Bill Review"
      description="See what DRI has been logging, sign off on any over-plan progress, and decide what actually goes into this billing cycle."
    >
      {/* ── Recent DRI Progress nutshell ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Recent DRI Progress</div>
        {activity.length === 0 ? (
          <Empty description="No progress logged yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            dataSource={activity}
            columns={activityColumns}
            rowKey="_id"
            size="small"
            pagination={{ pageSize: 8 }}
          />
        )}
      </div>

      {/* ── Pending bill requests ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
          Pending Bill Requests {billReqs.length > 0 && <Tag color="orange">{billReqs.length}</Tag>}
        </div>
        {billReqs.length === 0 ? (
          <Empty description="Nothing pending your approval" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {billReqs.map(r => (
              <div key={r._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--nx-white)", border: "1px solid #e4e7ee", borderRadius: 10, padding: "12px 16px", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontFamily: "monospace", color: "#FF7A00" }}>{r.reqNo}</div>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>{[r.vendorName, r.projectName, r.workOrderNo].filter(Boolean).join(" · ")}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => setViewReq(r)}>View</Button>
                  <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => openApprove(r._id)}>Approve</Button>
                  <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => { setRejectTarget(r._id); setRejectModal(true); }}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Project → Work Order drill-down ── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Work Orders</div>
          <Select
            allowClear
            showSearch
            placeholder="Select a project to review its work orders…"
            value={selProjectId}
            onChange={setSelProjectId}
            options={projects.map(p => ({ label: p.name, value: p._id }))}
            filterOption={(input, opt) => (opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
            style={{ minWidth: 280 }}
          />
        </div>

        {!selProjectId ? (
          <Empty description="Pick a project above to see its work orders and progress" />
        ) : detailLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>
        ) : projectWOs.length === 0 ? (
          <Empty description="No work orders in this project" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {projectWOs.map(wo => {
              const detail = woDetails.get(wo._id);
              const avgPct = detail && detail.scopeItems.length > 0
                ? Math.round(detail.scopeItems.reduce((s, si) => s + pctOf(si.completedQty, si.plannedQty), 0) / detail.scopeItems.length)
                : 0;
              const anyVariance = detail?.scopeItems.some(si => itemHasUnapprovedVariance(si));
              const pendingBR = pendingBRForWO(wo._id);
              return (
                <div key={wo._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--nx-white)", border: "1px solid #e4e7ee", borderRadius: 10, padding: "12px 16px", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00" }}>{wo.workOrderNo}</span>
                      {wo.category && <Tag>{wo.category}</Tag>}
                      {anyVariance && <Tag color="red" icon={<WarningOutlined />}>Unapproved variance</Tag>}
                      {pendingBR && <Tag color="orange">Bill {pendingBR.reqNo} pending</Tag>}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                      {wo.vendorName} · {(wo.assignedDRI ?? []).map(d => d.name).join(", ") || "No DRI assigned"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 70, height: 6, background: "#E5E7EB", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${avgPct}%`, height: "100%", background: avgPct >= 100 ? "#16a34a" : "#FF7A00" }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{avgPct}%</span>
                    </div>
                    <Button size="small" type="primary" onClick={() => openWO(wo._id)}>View & Bill</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Work order detail + bill-generation modal ── */}
      <Modal
        open={!!viewWOId}
        onCancel={() => { setViewWOId(null); setChecked(new Set()); }}
        title={`Work Order — ${viewWO?.workOrderNo ?? ""}`}
        width={820}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#6B7280" }}>
              {checked.size > 0 ? `${checked.size} item${checked.size !== 1 ? "s" : ""} selected` : "Select items below to bill"}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={() => setViewWOId(null)}>Close</Button>
              <Button
                type="primary"
                disabled={checked.size === 0}
                loading={generating}
                onClick={handleGenerateBill}
                style={{ background: checked.size > 0 ? "#FF7A00" : undefined, borderColor: checked.size > 0 ? "#FF7A00" : undefined }}
              >
                Generate Bill Request
              </Button>
            </div>
          </div>
        }
      >
        {!viewWO ? (
          <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "#f9fafb", padding: 14, borderRadius: 8 }}>
              {[
                ["Project", viewWO.projectName],
                ["Contractor", `${viewWO.vendorName ?? ""} (${viewWO.vendorCode ?? ""})`],
                ["Category", viewWO.category || "—"],
                ["Contract Value", viewWO.contractValue ? fmt(viewWO.contractValue) : "—"],
                ["Assigned DRI", (viewWO.assignedDRI ?? []).map(d => d.name).join(", ") || "—"],
                ["Status", viewWO.status],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                  <div style={{ fontWeight: 600, color: "#111827", fontSize: 13 }}>{val}</div>
                </div>
              ))}
            </div>

            {slaInstance && (
              <div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 2 }}>
                  Work order sign-off chain (informational — not related to progress variance below)
                </div>
                <WorkflowInstanceStepper
                  instance={slaInstance}
                  userRole={user?.role}
                  userId={user?.id}
                  onChanged={() => {
                    apiClient.get("/workflows/instances", { params: { entityType: "WorkOrder", entityId: viewWO._id } })
                      .then(res => setSlaInstance(res.data.instances?.[0] ?? null))
                      .catch(() => {});
                  }}
                  compact
                />
              </div>
            )}

            <div>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Scope Items — select which ones to bill this cycle
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#1F2937", color: "#fff" }}>
                    {["", "Description", "Unit", "Planned", "Done", "Unbilled", "Variance", ""].map(h => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewWO.scopeItems.map((si, idx) => {
                    const unbilled = Math.max(0, si.completedQty - (si.lastBilledQty || 0));
                    const level = varianceLevel(si.plannedQty, si.completedQty);
                    const blocked = itemHasUnapprovedVariance(si);
                    const canBill = unbilled > 0 && !blocked;
                    const hasSubItems = (si.subItems?.length ?? 0) > 0;
                    return (
                      <Fragment key={si._id}>
                        <tr style={{ borderBottom: hasSubItems ? "none" : "1px solid #E5E7EB", background: idx % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                          <td style={{ padding: "6px 10px" }}>
                            {unbilled > 0 && !hasSubItems && (
                              <Tooltip title={blocked ? "Approve the variance below first" : undefined}>
                                <Checkbox checked={checked.has(si._id)} disabled={!canBill} onChange={() => toggleCheck(si._id)} />
                              </Tooltip>
                            )}
                            {unbilled > 0 && hasSubItems && (
                              <Tooltip title={blocked ? "Approve every particular's variance below first" : undefined}>
                                <Checkbox checked={checked.has(si._id)} disabled={!canBill} onChange={() => toggleCheck(si._id)} />
                              </Tooltip>
                            )}
                          </td>
                          <td style={{ padding: "6px 10px", fontWeight: 600 }}>
                            {si.description}
                            {si.remarks && <div style={{ fontSize: 11, color: "#d97706", fontWeight: 400 }}>📌 {si.remarks}</div>}
                          </td>
                          <td style={{ padding: "6px 10px" }}>{si.unit}</td>
                          <td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{fmtN(si.plannedQty)}</td>
                          <td style={{ padding: "6px 10px", fontFamily: "monospace" }}>{fmtN(si.completedQty)}</td>
                          <td style={{ padding: "6px 10px", fontFamily: "monospace", color: unbilled > 0 ? "#FF7A00" : "#9CA3AF", fontWeight: unbilled > 0 ? 700 : 400 }}>{fmtN(unbilled)}</td>
                          <td style={{ padding: "6px 10px" }}>
                            {!hasSubItems && level !== "none" && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <VarianceTag level={level} />
                                {!si.varianceApproved && (
                                  <Button size="small" loading={approvingVariance === si._id} onClick={() => handleApproveVariance(si)}>Approve</Button>
                                )}
                              </div>
                            )}
                            {hasSubItems && itemHasUnapprovedVariance(si) && <Tag color="red">See particulars</Tag>}
                          </td>
                          <td />
                        </tr>
                        {hasSubItems && si.subItems!.map(sub => {
                          const subLevel = varianceLevel(sub.plannedQty, sub.completedQty);
                          return (
                            <tr key={sub._id} style={{ borderBottom: "1px solid #F3F4F6", background: "#FCFCFD" }}>
                              <td />
                              <td style={{ padding: "5px 10px 5px 26px", fontSize: 12, color: "#6B7280" }}>{sub.description}</td>
                              <td style={{ padding: "5px 10px", fontSize: 12 }}>{sub.unit}</td>
                              <td style={{ padding: "5px 10px", fontFamily: "monospace", fontSize: 12 }}>{fmtN(sub.plannedQty)}</td>
                              <td style={{ padding: "5px 10px", fontFamily: "monospace", fontSize: 12 }}>{fmtN(sub.completedQty)}</td>
                              <td />
                              <td style={{ padding: "5px 10px" }}>
                                {subLevel !== "none" && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <VarianceTag level={subLevel} />
                                    {!sub.varianceApproved && (
                                      <Button size="small" loading={approvingVariance === sub._id} onClick={() => handleApproveVariance(si, sub)}>Approve</Button>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td />
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Remarks for this bill request (optional)</div>
              <Input.TextArea rows={2} value={billRemarks} onChange={e => setBillRemarks(e.target.value)} placeholder="Notes for whoever approves this…" />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Bill request view modal (adapted from Bill Requests page) ── */}
      <Modal
        open={!!viewReq}
        onCancel={() => setViewReq(null)}
        title={`Bill Request — ${viewReq?.reqNo}`}
        width={720}
        footer={
          viewReq?.status === "pending" ? (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button onClick={() => setViewReq(null)}>Close</Button>
              <Button danger onClick={() => { setRejectTarget(viewReq._id); setRejectModal(true); setViewReq(null); }}>Reject</Button>
              <Button type="primary" onClick={() => { openApprove(viewReq._id); setViewReq(null); }}>Approve & Generate Bill</Button>
            </div>
          ) : (
            <Button onClick={() => setViewReq(null)}>Close</Button>
          )
        }
      >
        {viewReq && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "#f9fafb", padding: 14, borderRadius: 8 }}>
              {[
                ["Work Order", viewReq.workOrderNo],
                ["Project", viewReq.projectLocation ? `${viewReq.projectName} — ${viewReq.projectLocation}` : viewReq.projectName],
                ["Contractor", viewReq.vendorName],
                ["Requested By", viewReq.requestedBy?.name || "—"],
                ["Date", dayjs(viewReq.createdAt).format("DD MMM YYYY")],
                ...(viewReq.periodFrom ? [["Period", `${dayjs(viewReq.periodFrom).format("DD MMM YYYY")} → ${dayjs(viewReq.periodTo ?? viewReq.createdAt).format("DD MMM YYYY")}`]] : []),
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                  <div style={{ fontWeight: 600, color: "#111827", fontSize: 13 }}>{val}</div>
                </div>
              ))}
            </div>

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
                    <Fragment key={i}>
                      <tr style={{ borderBottom: it.progressRemarks ? "none" : "1px solid #E5E7EB", background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                        <td style={{ padding: "6px 10px" }}>{it.description}</td>
                        <td style={{ padding: "6px 10px" }}>{it.unit}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "monospace" }}>{it.billedQty.toLocaleString("en-IN")}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>{it.rate ? fmt(it.rate) : "pending"}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600 }}>{it.rate ? fmt(amt) : "—"}</td>
                      </tr>
                      {it.progressRemarks && (
                        <tr style={{ borderBottom: "1px solid #E5E7EB", background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                          <td colSpan={5} style={{ padding: "0 10px 6px", fontSize: 11, color: "#d97706" }}>📌 {it.progressRemarks}</td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              {viewTotal > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid #FF7A00", background: "#FFF8F3" }}>
                    <td colSpan={4} style={{ padding: "8px 10px", fontWeight: 700, textAlign: "right", color: "#FF7A00" }}>Gross Total</td>
                    <td style={{ padding: "8px 10px", fontWeight: 700, textAlign: "right" }}>{fmt(viewTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>

            {viewReq.remarks && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: 10, fontSize: 13 }}>
                <strong>Remarks:</strong> {viewReq.remarks}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── AGM/GM approve modal — hold/retention + advance, both optional ── */}
      <Modal
        open={approveModal}
        onCancel={() => { setApproveModal(false); setApproveTarget(null); }}
        onOk={handleApprove}
        title="Approve Bill Request"
        okText="Approve & Generate Bill"
        okButtonProps={{ loading: saving }}
        destroyOnClose
      >
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 14 }}>
          A running bill will be generated for the amounts below. Leave a field blank to use the work order's automatic retention calculation.
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Hold / Retention Amount (₹, optional)</div>
          <InputNumber style={{ width: "100%" }} min={0} placeholder="Auto-calculated from work order retention %" value={approveRetention} onChange={setApproveRetention} />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Advance Recovery Amount (₹, optional)</div>
          <InputNumber style={{ width: "100%" }} min={0} placeholder="0" value={approveAdvance} onChange={setApproveAdvance} />
        </div>
      </Modal>

      <Modal
        open={rejectModal}
        onCancel={() => { setRejectModal(false); setRejectReason(""); setRejectTarget(null); }}
        onOk={handleReject}
        title="Reject Bill Request"
        okText="Confirm Rejection"
        okButtonProps={{ danger: true, loading: saving }}
      >
        <Input.TextArea rows={3} placeholder="Reason for rejection (optional)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
      </Modal>
    </PageShell>
  );
}
