import { useState, useEffect, useMemo } from "react";
import {
  Select, Button, Modal, Form, Input, InputNumber, Checkbox,
  Tooltip, message, Spin, Empty, DatePicker, Badge, Popconfirm,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
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
  _id: string; reqNo: string; workOrderId: string; workOrderNo?: string;
  stageNo?: number; status: string;
  periodFrom?: string; periodTo?: string;
  items: { description: string; unit: string; billedQty: number }[];
  createdAt: string; projectName?: string;
  billId?: { billNo: string } | null;
  milestoneAchieved?: boolean;
  batchId?: string | null;
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
    const parts = [e.tower && `T-${e.tower}`, e.floor && `F-${e.floor}`, e.flatNo && `#${e.flatNo}`].filter(Boolean) as string[];
    if (parts.length) return parts.join(" ");
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
    .flatMap(si => (si.progressEntries ?? []).map(pe => ({
      ...pe, unit: si.unit, description: si.description,
      projectType: (woDetail as any)?.projectId?.projectType || "apartment",
    })))
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--nx-text)" }}>Construction Progress</h1>
        <p style={{ color: "var(--nx-text-2)", marginTop: 4, marginBottom: 0 }}>Track DRI-reported progress, billing stages, and milestone payments.</p>
      </div>

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
        woList.length === 0 ? <Empty description="No work orders found." /> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {woList.map(wo => (
              <div key={wo._id}
                style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: 20, cursor: "pointer" }}
                onClick={() => { setSelWorkOrder(wo._id); setMode("idle"); }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#FF7A00")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--nx-border)")}
              >
                <div style={{ fontWeight: 700, color: "var(--nx-text)" }}>{wo.workOrderNo}</div>
                <div style={{ fontSize: 12, color: "var(--nx-text-2)" }}>{wo.vendorName}</div>
                <div style={{ fontSize: 14, color: "#FF7A00", fontWeight: 700, marginTop: 8 }}>{fmt(wo.contractValue ?? 0)}</div>
              </div>
            ))}
          </div>
        )
      ) : woDetail ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
            {(() => {
              const si = woDetail.scopeItems;
              const avgPct = si.length ? Math.round(si.reduce((s, x) => s + pctOf(x.completedQty, x.plannedQty), 0) / si.length) : 0;
              const billedAmt = si.reduce((s, x) => s + (x.lastBilledQty || 0) * (x.rate || 0), 0);
              return [
                { label: "Contract Value", value: fmt(woDetail.contractValue ?? 0), color: "var(--nx-text)", icon: "📋" },
                { label: "Progress", value: `${avgPct}%`, color: avgPct >= 100 ? "#16a34a" : "#FF7A00", icon: "📊" },
                { label: "Billed", value: fmt(billedAmt), color: "#3b82f6", icon: "✅" },
                { label: "Stages", value: String(billReqs.length), color: "#FF7A00", icon: "🏗" },
              ].map(({ label, value, color, icon }) => (
                <div key={label} style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "16px 20px" }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                  <div style={{ fontSize: 10, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
                </div>
              ));
            })()}
          </div>

          <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ background: "#1F2937", padding: "14px 20px" }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{woDetail.workOrderNo} — {woDetail.vendorName}</div>
              <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>
                {woDetail.projectName}{woDetail.category ? ` · ${woDetail.category}` : ""}
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--nx-fill-2)" }}>
                    {["#", "Description", "Unit", "Planned", "Completed", "Billed", "Unbilled", "Progress"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--nx-table-header-color)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--nx-border)", textAlign: "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {woDetail.scopeItems.map((si, idx) => {
                    const p = pctOf(si.completedQty, si.plannedQty);
                    const billedPct = pctOf(si.lastBilledQty || 0, si.plannedQty);
                    const unbilledPct = Math.max(0, p - billedPct);
                    return (
                      <tr key={si._id} style={{ borderBottom: "1px solid var(--nx-border)", background: idx % 2 === 0 ? "var(--nx-white)" : "var(--nx-fill-2)" }}>
                        <td style={{ padding: "10px 12px", color: "var(--nx-text-muted)", fontSize: 12 }}>{idx + 1}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--nx-text)", fontSize: 13 }}>{si.description}</td>
                        <td style={{ padding: "10px 12px", color: "var(--nx-text-2)", fontSize: 12 }}>{si.unit}</td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13, color: "var(--nx-text)" }}>{fmtN(si.plannedQty)}</td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13, color: si.completedQty > 0 ? "#16a34a" : "var(--nx-text-muted)" }}>{fmtN(si.completedQty)}</td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13, color: "#3b82f6" }}>{fmtN(si.lastBilledQty || 0)}</td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13 }}>
                          {Math.max(0, si.completedQty - (si.lastBilledQty || 0)) > 0
                            ? <span style={{ color: "#f59e0b", fontWeight: 700 }}>{fmtN(Math.max(0, si.completedQty - (si.lastBilledQty || 0)))}</span>
                            : <span style={{ color: "var(--nx-text-muted)" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 12px", minWidth: 180 }}>
                          <div style={{ position: "relative", height: 10, background: "var(--nx-border)", borderRadius: 5, overflow: "hidden" }}>
                            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${billedPct}%`, background: "#16a34a" }} />
                            <div style={{ position: "absolute", left: `${billedPct}%`, top: 0, height: "100%", width: `${unbilledPct}%`, background: "#FF7A00" }} />
                          </div>
                          <div style={{ fontSize: 10, color: "var(--nx-text-2)", marginTop: 3 }}>
                            <span style={{ color: "#16a34a", fontWeight: 700 }}>{billedPct}% billed</span>
                            {unbilledPct > 0 && <span style={{ color: "#FF7A00", fontWeight: 700 }}> + {unbilledPct}% unbilled</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

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
                    {allEntries.slice(0, 20).map((e, i) => (
                      <tr key={e._id + i} style={{ borderBottom: "1px solid var(--nx-border)", background: i % 2 === 0 ? "var(--nx-white)" : "var(--nx-fill-2)" }}>
                        <td style={{ padding: "9px 16px", fontSize: 13, color: "var(--nx-text-3)", whiteSpace: "nowrap" }}>
                          {dayjs(e.date).format("DD MMM YYYY")}
                          {dayjs(e.date).format("YYYY-MM-DD") === todayStr && (
                            <span style={{ background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8, marginLeft: 6 }}>Today</span>
                          )}
                        </td>
                        <td style={{ padding: "9px 16px", fontSize: 13, fontWeight: 500, color: "var(--nx-text)" }}>{e.description}</td>
                        <td style={{ padding: "9px 16px", fontSize: 12, color: "var(--nx-text-2)" }}>
                          {formatLocation(e as EntryRow, (e as any).projectType || "apartment")}
                        </td>
                        <td style={{ padding: "9px 16px", fontFamily: "monospace", fontSize: 13, color: "#16a34a", fontWeight: 700 }}>
                          +{fmtN(e.qtyAdded)} {e.unit}
                        </td>
                        <td style={{ padding: "9px 16px", fontSize: 12, color: "var(--nx-text-2)" }}>{e.remarks || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {billReqs.length > 0 && (
            <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, overflow: "hidden", marginTop: 20 }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--nx-border)", fontWeight: 700, fontSize: 15, color: "var(--nx-text)" }}>Billing Stages</div>
              {billReqs.map(br => {
                const color = BR_STATUS_COLOR[br.status] ?? "#9CA3AF";
                return (
                  <div key={br._id} style={{ padding: "16px 20px", borderBottom: "1px solid var(--nx-border)", display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ background: br.status === "approved" ? "#f0fdf4" : "#FFFBEB", border: `2px solid ${color}`, borderRadius: 10, padding: "8px 12px", minWidth: 64, textAlign: "center", flexShrink: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase" }}>Stage</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color }}>{br.stageNo ?? 1}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontFamily: "monospace", color: "var(--nx-text)" }}>{br.reqNo}</span>
                        <span style={{ background: color, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                          {BR_STATUS_LABEL[br.status] ?? br.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--nx-text-muted)" }}>
                        {br.items.map(it => `${it.description}: ${fmtN(it.billedQty)} ${it.unit}`).join(" · ")}
                      </div>
                    </div>
                  </div>
                );
              })}
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

  // All WOs for this DRI
  const [allWOs,         setAllWOs]         = useState<WOSummary[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  // View: "select" = vendor picker, "dashboard" = vendor detail
  const [view,          setView]          = useState<"select" | "dashboard">("select");
  const [selVendorCode, setSelVendorCode] = useState<string | undefined>();

  // WO details map (woId → WODetail) for the selected vendor's WOs
  const [woDetails,        setWoDetails]        = useState<Map<string, WODetail>>(new Map());
  const [woDetailsLoading, setWoDetailsLoading] = useState(false);

  // Bill requests for selected vendor
  const [vendorBillReqs,       setVendorBillReqs]       = useState<BRSummary[]>([]);

  // Progress modal
  const [progWOId,  setProgWOId]  = useState<string | undefined>();
  const [progItem,  setProgItem]  = useState<ScopeItemR | null>(null);
  const [progModal, setProgModal] = useState(false);
  const [progForm]                = Form.useForm();
  const [saving,    setSaving]    = useState(false);

  // Edit entry modal
  const [editModal, setEditModal] = useState(false);
  const [editEntry, setEditEntry] = useState<EntryRow | null>(null);
  const [editForm]                = Form.useForm();
  const [deleting,  setDeleting]  = useState<string | null>(null);

  // Vendor bill modal
  const [billModal,      setBillModal]      = useState(false);
  const [selectedWOIds,  setSelectedWOIds]  = useState<Set<string>>(new Set());
  const [billRemarks,    setBillRemarks]    = useState("");
  const [billGenerating, setBillGenerating] = useState(false);

  // ── Load all WOs once ──────────────────────────────────────────────────────
  useEffect(() => {
    apiClient.get("/work-orders")
      .then(r => setAllWOs(r.data.workOrders ?? []))
      .finally(() => setInitialLoading(false));
  }, []);

  // ── Derived: vendors ───────────────────────────────────────────────────────
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

  // WOs for selected vendor
  const vendorWOs = useMemo(() =>
    allWOs.filter(wo => wo.vendorCode === selVendorCode),
    [allWOs, selVendorCode]
  );

  const selVendorName = vendors.find(v => v.code === selVendorCode)?.name || selVendorCode || "";

  // ── Load WO details when vendor changes ────────────────────────────────────
  useEffect(() => {
    if (!vendorWOs.length) { setWoDetails(new Map()); setVendorBillReqs([]); return; }
    setWoDetailsLoading(true);
    Promise.all(vendorWOs.map(wo => apiClient.get(`/work-orders/${wo._id}`)))
      .then(results => {
        const map = new Map<string, WODetail>();
        results.forEach(r => { const d = r.data.workOrder; if (d) map.set(d._id, d); });
        setWoDetails(map);
      })
      .finally(() => setWoDetailsLoading(false));
    // Bill requests for this vendor
    apiClient.get(`/bill-requests?vendorCode=${selVendorCode}`)
      .then(r => setVendorBillReqs(r.data.billRequests ?? []));
  }, [vendorWOs, selVendorCode]);

  // ── Project groups ─────────────────────────────────────────────────────────
  const projectGroups = useMemo(() => {
    const groups = new Map<string, { projectId: string; projectName: string; projectType: string; wos: WOSummary[] }>();
    vendorWOs.forEach(wo => {
      const pid = getProjId(wo) || wo.projectName;
      if (!groups.has(pid)) {
        const detail = woDetails.get(wo._id);
        const pt = (detail as any)?.projectId?.projectType || "apartment";
        groups.set(pid, { projectId: pid, projectName: wo.projectName, projectType: pt, wos: [] });
      }
      groups.get(pid)!.wos.push(wo);
    });
    return Array.from(groups.values());
  }, [vendorWOs, woDetails]);

  // ── Pending WOs for billing ────────────────────────────────────────────────
  const pendingWODetails = useMemo(() =>
    Array.from(woDetails.values()).filter(d =>
      d.scopeItems.some(si => Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)) > 0) &&
      !vendorBillReqs.some(br => br.workOrderId === d._id && br.status === "pending")
    ),
    [woDetails, vendorBillReqs]
  );

  // ── Reload helpers ─────────────────────────────────────────────────────────
  const reloadWODetail = async (woId: string) => {
    const r = await apiClient.get(`/work-orders/${woId}`);
    setWoDetails(prev => new Map(prev).set(woId, r.data.workOrder));
  };

  const reloadBillReqs = async () => {
    if (!selVendorCode) return;
    const r = await apiClient.get(`/bill-requests?vendorCode=${selVendorCode}`);
    setVendorBillReqs(r.data.billRequests ?? []);
  };

  // ── Progress handlers ──────────────────────────────────────────────────────
  const handleAddProgress = async () => {
    if (!progWOId || !progItem) return;
    const vals = await progForm.validateFields();
    setSaving(true);
    try {
      await apiClient.post(`/work-orders/${progWOId}/scope-items/${progItem._id}/progress`, {
        date:         vals.date ? dayjs(vals.date).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"),
        qtyAdded:     vals.qtyAdded,
        remarks:      vals.remarks || "",
        tower:        vals.tower || "",
        floor:        vals.floor || "",
        flatNo:       vals.flatNo || "",
        plotNo:       vals.plotNo || "",
        locationNote: vals.locationNote || "",
      });
      message.success(`+${fmtN(vals.qtyAdded)} ${progItem.unit} recorded`);
      setProgModal(false);
      progForm.resetFields();
      await reloadWODetail(progWOId);
    } catch { }
    finally { setSaving(false); }
  };

  const handleEditEntry = async () => {
    if (!editEntry) return;
    const vals = await editForm.validateFields();
    setSaving(true);
    try {
      await apiClient.patch(
        `/work-orders/${editEntry.scopeId.split("||")[1] || progWOId}/scope-items/${editEntry.scopeId.split("||")[0]}/progress/${editEntry._id}`,
        { qtyAdded: vals.qtyAdded, date: vals.date ? dayjs(vals.date).format("YYYY-MM-DD") : undefined, remarks: vals.remarks || "", tower: vals.tower || "", floor: vals.floor || "", flatNo: vals.flatNo || "", plotNo: vals.plotNo || "", locationNote: vals.locationNote || "" }
      );
      message.success("Entry updated");
      setEditModal(false); editForm.resetFields();
      if (editEntry.scopeId.split("||")[1]) await reloadWODetail(editEntry.scopeId.split("||")[1]);
    } catch { }
    finally { setSaving(false); }
  };

  const handleDeleteEntry = async (entry: EntryRow, woId: string) => {
    setDeleting(entry._id);
    try {
      await apiClient.delete(`/work-orders/${woId}/scope-items/${entry.scopeId.split("||")[0]}/progress/${entry._id}`);
      message.success("Entry deleted");
      await reloadWODetail(woId);
    } catch { }
    finally { setDeleting(null); }
  };

  // ── Vendor bill generation ─────────────────────────────────────────────────
  const openBillModal = () => {
    setSelectedWOIds(new Set(pendingWODetails.map(d => d._id)));
    setBillRemarks(""); setBillModal(true);
  };

  const handleGenerateBill = async () => {
    const workOrderIds = Array.from(selectedWOIds);
    if (!workOrderIds.length) { message.warning("Select at least one work order"); return; }
    setBillGenerating(true);
    try {
      const res = await apiClient.post("/bill-requests/batch", { workOrderIds, remarks: billRemarks });
      message.success(res.data?.message || "Bill request submitted!");
      setBillModal(false);
      await Promise.all(workOrderIds.map(id => reloadWODetail(id)));
      await reloadBillReqs();
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to submit bill request");
    }
    finally { setBillGenerating(false); }
  };

  const progProjectType: "apartment" | "plot" = useMemo(() => {
    if (!progWOId) return "apartment";
    return (woDetails.get(progWOId) as any)?.projectId?.projectType || "apartment";
  }, [progWOId, woDetails]);

  const todayStr = dayjs().format("YYYY-MM-DD");

  // Must be above any conditional return (Rules of Hooks)
  const billHistory = useMemo(() => {
    const batches = new Map<string, BRSummary[]>();
    const singles: BRSummary[] = [];
    vendorBillReqs.forEach(br => {
      if (br.batchId) {
        if (!batches.has(br.batchId)) batches.set(br.batchId, []);
        batches.get(br.batchId)!.push(br);
      } else {
        singles.push(br);
      }
    });
    const result: Array<{ type: "batch" | "single"; batchId?: string; items: BRSummary[] }> = [];
    batches.forEach((items, batchId) => result.push({ type: "batch", batchId, items }));
    singles.forEach(br => result.push({ type: "single", items: [br] }));
    return result.sort((a, b) => dayjs(b.items[0].createdAt).valueOf() - dayjs(a.items[0].createdAt).valueOf());
  }, [vendorBillReqs]);

  // ── Location form fields component ────────────────────────────────────────
  const LocationFields = ({ pt }: { pt: string }) => (
    <div style={{ background: "var(--nx-fill-2)", border: "1px solid var(--nx-border)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>📍 Location (optional)</div>
      {pt === "apartment" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <Form.Item label="Tower" name="tower" style={{ marginBottom: 0 }}>
            <Input placeholder="e.g. A, T1" size="small" />
          </Form.Item>
          <Form.Item label="Floor" name="floor" style={{ marginBottom: 0 }}>
            <Input placeholder="e.g. G, 1, 5" size="small" />
          </Form.Item>
          <Form.Item label="Flat No" name="flatNo" style={{ marginBottom: 0 }}>
            <Input placeholder="e.g. 101" size="small" />
          </Form.Item>
        </div>
      ) : (
        <Form.Item label="Plot No" name="plotNo" style={{ marginBottom: 0 }}>
          <Input placeholder="e.g. Plot-42" />
        </Form.Item>
      )}
      <Form.Item label="Note" name="locationNote" style={{ marginBottom: 0, marginTop: 8 }}>
        <Input placeholder="Additional location details…" size="small" />
      </Form.Item>
    </div>
  );

  if (initialLoading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}><Spin size="large" /></div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW 1 — Vendor Picker
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "select") {
    return (
      <div style={{ padding: "24px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--nx-text)" }}>Welcome, {user?.name}</div>
          <div style={{ fontSize: 14, color: "var(--nx-text-2)", marginTop: 4 }}>Select a contractor below to track progress and manage billing</div>
        </div>

        {vendors.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, background: "var(--nx-white)", borderRadius: 12, border: "1px solid var(--nx-border)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏗️</div>
            <div style={{ fontWeight: 600, color: "var(--nx-text)" }}>No work orders assigned yet</div>
            <div style={{ color: "var(--nx-text-muted)", marginTop: 4 }}>Ask your admin to assign work orders to you.</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>
              Your Contractors ({vendors.length})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {vendors.map(v => {
                const vWOs = allWOs.filter(wo => wo.vendorCode === v.code);
                const projectIds = new Set(vWOs.map(wo => getProjId(wo) || wo.projectName));
                return (
                  <div
                    key={v.code}
                    onClick={() => { setSelVendorCode(v.code); setView("dashboard"); }}
                    style={{
                      background: "var(--nx-white)", border: "1px solid var(--nx-border)",
                      borderLeft: "4px solid #FF7A00", borderRadius: 12,
                      padding: "20px 20px 16px", cursor: "pointer",
                      transition: "box-shadow 0.15s, transform 0.12s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.1)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    <span style={{ background: "#FFF4E8", color: "#FF7A00", fontFamily: "monospace", fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 5 }}>
                      {v.code}
                    </span>
                    <div style={{ fontSize: 17, fontWeight: 700, color: "var(--nx-text)", marginTop: 8, marginBottom: 8 }}>{v.name}</div>
                    <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--nx-text-2)" }}>
                      <span>📂 {projectIds.size} project{projectIds.size !== 1 ? "s" : ""}</span>
                      <span>📋 {vWOs.length} work order{vWOs.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 12, color: "#FF7A00", fontWeight: 600 }}>Open Dashboard →</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW 2 — Vendor Dashboard (all projects for this vendor)
  // ══════════════════════════════════════════════════════════════════════════
  const hasPending = pendingWODetails.length > 0;

  return (
    <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => { setView("select"); setSelVendorCode(undefined); setWoDetails(new Map()); setVendorBillReqs([]); }}>
            All Contractors
          </Button>
          <div>
            <div style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: "#FF7A00" }}>{selVendorCode}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--nx-text)" }}>{selVendorName}</div>
          </div>
        </div>
        <Tooltip title={!hasPending ? "No unbilled progress. Record daily progress first." : ""}>
          <Button
            type="primary" size="large"
            disabled={!hasPending}
            onClick={openBillModal}
            style={hasPending ? { background: "#FF7A00", borderColor: "#FF7A00", fontWeight: 700 } : {}}
          >
            🧾 Generate Bill Request for {selVendorName}
          </Button>
        </Tooltip>
      </div>

      {/* Summary stats */}
      {!woDetailsLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Projects",       value: String(projectGroups.length),                color: "#FF7A00" },
            { label: "Work Orders",    value: String(vendorWOs.length),                    color: "#2563eb" },
            { label: "Pending Items",  value: String(pendingWODetails.reduce((s, d) => s + d.scopeItems.filter(si => Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)) > 0).length, 0)), color: pendingWODetails.length > 0 ? "#FF7A00" : "#16a34a" },
            { label: "Bill Requests",  value: String(vendorBillReqs.length),               color: "#7c3aed" },
            { label: "Approved",       value: String(vendorBillReqs.filter(b => b.status === "approved").length), color: "#16a34a" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "14px 18px" }}>
              <div style={{ fontSize: 10, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Projects + WOs */}
      {woDetailsLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spin size="large" /></div>
      ) : projectGroups.length === 0 ? (
        <Empty description="No work orders found for this vendor." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {projectGroups.map(pg => (
            <div key={pg.projectId} style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, overflow: "hidden" }}>
              {/* Project header */}
              <div style={{ background: "#1F2937", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>📂 {pg.projectName}</div>
                  <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>
                    {pg.projectType === "apartment" ? "🏢 Apartment Project" : "🏠 Plot Project"} · {pg.wos.length} work order{pg.wos.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              {/* Work orders in this project */}
              {pg.wos.map(woSum => {
                const detail = woDetails.get(woSum._id);
                const pendingBR = vendorBillReqs.find(br => br.workOrderId === woSum._id && br.status === "pending");

                return (
                  <div key={woSum._id} style={{ borderBottom: "1px solid var(--nx-border)" }}>
                    {/* WO sub-header */}
                    <div style={{ padding: "12px 20px", background: "var(--nx-fill-2)", borderBottom: "1px solid var(--nx-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00", fontSize: 13 }}>{woSum.workOrderNo}</span>
                        {woSum.category && (
                          <span style={{ background: "var(--nx-fill)", color: "var(--nx-text-3)", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>
                            {woSum.category}
                          </span>
                        )}
                        {pendingBR && (
                          <span style={{ background: "#fffbeb", color: "#f59e0b", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, border: "1px solid #fde68a" }}>
                            ⏳ {pendingBR.reqNo} pending
                          </span>
                        )}
                      </div>
                      {detail && (() => {
                        const avgPct = Math.round(detail.scopeItems.reduce((s, si) => s + pctOf(si.completedQty, si.plannedQty), 0) / (detail.scopeItems.length || 1));
                        return (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--nx-text-2)" }}>
                            <div style={{ width: 80, height: 6, background: "var(--nx-border)", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${avgPct}%`, height: "100%", background: avgPct >= 100 ? "#16a34a" : "#FF7A00", borderRadius: 3 }} />
                            </div>
                            <span style={{ fontWeight: 700, color: avgPct >= 100 ? "#16a34a" : "#FF7A00" }}>{avgPct}%</span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Scope items */}
                    {!detail ? (
                      <div style={{ padding: 24, textAlign: "center" }}><Spin size="small" /></div>
                    ) : detail.scopeItems.length === 0 ? (
                      <div style={{ padding: 24, textAlign: "center", color: "var(--nx-text-muted)", fontSize: 13 }}>No scope items defined for this work order.</div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "var(--nx-fill-2)" }}>
                              {["#", "Description", "Unit", "Planned", "Done", "Unbilled", "Remaining", "Progress", ""].map(h => (
                                <th key={h} style={{ padding: "9px 12px", fontSize: 10, fontWeight: 700, color: "var(--nx-table-header-color)", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", borderBottom: "1px solid var(--nx-border)" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {detail.scopeItems.map((si, idx) => {
                              const p = pctOf(si.completedQty, si.plannedQty);
                              const unbilled = Math.max(0, si.completedQty - (si.lastBilledQty || 0));
                              const rem      = Math.max(0, si.plannedQty - si.completedQty);
                              const isDone   = p >= 100;
                              return (
                                <tr key={si._id} style={{ borderBottom: "1px solid var(--nx-border)", background: idx % 2 === 0 ? "var(--nx-white)" : "var(--nx-fill-2)" }}>
                                  <td style={{ padding: "9px 12px", color: "var(--nx-text-muted)", fontSize: 12 }}>{idx + 1}</td>
                                  <td style={{ padding: "9px 12px", fontWeight: 600, color: "var(--nx-text)", fontSize: 13 }}>{si.description}</td>
                                  <td style={{ padding: "9px 12px", color: "var(--nx-text-2)", fontSize: 12 }}>{si.unit}</td>
                                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: "var(--nx-text)" }}>{fmtN(si.plannedQty)}</td>
                                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: si.completedQty > 0 ? "#16a34a" : "var(--nx-text-muted)" }}>{fmtN(si.completedQty)}</td>
                                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12 }}>
                                    {unbilled > 0 ? <span style={{ color: "#FF7A00", fontWeight: 700 }}>{fmtN(unbilled)}</span> : <span style={{ color: "var(--nx-text-muted)" }}>—</span>}
                                  </td>
                                  <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: rem > 0 ? "var(--nx-text-3)" : "#16a34a" }}>
                                    {rem > 0 ? fmtN(rem) : "✓ Done"}
                                  </td>
                                  <td style={{ padding: "9px 12px", minWidth: 100 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                      <div style={{ flex: 1, height: 6, background: "var(--nx-border)", borderRadius: 3, overflow: "hidden" }}>
                                        <div style={{ width: `${p}%`, height: "100%", background: isDone ? "#16a34a" : "#FF7A00", borderRadius: 3 }} />
                                      </div>
                                      <span style={{ fontSize: 10, fontWeight: 700, color: isDone ? "#16a34a" : "#FF7A00", minWidth: 26 }}>{p}%</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: "9px 12px" }}>
                                    <Button
                                      size="small" disabled={isDone}
                                      onClick={() => {
                                        setProgWOId(woSum._id);
                                        setProgItem(si);
                                        progForm.resetFields();
                                        progForm.setFieldsValue({ date: dayjs() });
                                        setProgModal(true);
                                      }}
                                      style={!isDone ? { background: "#FF7A00", borderColor: "#FF7A00", color: "#fff", fontWeight: 600, fontSize: 12 } : { fontSize: 12 }}
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
                    )}

                    {/* Recent entries for this WO */}
                    {detail && (() => {
                      const entries: EntryRow[] = detail.scopeItems.flatMap(si =>
                        (si.progressEntries ?? []).map(pe => ({
                          ...pe, unit: si.unit, description: si.description,
                          scopeId: `${si._id}||${detail._id}`,
                          scopePlanned: si.plannedQty, scopeCompleted: si.completedQty, scopeLastBilled: si.lastBilledQty || 0,
                        }))
                      ).sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf()).slice(0, 5);

                      if (!entries.length) return null;
                      const pt = pg.projectType;
                      return (
                        <div style={{ padding: "10px 20px 14px", borderTop: "1px solid var(--nx-border)" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                            Recent Entries (last 5)
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {entries.map((e, i) => (
                              <div key={e._id + i} style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 12 }}>
                                <span style={{ color: "var(--nx-text-muted)", minWidth: 90, whiteSpace: "nowrap" }}>
                                  {dayjs(e.date).format("DD MMM")}
                                  {dayjs(e.date).format("YYYY-MM-DD") === todayStr && (
                                    <Badge count="Today" style={{ background: "#3b82f6", marginLeft: 4, fontSize: 9, height: 16, lineHeight: "16px" }} />
                                  )}
                                </span>
                                <span style={{ fontWeight: 600, color: "var(--nx-text)", flex: 1 }}>{e.description}</span>
                                <span style={{ color: "var(--nx-text-2)", minWidth: 80 }}>{formatLocation(e, pt)}</span>
                                <span style={{ color: "#16a34a", fontWeight: 700, fontFamily: "monospace", minWidth: 60 }}>+{fmtN(e.qtyAdded)} {e.unit}</span>
                                <div style={{ display: "flex", gap: 2 }}>
                                  <Button size="small" type="link" style={{ fontSize: 11, padding: "0 4px" }}
                                    onClick={() => {
                                      setEditEntry(e);
                                      editForm.setFieldsValue({ qtyAdded: e.qtyAdded, date: dayjs(e.date), remarks: e.remarks, tower: e.tower, floor: e.floor, flatNo: e.flatNo, plotNo: e.plotNo, locationNote: e.locationNote });
                                      setProgWOId(detail._id);
                                      setEditModal(true);
                                    }}>Edit</Button>
                                  <Popconfirm
                                    title="Delete entry?"
                                    description={e.scopeCompleted - e.qtyAdded >= e.scopeLastBilled ? "This will be deleted permanently." : "Entry is billed and cannot be deleted."}
                                    okText={e.scopeCompleted - e.qtyAdded >= e.scopeLastBilled ? "Delete" : undefined}
                                    okType="danger" cancelText="Cancel"
                                    onConfirm={e.scopeCompleted - e.qtyAdded >= e.scopeLastBilled ? () => handleDeleteEntry(e, detail._id) : undefined}
                                    okButtonProps={e.scopeCompleted - e.qtyAdded < e.scopeLastBilled ? { style: { display: "none" } } : {}}
                                  >
                                    <Button size="small" type="link" danger loading={deleting === e._id} style={{ fontSize: 11, padding: "0 4px" }}>Del</Button>
                                  </Popconfirm>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Bill History ────────────────────────────────────────────────────── */}
      {vendorBillReqs.length > 0 && (
        <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, overflow: "hidden", marginTop: 24 }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--nx-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--nx-text)" }}>Billing History</div>
            <div style={{ fontSize: 12, color: "var(--nx-text-muted)" }}>{vendorBillReqs.length} request{vendorBillReqs.length !== 1 ? "s" : ""}</div>
          </div>
          {billHistory.map((group, gi) => {
            const isBatch = group.type === "batch";
            const firstBR = group.items[0];
            const statusCounts = { pending: 0, approved: 0, rejected: 0 };
            group.items.forEach(br => { if (br.status in statusCounts) (statusCounts as any)[br.status]++; });
            const overallStatus = statusCounts.rejected > 0 ? "rejected" : statusCounts.pending > 0 ? "pending" : "approved";
            const color = BR_STATUS_COLOR[overallStatus];

            return (
              <div key={gi} style={{ padding: "16px 20px", borderBottom: "1px solid var(--nx-border)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  {isBatch ? (
                    <div style={{ background: "#FFF4E8", border: "2px solid #FF7A00", borderRadius: 10, padding: "8px 12px", minWidth: 60, textAlign: "center", flexShrink: 0 }}>
                      <div style={{ fontSize: 14 }}>📦</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase", marginTop: 2 }}>Batch</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#FF7A00" }}>{group.items.length}</div>
                    </div>
                  ) : (
                    <div style={{ background: overallStatus === "approved" ? "#f0fdf4" : "#FFFBEB", border: `2px solid ${color}`, borderRadius: 10, padding: "8px 12px", minWidth: 60, textAlign: "center", flexShrink: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase" }}>Stage</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color }}>{firstBR.stageNo ?? 1}</div>
                    </div>
                  )}

                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                      {isBatch ? (
                        <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13, color: "var(--nx-text)" }}>
                          {group.items.map(b => b.reqNo).join(", ")}
                        </span>
                      ) : (
                        <span style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13, color: "var(--nx-text)" }}>{firstBR.reqNo}</span>
                      )}
                      <span style={{ background: color, color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 12, textTransform: "uppercase" }}>
                        {BR_STATUS_LABEL[overallStatus] ?? overallStatus}
                      </span>
                    </div>

                    {isBatch && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
                        {group.items.map(br => (
                          <span key={br._id} style={{
                            background: "var(--nx-fill)", padding: "2px 8px", borderRadius: 6,
                            fontSize: 11, color: "var(--nx-text-3)", border: "1px solid var(--nx-border)"
                          }}>
                            {br.projectName} · {br.workOrderNo ?? br.reqNo}
                            {" "}
                            <span style={{ color: BR_STATUS_COLOR[br.status] ?? "#9CA3AF", fontWeight: 700 }}>
                              {br.status === "approved" ? "✅" : br.status === "rejected" ? "❌" : "⏳"}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: "var(--nx-text-muted)" }}>
                      {dayjs(firstBR.createdAt).format("DD MMM YYYY")}
                      {firstBR.periodFrom && ` · Period: ${dayjs(firstBR.periodFrom).format("DD MMM")} → ${dayjs(firstBR.periodTo ?? firstBR.createdAt).format("DD MMM")}`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
          <LocationFields pt={progProjectType} />
          <Form.Item
            label={`Quantity Added (${progItem?.unit})`} name="qtyAdded"
            rules={[
              { required: true, type: "number", min: 0.01, message: "Enter a valid quantity" },
              {
                validator: (_: unknown, value: number) => {
                  if (!value || !progItem) return Promise.resolve();
                  const max = Math.max(0, progItem.plannedQty - progItem.completedQty);
                  if (value > max) return Promise.reject(new Error(`Max remaining: ${fmtN(max)} ${progItem.unit}`));
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
                { label: "Planned",   value: `${fmtN(progItem.plannedQty)} ${progItem.unit}`,                                                color: "var(--nx-text)" },
                { label: "Done",      value: `${fmtN(progItem.completedQty)} ${progItem.unit}`,                                              color: "#16a34a" },
                { label: "Remaining", value: `${fmtN(Math.max(0, progItem.plannedQty - progItem.completedQty))} ${progItem.unit}`,           color: "#FF7A00" },
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
        title="Edit Progress Entry" onOk={handleEditEntry} okText="Save Changes"
        okButtonProps={{ loading: saving, style: { background: "#FF7A00", borderColor: "#FF7A00" } }}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="Date" name="date">
            <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" disabledDate={d => d.isAfter(dayjs(), "day")} />
          </Form.Item>
          <LocationFields pt={progProjectType} />
          <Form.Item label="Quantity Added" name="qtyAdded" rules={[{ required: true, type: "number", min: 0.01, message: "Required" }]}>
            <InputNumber style={{ width: "100%" }} min={0.01} placeholder="e.g. 500" />
          </Form.Item>
          <Form.Item label="Remarks (optional)" name="remarks">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Vendor Bill Generator Modal ────────────────────────────────────── */}
      <Modal
        open={billModal} onCancel={() => setBillModal(false)}
        title={`Generate Bill Request — ${selVendorName}`}
        onOk={handleGenerateBill}
        okText={`Submit Bill Request${selectedWOIds.size > 1 ? ` (${selectedWOIds.size} Work Orders)` : ""}`}
        width={700}
        okButtonProps={{ loading: billGenerating, disabled: selectedWOIds.size === 0, style: { background: "#FF7A00", borderColor: "#FF7A00" } }}
        destroyOnClose
      >
        <div style={{ marginTop: 8 }}>
          <div style={{ padding: 12, background: "#FFF4E8", border: "1px solid #FED7AA", borderRadius: 8, marginBottom: 16, fontSize: 12, color: "#92400e" }}>
            <strong>Multi-project bill request</strong> — select which work orders to include. Quantities are auto-calculated from recorded progress since last billing.
          </div>

          {pendingWODetails.length === 0 ? (
            <Empty description="No pending progress to bill. Record daily progress first." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {projectGroups.map(pg => {
                const pgPendingWOs = pg.wos
                  .map(wo => woDetails.get(wo._id))
                  .filter((d): d is WODetail => !!d && d.scopeItems.some(si => Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)) > 0))
                  .filter(d => !vendorBillReqs.some(br => br.workOrderId === d._id && br.status === "pending"));

                if (!pgPendingWOs.length) return null;
                return (
                  <div key={pg.projectId} style={{ border: "1px solid var(--nx-border)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ background: "var(--nx-fill-2)", padding: "10px 14px", fontWeight: 700, fontSize: 13, color: "var(--nx-text)", borderBottom: "1px solid var(--nx-border)" }}>
                      📂 {pg.projectName}
                    </div>
                    {pgPendingWOs.map(detail => {
                      const pendingItems = detail.scopeItems.filter(si => Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)) > 0);
                      const isChecked = selectedWOIds.has(detail._id);
                      return (
                        <div key={detail._id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--nx-border)", background: isChecked ? "var(--nx-fill-2)" : "var(--nx-white)" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <Checkbox
                              checked={isChecked}
                              onChange={e => {
                                const next = new Set(selectedWOIds);
                                if (e.target.checked) next.add(detail._id); else next.delete(detail._id);
                                setSelectedWOIds(next);
                              }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, color: "#FF7A00", fontFamily: "monospace", fontSize: 13 }}>{detail.workOrderNo}</div>
                              {detail.category && <div style={{ fontSize: 11, color: "var(--nx-text-muted)", marginBottom: 8 }}>{detail.category}{detail.subCategory ? ` › ${detail.subCategory}` : ""}</div>}
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <tbody>
                                  {pendingItems.map(si => {
                                    const billedQty = Math.max(0, si.completedQty - (si.lastBilledQty || 0));
                                    return (
                                      <tr key={si._id}>
                                        <td style={{ padding: "3px 0", color: "var(--nx-text)", fontWeight: 500 }}>{si.description}</td>
                                        <td style={{ padding: "3px 8px", color: "var(--nx-text-2)" }}>{si.unit}</td>
                                        <td style={{ padding: "3px 0", color: "var(--nx-text-2)" }}>Prev billed: {fmtN(si.lastBilledQty || 0)}</td>
                                        <td style={{ padding: "3px 0", textAlign: "right", color: "#FF7A00", fontWeight: 700, fontFamily: "monospace" }}>+{fmtN(billedQty)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {pendingWODetails.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--nx-text-3)", marginBottom: 6 }}>Remarks (optional)</div>
              <Input.TextArea rows={2} placeholder="Any notes for this consolidated bill request…"
                value={billRemarks} onChange={e => setBillRemarks(e.target.value)} />
            </div>
          )}

          {selectedWOIds.size > 0 && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#FFF4E8", border: "1px solid #FED7AA", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
              <strong>{selectedWOIds.size} work order{selectedWOIds.size !== 1 ? "s" : ""}</strong> from <strong>{new Set(pendingWODetails.filter(d => selectedWOIds.has(d._id)).map(d => d.projectName)).size} project{new Set(pendingWODetails.filter(d => selectedWOIds.has(d._id)).map(d => d.projectName)).size !== 1 ? "s" : ""}</strong> will be included in this bill request.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────
export default function WorkProgress() {
  const { user } = useAuth();
  return user?.role === "dri" ? <DRIDashboard /> : <WorkProgressAdmin />;
}
