import { Fragment, useEffect, useState, useMemo } from "react";
import { Select, Spin, Tag, Button, Modal, Form, InputNumber, DatePicker, Input, Checkbox, Empty, message } from "antd";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import dayjs from "dayjs";

// ── Types ──────────────────────────────────────────────────────────────────────
interface DRIUser { _id: string; name: string; email: string; }

interface WORow {
  _id: string;
  workOrderNo: string;
  projectName: string;
  projectId?: string | { _id: string; name: string; code?: string; projectType?: string };
  vendorName?: string;
  vendorCode?: string;
  category?: string;
  status: string;
  contractValue?: number;
  assignedDRI?: DRIUser[];
  scopeItems?: { description: string; completedQty: number; plannedQty: number }[];
}

interface SubItemDetail {
  _id: string;
  description: string;
  remarks?: string;
  unit: string;
  plannedQty: number;
  completedQty: number;
  lastBilledQty: number;
  status: string;
}

interface ScopeItemDetail {
  _id: string;
  description: string;
  remarks?: string;
  unit: string;
  plannedQty: number;
  completedQty: number;
  lastBilledQty: number;
  status?: string;
  subItems?: SubItemDetail[];
}

interface WODetail {
  _id: string;
  workOrderNo: string;
  projectName: string;
  projectId?: { _id: string; name: string; code?: string; projectType?: string };
  vendorName?: string;
  category?: string;
  contractValue?: number;
  scopeItems: ScopeItemDetail[];
}

interface BillReq {
  _id: string;
  reqNo: string;
  workOrderNo?: string;
  workOrderId?: string;
  stageNo?: number;
  status: string;
  createdAt: string;
  vendorName?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  draft: "#9CA3AF", issued: "#3b82f6", "in-progress": "#FF7A00", completed: "#16a34a",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", issued: "Issued", "in-progress": "In Progress", completed: "Completed",
};
const BR_COLOR: Record<string, string> = {
  pending: "#f59e0b", approved: "#16a34a", rejected: "#ef4444",
};
const fmtN = (n: number) => n.toLocaleString("en-IN");
const pctOf = (c: number, p: number) => p > 0 ? Math.min(100, Math.round((c / p) * 100)) : 0;

function getProjId(wo: WORow): string | undefined {
  if (!wo.projectId) return undefined;
  if (typeof wo.projectId === "string") return wo.projectId;
  return wo.projectId._id;
}

// ── Pill / badge helpers ───────────────────────────────────────────────────────
function CountPill({ n, color }: { n: number; color: string }) {
  if (n === 0) return <span style={{ color: "var(--nx-text-muted)", fontSize: 12 }}>—</span>;
  return (
    <span style={{ background: color + "22", color, fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 12 }}>
      {n}
    </span>
  );
}

