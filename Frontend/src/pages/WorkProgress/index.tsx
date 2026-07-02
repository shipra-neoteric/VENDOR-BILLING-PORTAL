import { useState, useEffect, useMemo } from "react";
import {
  Select, Button, Modal, Form, Input, InputNumber,
  Tooltip, message, Spin, Empty, DatePicker, Badge, Popconfirm,
} from "antd";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";

dayjs.extend(isoWeek);

// ── Shared types ──────────────────────────────────────────────────────────────
interface Project   { _id: string; name: string; code: string; }
interface Category  { _id: string; name: string; color: string; }
interface WorkOrder { _id: string; workOrderNo: string; vendorName: string; contractValue: number; category: string; projectName?: string; }
interface ProgressEntry {
  _id: string; date: string; qtyAdded: number; remarks?: string;
  tower?: string; floor?: string; flatNo?: string; plotNo?: string; locationNote?: string;
}
interface ScopeItemR {
  _id: string; description: string; unit: string;
  plannedQty: number; completedQty: number; lastBilledQty: number;
  rate: number; progressEntries?: ProgressEntry[];
}
interface WOSummary {
  _id: string; workOrderNo: string; projectName: string;
  projectId?: { _id: string; name: string; code: string; projectType?: string } | string;
  category?: string; subCategory?: string; vendorName?: string; vendorCode?: string;
}
interface WODetail  {
  _id: string; workOrderNo: string; projectName: string;
  projectId?: { _id: string; name: string; code: string; projectType?: string };
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
type EntryRow = ProgressEntry & {
  unit: string; description: string; scopeId: string;
  scopePlanned: number; scopeCompleted: number; scopeLastBilled: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtN  = (n: number) => n.toLocaleString("en-IN");
const fmt   = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const pctOf = (c: number, p: number) => p > 0 ? Math.min(100, Math.round((c / p) * 100)) : 0;

const BR_STATUS_COLOR: Record<string, string> = { pending: "#f59e0b", approved: "#16a34a", rejected: "#ef4444" };
const BR_STATUS_LABEL: Record<string, string> = { pending: "Pending Review", approved: "Approved", rejected: "Rejected" };

function getProjId(wo: WOSummary): string | undefined {
  if (!wo.projectId) return undefined;
  if (typeof wo.projectId === "string") return wo.projectId;
  return wo.projectId._id;
}

function formatLocation(e: EntryRow, pt: string): string {
  if (pt === "apartment") {
    const parts = [
      e.tower && `Tower ${e.tower}`,
      e.floor && `Floor ${e.floor}`,
      e.flatNo && `Flat ${e.flatNo}`,
    ].filter(Boolean) as string[];
    if (parts.length) return parts.join(", ");
    return e.locationNote || "—";
  }
  if (e.plotNo) return `Plot ${e.plotNo}`;
  return e.locationNote || "—";
}

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
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--nx-text)" }}>Construction Progress</h1>
        <p style={{ color: "var(--nx-text-2)", marginTop: 4, marginBottom: 0 }}>Track DRI-reported progress, billing stages, and milestone payments.</p>
      </div>

