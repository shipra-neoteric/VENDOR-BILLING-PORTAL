import { Fragment, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Clock, FileText, Users, Building2, AlertTriangle, Eye, Printer, CheckCircle2, XCircle, Check, X,
  Archive as ArchiveIcon, Pin, Trophy, ChevronDown, ChevronRight, TrendingUp,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import apiClient from "../../services/apiClient";
import { SearchFilter, DropdownSelectFilter } from "../../ui/Filters";
import { useAuth } from "../../context/AuthContext";
import type { AuthUser } from "../../context/AuthContext";
import { selectableProjects } from "../../utils/projectOptions";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import WorkflowInstanceStepper from "../../components/WorkflowInstanceStepper";
import type { WorkflowInstance } from "../../types/Workflow";
import { printBill, resolvePrintParty } from "../../shared/utils/printBill";
import type { PrintableBill } from "../../shared/utils/printBill";
import type { Contractor } from "../../types/VendorBilling";
import { billFinancials } from "../../shared/utils/billMath";
import SField from "../../ui/SField";
import UISwitch from "../../ui/Switch";
import UIBadge from "../../ui/Badge";
import Btn from "../../ui/Btn";
import Card from "../../ui/Card";
import Segmented from "../../ui/Segmented";
import EmptyState from "../../ui/EmptyState";
import ConfirmModal from "../../ui/ConfirmModal";
import Spinner from "../../ui/Spinner";
import PageHeader from "../../ui/PageHeader";
import Modal from "../../ui/Modal";
import Field from "../../ui/Field";
import Checkbox from "../../ui/Checkbox";
import { Descriptions, DescItem } from "../../ui/Descriptions";
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import NxBadge from "../../ui/nexora/Badge";
import NxBtn from "../../ui/nexora/Btn";
import NxStatCard from "../../ui/nexora/StatCard";
import DropdownMenu from "../../ui/DropdownMenu";
import type { DropdownMenuItem } from "../../ui/DropdownMenu";

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

// A bill created directly via Billing -> New Bill, not from DRI progress —
// carries no BillRequest of its own, so it needs this separate pre-Accounts
// AGM/GM sign-off tracked right on the bill itself (see billController's
// manualAgmApprove/manualGmApprove/manualReject).
interface ManualBillRow {
  _id: string; billNo: string; amount: number;
  projectName?: string; vendorName?: string; billDate: string; createdAt: string;
  manualApprovalStatus: "pending" | "pending-gm" | "approved" | "rejected";
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
  return (
    <NxBadge color={level === "yellow" ? "amber" : "red"}>
      <span className="inline-flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> Over plan {level === "yellow" ? "≤10%" : ">10%"}</span>
    </NxBadge>
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
    return <div className="px-2.5 py-2 text-xs text-gray-400">No individual entries recorded.</div>;
  }
  const sorted = [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="bg-gray-100 dark:bg-gray-800/40">
          {["Date", "Qty Added", "Location", "Remarks", ""].map(h => (
            <th key={h} className="px-2 py-1 text-left text-[10px] text-gray-500 dark:text-gray-400 uppercase">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(e => {
          const loc = [e.tower && `Tower ${e.tower}`, e.floor && `Floor ${e.floor}`, e.flatNo && `Flat ${e.flatNo}`, e.plotNo && `Plot ${e.plotNo}`, e.locationNote].filter(Boolean).join(" · ");
          return (
            <tr
              key={e._id}
              className="border-b border-gray-200 dark:border-gray-700/40"
              style={{ textDecoration: e.invalidated?.done ? "line-through" : undefined, opacity: e.invalidated?.done ? 0.55 : 1 }}
            >
              <td className="px-2 py-1">{dayjs(e.date).format("DD MMM YYYY")}</td>
              <td className="px-2 py-1 font-mono text-emerald-600 font-semibold">+{fmtN(e.qtyAdded)}</td>
              <td className="px-2 py-1 text-gray-500 dark:text-gray-400">{loc || "—"}</td>
              <td className="px-2 py-1 text-gray-500 dark:text-gray-400">{e.remarks || "—"}</td>
              <td className="px-2 py-1">
                {e.invalidated?.done && <UIBadge color="red" small>Invalidated{e.invalidated.reason ? `: ${e.invalidated.reason}` : ""}</UIBadge>}
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
    <div className="mt-1">
      {history.map((h, i) => {
        const isReject = h.action === "rejected";
        return (
          <div key={i} className="flex gap-2 items-start py-1">
            <span className={`w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center text-[10px] font-bold shrink-0 ${isReject ? "bg-red-50 dark:bg-red-500/10 border-red-600 text-red-600" : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-600 text-emerald-600"}`}>
              {isReject ? "✕" : "✓"}
            </span>
            <div className="text-[12.5px]">
              <strong>{stageLabel(h.stage)} {isReject ? "rejected" : "approved"}</strong>
              <span className="text-gray-400 ml-1.5">
                {actorName(h.by) || ""}{h.at ? ` · ${dayjs(h.at).format("DD MMM YYYY, hh:mm a")}` : ""}
              </span>
              {h.remarks && <div className="text-gray-500 dark:text-gray-400 mt-0.5">{h.remarks}</div>}
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
    const contractor = await resolvePrintParty(br.vendorCode);

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
    toast.error("Failed to prepare print view");
  }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SiteProgress() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const openReqId = searchParams.get("open");

  const canAgmApprove = user?.role === "agm" || hasPerm(user, "agm-approve");
  const canGmApprove  = user?.role === "gm"  || hasPerm(user, "gm-approve");
  const canRejectAny  = canAgmApprove || canGmApprove || user?.role === "accounts" || hasPerm(user, "reject");

  const [mainTab, setMainTab] = useState<"progress" | "requests">("progress");

  const [loading, setLoading]   = useState(true);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [allWOs,   setAllWOs]   = useState<WORow[]>([]);
  const [billReqs, setBillReqs] = useState<BillRequestRow[]>([]);
  const [manualBills, setManualBills] = useState<ManualBillRow[]>([]);
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
      apiClient.get("/bills", { params: { manualApprovalStatus: "pending" } }),
      apiClient.get("/bills", { params: { manualApprovalStatus: "pending-gm" } }),
    ])
      .then(([actR, projR, woR, brR, driR, dprR, manualPendingR, manualGmR]) => {
        setActivity(actR.data.events ?? []);
        setProjects(projR.data.projects ?? []);
        setAllWOs(woR.data.workOrders ?? []);
        setBillReqs(brR.data.billRequests ?? []);
        setDriList(driR.data.users ?? []);
        setManualBills([...(manualPendingR.data.bills ?? []), ...(manualGmR.data.bills ?? [])]);
        const k = dprR.data?.operational?.kpis || {};
        setKpis({
          progressEntriesToday: k.progressEntriesToday || 0,
          drisActiveToday:      k.drisActiveToday || 0,
          projectsActiveToday:  k.projectsActiveToday || 0,
        });
      })
      .catch(() => toast.error("Failed to load Site Progress data"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const pendingAgmReqs = useMemo(() => billReqs.filter(r => r.status === "pending" && !r.isArchived), [billReqs]);
  const pendingGmReqs  = useMemo(() => billReqs.filter(r => r.status === "pending-gm" && !r.isArchived), [billReqs]);
  const pendingManualAgm = useMemo(() => manualBills.filter(b => b.manualApprovalStatus === "pending"), [manualBills]);
  const pendingManualGm  = useMemo(() => manualBills.filter(b => b.manualApprovalStatus === "pending-gm"), [manualBills]);

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
      toast.success("Variance approved");
      await reloadWODetail(viewWO._id);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to approve variance");
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
      toast.success(res.data?.message || "Bill request submitted");
      setViewWOId(null);
      setChecked(new Set());
      setBillRemarks("");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to generate bill request");
    } finally {
      setGenerating(false);
    }
  };

  const pendingBRForWO = (woId: string) => billReqs.find(br => br.workOrderId === woId && ["pending", "pending-gm"].includes(br.status));

  // ── Bill request view / approve / reject ────────────────────────────────────
  const [viewReq, setViewReq] = useState<BillRequestRow | null>(null);
  const [printingReqId, setPrintingReqId] = useState<string | null>(null);

  // Deep link from other pages (e.g. the SLA Report's Ongoing Workflows
  // table) — ?open=<billRequestId> switches to the Requests tab and opens
  // that request's view modal once the list has loaded.
  useEffect(() => {
    if (!openReqId || billReqs.length === 0) return;
    const match = billReqs.find(r => r._id === openReqId);
    if (match) { setMainTab("requests"); setViewReq(match); }
  }, [openReqId, billReqs]);

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
      toast.success(res.data.message || "AGM approved — forwarded to GM");
      setApproveModal(false); setApproveTarget(null); setViewReq(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to approve");
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
      toast.success(res.data.message || "Approved & bill generated");
      setGmModal(false); setGmTarget(null); setViewReq(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to approve");
    } finally { setSaving(false); }
  };
  const handleReject = async () => {
    if (!rejectTarget) return;
    setSaving(true);
    try {
      await apiClient.put(`/bill-requests/${rejectTarget}/reject`, { rejectReason });
      toast.success("Request rejected");
      setRejectModal(false); setRejectReason(""); setRejectTarget(null); setViewReq(null);
      load();
    } catch { toast.error("Failed to reject"); }
    finally { setSaving(false); }
  };

  // ── Manual bills (Billing -> New Bill) awaiting their own AGM/GM sign-off —
  // same reviewers, same permissions, just a plain approve (no retention/GST/
  // advance to decide — those were already set when the bill was created).
  const [manualApproveTarget, setManualApproveTarget] = useState<ManualBillRow | null>(null);
  const [manualRejectTarget,  setManualRejectTarget]  = useState<ManualBillRow | null>(null);
  const [manualRejectReason,  setManualRejectReason]  = useState("");

  const handleManualApprove = async (bill: ManualBillRow) => {
    setSaving(true);
    try {
      const endpoint = bill.manualApprovalStatus === "pending" ? "manual-agm-approve" : "manual-gm-approve";
      const res = await apiClient.patch(`/bills/${bill._id}/${endpoint}`);
      toast.success(res.data.message || "Approved");
      setManualApproveTarget(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to approve");
    } finally { setSaving(false); }
  };
  const handleManualReject = async () => {
    if (!manualRejectTarget) return;
    setSaving(true);
    try {
      await apiClient.patch(`/bills/${manualRejectTarget._id}/manual-reject`, { reason: manualRejectReason });
      toast.success("Bill rejected");
      setManualRejectTarget(null); setManualRejectReason("");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to reject");
    } finally { setSaving(false); }
  };

  const [archiveTarget, setArchiveTarget] = useState<BillRequestRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  async function archiveOne(r: BillRequestRow) {
    setArchiving(true);
    try {
      await apiClient.patch(`/bill-requests/${r._id}/${r.isArchived ? "unarchive" : "archive"}`);
      toast.success(r.isArchived ? `${r.reqNo} unarchived` : `${r.reqNo} archived`);
      setArchiveTarget(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Action failed");
    } finally {
      setArchiving(false);
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

  const activityPager = usePagination(filteredActivity, 8);

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

  const reqPager = usePagination(filteredReqs, 20);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="large" /></div>;
  }

  return (
    <div>
      <PageHeader
        icon={TrendingUp}
        title="Site Progress"
        subtitle="See what DRI has been logging, raise bill requests, and carry them through AGM (L1) and GM (L2) approval — all in one place."
      />

      {/* ── KPI flashcards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-5">
        <NxStatCard
          label="Pending L1 (AGM)" value={pendingAgmReqs.length + pendingManualAgm.length} icon={Clock}
          active={mainTab === "requests" && reqTab === "pending"}
          onClick={() => { setMainTab("requests"); setReqTab(mainTab === "requests" && reqTab === "pending" ? "all" : "pending"); }}
        />
        <NxStatCard
          label="Pending L2 (GM)" value={pendingGmReqs.length + pendingManualGm.length} icon={Clock}
          active={mainTab === "requests" && reqTab === "pending-gm"}
          onClick={() => { setMainTab("requests"); setReqTab(mainTab === "requests" && reqTab === "pending-gm" ? "all" : "pending-gm"); }}
        />
        <NxStatCard label="Today's Progress Entries" value={kpis.progressEntriesToday} icon={FileText} />
        <NxStatCard label="Active DRIs Today" value={kpis.drisActiveToday} icon={Users} />
        <NxStatCard label="Active Projects Today" value={kpis.projectsActiveToday} icon={Building2} />
      </div>

      <div className="mb-4">
        <Segmented
          value={mainTab}
          onChange={setMainTab}
          options={[
            { value: "progress", label: "Progress" },
            {
              value: "requests",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  Bill Requests
                  {(pendingAgmReqs.length + pendingGmReqs.length + pendingManualAgm.length + pendingManualGm.length) > 0 && (
                    <NxBadge color="amber">{pendingAgmReqs.length + pendingGmReqs.length + pendingManualAgm.length + pendingManualGm.length}</NxBadge>
                  )}
                </span>
              ),
            },
          ]}
        />
      </div>

      {mainTab === "progress" && (
        <>
          {/* ── Filters ── */}
          <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
            <div className="flex gap-2.5 flex-wrap items-center">
              <DropdownSelectFilter
                value={selProjectId ?? ""} onChange={v => setSelProjectId(v || undefined)}
                placeholder="All projects" resetValue=""
                options={projects.map(p => ({ label: p.name, value: p._id }))}
              />
              <DropdownSelectFilter
                value={selDriId ?? ""} onChange={v => setSelDriId(v || undefined)}
                placeholder="All DRIs" resetValue=""
                options={driList.map(d => ({ label: `${d.name} (${d.email})`, value: d._id }))}
              />
              <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
            </div>
          </div>

          {/* ── Recent DRI Progress ── */}
          <div className="mb-7">
            <div className="font-bold text-[15px] mb-2.5 text-[#1A1A2E] dark:text-[#F1F5F9]">Recent DRI Progress</div>
            {filteredActivity.length === 0 ? (
              <EmptyState title="No progress logged for these filters" />
            ) : (
              <>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>When</Th>
                      <Th>Project / Work Order</Th>
                      <Th>DRI</Th>
                      <Th>Progress</Th>
                      <Th>Remarks</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {activityPager.pageItems.map(ev => {
                      const m = ev.metadata || {};
                      const level = m.plannedQty != null && m.completedQty != null ? varianceLevel(m.plannedQty, m.completedQty) : "none";
                      return (
                        <Tr key={ev._id}>
                          <Td>{dayjs(ev.createdAt).format("DD MMM, hh:mm a")}</Td>
                          <Td>
                            <div className="font-semibold">{typeof ev.projectId === "object" ? ev.projectId?.name : "—"}</div>
                            <button type="button" onClick={() => openFromActivity(ev)} className="text-primary text-xs hover:underline">
                              {ev.workOrderNo}
                            </button>
                          </Td>
                          <Td>{ev.performedByName || "—"}</Td>
                          <Td>
                            <div className="text-[13px]">{m.scopeItem} <span className="font-mono text-emerald-600 font-bold">+{fmtN(m.qtyAdded || 0)} {m.unit}</span></div>
                            {level !== "none" && <VarianceTag level={level} />}
                          </Td>
                          <Td>
                            {ev.remarks
                              ? <span className="text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1"><Pin className="w-3 h-3" /> {ev.remarks}</span>
                              : <span className="text-gray-300 dark:text-gray-600">—</span>}
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
                {activityPager.totalPages > 1 && (
                  <div className="mt-3"><Pagination page={activityPager.page} totalPages={activityPager.totalPages} onChange={activityPager.setPage} /></div>
                )}
              </>
            )}
          </div>

          {/* ── Project → Work Order drill-down ── */}
          <div>
            <div className="font-bold text-[15px] mb-3 text-[#1A1A2E] dark:text-[#F1F5F9]">Work Orders</div>
            {!selProjectId ? (
              <EmptyState title="Pick a project above to see its work orders and progress" />
            ) : detailLoading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : projectWOs.length === 0 ? (
              <EmptyState title="No work orders in this project" />
            ) : (
              <div className="flex flex-col gap-2">
                {projectWOs.map(wo => {
                  const detail = woDetails.get(wo._id);
                  const avgPct = detail && detail.scopeItems.length > 0
                    ? Math.round(detail.scopeItems.reduce((s, si) => s + pctOf(si.completedQty, si.plannedQty), 0) / detail.scopeItems.length)
                    : 0;
                  const anyVariance = detail?.scopeItems.some(si => itemHasUnapprovedVariance(si));
                  const pendingBR = pendingBRForWO(wo._id);
                  return (
                    <Card key={wo._id} className="flex justify-between items-center flex-wrap gap-2.5">
                      <div>
                        <div className="flex gap-2 items-center flex-wrap">
                          <span className="font-bold text-primary">{wo.workOrderNo}</span>
                          {wo.category && <NxBadge color="gray">{wo.category}</NxBadge>}
                          {anyVariance && (
                            <NxBadge color="red"><span className="inline-flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> Unapproved variance</span></NxBadge>
                          )}
                          {pendingBR && <NxBadge color={pendingBR.status === "pending-gm" ? "blue" : "orange"}>Bill {pendingBR.reqNo} — {STATUS_CFG[pendingBR.status]?.label}</NxBadge>}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {wo.vendorName} · {(wo.assignedDRI ?? []).map(d => d.name).join(", ") || "No DRI assigned"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-[70px] h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                            <div className={`h-full ${avgPct >= 100 ? "bg-emerald-600" : "bg-primary"}`} style={{ width: `${avgPct}%` }} />
                          </div>
                          <span className="text-xs font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">{avgPct}%</span>
                        </div>
                        <NxBtn color="primary" label="View & Bill" onClick={() => openWO(wo._id)} />
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {mainTab === "requests" && (
        <>
          <div className="mb-4">
            <Segmented
              value={reqTab}
              onChange={setReqTab}
              options={[
                { value: "pending",    label: <span className="inline-flex items-center gap-1.5">Pending L1 {pendingAgmReqs.length > 0 && <NxBadge color="amber">{pendingAgmReqs.length}</NxBadge>}</span> },
                { value: "pending-gm", label: <span className="inline-flex items-center gap-1.5">Pending L2 {pendingGmReqs.length > 0 && <NxBadge color="blue">{pendingGmReqs.length}</NxBadge>}</span> },
                { value: "approved",   label: "Approved" },
                { value: "rejected",   label: "Rejected" },
                { value: "all",        label: "All" },
              ]}
            />
          </div>
          <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
            <div className="flex gap-2.5 flex-wrap items-center">
              <SearchFilter
                placeholder="Search by request no, work order, contractor, or project…"
                value={reqSearch} onChange={setReqSearch}
              />
              <DropdownSelectFilter
                value={reqProjectFilter ?? ""} onChange={v => setReqProjectFilter(v || undefined)}
                placeholder="All projects" resetValue=""
                options={projectOptions}
              />
              <UISwitch checked={showArchived} onChange={setShowArchived} onLabel="Archived" offLabel="Show Archived" />
            </div>
          </div>

          {/* Manual bills (Billing -> New Bill) — no BillRequest of their own,
              so they're never in billReqs above; this is their own AGM/GM
              sign-off, tracked directly on the bill. */}
          {(reqTab === "pending" ? pendingManualAgm : reqTab === "pending-gm" ? pendingManualGm : reqTab === "all" ? manualBills : []).length > 0 && (
            <div className="mb-5">
              <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Manual Bills — Billing → New Bill
              </div>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Bill No</Th>
                    <Th>Project</Th>
                    <Th>Vendor</Th>
                    <Th>Amount</Th>
                    <Th>Date</Th>
                    <Th>Stage</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {(reqTab === "pending" ? pendingManualAgm : reqTab === "pending-gm" ? pendingManualGm : manualBills).map(b => (
                    <Tr key={b._id}>
                      <Td><span className="text-primary font-bold text-[13px]">{b.billNo}</span></Td>
                      <Td>{b.projectName || "—"}</Td>
                      <Td>{b.vendorName || "—"}</Td>
                      <Td className="font-mono">{fmt(b.amount)}</Td>
                      <Td>{dayjs(b.billDate || b.createdAt).format("DD MMM YYYY")}</Td>
                      <Td><NxBadge color={b.manualApprovalStatus === "pending-gm" ? "blue" : "orange"}>{b.manualApprovalStatus === "pending-gm" ? "Pending L2" : "Pending L1"}</NxBadge></Td>
                      <Td>
                        <div className="flex items-center gap-1">
                          {b.manualApprovalStatus === "pending" && canAgmApprove && (
                            <NxBtn color="icon-green" title="AGM Approve" icon={Check} onClick={() => setManualApproveTarget(b)} />
                          )}
                          {b.manualApprovalStatus === "pending-gm" && canGmApprove && (
                            <NxBtn color="icon-green" title="GM Approve" icon={Check} onClick={() => setManualApproveTarget(b)} />
                          )}
                          {canRejectAny && (
                            <NxBtn color="icon-red" title="Reject" icon={X} onClick={() => setManualRejectTarget(b)} />
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          )}

          {filteredReqs.length === 0 ? (
            <EmptyState title={`No ${reqTab === "all" ? "" : STATUS_CFG[reqTab]?.label.toLowerCase() || reqTab} bill requests`} />
          ) : (
            <>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Stage / Request</Th>
                    <Th>Work Order</Th>
                    <Th>Project</Th>
                    <Th>Contractor</Th>
                    <Th>Items</Th>
                    <Th>Date</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {reqPager.pageItems.map(r => {
                    const cfg = STATUS_CFG[r.status] ?? { color: "gray", label: r.status };
                    const menuItems: DropdownMenuItem[] = [
                      { key: "archive", label: r.isArchived ? "Unarchive" : "Archive", icon: ArchiveIcon, onClick: () => setArchiveTarget(r) },
                    ];
                    return (
                      <Tr key={r._id} className="cursor-pointer" onClick={() => setViewReq(r)}>
                        <Td>
                          <div className="flex gap-1.5 items-center">
                            {r.stageNo && <NxBadge color="orange">S{r.stageNo}</NxBadge>}
                            <span className="text-primary font-bold text-[13px]">{r.reqNo}</span>
                          </div>
                          {r.milestoneAchieved && (
                            <span className="text-[10px] text-primary inline-flex items-center gap-0.5"><Trophy className="w-2.5 h-2.5" /> Milestone</span>
                          )}
                        </Td>
                        <Td>
                          <code
                            className="cursor-pointer text-blue-600 dark:text-blue-400"
                            onClick={e => { e.stopPropagation(); if (r.workOrderId) navigate(`/work-items/${r.workOrderId}`); }}
                          >
                            {r.workOrderNo}
                          </code>
                        </Td>
                        <Td>{r.projectName}</Td>
                        <Td>{r.vendorName}</Td>
                        <Td>{r.items.length} item{r.items.length !== 1 ? "s" : ""}</Td>
                        <Td>{dayjs(r.createdAt).format("DD MMM YYYY")}</Td>
                        <Td><NxBadge color={cfg.color as any}>{cfg.label}</NxBadge></Td>
                        <Td>
                          <div onClick={e => e.stopPropagation()} className="flex items-center gap-1">
                            <NxBtn color="icon-blue" title="View" icon={Eye} onClick={() => setViewReq(r)} />
                            <NxBtn color="icon" title="Print" icon={Printer} loading={printingReqId === r._id} onClick={() => handlePrintReq(r)} />
                            {r.status === "pending" && canAgmApprove && (
                              <NxBtn color="icon-green" title="AGM Approve" icon={Check} onClick={() => openApprove(r._id)} />
                            )}
                            {r.status === "pending-gm" && canGmApprove && (
                              <NxBtn color="icon-green" title="GM Approve" icon={Check} onClick={() => openGmApprove(r._id)} />
                            )}
                            {["pending", "pending-gm"].includes(r.status) && canRejectAny && (
                              <NxBtn color="icon-red" title="Reject" icon={X} onClick={() => { setRejectTarget(r._id); setRejectModal(true); }} />
                            )}
                            <DropdownMenu items={menuItems} />
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
              {reqPager.totalPages > 1 && (
                <div className="mt-3"><Pagination page={reqPager.page} totalPages={reqPager.totalPages} onChange={reqPager.setPage} /></div>
              )}
            </>
          )}
        </>
      )}

      {archiveTarget && (
        <ConfirmModal
          title={archiveTarget.isArchived ? `Unarchive ${archiveTarget.reqNo}?` : `Archive ${archiveTarget.reqNo}?`}
          message={archiveTarget.isArchived ? "This will move it back into the active list." : "This will move it out of the active list — you can unarchive it later."}
          confirmLabel={archiveTarget.isArchived ? "Unarchive" : "Archive"}
          loading={archiving}
          onConfirm={() => archiveOne(archiveTarget)}
          onCancel={() => setArchiveTarget(null)}
        />
      )}

      {/* ── Work order detail + bill-generation modal ── */}
      {viewWOId && (
        <Modal
          icon={FileText}
          title={`Work Order — ${viewWO?.workOrderNo ?? ""}`}
          extraWide
          onClose={() => { setViewWOId(null); setChecked(new Set()); }}
          footer={
            <div className="flex justify-between items-center w-full">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {checked.size > 0 ? `${checked.size} item${checked.size !== 1 ? "s" : ""} selected` : "Select items below to bill"}
              </span>
              <div className="flex gap-2">
                <Btn outline label="Close" onClick={() => setViewWOId(null)} />
                <Btn color="primary" label="Generate Bill Request" disabled={checked.size === 0} loading={generating} onClick={handleGenerateBill} />
              </div>
            </div>
          }
        >
          {!viewWO ? (
            <Spinner size="large" />
          ) : (
            <div className="flex flex-col gap-3.5">
              <Descriptions columns={2}>
                <DescItem label="Project">{viewWO.projectName}</DescItem>
                <DescItem label="Contractor">{`${viewWO.vendorName ?? ""} (${viewWO.vendorCode ?? ""})`}</DescItem>
                <DescItem label="Category">{viewWO.category || "—"}</DescItem>
                <DescItem label="Contract Value">{viewWO.contractValue ? fmt(viewWO.contractValue) : "—"}</DescItem>
                <DescItem label="Assigned DRI">{(viewWO.assignedDRI ?? []).map(d => d.name).join(", ") || "—"}</DescItem>
                <DescItem label="Status">{viewWO.status}</DescItem>
              </Descriptions>

              {slaInstance && (
                <div>
                  <div className="text-[11px] text-gray-400 mb-0.5">
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
                <div className="font-bold text-xs text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">
                  Scope Items — select which ones to bill this cycle
                </div>
                <Table>
                  <Thead>
                    <Tr>
                      <Th></Th>
                      <Th>Description</Th>
                      <Th>Unit</Th>
                      <Th>Planned</Th>
                      <Th>Done</Th>
                      <Th>Unbilled</Th>
                      <Th>Variance</Th>
                      <Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {viewWO.scopeItems.map((si) => {
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
                          <Tr>
                            <Td>
                              {unbilled > 0 && (
                                <span title={blocked ? `Approve the variance${hasSubItems ? " on every particular" : ""} below first` : undefined}>
                                  <Checkbox checked={checked.has(si._id)} disabled={!canBill} onChange={() => toggleCheck(si._id)} />
                                </span>
                              )}
                            </Td>
                            <Td className="font-semibold">
                              {!hasSubItems && entryCount > 0 && (
                                <button type="button" onClick={() => toggleEntries(si._id)} className="mr-1.5 text-gray-500 dark:text-gray-400 align-middle">
                                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 inline" /> : <ChevronRight className="w-3.5 h-3.5 inline" />}
                                </button>
                              )}
                              {si.description}
                              {!hasSubItems && entryCount > 0 && (
                                <span className="text-[11px] text-gray-400 font-normal ml-1.5">({entryCount} entr{entryCount !== 1 ? "ies" : "y"})</span>
                              )}
                              {si.remarks && <div className="text-[11px] text-amber-600 font-normal">📌 {si.remarks}</div>}
                            </Td>
                            <Td>{si.unit}</Td>
                            <Td className="font-mono">{fmtN(si.plannedQty)}</Td>
                            <Td className="font-mono">{fmtN(si.completedQty)}</Td>
                            <Td className={`font-mono ${unbilled > 0 ? "text-primary font-bold" : "text-gray-400"}`}>{fmtN(unbilled)}</Td>
                            <Td>
                              {!hasSubItems && level !== "none" && (
                                <div className="flex items-center gap-1.5">
                                  <VarianceTag level={level} />
                                  {!si.varianceApproved && (
                                    <Btn small outline loading={approvingVariance === si._id} label="Approve" onClick={() => handleApproveVariance(si)} />
                                  )}
                                </div>
                              )}
                              {hasSubItems && itemHasUnapprovedVariance(si) && <UIBadge color="red" small>See particulars</UIBadge>}
                            </Td>
                            <Td></Td>
                          </Tr>
                          {!hasSubItems && isExpanded && (
                            <Tr>
                              <Td></Td>
                              <Td colSpan={7} className="!py-0 pb-2.5">
                                <ProgressEntryLog entries={si.progressEntries} />
                              </Td>
                            </Tr>
                          )}
                          {hasSubItems && si.subItems!.map(sub => {
                            const subUnbilled = Math.max(0, (sub.completedQty || 0) - (sub.lastBilledQty || 0));
                            const subLevel = varianceLevel(sub.plannedQty, sub.completedQty);
                            const subEntryCount = sub.progressEntries?.length ?? 0;
                            const subExpanded = expandedEntries.has(sub._id);
                            return (
                              <Fragment key={sub._id}>
                                <Tr className="bg-gray-50/60 dark:bg-gray-800/20">
                                  <Td></Td>
                                  <Td className="pl-6 text-xs text-gray-500 dark:text-gray-400">
                                    {subEntryCount > 0 && (
                                      <button type="button" onClick={() => toggleEntries(sub._id)} className="mr-1.5 text-gray-400 align-middle">
                                        {subExpanded ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
                                      </button>
                                    )}
                                    {sub.description}
                                    {subEntryCount > 0 && <span className="text-[10px] text-gray-400 ml-1.5">({subEntryCount})</span>}
                                  </Td>
                                  <Td className="text-xs">{sub.unit}</Td>
                                  <Td className="font-mono text-xs">{fmtN(sub.plannedQty)}</Td>
                                  <Td className="font-mono text-xs">{fmtN(sub.completedQty)}</Td>
                                  <Td className={`font-mono text-xs ${subUnbilled > 0 ? "text-primary font-bold" : "text-gray-400"}`}>{fmtN(subUnbilled)}</Td>
                                  <Td>
                                    {subLevel !== "none" && (
                                      <div className="flex items-center gap-1.5">
                                        <VarianceTag level={subLevel} />
                                        {!sub.varianceApproved && (
                                          <Btn small outline loading={approvingVariance === sub._id} label="Approve" onClick={() => handleApproveVariance(si, sub)} />
                                        )}
                                      </div>
                                    )}
                                  </Td>
                                  <Td></Td>
                                </Tr>
                                {subExpanded && (
                                  <Tr className="bg-gray-50/60 dark:bg-gray-800/20">
                                    <Td></Td><Td></Td>
                                    <Td colSpan={6} className="pl-6">
                                      <ProgressEntryLog entries={sub.progressEntries} />
                                    </Td>
                                  </Tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </Tbody>
                </Table>
              </div>

              <Field
                textarea label="Remarks for this bill request (optional)" placeholder="Notes for whoever approves this…"
                value={billRemarks} onChange={e => setBillRemarks(e.target.value)}
              />
            </div>
          )}
        </Modal>
      )}

      {/* ── Bill request view modal ── */}
      {viewReq && (
        <Modal
          icon={FileText}
          title={
            <span className="inline-flex items-center gap-2">
              <span>Bill Request — {viewReq.reqNo}</span>
              <UIBadge color={STATUS_CFG[viewReq.status]?.color as any}>{STATUS_CFG[viewReq.status]?.label}</UIBadge>
              {viewReq.milestoneAchieved && <UIBadge color="orange" small>🏆 Milestone</UIBadge>}
            </span>
          }
          extraWide
          onClose={() => setViewReq(null)}
          footer={
            <div className="flex gap-2 justify-end flex-wrap">
              <Btn outline label="Close" onClick={() => setViewReq(null)} />
              <Btn outline icon={Printer} label="Print" loading={printingReqId === viewReq._id} onClick={() => handlePrintReq(viewReq)} />
              {viewReq.status === "pending" && (
                <>
                  {canRejectAny && <Btn color="red" label="Reject" onClick={() => { setRejectTarget(viewReq._id); setRejectModal(true); setViewReq(null); }} />}
                  {canAgmApprove && <Btn color="primary" label="AGM Approve →" onClick={() => { openApprove(viewReq._id); setViewReq(null); }} />}
                </>
              )}
              {viewReq.status === "pending-gm" && (
                <>
                  {canRejectAny && <Btn color="red" label="Reject" onClick={() => { setRejectTarget(viewReq._id); setRejectModal(true); setViewReq(null); }} />}
                  {canGmApprove && <Btn color="blue" label="GM Approve →" onClick={() => { openGmApprove(viewReq._id); setViewReq(null); }} />}
                </>
              )}
            </div>
          }
        >
          <div className="flex flex-col gap-3.5">
            <Descriptions columns={2}>
              <DescItem label="Work Order">{viewReq.workOrderNo}</DescItem>
              <DescItem label="Project">{viewReq.projectLocation ? `${viewReq.projectName} — ${viewReq.projectLocation}` : viewReq.projectName}</DescItem>
              <DescItem label="Contractor">{viewReq.vendorName}</DescItem>
              <DescItem label="Requested By">{viewReq.requestedBy?.name || "—"}</DescItem>
              <DescItem label="Date">{dayjs(viewReq.createdAt).format("DD MMM YYYY")}</DescItem>
              {viewReq.periodFrom && (
                <DescItem label="Period">{`${dayjs(viewReq.periodFrom).format("DD MMM YYYY")} → ${dayjs(viewReq.periodTo ?? viewReq.createdAt).format("DD MMM YYYY")}`}</DescItem>
              )}
              {viewReq.billId && (
                <DescItem label="Bill No.">{viewReq.billId.billNo + " — " + fmt(viewReq.billId.amount)}</DescItem>
              )}
            </Descriptions>

            {viewReq.status === "pending-gm" && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-3">
                <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300 mb-2 uppercase">AGM already set (read-only)</div>
                <Descriptions columns={3}>
                  <DescItem label="Hold / Retention"><span className="font-bold">{fmt(viewReq.retentionAmount ?? 0)}</span></DescItem>
                  <DescItem label="Advance Recovery"><span className="font-bold">{fmt(viewReq.advanceRecovery ?? 0)}</span></DescItem>
                  <DescItem label="GST %">
                    {viewReq.gstPercentOverride != null ? <span className="font-bold">{viewReq.gstPercentOverride}%</span> : <span className="text-gray-400">Work order default</span>}
                  </DescItem>
                </Descriptions>
                {viewReq.payeeVendorCode && (
                  <div className="mt-2 text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Pay To: </span>
                    <span className="font-bold">{viewReq.payeeVendorName} ({viewReq.payeeVendorCode})</span>
                  </div>
                )}
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
                  {actorName(viewReq.agmApprovedBy) || "AGM"}{viewReq.agmApprovedAt ? ` · ${dayjs(viewReq.agmApprovedAt).format("DD MMM YYYY")}` : ""}
                </div>
              </div>
            )}

            <Table>
              <Thead>
                <Tr>
                  <Th>Description</Th><Th>Unit</Th><Th className="text-right">Qty Billed</Th><Th className="text-right">Rate</Th><Th className="text-right">Amount</Th>
                </Tr>
              </Thead>
              <Tbody>
                {viewReq.items.map((it, i) => {
                  const amt = (it.rate ?? 0) * it.billedQty;
                  return (
                    <Tr key={i}>
                      <Td>
                        {it.description}
                        {it.progressRemarks && <div className="text-[11px] text-blue-600 mt-0.5">👷 {it.progressRemarks}</div>}
                      </Td>
                      <Td>{it.unit}</Td>
                      <Td className="text-right font-mono">{it.billedQty.toLocaleString("en-IN")}</Td>
                      <Td className="text-right">{it.rate ? fmtRate(it.rate) : <span className="text-gray-400">pending</span>}</Td>
                      <Td className="text-right font-semibold">{it.rate ? fmt(amt) : <span className="text-gray-400">—</span>}</Td>
                    </Tr>
                  );
                })}
              </Tbody>
              {viewTotal > 0 && (
                <Tfoot>
                  <Tr className="!bg-primary/5">
                    <Td colSpan={4} className="font-bold text-right text-primary">Gross Total</Td>
                    <Td className="font-bold text-right">{fmt(viewTotal)}</Td>
                  </Tr>
                </Tfoot>
              )}
            </Table>

            {viewTotal > 0 && (() => {
              const retAmt = viewReq.retentionAmount ?? 0;
              const advRec = viewReq.advanceRecovery ?? 0;
              const gstPct = viewReq.gstPercentOverride ?? 0;
              const { gstAmount, netAfterHold } = billFinancials({ gross: viewTotal, gstPercent: gstPct, retentionAmount: retAmt, advanceRecovery: advRec });
              return (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 font-mono text-[13px]">
                  <div className="flex justify-between text-gray-500 dark:text-gray-400">
                    <span>Gross Total</span><span>{fmt(viewTotal)}</span>
                  </div>
                  {retAmt > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Hold / Retention</span><span>− {fmt(retAmt)}</span>
                    </div>
                  )}
                  {advRec > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>Less: Advance Recovery</span><span>− {fmt(advRec)}</span>
                    </div>
                  )}
                  {gstAmount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>GST @ {gstPct}%</span><span>+ {fmt(gstAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-primary border-t border-primary/20 pt-1 mt-1">
                    <span>Final Amount</span><span>{fmt(netAfterHold)}</span>
                  </div>
                </div>
              );
            })()}

            {viewReq.remarks && (
              <div className="rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-2.5 text-[13px]">
                <strong>Remarks:</strong> {viewReq.remarks}
              </div>
            )}

            {viewReq.rejectReason && (
              <div className="rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-2.5 text-[13px]">
                <strong>Reject Reason:</strong> {viewReq.rejectReason}
              </div>
            )}

            {(viewReq.approvalHistory?.length ?? 0) > 0 && (
              <div>
                <div className="font-bold text-[11px] text-gray-500 dark:text-gray-400 uppercase mb-1.5">History</div>
                <ApprovalHistoryTimeline history={viewReq.approvalHistory} />
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── AGM approve modal (L1) — hold/retention + advance, both optional ── */}
      {approveModal && (
        <Modal
          icon={CheckCircle2}
          title="AGM Approve — Stage 1"
          onClose={() => { setApproveModal(false); setApproveTarget(null); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setApproveModal(false); setApproveTarget(null); }} />
              <Btn color="primary" label="Approve & Forward to GM" loading={saving} onClick={handleAgmApprove} />
            </div>
          }
        >
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3.5">
            Sets the hold/advance figures GM will see at Stage 2. Leave a field blank to use the work order's automatic retention calculation.
          </div>
          {approveGroupSiblings.length > 1 && (
            <div className="mb-3">
              <SField
                label="Pay To (Vendor Group)"
                value={approvePayeeCode}
                onChange={selectApprovePayee}
                options={approveGroupSiblings.map(c => ({ value: c.vendorCode, label: `${c.companyName} (${c.vendorCode})` }))}
              />
            </div>
          )}
          <div className="mb-3">
            <Field
              label="Hold / Retention Amount (₹, optional)"
              type="number" min="0"
              placeholder="Auto-calculated from work order retention %"
              value={approveRetention ?? ""}
              onChange={(e) => setApproveRetention(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="mb-3">
            <Field
              label="Advance Recovery Amount (₹, optional)"
              type="number" min="0"
              max={approvePendingAdvances.length ? approvePendingAdvances.reduce((s, sl) => s + sl.balance, 0) : undefined}
              placeholder="0"
              value={approveAdvance ?? ""}
              onChange={(e) => setApproveAdvance(e.target.value ? Number(e.target.value) : null)}
              hint={approvePendingAdvances.length > 0
                ? `Outstanding for this payee: ${approvePendingAdvances.map(sl => `${sl.slipNo} (${fmt(sl.balance)})`).join(", ")} — settled oldest-first.`
                : "No outstanding advance slips for this payee on this project."}
            />
          </div>
          <Field
            label="GST % (optional)"
            type="number" min="0" max="100"
            placeholder="Leave blank to use the work order's GST%"
            value={approveGst ?? ""}
            onChange={(e) => setApproveGst(e.target.value ? Number(e.target.value) : null)}
          />
        </Modal>
      )}

      {/* ── GM approve modal (L2) — final, creates the RunningBill ── */}
      {gmModal && (
        <Modal
          icon={CheckCircle2}
          title="GM Approve — Stage 2 (Final)"
          onClose={() => { setGmModal(false); setGmTarget(null); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setGmModal(false); setGmTarget(null); }} />
              <Btn color="blue" label="Approve & Generate Bill" loading={saving} onClick={handleGmApprove} />
            </div>
          }
        >
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3.5">
            This creates the running bill using the retention/advance/GST AGM already set. It then moves to Accounts Payment.
          </div>
          {gmGroupSiblings.length > 1 && (
            <div className="mb-3">
              <SField
                label="Pay To (Vendor Group) — final confirmation"
                value={gmPayeeCode}
                onChange={setGmPayeeCode}
                options={gmGroupSiblings.map(c => ({ value: c.vendorCode, label: `${c.companyName} (${c.vendorCode})` }))}
              />
            </div>
          )}
          <Field textarea label="Remarks (optional)" placeholder="Remarks (optional)" value={gmRemarks} onChange={(e) => setGmRemarks(e.target.value)} />
        </Modal>
      )}

      {rejectModal && (
        <Modal
          icon={XCircle}
          title="Reject Bill Request"
          onClose={() => { setRejectModal(false); setRejectReason(""); setRejectTarget(null); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setRejectModal(false); setRejectReason(""); setRejectTarget(null); }} />
              <Btn color="red" label="Confirm Rejection" loading={saving} onClick={handleReject} />
            </div>
          }
        >
          <Field textarea label="Reason for rejection (optional)" placeholder="Reason for rejection (optional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
        </Modal>
      )}

      {manualApproveTarget && (
        <ConfirmModal
          title={manualApproveTarget.manualApprovalStatus === "pending" ? "AGM Approve this bill?" : "GM Approve this bill?"}
          message={`${manualApproveTarget.billNo} (${fmt(manualApproveTarget.amount)}) will move ${manualApproveTarget.manualApprovalStatus === "pending" ? "to GM for final sign-off" : "to Accounts for verification"}.`}
          confirmLabel="Approve"
          loading={saving}
          onConfirm={() => handleManualApprove(manualApproveTarget)}
          onCancel={() => setManualApproveTarget(null)}
        />
      )}

      {manualRejectTarget && (
        <Modal
          icon={XCircle}
          title={`Reject ${manualRejectTarget.billNo}`}
          onClose={() => { setManualRejectTarget(null); setManualRejectReason(""); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setManualRejectTarget(null); setManualRejectReason(""); }} />
              <Btn color="red" label="Confirm Rejection" loading={saving} onClick={handleManualReject} />
            </div>
          }
        >
          <Field textarea label="Reason for rejection" placeholder="Why is this bill being rejected?" value={manualRejectReason} onChange={(e) => setManualRejectReason(e.target.value)} />
        </Modal>
      )}
    </div>
  );
}
