import { Fragment, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FileText, Users, Building2, AlertTriangle, Pin, ChevronDown, ChevronRight, TrendingUp, XCircle,
} from "lucide-react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import { DropdownSelectFilter, FilterRow, SearchFilter } from "../../ui/Filters";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import WorkflowInstanceStepper from "../../components/WorkflowInstanceStepper";
import type { WorkflowInstance } from "../../types/Workflow";
import UIBadge from "../../ui/Badge";
import Btn from "../../ui/Btn";
import EmptyState from "../../ui/EmptyState";
import Spinner from "../../ui/Spinner";
import PageHeader from "../../ui/PageHeader";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import Field from "../../ui/Field";
import Checkbox from "../../ui/Checkbox";
import { Descriptions, DescItem } from "../../ui/Descriptions";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import NxBadge from "../../ui/nexora/Badge";
import NxBtn from "../../ui/nexora/Btn";
import NxCard from "../../ui/nexora/Card";
import NxStatCard from "../../ui/nexora/StatCard";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProgressEntryDetail {
  _id: string; date: string; qtyAdded: number; remarks?: string;
  tower?: string; floor?: string; flatNo?: string; plotNo?: string; locationNote?: string;
  enteredBy?: { _id: string; name: string } | string | null;
  invalidated?: { done?: boolean; reason?: string; at?: string };
  billedInRequestId?: string | null;
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
const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Per-unit rates are fractional far more often than totals are — rounding
// them for display (as fmt() does) silently turns 130.5 into 131.
const fmtN = (n: number) => (n ?? 0).toLocaleString("en-IN");
const pctOf = (c: number, p: number) => p > 0 ? Math.min(100, Math.round((c / p) * 100)) : 0;

const STATUS_CFG: Record<string, { color: string; label: string }> = {
  pending: { color: "orange", label: "Pending L1" },
  "pending-gm": { color: "blue", label: "Pending L2" },
  approved: { color: "green", label: "Approved" },
  rejected: { color: "red", label: "Rejected" },
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

// Mirrors the backend's authorizeOrAlt('work-progress', action, 'bill-review',
// action) exactly — either grant unlocks this, since Site Progress's own
// Permission Matrix module (bill-review) consolidates edit/delete/invalidate
// alongside its variance approve/reject, instead of needing a separate
// Work Progress grant too.
function hasWorkProgressPermission(user: { role?: string; permissions?: { module: string; actions: string[] }[] } | null | undefined, action: string): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return (user.permissions ?? []).some(p =>
    (p.module === "work-progress" && p.actions.includes(action)) ||
    (p.module === "bill-review" && p.actions.includes(action))
  );
}

// Log of every raw dated progress entry behind a scope item/particular — the
// aggregated planned/done/unbilled row above can't show this. Edit/Delete
// (gated on work-progress:edit/:delete) let whoever holds that permission
// fix a bad measurement directly, instead of it sitting there wrong forever
// — previously this log was read-only even for Owner.
function ProgressEntryLog({
  entries, completedQty, lastBilledQty, canEdit, canDelete, canInvalidate, onEdit, onDelete, onInvalidate,
}: {
  entries?: ProgressEntryDetail[]; completedQty: number; lastBilledQty: number;
  canEdit: boolean; canDelete: boolean; canInvalidate: boolean;
  onEdit: (e: ProgressEntryDetail) => void; onDelete: (e: ProgressEntryDetail) => void; onInvalidate: (e: ProgressEntryDetail) => void;
}) {
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
          // Floor already reads naturally on its own (whether someone typed a
          // bare code like "1"/"G" or a full phrase like "First Floor") — no
          // "Floor " prefix, unlike Tower/Flat/Plot which need their label to
          // stay unambiguous next to a bare number/code.
          const loc = [e.tower && `Tower ${e.tower}`, e.floor, e.flatNo && `Flat ${e.flatNo}`, e.plotNo && `Plot ${e.plotNo}`, e.locationNote].filter(Boolean).join(" · ");
          // Deleting must never drop completedQty below what's already
          // billed — same guard editProgressEntry's own qty-floor enforces
          // server-side, checked here too so Delete simply isn't offered
          // when it would always fail.
          const deletable = completedQty - e.qtyAdded >= (lastBilledQty || 0);
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
                {e.invalidated?.done ? (
                  <UIBadge color="red" small>Invalidated{e.invalidated.reason ? `: ${e.invalidated.reason}` : ""}</UIBadge>
                ) : (
                  <div className="flex items-center gap-2">
                    {canEdit && !e.billedInRequestId && (
                      <button type="button" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline" onClick={() => onEdit(e)}>Edit</button>
                    )}
                    {e.billedInRequestId ? (
                      canInvalidate && <button type="button" className="text-purple-600 dark:text-purple-400 font-semibold hover:underline" onClick={() => onInvalidate(e)}>Invalidate</button>
                    ) : canDelete && (
                      deletable
                        ? <button type="button" className="text-red-600 dark:text-red-400 font-semibold hover:underline" onClick={() => onDelete(e)}>Delete</button>
                        : <span className="text-gray-300 dark:text-gray-600" title="Entry is billed and cannot be deleted.">Delete</span>
                    )}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SiteProgress() {
  const { user } = useAuth();
  const canEditProgress = hasWorkProgressPermission(user, "edit");
  const canDeleteProgress = hasWorkProgressPermission(user, "delete");
  // Mirrors the backend's invalidate routes exactly: work-progress:edit OR
  // bill-review:invalidate — not :delete, since invalidating a billed entry
  // is a correction (like Edit), not an outright removal.
  const canInvalidateProgress = canEditProgress || hasWorkProgressPermission(user, "invalidate");
  // Mirrors approve-variance/reject-variance's own authorizeOr/authorizeAnyOr
  // exactly — these buttons were previously shown unconditionally, so anyone
  // without the grant saw them but got a 403 toast after clicking.
  const canApproveVariance = hasWorkProgressPermission(user, "approve");
  const canRejectVariance = canApproveVariance || hasWorkProgressPermission(user, "reject");

  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [allWOs, setAllWOs] = useState<WORow[]>([]);
  const [billReqs, setBillReqs] = useState<BillRequestRow[]>([]);
  const [driList, setDriList] = useState<DriOption[]>([]);
  const [kpis, setKpis] = useState({ progressEntriesToday: 0, drisActiveToday: 0, projectsActiveToday: 0 });

  const [selProjectId, setSelProjectId] = useState<string | undefined>(undefined);
  const [selDriId, setSelDriId] = useState<string | undefined>(undefined);
  const [activitySearch, setActivitySearch] = useState("");
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [woDetails, setWoDetails] = useState<Map<string, WODetail>>(new Map());
  const [detailLoading, setDetailLoading] = useState(false);

  // Note: reviewing/approving bill requests (AGM/GM chain) and manual bills
  // now lives on its own page — see Bill Approval (pages/BillRequests). This
  // page still fetches bill-requests itself (below) since it needs it for
  // the "Bill <reqNo> — <status>" badge on a work order's own card, and to
  // stop a second bill request being raised against a WO that already has
  // one pending.
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
          drisActiveToday: k.drisActiveToday || 0,
          projectsActiveToday: k.projectsActiveToday || 0,
        });
      })
      .catch(() => toast.error("Failed to load Site Progress data"))
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
    // One batched request instead of one GET /work-orders/:id per WO — see
    // the same fix in DRIDashboard/index.tsx for why this was the main
    // cause of slow loads on a project with many work orders.
    apiClient.get("/work-orders/bulk-detail", { params: { ids: projectWOs.map(wo => wo._id).join(",") } })
      .then(r => {
        const map = new Map<string, WODetail>();
        (r.data.workOrders ?? []).forEach((d: WODetail) => { if (d) map.set(d._id, d); });
        setWoDetails(map);
      })
      .catch(() => { })
      .finally(() => setDetailLoading(false));
  }, [projectWOs]);

  const reloadWODetail = async (woId: string) => {
    const r = await apiClient.get(`/work-orders/${woId}`);
    setWoDetails(prev => new Map(prev).set(woId, r.data.workOrder));
  };

  // ── Work order detail + bill-generation modal ───────────────────────────────
  const [viewWOId, setViewWOId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [slaInstance, setSlaInstance] = useState<WorkflowInstance | null>(null);
  const [billRemarks, setBillRemarks] = useState("");
  const [generating, setGenerating] = useState(false);
  const [approvingVariance, setApprovingVariance] = useState<string | null>(null);
  // Reject variance — needs a reason, so it's a small modal rather than an
  // instant action like Approve.
  const [rejectVarianceTarget, setRejectVarianceTarget] = useState<{ item: ScopeItemDetail; subItem?: SubItemDetail } | null>(null);
  const [rejectVarianceReason, setRejectVarianceReason] = useState("");
  const [rejectingVariance, setRejectingVariance] = useState(false);

  // ── Progress entry Edit/Delete/Invalidate (work-progress:edit/:delete) ──────
  type EntryTarget = { item: ScopeItemDetail; subItem?: SubItemDetail; entry: ProgressEntryDetail };
  const [editEntryTarget, setEditEntryTarget] = useState<EntryTarget | null>(null);
  const [editEntryForm, setEditEntryForm] = useState({ qtyAdded: "", date: "", remarks: "", tower: "", floor: "", flatNo: "", plotNo: "", locationNote: "" });
  const [editEntrySaving, setEditEntrySaving] = useState(false);
  const [deleteEntryTarget, setDeleteEntryTarget] = useState<EntryTarget | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);
  const [invalidateEntryTarget, setInvalidateEntryTarget] = useState<EntryTarget | null>(null);
  const [invalidateReason, setInvalidateReason] = useState("");
  const [invalidatingEntry, setInvalidatingEntry] = useState(false);

  const entryPath = (woId: string, item: ScopeItemDetail, subItem: SubItemDetail | undefined, entryId: string, suffix = "") =>
    subItem
      ? `/work-orders/${woId}/scope-items/${item._id}/sub-items/${subItem._id}/progress/${entryId}${suffix}`
      : `/work-orders/${woId}/scope-items/${item._id}/progress/${entryId}${suffix}`;

  const openEditEntry = (item: ScopeItemDetail, subItem: SubItemDetail | undefined, entry: ProgressEntryDetail) => {
    setEditEntryTarget({ item, subItem, entry });
    setEditEntryForm({
      qtyAdded: String(entry.qtyAdded), date: entry.date ? entry.date.slice(0, 10) : "",
      remarks: entry.remarks || "", tower: entry.tower || "", floor: entry.floor || "",
      flatNo: entry.flatNo || "", plotNo: entry.plotNo || "", locationNote: entry.locationNote || "",
    });
  };

  const handleSaveEditEntry = async () => {
    if (!viewWO || !editEntryTarget) return;
    const qty = Number(editEntryForm.qtyAdded);
    if (!qty || qty <= 0) { toast.error("Quantity must be greater than 0"); return; }
    setEditEntrySaving(true);
    try {
      const { item, subItem, entry } = editEntryTarget;
      await apiClient.patch(entryPath(viewWO._id, item, subItem, entry._id), {
        qtyAdded: qty, date: editEntryForm.date || undefined, remarks: editEntryForm.remarks,
        tower: editEntryForm.tower, floor: editEntryForm.floor, flatNo: editEntryForm.flatNo,
        plotNo: editEntryForm.plotNo, locationNote: editEntryForm.locationNote,
      });
      toast.success("Progress entry updated");
      setEditEntryTarget(null);
      await reloadWODetail(viewWO._id);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to update entry");
    } finally {
      setEditEntrySaving(false);
    }
  };

  const handleDeleteEntryConfirm = async () => {
    if (!viewWO || !deleteEntryTarget) return;
    setDeletingEntry(true);
    try {
      const { item, subItem, entry } = deleteEntryTarget;
      await apiClient.delete(entryPath(viewWO._id, item, subItem, entry._id));
      toast.success("Progress entry deleted");
      setDeleteEntryTarget(null);
      await reloadWODetail(viewWO._id);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to delete entry");
    } finally {
      setDeletingEntry(false);
    }
  };

  const handleInvalidateEntryConfirm = async () => {
    if (!viewWO || !invalidateEntryTarget || !invalidateReason.trim()) return;
    setInvalidatingEntry(true);
    try {
      const { item, subItem, entry } = invalidateEntryTarget;
      await apiClient.patch(entryPath(viewWO._id, item, subItem, entry._id, "/invalidate"), { reason: invalidateReason.trim() });
      toast.success("Progress entry invalidated");
      setInvalidateEntryTarget(null);
      setInvalidateReason("");
      await reloadWODetail(viewWO._id);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to invalidate entry");
    } finally {
      setInvalidatingEntry(false);
    }
  };

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

  const handleRejectVariance = async () => {
    if (!viewWO || !rejectVarianceTarget || !rejectVarianceReason.trim()) return;
    const { item, subItem } = rejectVarianceTarget;
    setRejectingVariance(true);
    try {
      const path = subItem
        ? `/work-orders/${viewWO._id}/scope-items/${item._id}/sub-items/${subItem._id}/reject-variance`
        : `/work-orders/${viewWO._id}/scope-items/${item._id}/reject-variance`;
      await apiClient.patch(path, { reason: rejectVarianceReason.trim() });
      toast.success("Variance rejected");
      setRejectVarianceTarget(null);
      setRejectVarianceReason("");
      await reloadWODetail(viewWO._id);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to reject variance");
    } finally {
      setRejectingVariance(false);
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
  // ── Activity feed row click → jump straight to that work order ─────────────
  const openFromActivity = (ev: ActivityEvent) => {
    if (!ev.workOrderId) return;
    const projId = typeof ev.projectId === "object" ? ev.projectId?._id : ev.projectId;
    openWO(ev.workOrderId, projId);
  };

  const filteredActivity = useMemo(() => {
    const q = activitySearch.trim().toLowerCase();
    return activity.filter(ev => {
      const evProjId = typeof ev.projectId === "object" ? ev.projectId?._id : ev.projectId;
      if (selProjectId && evProjId !== selProjectId) return false;
      if (selDriId) {
        const dri = driList.find(d => d._id === selDriId);
        if (!dri || ev.performedByName !== dri.name) return false;
      }
      if (!inDateRange(ev.createdAt, dateFrom, dateTo)) return false;
      if (q) {
        const projName = typeof ev.projectId === "object" ? ev.projectId?.name : "";
        const haystack = [ev.workOrderNo, projName, ev.performedByName, ev.remarks, ev.metadata?.scopeItem]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [activity, selProjectId, selDriId, driList, dateFrom, dateTo, activitySearch]);

  const activityPager = usePagination(filteredActivity, 8);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="large" /></div>;
  }

  return (
    <div>
      <PageHeader
        icon={TrendingUp}
        title="Site Progress"
        subtitle="See what DRI has been logging, and raise bill requests for L1/L2 to approve on the Bill Approval page."
      />

      {/* ── KPI flashcards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-5">
        <NxStatCard label="Today's Progress Entries" value={kpis.progressEntriesToday} icon={FileText} />
        <NxStatCard label="Active DRIs Today" value={kpis.drisActiveToday} icon={Users} />
        <NxStatCard label="Active Projects Today" value={kpis.projectsActiveToday} icon={Building2} />
      </div>

      <>
          {/* ── Filters ── */}
          <FilterRow>
            <SearchFilter
              value={activitySearch} onChange={setActivitySearch}
              placeholder="Search by WO no, project, DRI, scope item, remarks…"
            />
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
          </FilterRow>

          {/* ── Recent DRI Progress ── */}
          <div className="mb-7">
            <div className="font-bold text-[15px] mb-2.5 text-[#1A1A2E] dark:text-[#F1F5F9]">Recent DRI Progress</div>
            {filteredActivity.length === 0 ? (
              <EmptyState title="No progress logged for these filters" />
            ) : (
              <>
                <Table className="min-w-[900px]">
                  <Thead>
                    <Tr>
                      <Th className="w-[14%]">When</Th>
                      <Th className="w-[24%]">Project / Work Order</Th>
                      <Th className="w-[16%]">DRI</Th>
                      <Th className="w-[22%]">Progress</Th>
                      <Th className="w-[24%]">Remarks</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {activityPager.pageItems.map(ev => {
                      const m = ev.metadata || {};
                      const level = m.plannedQty != null && m.completedQty != null ? varianceLevel(m.plannedQty, m.completedQty) : "none";
                      return (
                        <Tr key={ev._id}>
                          <Td className="whitespace-nowrap">{dayjs(ev.createdAt).format("DD MMM, hh:mm a")}</Td>
                          <Td className="whitespace-nowrap truncate">
                            <div className="font-semibold truncate">{typeof ev.projectId === "object" ? ev.projectId?.name : "—"}</div>
                            <button type="button" onClick={() => openFromActivity(ev)} className="text-primary text-xs hover:underline">
                              {ev.workOrderNo}
                            </button>
                          </Td>
                          <Td className="whitespace-nowrap truncate">{ev.performedByName || "—"}</Td>
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
                    <NxCard key={wo._id} padded={false} className="p-3.5 flex justify-between items-center flex-wrap gap-2.5">
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
                    </NxCard>
                  );
                })}
              </div>
            )}
          </div>
      </>

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
                <NxBtn color="primary" label="Generate Bill Request" disabled={checked.size === 0} loading={generating} onClick={handleGenerateBill} />
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
                        .catch(() => { });
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
                      <Th dense></Th>
                      <Th dense>Description</Th>
                      <Th dense>Unit</Th>
                      <Th dense>Planned</Th>
                      <Th dense>Executed</Th>
                      <Th dense>Billed</Th>
                      <Th dense>Unbilled</Th>
                      <Th dense>Variance</Th>
                      <Th dense></Th>
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
                      // Billed is a pure display sum of already-loaded
                      // lastBilledQty — mirrors the Unbilled aggregation
                      // pattern above, just applied to lastBilledQty instead.
                      const billed = hasSubItems
                        ? si.subItems!.reduce((s, sub) => s + (sub.lastBilledQty || 0), 0)
                        : (si.lastBilledQty || 0);
                      const level = varianceLevel(si.plannedQty, si.completedQty);
                      const blocked = itemHasUnapprovedVariance(si);
                      const canBill = unbilled > 0 && !blocked;
                      const entryCount = si.progressEntries?.length ?? 0;
                      const isExpanded = expandedEntries.has(si._id);
                      return (
                        <Fragment key={si._id}>
                          <Tr>
                            <Td dense>
                              {unbilled > 0 && (
                                <span title={blocked ? `Approve the variance${hasSubItems ? " on every particular" : ""} below first` : hasSubItems ? "Selects every particular below — uncheck this to pick specific particulars instead" : undefined}>
                                  <Checkbox checked={checked.has(si._id)} disabled={!canBill} onChange={() => toggleCheck(si._id)} />
                                </span>
                              )}
                            </Td>
                            <Td dense className="font-semibold">
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
                            <Td dense>{si.unit}</Td>
                            <Td dense className="font-mono">{fmtN(si.plannedQty)}</Td>
                            <Td dense className="font-mono">{fmtN(si.completedQty)}</Td>
                            <Td dense className="font-mono">{fmtN(billed)}</Td>
                            <Td dense className={`font-mono ${unbilled > 0 ? "text-primary font-bold" : "text-gray-400"}`}>{fmtN(unbilled)}</Td>
                            <Td dense>
                              {!hasSubItems && level !== "none" && (
                                <div className="flex items-center gap-1.5">
                                  <VarianceTag level={level} />
                                  {!si.varianceApproved && (
                                    <>
                                      {canApproveVariance && <Btn small outline loading={approvingVariance === si._id} label="Approve" onClick={() => handleApproveVariance(si)} />}
                                      {canRejectVariance && <Btn small outline color="red" label="Reject" onClick={() => setRejectVarianceTarget({ item: si })} />}
                                    </>
                                  )}
                                </div>
                              )}
                              {hasSubItems && itemHasUnapprovedVariance(si) && <UIBadge color="red" small>See particulars</UIBadge>}
                            </Td>
                            <Td dense></Td>
                          </Tr>
                          {!hasSubItems && isExpanded && (
                            <Tr>
                              <Td dense></Td>
                              <Td dense colSpan={8} className="!py-0 pb-2.5">
                                <ProgressEntryLog
                                  entries={si.progressEntries} completedQty={si.completedQty} lastBilledQty={si.lastBilledQty}
                                  canEdit={canEditProgress} canDelete={canDeleteProgress} canInvalidate={canInvalidateProgress}
                                  onEdit={e => openEditEntry(si, undefined, e)}
                                  onDelete={e => setDeleteEntryTarget({ item: si, entry: e })}
                                  onInvalidate={e => setInvalidateEntryTarget({ item: si, entry: e })}
                                />
                              </Td>
                            </Tr>
                          )}
                          {hasSubItems && si.subItems!.map(sub => {
                            const subUnbilled = Math.max(0, (sub.completedQty || 0) - (sub.lastBilledQty || 0));
                            const subLevel = varianceLevel(sub.plannedQty, sub.completedQty);
                            const subBlocked = subLevel !== "none" && !sub.varianceApproved;
                            // "Select all" (the parent checkbox) already covers every
                            // particular — this one lets the DRI pick just THIS
                            // particular instead, independent of whether some OTHER
                            // particular under the same item is still variance-blocked.
                            const parentSelected = checked.has(si._id);
                            const subCanBill = subUnbilled > 0 && !subBlocked;
                            const subEntryCount = sub.progressEntries?.length ?? 0;
                            const subExpanded = expandedEntries.has(sub._id);
                            return (
                              <Fragment key={sub._id}>
                                <Tr className="bg-gray-50/60 dark:bg-gray-800/20">
                                  <Td dense>
                                    {subUnbilled > 0 && (
                                      <span title={subBlocked ? "Approve the variance below first" : parentSelected ? "Already included via \"select all\" above" : undefined}>
                                        <Checkbox
                                          checked={parentSelected || checked.has(sub._id)}
                                          disabled={parentSelected || !subCanBill}
                                          onChange={() => toggleCheck(sub._id)}
                                        />
                                      </span>
                                    )}
                                  </Td>
                                  <Td dense className="pl-6 text-xs text-gray-500 dark:text-gray-400">
                                    {subEntryCount > 0 && (
                                      <button type="button" onClick={() => toggleEntries(sub._id)} className="mr-1.5 text-gray-400 align-middle">
                                        {subExpanded ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
                                      </button>
                                    )}
                                    {sub.description}
                                    {subEntryCount > 0 && <span className="text-[10px] text-gray-400 ml-1.5">({subEntryCount})</span>}
                                  </Td>
                                  <Td dense className="text-xs">{sub.unit}</Td>
                                  <Td dense className="font-mono text-xs">{fmtN(sub.plannedQty)}</Td>
                                  <Td dense className="font-mono text-xs">{fmtN(sub.completedQty)}</Td>
                                  <Td dense className="font-mono text-xs">{fmtN(sub.lastBilledQty || 0)}</Td>
                                  <Td dense className={`font-mono text-xs ${subUnbilled > 0 ? "text-primary font-bold" : "text-gray-400"}`}>{fmtN(subUnbilled)}</Td>
                                  <Td dense>
                                    {subLevel !== "none" && (
                                      <div className="flex items-center gap-1.5">
                                        <VarianceTag level={subLevel} />
                                        {!sub.varianceApproved && (
                                          <>
                                            {canApproveVariance && <Btn small outline loading={approvingVariance === sub._id} label="Approve" onClick={() => handleApproveVariance(si, sub)} />}
                                            {canRejectVariance && <Btn small outline color="red" label="Reject" onClick={() => setRejectVarianceTarget({ item: si, subItem: sub })} />}
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </Td>
                                  <Td dense></Td>
                                </Tr>
                                {subExpanded && (
                                  <Tr className="bg-gray-50/60 dark:bg-gray-800/20">
                                    <Td dense></Td><Td dense></Td>
                                    <Td dense colSpan={7} className="pl-6">
                                      <ProgressEntryLog
                                        entries={sub.progressEntries} completedQty={sub.completedQty} lastBilledQty={sub.lastBilledQty}
                                        canEdit={canEditProgress} canDelete={canDeleteProgress} canInvalidate={canInvalidateProgress}
                                        onEdit={e => openEditEntry(si, sub, e)}
                                        onDelete={e => setDeleteEntryTarget({ item: si, subItem: sub, entry: e })}
                                        onInvalidate={e => setInvalidateEntryTarget({ item: si, subItem: sub, entry: e })}
                                      />
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

      {rejectVarianceTarget && (
        <Modal
          icon={XCircle}
          title="Reject Progress Variance"
          onClose={() => { setRejectVarianceTarget(null); setRejectVarianceReason(""); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setRejectVarianceTarget(null); setRejectVarianceReason(""); }} />
              <Btn color="red" label="Confirm Rejection" loading={rejectingVariance} disabled={!rejectVarianceReason.trim()} onClick={handleRejectVariance} />
            </div>
          }
        >
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Rejecting invalidates the unbilled over-plan progress on "{rejectVarianceTarget.subItem?.description || rejectVarianceTarget.item.description}" — the DRI will need to re-check and re-log it.
          </p>
          <Field
            textarea label="Reason for rejection" placeholder="Why is this progress being rejected?"
            value={rejectVarianceReason} onChange={(e) => setRejectVarianceReason(e.target.value)}
          />
        </Modal>
      )}

      {editEntryTarget && (
        <Modal
          icon={Pin}
          title="Edit Progress Entry"
          onClose={() => setEditEntryTarget(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => setEditEntryTarget(null)} />
              <Btn color="primary" label="Save" loading={editEntrySaving} onClick={handleSaveEditEntry} />
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field type="number" label="Qty Added" value={editEntryForm.qtyAdded} onChange={e => setEditEntryForm(f => ({ ...f, qtyAdded: e.target.value }))} />
              <Field type="date" label="Date" value={editEntryForm.date} onChange={e => setEditEntryForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tower" value={editEntryForm.tower} onChange={e => setEditEntryForm(f => ({ ...f, tower: e.target.value }))} />
              <Field label="Floor" value={editEntryForm.floor} onChange={e => setEditEntryForm(f => ({ ...f, floor: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Flat No" value={editEntryForm.flatNo} onChange={e => setEditEntryForm(f => ({ ...f, flatNo: e.target.value }))} />
              <Field label="Plot No" value={editEntryForm.plotNo} onChange={e => setEditEntryForm(f => ({ ...f, plotNo: e.target.value }))} />
            </div>
            <Field label="Location Note" value={editEntryForm.locationNote} onChange={e => setEditEntryForm(f => ({ ...f, locationNote: e.target.value }))} />
            <Field textarea label="Remarks" value={editEntryForm.remarks} onChange={e => setEditEntryForm(f => ({ ...f, remarks: e.target.value }))} />
          </div>
        </Modal>
      )}

      {deleteEntryTarget && (
        <ConfirmModal
          title="Delete progress entry?"
          message="This will be deleted permanently and cannot be undone."
          confirmLabel="Delete"
          danger
          loading={deletingEntry}
          onConfirm={handleDeleteEntryConfirm}
          onCancel={() => setDeleteEntryTarget(null)}
        />
      )}

      {invalidateEntryTarget && (
        <Modal
          icon={XCircle}
          title="Invalidate Progress Entry"
          onClose={() => { setInvalidateEntryTarget(null); setInvalidateReason(""); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setInvalidateEntryTarget(null); setInvalidateReason(""); }} />
              <Btn color="red" label="Confirm Invalidation" loading={invalidatingEntry} disabled={!invalidateReason.trim()} onClick={handleInvalidateEntryConfirm} />
            </div>
          }
        >
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            This entry is attached to a bill, so it can't be edited or deleted directly — invalidating it keeps it in the log (struck through) without counting toward progress anymore.
          </p>
          <Field
            textarea label="Reason" placeholder="Why is this entry being invalidated?"
            value={invalidateReason} onChange={(e) => setInvalidateReason(e.target.value)}
          />
        </Modal>
      )}
    </div>
  );
}
