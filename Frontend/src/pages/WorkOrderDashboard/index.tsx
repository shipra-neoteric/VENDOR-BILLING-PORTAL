import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Button, Spin, Empty, message, Modal, Input,
} from "antd";
import { ArrowLeftOutlined, TrophyFilled } from "@ant-design/icons";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import BillDetailModal, { type BillDetailRequest } from "../../components/BillDetailModal";
import WorkflowInstanceStepper from "../../components/WorkflowInstanceStepper";
import type { WorkflowInstance } from "../../types/Workflow";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProgressEntry { _id: string; date: string; qtyAdded: number; remarks?: string; }

interface ScopeItem {
  _id: string; description: string; unit: string;
  plannedQty: number; rate: number; amount: number;
  completedQty: number; lastBilledQty: number;
  status: string; progressEntries: ProgressEntry[];
}

interface WODetail {
  _id: string; workOrderNo: string; projectName: string; vendorName: string;
  category: string; subCategory?: string; contractValue: number;
  gstPercent?: number;
  issueDate: string; status: string;
  scopeItems: ScopeItem[];
}

interface BillItem { description: string; unit: string; billedQty: number; rate?: number; amount?: number; }
interface BillRequestStage {
  _id: string; reqNo: string; stageNo: number;
  status: "pending" | "approved" | "rejected";
  periodFrom?: string; periodTo?: string; createdAt: string;
  items: BillItem[]; remarks?: string; rejectReason?: string;
  billId?: {
    billNo: string; status: string; amount: number; paymentDate?: string;
    paidAmount?: number; retentionPercent?: number; retentionAmount?: number;
    advanceRecovery?: number; gstPercent?: number; paymentUTR?: string;
  } | null;
  milestoneAchieved: boolean; milestoneDate?: string;
  requestedBy?: { name: string; email: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtMoney = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

// ── Stage Lifecycle Stepper ───────────────────────────────────────────────────
type StepStatus = "completed" | "current" | "pending" | "rejected";

const STEP_COLORS: Record<StepStatus, { ring: string; bg: string; text: string }> = {
  completed: { ring: "#16a34a", bg: "#f0fdf4",  text: "#16a34a" },
  current:   { ring: "#FF7A00", bg: "#FFF4E8",  text: "#FF7A00" },
  rejected:  { ring: "#ef4444", bg: "#fef2f2",  text: "#ef4444" },
  pending:   { ring: "#D1D5DB", bg: "#F9FAFB",  text: "#9CA3AF" },
};

function StageStepper({ stage }: { stage: BillRequestStage }) {
  const billStatus = stage.billId?.status ?? "";
  const billExists = !!stage.billId;
  const billPaid   = ["verified", "approved", "paid"].includes(billStatus);

  const steps: { label: string; sub: string; status: StepStatus }[] = [
    {
      label: "Bill",
      sub:   "Requested",
      status: "completed",
    },
    {
      label: "Request",
      sub:   "Reviewed",
      status: stage.status === "approved" ? "completed"
            : stage.status === "rejected" ? "rejected"
            : "current",
    },
    {
      label: "Running Bill",
      sub:   "Raised",
      status: billExists ? "completed"
            : stage.status === "approved" ? "current"
            : "pending",
    },
    {
      label: "Bill",
      sub:   "Verified",
      status: billPaid ? "completed"
            : billExists ? "current"
            : "pending",
    },
    {
      label: "Payment",
      sub:   "Released",
      status: stage.milestoneAchieved ? "completed"
            : billPaid ? "current"
            : "pending",
    },
  ];

  const CIRCLE = 30;

  return (
    <div style={{ margin: "14px 0 12px", padding: "12px 14px", background: "var(--nx-fill-2)", borderRadius: 10, border: "1px solid var(--nx-border)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
        Stage Lifecycle
      </div>

      {/* Circles + connectors row */}
      <div style={{ display: "flex", alignItems: "center" }}>
        {steps.map((step, i) => {
          const c = STEP_COLORS[step.status];
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
              <div style={{ width: CIRCLE, height: CIRCLE, borderRadius: "50%", background: c.bg, border: `2.5px solid ${c.ring}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 800, color: c.ring, transition: "all 0.2s" }}>
                {step.status === "completed" ? "✓"
                 : step.status === "rejected" ? "✕"
                 : <span style={{ fontSize: 11 }}>{i + 1}</span>}
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: 2.5, borderRadius: 2, background: steps[i + 1].status !== "pending" ? "#16a34a" : "var(--nx-border)", margin: "0 2px" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Labels row — one cell per step, same width allocation as above */}
      <div style={{ display: "flex", marginTop: 6 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ flex: i < steps.length - 1 ? 1 : "none", minWidth: CIRCLE, textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: STEP_COLORS[step.status].text, lineHeight: 1.2 }}>{step.label}</div>
            <div style={{ fontSize: 9, color: STEP_COLORS[step.status].text, opacity: 0.8, lineHeight: 1.2 }}>{step.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
const fmtQty   = (n: number) => n.toLocaleString("en-IN");
const pctOf    = (c: number, p: number) => p > 0 ? Math.min(100, Math.round((c / p) * 100)) : 0;
const fmtDate  = (d?: string | null) => d ? dayjs(d).format("DD MMM YYYY") : "—";

const STAGE_STATUS: Record<string, { icon: string; color: string; label: string; bg: string }> = {
  pending:  { icon: "⏳", color: "#f59e0b", label: "Pending Review",     bg: "#fffbeb" },
  approved: { icon: "✅", color: "#16a34a", label: "Approved",            bg: "#f0fdf4" },
  rejected: { icon: "❌", color: "#ef4444", label: "Rejected",            bg: "#fef2f2" },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function WorkOrderDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === "owner" || user?.role === "gm" || user?.role === "accounts";

  const [wo,      setWO]      = useState<WODetail | null>(null);
  const [stages,  setStages]  = useState<BillRequestStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [slaInstance, setSlaInstance] = useState<WorkflowInstance | null>(null);

  const [milestoneTarget, setMilestoneTarget] = useState<string | null>(null);
  const [paymentUTR,      setPaymentUTR]      = useState("");
  const [utrModal,        setUTRModal]        = useState(false);
  const [activeTab,       setActiveTab]       = useState<"items" | "milestones" | "bills" | "progress">("items");
  const [viewBill,        setViewBill]        = useState<BillDetailRequest | null>(null);

  const load = async () => {
    if (!id) return;
    try {
      const [woRes, brRes] = await Promise.all([
        apiClient.get(`/work-orders/${id}`),
        apiClient.get(`/bill-requests?workOrderId=${id}`),
      ]);
      setWO(woRes.data.workOrder);
      setStages(brRes.data.billRequests ?? []);
    } catch {
      message.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
    apiClient.get("/workflows/instances", { params: { entityType: "WorkOrder", entityId: id } })
      .then(res => setSlaInstance(res.data.instances?.[0] ?? null))
      .catch(() => {});
  };

  useEffect(() => { load(); }, [id]);

  const handleMilestone = async () => {
    if (!milestoneTarget) return;
    setSaving(true);
    try {
      const res = await apiClient.put(`/bill-requests/${milestoneTarget}/milestone`, {
        ...(paymentUTR ? { paymentUTR } : {}),
      });
      message.success(res.data?.message || "Milestone marked!");
      setUTRModal(false);
      setMilestoneTarget(null);
      setPaymentUTR("");
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to mark milestone");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><Spin size="large" /></div>;
  if (!wo) return <Empty description="Work order not found." style={{ padding: 80 }} />;

  // Compute stats
  const totalContract = wo.contractValue || 0;
  const avgPct = wo.scopeItems.length
    ? Math.round(wo.scopeItems.reduce((s, si) => s + pctOf(si.completedQty, si.plannedQty), 0) / wo.scopeItems.length)
    : 0;
  const billedAmount = stages
    .filter(s => s.status === "approved")
    .reduce((sum, s) => sum + s.items.reduce((si, it) => si + (it.amount || 0), 0), 0);
  const unbilledValue = wo.scopeItems.reduce((sum, si) => {
    const pending = Math.max(0, si.completedQty - (si.lastBilledQty || 0));
    return sum + pending * (si.rate || 0);
  }, 0);
  // Flatten recent entries
  const allEntries = wo.scopeItems.flatMap(si =>
    si.progressEntries.map(pe => ({
      ...pe,
      description: si.description,
      unit: si.unit,
    }))
  ).sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

  const woStatus = wo.status === "in-progress" ? "In Progress" : wo.status === "completed" ? "Completed" : wo.status === "issued" ? "Issued" : "Draft";
  const woStatusColor = wo.status === "in-progress" ? "#f59e0b" : wo.status === "completed" ? "#16a34a" : "#6B7280";

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px" }}>
      {/* Back + Header */}
      <div style={{ marginBottom: 20 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/work-items")}
          style={{ color: "#6B7280", marginBottom: 10, paddingLeft: 0 }}>
          Work Orders
        </Button>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#111827" }}>
              {wo.workOrderNo}
              <span style={{ marginLeft: 12, fontSize: 12, fontWeight: 600, color: woStatusColor, background: "#F9FAFB", border: `1px solid ${woStatusColor}`, borderRadius: 20, padding: "2px 10px" }}>
                {woStatus}
              </span>
            </div>
            <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>
              {wo.projectName} · {wo.category}{wo.subCategory ? ` › ${wo.subCategory}` : ""}
            </div>
            <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 2 }}>
              Contractor: {wo.vendorName} · Issued: {fmtDate(wo.issueDate)}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {/* Contract Value card — shows base + GST-inclusive */}
        <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>Contract Value</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#374151", marginTop: 4 }}>{fmtMoney(totalContract)}</div>
          {(wo.gstPercent ?? 0) > 0 && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed #E5E7EB" }}>
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>+ GST @{wo.gstPercent}%</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#FF7A00", marginTop: 2 }}>
                {fmtMoney(Math.round(totalContract * (1 + (wo.gstPercent ?? 0) / 100)))} incl. GST
              </div>
            </div>
          )}
        </div>

        {[
          { label: "Overall Progress", value: `${avgPct}%`,           icon: "📊", color: avgPct >= 100 ? "#16a34a" : avgPct > 50 ? "#f59e0b" : "#3b82f6" },
          { label: "Billed to Date",   value: fmtMoney(billedAmount), icon: "✅", color: "#16a34a" },
          { label: "Unbilled Work",    value: fmtMoney(unbilledValue),icon: "⏳", color: unbilledValue > 0 ? "#FF7A00" : "#16a34a" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* SLA Workflow */}
      {slaInstance && (
        <WorkflowInstanceStepper
          instance={slaInstance}
          userRole={user?.role}
          userId={user?.id}
          onChanged={load}
        />
      )}

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 4, background: "#F3F4F6", padding: 4, borderRadius: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {([
          ["items",      "Items"],
          ["milestones", "Milestones"],
          ["bills",      "Bills"],
          ["progress",   "Progress"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            style={{
              flex: "1 1 auto", border: "none", borderRadius: 9, padding: "8px 16px",
              fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
              background: activeTab === key ? "#FF7A00" : "transparent",
              color:      activeTab === key ? "#fff"    : "#6B7280",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Items tab — scope of work definition */}
      {activeTab === "items" && (
        <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 15, color: "#111827" }}>
            Scope of Work
          </div>
          {wo.scopeItems.length === 0 ? (
            <div style={{ padding: 40 }}><Empty description="No scope items defined" /></div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F9FAFB" }}>
                    {["Description", "Unit", "Planned Qty", "Rate", "Amount", "Status"].map(h => (
                      <th key={h} style={{ padding: "9px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wo.scopeItems.map((si, i) => (
                    <tr key={si._id} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                      <td style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#111827" }}>{si.description}</td>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: "#6B7280" }}>{si.unit}</td>
                      <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 13, color: "#374151" }}>{fmtQty(si.plannedQty)}</td>
                      <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 13, color: "#374151" }}>{fmtMoney(si.rate || 0)}</td>
                      <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#FF7A00" }}>{fmtMoney(si.amount || 0)}</td>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: "#6B7280", textTransform: "capitalize" }}>{si.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Bills tab — every bill generated for this work order */}
      {activeTab === "bills" && (() => {
        const bills = stages.filter(s => s.billId).map(s => ({ stage: s, bill: s.billId! }));
        const openBill = (stage: BillRequestStage) => setViewBill({
          _id: stage._id, reqNo: stage.reqNo, stageNo: stage.stageNo,
          workOrderNo: wo.workOrderNo, projectName: wo.projectName, vendorName: wo.vendorName,
          category: wo.category, subCategory: wo.subCategory ?? "",
          items: stage.items, remarks: stage.remarks ?? "",
          periodFrom: stage.periodFrom, periodTo: stage.periodTo,
          status: stage.status, rejectReason: stage.rejectReason,
          requestedBy: stage.requestedBy, billId: stage.billId ?? undefined,
          milestoneAchieved: stage.milestoneAchieved, milestoneDate: stage.milestoneDate,
          createdAt: stage.createdAt,
        });
        return (
          <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>Bills</div>
              <div style={{ fontSize: 12, color: "#9CA3AF" }}>{bills.length} total</div>
            </div>
            {bills.length === 0 ? (
              <div style={{ padding: 40 }}><Empty description="No bills generated yet." /></div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F9FAFB" }}>
                      {["Bill No", "Stage", "Amount", "Status", "Payment Date", ""].map(h => (
                        <th key={h} style={{ padding: "9px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map(({ stage, bill }, i) => (
                      <tr key={bill.billNo} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 700, color: "#FF7A00", fontSize: 13 }}>{bill.billNo}</td>
                        <td style={{ padding: "10px 16px", fontSize: 12, color: "#6B7280" }}>Stage {stage.stageNo}</td>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: "#111827" }}>{fmtMoney(bill.amount)}</td>
                        <td style={{ padding: "10px 16px", fontSize: 12, color: "#6B7280", textTransform: "uppercase" }}>{bill.status}</td>
                        <td style={{ padding: "10px 16px", fontSize: 12, color: "#6B7280" }}>{fmtDate(bill.paymentDate)}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <Button type="link" size="small" onClick={() => openBill(stage)}>View</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* Progress tab — per scope item progress breakdown */}
      {activeTab === "progress" && (
      <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 15, color: "#111827" }}>
          Scope Items Progress
        </div>
        {wo.scopeItems.length === 0 ? (
          <div style={{ padding: 40 }}><Empty description="No scope items defined" /></div>
        ) : (
          wo.scopeItems.map((si, idx) => {
            const pct      = pctOf(si.completedQty, si.plannedQty);
            const billedPct= si.plannedQty > 0 ? Math.min(100, Math.round(((si.lastBilledQty || 0) / si.plannedQty) * 100)) : 0;
            const pending  = Math.max(0, si.completedQty - (si.lastBilledQty || 0));
            const remaining= Math.max(0, si.plannedQty - si.completedQty);
            return (
              <div key={si._id} style={{ padding: "18px 20px", borderBottom: "1px solid #F3F4F6", background: idx % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{si.description}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: pct >= 100 ? "#16a34a" : "#FF7A00" }}>{pct}%</div>
                </div>

                {/* Multi-layer progress bar */}
                <div style={{ height: 10, background: "#E5E7EB", borderRadius: 5, overflow: "hidden", position: "relative", marginBottom: 10 }}>
                  {/* Billed layer */}
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${billedPct}%`, background: "#16a34a", borderRadius: 5 }} />
                  {/* Done but not billed */}
                  <div style={{ position: "absolute", left: `${billedPct}%`, top: 0, height: "100%", width: `${Math.max(0, pct - billedPct)}%`, background: "#FF7A00", borderRadius: 5 }} />
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, color: "#16a34a" }}>█ Billed</span>
                  <span style={{ fontSize: 10, color: "#FF7A00" }}>█ Unbilled</span>
                  <span style={{ fontSize: 10, color: "#E5E7EB" }}>█ Not done</span>
                </div>

                {/* Numbers row */}
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  {[
                    { label: "Planned",   value: `${fmtQty(si.plannedQty)} ${si.unit}`,                        color: "#374151" },
                    { label: "Done",      value: `${fmtQty(si.completedQty)} ${si.unit}`,                       color: pct >= 100 ? "#16a34a" : "#374151" },
                    { label: "Billed",    value: `${fmtQty(si.lastBilledQty || 0)} ${si.unit}`,                 color: "#16a34a" },
                    { label: "Unbilled",  value: pending > 0 ? `${fmtQty(pending)} ${si.unit}` : "—",           color: pending > 0 ? "#FF7A00" : "#9CA3AF" },
                    { label: "Remaining", value: remaining > 0 ? `${fmtQty(remaining)} ${si.unit}` : "Done ✓",  color: remaining > 0 ? "#374151" : "#16a34a" },
                    { label: "Rate",      value: fmtMoney(si.rate || 0),                                        color: "#374151" },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color, marginTop: 2 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
      )}

      {/* Milestones tab */}
      {activeTab === "milestones" && (
      <>
      {/* Stage Timeline */}
      <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 15, color: "#111827" }}>
          Stage Timeline
          <span style={{ marginLeft: 10, fontSize: 12, color: "#9CA3AF", fontWeight: 400 }}>
            {stages.length} stage{stages.length !== 1 ? "s" : ""}
          </span>
        </div>

        {stages.length === 0 ? (
          <div style={{ padding: 40 }}><Empty description="No bill requests submitted yet." /></div>
        ) : (
          stages.map((stage, idx) => {
            const cfg = STAGE_STATUS[stage.status] ?? STAGE_STATUS.pending;
            const stageTotal = stage.items.reduce((s, it) => s + (it.amount || 0), 0);
            return (
              <div key={stage._id} style={{ padding: "20px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", gap: 16, alignItems: "flex-start" }}>
                {/* Stage number + status icon */}
                <div style={{ flexShrink: 0, textAlign: "center" }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: "50%",
                    background: stage.milestoneAchieved ? "#FFF4E8" : cfg.bg,
                    border: `2px solid ${stage.milestoneAchieved ? "#FF7A00" : cfg.color}`,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{ fontSize: 18 }}>{stage.milestoneAchieved ? "🏆" : cfg.icon}</div>
                  </div>
                  {idx < stages.length - 1 && (
                    <div style={{ width: 2, height: 32, background: "#E5E7EB", margin: "4px auto" }} />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 16, color: "#111827" }}>Stage {stage.stageNo}</span>
                    <code style={{ fontSize: 12, color: "#6B7280", background: "#F3F4F6", padding: "1px 6px", borderRadius: 4 }}>{stage.reqNo}</code>
                    <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}`, padding: "2px 8px", borderRadius: 12 }}>
                      {cfg.label}
                    </span>
                    {stage.milestoneAchieved && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#FF7A00", background: "#FFF4E8", border: "1px solid #FF7A00", padding: "2px 8px", borderRadius: 12 }}>
                        🏆 Milestone Achieved
                      </span>
                    )}
                  </div>

                  {/* Period */}
                  <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>
                    📅 Period: {fmtDate(stage.periodFrom)} → {fmtDate(stage.periodTo ?? stage.createdAt)}
                    {stage.requestedBy?.name && <span> · Submitted by {stage.requestedBy.name}</span>}
                  </div>

                  {/* Items */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 0 }}>
                    {stage.items.map((it, i) => (
                      <div key={i} style={{ background: "#F3F4F6", borderRadius: 6, padding: "4px 10px", fontSize: 12 }}>
                        <span style={{ fontWeight: 600 }}>{it.description}</span>: {fmtQty(it.billedQty)} {it.unit}
                        {it.amount ? <span style={{ color: "#16a34a", marginLeft: 6 }}>({fmtMoney(it.amount)})</span> : null}
                      </div>
                    ))}
                  </div>

                  {/* Stage lifecycle stepper */}
                  <StageStepper stage={stage} />

                  {/* Bill info */}
                  {stage.status === "approved" && stage.billId && (
                    <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 8, display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span><strong>Bill:</strong> {stage.billId.billNo}</span>
                      {stageTotal > 0 && <span><strong>Amount:</strong> {fmtMoney(stageTotal)}</span>}
                      <span><strong>Status:</strong> {stage.billId.status?.toUpperCase()}</span>
                      {stage.milestoneAchieved && stage.milestoneDate && (
                        <span style={{ color: "#FF7A00" }}><strong>Payment Released:</strong> {fmtDate(stage.milestoneDate)}</span>
                      )}
                    </div>
                  )}

                  {/* Reject reason */}
                  {stage.status === "rejected" && stage.rejectReason && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "#b91c1c", marginBottom: 8 }}>
                      <strong>Reason:</strong> {stage.rejectReason}
                    </div>
                  )}

                  {/* Remarks */}
                  {stage.remarks && (
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>Remarks: {stage.remarks}</div>
                  )}

                  {/* Actions */}
                  {canManage && stage.status === "approved" && !stage.milestoneAchieved && (
                    <Button
                      size="small" type="primary"
                      icon={<TrophyFilled />}
                      style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
                      onClick={() => { setMilestoneTarget(stage._id); setPaymentUTR(""); setUTRModal(true); }}
                    >
                      Release Payment — Mark Milestone
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Recent Daily Entries */}
      {allEntries.length > 0 && (
        <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 15, color: "#111827" }}>
            Recent Daily Progress
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Date", "Scope Item", "Qty Added", "Remarks"].map(h => (
                    <th key={h} style={{ padding: "9px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allEntries.slice(0, 20).map((e, i) => (
                  <tr key={e._id + i} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                    <td style={{ padding: "9px 16px", fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>{fmtDate(e.date)}</td>
                    <td style={{ padding: "9px 16px", fontSize: 13, fontWeight: 500, color: "#111827" }}>{e.description}</td>
                    <td style={{ padding: "9px 16px", fontFamily: "monospace", fontSize: 13, color: "#16a34a", fontWeight: 700 }}>
                      +{fmtQty(e.qtyAdded)} {e.unit}
                    </td>
                    <td style={{ padding: "9px 16px", fontSize: 12, color: "#6B7280" }}>{e.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {allEntries.length > 20 && (
            <div style={{ padding: "10px 16px", fontSize: 12, color: "#9CA3AF", borderTop: "1px solid #F3F4F6" }}>
              Showing last 20 of {allEntries.length} entries.
            </div>
          )}
        </div>
      )}
      </>
      )}

      {/* Release Payment Modal */}
      <Modal
        open={utrModal}
        onCancel={() => { setUTRModal(false); setMilestoneTarget(null); setPaymentUTR(""); }}
        title="Release Payment — Mark Milestone"
        onOk={handleMilestone}
        okText="Confirm Payment Released"
        okButtonProps={{ loading: saving, style: { background: "#FF7A00", borderColor: "#FF7A00" } }}
        destroyOnClose
      >
        <div style={{ marginTop: 12 }}>
          <div style={{ padding: 12, background: "#FFF4E8", border: "1px solid #FED7AA", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#92400e" }}>
            Confirming this will mark the stage as <strong>Milestone Achieved</strong> and update the bill status to <strong>Paid</strong>.
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
            Payment UTR / Reference (optional)
          </div>
          <Input
            placeholder="e.g. UTR123456789"
            value={paymentUTR}
            onChange={e => setPaymentUTR(e.target.value)}
          />
        </div>
      </Modal>

      <BillDetailModal billRequest={viewBill} open={!!viewBill} onClose={() => setViewBill(null)} />
    </div>
  );
}