      {/* Filter bar */}
      <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--nx-text-2)", marginBottom: 4 }}>Project *</div>
          <Select showSearch placeholder="Select project" style={{ width: "100%" }} value={selProject}
            onChange={v => { setSelProject(v); setSelWorkOrder(undefined); setMode("idle"); setWODetail(null); setBillReqs([]); setWOList([]); }}
            filterOption={(i, o) => String(o?.children ?? "").toLowerCase().includes(i.toLowerCase())}>
            {projects.map(p => <Select.Option key={p._id} value={p._id}>{p.name}</Select.Option>)}
          </Select>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--nx-text-2)", marginBottom: 4 }}>Category *</div>
          <Select showSearch placeholder="Select category" style={{ width: "100%" }} value={selCategory}
            onChange={v => { setSelCategory(v); setSelWorkOrder(undefined); setMode("idle"); }}
            filterOption={(i, o) => String(o?.children ?? "").toLowerCase().includes(i.toLowerCase())}>
            {categories.map(c => <Select.Option key={c._id} value={c._id}>{c.name}</Select.Option>)}
          </Select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--nx-text-2)", marginBottom: 4 }}>Work Order (optional)</div>
          <Select showSearch allowClear placeholder="Select for detailed view" style={{ width: "100%" }} value={selWorkOrder}
            onChange={v => { setSelWorkOrder(v); setMode("idle"); }}
            filterOption={(i, o) => String(o?.children ?? "").toLowerCase().includes(i.toLowerCase())}>
            {workOrders.map(w => <Select.Option key={w._id} value={w._id}>{w.workOrderNo} — {w.vendorName}</Select.Option>)}
          </Select>
        </div>
        <Button type="primary" onClick={loadProgress} style={{ background: "#FF7A00", borderColor: "#FF7A00", height: 32 }}>Load Progress</Button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spin size="large" /></div>
      ) : mode === "idle" ? (
        <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏗️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--nx-text-3)" }}>No progress data yet</div>
          <div style={{ fontSize: 13, color: "var(--nx-text-muted)", marginTop: 4 }}>Select a project and category, then click Load Progress.</div>
        </div>

      ) : mode === "overview" ? (
        woList.length === 0 ? (
          <Empty description="No work orders found for this project and category." />
        ) : (
          <div>
            <div style={{ fontSize: 13, color: "var(--nx-text-2)", marginBottom: 16 }}>
              {woList.length} work order{woList.length !== 1 ? "s" : ""} — select one above for detailed stage &amp; milestone view
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {woList.map(wo => (
                <div key={wo._id}
                  style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: 20, cursor: "pointer", transition: "border-color 0.15s" }}
                  onClick={() => { setSelWorkOrder(wo._id); setMode("idle"); }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#FF7A00")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--nx-border)")}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--nx-text)", fontSize: 14 }}>{wo.workOrderNo}</div>
                      <div style={{ fontSize: 12, color: "var(--nx-text-2)", marginTop: 2 }}>{wo.vendorName}</div>
                    </div>
                    <span style={{ background: "var(--nx-fill)", borderRadius: 8, padding: "3px 10px", fontSize: 11, fontWeight: 600, color: "var(--nx-text-3)" }}>
                      {wo.category}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, color: "#FF7A00", fontWeight: 700, marginBottom: 10 }}>
                    {fmt(wo.contractValue ?? 0)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--nx-text-muted)" }}>Click to view stages &amp; milestones →</div>
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
                  { label: "Contract Value",   value: fmt(totalAmt),  color: "var(--nx-text)",  icon: "📋" },
                  { label: "Overall Progress", value: `${avgPct}%`,   color: avgPct >= 100 ? "#16a34a" : "#FF7A00", icon: "📊" },
                  { label: "Billed Amount",    value: fmt(billedAmt), color: "#3b82f6",  icon: "✅" },
                  { label: "Unbilled",         value: fmt(unbilled),  color: unbilled > 0 ? "#f59e0b" : "#16a34a", icon: "⏳" },
                  { label: "Milestones",       value: `${milestones}`, color: milestones > 0 ? "#FF7A00" : "var(--nx-text-muted)", icon: "🏆" },
                ].map(({ label, value, color, icon }) => (
                  <div key={label} style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "16px 20px" }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                    <div style={{ fontSize: 10, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Scope Items progress */}
          <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
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
                      <tr style={{ background: "var(--nx-fill-2)" }}>
                        {["#", "Description", "Unit", "Planned", "Completed", "Billed", "Unbilled", "Progress"].map(h => (
                          <th key={h} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--nx-table-header-color)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", borderBottom: "1px solid var(--nx-border)", textAlign: h === "Progress" ? "center" : "left" }}>{h}</th>
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
                          <tr key={si._id} style={{ borderBottom: "1px solid var(--nx-border)", background: idx % 2 === 0 ? "var(--nx-white)" : "var(--nx-fill-2)" }}>
                            <td style={{ padding: "10px 12px", color: "var(--nx-text-muted)", fontSize: 12 }}>{idx + 1}</td>
                            <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--nx-text)", fontSize: 13 }}>{si.description}</td>
                            <td style={{ padding: "10px 12px", color: "var(--nx-text-2)", fontSize: 12 }}>{si.unit}</td>
                            <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13, color: "var(--nx-text)" }}>{fmtN(si.plannedQty)}</td>
                            <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13, color: si.completedQty > 0 ? "#16a34a" : "var(--nx-text-muted)", fontWeight: 600 }}>{fmtN(si.completedQty)}</td>
                            <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13, color: "#3b82f6" }}>{fmtN(si.lastBilledQty || 0)}</td>
                            <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13 }}>
                              {unbilledQty > 0
                                ? <span style={{ color: "#f59e0b", fontWeight: 700 }}>{fmtN(unbilledQty)}</span>
                                : <span style={{ color: "var(--nx-text-muted)" }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 12px", minWidth: 180 }}>
                              <div style={{ position: "relative", height: 10, background: "var(--nx-border)", borderRadius: 5, overflow: "hidden" }}>
                                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${billedPct}%`, background: "#16a34a", borderRadius: "5px 0 0 5px" }} />
                                <div style={{ position: "absolute", left: `${billedPct}%`, top: 0, height: "100%", width: `${unbilledPct}%`, background: "#FF7A00" }} />
                              </div>
                              <div style={{ fontSize: 10, color: "var(--nx-text-2)", marginTop: 3, display: "flex", gap: 6 }}>
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
                {(() => {
                  const its    = woDetail.scopeItems;
                  const done   = its.filter(x => pctOf(x.completedQty, x.plannedQty) >= 100).length;
                  const avgPct = Math.round(its.reduce((s, x) => s + pctOf(x.completedQty, x.plannedQty), 0) / (its.length || 1));
                  return (
                    <div style={{ padding: "12px 20px", background: "var(--nx-fill-2)", borderTop: "1px solid var(--nx-border)", display: "flex", gap: 32, flexWrap: "wrap" }}>
                      {[
                        { label: "Overall", value: `${avgPct}%` },
                        { label: "Complete Items", value: `${done} / ${its.length}` },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={{ fontSize: 10, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--nx-text)" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Billing Stages */}
          <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--nx-border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--nx-text)" }}>Billing Stages</div>
              <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
                {billReqs.filter(b => b.status === "approved").length > 0 && (
                  <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ {billReqs.filter(b => b.status === "approved").length} approved</span>
                )}
                {billReqs.filter(b => b.status === "pending").length > 0 && (
                  <span style={{ color: "#f59e0b", fontWeight: 600 }}>⏳ {billReqs.filter(b => b.status === "pending").length} pending</span>
                )}
              </div>
            </div>
            {billReqs.length === 0 ? (
              <div style={{ padding: 40 }}><Empty description="No billing stages submitted yet." /></div>
            ) : (
              billReqs.map(br => {
                const color = BR_STATUS_COLOR[br.status] ?? "#9CA3AF";
                const isMilestone = br.milestoneAchieved;
                const icon = isMilestone ? "🏆" : br.status === "approved" ? "✅" : br.status === "rejected" ? "❌" : "⏳";
                return (
                  <div key={br._id} style={{ padding: "18px 20px", borderBottom: "1px solid var(--nx-border)", display: "flex", alignItems: "flex-start", gap: 16 }}>
                    <div style={{
                      background: isMilestone ? "#FFF4E8" : br.status === "approved" ? "#f0fdf4" : br.status === "rejected" ? "#fef2f2" : "#FFFBEB",
                      border: `2px solid ${isMilestone ? "#FF7A00" : color}`,
                      borderRadius: 10, padding: "10px 14px", minWidth: 76, textAlign: "center", flexShrink: 0,
                    }}>
                      <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase" }}>Stage</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: isMilestone ? "#FF7A00" : color }}>{br.stageNo ?? 1}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--nx-text)", fontFamily: "monospace" }}>{br.reqNo}</span>
                        <span style={{ background: color, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12, textTransform: "uppercase" }}>
                          {BR_STATUS_LABEL[br.status] ?? br.status}
                        </span>
                        {br.billId && (
                          <span style={{ background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>Bill: {br.billId.billNo}</span>
                        )}
                      </div>
                      {br.periodFrom && (
                        <div style={{ fontSize: 12, color: "var(--nx-text-2)", marginBottom: 6 }}>
                          📅 {dayjs(br.periodFrom).format("DD MMM YYYY")} → {dayjs(br.periodTo ?? br.createdAt).format("DD MMM YYYY")}
                        </div>
                      )}
                      {br.items.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {br.items.map((it, i) => (
                            <span key={i} style={{ background: "var(--nx-fill)", padding: "3px 8px", borderRadius: 6, fontSize: 11, color: "var(--nx-text-3)" }}>
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
            <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--nx-border)", fontWeight: 700, fontSize: 14, color: "var(--nx-text)" }}>
                Recent Progress Entries by DRI
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--nx-fill-2)" }}>
                      {["Date", "Scope Item", "Location", "Qty Added", "Remarks"].map(h => (
                        <th key={h} style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "var(--nx-text-2)", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--nx-border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allEntries.slice(0, 20).map((e, i) => {
                      const loc = formatLocation(e as EntryRow, (woDetail as any)?.projectId?.projectType || "apartment");
                      return (
                        <tr key={e._id + i} style={{ borderBottom: "1px solid var(--nx-border)", background: i % 2 === 0 ? "var(--nx-white)" : "var(--nx-fill-2)" }}>
                          <td style={{ padding: "9px 16px", fontSize: 13, color: "var(--nx-text-3)", whiteSpace: "nowrap" }}>
                            {dayjs(e.date).format("DD MMM YYYY")}
                            {dayjs(e.date).format("YYYY-MM-DD") === todayStr && (
                              <span style={{ background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8, marginLeft: 6 }}>Today</span>
                            )}
                          </td>
                          <td style={{ padding: "9px 16px", fontSize: 13, fontWeight: 500, color: "var(--nx-text)" }}>{e.description}</td>
                          <td style={{ padding: "9px 16px", fontSize: 12, color: "var(--nx-text-2)" }}>{loc}</td>
                          <td style={{ padding: "9px 16px", fontFamily: "monospace", fontSize: 13, color: "#16a34a", fontWeight: 700 }}>
                            +{fmtN(e.qtyAdded)} {e.unit}
                          </td>
                          <td style={{ padding: "9px 16px", fontSize: 12, color: "var(--nx-text-2)" }}>{e.remarks || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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

  // All work orders for this DRI (loaded once)
  const [allWOs,   setAllWOs]   = useState<WOSummary[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [woLoading,setWOLoading]= useState(false);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Cascading selection
  const [selVendorCode, setSelVendorCode] = useState<string | undefined>();
  const [selProjectId,  setSelProjectId]  = useState<string | undefined>();
  const [selWOId,       setSelWOId]       = useState<string | undefined>();

  // Loaded detail
  const [woDetail, setWODetail] = useState<WODetail | null>(null);
  const [billReqs, setBillReqs] = useState<BRSummary[]>([]);

  // Modals
  const [progModal,   setProgModal]   = useState(false);
  const [progItem,    setProgItem]    = useState<ScopeItemR | null>(null);
  const [progForm]                    = Form.useForm();
  const [billModal,   setBillModal]   = useState(false);
  const [billRemarks, setBillRemarks] = useState("");
  const [editModal,   setEditModal]   = useState(false);
  const [editEntry,   setEditEntry]   = useState<EntryRow | null>(null);
  const [editForm]                    = Form.useForm();

  // ── Load all assigned WOs once ────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    apiClient.get("/work-orders")
      .then(r => setAllWOs(r.data.workOrders ?? []))
      .finally(() => setLoading(false));
  }, []);

  // ── Derived: unique vendors ───────────────────────────────────────────────
  const vendors = useMemo(() => {
    const seen = new Set<string>();
    return allWOs.reduce<{ code: string; name: string }[]>((acc, wo) => {
      if (wo.vendorCode && !seen.has(wo.vendorCode)) {
        seen.add(wo.vendorCode);
        acc.push({ code: wo.vendorCode, name: wo.vendorName || wo.vendorCode });
      }
      return acc;
    }, []);
  }, [allWOs]);

  // ── Derived: projects for selected vendor ─────────────────────────────────
  const vendorProjects = useMemo(() => {
    if (!selVendorCode) return [];
    const seen = new Set<string>();
    return allWOs
      .filter(wo => wo.vendorCode === selVendorCode)
      .reduce<{ id: string; name: string }[]>((acc, wo) => {
        const pid = getProjId(wo);
        if (pid && !seen.has(pid)) {
          seen.add(pid);
          acc.push({ id: pid, name: wo.projectName });
        }
        return acc;
      }, []);
  }, [allWOs, selVendorCode]);

  // ── Derived: WOs for the full chain ──────────────────────────────────────
  const chainWOs = useMemo(() =>
    allWOs.filter(wo =>
      (!selVendorCode || wo.vendorCode === selVendorCode) &&
      (!selProjectId || getProjId(wo) === selProjectId)
    ),
    [allWOs, selVendorCode, selProjectId]
  );

  // ── Load WO detail when selected ─────────────────────────────────────────
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
  const projectType: "apartment" | "plot" = (woDetail as any)?.projectId?.projectType || "apartment";

  // Flatten + sort entries
  const allEntries: EntryRow[] = (woDetail?.scopeItems ?? []).flatMap(si =>
    (si.progressEntries ?? []).map(pe => ({
      ...pe, unit: si.unit, description: si.description, scopeId: si._id,
      scopePlanned: si.plannedQty, scopeCompleted: si.completedQty, scopeLastBilled: si.lastBilledQty || 0,
    }))
  ).sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

  const todayQty = allEntries.filter(e => dayjs(e.date).format("YYYY-MM-DD") === todayStr).reduce((s, e) => s + e.qtyAdded, 0);
  const weekQty  = allEntries.filter(e => !dayjs(e.date).isBefore(weekStart)).reduce((s, e) => s + e.qtyAdded, 0);

  const pendingBillingQty = (woDetail?.scopeItems ?? [])
    .reduce((s, si) => s + Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)), 0);

  const pendingBillItems = (woDetail?.scopeItems ?? [])
    .map(si => ({ ...si, billedQty: Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)) }))
    .filter(si => si.billedQty > 0);

  const hasPendingRequest = billReqs.some(br => br.status === "pending");

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAddProgress = async () => {
    if (!woDetail || !progItem) return;
    const vals = await progForm.validateFields();
    setSaving(true);
    try {
      await apiClient.post(`/work-orders/${woDetail._id}/scope-items/${progItem._id}/progress`, {
        date:         vals.date ? dayjs(vals.date).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"),
        qtyAdded:     vals.qtyAdded,
        remarks:      vals.remarks || "",
        tower:        vals.tower || "",
        floor:        vals.floor || "",
        flatNo:       vals.flatNo || "",
        plotNo:       vals.plotNo || "",
        locationNote: vals.locationNote || "",
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
      setBillModal(false); setBillRemarks("");
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
        {
          qtyAdded:     vals.qtyAdded,
          date:         vals.date ? dayjs(vals.date).format("YYYY-MM-DD") : undefined,
          remarks:      vals.remarks || "",
          tower:        vals.tower || "",
          floor:        vals.floor || "",
          flatNo:       vals.flatNo || "",
          plotNo:       vals.plotNo || "",
          locationNote: vals.locationNote || "",
        }
      );
      message.success("Entry updated");
      setEditModal(false); editForm.resetFields();
      await reloadData();
    } catch { }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
      <Spin size="large" />
    </div>
  );

  // ── Location form fields ─────────────────────────────────────────────────
  const LocationFields = ({ pt }: { pt: string }) => (
    <div style={{ background: "var(--nx-fill-2)", border: "1px solid var(--nx-border)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
        📍 Location (optional)
      </div>
      {pt === "apartment" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <Form.Item label="Tower" name="tower" style={{ marginBottom: 0 }}>
            <Input placeholder="e.g. A, T1" size="small" />
          </Form.Item>
          <Form.Item label="Floor" name="floor" style={{ marginBottom: 0 }}>
            <Input placeholder="e.g. G, 1, 2" size="small" />
          </Form.Item>
          <Form.Item label="Flat No" name="flatNo" style={{ marginBottom: 0 }}>
            <Input placeholder="e.g. 101" size="small" />
          </Form.Item>
        </div>
      ) : (
        <Form.Item label="Plot No" name="plotNo" style={{ marginBottom: 0 }}>
          <Input placeholder="e.g. Plot-42, P-7" />
        </Form.Item>
      )}
      <Form.Item label="Note" name="locationNote" style={{ marginBottom: 0, marginTop: 8 }}>
        <Input placeholder="Additional location details..." size="small" />
      </Form.Item>
    </div>
  );

  return (
    <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--nx-text)" }}>Welcome, {user?.name}</div>
        <div style={{ fontSize: 13, color: "var(--nx-text-2)", marginTop: 2 }}>Site Progress Dashboard — track your work and submit bill requests</div>
      </div>

      {/* Selection Chain */}
      <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>Select Work Context</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--nx-text-2)", marginBottom: 4, fontWeight: 500 }}>1. Vendor</div>
            <Select
              style={{ width: "100%" }} size="large" showSearch allowClear
              placeholder="Select vendor…"
              value={selVendorCode}
              onChange={v => { setSelVendorCode(v); setSelProjectId(undefined); setSelWOId(undefined); setWODetail(null); setBillReqs([]); }}
              options={vendors.map(v => ({ label: `${v.code} — ${v.name}`, value: v.code }))}
              filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--nx-text-2)", marginBottom: 4, fontWeight: 500 }}>2. Project</div>
            <Select
              style={{ width: "100%" }} size="large" showSearch allowClear
              placeholder={selVendorCode ? "Select project…" : "Select vendor first"}
              disabled={!selVendorCode}
              value={selProjectId}
              onChange={v => { setSelProjectId(v); setSelWOId(undefined); setWODetail(null); setBillReqs([]); }}
              options={vendorProjects.map(p => ({ label: p.name, value: p.id }))}
              filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--nx-text-2)", marginBottom: 4, fontWeight: 500 }}>3. Work Order</div>
            <Select
              style={{ width: "100%" }} size="large" showSearch allowClear
              placeholder={selProjectId ? "Select work order…" : "Select project first"}
              disabled={!selProjectId}
              value={selWOId}
              onChange={setSelWOId}
              options={chainWOs.map(wo => ({ label: `${wo.workOrderNo}${wo.category ? " · " + wo.category : ""}`, value: wo._id }))}
              filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
            />
          </div>
        </div>
        {allWOs.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--nx-text-muted)", marginTop: 8 }}>No work orders assigned to you yet.</div>
        )}
      </div>

      {/* Stats Strip */}
      {selWOId && woDetail && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Today's Progress", value: fmtN(todayQty),         color: "#3b82f6", icon: "📅" },
            { label: "This Week",        value: fmtN(weekQty),           color: "#8b5cf6", icon: "📊" },
            { label: "Pending Billing",  value: fmtN(pendingBillingQty), color: pendingBillingQty > 0 ? "#FF7A00" : "#16a34a", icon: pendingBillingQty > 0 ? "⏳" : "✓" },
            { label: "Stages",           value: String(billReqs.length), color: "#16a34a", icon: "🏗" },
          ].map(({ label, value, color, icon }) => (
            <div key={label} style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontSize: 10, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Scope Items Table */}
      {selWOId && (
        <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ background: "#1F2937", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{woDetail?.workOrderNo ?? "…"}</div>
              <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>
                {woDetail?.projectName}{woDetail?.category ? ` · ${woDetail.category}` : ""}
                {projectType === "apartment" ? " 🏢" : " 🏠"}
              </div>
            </div>
            <Tooltip title={
              hasPendingRequest ? "A bill request is pending admin review" :
              pendingBillItems.length === 0 ? "Record new progress before generating a bill" : ""
            }>
              <Button
                onClick={() => { setBillRemarks(""); setBillModal(true); }}
                disabled={hasPendingRequest || pendingBillItems.length === 0 || !woDetail}
                style={!hasPendingRequest && pendingBillItems.length > 0
                  ? { background: "#FF7A00", borderColor: "#FF7A00", color: "#fff", fontWeight: 600 }
                  : {}}
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
                    <tr style={{ background: "var(--nx-fill-2)" }}>
                      {["#", "Description", "Unit", "Planned", "Done", "Billed", "Unbilled", "Remaining", "Progress", ""].map(h => (
                        <th key={h} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--nx-table-header-color)", textAlign: h === "Progress" ? "center" : "left", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", borderBottom: "1px solid var(--nx-border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {woDetail.scopeItems.map((si, idx) => {
                      const p = pctOf(si.completedQty, si.plannedQty);
                      const billed   = si.lastBilledQty || 0;
                      const unbilled = Math.max(0, si.completedQty - billed);
                      const rem      = Math.max(0, si.plannedQty - si.completedQty);
                      const isDone   = p >= 100;
                      return (
                        <tr key={si._id} style={{ borderBottom: "1px solid var(--nx-border)", background: idx % 2 === 0 ? "var(--nx-white)" : "var(--nx-fill-2)" }}>
                          <td style={{ padding: "10px 12px", color: "var(--nx-text-muted)", fontSize: 12 }}>{idx + 1}</td>
                          <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--nx-text)", fontSize: 13 }}>{si.description}</td>
                          <td style={{ padding: "10px 12px", color: "var(--nx-text-2)", fontSize: 12 }}>{si.unit}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13, color: "var(--nx-text)" }}>{fmtN(si.plannedQty)}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: si.completedQty > 0 ? "#16a34a" : "var(--nx-text-muted)", fontSize: 13 }}>{fmtN(si.completedQty)}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "var(--nx-text-2)", fontSize: 13 }}>{fmtN(billed)}</td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13 }}>
                            {unbilled > 0 ? <span style={{ color: "#FF7A00", fontWeight: 700 }}>{fmtN(unbilled)}</span> : <span style={{ color: "var(--nx-text-muted)" }}>—</span>}
                          </td>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: rem > 0 ? "var(--nx-text-3)" : "#16a34a", fontSize: 13 }}>
                            {rem > 0 ? fmtN(rem) : "✓ Complete"}
                          </td>
                          <td style={{ padding: "10px 12px", minWidth: 120 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ flex: 1, height: 8, background: "var(--nx-border)", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ width: `${p}%`, height: "100%", background: isDone ? "#16a34a" : "#FF7A00", borderRadius: 4 }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: isDone ? "#16a34a" : "#FF7A00", minWidth: 30 }}>{p}%</span>
                            </div>
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <Button
                              size="small" disabled={isDone}
                              onClick={() => { setProgItem(si); progForm.resetFields(); progForm.setFieldsValue({ date: dayjs() }); setProgModal(true); }}
                              style={!isDone ? { background: "#FF7A00", borderColor: "#FF7A00", color: "#fff", fontWeight: 600 } : {}}
                            >
                              {isDone ? "Done" : "+ Progress"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: "14px 20px", background: "var(--nx-fill-2)", borderTop: "1px solid var(--nx-border)", display: "flex", gap: 32, flexWrap: "wrap" }}>
                {(() => {
                  const its     = woDetail.scopeItems;
                  const done    = its.filter(si => pctOf(si.completedQty, si.plannedQty) >= 100).length;
                  const avgPct  = Math.round(its.reduce((s, si) => s + pctOf(si.completedQty, si.plannedQty), 0) / (its.length || 1));
                  const unbilledTotal = its.reduce((s, si) => s + Math.max(0, si.completedQty - (si.lastBilledQty || 0)), 0);
                  return [
                    { label: "Overall Progress", value: `${avgPct}%` },
                    { label: "Items Complete",   value: `${done} / ${its.length}` },
                    { label: "Total Unbilled",   value: unbilledTotal > 0 ? fmtN(unbilledTotal) : "All billed ✓" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: 10, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--nx-text)", marginTop: 2 }}>{value}</div>
                    </div>
                  ));
                })()}
              </div>
            </>
          )}
        </div>
      )}

      {/* Progress Entries Table */}
      {selWOId && allEntries.length > 0 && (
        <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--nx-border)", fontWeight: 700, fontSize: 14, color: "var(--nx-text)" }}>
            Recent Progress Entries
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--nx-fill-2)" }}>
                  {["Date", "Scope Item", "Location", "Qty Added", "Remarks", ""].map(h => (
                    <th key={h} style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, color: "var(--nx-text-2)", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--nx-border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allEntries.slice(0, 15).map((e, i) => (
                  <tr key={e._id + i} style={{ borderBottom: "1px solid var(--nx-border)", background: i % 2 === 0 ? "var(--nx-white)" : "var(--nx-fill-2)" }}>
                    <td style={{ padding: "9px 16px", fontSize: 13, color: "var(--nx-text-3)", whiteSpace: "nowrap" }}>
                      {dayjs(e.date).format("DD MMM YYYY")}
                      {dayjs(e.date).format("YYYY-MM-DD") === todayStr && (
                        <Badge count="Today" style={{ background: "#3b82f6", marginLeft: 8, fontSize: 10 }} />
                      )}
                    </td>
                    <td style={{ padding: "9px 16px", fontSize: 13, fontWeight: 500, color: "var(--nx-text)" }}>{e.description}</td>
                    <td style={{ padding: "9px 16px", fontSize: 12, color: "var(--nx-text-2)" }}>{formatLocation(e, projectType)}</td>
                    <td style={{ padding: "9px 16px", fontFamily: "monospace", fontSize: 13, color: "#16a34a", fontWeight: 700 }}>
                      +{fmtN(e.qtyAdded)} {e.unit}
                    </td>
                    <td style={{ padding: "9px 16px", fontSize: 12, color: "var(--nx-text-2)" }}>{e.remarks || "—"}</td>
                    <td style={{ padding: "9px 16px", whiteSpace: "nowrap" }}>
                      {(() => {
                        const canDelete = e.scopeCompleted - e.qtyAdded >= e.scopeLastBilled;
                        const locked    = !canDelete;
                        return (
                          <div style={{ display: "flex", gap: 4 }}>
                            <Button size="small" type="link" style={{ padding: "0 6px", fontSize: 12 }}
                              onClick={() => {
                                setEditEntry(e);
                                editForm.setFieldsValue({
                                  qtyAdded: e.qtyAdded, date: dayjs(e.date), remarks: e.remarks,
                                  tower: e.tower, floor: e.floor, flatNo: e.flatNo,
                                  plotNo: e.plotNo, locationNote: e.locationNote,
                                });
                                setEditModal(true);
                              }}>Edit</Button>
                            <Popconfirm
                              title="Delete this entry?"
                              description={locked ? "This entry is already billed and cannot be deleted." : "This action cannot be undone."}
                              okText={locked ? undefined : "Delete"} okType="danger" cancelText="Cancel"
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
            <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--nx-text-muted)", borderTop: "1px solid var(--nx-border)" }}>
              Showing last 15 of {allEntries.length} entries.
            </div>
          )}
        </div>
      )}

      {/* Stage History */}
      <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--nx-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--nx-text)" }}>
            {selWOId ? "Stage History" : "My Bill Requests"}
          </div>
          <div style={{ fontSize: 12, color: "var(--nx-text-2)" }}>{billReqs.length} stage{billReqs.length !== 1 ? "s" : ""}</div>
        </div>
        {billReqs.length === 0 ? (
          <div style={{ padding: 40 }}>
            <Empty description={selWOId ? "No stages submitted yet for this work order." : "Select a work order to see stages."} />
          </div>
        ) : (
          billReqs.map(br => {
            const color = BR_STATUS_COLOR[br.status] ?? "#9CA3AF";
            const isMilestone = br.milestoneAchieved;
            const icon = isMilestone ? "🏆" : br.status === "approved" ? "✅" : br.status === "rejected" ? "❌" : "⏳";
            return (
              <div key={br._id} style={{ padding: "18px 20px", borderBottom: "1px solid var(--nx-border)", display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{
                  background: isMilestone ? "#FFF4E8" : br.status === "approved" ? "#f0fdf4" : br.status === "rejected" ? "#fef2f2" : "#FFF4E8",
                  border: `2px solid ${isMilestone ? "#FF7A00" : color}`,
                  borderRadius: 10, padding: "10px 14px", minWidth: 76, textAlign: "center", flexShrink: 0,
                }}>
                  <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase" }}>Stage</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: isMilestone ? "#FF7A00" : color }}>{br.stageNo ?? 1}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--nx-text)", fontFamily: "monospace" }}>{br.reqNo}</span>
                    <span style={{ background: color, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12, textTransform: "uppercase" }}>
                      {BR_STATUS_LABEL[br.status] ?? br.status}
                    </span>
                    {br.status === "approved" && br.billId && (
                      <span style={{ background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                        Bill: {br.billId.billNo}
                      </span>
                    )}
                  </div>
                  {br.periodFrom && (
                    <div style={{ fontSize: 12, color: "var(--nx-text-2)", marginBottom: 4 }}>
                      📅 {dayjs(br.periodFrom).format("DD MMM YYYY")} → {dayjs(br.periodTo ?? br.createdAt).format("DD MMM YYYY")}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--nx-text-muted)" }}>
                    {br.items.map(it => `${it.description}: ${fmtN(it.billedQty)} ${it.unit}`).join(" · ")}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Add Progress Modal ─────────────────────────────────────────────── */}
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

          <LocationFields pt={projectType} />

          <Form.Item
            label={`Quantity Added (${progItem?.unit})`} name="qtyAdded"
            rules={[
              { required: true, type: "number", min: 0.01, message: "Enter a valid quantity" },
              {
                validator: (_: unknown, value: number) => {
                  if (!value || !progItem) return Promise.resolve();
                  const max = Math.max(0, progItem.plannedQty - progItem.completedQty);
                  if (value > max) return Promise.reject(new Error(`Cannot exceed remaining (${fmtN(max)} ${progItem.unit})`));
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
            <Input.TextArea rows={2} placeholder="Notes for today's work…" />
          </Form.Item>

          {progItem && (
            <div style={{ background: "var(--nx-fill-2)", border: "1px solid var(--nx-border)", borderRadius: 8, padding: 12, fontSize: 12 }}>
              {[
                { label: "Planned",   value: `${fmtN(progItem.plannedQty)} ${progItem.unit}`,                                                  color: "var(--nx-text)" },
                { label: "Done",      value: `${fmtN(progItem.completedQty)} ${progItem.unit}`,                                                 color: "#16a34a" },
                { label: "Remaining", value: `${fmtN(Math.max(0, progItem.plannedQty - progItem.completedQty))} ${progItem.unit}`,               color: "#FF7A00" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "var(--nx-text-2)" }}>{r.label}</span>
                  <strong style={{ color: r.color }}>{r.value}</strong>
                </div>
              ))}
            </div>
          )}
        </Form>
      </Modal>

      {/* ── Edit Entry Modal ───────────────────────────────────────────────── */}
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

          <LocationFields pt={projectType} />

          <Form.Item
            label={`Quantity Added (${editEntry?.unit})`} name="qtyAdded"
            rules={[
              { required: true, type: "number", min: 0.01, message: "Enter a valid quantity" },
              {
                validator: (_: unknown, value: number) => {
                  if (!value || !editEntry) return Promise.resolve();
                  const otherTotal  = editEntry.scopeCompleted - editEntry.qtyAdded;
                  const maxAllowed  = editEntry.scopePlanned - otherTotal;
                  const minRequired = Math.max(0, editEntry.scopeLastBilled - otherTotal);
                  if (value > maxAllowed) return Promise.reject(new Error(`Max: ${fmtN(maxAllowed)} ${editEntry.unit}`));
                  if (minRequired > 0 && value < minRequired) return Promise.reject(new Error(`Min: ${fmtN(minRequired)} ${editEntry.unit} (billed)`));
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
        </Form>
      </Modal>

      {/* ── Bill Request Modal ─────────────────────────────────────────────── */}
      <Modal
        open={billModal} onCancel={() => setBillModal(false)}
        title={`Generate Bill Request — Stage ${billReqs.length + 1}`}
        onOk={handleBillRequest} okText={`Submit Stage ${billReqs.length + 1}`}
        width={640}
        okButtonProps={{ loading: saving, style: { background: "#FF7A00", borderColor: "#FF7A00" }, disabled: pendingBillItems.length === 0 }}
        destroyOnClose
      >
        <div style={{ marginTop: 8 }}>
          {billReqs.length > 0 && billReqs[billReqs.length - 1]?.periodTo && (
            <div style={{ fontSize: 12, color: "var(--nx-text-2)", marginBottom: 12 }}>
              Period: <strong>{dayjs(billReqs[billReqs.length - 1].periodTo).format("DD MMM YYYY")}</strong> → <strong>{dayjs().format("DD MMM YYYY")}</strong>
            </div>
          )}
          <div style={{ padding: 12, background: "#FFF4E8", border: "1px solid #FED7AA", borderRadius: 8, marginBottom: 16, fontSize: 12, color: "#92400e" }}>
            <strong>Auto-calculated</strong> — quantities computed from progress since last billing.
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
                    <tr key={si._id} style={{ borderBottom: "1px solid var(--nx-border)", background: i % 2 === 0 ? "var(--nx-white)" : "var(--nx-fill-2)" }}>
                      <td style={{ padding: "9px 12px", fontWeight: 600, fontSize: 13, color: "var(--nx-text)" }}>{si.description}</td>
                      <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--nx-text-2)" }}>{si.unit}</td>
                      <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 13, color: "var(--nx-text-2)" }}>{fmtN(si.lastBilledQty || 0)}</td>
                      <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 13, color: "var(--nx-text-3)" }}>{fmtN(si.completedQty)}</td>
                      <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 14, color: "#FF7A00", fontWeight: 800 }}>{fmtN(si.billedQty)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "var(--nx-fill-2)", borderTop: "2px solid #FF7A00" }}>
                    <td colSpan={4} style={{ padding: "8px 12px", fontWeight: 700, color: "var(--nx-text-3)", fontSize: 12 }}>Total items: {pendingBillItems.length}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontWeight: 800, color: "#FF7A00", fontSize: 14 }}>
                      {fmtN(pendingBillItems.reduce((s, si) => s + si.billedQty, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--nx-text-3)", marginBottom: 6 }}>Remarks (optional)</div>
                <Input.TextArea rows={2} placeholder="Any notes for this bill request…"
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
