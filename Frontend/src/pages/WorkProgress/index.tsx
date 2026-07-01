import { useState, useEffect } from "react";
import {
  Select, Button, Modal, Form, Input, InputNumber,
  Tooltip, message, Spin, Empty, DatePicker, Badge, Popconfirm,
} from "antd";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";

dayjs.extend(isoWeek);

const { Option } = Select;

// ── Shared types ──────────────────────────────────────────────────────────────
interface Project   { _id: string; name: string; code: string; }
interface Category  { _id: string; name: string; color: string; }
interface WorkOrder { _id: string; workOrderNo: string; vendorName: string; contractValue: number; category: string; projectName?: string; }
interface ProgressEntry { _id: string; date: string; qtyAdded: number; remarks?: string; }
interface ScopeItemR {
  _id: string; description: string; unit: string;
  plannedQty: number; completedQty: number; lastBilledQty: number;
  rate: number; progressEntries?: ProgressEntry[];
}
interface WOSummary { _id: string; workOrderNo: string; projectName: string; category?: string; subCategory?: string; vendorName?: string; }
interface WODetail  {
  _id: string; workOrderNo: string; projectName: string;
  category?: string; subCategory?: string; vendorName?: string;
  contractValue?: number; issueDate?: string;
  scopeItems: ScopeItemR[];
}
interface BRSummary {
  _id: string; reqNo: string; workOrderId: string;
  stageNo?: number; status: string;
  periodFrom?: string; periodTo?: string;
  items: { description: string; unit: string; billedQty: number }[];
  createdAt: string;
  billId?: { billNo: string } | null;
  milestoneAchieved?: boolean;
  milestoneDate?: string;
}
// A flattened progress entry row enriched with its parent scope item metadata
type EntryRow = ProgressEntry & {
  unit: string; description: string; scopeId: string;
  scopePlanned: number; scopeCompleted: number; scopeLastBilled: number;
};

// ── Shared helpers ────────────────────────────────────────────────────────────
const fmtN  = (n: number) => n.toLocaleString("en-IN");
const fmt   = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const pctOf = (c: number, p: number) => p > 0 ? Math.min(100, Math.round((c / p) * 100)) : 0;

const BR_STATUS_COLOR: Record<string, string> = { pending: "#f59e0b", approved: "#16a34a", rejected: "#ef4444" };
const BR_STATUS_LABEL: Record<string, string> = { pending: "Pending Review", approved: "Approved", rejected: "Rejected" };

