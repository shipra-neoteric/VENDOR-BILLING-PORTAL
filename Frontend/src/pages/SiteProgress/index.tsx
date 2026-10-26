import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  FileText, Users, Building2, AlertTriangle, Pin, ChevronDown, ChevronRight, TrendingUp,
} from "lucide-react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import { DropdownSelectFilter, FilterRow, SearchFilter } from "../../ui/Filters";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import WorkflowInstanceStepper from "../../components/WorkflowInstanceStepper";
import PlannedQtyCell from "../../components/PlannedQtyCell";
import type { WorkflowInstance } from "../../types/Workflow";
import UIBadge from "../../ui/Badge";
import Btn from "../../ui/Btn";
import EmptyState from "../../ui/EmptyState";
import Spinner from "../../ui/Spinner";
import PageHeader from "../../ui/PageHeader";
import Modal from "../../ui/Modal";
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
  plannedQty: number; originalPlannedQty?: number | null; completedQty: number; lastBilledQty: number;
  status?: string; varianceApproved?: boolean;
  progressEntries?: ProgressEntryDetail[];
}
interface ScopeItemDetail {
  _id: string; description: string; remarks?: string; unit: string;
  plannedQty: number; originalPlannedQty?: number | null; completedQty: number; lastBilledQty: number;
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
  scopeItemId?: string; subItemId?: string; description: string; unit: string; billedQty: number;
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

// Compact, read-only log of every raw dated progress entry behind a scope
// item — the aggregated planned/done/unbilled row above can't show this;
// the data already exists on the WorkOrder document, this just surfaces it.
function ProgressEntryLog({ entries, picker }: {
  entries?: ProgressEntryDetail[];
  // When given, each still-unbilled entry gets a checkbox so just those can be billed.
  picker?: { picked: Set<string>; disabled: boolean; onToggle: (entryId: string) => void };
}) {
  if (!entries || entries.length === 0) {
    return <div className="px-2.5 py-2 text-xs text-gray-400">No individual entries recorded.</div>;
  }
  const sorted = [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="bg-gray-100 dark:bg-gray-800/40">
          {[...(picker ? [""] : []), "Date", "Qty Added", "Location", "Remarks", ""].map((h, i) => (
            <th key={i} className="px-2 py-1 text-left text-[10px] text-gray-500 dark:text-gray-400 uppercase">{h}</th>
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
          return (
            <tr
              key={e._id}
              className="border-b border-gray-200 dark:border-gray-700/40"
              style={{ textDecoration: e.invalidated?.done ? "line-through" : undefined, opacity: e.invalidated?.done ? 0.55 : 1 }}
            >
              {picker && (
                <td className="px-2 py-1 w-6">
                  {!e.invalidated?.done && !e.billedInRequestId && (
                    <Checkbox checked={picker.picked.has(e._id)} disabled={picker.disabled} onChange={() => picker.onToggle(e._id)} />
                  )}
                </td>
              )}
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

// ── Main component ─────────────────────────────────────────────────────────────
// embeddedEditBRId: render only the "Edit Bill Request" drawer for that
// request (used by the Bill Requests page, so Edit opens right where it was
// clicked instead of navigating here). onEmbeddedClose(true) = it was saved.
export default function SiteProgress({ embeddedEditBRId, onEmbeddedClose }: {
  embeddedEditBRId?: string;
  onEmbeddedClose?: (saved: boolean) => void;
} = {}) {
  const embedded = !!embeddedEditBRId;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [allWOs, setAllWOs] = useState<WORow[]>([]);
  const [billReqs, setBillReqs] = useState<BillRequestRow[]>([]);
  const [driList, setDriList] = useState<DriOption[]>([]);
  const [kpis, setKpis] = useState({ progressEntriesToday: 0, drisActiveToday: 0, projectsActiveToday: 0 });

  const [selProjectId, setSelProjectId] = useState<string | undefined>(undefined);
  const [selDriId, setSelDriId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
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
    if (embedded) {
      apiClient.get("/bill-requests")
        .then((r) => setBillReqs(r.data.billRequests ?? []))
        .catch(() => toast.error("Failed to load the bill request"))
        .finally(() => setLoading(false));
      return;
    }
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
  // Individually picked progress entries (entry-wise billing) — an item with
  // any picked entry bills only those; otherwise its whole unbilled qty.
  const [pickedEntries, setPickedEntries] = useState<Set<string>>(new Set());
  // Hand-picked particulars (sub items) — an item with any picked bills only those.
  const [pickedSubs, setPickedSubs] = useState<Set<string>>(new Set());
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [slaInstance, setSlaInstance] = useState<WorkflowInstance | null>(null);
  const [billRemarks, setBillRemarks] = useState("");
  const [generating, setGenerating] = useState(false);
  const [approvingVariance, setApprovingVariance] = useState<string | null>(null);

  // Edit mode (opened from the Bill Requests list's Edit icon): the request
  // being re-picked. Its own billed qty / marked entries are shown as
  // unbilled again so the same picker works exactly like at create time.
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editBR, setEditBR] = useState<BillRequestRow | null>(null);
  const baseWO = viewWOId ? woDetails.get(viewWOId) ?? null : null;
  const viewWO = useMemo(() => {
    if (!baseWO || !editBR || editBR.workOrderId !== baseWO._id) return baseWO;
    const wo: WODetail = JSON.parse(JSON.stringify(baseWO));
    const release = (t: { lastBilledQty: number; progressEntries?: ProgressEntryDetail[] }, qty: number) => {
      t.lastBilledQty = Math.max(0, (t.lastBilledQty || 0) - qty);
    };
    for (const it of editBR.items) {
      const si = wo.scopeItems.find(x => x._id === it.scopeItemId);
      if (!si) continue;
      const t = it.subItemId ? si.subItems?.find(x => x._id === it.subItemId) : si;
      if (t) release(t, it.billedQty);
    }
    const unmark = (arr?: ProgressEntryDetail[]) => (arr || []).forEach(e => { if (e.billedInRequestId === editBR._id) e.billedInRequestId = null; });
    for (const si of wo.scopeItems) { unmark(si.progressEntries); (si.subItems || []).forEach(sub => unmark(sub.progressEntries)); }
    // Parent rollup of lastBilledQty for items with particulars.
    for (const si of wo.scopeItems) if (si.subItems?.length) si.lastBilledQty = si.subItems.reduce((a, x) => a + (x.lastBilledQty || 0), 0);
    return wo;
  }, [baseWO, editBR]);

  // ?editBR=<id> — open that pending request's work order in edit mode.
  const editBRId = embeddedEditBRId ?? searchParams.get("editBR");
  useEffect(() => {
    if (!editBRId || editBR || !billReqs.length) return;
    const br = billReqs.find(b => b._id === editBRId);
    if (!br || br.status !== "pending" || !br.workOrderId) { toast.error("This bill request can no longer be edited"); if (embedded) onEmbeddedClose?.(false); else setSearchParams({}); return; }
    setEditBR(br);
    openWO(br.workOrderId, br.projectId);
    setBillRemarks(br.remarks || "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editBRId, billReqs]);
  // Once the (adjusted) work order is ready, tick what the request currently bills.
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!editBR || !viewWO || viewWO._id !== editBR.workOrderId || prefilledFor.current === editBR._id) return;
    prefilledFor.current = editBR._id;
    const nextChecked = new Set<string>(); const nextEntries = new Set<string>(); const nextSubs = new Set<string>();
    const unbilledOf = (t: { completedQty: number; lastBilledQty: number }) => Math.max(0, (t.completedQty || 0) - (t.lastBilledQty || 0));
    for (const si of viewWO.scopeItems) {
      const mine = editBR.items.filter(i => i.scopeItemId === si._id);
      if (!mine.length) continue;
      nextChecked.add(si._id);
      const targets = si.subItems?.length ? si.subItems : [si];
      const inBR = (t: { _id: string }) => mine.some(i => (i.subItemId || "") === (t === si ? "" : t._id));
      const allCovered = targets.filter(t => unbilledOf(t) > 0).every(inBR);
      if (si.subItems?.length && !allCovered) targets.filter(inBR).forEach(t => nextSubs.add(t._id));
      for (const t of targets.filter(inBR)) {
        const live = (t.progressEntries || []).filter(e => !e.invalidated?.done && !e.billedInRequestId);
        const markedIds = new Set<string>(
          (t === si ? baseWO?.scopeItems.find(x => x._id === si._id)?.progressEntries
            : baseWO?.scopeItems.find(x => x._id === si._id)?.subItems?.find(x => x._id === t._id)?.progressEntries || [])
            ?.filter(e => e.billedInRequestId === editBR._id).map(e => e._id) ?? []);
        if (markedIds.size > 0 && live.some(e => !markedIds.has(e._id))) markedIds.forEach(id => nextEntries.add(id));
      }
    }
    setChecked(nextChecked); setPickedEntries(nextEntries); setPickedSubs(nextSubs);
  }, [editBR, viewWO, baseWO]);
  const closeEdit = (saved = false) => {
    setEditBR(null); prefilledFor.current = null;
    if (embedded) onEmbeddedClose?.(saved); else setSearchParams({});
  };

  const openWO = async (woId: string, projectIdHint?: string) => {
    if (projectIdHint && projectIdHint !== selProjectId) setSelProjectId(projectIdHint);
    setViewWOId(woId);
    setChecked(new Set());
    setPickedEntries(new Set()); setPickedSubs(new Set());
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

  const entryIdsOf = (si: ScopeItemDetail) => [
    ...(si.progressEntries || []).map(e => e._id),
    ...(si.subItems || []).flatMap(sub => (sub.progressEntries || []).map(e => e._id)),
  ];
  const toggleEntry = (si: ScopeItemDetail, entryId: string, subId?: string) => {
    const next = new Set(pickedEntries);
    if (next.has(entryId)) next.delete(entryId); else next.add(entryId);
    setPickedEntries(next);
    if (subId) {
      const sub = si.subItems?.find(x => x._id === subId);
      const subStill = (sub?.progressEntries || []).some(e => next.has(e._id));
      setPickedSubs(prev => { const n = new Set(prev); if (subStill) n.add(subId); else n.delete(subId); return n; });
    }
    const stillPicked = entryIdsOf(si).some(id => next.has(id)) || (!!subId && next.has(entryId)) || (si.subItems || []).some(x => pickedSubs.has(x._id) && x._id !== subId);
    setChecked(prev => {
      const c = new Set(prev);
      if (stillPicked) c.add(si._id); else c.delete(si._id);
      return c;
    });
  };
  const toggleSub = (si: ScopeItemDetail, sub: SubItemDetail) => {
    const subs = new Set(pickedSubs);
    if (subs.has(sub._id)) subs.delete(sub._id); else subs.add(sub._id);
    setPickedSubs(subs);
    // Picking the whole particular supersedes any entry-level picks inside it.
    const own = new Set((sub.progressEntries || []).map(e => e._id));
    setPickedEntries(prev => new Set([...prev].filter(id => !own.has(id))));
    const any = (si.subItems || []).some(x => subs.has(x._id));
    setChecked(prev => { const c = new Set(prev); if (any) c.add(si._id); else c.delete(si._id); return c; });
  };
  const toggleCheck = (itemId: string, si?: ScopeItemDetail) => {
    // Ticking the item itself = bill all of it, so drop any hand-picked particulars/entries.
    if (si && (entryIdsOf(si).some(id => pickedEntries.has(id)) || (si.subItems || []).some(x => pickedSubs.has(x._id)))) {
      const ids = new Set(entryIdsOf(si));
      setPickedEntries(prev => new Set([...prev].filter(id => !ids.has(id))));
      const subIds = new Set((si.subItems || []).map(x => x._id));
      setPickedSubs(prev => new Set([...prev].filter(id => !subIds.has(id))));
      return;
    }
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
      const body = {
        scopeItemIds: Array.from(checked),
        entryIds: Array.from(pickedEntries),
        subItemIds: Array.from(pickedSubs),
        remarks: billRemarks,
      };
      const res = editBR
        ? await apiClient.put(`/bill-requests/${editBR._id}`, body)
        : await apiClient.post("/bill-requests", { workOrderId: viewWO._id, ...body });
      toast.success(res.data?.message || "Bill request submitted");
      const wasEdit = !!editBR;
      const woId = viewWO._id;
      setViewWOId(null);
      setChecked(new Set());
      setPickedEntries(new Set()); setPickedSubs(new Set());
      setBillRemarks("");
      if (wasEdit) { closeEdit(true); if (!embedded) { reloadWODetail(woId).catch(() => {}); navigate("/bill-requests"); } }
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || (editBR ? "Failed to update bill request" : "Failed to generate bill request"));
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

  const filteredActivity = useMemo(() => activity.filter(ev => {
    const evProjId = typeof ev.projectId === "object" ? ev.projectId?._id : ev.projectId;
    if (selProjectId && evProjId !== selProjectId) return false;
    if (selDriId) {
      const dri = driList.find(d => d._id === selDriId);
      if (!dri || ev.performedByName !== dri.name) return false;
    }
    if (!inDateRange(ev.createdAt, dateFrom, dateTo)) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      const m = ev.metadata || {};
      const hay = [typeof ev.projectId === "object" ? ev.projectId?.name : "", ev.workOrderNo, ev.performedByName, m.scopeItem, ev.remarks]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [activity, selProjectId, selDriId, driList, dateFrom, dateTo, search]);

  const activityPager = usePagination(filteredActivity, 8);

  if (loading) {
    return embedded ? null : <div className="flex justify-center py-20"><Spinner size="large" /></div>;
  }

  return (
    <div>
      {!embedded && <>
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
            <SearchFilter value={search} onChange={setSearch} placeholder="Search by project, work order, DRI, progress…" />
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
      </>}

      {/* ── Work order detail + bill-generation modal ── */}
      {viewWOId && (
        <Modal
          icon={FileText}
          title={editBR ? `Edit Bill Request ${editBR.reqNo} — ${viewWO?.workOrderNo ?? ""}` : `Work Order — ${viewWO?.workOrderNo ?? ""}`}
          extraWide
          onClose={() => { setViewWOId(null); setChecked(new Set()); setPickedEntries(new Set()); setPickedSubs(new Set()); if (editBR) closeEdit(false); }}
          footer={
            <div className="flex justify-between items-center w-full">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {checked.size > 0 ? `${checked.size} item${checked.size !== 1 ? "s" : ""} selected` : "Select items below to bill"}
              </span>
              <div className="flex gap-2">
                <Btn outline label="Close" onClick={() => { setViewWOId(null); if (editBR) closeEdit(false); }} />
                <NxBtn color="primary" label={editBR ? "Save Changes" : "Generate Bill Request"} disabled={checked.size === 0} loading={generating} onClick={handleGenerateBill} />
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
                                <span title={blocked ? `Approve the variance${hasSubItems ? " on every particular" : ""} below first` : undefined}>
                                  <Checkbox checked={checked.has(si._id) && !entryIdsOf(si).some(id => pickedEntries.has(id)) && !(si.subItems || []).some(x => pickedSubs.has(x._id))} disabled={!canBill} onChange={() => toggleCheck(si._id, si)} />
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
                            <Td dense className="font-mono"><PlannedQtyCell planned={si.plannedQty} original={si.originalPlannedQty} format={fmtN} /></Td>
                            <Td dense className="font-mono">{fmtN(si.completedQty)}</Td>
                            <Td dense className="font-mono">{fmtN(billed)}</Td>
                            <Td dense className={`font-mono ${unbilled > 0 ? "text-primary font-bold" : "text-gray-400"}`}>{fmtN(unbilled)}</Td>
                            <Td dense>
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
                            <Td dense></Td>
                          </Tr>
                          {!hasSubItems && isExpanded && (
                            <Tr>
                              <Td dense></Td>
                              <Td dense colSpan={8} className="!py-0 pb-2.5">
                                <ProgressEntryLog entries={si.progressEntries} picker={unbilled > 0 ? { picked: pickedEntries, disabled: blocked, onToggle: id => toggleEntry(si, id) } : undefined} />
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
                                  <Td dense>
                                    {subUnbilled > 0 && (
                                      <Checkbox
                                        checked={pickedSubs.has(sub._id) && !(sub.progressEntries || []).some(e => pickedEntries.has(e._id))}
                                        disabled={varianceLevel(sub.plannedQty, sub.completedQty) !== "none" && !sub.varianceApproved}
                                        onChange={() => toggleSub(si, sub)}
                                      />
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
                                  <Td dense className="font-mono text-xs"><PlannedQtyCell planned={sub.plannedQty} original={sub.originalPlannedQty} format={fmtN} /></Td>
                                  <Td dense className="font-mono text-xs">{fmtN(sub.completedQty)}</Td>
                                  <Td dense className="font-mono text-xs">{fmtN(sub.lastBilledQty || 0)}</Td>
                                  <Td dense className={`font-mono text-xs ${subUnbilled > 0 ? "text-primary font-bold" : "text-gray-400"}`}>{fmtN(subUnbilled)}</Td>
                                  <Td dense>
                                    {subLevel !== "none" && (
                                      <div className="flex items-center gap-1.5">
                                        <VarianceTag level={subLevel} />
                                        {!sub.varianceApproved && (
                                          <Btn small outline loading={approvingVariance === sub._id} label="Approve" onClick={() => handleApproveVariance(si, sub)} />
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
                                      <ProgressEntryLog entries={sub.progressEntries} picker={subUnbilled > 0 ? { picked: pickedEntries, disabled: blocked, onToggle: id => toggleEntry(si, id, sub._id) } : undefined} />
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
    </div>
  );
}