// ── Location fields (Add Progress modal) ──────────────────────────────────────
function LocationFields({ pt }: { pt: string }) {
  return (
    <div style={{ background: "var(--nx-fill-2)", border: "1px solid var(--nx-border)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>📍 Location (optional)</div>
      {pt === "apartment" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <Form.Item label="Tower" name="tower" style={{ marginBottom: 0 }}><Input placeholder="e.g. A, T1" size="small" /></Form.Item>
          <Form.Item label="Floor" name="floor" style={{ marginBottom: 0 }}><Input placeholder="e.g. G, 1, 5" size="small" /></Form.Item>
          <Form.Item label="Flat No" name="flatNo" style={{ marginBottom: 0 }}><Input placeholder="e.g. 101" size="small" /></Form.Item>
        </div>
      ) : (
        <Form.Item label="Plot No" name="plotNo" style={{ marginBottom: 0 }}><Input placeholder="e.g. Plot-42" /></Form.Item>
      )}
      <Form.Item label="Note" name="locationNote" style={{ marginBottom: 0, marginTop: 8 }}><Input placeholder="Additional location details…" size="small" /></Form.Item>
    </div>
  );
}

// ── Back button ────────────────────────────────────────────────────────────────
function BackBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ background: "none", border: "1px solid var(--nx-border)", borderRadius: 8, padding: "6px 14px", cursor: "pointer", color: "var(--nx-text-2)", fontSize: 13, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
    >
      ← {label}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
type PageView = "overview" | "dri-projects" | "dri-detail";

export default function DRIDashboard() {
  const { user } = useAuth();
  const canEdit = user?.role === "owner"
    || !!user?.permissions?.find(p => p.module === "dri-dashboard")?.actions.includes("edit");

  const [allDRIs,  setAllDRIs]  = useState<DRIUser[]>([]);
  const [allWOs,   setAllWOs]   = useState<WORow[]>([]);
  const [allBills, setAllBills] = useState<BillReq[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Navigation state
  const [view,         setView]         = useState<PageView>("overview");
  const [selectedDRI,  setSelectedDRI]  = useState<DRIUser | null>(null);
  const [selProjectId, setSelProjectId] = useState<string | null>(null);
  const [selProjName,  setSelProjName]  = useState<string>("");

  // Project detail
  const [woDetails,     setWoDetails]     = useState<Map<string, WODetail>>(new Map());
  const [detailLoading, setDetailLoading] = useState(false);

  // Add-progress modal (owner/edit-permission only). `subItem` is set when
  // progress is being logged against one particular rather than the item
  // itself — an item with particulars can only take progress that way.
  const [progModal,  setProgModal]  = useState(false);
  const [progTarget, setProgTarget] = useState<{ woId: string; item: ScopeItemDetail; subItem?: SubItemDetail } | null>(null);
  const [progForm]   = Form.useForm();
  const [progSaving,  setProgSaving]  = useState(false);

  // Generate-bill modal (owner/edit-permission only)
  const [billModal,     setBillModal]     = useState(false);
  const [billWOIds,     setBillWOIds]     = useState<Set<string>>(new Set());
  const [billRemarks,   setBillRemarks]   = useState("");
  const [billGenerating,setBillGenerating]= useState(false);

  // ── Initial load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiClient.get("/users"),
      apiClient.get("/work-orders"),
      apiClient.get("/bill-requests"),
    ])
      .then(([usersR, wosR, billsR]) => {
        setAllDRIs((usersR.data.users ?? []).filter((u: DRIUser & { role: string }) => u.role === "site-dri"));
        setAllWOs(wosR.data.workOrders ?? []);
        setAllBills(billsR.data.billRequests ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Derived: DRI's WOs ────────────────────────────────────────────────────────
  const driWOs = useMemo(() => {
    if (!selectedDRI) return [];
    return allWOs.filter(wo => (wo.assignedDRI ?? []).some(d => d._id === selectedDRI._id));
  }, [allWOs, selectedDRI]);

  // ── Derived: DRI's projects ───────────────────────────────────────────────────
  const driProjects = useMemo(() => {
    const seen = new Map<string, { projectId: string; projectName: string; woCount: number; vendorCodes: Set<string> }>();
    driWOs.forEach(wo => {
      const pid = getProjId(wo);
      if (!pid) return;
      if (!seen.has(pid)) seen.set(pid, { projectId: pid, projectName: wo.projectName, woCount: 0, vendorCodes: new Set() });
      const g = seen.get(pid)!;
      g.woCount++;
      if (wo.vendorCode) g.vendorCodes.add(wo.vendorCode);
    });
    return Array.from(seen.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [driWOs]);

  // ── Derived: WOs for selected project ────────────────────────────────────────
  const projectWOs = useMemo(
    () => driWOs.filter(wo => getProjId(wo) === selProjectId),
    [driWOs, selProjectId]
  );

  // ── Derived: bills for selected project ──────────────────────────────────────
  const projectBills = useMemo(
    () => allBills.filter(b => projectWOs.some(wo => wo._id === b.workOrderId)),
    [allBills, projectWOs]
  );

  // ── Load WO details when project changes ──────────────────────────────────────
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

  // Work orders in the current project with unbilled progress and no bill
  // request already pending against them — eligible for a new bill request.
  const billableWODetails = useMemo(
    () => Array.from(woDetails.values()).filter(d =>
      d.scopeItems.some(si => Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)) > 0) &&
      !projectBills.some(br => br.workOrderId === d._id && br.status === "pending")
    ),
    [woDetails, projectBills]
  );

  const progProjectType: "apartment" | "plot" = useMemo(() => {
    if (!progTarget) return "apartment";
    return woDetails.get(progTarget.woId)?.projectId?.projectType === "plot" ? "plot" : "apartment";
  }, [progTarget, woDetails]);

  // Whichever the modal is actually logging progress against — the item itself,
  // or one specific particular when the item has them.
  const progModalTarget = progTarget ? (progTarget.subItem ?? progTarget.item) : null;

  const openAddProgress = (woId: string, item: ScopeItemDetail, subItem?: SubItemDetail) => {
    setProgTarget({ woId, item, subItem });
    progForm.resetFields();
    progForm.setFieldsValue({ date: dayjs() });
    setProgModal(true);
  };

  const handleAddProgress = async () => {
    if (!progTarget) return;
    const vals = await progForm.validateFields();
    const target = progTarget.subItem ?? progTarget.item;
    const path = progTarget.subItem
      ? `/work-orders/${progTarget.woId}/scope-items/${progTarget.item._id}/sub-items/${progTarget.subItem._id}/progress`
      : `/work-orders/${progTarget.woId}/scope-items/${progTarget.item._id}/progress`;
    setProgSaving(true);
    try {
      await apiClient.post(path, {
        date: vals.date ? dayjs(vals.date).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"),
        qtyAdded: vals.qtyAdded,
        remarks: vals.remarks || "",
        tower: vals.tower || "",
        floor: vals.floor || "",
        flatNo: vals.flatNo || "",
        plotNo: vals.plotNo || "",
        locationNote: vals.locationNote || "",
        ...(vals.plannedQty ? { plannedQty: vals.plannedQty } : {}),
      });
      message.success(`+${fmtN(vals.qtyAdded)} ${target.unit} recorded`);
      setProgModal(false);
      progForm.resetFields();
      await reloadWODetail(progTarget.woId);
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to add progress");
    } finally {
      setProgSaving(false);
    }
  };

  const openBillModal = () => {
    setBillWOIds(new Set(billableWODetails.map(d => d._id)));
    setBillRemarks("");
    setBillModal(true);
  };

  const handleGenerateBill = async () => {
    const workOrderIds = Array.from(billWOIds);
    if (!workOrderIds.length) { message.warning("Select at least one work order"); return; }
    setBillGenerating(true);
    try {
      const res = await apiClient.post("/bill-requests/batch", { workOrderIds, remarks: billRemarks });
      message.success(res.data?.message || "Bill request submitted");
      setBillModal(false);
      await Promise.all(workOrderIds.map(id => reloadWODetail(id)));
      const r = await apiClient.get("/bill-requests");
      setAllBills(r.data.billRequests ?? []);
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to submit bill request");
    } finally {
      setBillGenerating(false);
    }
  };

  // ── Per-DRI stats for overview table ──────────────────────────────────────────
  const driStats = useMemo(() => allDRIs.map(dri => {
    const wos   = allWOs.filter(wo => (wo.assignedDRI ?? []).some(d => d._id === dri._id));
    const woIds = new Set(wos.map(w => w._id));
    const bills = allBills.filter(b => b.workOrderId && woIds.has(b.workOrderId));
    return {
      dri,
      total:        wos.length,
      active:       wos.filter(w => w.status === "in-progress" || w.status === "issued").length,
      completed:    wos.filter(w => w.status === "completed").length,
      pendingBills: bills.filter(b => b.status === "pending").length,
      approvedBills:bills.filter(b => b.status === "approved").length,
    };
  }), [allDRIs, allWOs, allBills]);

  // ── Navigation helpers ────────────────────────────────────────────────────────
  const selectDRI = (dri: DRIUser) => {
    setSelectedDRI(dri);
    setSelProjectId(null);
    setWoDetails(new Map());
    setView("dri-projects");
  };

  const goToOverview = () => {
    setSelectedDRI(null);
    setSelProjectId(null);
    setWoDetails(new Map());
    setView("overview");
  };

  const goToProjects = () => {
    setSelProjectId(null);
    setWoDetails(new Map());
    setView("dri-projects");
  };

  const openProject = (projectId: string, projectName: string) => {
    setSelProjectId(projectId);
    setSelProjName(projectName);
    setView("dri-detail");
  };

  // ── Shared header ─────────────────────────────────────────────────────────────
  const Header = () => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {/* Back buttons */}
        {view === "dri-projects" && <BackBtn label="All DRIs" onClick={goToOverview} />}
        {view === "dri-detail" && (
          <>
            <BackBtn label="All DRIs" onClick={goToOverview} />
            <BackBtn label={`${selectedDRI?.name}'s Projects`} onClick={goToProjects} />
          </>
        )}

        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--nx-text)" }}>DRI Work Dashboard</h1>
          {selectedDRI && view !== "overview" && (
            <div style={{ fontSize: 13, color: "var(--nx-text-2)", marginTop: 3 }}>
              Viewing as <span style={{ color: "#FF7A00", fontWeight: 700 }}>{selectedDRI.name}</span>
              <span style={{ color: "var(--nx-text-muted)", marginLeft: 8 }}>{selectedDRI.email}</span>
            </div>
          )}
        </div>

        {/* DRI selector — always visible */}
        <div style={{ minWidth: 280 }}>
          <Select
            showSearch
            allowClear
            placeholder="Select DRI to view their dashboard →"
            style={{ width: "100%" }}
            value={selectedDRI?._id ?? undefined}
            onClear={goToOverview}
            onChange={val => {
              if (!val) { goToOverview(); return; }
              const dri = allDRIs.find(d => d._id === val);
              if (dri) selectDRI(dri);
            }}
            filterOption={(input, opt) =>
              String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())
            }
          >
            {allDRIs.map(d => (
              <Select.Option key={d._id} value={d._id} label={d.name}>
                <div style={{ lineHeight: 1.4 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: "var(--nx-text-muted)" }}>{d.email}</div>
                </div>
              </Select.Option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
      <Spin size="large" />
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW: OVERVIEW — all DRIs summary table
  // ════════════════════════════════════════════════════════════════════════════
  if (view === "overview") {
    const totalActive    = allWOs.filter(w => w.status === "in-progress" || w.status === "issued").length;
    const totalCompleted = allWOs.filter(w => w.status === "completed").length;
    const totalPending   = allBills.filter(b => b.status === "pending").length;

    return (
      <div style={{ paddingBottom: 40 }}>
        <Header />

        {/* Summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total DRIs",     value: allDRIs.length,  color: "#6366f1" },
            { label: "Total WOs",      value: allWOs.length,   color: "#FF7A00" },
            { label: "Active WOs",     value: totalActive,     color: "#3b82f6" },
            { label: "Completed WOs",  value: totalCompleted,  color: "#16a34a" },
            { label: "Pending Bills",  value: totalPending,    color: "#f59e0b" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 10, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* DRI table */}
        <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--nx-border)", fontWeight: 700, fontSize: 15, color: "var(--nx-text)" }}>
            All DRIs — click any row to view their dashboard
          </div>
          {allDRIs.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center", color: "var(--nx-text-muted)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👷</div>
              <div>No DRI users found.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--nx-fill-2)" }}>
                    {["DRI Name", "Email", "Total WOs", "Active", "Completed", "Pending Bills", "Approved Bills", ""].map(h => (
                      <th key={h} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 700, color: "var(--nx-table-header-color)", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--nx-border)", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {driStats.map((row, i) => (
                    <tr
                      key={row.dri._id}
                      style={{ borderBottom: "1px solid var(--nx-border)", background: i % 2 === 0 ? "var(--nx-white)" : "var(--nx-fill-2)", cursor: "pointer", transition: "background 0.1s" }}
                      onClick={() => selectDRI(row.dri)}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--nx-fill)")}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "var(--nx-white)" : "var(--nx-fill-2)")}
                    >
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 30, height: 30, borderRadius: "50%", background: "#FF7A00", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                            {row.dri.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                          </span>
                          <span style={{ fontWeight: 700, color: "#FF7A00", fontSize: 13 }}>{row.dri.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--nx-text-2)" }}>{row.dri.email}</td>
                      <td style={{ padding: "11px 14px", fontFamily: "monospace", fontWeight: 700, color: "var(--nx-text)", fontSize: 14 }}>{row.total}</td>
                      <td style={{ padding: "11px 14px" }}><CountPill n={row.active} color="#3b82f6" /></td>
                      <td style={{ padding: "11px 14px" }}><CountPill n={row.completed} color="#16a34a" /></td>
                      <td style={{ padding: "11px 14px" }}><CountPill n={row.pendingBills} color="#f59e0b" /></td>
                      <td style={{ padding: "11px 14px" }}><CountPill n={row.approvedBills} color="#16a34a" /></td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ color: "#FF7A00", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>View Dashboard →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW: DRI PROJECTS — same project-card layout the DRI sees
  // ════════════════════════════════════════════════════════════════════════════
  if (view === "dri-projects") {
    return (
      <div style={{ paddingBottom: 40 }}>
        <Header />

        {/* DRI stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Projects",   value: driProjects.length, color: "#6366f1" },
            { label: "Total WOs",  value: driWOs.length,      color: "#FF7A00" },
            { label: "Active",     value: driWOs.filter(w => w.status === "in-progress" || w.status === "issued").length, color: "#3b82f6" },
            { label: "Completed",  value: driWOs.filter(w => w.status === "completed").length, color: "#16a34a" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 10, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {driProjects.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, background: "var(--nx-white)", borderRadius: 12, border: "1px solid var(--nx-border)" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏗️</div>
            <div style={{ fontWeight: 600, color: "var(--nx-text)" }}>No work orders assigned</div>
            <div style={{ color: "var(--nx-text-muted)", marginTop: 4 }}>{selectedDRI?.name} has no assigned work orders.</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>
              {selectedDRI?.name}'s Projects ({driProjects.length})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {driProjects.map(p => (
                <div
                  key={p.projectId}
                  onClick={() => openProject(p.projectId, p.projectName)}
                  style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderLeft: "4px solid #FF7A00", borderRadius: 12, padding: "20px 20px 16px", cursor: "pointer", transition: "box-shadow 0.15s, transform 0.12s", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.1)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  <div style={{ fontSize: 17, fontWeight: 700, color: "var(--nx-text)", marginBottom: 8 }}>{p.projectName}</div>
                  <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--nx-text-2)" }}>
                    <span>👷 {p.vendorCodes.size} contractor{p.vendorCodes.size !== 1 ? "s" : ""}</span>
                    <span>📋 {p.woCount} work order{p.woCount !== 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, color: "#FF7A00", fontWeight: 600 }}>Open Project →</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW: DRI DETAIL — project dashboard (read-only, as DRI sees it)
  // ════════════════════════════════════════════════════════════════════════════

  // Group WOs by vendor within the selected project
  const vendorGroups = (() => {
    const groups = new Map<string, { vendorName: string; vendorCode: string; wos: WORow[] }>();
    projectWOs.forEach(wo => {
      const code = wo.vendorCode || "unknown";
      if (!groups.has(code)) groups.set(code, { vendorName: wo.vendorName || code, vendorCode: code, wos: [] });
      groups.get(code)!.wos.push(wo);
    });
    return Array.from(groups.values()).sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  })();

  return (
    <div style={{ paddingBottom: 40 }}>
      <Header />

      {/* Project sub-header */}
      <div style={{ marginBottom: 20, padding: "16px 20px", background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--nx-text)" }}>{selProjName}</div>
          <div style={{ fontSize: 12, color: "var(--nx-text-2)", marginTop: 4 }}>
            {projectWOs.length} work order{projectWOs.length !== 1 ? "s" : ""} · {vendorGroups.length} contractor{vendorGroups.length !== 1 ? "s" : ""}
            {canEdit ? (
              <span style={{ marginLeft: 12, padding: "2px 8px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, color: "#166534", fontSize: 11, fontWeight: 600 }}>
                ✎ Editable — owner access
              </span>
            ) : (
              <span style={{ marginLeft: 12, padding: "2px 8px", background: "#FFF4E8", border: "1px solid #FED7AA", borderRadius: 6, color: "#92400e", fontSize: 11, fontWeight: 600 }}>
                👁 Read-only — admin view
              </span>
            )}
          </div>
        </div>
        {canEdit && billableWODetails.length > 0 && (
          <Button type="primary" style={{ background: "#f37916", borderColor: "#f37916" }} onClick={openBillModal}>
            🧾 Generate Bill Request ({billableWODetails.length})
          </Button>
        )}
      </div>

      {/* Summary stats */}
      {!detailLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Contractors",   value: String(vendorGroups.length), color: "#FF7A00" },
            { label: "Work Orders",   value: String(projectWOs.length),   color: "#3b82f6" },
            { label: "Bill Requests", value: String(projectBills.length), color: "#7c3aed" },
            { label: "Approved",      value: String(projectBills.filter(b => b.status === "approved").length), color: "#16a34a" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "14px 18px" }}>
              <div style={{ fontSize: 10, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {detailLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spin size="large" /></div>
      ) : (
        <>
          {/* Vendor + WO cards */}
          {vendorGroups.map(vg => (
            <div key={vg.vendorCode} style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
              <div style={{ background: "#1F2937", padding: "14px 20px" }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>👷 {vg.vendorName}</div>
                <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>
                  <span style={{ fontFamily: "monospace", color: "#FF7A00" }}>{vg.vendorCode}</span> · {vg.wos.length} work order{vg.wos.length !== 1 ? "s" : ""}
                </div>
              </div>

              {vg.wos.map(wo => {
                const detail = woDetails.get(wo._id);
                const avgPct = detail?.scopeItems.length
                  ? Math.round(detail.scopeItems.reduce((s, si) => s + pctOf(si.completedQty, si.plannedQty), 0) / detail.scopeItems.length)
                  : 0;

                return (
                  <div key={wo._id} style={{ borderBottom: "1px solid var(--nx-border)" }}>
                    {/* WO sub-header */}
                    <div style={{ padding: "12px 20px", background: "var(--nx-fill-2)", borderBottom: "1px solid var(--nx-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00", fontSize: 13 }}>{wo.workOrderNo}</span>
                        {wo.category && (
                          <span style={{ background: "var(--nx-fill)", color: "var(--nx-text-3)", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>{wo.category}</span>
                        )}
                        <span style={{ background: (STATUS_COLOR[wo.status] ?? "#9CA3AF") + "22", color: STATUS_COLOR[wo.status] ?? "#9CA3AF", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>
                          {STATUS_LABEL[wo.status] ?? wo.status}
                        </span>
                      </div>
                      {detail && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                          <div style={{ width: 80, height: 6, background: "var(--nx-border)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${avgPct}%`, height: "100%", background: avgPct >= 100 ? "#16a34a" : "#FF7A00", borderRadius: 3 }} />
                          </div>
                          <span style={{ fontWeight: 700, color: avgPct >= 100 ? "#16a34a" : "#FF7A00" }}>{avgPct}%</span>
                        </div>
                      )}
                    </div>

                    {/* Scope items table */}
                    {!detail ? (
                      <div style={{ padding: 24, textAlign: "center" }}><Spin size="small" /></div>
                    ) : detail.scopeItems.length === 0 ? (
                      <div style={{ padding: 20, textAlign: "center", color: "var(--nx-text-muted)", fontSize: 13 }}>No scope items defined.</div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "var(--nx-fill-2)" }}>
                              {["#", "Description", "Unit", "Planned", "Done", "Billed", "Unbilled", "Progress", ...(canEdit ? ["Action"] : [])].map(h => (
                                <th key={h} style={{ padding: "9px 12px", fontSize: 10, fontWeight: 700, color: "var(--nx-table-header-color)", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", borderBottom: "1px solid var(--nx-border)" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {detail.scopeItems.map((si, idx) => {
                              const p          = pctOf(si.completedQty, si.plannedQty);
                              const billed     = si.lastBilledQty || 0;
                              const unbilled   = Math.max(0, si.completedQty - billed);
                              const hasSubItems = (si.subItems?.length ?? 0) > 0;
                              const rowBg = idx % 2 === 0 ? "var(--nx-white)" : "var(--nx-fill-2)";
                              return (
                                <Fragment key={si._id}>
                                  <tr style={{ borderBottom: hasSubItems ? "none" : "1px solid var(--nx-border)", background: rowBg }}>
                                    <td style={{ padding: "9px 12px", color: "var(--nx-text-muted)", fontSize: 12 }}>{idx + 1}</td>
                                    <td style={{ padding: "9px 12px", fontWeight: 600, color: "var(--nx-text)", fontSize: 13 }}>
                                      {si.description}
                                      {hasSubItems && (
                                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" }}>
                                          {si.status === "completed" ? "✓ Complete" : `${si.subItems!.length} particulars`}
                                        </span>
                                      )}
                                    </td>
                                    <td style={{ padding: "9px 12px", color: "var(--nx-text-2)", fontSize: 12 }}>{si.unit}</td>
                                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: "var(--nx-text)" }}>{fmtN(si.plannedQty)}</td>
                                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: si.completedQty > 0 ? "#16a34a" : "var(--nx-text-muted)" }}>{fmtN(si.completedQty)}</td>
                                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12, color: "#3b82f6" }}>{fmtN(billed)}</td>
                                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12 }}>
                                      {unbilled > 0
                                        ? <span style={{ color: "#FF7A00", fontWeight: 700 }}>{fmtN(unbilled)}</span>
                                        : <span style={{ color: "var(--nx-text-muted)" }}>—</span>
                                      }
                                    </td>
                                    <td style={{ padding: "9px 12px", minWidth: 120 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                        <div style={{ flex: 1, height: 6, background: "var(--nx-border)", borderRadius: 3, overflow: "hidden" }}>
                                          <div style={{ width: `${p}%`, height: "100%", background: p >= 100 ? "#16a34a" : "#FF7A00", borderRadius: 3 }} />
                                        </div>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: p >= 100 ? "#16a34a" : "#FF7A00", minWidth: 26 }}>{p}%</span>
                                      </div>
                                    </td>
                                    {canEdit && (
                                      <td style={{ padding: "9px 12px" }}>
                                        {!hasSubItems && (
                                          <Button size="small" onClick={() => openAddProgress(wo._id, si)}>
                                            + Progress
                                          </Button>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                  {hasSubItems && si.subItems!.map((sub, subIdx) => {
                                    const sp = pctOf(sub.completedQty, sub.plannedQty);
                                    const isLastSub = subIdx === si.subItems!.length - 1;
                                    return (
                                      <tr key={sub._id} style={{ borderBottom: isLastSub ? "1px solid var(--nx-border)" : "1px solid var(--nx-border-subtle, #F3F4F6)", background: "#FCFCFD" }}>
                                        <td style={{ padding: "6px 12px 6px 28px", color: "var(--nx-text-muted)", fontSize: 11 }}>{idx + 1}.{subIdx + 1}</td>
                                        <td style={{ padding: "6px 12px", fontWeight: 500, color: "var(--nx-text-2)", fontSize: 12 }}>
                                          {sub.description}
                                          {sub.status === "completed" && <span style={{ marginLeft: 6, color: "#16a34a", fontSize: 10, fontWeight: 700 }}>✓</span>}
                                        </td>
                                        <td style={{ padding: "6px 12px", color: "var(--nx-text-2)", fontSize: 11 }}>{sub.unit}</td>
                                        <td style={{ padding: "6px 12px", fontFamily: "monospace", fontSize: 11, color: "var(--nx-text)" }}>{fmtN(sub.plannedQty)}</td>
                                        <td style={{ padding: "6px 12px", fontFamily: "monospace", fontSize: 11, color: sub.completedQty > 0 ? "#16a34a" : "var(--nx-text-muted)" }}>{fmtN(sub.completedQty)}</td>
                                        {/* Billing tracks at the item level (its completedQty rolls up from all
                                            particulars), not per particular — shown blank here on purpose. */}
                                        <td style={{ padding: "6px 12px", fontSize: 11, color: "var(--nx-text-muted)" }}>—</td>
                                        <td style={{ padding: "6px 12px", fontSize: 11, color: "var(--nx-text-muted)" }}>—</td>
                                        <td style={{ padding: "6px 12px", minWidth: 120 }}>
                                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                            <div style={{ flex: 1, height: 5, background: "var(--nx-border)", borderRadius: 3, overflow: "hidden" }}>
                                              <div style={{ width: `${sp}%`, height: "100%", background: sp >= 100 ? "#16a34a" : "#FF7A00", borderRadius: 3 }} />
                                            </div>
                                            <span style={{ fontSize: 9.5, fontWeight: 700, color: sp >= 100 ? "#16a34a" : "#FF7A00", minWidth: 26 }}>{sp}%</span>
                                          </div>
                                        </td>
                                        {canEdit && (
                                          <td style={{ padding: "6px 12px" }}>
                                            <Button size="small" onClick={() => openAddProgress(wo._id, si, sub)}>
                                              + Progress
                                            </Button>
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Billing history */}
          {projectBills.length > 0 && (
            <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, overflow: "hidden", marginTop: 8 }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--nx-border)", fontWeight: 700, fontSize: 15, color: "var(--nx-text)" }}>
                Billing History — {selProjName}
              </div>
              {projectBills.map((br, i) => {
                const color = BR_COLOR[br.status] ?? "#9CA3AF";
                return (
                  <div key={br._id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--nx-border)", display: "flex", gap: 12, alignItems: "center", background: i % 2 === 0 ? "var(--nx-white)" : "var(--nx-fill-2)" }}>
                    <div style={{ background: br.status === "approved" ? "#f0fdf4" : "#FFFBEB", border: `2px solid ${color}`, borderRadius: 10, padding: "6px 10px", minWidth: 52, textAlign: "center", flexShrink: 0 }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase" }}>Stage</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color }}>{br.stageNo ?? 1}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13, color: "var(--nx-text)" }}>{br.reqNo}</div>
                      <div style={{ fontSize: 11, color: "var(--nx-text-muted)", marginTop: 2 }}>
                        {br.vendorName && <span>{br.vendorName} · </span>}
                        {dayjs(br.createdAt).format("DD MMM YYYY")}
                      </div>
                    </div>
                    <Tag color={br.status === "approved" ? "green" : br.status === "rejected" ? "red" : "orange"} style={{ fontWeight: 700, fontSize: 11 }}>
                      {br.status.toUpperCase()}
                    </Tag>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Add Progress Modal (owner/edit-permission only) ──────────────────── */}
      <Modal
        open={progModal}
        onCancel={() => { setProgModal(false); progForm.resetFields(); }}
        title={
          progTarget?.subItem
            ? `Add Progress — ${progTarget.item.description} › ${progTarget.subItem.description}`
            : `Add Progress — ${progTarget?.item.description ?? ""}`
        }
        onOk={handleAddProgress}
        okText="Save Progress"
        okButtonProps={{ loading: progSaving, style: { background: "#FF7A00", borderColor: "#FF7A00" } }}
        destroyOnClose
      >
        <Form form={progForm} layout="vertical" style={{ marginTop: 8 }}>
          {progModalTarget?.remarks && (
            <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#92400e" }}>
              <span style={{ fontWeight: 700 }}>📌 Instruction: </span>{progModalTarget.remarks}
            </div>
          )}
          <Form.Item label="Date" name="date" rules={[{ required: true, message: "Select date" }]}>
            <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" disabledDate={d => d.isAfter(dayjs(), "day")} />
          </Form.Item>
          <LocationFields pt={progProjectType} />
          {progModalTarget && !progModalTarget.plannedQty && (
            <div style={{ background: "#FFF8F0", border: "1px solid #FDDCB5", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#FF7A00", marginBottom: 6 }}>Planned quantity not set for this item</div>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 10 }}>You can set the total planned quantity now, or leave blank to log progress without a cap.</div>
              <Form.Item label={`Total Planned Qty (${progModalTarget.unit})`} name="plannedQty" style={{ marginBottom: 0 }}>
                <InputNumber style={{ width: "100%" }} min={0.00001} step={0.00001} precision={5} placeholder={progModalTarget.unit === "per-hr" ? "e.g. 200.0000" : "e.g. 5000"} />
              </Form.Item>
            </div>
          )}
          <Form.Item
            label={`Quantity Added (${progModalTarget?.unit ?? ""})`}
            name="qtyAdded"
            extra={progModalTarget?.unit === "per-hr" ? "Tip: enter decimals for minutes — e.g. 13.67 = 13 hr 40 min" : undefined}
            rules={[
              { required: true, type: "number", min: 0.01, message: "Enter a valid quantity (e.g. 13.67)" },
              {
                validator: (_, value) => {
                  if (!value || !progModalTarget) return Promise.resolve();
                  if (!progModalTarget.plannedQty) return Promise.resolve();
                  const max = Math.max(0, progModalTarget.plannedQty - progModalTarget.completedQty);
                  if (value > max) return Promise.reject(new Error(`Max remaining: ${fmtN(max)} ${progModalTarget.unit}`));
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber
              style={{ width: "100%" }} min={0.00001} step={0.00001} precision={5}
              max={progModalTarget?.plannedQty ? Math.max(0, progModalTarget.plannedQty - progModalTarget.completedQty) : undefined}
              placeholder={progModalTarget?.unit === "per-hr" ? "e.g. 13.6667" : "e.g. 500"}
            />
          </Form.Item>
          <Form.Item label="Remarks (optional)" name="remarks">
            <Input.TextArea rows={2} placeholder="Notes for today's work…" />
          </Form.Item>
          {progModalTarget && (
            <div style={{ background: "var(--nx-fill-2)", border: "1px solid var(--nx-border)", borderRadius: 8, padding: 12, fontSize: 12 }}>
              {[
                { label: "Planned", value: progModalTarget.plannedQty > 0 ? `${fmtN(progModalTarget.plannedQty)} ${progModalTarget.unit}` : "Not set", color: progModalTarget.plannedQty > 0 ? "var(--nx-text)" : "#9ba3b8" },
                { label: "Done", value: `${fmtN(progModalTarget.completedQty)} ${progModalTarget.unit}`, color: "#16a34a" },
                { label: "Remaining", value: progModalTarget.plannedQty > 0 ? `${fmtN(Math.max(0, progModalTarget.plannedQty - progModalTarget.completedQty))} ${progModalTarget.unit}` : "Unlimited", color: "#FF7A00" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "var(--nx-text-2)" }}>{r.label}</span><strong style={{ color: r.color }}>{r.value}</strong>
                </div>
              ))}
            </div>
          )}
        </Form>
      </Modal>

      {/* ── Generate Bill Request Modal (owner/edit-permission only) ──────────── */}
      <Modal
        open={billModal}
        onCancel={() => setBillModal(false)}
        title={`Generate Bill Request — ${selProjName}`}
        onOk={handleGenerateBill}
        okText={`Submit Bill Request${billWOIds.size > 1 ? ` (${billWOIds.size} Work Orders)` : ""}`}
        confirmLoading={billGenerating}
        okButtonProps={{ disabled: billWOIds.size === 0, style: { background: "#FF7A00", borderColor: "#FF7A00" } }}
        width={700}
        destroyOnClose
      >
        <div style={{ marginTop: 8 }}>
          <div style={{ padding: 12, background: "#FFF4E8", border: "1px solid #FED7AA", borderRadius: 8, marginBottom: 16, fontSize: 12, color: "#92400e" }}>
            <strong>Project bill request</strong> — select work orders to include. Quantities are auto-calculated from recorded progress since last billing.
          </div>

          {billableWODetails.length === 0 ? (
            <Empty description="No pending progress to bill. Record daily progress first." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {vendorGroups.map(vg => {
                const vgBillableWOs = vg.wos
                  .map(wo => woDetails.get(wo._id))
                  .filter((d): d is WODetail => !!d && billableWODetails.some(b => b._id === d._id));

                if (!vgBillableWOs.length) return null;
                return (
                  <div key={vg.vendorCode} style={{ border: "1px solid var(--nx-border)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ background: "var(--nx-fill-2)", padding: "10px 14px", fontWeight: 700, fontSize: 13, color: "var(--nx-text)", borderBottom: "1px solid var(--nx-border)" }}>
                      👷 {vg.vendorName} <span style={{ fontFamily: "monospace", color: "#FF7A00", fontSize: 11, fontWeight: 400 }}>({vg.vendorCode})</span>
                    </div>
                    {vgBillableWOs.map(detail => {
                      const pendingItems = detail.scopeItems.filter(si => Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)) > 0);
                      const isChecked = billWOIds.has(detail._id);
                      return (
                        <div key={detail._id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--nx-border)", background: isChecked ? "var(--nx-fill-2)" : "var(--nx-white)" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <Checkbox
                              checked={isChecked}
                              onChange={e => setBillWOIds(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(detail._id); else next.delete(detail._id);
                                return next;
                              })}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, color: "#FF7A00", fontFamily: "monospace", fontSize: 13 }}>{detail.workOrderNo}</div>
                              {detail.category && <div style={{ fontSize: 11, color: "var(--nx-text-muted)", marginBottom: 8 }}>{detail.category}</div>}
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

          {billableWODetails.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--nx-text-3)", marginBottom: 6 }}>Remarks (optional)</div>
              <Input.TextArea rows={2} placeholder="Any notes for this consolidated bill request…"
                value={billRemarks} onChange={e => setBillRemarks(e.target.value)} />
            </div>
          )}

          {billWOIds.size > 0 && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#FFF4E8", border: "1px solid #FED7AA", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
              <strong>{billWOIds.size} work order{billWOIds.size !== 1 ? "s" : ""}</strong> will be included in this bill request.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