// ── Admin: Construction Progress ──────────────────────────────────────────────
function WorkProgressAdmin() {
  const [projects,   setProjects]   = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selProject,   setSelProject]   = useState<string | undefined>();
  const [selCategory,  setSelCategory]  = useState<string | undefined>();
  const [selWorkOrder, setSelWorkOrder] = useState<string | undefined>();

  const [woDetail, setWODetail] = useState<WODetail | null>(null);
  const [billReqs, setBillReqs] = useState<BRSummary[]>([]);
  const [woList,   setWOList]   = useState<WorkOrder[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [mode,     setMode]     = useState<"idle" | "overview" | "detail">("idle");

  useEffect(() => {
    apiClient.get("/projects").then(r => setProjects(r.data.projects ?? []));
    apiClient.get("/categories").then(r => setCategories(r.data.categories ?? []));
  }, []);

  useEffect(() => {
    if (!selProject) { setWorkOrders([]); return; }
    apiClient.get(`/work-orders?projectId=${selProject}`).then(r => {
      let wos = r.data.workOrders ?? [];
      if (selCategory) {
        const cat = categories.find(c => c._id === selCategory);
        if (cat) wos = wos.filter((wo: WorkOrder) => wo.category === cat.name);
      }
      setWorkOrders(wos);
    });
  }, [selProject, selCategory, categories]);

  const loadProgress = async () => {
    if (!selProject || !selCategory) { message.warning("Select a Project and Category first"); return; }
    setLoading(true);
    try {
      if (selWorkOrder) {
        const [woR, brR] = await Promise.all([
          apiClient.get(`/work-orders/${selWorkOrder}`),
          apiClient.get(`/bill-requests?workOrderId=${selWorkOrder}`),
        ]);
        setWODetail(woR.data.workOrder ?? null);
        setBillReqs(brR.data.billRequests ?? []);
        setWOList([]);
        setMode("detail");
      } else {
        const cat = categories.find(c => c._id === selCategory);
        const r   = await apiClient.get(`/work-orders?projectId=${selProject}`);
        let wos   = r.data.workOrders ?? [];
        if (cat) wos = wos.filter((w: WorkOrder) => w.category === cat.name);
        setWOList(wos);
        setWODetail(null); setBillReqs([]);
        setMode("overview");
      }
    } catch { message.error("Failed to load progress data"); }
    finally  { setLoading(false); }
  };

  const todayStr   = dayjs().format("YYYY-MM-DD");
  const allEntries = (woDetail?.scopeItems ?? [])
    .flatMap(si => (si.progressEntries ?? []).map(pe => ({ ...pe, unit: si.unit, description: si.description })))
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#111827" }}>Construction Progress</h1>
        <p style={{ color: "#6B7280", marginTop: 4, marginBottom: 0 }}>Track DRI-reported progress, billing stages, and milestone payments.</p>
      </div>

      {/* Filter bar */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4 }}>Project *</div>
          <Select showSearch placeholder="Select project" style={{ width: "100%" }} value={selProject}
            onChange={v => { setSelProject(v); setSelWorkOrder(undefined); setMode("idle"); setWODetail(null); setBillReqs([]); setWOList([]); }}
            filterOption={(i, o) => String(o?.children ?? "").toLowerCase().includes(i.toLowerCase())}>
            {projects.map(p => <Option key={p._id} value={p._id}>{p.name}</Option>)}
          </Select>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4 }}>Category *</div>
          <Select showSearch placeholder="Select category" style={{ width: "100%" }} value={selCategory}
            onChange={v => { setSelCategory(v); setSelWorkOrder(undefined); setMode("idle"); }}
            filterOption={(i, o) => String(o?.children ?? "").toLowerCase().includes(i.toLowerCase())}>
            {categories.map(c => <Option key={c._id} value={c._id}>{c.name}</Option>)}
          </Select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4 }}>Work Order (optional)</div>
          <Select showSearch allowClear placeholder="Select for detailed view" style={{ width: "100%" }} value={selWorkOrder}
            onChange={v => { setSelWorkOrder(v); setMode("idle"); }}
            filterOption={(i, o) => String(o?.children ?? "").toLowerCase().includes(i.toLowerCase())}>
            {workOrders.map(w => <Option key={w._id} value={w._id}>{w.workOrderNo} — {w.vendorName}</Option>)}
          </Select>
        </div>
        <Button type="primary" onClick={loadProgress} style={{ background: "#FF7A00", borderColor: "#FF7A00", height: 32 }}>Load Progress</Button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spin size="large" /></div>
      ) : mode === "idle" ? (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏗️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>No progress data yet</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>Select a project and category, then click Load Progress.</div>
        </div>

      ) : mode === "overview" ? (
        woList.length === 0 ? (
          <Empty description="No work orders found for this project and category." />
        ) : (
          <div>
            <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
              {woList.length} work order{woList.length !== 1 ? "s" : ""} — select one above for detailed stage &amp; milestone view
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {woList.map(wo => (
                <div key={wo._id}
                  style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, cursor: "pointer", transition: "border-color 0.15s" }}
                  onClick={() => { setSelWorkOrder(wo._id); setMode("idle"); }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#FF7A00")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#E5E7EB")}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#111827", fontSize: 14 }}>{wo.workOrderNo}</div>
                      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{wo.vendorName}</div>
                    </div>
                    <span style={{ background: "#F3F4F6", borderRadius: 8, padding: "3px 10px", fontSize: 11, fontWeight: 600, color: "#374151" }}>
                      {wo.category}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, color: "#FF7A00", fontWeight: 700, marginBottom: 10 }}>
                    {fmt(wo.contractValue ?? 0)}
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>Click to view stages &amp; milestones →</div>
                </div>
              ))}
            </div>
          </div>
        )

      ) : woDetail ? (
        <>
          {/* Summary cards */}
          {(() => {
            const si      = woDetail.scopeItems;
            const avgPct  = si.length ? Math.round(si.reduce((s, x) => s + pctOf(x.completedQty, x.plannedQty), 0) / si.length) : 0;
            const billedAmt = si.reduce((s, x) => s + (x.lastBilledQty || 0) * (x.rate || 0), 0);
            const totalAmt  = woDetail.contractValue ?? 0;
            const unbilled  = Math.max(0, totalAmt - billedAmt);
            const milestones = billReqs.filter(b => b.milestoneAchieved).length;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Contract Value",   value: fmt(totalAmt),  color: "#111827",  icon: "📋" },
                  { label: "Overall Progress", value: `${avgPct}%`,   color: avgPct >= 100 ? "#16a34a" : "#FF7A00", icon: "📊" },
                  { label: "Billed Amount",    value: fmt(billedAmt), color: "#3b82f6",  icon: "✅" },
                  { label: "Unbilled",         value: fmt(unbilled),  color: unbilled > 0 ? "#f59e0b" : "#16a34a", icon: "⏳" },
                  { label: "Milestones",       value: `${milestones}`, color: milestones > 0 ? "#FF7A00" : "#9CA3AF", icon: "🏆" },
                ].map(({ label, value, color, icon }) => (
                  <div key={label} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 20px" }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Scope Items progress */}
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ background: "#1F2937", padding: "14px 20px" }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{woDetail.workOrderNo} — {woDetail.vendorName}</div>
              <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>
                {woDetail.projectName}{woDetail.category ? ` · ${woDetail.category}` : ""}{woDetail.subCategory ? ` › ${woDetail.subCategory}` : ""}
              </div>
            </div>
            {woDetail.scopeItems.length === 0 ? (
              <div style={{ padding: 32 }}><Empty description="No scope items defined for this work order." /></div>
            ) : (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F3F4F6" }}>
                        {["#", "Description", "Unit", "Planned", "Completed", "Billed", "Unbilled", "Progress"].map(h => (
                          <th key={h} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", borderBottom: "1px solid #E5E7EB", textAlign: h === "Progress" ? "center" : "left" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {woDetail.scopeItems.map((si, idx) => {
                        const totalPct    = pctOf(si.completedQty, si.plannedQty);
                        const billedPct   = pctOf(si.lastBilledQty || 0, si.plannedQty);
                        const unbilledPct = Math.max(0, totalPct - billedPct);
                        const unbilledQty = Math.max(0, si.completedQty - (si.lastBilledQty || 0));
                        return (
                          <tr key={si._id} style={{ borderBottom: "1px solid #F3F4F6", background: idx % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                            <td style={{ padding: "10px 12px", color: "#9CA3AF", fontSize: 12 }}>{idx + 1}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827", fontSize: 13 }}>{si.description}</td>
                            <td style={{ padding: "10px 12px", color: "#6B7280", fontSize: 12 }}>{si.unit}</td>
                            <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13 }}>{fmtN(si.plannedQty)}</td>
                            <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13, color: si.completedQty > 0 ? "#16a34a" : "#9CA3AF", fontWeight: 600 }}>{fmtN(si.completedQty)}</td>
                            <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13, color: "#3b82f6" }}>{fmtN(si.lastBilledQty || 0)}</td>
                            <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13 }}>
                              {unbilledQty > 0
                                ? <span style={{ color: "#f59e0b", fontWeight: 700 }}>{fmtN(unbilledQty)}</span>
                                : <span style={{ color: "#9CA3AF" }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 12px", minWidth: 180 }}>
                              {/* Dual-layer bar: billed (green) + unbilled (orange) */}
                              <div style={{ position: "relative", height: 10, background: "#E5E7EB", borderRadius: 5, overflow: "hidden" }}>
                                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${billedPct}%`, background: "#16a34a", borderRadius: "5px 0 0 5px" }} />
                                <div style={{ position: "absolute", left: `${billedPct}%`, top: 0, height: "100%", width: `${unbilledPct}%`, background: "#FF7A00" }} />
                              </div>
                              <div style={{ fontSize: 10, color: "#6B7280", marginTop: 3, display: "flex", gap: 6 }}>
                                <span style={{ color: "#16a34a", fontWeight: 700 }}>{billedPct}% billed</span>
                                {unbilledPct > 0 && <span style={{ color: "#FF7A00", fontWeight: 700 }}>+ {unbilledPct}% unbilled</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Footer totals */}
                {(() => {
                  const its    = woDetail.scopeItems;
                  const done   = its.filter(x => pctOf(x.completedQty, x.plannedQty) >= 100).length;
                  const avgPct = Math.round(its.reduce((s, x) => s + pctOf(x.completedQty, x.plannedQty), 0) / (its.length || 1));
                  return (
                    <div style={{ padding: "12px 20px", background: "#F9FAFB", borderTop: "1px solid #E5E7EB", display: "flex", gap: 32, flexWrap: "wrap" }}>
                      {[
                        { label: "Overall", value: `${avgPct}%` },
                        { label: "Complete Items", value: `${done} / ${its.length}` },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Billing Stages Timeline */}
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>Billing Stages</div>
              <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
                {billReqs.filter(b => b.status === "approved").length > 0 && (
                  <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ {billReqs.filter(b => b.status === "approved").length} approved</span>
                )}
                {billReqs.filter(b => b.status === "pending").length > 0 && (
                  <span style={{ color: "#f59e0b", fontWeight: 600 }}>⏳ {billReqs.filter(b => b.status === "pending").length} pending</span>
                )}
                {billReqs.filter(b => b.milestoneAchieved).length > 0 && (
                  <span style={{ color: "#FF7A00", fontWeight: 600 }}>🏆 {billReqs.filter(b => b.milestoneAchieved).length} milestone{billReqs.filter(b => b.milestoneAchieved).length !== 1 ? "s" : ""}</span>
                )}
              </div>
            </div>
            {billReqs.length === 0 ? (
              <div style={{ padding: 40 }}><Empty description="No billing stages submitted yet for this work order." /></div>
            ) : (
              billReqs.map((br) => {
                const stageNum   = br.stageNo ?? 1;
                const color      = BR_STATUS_COLOR[br.status] ?? "#9CA3AF";
                const isMilestone = br.milestoneAchieved;
                const stageIcon  = isMilestone ? "🏆" : br.status === "approved" ? "✅" : br.status === "rejected" ? "❌" : "⏳";
                return (
                  <div key={br._id} style={{ padding: "18px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "flex-start", gap: 16 }}>
                    {/* Stage badge */}
                    <div style={{
                      background: isMilestone ? "#FFF4E8" : br.status === "approved" ? "#f0fdf4" : br.status === "rejected" ? "#fef2f2" : "#FFFBEB",
                      border: `2px solid ${isMilestone ? "#FF7A00" : color}`,
                      borderRadius: 10, padding: "10px 14px", minWidth: 76, textAlign: "center", flexShrink: 0,
                    }}>
                      <div style={{ fontSize: 18, marginBottom: 2 }}>{stageIcon}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" }}>Stage</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: isMilestone ? "#FF7A00" : color }}>{stageNum}</div>
                    </div>

                    {/* Stage details */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "#111827", fontFamily: "monospace" }}>{br.reqNo}</span>
                        <span style={{ background: color, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12, textTransform: "uppercase" }}>
                          {BR_STATUS_LABEL[br.status] ?? br.status}
                        </span>
                        {br.billId && (
                          <span style={{ background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                            Bill: {br.billId.billNo}
                          </span>
                        )}
                        {isMilestone && (
                          <span style={{ background: "#FF7A00", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                            🏆 Payment Released
                          </span>
                        )}
                      </div>

                      {br.periodFrom && (
                        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>
                          📅 Period: {dayjs(br.periodFrom).format("DD MMM YYYY")} → {dayjs(br.periodTo ?? br.createdAt).format("DD MMM YYYY")}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: br.items.length > 0 ? 8 : 0 }}>
                        Submitted: {dayjs(br.createdAt).format("DD MMM YYYY")}
                      </div>

                      {br.items.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {br.items.map((it, i) => (
                            <span key={i} style={{ background: "#F3F4F6", padding: "3px 8px", borderRadius: 6, fontSize: 11, color: "#374151" }}>
                              {it.description}: <strong>{fmtN(it.billedQty)} {it.unit}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Recent DRI Entries */}
          {allEntries.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 14, color: "#111827" }}>
                Recent Progress Entries by DRI
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F9FAFB" }}>
                      {["Date", "Scope Item", "Qty Added", "Remarks"].map(h => (
                        <th key={h} style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allEntries.slice(0, 20).map((e, i) => (
                      <tr key={e._id + i} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                        <td style={{ padding: "9px 16px", fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>
                          {dayjs(e.date).format("DD MMM YYYY")}
                          {dayjs(e.date).format("YYYY-MM-DD") === todayStr && (
                            <span style={{ background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8, marginLeft: 6 }}>Today</span>
                          )}
                        </td>
                        <td style={{ padding: "9px 16px", fontSize: 13, fontWeight: 500, color: "#111827" }}>{e.description}</td>
                        <td style={{ padding: "9px 16px", fontFamily: "monospace", fontSize: 13, color: "#16a34a", fontWeight: 700 }}>
                          +{fmtN(e.qtyAdded)} {e.unit}
                        </td>
                        <td style={{ padding: "9px 16px", fontSize: 12, color: "#6B7280" }}>{e.remarks || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {allEntries.length > 20 && (
                <div style={{ padding: "10px 16px", fontSize: 12, color: "#9CA3AF", borderTop: "1px solid #F3F4F6" }}>
                  Showing latest 20 of {allEntries.length} entries.
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// ── DRI Dashboard ─────────────────────────────────────────────────────────────
function DRIDashboard() {
  const { user } = useAuth();

  const [workOrders, setWorkOrders] = useState<WOSummary[]>([]);
  const [selWOId,    setSelWOId]    = useState<string | undefined>();
  const [woDetail,   setWODetail]   = useState<WODetail | null>(null);
  const [billReqs,   setBillReqs]   = useState<BRSummary[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [woLoading,  setWOLoading]  = useState(false);
  const [saving,     setSaving]     = useState(false);

  const [progModal,   setProgModal]   = useState(false);
  const [progItem,    setProgItem]    = useState<ScopeItemR | null>(null);
  const [progForm]                    = Form.useForm();
  const [billModal,   setBillModal]   = useState(false);
  const [billRemarks, setBillRemarks] = useState("");
  const [editModal,   setEditModal]   = useState(false);
  const [editEntry,   setEditEntry]   = useState<EntryRow | null>(null);
  const [editForm]                    = Form.useForm();
  const [deleting,    setDeleting]    = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiClient.get("/work-orders")
      .then(r => setWorkOrders(r.data.workOrders ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selWOId) { setWODetail(null); setBillReqs([]); return; }
    setWOLoading(true);
    Promise.all([
      apiClient.get(`/work-orders/${selWOId}`),
      apiClient.get(`/bill-requests?workOrderId=${selWOId}`),
    ]).then(([woR, brR]) => {
      setWODetail(woR.data.workOrder);
      setBillReqs(brR.data.billRequests ?? []);
    }).finally(() => setWOLoading(false));
  }, [selWOId]);

  const reloadData = async () => {
    if (!selWOId) return;
    const [woR, brR] = await Promise.all([
      apiClient.get(`/work-orders/${selWOId}`),
      apiClient.get(`/bill-requests?workOrderId=${selWOId}`),
    ]);
    setWODetail(woR.data.workOrder);
    setBillReqs(brR.data.billRequests ?? []);
  };

  const todayStr  = dayjs().format("YYYY-MM-DD");
  const weekStart = dayjs().startOf("isoWeek");

  const allEntries: EntryRow[] = (woDetail?.scopeItems ?? []).flatMap(si =>
    (si.progressEntries ?? []).map(pe => ({
      ...pe, unit: si.unit, description: si.description, scopeId: si._id,
      scopePlanned: si.plannedQty, scopeCompleted: si.completedQty, scopeLastBilled: si.lastBilledQty || 0,
    }))
  ).sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

  const todayQty = allEntries
    .filter(e => dayjs(e.date).format("YYYY-MM-DD") === todayStr)
    .reduce((s, e) => s + e.qtyAdded, 0);

  const weekQty = allEntries
    .filter(e => !dayjs(e.date).isBefore(weekStart))
    .reduce((s, e) => s + e.qtyAdded, 0);

  const pendingBillingQty = (woDetail?.scopeItems ?? [])
    .reduce((s, si) => s + Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)), 0);

  const pendingBillItems = (woDetail?.scopeItems ?? [])
    .map(si => ({ ...si, billedQty: Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)) }))
    .filter(si => si.billedQty > 0);

  const hasPendingRequest = billReqs.some(br => br.status === "pending");

  const handleAddProgress = async () => {
    if (!woDetail || !progItem) return;
    const vals = await progForm.validateFields();
    setSaving(true);
    try {
      await apiClient.post(`/work-orders/${woDetail._id}/scope-items/${progItem._id}/progress`, {
        date:     vals.date ? dayjs(vals.date).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"),
        qtyAdded: vals.qtyAdded,
        remarks:  vals.remarks || "",
      });
      message.success(`Progress recorded: +${fmtN(vals.qtyAdded)} ${progItem.unit}`);
      setProgModal(false);
      progForm.resetFields();
      await reloadData();
    } catch { }
    finally { setSaving(false); }
  };

  const handleBillRequest = async () => {
    if (!woDetail) return;
    if (!pendingBillItems.length) { message.error("No new progress to bill."); return; }
    setSaving(true);
    try {
      const res = await apiClient.post("/bill-requests", { workOrderId: woDetail._id, remarks: billRemarks });
      message.success(res.data?.message || "Bill request submitted successfully");
      setBillModal(false);
      setBillRemarks("");
      await reloadData();
    } catch { }
    finally { setSaving(false); }
  };

  const handleDeleteEntry = async (entry: EntryRow) => {
    setDeleting(entry._id);
    try {
      await apiClient.delete(`/work-orders/${woDetail!._id}/scope-items/${entry.scopeId}/progress/${entry._id}`);
      message.success("Entry deleted");
      await reloadData();
    } catch { }
    finally { setDeleting(null); }
  };

  const handleEditEntry = async () => {
    if (!woDetail || !editEntry) return;
    const vals = await editForm.validateFields();
    setSaving(true);
    try {
      await apiClient.patch(
        `/work-orders/${woDetail._id}/scope-items/${editEntry.scopeId}/progress/${editEntry._id}`,
        { qtyAdded: vals.qtyAdded, date: vals.date ? dayjs(vals.date).format("YYYY-MM-DD") : undefined, remarks: vals.remarks || "" }
      );
      message.success("Entry updated");
      setEditModal(false);
      editForm.resetFields();
      await reloadData();
    } catch { }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
      <Spin size="large" />
    </div>
  );

  return (
    <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>Welcome, {user?.name}</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>Site Progress Dashboard — track your work and submit bill requests</div>
      </div>

      {/* Work Order Selector */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Select Work Order</div>
        <Select
          style={{ width: "100%" }} size="large" showSearch placeholder="Select your assigned work order..."
          value={selWOId} onChange={setSelWOId}
          filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
          options={workOrders.map(wo => ({
            label: `${wo.workOrderNo} — ${wo.projectName}${wo.category ? " (" + wo.category + ")" : ""}`,
            value: wo._id,
          }))}
        />
        {workOrders.length === 0 && (
          <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8 }}>No work orders assigned yet.</div>
        )}
      </div>

      {/* Stats Strip */}
      {selWOId && woDetail && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Today's Progress", value: `${fmtN(todayQty)}`, unit: todayQty > 0 ? (woDetail.scopeItems[0]?.unit || "") : "", color: "#3b82f6", icon: "📅" },
            { label: "This Week",        value: `${fmtN(weekQty)}`,  unit: weekQty > 0 ? (woDetail.scopeItems[0]?.unit || "") : "", color: "#8b5cf6", icon: "📊" },
            { label: "Pending Billing",  value: `${fmtN(pendingBillingQty)}`, unit: "", color: pendingBillingQty > 0 ? "#FF7A00" : "#16a34a", icon: pendingBillingQty > 0 ? "⏳" : "✓" },
            { label: "Stages Submitted", value: `${billReqs.length}`, unit: billReqs.filter(b => b.status === "approved").length + " approved", color: "#16a34a", icon: "🏗" },
          ].map(({ label, value, unit, color, icon }) => (
            <div key={label} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
              {unit && <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>{unit}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Scope Items Progress */}
      {selWOId && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ background: "#1F2937", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{woDetail?.workOrderNo ?? "..."}</div>
              <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>
                {woDetail?.projectName}{woDetail?.category ? ` · ${woDetail.category}` : ""}{woDetail?.subCategory ? ` › ${woDetail.subCategory}` : ""}
              </div>
            </div>
            <Tooltip title={
              hasPendingRequest ? "A bill request is pending admin review" :
              pendingBillItems.length === 0 ? "Record new progress before generating a bill" : ""
            }>
              <Button
                onClick={() => { setBillRemarks(""); setBillModal(true); }}
                disabled={hasPendingRequest || pendingBillItems.length === 0 || !woDetail}
                style={
                  !hasPendingRequest && pendingBillItems.length > 0
                    ? { background: "#FF7A00", borderColor: "#FF7A00", color: "#fff", fontWeight: 600 }
                    : {}
                }
              >
                {hasPendingRequest ? "⏳ Pending Review" : `Generate Bill Request${billReqs.length > 0 ? ` — Stage ${billReqs.length + 1}` : ""}`}
              </Button>
            </Tooltip>
          </div>

          {woLoading ? (
            <div style={{ padding: 40, textAlign: "center" }}><Spin /></div>
          ) : !woDetail?.scopeItems?.length ? (
            <div style={{ padding: 40 }}><Empty description="No scope items defined" /></div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F3F4F6" }}>
                      {["#", "Description", "Unit", "Planned", "Done", "Billed", "Unbilled", "Remaining", "Progress", ""].map(h => (
                        <th key={h} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#374151", textAlign: h === "Progress" ? "center" : "left", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", borderBottom: "1px solid #E5E7EB" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {woDetail.scopeItems.map((si, idx) => {
                      const p = pctOf(si.completedQty, si.plannedQty);
                      const billed   = si.lastBilledQty || 0;
                      const unbilled = Math.max(0, si.completedQty - billed);
                      const rem      = Math.max(0, si.plannedQty - si.completedQty);
                      const isComplete = p >= 100;
                      return (
                        <tr key={si._id} style={{ borderBottom: "1px solid #F3F4F6", background: idx % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                          <td style={{ padding: "10px 12px", color: "#9CA3AF", fontSize: 12 }}>{idx + 1}</td>
                          <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827", fontSize: 13 }}>{si.description}</td>
                          <td style={{ padding: "10px 12px", color: "#6B7280", fontSize: 12 }}>{si.unit}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13 }}>{fmtN(si.plannedQty)}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: si.completedQty > 0 ? "#16a34a" : "#9CA3AF", fontSize: 13 }}>{fmtN(si.completedQty)}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#6B7280", fontSize: 13 }}>{fmtN(billed)}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13 }}>
                            {unbilled > 0
                              ? <span style={{ color: "#FF7A00", fontWeight: 700 }}>{fmtN(unbilled)}</span>
                              : <span style={{ color: "#9CA3AF" }}>—</span>}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: rem > 0 ? "#374151" : "#16a34a", fontSize: 13 }}>{rem > 0 ? fmtN(rem) : "✓ Complete"}</td>
                          <td style={{ padding: "10px 12px", minWidth: 120 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ flex: 1, height: 8, background: "#E5E7EB", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ width: `${p}%`, height: "100%", background: isComplete ? "#16a34a" : "#FF7A00", borderRadius: 4 }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: isComplete ? "#16a34a" : "#FF7A00", minWidth: 30 }}>{p}%</span>
                            </div>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <Button
                              size="small" disabled={isComplete}
                              onClick={() => { setProgItem(si); progForm.resetFields(); progForm.setFieldsValue({ date: dayjs() }); setProgModal(true); }}
                              style={!isComplete ? { background: "#FF7A00", borderColor: "#FF7A00", color: "#fff", fontWeight: 600 } : {}}
                            >
                              {isComplete ? "Done" : "+ Progress"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: "14px 20px", background: "#F9FAFB", borderTop: "1px solid #E5E7EB", display: "flex", gap: 32, flexWrap: "wrap" }}>
                {(() => {
                  const its  = woDetail.scopeItems;
                  const done = its.filter(si => pctOf(si.completedQty, si.plannedQty) >= 100).length;
                  const avgPct = Math.round(its.reduce((s, si) => s + pctOf(si.completedQty, si.plannedQty), 0) / (its.length || 1));
                  const totalUnbilled = its.reduce((s, si) => s + Math.max(0, si.completedQty - (si.lastBilledQty || 0)), 0);
                  return [
                    { label: "Overall Progress", value: `${avgPct}%` },
                    { label: "Items Complete",   value: `${done} / ${its.length}` },
                    { label: "Total Unbilled",   value: totalUnbilled > 0 ? fmtN(totalUnbilled) : "All billed ✓" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#111827", marginTop: 2 }}>{value}</div>
                    </div>
                  ));
                })()}
              </div>
            </>
          )}
        </div>
      )}

      {/* Recent Progress Entries */}
      {selWOId && allEntries.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 14, color: "#111827" }}>
            Recent Progress Entries
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Date", "Scope Item", "Qty Added", "Remarks", ""].map(h => (
                    <th key={h} style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "#6B7280", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allEntries.slice(0, 15).map((e, i) => (
                  <tr key={e._id + i} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                    <td style={{ padding: "9px 16px", fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>
                      {dayjs(e.date).format("DD MMM YYYY")}
                      {dayjs(e.date).format("YYYY-MM-DD") === todayStr && (
                        <Badge count="Today" style={{ background: "#3b82f6", marginLeft: 8, fontSize: 10 }} />
                      )}
                    </td>
                    <td style={{ padding: "9px 16px", fontSize: 13, fontWeight: 500, color: "#111827" }}>{e.description}</td>
                    <td style={{ padding: "9px 16px", fontFamily: "monospace", fontSize: 13, color: "#16a34a", fontWeight: 700 }}>
                      +{fmtN(e.qtyAdded)} {e.unit}
                    </td>
                    <td style={{ padding: "9px 16px", fontSize: 12, color: "#6B7280" }}>{e.remarks || "—"}</td>
                    <td style={{ padding: "9px 16px", whiteSpace: "nowrap" }}>
                      {(() => {
                        const canDelete = e.scopeCompleted - e.qtyAdded >= e.scopeLastBilled;
                        const locked    = !canDelete;
                        return (
                          <div style={{ display: "flex", gap: 4 }}>
                            <Button size="small" type="link" style={{ padding: "0 6px", fontSize: 12 }}
                              onClick={() => {
                                setEditEntry(e);
                                editForm.setFieldsValue({ qtyAdded: e.qtyAdded, date: dayjs(e.date), remarks: e.remarks });
                                setEditModal(true);
                              }}>
                              Edit
                            </Button>
                            <Popconfirm
                              title="Delete this entry?"
                              description={locked ? "This entry is already billed and cannot be deleted." : "This action cannot be undone."}
                              okText={locked ? undefined : "Delete"}
                              okType="danger"
                              cancelText="Cancel"
                              onConfirm={locked ? undefined : () => handleDeleteEntry(e)}
                              okButtonProps={locked ? { style: { display: "none" } } : {}}
                            >
                              <Button size="small" type="link" danger loading={deleting === e._id}
                                style={{ padding: "0 6px", fontSize: 12, opacity: locked ? 0.4 : 1 }}>
                                Delete
                              </Button>
                            </Popconfirm>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {allEntries.length > 15 && (
            <div style={{ padding: "10px 16px", fontSize: 12, color: "#9CA3AF", borderTop: "1px solid #F3F4F6" }}>
              Showing last 15 of {allEntries.length} entries.
            </div>
          )}
        </div>
      )}

      {/* Stage History */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>
            {selWOId ? "Stage History" : "My Bill Requests"}
          </div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>{billReqs.length} stage{billReqs.length !== 1 ? "s" : ""}</div>
        </div>
        {billReqs.length === 0 ? (
          <div style={{ padding: 40 }}>
            <Empty description={selWOId ? "No stages submitted yet for this work order." : "Select a work order to see stages."} />
          </div>
        ) : (
          billReqs.map((br) => {
            const stageNum   = br.stageNo ?? 1;
            const color      = BR_STATUS_COLOR[br.status] ?? "#9CA3AF";
            const isMilestone = br.milestoneAchieved;
            const stageIcon  = isMilestone ? "🏆" : br.status === "approved" ? "✅" : br.status === "rejected" ? "❌" : "⏳";
            return (
              <div key={br._id} style={{ padding: "18px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{
                  background: isMilestone ? "#FFF4E8" : br.status === "approved" ? "#f0fdf4" : br.status === "rejected" ? "#fef2f2" : "#FFF4E8",
                  border: `2px solid ${isMilestone ? "#FF7A00" : color}`,
                  borderRadius: 10, padding: "10px 14px", minWidth: 76, textAlign: "center", flexShrink: 0,
                }}>
                  <div style={{ fontSize: 18, marginBottom: 2 }}>{stageIcon}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" }}>Stage</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: isMilestone ? "#FF7A00" : color }}>{stageNum}</div>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#111827", fontFamily: "monospace" }}>{br.reqNo}</span>
                    <span style={{ background: color, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12, textTransform: "uppercase" }}>
                      {BR_STATUS_LABEL[br.status] ?? br.status}
                    </span>
                    {br.status === "approved" && br.billId && (
                      <span style={{ background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                        Bill: {br.billId.billNo}
                      </span>
                    )}
                    {isMilestone && (
                      <span style={{ background: "#FF7A00", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                        🏆 Payment Released
                      </span>
                    )}
                  </div>

                  {br.periodFrom && (
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                      📅 {dayjs(br.periodFrom).format("DD MMM YYYY")} → {dayjs(br.periodTo ?? br.createdAt).format("DD MMM YYYY")}
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                    {br.items.map(it => `${it.description}: ${fmtN(it.billedQty)} ${it.unit}`).join(" · ")}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Progress Modal */}
      <Modal
        open={progModal} onCancel={() => { setProgModal(false); progForm.resetFields(); }}
        title={`Add Progress — ${progItem?.description}`}
        onOk={handleAddProgress} okText="Save Progress"
        okButtonProps={{ loading: saving, style: { background: "#FF7A00", borderColor: "#FF7A00" } }}
        destroyOnClose
      >
        <Form form={progForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="Date" name="date" rules={[{ required: true, message: "Select date" }]}>
            <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" disabledDate={d => d.isAfter(dayjs(), "day")} />
          </Form.Item>
          <Form.Item
            label={`Quantity Added (${progItem?.unit})`} name="qtyAdded"
            rules={[
              { required: true, type: "number", min: 0.01, message: "Enter a valid quantity" },
              {
                validator: (_: unknown, value: number) => {
                  if (!value || !progItem) return Promise.resolve();
                  const maxAllowed = Math.max(0, progItem.plannedQty - progItem.completedQty);
                  if (value > maxAllowed)
                    return Promise.reject(new Error(`Cannot exceed remaining quantity (${fmtN(maxAllowed)} ${progItem.unit})`));
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber
              style={{ width: "100%" }} min={0.01}
              max={progItem ? Math.max(0, progItem.plannedQty - progItem.completedQty) : undefined}
              placeholder="e.g. 500"
            />
          </Form.Item>
          <Form.Item label="Remarks (optional)" name="remarks">
            <Input.TextArea rows={2} placeholder="Notes for today's work..." />
          </Form.Item>
          {progItem && (
            <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: 12, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#6B7280" }}>Planned</span>
                <strong>{fmtN(progItem.plannedQty)} {progItem.unit}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ color: "#6B7280" }}>Done</span>
                <strong style={{ color: "#16a34a" }}>{fmtN(progItem.completedQty)} {progItem.unit}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ color: "#6B7280" }}>Remaining</span>
                <strong style={{ color: "#FF7A00" }}>{fmtN(Math.max(0, progItem.plannedQty - progItem.completedQty))} {progItem.unit}</strong>
              </div>
            </div>
          )}
        </Form>
      </Modal>

      {/* Edit Entry Modal */}
      <Modal
        open={editModal} onCancel={() => { setEditModal(false); editForm.resetFields(); }}
        title="Edit Progress Entry"
        onOk={handleEditEntry} okText="Save Changes"
        okButtonProps={{ loading: saving, style: { background: "#FF7A00", borderColor: "#FF7A00" } }}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="Date" name="date">
            <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" disabledDate={d => d.isAfter(dayjs(), "day")} />
          </Form.Item>
          <Form.Item
            label={`Quantity Added (${editEntry?.unit})`} name="qtyAdded"
            rules={[
              { required: true, type: "number", min: 0.01, message: "Enter a valid quantity" },
              {
                validator: (_: unknown, value: number) => {
                  if (!value || !editEntry) return Promise.resolve();
                  const otherTotal = editEntry.scopeCompleted - editEntry.qtyAdded;
                  const maxAllowed = editEntry.scopePlanned - otherTotal;
                  const minRequired = Math.max(0, editEntry.scopeLastBilled - otherTotal);
                  if (value > maxAllowed)
                    return Promise.reject(new Error(`Max allowed: ${fmtN(maxAllowed)} ${editEntry.unit} (planned limit)`));
                  if (minRequired > 0 && value < minRequired)
                    return Promise.reject(new Error(`Min allowed: ${fmtN(minRequired)} ${editEntry.unit} (already billed)`));
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber style={{ width: "100%" }} min={0.01} placeholder="e.g. 500" />
          </Form.Item>
          <Form.Item label="Remarks (optional)" name="remarks">
            <Input.TextArea rows={2} />
          </Form.Item>
          {editEntry && (() => {
            const otherTotal = editEntry.scopeCompleted - editEntry.qtyAdded;
            const maxAllowed = editEntry.scopePlanned - otherTotal;
            const minRequired = Math.max(0, editEntry.scopeLastBilled - otherTotal);
            return (
              <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: 12, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#6B7280" }}>Scope item</span>
                  <strong>{editEntry.description}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ color: "#6B7280" }}>Max qty for this entry</span>
                  <strong style={{ color: "#FF7A00" }}>{fmtN(maxAllowed)} {editEntry.unit}</strong>
                </div>
                {editEntry.scopeLastBilled > 0 && minRequired > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ color: "#6B7280" }}>Min qty (already billed)</span>
                    <strong style={{ color: "#3b82f6" }}>{fmtN(minRequired)} {editEntry.unit}</strong>
                  </div>
                )}
              </div>
            );
          })()}
        </Form>
      </Modal>

      {/* Bill Request Modal */}
      <Modal
        open={billModal} onCancel={() => setBillModal(false)}
        title={`Generate Bill Request — Stage ${billReqs.length + 1}`}
        onOk={handleBillRequest} okText={`Submit Stage ${billReqs.length + 1} Bill Request`}
        width={640}
        okButtonProps={{ loading: saving, style: { background: "#FF7A00", borderColor: "#FF7A00" }, disabled: pendingBillItems.length === 0 }}
        destroyOnClose
      >
        <div style={{ marginTop: 8 }}>
          {billReqs.length > 0 && billReqs[billReqs.length - 1]?.periodTo && (
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
              Period: <strong>{dayjs(billReqs[billReqs.length - 1].periodTo).format("DD MMM YYYY")}</strong> → <strong>{dayjs().format("DD MMM YYYY")}</strong>
            </div>
          )}
          <div style={{ padding: 12, background: "#FFF4E8", border: "1px solid #FED7AA", borderRadius: 8, marginBottom: 16, fontSize: 12, color: "#92400e" }}>
            <strong>Auto-calculated</strong> — quantities are computed from your work progress since the last billing.
          </div>
          {pendingBillItems.length === 0 ? (
            <Empty description="No new progress to bill. Record progress first." />
          ) : (
            <div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
                <thead>
                  <tr style={{ background: "#1F2937", color: "#fff" }}>
                    {["Scope Item", "Unit", "Last Billed", "Total Done", "Billing Now"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", fontSize: 11, textAlign: "left", fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pendingBillItems.map((si, i) => (
                    <tr key={si._id} style={{ borderBottom: "1px solid #E5E7EB", background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                      <td style={{ padding: "9px 12px", fontWeight: 600, fontSize: 13, color: "#111827" }}>{si.description}</td>
                      <td style={{ padding: "9px 12px", fontSize: 12, color: "#6B7280" }}>{si.unit}</td>
                      <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 13, color: "#6B7280" }}>{fmtN(si.lastBilledQty || 0)}</td>
                      <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 13, color: "#374151" }}>{fmtN(si.completedQty)}</td>
                      <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 14, color: "#FF7A00", fontWeight: 800 }}>{fmtN(si.billedQty)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#F9FAFB", borderTop: "2px solid #FF7A00" }}>
                    <td colSpan={4} style={{ padding: "8px 12px", fontWeight: 700, color: "#374151", fontSize: 12 }}>Total items: {pendingBillItems.length}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontWeight: 800, color: "#FF7A00", fontSize: 14 }}>
                      {fmtN(pendingBillItems.reduce((s, si) => s + si.billedQty, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Remarks (optional)</div>
                <Input.TextArea rows={2} placeholder="Any notes for this bill request..."
                  value={billRemarks} onChange={e => setBillRemarks(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ── Router wrapper ────────────────────────────────────────────────────────────
export default function WorkProgress() {
  const { user } = useAuth();
  return user?.role === "dri" ? <DRIDashboard /> : <WorkProgressAdmin />;
}
