import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Select, Table, Tag, Button, Modal, Input, InputNumber, Checkbox, Empty, Spin, message, Tooltip,
  Tabs, Badge, Switch, Popconfirm, Row, Col,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckCircleOutlined, CloseCircleOutlined, WarningOutlined, EyeOutlined, InboxOutlined,
  FileTextOutlined, TeamOutlined, ClusterOutlined, ClockCircleOutlined, DownOutlined, RightOutlined,
  PrinterOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import { SearchFilter } from "../../ui/Filters";
import { useAuth } from "../../context/AuthContext";
import type { AuthUser } from "../../context/AuthContext";
import { selectableProjects } from "../../utils/projectOptions";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import StatCard from "../../shared/components/StatCard";
import WorkflowInstanceStepper from "../../components/WorkflowInstanceStepper";
import type { WorkflowInstance } from "../../types/Workflow";
import { printBill } from "../../shared/utils/printBill";
import type { PrintableBill } from "../../shared/utils/printBill";
import type { Contractor } from "../../types/VendorBilling";
import { billFinancials } from "../../shared/utils/billMath";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProgressEntryDetail {
  _id: string; date: string; qtyAdded: number; remarks?: string;
  tower?: string; floor?: string; flatNo?: string; plotNo?: string; locationNote?: string;
  enteredBy?: { _id: string; name: string } | string | null;
  invalidated?: { done?: boolean; reason?: string; at?: string };
}
interface SubItemDetail {
  _id: string; description: string; remarks?: string; unit: string;
  plannedQty: number; completedQty: number; lastBilledQty: number;
  status?: string; varianceApproved?: boolean;
  progressEntries?: ProgressEntryDetail[];
}
interface ScopeItemDetail {
  _id: string; description: string; remarks?: string; unit: string;
  plannedQty: number; completedQty: number; lastBilledQty: number;
  status?: string; varianceApproved?: boolean;
  subItems?: SubItemDetail[];
  progressEntries?: ProgressEntryDetail[];
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
interface DriOption { _id: string; name: string; email: string; }
interface ActivityEvent {
  _id: string; type: string; workOrderId?: string; workOrderNo?: string; vendorName?: string;
  projectId?: { _id: string; name: string } | string;
  performedByName?: string; performedBy?: string; remarks?: string;
  metadata?: { scopeItem?: string; qtyAdded?: number; unit?: string; plannedQty?: number; completedQty?: number };
  createdAt: string;
}
interface BillItem {
  scopeItemId?: string; description: string; unit: string; billedQty: number;
  rate?: number; amount?: number; progressRemarks?: string;
}
interface ApprovalHistoryEntry {
  stage: "agm" | "gm"; action: "approved" | "rejected";
  by?: { _id: string; name: string } | string | null;
  at?: string; remarks?: string;
}
interface BillRequestRow {
  _id: string; reqNo: string; stageNo?: number;
  workOrderId?: string; workOrderNo: string;
  projectId?: string; projectName: string; projectLocation?: string;
  vendorCode?: string; vendorName: string; companyName?: string; category?: string; subCategory?: string;
  items: BillItem[]; remarks?: string;
  periodFrom?: string; periodTo?: string;
  status: "pending" | "pending-gm" | "approved" | "rejected";
  requestedBy?: { name: string; email: string };
  agmApprovedBy?: { name: string } | string | null;
  agmApprovedAt?: string;
  retentionAmount?: number;
  advanceRecovery?: number;
  gstPercentOverride?: number | null;
  payeeVendorCode?: string;
  payeeVendorName?: string;
  rejectReason?: string;
  approvalHistory?: ApprovalHistoryEntry[];
  billId?: { _id: string; billNo: string; status: string; amount: number; paidAmount?: number; retentionPercent?: number; retentionAmount?: number; advanceRecovery?: number; gstPercent?: number; tdsAmount?: number; paymentDate?: string; paymentMode?: string; paymentUTR?: string; paymentBank?: string; paymentReleasedBy?: string };
  milestoneAchieved?: boolean;
  milestoneDate?: string;
  createdAt: string;
  isArchived?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt  = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Per-unit rates are fractional far more often than totals are — rounding
// them for display (as fmt() does) silently turns 130.5 into 131.
const fmtRate = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = (n: number) => (n ?? 0).toLocaleString("en-IN");
const pctOf = (c: number, p: number) => p > 0 ? Math.min(100, Math.round((c / p) * 100)) : 0;

const STATUS_CFG: Record<string, { color: string; label: string }> = {
  pending:    { color: "orange", label: "Pending L1 (AGM)" },
  "pending-gm": { color: "blue", label: "Pending L2 (GM)" },
  approved:   { color: "green",  label: "Approved" },
  rejected:   { color: "red",    label: "Rejected" },
};

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

function actorName(by?: { name: string } | string | null): string | undefined {
  if (!by || typeof by === "string") return undefined;
  return by.name;
}

// A grant for module 'bill-requests' with the given action — Owner always
// bypasses; agm/gm roles get their own stage's action even without an
// explicit checklist grant, matching the backend route's hardcoded fallback.
function hasPerm(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return !!user.permissions?.find(p => p.module === "bill-requests")?.actions.includes(action);
}

// Compact, read-only log of every raw dated progress entry behind a scope
// item — the aggregated planned/done/unbilled row above can't show this;
// the data already exists on the WorkOrder document, this just surfaces it.
function ProgressEntryLog({ entries }: { entries?: ProgressEntryDetail[] }) {
  if (!entries || entries.length === 0) {
    return <div style={{ padding: "8px 10px", fontSize: 12, color: "#9CA3AF" }}>No individual entries recorded.</div>;
  }
  const sorted = [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ background: "#F3F4F6" }}>
          {["Date", "Qty Added", "Location", "Remarks", ""].map(h => (
            <th key={h} style={{ padding: "4px 8px", textAlign: "left", fontSize: 10, color: "#6B7280", textTransform: "uppercase" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(e => {
          const loc = [e.tower && `Tower ${e.tower}`, e.floor && `Floor ${e.floor}`, e.flatNo && `Flat ${e.flatNo}`, e.plotNo && `Plot ${e.plotNo}`, e.locationNote].filter(Boolean).join(" · ");
          return (
            <tr key={e._id} style={{ borderBottom: "1px solid #E5E7EB", textDecoration: e.invalidated?.done ? "line-through" : undefined, opacity: e.invalidated?.done ? 0.55 : 1 }}>
              <td style={{ padding: "4px 8px" }}>{dayjs(e.date).format("DD MMM YYYY")}</td>
              <td style={{ padding: "4px 8px", fontFamily: "monospace", color: "#16a34a", fontWeight: 600 }}>+{fmtN(e.qtyAdded)}</td>
              <td style={{ padding: "4px 8px", color: "#6B7280" }}>{loc || "—"}</td>
              <td style={{ padding: "4px 8px", color: "#6B7280" }}>{e.remarks || "—"}</td>
              <td style={{ padding: "4px 8px" }}>
                {e.invalidated?.done && <Tag color="red">Invalidated{e.invalidated.reason ? `: ${e.invalidated.reason}` : ""}</Tag>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Append-only approvalHistory timeline — mirrors the pattern already used for
// WorkOrder/RunningBill approval chains elsewhere in this app.
function ApprovalHistoryTimeline({ history }: { history?: ApprovalHistoryEntry[] }) {
  if (!history || history.length === 0) return null;
  const stageLabel = (s: string) => (s === "agm" ? "AGM" : "GM");
  return (
    <div style={{ marginTop: 4 }}>
      {history.map((h, i) => {
        const isReject = h.action === "rejected";
        return (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0" }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: isReject ? "#FEF2F2" : "#F0FDF4", border: `1.5px solid ${isReject ? "#DC2626" : "#16A34A"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: isReject ? "#DC2626" : "#16A34A", flexShrink: 0 }}>
              {isReject ? "✕" : "✓"}
            </span>
            <div style={{ fontSize: 12.5 }}>
              <strong>{stageLabel(h.stage)} {isReject ? "rejected" : "approved"}</strong>
              <span style={{ color: "#9CA3AF", marginLeft: 6 }}>
                {actorName(h.by) || ""}{h.at ? ` · ${dayjs(h.at).format("DD MMM YYYY, hh:mm a")}` : ""}
              </span>
              {h.remarks && <div style={{ color: "#6B7280", marginTop: 1 }}>{h.remarks}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Prints a bill request through the exact same template Accounts Payment uses
// for a real RunningBill (printBill), so the two look identical. Once a
// RunningBill exists (br.billId) we fetch and print that directly — its own
// AGM/GM/Accounts/Initiated/Paid ticks are already point-in-time accurate.
// Before that (still pending/pending-gm/rejected pre-GM), there's no
// RunningBill yet, so we build an equivalent pseudo-bill from the request
// itself — only the AGM tick can ever be true at that point, which is what
// br.agmApprovedBy already, correctly, reflects.
async function printBillRequest(br: BillRequestRow) {
  try {
    let contractor: Contractor | null = null;
    if (br.vendorCode) {
      const cRes = await apiClient.get<{ contractors: Contractor[] }>("/contractors", { params: { search: br.vendorCode } });
      contractor = cRes.data.contractors.find(c => c.vendorCode === br.vendorCode) ?? null;
    }

    if (br.billId?._id) {
      const bRes = await apiClient.get<{ bill: PrintableBill }>(`/bills/${br.billId._id}`);
      const bill = bRes.data.bill;
      printBill(bill, contractor, bill.status === "paid" ? "post" : "pre");
      return;
    }

    const agmDone = !!br.agmApprovedBy;
    const pseudoBill: PrintableBill = {
      billNo: br.reqNo,
      workOrderNo: br.workOrderNo,
      projectName: br.projectName,
      projectLocation: br.projectLocation,
      vendorCode: br.vendorCode,
      vendorName: br.vendorName,
      companyName: br.companyName,
      generatedBy: br.requestedBy?.name,
      billDate: br.createdAt,
      lineItems: br.items.map(it => ({ description: it.description, progressRemarks: it.progressRemarks, unit: it.unit, billedQty: it.billedQty, rate: it.rate ?? 0, amount: (it.rate ?? 0) * it.billedQty })),
      amount: br.items.reduce((s, it) => s + (it.rate ?? 0) * it.billedQty, 0),
      retentionAmount: br.retentionAmount ?? 0,
      advanceRecovery: br.advanceRecovery ?? 0,
      gstPercent: br.gstPercentOverride ?? undefined,
      remarks: br.rejectReason ? `${br.remarks ? br.remarks + " — " : ""}Rejected: ${br.rejectReason}` : br.remarks,
      status: br.status,
      agmApprovedBy: agmDone ? { name: actorName(br.agmApprovedBy) || "AGM" } : null,
      agmApprovedAt: br.agmApprovedAt,
      verifiedBy: null,
      approvedBy: null,
      paymentInitiatedBy: null,
    };
    const statusLabel = br.status === "rejected" ? "Rejected" : br.status === "pending-gm" ? "Awaiting GM Approval" : "Awaiting AGM Approval";
    printBill(pseudoBill, contractor, "pre", statusLabel);
  } catch {
    message.error("Failed to prepare print view");
  }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SiteProgress() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const canAgmApprove = user?.role === "agm" || hasPerm(user, "agm-approve");
  const canGmApprove  = user?.role === "gm"  || hasPerm(user, "gm-approve");
  const canRejectAny  = canAgmApprove || canGmApprove || user?.role === "accounts" || hasPerm(user, "reject");

  const [mainTab, setMainTab] = useState<"progress" | "requests">("progress");

  const [loading, setLoading]   = useState(true);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [allWOs,   setAllWOs]   = useState<WORow[]>([]);
  const [billReqs, setBillReqs] = useState<BillRequestRow[]>([]);
  const [driList,  setDriList]  = useState<DriOption[]>([]);
  const [kpis, setKpis] = useState({ progressEntriesToday: 0, drisActiveToday: 0, projectsActiveToday: 0 });

  const [selProjectId, setSelProjectId] = useState<string | undefined>(undefined);
  const [selDriId,     setSelDriId]     = useState<string | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo,   setDateTo]   = useState<Dayjs | null>(null);
  const [woDetails,     setWoDetails]     = useState<Map<string, WODetail>>(new Map());
  const [detailLoading, setDetailLoading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get("/projects/activity", { params: { limit: 100 } }),
      apiClient.get("/projects"),
      apiClient.get("/work-orders"),
      apiClient.get("/bill-requests"),
      apiClient.get("/auth/users?role=site-dri"),
      apiClient.get("/dpr"),
    ])
      .then(([actR, projR, woR, brR, driR, dprR]) => {
        setActivity(actR.data.events ?? []);
        setProjects(projR.data.projects ?? []);
        setAllWOs(woR.data.workOrders ?? []);
        setBillReqs(brR.data.billRequests ?? []);
        setDriList(driR.data.users ?? []);
        const k = dprR.data?.operational?.kpis || {};
        setKpis({
          progressEntriesToday: k.progressEntriesToday || 0,
          drisActiveToday:      k.drisActiveToday || 0,
          projectsActiveToday:  k.projectsActiveToday || 0,
        });
      })
      .catch(() => message.error("Failed to load Site Progress data"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const pendingAgmReqs = useMemo(() => billReqs.filter(r => r.status === "pending" && !r.isArchived), [billReqs]);
  const pendingGmReqs  = useMemo(() => billReqs.filter(r => r.status === "pending-gm" && !r.isArchived), [billReqs]);

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
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [slaInstance, setSlaInstance] = useState<WorkflowInstance | null>(null);
  const [billRemarks, setBillRemarks] = useState("");
  const [generating,  setGenerating]  = useState(false);
  const [approvingVariance, setApprovingVariance] = useState<string | null>(null);

  const viewWO = viewWOId ? woDetails.get(viewWOId) ?? null : null;

  const openWO = async (woId: string, projectIdHint?: string) => {
    if (projectIdHint && projectIdHint !== selProjectId) setSelProjectId(projectIdHint);
    setViewWOId(woId);
    setChecked(new Set());
    setExpandedEntries(new Set());
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
  const toggleEntries = (itemId: string) => {
    setExpandedEntries(prev => {
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

  const pendingBRForWO = (woId: string) => billReqs.find(br => br.workOrderId === woId && ["pending", "pending-gm"].includes(br.status));

  // ── Bill request view / approve / reject ────────────────────────────────────
  const [viewReq, setViewReq] = useState<BillRequestRow | null>(null);
  const [printingReqId, setPrintingReqId] = useState<string | null>(null);

  async function handlePrintReq(r: BillRequestRow) {
    setPrintingReqId(r._id);
    try { await printBillRequest(r); } finally { setPrintingReqId(null); }
  }
  const [approveModal,     setApproveModal]     = useState(false); // AGM (L1)
  const [approveTarget,    setApproveTarget]    = useState<string | null>(null);
  const [approveRetention, setApproveRetention] = useState<number | null>(null);
  const [approveAdvance,   setApproveAdvance]   = useState<number | null>(null);
  // Lets AGM set/override GST% on this bill — mainly for a work order that
  // has no GST% configured at all. Blank means "use the work order's own".
  const [approveGst,       setApproveGst]       = useState<number | null>(null);
  // Who this bill's payment actually goes to — normally the work order's own
  // vendor, but a fellow Vendor Group member can be picked instead.
  const [approvePayeeCode, setApprovePayeeCode] = useState<string>("");
  const [approveGroupSiblings, setApproveGroupSiblings] = useState<{ vendorCode: string; companyName: string }[]>([]);
  // Outstanding advance slips for whoever is CURRENTLY selected as payee — so
  // AGM's "Advance Recovery Amount" actually links back to a real slip
  // instead of being a bare number no AdvanceSlip ever finds out about.
  const [approvePendingAdvances, setApprovePendingAdvances] = useState<{ _id: string; slipNo: string; balance: number }[]>([]);
  const [approveProjectId, setApproveProjectId] = useState<string>("");
  const [gmModal,     setGmModal]     = useState(false); // GM (L2)
  const [gmTarget,    setGmTarget]    = useState<string | null>(null);
  const [gmRemarks,   setGmRemarks]   = useState("");
  // GM has final say on who gets paid — can confirm AGM's Stage 1 choice (or
  // the work order's own vendor, if neither ever set one) or override it.
  const [gmPayeeCode, setGmPayeeCode] = useState<string>("");
  const [gmGroupSiblings, setGmGroupSiblings] = useState<{ vendorCode: string; companyName: string }[]>([]);
  const [rejectModal,  setRejectModal]  = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchPendingAdvances = async (projectId: string, vendorCode: string) => {
    if (!projectId || !vendorCode) { setApprovePendingAdvances([]); return; }
    try {
      const res = await apiClient.get<{ advanceSlips: { _id: string; slipNo: string; balance: number }[] }>(
        "/advance-slips/pending", { params: { projectId, vendorCode } }
      );
      setApprovePendingAdvances(res.data.advanceSlips || []);
    } catch { setApprovePendingAdvances([]); }
  };

  const selectApprovePayee = (vendorCode: string) => {
    setApprovePayeeCode(vendorCode);
    fetchPendingAdvances(approveProjectId, vendorCode);
  };

  const openApprove = async (id: string) => {
    setApproveTarget(id); setApproveRetention(null); setApproveAdvance(null); setApproveGst(null); setApproveModal(true);
    setApprovePayeeCode(""); setApproveGroupSiblings([]); setApprovePendingAdvances([]);
    const br = billReqs.find(r => r._id === id);
    if (!br?.vendorCode) return;
    setApprovePayeeCode(br.vendorCode);
    const projectId = br.projectId ?? "";
    setApproveProjectId(projectId);
    fetchPendingAdvances(projectId, br.vendorCode);
    try {
      const cRes = await apiClient.get<{ contractors: Contractor[] }>("/contractors", { params: { search: br.vendorCode } });
      const contractor = cRes.data.contractors.find(c => c.vendorCode === br.vendorCode);
      if (!contractor?.groupId) return;
      const gRes = await apiClient.get<{ members: { vendorCode: string; companyName: string }[] }>(`/vendor-groups/${contractor.groupId}`);
      setApproveGroupSiblings(gRes.data.members || []);
    } catch { /* group lookup is best-effort — approval still works without it */ }
  };
  const handleAgmApprove = async () => {
    if (!approveTarget) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (approveRetention != null) body.retentionAmount = approveRetention;
      if (approveGst       != null) body.gstPercent       = approveGst;
      if (approvePayeeCode) body.payeeVendorCode = approvePayeeCode;
      if (approveAdvance != null) {
        body.advanceRecovery = approveAdvance;
        // Distribute the entered recovery across outstanding slips
        // oldest-first, capped at each slip's own balance — same allocation
        // the manual New Bill drawer already uses.
        const recoveries: { slipId: string; amount: number }[] = [];
        let remaining = approveAdvance;
        for (const slip of approvePendingAdvances) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, slip.balance);
          if (take > 0) recoveries.push({ slipId: slip._id, amount: take });
          remaining -= take;
        }
        if (recoveries.length) body.advanceRecoveries = recoveries;
      }
      const res = await apiClient.put(`/bill-requests/${approveTarget}/agm-approve`, body);
      message.success(res.data.message || "AGM approved — forwarded to GM");
      setApproveModal(false); setApproveTarget(null); setViewReq(null);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Failed to approve");
    } finally { setSaving(false); }
  };
  const openGmApprove = async (id: string) => {
    setGmTarget(id); setGmRemarks(""); setGmModal(true);
    setGmPayeeCode(""); setGmGroupSiblings([]);
    const br = billReqs.find(r => r._id === id);
    if (!br?.vendorCode) return;
    setGmPayeeCode(br.payeeVendorCode || br.vendorCode);
    try {
      const cRes = await apiClient.get<{ contractors: Contractor[] }>("/contractors", { params: { search: br.vendorCode } });
      const contractor = cRes.data.contractors.find(c => c.vendorCode === br.vendorCode);
      if (!contractor?.groupId) return;
      const gRes = await apiClient.get<{ members: { vendorCode: string; companyName: string }[] }>(`/vendor-groups/${contractor.groupId}`);
      setGmGroupSiblings(gRes.data.members || []);
    } catch { /* group lookup is best-effort — approval still works without it */ }
  };
  const handleGmApprove = async () => {
    if (!gmTarget) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { remarks: gmRemarks };
      if (gmPayeeCode) body.payeeVendorCode = gmPayeeCode;
      const res = await apiClient.put(`/bill-requests/${gmTarget}/gm-approve`, body);
      message.success(res.data.message || "Approved & bill generated");
      setGmModal(false); setGmTarget(null); setViewReq(null);
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

  async function archiveOne(r: BillRequestRow) {
    try {
      await apiClient.patch(`/bill-requests/${r._id}/${r.isArchived ? "unarchive" : "archive"}`);
      message.success(r.isArchived ? `${r.reqNo} unarchived` : `${r.reqNo} archived`);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Action failed");
    }
  }

  const viewTotal = viewReq ? viewReq.items.reduce((s, it) => s + (it.rate ?? 0) * it.billedQty, 0) : 0;

  // ── Activity feed row click → jump straight to that work order ─────────────
  const openFromActivity = (ev: ActivityEvent) => {
    if (!ev.workOrderId) return;
    const projId = typeof ev.projectId === "object" ? ev.projectId?._id : ev.projectId;
    openWO(ev.workOrderId, projId);
  };

  const filteredActivity = useMemo(() => activity.filter(ev => {
    const evProjId = typeof ev.projectId === "object" ? ev.projectId?._id : ev.projectId;
    if (selProjectId && evProjId !== selProjectId) return false;
    if (selDriId) {
      const dri = driList.find(d => d._id === selDriId);
      if (!dri || ev.performedByName !== dri.name) return false;
    }
    if (!inDateRange(ev.createdAt, dateFrom, dateTo)) return false;
    return true;
  }), [activity, selProjectId, selDriId, driList, dateFrom, dateTo]);

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

  // ── Bill Requests tab (full list) ───────────────────────────────────────────
  const [reqTab, setReqTab] = useState("pending");
  const [reqSearch, setReqSearch] = useState("");
  const [reqProjectFilter, setReqProjectFilter] = useState<string | undefined>(undefined);
  const [showArchived, setShowArchived] = useState(false);
  const projectOptions = useMemo(
    () => selectableProjects(projects).map(p => ({ label: `${p.name} (${p.code ?? ""})`, value: p._id })),
    [projects]
  );

  const filteredReqs = useMemo(() => {
    let list = billReqs.filter(r => showArchived ? r.isArchived : !r.isArchived);
    list = reqTab === "all" ? list : list.filter(r => r.status === reqTab);
    if (reqProjectFilter) list = list.filter(r => r.projectId === reqProjectFilter);
    const q = reqSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        r.reqNo.toLowerCase().includes(q) ||
        r.workOrderNo.toLowerCase().includes(q) ||
        r.vendorName.toLowerCase().includes(q) ||
        (r.vendorCode || "").toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => parseInt(b.reqNo.replace(/\D/g, ""), 10) - parseInt(a.reqNo.replace(/\D/g, ""), 10));
  }, [billReqs, reqTab, reqProjectFilter, reqSearch, showArchived]);

  const reqColumns: ColumnsType<BillRequestRow> = [
    {
      title: "Stage / Request", width: 150,
      render: (_, r) => (
        <div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {r.stageNo && (
              <span style={{ background: "#FFF4E8", border: "1px solid #FF7A00", color: "#FF7A00", fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 6 }}>S{r.stageNo}</span>
            )}
            <button type="button" onClick={() => setViewReq(r)} style={{ background: "none", border: "none", cursor: "pointer", color: "#FF7A00", fontWeight: 700, fontFamily: "monospace", fontSize: 13, padding: 0 }}>
              {r.reqNo}
            </button>
          </div>
          {r.milestoneAchieved && <span style={{ fontSize: 10, color: "#FF7A00" }}>🏆 Milestone</span>}
        </div>
      ),
    },
    { title: "Work Order", dataIndex: "workOrderNo", render: (v, r) => (
      <code style={{ cursor: "pointer", color: "#3b82f6" }} onClick={() => r.workOrderId && navigate(`/work-items/${r.workOrderId}`)}>{v}</code>
    )},
    { title: "Project", dataIndex: "projectName" },
    { title: "Contractor", dataIndex: "vendorName" },
    { title: "Items", dataIndex: "items", render: (items: BillItem[]) => <span>{items.length} item{items.length !== 1 ? "s" : ""}</span> },
    { title: "Date", dataIndex: "createdAt", render: d => dayjs(d).format("DD MMM YYYY") },
    { title: "Status", dataIndex: "status", render: (s: string) => {
      const cfg = STATUS_CFG[s] ?? { color: "default", label: s };
      return <Tag color={cfg.color}>{cfg.label}</Tag>;
    }},
    {
      title: "Actions",
      render: (_, r) => (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setViewReq(r)}>View</Button>
          <Button size="small" icon={<PrinterOutlined />} loading={printingReqId === r._id} onClick={() => handlePrintReq(r)}>Print</Button>
          {r.status === "pending" && canAgmApprove && (
            <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => openApprove(r._id)}>AGM Approve</Button>
          )}
          {r.status === "pending-gm" && canGmApprove && (
            <Button size="small" type="primary" style={{ background: "#2563eb", borderColor: "#2563eb" }} icon={<CheckCircleOutlined />} onClick={() => openGmApprove(r._id)}>GM Approve</Button>
          )}
          {["pending", "pending-gm"].includes(r.status) && canRejectAny && (
            <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => { setRejectTarget(r._id); setRejectModal(true); }}>Reject</Button>
          )}
          <Popconfirm
            title={r.isArchived ? `Unarchive ${r.reqNo}?` : `Archive ${r.reqNo}?`}
            onConfirm={() => archiveOne(r)}
          >
            <Button size="small" icon={<InboxOutlined />} style={{ color: "#6B7280" }}>{r.isArchived ? "Unarchive" : "Archive"}</Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><Spin size="large" /></div>;
  }

  return (
    <PageShell
      title="Site Progress"
      description="See what DRI has been logging, raise bill requests, and carry them through AGM (L1) and GM (L2) approval — all in one place."
    >
      {/* ── KPI flashcards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(178px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard
          label="Pending L1 (AGM)" value={pendingAgmReqs.length} icon={<ClockCircleOutlined />} accent="#d97706"
          active={mainTab === "requests" && reqTab === "pending"}
          onClick={() => { setMainTab("requests"); setReqTab(mainTab === "requests" && reqTab === "pending" ? "all" : "pending"); }}
        />
        <StatCard
          label="Pending L2 (GM)" value={pendingGmReqs.length} icon={<ClockCircleOutlined />} accent="#2563eb"
          active={mainTab === "requests" && reqTab === "pending-gm"}
          onClick={() => { setMainTab("requests"); setReqTab(mainTab === "requests" && reqTab === "pending-gm" ? "all" : "pending-gm"); }}
        />
        <StatCard label="Today's Progress Entries" value={kpis.progressEntriesToday} icon={<FileTextOutlined />} accent="#16a34a" />
        <StatCard label="Active DRIs Today" value={kpis.drisActiveToday} icon={<TeamOutlined />} accent="#7c3aed" />
        <StatCard label="Active Projects Today" value={kpis.projectsActiveToday} icon={<ClusterOutlined />} accent="#0d9488" />
      </div>

      <Tabs
        activeKey={mainTab}
        onChange={k => setMainTab(k as "progress" | "requests")}
        items={[
          { key: "progress", label: "Progress" },
          { key: "requests", label: <span>Bill Requests {(pendingAgmReqs.length + pendingGmReqs.length) > 0 && <Badge count={pendingAgmReqs.length + pendingGmReqs.length} style={{ background: "#f59e0b" }} />}</span> },
        ]}
        style={{ marginBottom: 12 }}
      />

      {mainTab === "progress" && (
        <>
          {/* ── Filters ── */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
            <Select
              allowClear showSearch placeholder="Filter by project…"
              value={selProjectId} onChange={setSelProjectId}
              options={projects.map(p => ({ label: p.name, value: p._id }))}
              filterOption={(input, opt) => (opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              style={{ minWidth: 240 }}
            />
            <Select
              allowClear showSearch placeholder="Filter by DRI…"
              value={selDriId} onChange={setSelDriId}
              options={driList.map(d => ({ label: `${d.name} (${d.email})`, value: d._id }))}
              filterOption={(input, opt) => (opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              style={{ minWidth: 220 }}
            />
            <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
          </div>

          {/* ── Recent DRI Progress ── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Recent DRI Progress</div>
            {filteredActivity.length === 0 ? (
              <Empty description="No progress logged for these filters" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Table dataSource={filteredActivity} columns={activityColumns} rowKey="_id" size="small" pagination={{ pageSize: 8 }} />
            )}
          </div>

          {/* ── Project → Work Order drill-down ── */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Work Orders</div>
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
                          {pendingBR && <Tag color={pendingBR.status === "pending-gm" ? "blue" : "orange"}>Bill {pendingBR.reqNo} — {STATUS_CFG[pendingBR.status]?.label}</Tag>}
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
        </>
      )}

      {mainTab === "requests" && (
        <>
          <Tabs
            activeKey={reqTab}
            onChange={setReqTab}
            items={[
              { key: "pending",    label: <span>Pending L1 {pendingAgmReqs.length > 0 && <Badge count={pendingAgmReqs.length} style={{ background: "#d97706" }} />}</span> },
              { key: "pending-gm", label: <span>Pending L2 {pendingGmReqs.length > 0 && <Badge count={pendingGmReqs.length} style={{ background: "#2563eb" }} />}</span> },
              { key: "approved",   label: "Approved" },
              { key: "rejected",   label: "Rejected" },
              { key: "all",        label: "All" },
            ]}
            style={{ marginBottom: 12 }}
          />
          <div style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <SearchFilter
              placeholder="Search by request no, work order, contractor, or project…"
              value={reqSearch} onChange={setReqSearch}
            />
            <Select
              allowClear showSearch placeholder="Filter by project…"
              value={reqProjectFilter} onChange={setReqProjectFilter}
              options={projectOptions}
              filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              style={{ minWidth: 240 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6B7280" }}>
              <Switch size="small" checked={showArchived} onChange={setShowArchived} />
              Show Archived
            </label>
          </div>
          {filteredReqs.length === 0 ? (
            <Empty description={`No ${reqTab === "all" ? "" : STATUS_CFG[reqTab]?.label.toLowerCase() || reqTab} bill requests`} />
          ) : (
            <Table dataSource={filteredReqs} columns={reqColumns} rowKey="_id" size="middle" pagination={{ pageSize: 20 }} />
          )}
        </>
      )}

      {/* ── Work order detail + bill-generation modal ── */}
      <Modal
        open={!!viewWOId}
        onCancel={() => { setViewWOId(null); setChecked(new Set()); }}
        title={`Work Order — ${viewWO?.workOrderNo ?? ""}`}
        width={860}
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
                    const hasSubItems = (si.subItems?.length ?? 0) > 0;
                    // A parent's own completedQty/lastBilledQty are a display
                    // rollup, not a billable quantity (see
                    // recomputeParentFromSubItems) — the real unbilled total
                    // is the sum of what's actually unbilled on each particular.
                    const unbilled = hasSubItems
                      ? si.subItems!.reduce((s, sub) => s + Math.max(0, (sub.completedQty || 0) - (sub.lastBilledQty || 0)), 0)
                      : Math.max(0, si.completedQty - (si.lastBilledQty || 0));
                    const level = varianceLevel(si.plannedQty, si.completedQty);
                    const blocked = itemHasUnapprovedVariance(si);
                    const canBill = unbilled > 0 && !blocked;
                    const entryCount = si.progressEntries?.length ?? 0;
                    const isExpanded = expandedEntries.has(si._id);
                    return (
                      <Fragment key={si._id}>
                        <tr style={{ borderBottom: hasSubItems || isExpanded ? "none" : "1px solid #E5E7EB", background: idx % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                          <td style={{ padding: "6px 10px" }}>
                            {unbilled > 0 && (
                              <Tooltip title={blocked ? `Approve the variance${hasSubItems ? " on every particular" : ""} below first` : undefined}>
                                <Checkbox checked={checked.has(si._id)} disabled={!canBill} onChange={() => toggleCheck(si._id)} />
                              </Tooltip>
                            )}
                          </td>
                          <td style={{ padding: "6px 10px", fontWeight: 600 }}>
                            {!hasSubItems && entryCount > 0 && (
                              <button type="button" onClick={() => toggleEntries(si._id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginRight: 6, color: "#6B7280" }}>
                                {isExpanded ? <DownOutlined /> : <RightOutlined />}
                              </button>
                            )}
                            {si.description}
                            {!hasSubItems && entryCount > 0 && (
                              <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 400, marginLeft: 6 }}>({entryCount} entr{entryCount !== 1 ? "ies" : "y"})</span>
                            )}
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
                        {!hasSubItems && isExpanded && (
                          <tr style={{ borderBottom: "1px solid #E5E7EB", background: "#FCFCFD" }}>
                            <td />
                            <td colSpan={7} style={{ padding: "4px 10px 10px" }}>
                              <ProgressEntryLog entries={si.progressEntries} />
                            </td>
                          </tr>
                        )}
                        {hasSubItems && si.subItems!.map(sub => {
                          const subUnbilled = Math.max(0, (sub.completedQty || 0) - (sub.lastBilledQty || 0));
                          const subLevel = varianceLevel(sub.plannedQty, sub.completedQty);
                          const subEntryCount = sub.progressEntries?.length ?? 0;
                          const subExpanded = expandedEntries.has(sub._id);
                          return (
                            <Fragment key={sub._id}>
                              <tr style={{ borderBottom: subExpanded ? "none" : "1px solid #F3F4F6", background: "#FCFCFD" }}>
                                <td />
                                <td style={{ padding: "5px 10px 5px 26px", fontSize: 12, color: "#6B7280" }}>
                                  {subEntryCount > 0 && (
                                    <button type="button" onClick={() => toggleEntries(sub._id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginRight: 6, color: "#9CA3AF" }}>
                                      {subExpanded ? <DownOutlined /> : <RightOutlined />}
                                    </button>
                                  )}
                                  {sub.description}
                                  {subEntryCount > 0 && <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 6 }}>({subEntryCount})</span>}
                                </td>
                                <td style={{ padding: "5px 10px", fontSize: 12 }}>{sub.unit}</td>
                                <td style={{ padding: "5px 10px", fontFamily: "monospace", fontSize: 12 }}>{fmtN(sub.plannedQty)}</td>
                                <td style={{ padding: "5px 10px", fontFamily: "monospace", fontSize: 12 }}>{fmtN(sub.completedQty)}</td>
                                <td style={{ padding: "5px 10px", fontFamily: "monospace", fontSize: 12, color: subUnbilled > 0 ? "#FF7A00" : "#9CA3AF", fontWeight: subUnbilled > 0 ? 700 : 400 }}>{fmtN(subUnbilled)}</td>
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
                              {subExpanded && (
                                <tr style={{ borderBottom: "1px solid #F3F4F6", background: "#FCFCFD" }}>
                                  <td /><td />
                                  <td colSpan={6} style={{ padding: "0 10px 10px 26px" }}>
                                    <ProgressEntryLog entries={sub.progressEntries} />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
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

      {/* ── Bill request view modal ── */}
      <Modal
        open={!!viewReq}
        onCancel={() => setViewReq(null)}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Bill Request — {viewReq?.reqNo}</span>
            {viewReq && <Tag color={STATUS_CFG[viewReq.status]?.color}>{STATUS_CFG[viewReq.status]?.label}</Tag>}
            {viewReq?.milestoneAchieved && (
              <span style={{ background: "#FF7A00", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>🏆 Milestone</span>
            )}
          </div>
        }
        width={760}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button onClick={() => setViewReq(null)}>Close</Button>
            {viewReq && (
              <Button
                icon={<PrinterOutlined />}
                loading={printingReqId === viewReq._id}
                onClick={() => handlePrintReq(viewReq)}
              >
                Print
              </Button>
            )}
            {viewReq?.status === "pending" && (
              <>
                {canRejectAny && <Button danger onClick={() => { setRejectTarget(viewReq._id); setRejectModal(true); setViewReq(null); }}>Reject</Button>}
                {canAgmApprove && <Button type="primary" onClick={() => { openApprove(viewReq._id); setViewReq(null); }}>AGM Approve →</Button>}
              </>
            )}
            {viewReq?.status === "pending-gm" && (
              <>
                {canRejectAny && <Button danger onClick={() => { setRejectTarget(viewReq._id); setRejectModal(true); setViewReq(null); }}>Reject</Button>}
                {canGmApprove && <Button type="primary" style={{ background: "#2563eb", borderColor: "#2563eb" }} onClick={() => { openGmApprove(viewReq._id); setViewReq(null); }}>GM Approve →</Button>}
              </>
            )}
          </div>
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
                ...(viewReq.billId ? [["Bill No.", viewReq.billId.billNo + " — " + fmt(viewReq.billId.amount)]] : []),
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 10, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                  <div style={{ fontWeight: 600, color: "#111827", fontSize: 13 }}>{val}</div>
                </div>
              ))}
            </div>

            {viewReq.status === "pending-gm" && (
              <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1D4ED8", marginBottom: 8, textTransform: "uppercase" }}>AGM already set (read-only)</div>
                <Row gutter={12}>
                  <Col span={8}>
                    <div style={{ fontSize: 10, color: "#6B7280" }}>Hold / Retention</div>
                    <div style={{ fontWeight: 700 }}>{fmt(viewReq.retentionAmount ?? 0)}</div>
                  </Col>
                  <Col span={8}>
                    <div style={{ fontSize: 10, color: "#6B7280" }}>Advance Recovery</div>
                    <div style={{ fontWeight: 700 }}>{fmt(viewReq.advanceRecovery ?? 0)}</div>
                  </Col>
                  <Col span={8}>
                    <div style={{ fontSize: 10, color: "#6B7280" }}>GST %</div>
                    <div style={{ fontWeight: 700 }}>
                      {viewReq.gstPercentOverride != null ? `${viewReq.gstPercentOverride}%` : <span style={{ color: "#9CA3AF", fontWeight: 400 }}>Work order default</span>}
                    </div>
                  </Col>
                </Row>
                {viewReq.payeeVendorCode && (
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <span style={{ color: "#6B7280" }}>Pay To: </span>
                    <span style={{ fontWeight: 700 }}>{viewReq.payeeVendorName} ({viewReq.payeeVendorCode})</span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6 }}>
                  {actorName(viewReq.agmApprovedBy) || "AGM"}{viewReq.agmApprovedAt ? ` · ${dayjs(viewReq.agmApprovedAt).format("DD MMM YYYY")}` : ""}
                </div>
              </div>
            )}

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
                      <td style={{ padding: "6px 10px" }}>
                        {it.description}
                        {it.progressRemarks && <div style={{ fontSize: 11, color: "#2563eb", marginTop: 2 }}>👷 {it.progressRemarks}</div>}
                      </td>
                      <td style={{ padding: "6px 10px" }}>{it.unit}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "monospace" }}>{it.billedQty.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right" }}>{it.rate ? fmtRate(it.rate) : <span style={{ color: "#9CA3AF" }}>pending</span>}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600 }}>{it.rate ? fmt(amt) : <span style={{ color: "#9CA3AF" }}>—</span>}</td>
                    </tr>
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

            {viewTotal > 0 && (() => {
              const retAmt = viewReq.retentionAmount ?? 0;
              const advRec = viewReq.advanceRecovery ?? 0;
              const gstPct = viewReq.gstPercentOverride ?? 0;
              const { gstAmount, netAfterHold } = billFinancials({ gross: viewTotal, gstPercent: gstPct, retentionAmount: retAmt, advanceRecovery: advRec });
              return (
                <div style={{ background: "#FFF8F3", border: "1px solid #FED7AA", borderRadius: 8, padding: 12, fontFamily: "monospace", fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#6B7280" }}>
                    <span>Gross Total</span><span>{fmt(viewTotal)}</span>
                  </div>
                  {retAmt > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#dc2626" }}>
                      <span>Hold / Retention</span><span>− {fmt(retAmt)}</span>
                    </div>
                  )}
                  {advRec > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#d97706" }}>
                      <span>Less: Advance Recovery</span><span>− {fmt(advRec)}</span>
                    </div>
                  )}
                  {gstAmount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#16a34a" }}>
                      <span>GST @ {gstPct}%</span><span>+ {fmt(gstAmount)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#FF7A00", borderTop: "1px solid #FED7AA", paddingTop: 4, marginTop: 4 }}>
                    <span>Final Amount</span><span>{fmt(netAfterHold)}</span>
                  </div>
                </div>
              );
            })()}

            {viewReq.remarks && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: 10, fontSize: 13 }}>
                <strong>Remarks:</strong> {viewReq.remarks}
              </div>
            )}

            {viewReq.rejectReason && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: 10, fontSize: 13 }}>
                <strong>Reject Reason:</strong> {viewReq.rejectReason}
              </div>
            )}

            {(viewReq.approvalHistory?.length ?? 0) > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 11, color: "#6B7280", textTransform: "uppercase", marginBottom: 6 }}>History</div>
                <ApprovalHistoryTimeline history={viewReq.approvalHistory} />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── AGM approve modal (L1) — hold/retention + advance, both optional ── */}
      <Modal
        open={approveModal}
        onCancel={() => { setApproveModal(false); setApproveTarget(null); }}
        onOk={handleAgmApprove}
        title="AGM Approve — Stage 1"
        okText="Approve & Forward to GM"
        okButtonProps={{ loading: saving }}
        destroyOnClose
      >
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 14 }}>
          Sets the hold/advance figures GM will see at Stage 2. Leave a field blank to use the work order's automatic retention calculation.
        </div>
        {approveGroupSiblings.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              Pay To (Vendor Group)
            </div>
            <Select
              style={{ width: "100%" }}
              value={approvePayeeCode}
              onChange={selectApprovePayee}
              options={approveGroupSiblings.map(c => ({
                value: c.vendorCode,
                label: `${c.companyName} (${c.vendorCode})`,
              }))}
            />
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Hold / Retention Amount (₹, optional)</div>
          <InputNumber style={{ width: "100%" }} min={0} placeholder="Auto-calculated from work order retention %" value={approveRetention} onChange={setApproveRetention} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Advance Recovery Amount (₹, optional)</div>
          <InputNumber
            style={{ width: "100%" }} min={0}
            max={approvePendingAdvances.length ? approvePendingAdvances.reduce((s, sl) => s + sl.balance, 0) : undefined}
            placeholder="0" value={approveAdvance} onChange={setApproveAdvance}
          />
          {approvePendingAdvances.length > 0 ? (
            <div style={{ marginTop: 6, fontSize: 11, color: "#6B7280" }}>
              Outstanding for this payee: {approvePendingAdvances.map(sl => `${sl.slipNo} (${fmt(sl.balance)})`).join(", ")} — settled oldest-first.
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 11, color: "#9CA3AF" }}>No outstanding advance slips for this payee on this project.</div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>GST % (optional)</div>
          <InputNumber style={{ width: "100%" }} min={0} max={100} placeholder="Leave blank to use the work order's GST%" value={approveGst} onChange={setApproveGst} />
        </div>
      </Modal>

      {/* ── GM approve modal (L2) — final, creates the RunningBill ── */}
      <Modal
        open={gmModal}
        onCancel={() => { setGmModal(false); setGmTarget(null); }}
        onOk={handleGmApprove}
        title="GM Approve — Stage 2 (Final)"
        okText="Approve & Generate Bill"
        okButtonProps={{ loading: saving, style: { background: "#2563eb", borderColor: "#2563eb" } }}
        destroyOnClose
      >
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 14 }}>
          This creates the running bill using the retention/advance/GST AGM already set. It then moves to Accounts Payment.
        </div>
        {gmGroupSiblings.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              Pay To (Vendor Group) — final confirmation
            </div>
            <Select
              style={{ width: "100%" }}
              value={gmPayeeCode}
              onChange={setGmPayeeCode}
              options={gmGroupSiblings.map(c => ({
                value: c.vendorCode,
                label: `${c.companyName} (${c.vendorCode})`,
              }))}
            />
          </div>
        )}
        <Input.TextArea rows={2} placeholder="Remarks (optional)" value={gmRemarks} onChange={e => setGmRemarks(e.target.value)} />
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
