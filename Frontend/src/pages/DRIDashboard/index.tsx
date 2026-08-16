import { Fragment, useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import {
  HardHat, Users, Briefcase, Activity, CheckCircle2, Clock, Building2, FileText,
  Receipt, Ruler, Pencil, Ban, History, Send,
} from "lucide-react";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import { useFormErrors } from "../../hooks/useFormErrors";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import SField from "../../ui/SField";
import Field from "../../ui/Field";
import { DatePicker } from "../../ui/DatePicker";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import StatCard from "../../ui/StatCard";
import Badge from "../../ui/Badge";
import Checkbox from "../../ui/Checkbox";
import Spinner from "../../ui/Spinner";
import EmptyState from "../../ui/EmptyState";
import Alert from "../../ui/Alert";
import { Descriptions, DescItem } from "../../ui/Descriptions";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
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

interface ProgressEntry {
  _id: string; date: string; qtyAdded: number; remarks?: string;
  tower?: string; floor?: string; flatNo?: string; plotNo?: string; locationNote?: string;
  billedInRequestId?: string | null;
  enteredBy?: { _id: string; name: string } | string | null;
  invalidated?: { done: boolean; by?: { _id: string; name: string } | string; at?: string; reason?: string };
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
  progressEntries?: ProgressEntry[];
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
  progressEntries?: ProgressEntry[];
}

// Entries flattened across an item's (or its particulars') progressEntries,
// enriched with just enough context to render/edit/invalidate/delete them —
// scopeId packs both the scope item id and its parent WO id (needed since
// the edit/delete/invalidate endpoints are nested under both).
type EntryRow = ProgressEntry & {
  unit: string; description: string; scopeId: string;
  scopePlanned: number; scopeCompleted: number; scopeLastBilled: number;
};

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
const STATUS_BADGE: Record<string, "gray" | "blue" | "orange" | "green"> = {
  draft: "gray", issued: "blue", "in-progress": "orange", completed: "green",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", issued: "Issued", "in-progress": "In Progress", completed: "Completed",
};
const BR_BADGE: Record<string, "amber" | "green" | "red"> = {
  pending: "amber", approved: "green", rejected: "red",
};
const fmtN = (n: number) => (n ?? 0).toLocaleString("en-IN");
const pctOf = (c: number, p: number) => p > 0 ? Math.min(100, Math.round(((c ?? 0) / p) * 100)) : 0;

function personName(p?: { _id: string; name: string } | string | null): string {
  if (!p) return "";
  return typeof p === "string" ? "" : p.name;
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

// Renders Edit/Del/Invalidate for one entry — same rules as Work Progress:
// invalidated entries become read-only history (reason shown on hover);
// entries attached to a bill can only be invalidated (not edited/deleted)
// until that bill is rejected. Entries that would drop completedQty below
// what's already been billed can't be deleted either — rather than antd's
// old "Popconfirm with a hidden OK button" trick for that case, the delete
// affordance simply isn't rendered when it isn't allowed.
function EntryActions({
  e, deleting, onEdit, onDelete, onInvalidate,
}: {
  e: EntryRow; deleting: boolean;
  onEdit: () => void; onDelete: () => void; onInvalidate: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const linkCls = "text-[11px] font-semibold hover:underline disabled:opacity-50 disabled:no-underline shrink-0";

  if (e.invalidated?.done) {
    const who = personName(e.invalidated.by);
    const title = `Invalidated${who ? ` by ${who}` : ""}${e.invalidated.at ? ` on ${dayjs(e.invalidated.at).format("DD MMM YYYY")}` : ""}${e.invalidated.reason ? ` — ${e.invalidated.reason}` : ""}`;
    return (
      <span title={title}>
        <Badge color="red" small>Invalidated</Badge>
      </span>
    );
  }
  if (e.billedInRequestId) {
    return (
      <button type="button" className={`${linkCls} text-purple-600 dark:text-purple-400`} onClick={onInvalidate}>
        Invalidate
      </button>
    );
  }

  const deletable = e.scopeCompleted - e.qtyAdded >= e.scopeLastBilled;
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={`${linkCls} text-blue-600 dark:text-blue-400`} onClick={onEdit}>Edit</button>
      {deletable ? (
        <button
          type="button" disabled={deleting}
          className={`${linkCls} text-red-600 dark:text-red-400`}
          onClick={() => setConfirming(true)}
        >
          {deleting ? "Deleting…" : "Del"}
        </button>
      ) : (
        <span className="text-[11px] text-gray-300 dark:text-gray-600" title="Entry is billed and cannot be deleted.">Del</span>
      )}
      {confirming && (
        <ConfirmModal
          title="Delete entry?"
          message="This will be deleted permanently."
          confirmLabel="Delete"
          danger
          onConfirm={() => { setConfirming(false); onDelete(); }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function getProjId(wo: WORow): string | undefined {
  if (!wo.projectId) return undefined;
  if (typeof wo.projectId === "string") return wo.projectId;
  return wo.projectId._id;
}

// ── Pill helper ────────────────────────────────────────────────────────────────
function CountPill({ n, color }: { n: number; color: "blue" | "green" | "amber" }) {
  if (n === 0) return <span className="text-gray-400 text-xs">—</span>;
  return <Badge color={color}>{n}</Badge>;
}

// ── Location fields (Add/Edit Progress modals) ────────────────────────────────
type LocationField = "tower" | "floor" | "flatNo" | "plotNo" | "locationNote";

function LocationFields({
  pt, tower, floor, flatNo, plotNo, locationNote, onChange,
}: {
  pt: string; tower: string; floor: string; flatNo: string; plotNo: string; locationNote: string;
  onChange: (field: LocationField, value: string) => void;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/40 rounded-lg p-3 mb-3.5">
      <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2.5">📍 Location (optional)</div>
      {pt === "apartment" ? (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Tower" placeholder="e.g. A, T1" value={tower} onChange={(e) => onChange("tower", e.target.value)} />
          <Field label="Floor" placeholder="e.g. G, 1, 5" value={floor} onChange={(e) => onChange("floor", e.target.value)} />
          <Field label="Flat No" placeholder="e.g. 101" value={flatNo} onChange={(e) => onChange("flatNo", e.target.value)} />
        </div>
      ) : (
        <Field label="Plot No" placeholder="e.g. Plot-42" value={plotNo} onChange={(e) => onChange("plotNo", e.target.value)} />
      )}
      <div className="mt-2">
        <Field label="Note" placeholder="Additional location details…" value={locationNote} onChange={(e) => onChange("locationNote", e.target.value)} />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
type PageView = "overview" | "dri-projects" | "dri-detail";

interface ProgFormValues {
  date: string; tower: string; floor: string; flatNo: string; plotNo: string;
  locationNote: string; qtyAdded: string; remarks: string; plannedQty: string;
}
const emptyProgForm: ProgFormValues = {
  date: "", tower: "", floor: "", flatNo: "", plotNo: "", locationNote: "", qtyAdded: "", remarks: "", plannedQty: "",
};

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
  const [progFormValues, setProgFormValues] = useState<ProgFormValues>(emptyProgForm);
  const progErrors = useFormErrors<"date" | "qtyAdded" | "plannedQty">();
  const [progSaving,  setProgSaving]  = useState(false);

  // Edit entry modal (owner/edit-permission only) — same parity as Work Progress.
  // editProjectType is tracked separately from progProjectType (which follows
  // the Add-Progress target) so the location-field layout always matches the
  // entry actually being edited, not whatever WO Add Progress was last opened for.
  const [editModal, setEditModal] = useState(false);
  const [editEntry, setEditEntry] = useState<EntryRow | null>(null);
  const [editProjectType, setEditProjectType] = useState<"apartment" | "plot">("apartment");
  const [editFormValues, setEditFormValues] = useState<ProgFormValues>(emptyProgForm);
  const editErrors = useFormErrors<"qtyAdded">();
  const [deleting,  setDeleting]  = useState<string | null>(null);

  // Invalidate entry modal — for entries a rejected bill was made from
  const [invalidateModal, setInvalidateModal] = useState(false);
  const [invalidateEntry, setInvalidateEntry] = useState<EntryRow | null>(null);
  const [invalidateWOId,  setInvalidateWOId]  = useState<string | null>(null);
  const [invalidateReason, setInvalidateReason] = useState("");
  const invalidateErrors = useFormErrors<"reason">();
  const [invalidating,    setInvalidating]    = useState(false);

  // View all entries modal
  const [allEntriesWOId, setAllEntriesWOId] = useState<string | null>(null);

  // Generate-bill modal (owner/edit-permission only)
  const [billModal,     setBillModal]     = useState(false);
  const [billWOIds,     setBillWOIds]     = useState<Set<string>>(new Set());
  const [billRemarks,   setBillRemarks]   = useState("");
  const [billGenerating,setBillGenerating]= useState(false);

  // ── Initial load ─────────────────────────────────────────────────────────────
  // Each fetch settles independently — one endpoint failing must not blank out
  // data the other calls already fetched successfully.
  useEffect(() => {
    setLoading(true);
    const calls = [
      apiClient.get("/auth/users?role=site-dri")
        .then(r => setAllDRIs(r.data.users ?? [])),
      apiClient.get("/work-orders")
        .then(r => setAllWOs(r.data.workOrders ?? [])),
      apiClient.get("/bill-requests")
        .then(r => setAllBills(r.data.billRequests ?? [])),
    ];
    Promise.allSettled(calls).finally(() => setLoading(false));
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

  // Mirrors the backend's expandBillableCandidates — billing (and this
  // preview of it) operates per particular when an item has them, never
  // against the parent's own rolled-up completedQty, which is only ever a
  // display average, not a billable quantity (see recomputeParentFromSubItems).
  const getPendingBillableRows = (scopeItems: ScopeItemDetail[]) => {
    const rows: { key: string; description: string; unit: string; lastBilledQty: number; billedQty: number }[] = [];
    for (const si of scopeItems) {
      if (si.subItems && si.subItems.length > 0) {
        for (const sub of si.subItems) {
          const billedQty = Math.max(0, (sub.completedQty || 0) - (sub.lastBilledQty || 0));
          if (billedQty > 0) {
            rows.push({ key: sub._id, description: `${si.description} — ${sub.description}`, unit: sub.unit || si.unit, lastBilledQty: sub.lastBilledQty || 0, billedQty });
          }
        }
      } else {
        const billedQty = Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0));
        if (billedQty > 0) {
          rows.push({ key: si._id, description: si.description, unit: si.unit, lastBilledQty: si.lastBilledQty || 0, billedQty });
        }
      }
    }
    return rows;
  };

  const reloadWODetail = async (woId: string) => {
    const r = await apiClient.get(`/work-orders/${woId}`);
    setWoDetails(prev => new Map(prev).set(woId, r.data.workOrder));
  };

  // Work orders in the current project with unbilled progress and no bill
  // request already pending against them — eligible for a new bill request.
  const billableWODetails = useMemo(
    () => Array.from(woDetails.values()).filter(d =>
      getPendingBillableRows(d.scopeItems).length > 0 &&
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
    progErrors.clearAll();
    setProgFormValues({ ...emptyProgForm, date: dayjs().format("YYYY-MM-DD") });
    setProgModal(true);
  };

  const handleAddProgress = async () => {
    if (!progTarget) return;
    progErrors.clearAll();
    let hasError = false;
    if (!progFormValues.date) { progErrors.setError("date", "Select date"); hasError = true; }
    const qty = Number(progFormValues.qtyAdded);
    if (!progFormValues.qtyAdded || !(qty >= 0.01)) {
      progErrors.setError("qtyAdded", "Enter a valid quantity (e.g. 13.67)");
      hasError = true;
    }
    let plannedQty: number | undefined;
    if (progFormValues.plannedQty) {
      plannedQty = Number(progFormValues.plannedQty);
      if (!(plannedQty >= 0.00001)) { progErrors.setError("plannedQty", "Enter a valid quantity"); hasError = true; }
    }
    if (hasError) return;

    const target = progTarget.subItem ?? progTarget.item;
    const path = progTarget.subItem
      ? `/work-orders/${progTarget.woId}/scope-items/${progTarget.item._id}/sub-items/${progTarget.subItem._id}/progress`
      : `/work-orders/${progTarget.woId}/scope-items/${progTarget.item._id}/progress`;
    setProgSaving(true);
    try {
      await apiClient.post(path, {
        date: progFormValues.date || dayjs().format("YYYY-MM-DD"),
        qtyAdded: qty,
        remarks: progFormValues.remarks || "",
        tower: progFormValues.tower || "",
        floor: progFormValues.floor || "",
        flatNo: progFormValues.flatNo || "",
        plotNo: progFormValues.plotNo || "",
        locationNote: progFormValues.locationNote || "",
        ...(plannedQty ? { plannedQty } : {}),
      });
      toast.success(`+${fmtN(qty)} ${target.unit} recorded`);
      setProgModal(false);
      setProgFormValues(emptyProgForm);
      await reloadWODetail(progTarget.woId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to add measurement");
    } finally {
      setProgSaving(false);
    }
  };

  const handleEditEntry = async () => {
    if (!editEntry) return;
    editErrors.clearAll();
    const qty = Number(editFormValues.qtyAdded);
    if (!editFormValues.qtyAdded || !(qty >= 0.01)) { editErrors.setError("qtyAdded", "Required"); return; }
    const [scopeItemId, woId] = editEntry.scopeId.split("||");
    setProgSaving(true);
    try {
      await apiClient.patch(
        `/work-orders/${woId}/scope-items/${scopeItemId}/progress/${editEntry._id}`,
        {
          qtyAdded: qty,
          date: editFormValues.date || undefined,
          remarks: editFormValues.remarks || "",
          tower: editFormValues.tower || "",
          floor: editFormValues.floor || "",
          flatNo: editFormValues.flatNo || "",
          plotNo: editFormValues.plotNo || "",
          locationNote: editFormValues.locationNote || "",
        }
      );
      toast.success("Entry updated");
      setEditModal(false); setEditFormValues(emptyProgForm);
      await reloadWODetail(woId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to update entry");
    } finally {
      setProgSaving(false);
    }
  };

  const handleDeleteEntry = async (entry: EntryRow, woId: string) => {
    setDeleting(entry._id);
    try {
      await apiClient.delete(`/work-orders/${woId}/scope-items/${entry.scopeId.split("||")[0]}/progress/${entry._id}`);
      toast.success("Entry deleted");
      await reloadWODetail(woId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to delete entry");
    } finally {
      setDeleting(null);
    }
  };

  const handleInvalidateEntry = async () => {
    if (!invalidateEntry || !invalidateWOId) return;
    invalidateErrors.clearAll();
    if (!invalidateReason.trim()) { invalidateErrors.setError("reason", "Explain why this entry is wrong"); return; }
    setInvalidating(true);
    try {
      await apiClient.patch(
        `/work-orders/${invalidateWOId}/scope-items/${invalidateEntry.scopeId.split("||")[0]}/progress/${invalidateEntry._id}/invalidate`,
        { reason: invalidateReason }
      );
      toast.success("Entry invalidated — log correct measurement separately");
      setInvalidateModal(false); setInvalidateReason("");
      await reloadWODetail(invalidateWOId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to invalidate entry");
    } finally {
      setInvalidating(false);
    }
  };

  const openBillModal = () => {
    setBillWOIds(new Set(billableWODetails.map(d => d._id)));
    setBillRemarks("");
    setBillModal(true);
  };

  const handleGenerateBill = async () => {
    const workOrderIds = Array.from(billWOIds);
    if (!workOrderIds.length) { toast.error("Select at least one work order"); return; }
    setBillGenerating(true);
    try {
      const res = await apiClient.post("/bill-requests/batch", { workOrderIds, remarks: billRemarks });
      toast.success(res.data?.message || "Bill request submitted");
      setBillModal(false);
      await Promise.all(workOrderIds.map(id => reloadWODetail(id)));
      const r = await apiClient.get("/bill-requests");
      setAllBills(r.data.billRequests ?? []);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to submit bill request");
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
    <>
      {view !== "overview" && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Btn small outline label="← All DRIs" onClick={goToOverview} />
          {view === "dri-detail" && (
            <Btn small outline label={`← ${selectedDRI?.name}'s Projects`} onClick={goToProjects} />
          )}
        </div>
      )}
      <PageHeader
        icon={HardHat}
        title="DRI Work Dashboard"
        subtitle={selectedDRI && view !== "overview" ? (
          <>
            Viewing as <span className="text-primary font-bold">{selectedDRI.name}</span>
            <span className="text-gray-400 dark:text-gray-500 ml-2">{selectedDRI.email}</span>
          </>
        ) : undefined}
        actions={
          <div className="min-w-[280px]">
            <SField
              placeholder="Select DRI to view their dashboard →"
              value={selectedDRI?._id ?? ""}
              onChange={(val) => {
                if (!val) { goToOverview(); return; }
                const dri = allDRIs.find(d => d._id === val);
                if (dri) selectDRI(dri);
              }}
              options={[{ value: "", label: "— View All DRIs —" }, ...allDRIs.map(d => ({ value: d._id, label: d.name }))]}
              renderOption={(o) => {
                if (!o.value) return <span className="text-gray-400">{o.label}</span>;
                const dri = allDRIs.find(d => d._id === o.value);
                return (
                  <div className="leading-tight">
                    <div className="font-semibold text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9]">{o.label}</div>
                    {dri && <div className="text-[11px] text-gray-400">{dri.email}</div>}
                  </div>
                );
              }}
            />
          </div>
        }
      />
    </>
  );

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) return <Spinner size="large" />;

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW: OVERVIEW — all DRIs summary table
  // ════════════════════════════════════════════════════════════════════════════
  if (view === "overview") {
    const totalActive    = allWOs.filter(w => w.status === "in-progress" || w.status === "issued").length;
    const totalCompleted = allWOs.filter(w => w.status === "completed").length;
    const totalPending   = allBills.filter(b => b.status === "pending").length;

    return (
      <div className="pb-10">
        <Header />

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-6">
          <StatCard label="Total DRIs" value={allDRIs.length} icon={Users} />
          <StatCard label="Total WOs" value={allWOs.length} icon={Briefcase} />
          <StatCard label="Active WOs" value={totalActive} icon={Activity} iconColorClass="text-blue-500" />
          <StatCard label="Completed WOs" value={totalCompleted} icon={CheckCircle2} iconColorClass="text-emerald-500" />
          <StatCard label="Pending Bills" value={totalPending} icon={Clock} iconColorClass="text-amber-500" />
        </div>

        <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700/40 font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">
            All DRIs — click any row to view their dashboard
          </div>
          {allDRIs.length === 0 ? (
            <EmptyState icon={Users} title="No DRI users found." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>DRI Name</Th>
                  <Th>Email</Th>
                  <Th>Total WOs</Th>
                  <Th>Active</Th>
                  <Th>Completed</Th>
                  <Th>Pending Bills</Th>
                  <Th>Approved Bills</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {driStats.map(row => (
                  <Tr key={row.dri._id} className="cursor-pointer" onClick={() => selectDRI(row.dri)}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="w-[30px] h-[30px] rounded-full bg-primary text-white inline-flex items-center justify-center font-extrabold text-xs shrink-0">
                          {row.dri.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                        </span>
                        <span className="font-bold text-primary text-[13px]">{row.dri.name}</span>
                      </div>
                    </Td>
                    <Td className="text-xs text-gray-500 dark:text-gray-400">{row.dri.email}</Td>
                    <Td className="font-mono font-bold tabular-nums text-sm">{row.total}</Td>
                    <Td><CountPill n={row.active} color="blue" /></Td>
                    <Td><CountPill n={row.completed} color="green" /></Td>
                    <Td><CountPill n={row.pendingBills} color="amber" /></Td>
                    <Td><CountPill n={row.approvedBills} color="green" /></Td>
                    <Td><span className="text-primary font-semibold text-xs whitespace-nowrap">View Dashboard →</span></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
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
      <div className="pb-10">
        <Header />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <StatCard label="Projects" value={driProjects.length} icon={Building2} />
          <StatCard label="Total WOs" value={driWOs.length} icon={Briefcase} />
          <StatCard label="Active" value={driWOs.filter(w => w.status === "in-progress" || w.status === "issued").length} icon={Activity} iconColorClass="text-blue-500" />
          <StatCard label="Completed" value={driWOs.filter(w => w.status === "completed").length} icon={CheckCircle2} iconColorClass="text-emerald-500" />
        </div>

        {driProjects.length === 0 ? (
          <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg">
            <EmptyState icon={Building2} title="No work orders assigned" message={`${selectedDRI?.name} has no assigned work orders.`} />
          </div>
        ) : (
          <>
            <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3.5">
              {selectedDRI?.name}'s Projects ({driProjects.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {driProjects.map(p => (
                <div
                  key={p.projectId}
                  onClick={() => openProject(p.projectId, p.projectName)}
                  className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 border-l-4 border-l-primary rounded-lg p-5 pb-4 cursor-pointer hover:shadow-lg transition-shadow shadow-sm"
                >
                  <div className="text-[17px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9] mb-2">{p.projectName}</div>
                  <div className="flex gap-3.5 text-xs text-gray-500 dark:text-gray-400">
                    <span>👷 {p.vendorCodes.size} contractor{p.vendorCodes.size !== 1 ? "s" : ""}</span>
                    <span>📋 {p.woCount} work order{p.woCount !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="mt-3 text-xs text-primary font-semibold">Open Project →</div>
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
    <div className="pb-10">
      <Header />

      {/* Project sub-header */}
      <div className="mb-5 p-4 sm:p-5 bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg shadow-sm flex justify-between items-start flex-wrap gap-3">
        <div>
          <div className="text-xl font-extrabold text-[#1A1A2E] dark:text-[#F1F5F9]">{selProjName}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center flex-wrap gap-2">
            <span>
              {projectWOs.length} work order{projectWOs.length !== 1 ? "s" : ""} · {vendorGroups.length} contractor{vendorGroups.length !== 1 ? "s" : ""}
            </span>
            {canEdit ? (
              <Badge color="green" small>✎ Editable — owner access</Badge>
            ) : (
              <Badge color="amber" small>👁 Read-only — admin view</Badge>
            )}
          </div>
        </div>
        {canEdit && billableWODetails.length > 0 && (
          <Btn color="primary" icon={Receipt} label={`Generate Bill Request (${billableWODetails.length})`} onClick={openBillModal} />
        )}
      </div>

      {/* Summary stats */}
      {!detailLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-5">
          <StatCard label="Contractors" value={vendorGroups.length} icon={Users} />
          <StatCard label="Work Orders" value={projectWOs.length} icon={Briefcase} iconColorClass="text-blue-500" />
          <StatCard label="Bill Requests" value={projectBills.length} icon={FileText} iconColorClass="text-purple-500" />
          <StatCard label="Approved" value={projectBills.filter(b => b.status === "approved").length} icon={CheckCircle2} iconColorClass="text-emerald-500" />
        </div>
      )}

      {detailLoading ? (
        <Spinner size="large" />
      ) : (
        <>
          {/* Vendor + WO cards */}
          {vendorGroups.map(vg => (
            <div key={vg.vendorCode} className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-hidden mb-4 shadow-sm">
              <div className="bg-gray-800 dark:bg-gray-900 px-5 py-3.5">
                <div className="text-white font-bold text-[15px]">👷 {vg.vendorName}</div>
                <div className="text-gray-400 text-xs mt-0.5">
                  <span className="font-mono text-primary">{vg.vendorCode}</span> · {vg.wos.length} work order{vg.wos.length !== 1 ? "s" : ""}
                </div>
              </div>

              {vg.wos.map(wo => {
                const detail = woDetails.get(wo._id);
                const avgPct = detail?.scopeItems.length
                  ? Math.round(detail.scopeItems.reduce((s, si) => s + pctOf(si.completedQty, si.plannedQty), 0) / detail.scopeItems.length)
                  : 0;

                return (
                  <div key={wo._id} className="border-b border-gray-200 dark:border-gray-700/40">
                    {/* WO sub-header */}
                    <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700/40 flex justify-between items-center flex-wrap gap-2">
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="font-mono font-bold text-primary text-[13px]">{wo.workOrderNo}</span>
                        {wo.category && <Badge color="gray" small>{wo.category}</Badge>}
                        <Badge color={STATUS_BADGE[wo.status] ?? "gray"} small>{STATUS_LABEL[wo.status] ?? wo.status}</Badge>
                      </div>
                      {detail && (
                        <div className="flex items-center gap-2 text-xs">
                          <div className="w-20 h-1.5 bg-gray-100 dark:bg-gray-700/40 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${avgPct >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${avgPct}%` }} />
                          </div>
                          <span className={`font-bold ${avgPct >= 100 ? "text-emerald-600" : "text-primary"}`}>{avgPct}%</span>
                        </div>
                      )}
                    </div>

                    {/* Scope items table */}
                    {!detail ? (
                      <Spinner size="small" />
                    ) : detail.scopeItems.length === 0 ? (
                      <div className="py-5 text-center text-gray-400 text-sm">No scope items defined.</div>
                    ) : (
                      <Table>
                        <Thead>
                          <Tr>
                            <Th>#</Th>
                            <Th>Description</Th>
                            <Th>Unit</Th>
                            <Th>Planned</Th>
                            <Th>Done</Th>
                            <Th>Billed</Th>
                            <Th>Unbilled</Th>
                            <Th>Measurement</Th>
                            {canEdit && <Th>Action</Th>}
                          </Tr>
                        </Thead>
                        <Tbody>
                          {detail.scopeItems.map((si, idx) => {
                            const p          = pctOf(si.completedQty, si.plannedQty);
                            const billed     = si.lastBilledQty || 0;
                            const unbilled   = Math.max(0, si.completedQty - billed);
                            const hasSubItems = (si.subItems?.length ?? 0) > 0;
                            return (
                              <Fragment key={si._id}>
                                <Tr>
                                  <Td className="text-gray-400 text-xs">{idx + 1}</Td>
                                  <Td className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] text-sm">
                                    {si.description}
                                    {hasSubItems && (
                                      <span className="ml-1.5 text-[10px] font-bold text-gray-400 uppercase">
                                        {si.status === "completed" ? "✓ Complete" : `${si.subItems!.length} particulars`}
                                      </span>
                                    )}
                                    {si.remarks && <div className="text-[11px] font-normal text-amber-600 mt-0.5">📌 {si.remarks}</div>}
                                  </Td>
                                  <Td className="text-gray-500 dark:text-gray-400 text-xs">{si.unit}</Td>
                                  <Td className="font-mono text-xs">{fmtN(si.plannedQty)}</Td>
                                  <Td className={`font-mono text-xs ${si.completedQty > 0 ? "text-emerald-600" : "text-gray-400"}`}>{fmtN(si.completedQty)}</Td>
                                  <Td className="font-mono text-xs text-blue-600">{fmtN(billed)}</Td>
                                  <Td className="font-mono text-xs">
                                    {unbilled > 0
                                      ? <span className="text-primary font-bold">{fmtN(unbilled)}</span>
                                      : <span className="text-gray-400">—</span>}
                                  </Td>
                                  <Td className="min-w-[120px]">
                                    <div className="flex items-center gap-1.5">
                                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700/40 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${p >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${p}%` }} />
                                      </div>
                                      <span className={`text-[10px] font-bold min-w-[26px] ${p >= 100 ? "text-emerald-600" : "text-primary"}`}>{p}%</span>
                                    </div>
                                  </Td>
                                  {canEdit && (
                                    <Td>
                                      {!hasSubItems && (
                                        <Btn small outline label="+ Measurement" onClick={() => openAddProgress(wo._id, si)} />
                                      )}
                                    </Td>
                                  )}
                                </Tr>
                                {hasSubItems && si.subItems!.map((sub, subIdx) => {
                                  const sp = pctOf(sub.completedQty, sub.plannedQty);
                                  return (
                                    <Tr key={sub._id} className="bg-gray-50/60 dark:bg-gray-800/20">
                                      <Td className="pl-7 text-gray-400 text-[11px]">{idx + 1}.{subIdx + 1}</Td>
                                      <Td className="font-medium text-gray-600 dark:text-gray-300 text-xs">
                                        {sub.description}
                                        {sub.status === "completed" && <span className="ml-1.5 text-emerald-600 text-[10px] font-bold">✓</span>}
                                        {sub.remarks && <div className="text-[11px] font-normal text-amber-600 mt-0.5">📌 {sub.remarks}</div>}
                                      </Td>
                                      <Td className="text-gray-500 dark:text-gray-400 text-[11px]">{sub.unit}</Td>
                                      <Td className="font-mono text-[11px]">{fmtN(sub.plannedQty)}</Td>
                                      <Td className={`font-mono text-[11px] ${sub.completedQty > 0 ? "text-emerald-600" : "text-gray-400"}`}>{fmtN(sub.completedQty)}</Td>
                                      {/* Billing tracks at the item level (its completedQty rolls up from all
                                          particulars), not per particular — shown blank here on purpose. */}
                                      <Td className="text-[11px] text-gray-400">—</Td>
                                      <Td className="text-[11px] text-gray-400">—</Td>
                                      <Td className="min-w-[120px]">
                                        <div className="flex items-center gap-1.5">
                                          <div className="flex-1 h-[5px] bg-gray-100 dark:bg-gray-700/40 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${sp >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${sp}%` }} />
                                          </div>
                                          <span className={`text-[9.5px] font-bold min-w-[26px] ${sp >= 100 ? "text-emerald-600" : "text-primary"}`}>{sp}%</span>
                                        </div>
                                      </Td>
                                      {canEdit && (
                                        <Td>
                                          <Btn small outline label="+ Measurement" onClick={() => openAddProgress(wo._id, si, sub)} />
                                        </Td>
                                      )}
                                    </Tr>
                                  );
                                })}
                              </Fragment>
                            );
                          })}
                        </Tbody>
                      </Table>
                    )}

                    {/* Recent entries for this WO — same parity as Work Progress */}
                    {detail && (() => {
                      const wpt = detail.projectId?.projectType === "plot" ? "plot" : "apartment";
                      const allEntriesWO: EntryRow[] = detail.scopeItems.flatMap(si =>
                        (si.progressEntries ?? []).map(pe => ({
                          ...pe, unit: si.unit, description: si.description,
                          scopeId: `${si._id}||${detail._id}`,
                          scopePlanned: si.plannedQty, scopeCompleted: si.completedQty, scopeLastBilled: si.lastBilledQty || 0,
                        }))
                      ).sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
                      const recentEntries = allEntriesWO.slice(0, 5);
                      const todayStr = dayjs().format("YYYY-MM-DD");

                      if (!recentEntries.length) return null;
                      return (
                        <div className="px-5 pt-2.5 pb-3.5 border-t border-gray-200 dark:border-gray-700/40">
                          <div className="flex justify-between items-center mb-2">
                            <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                              Recent Entries (last 5)
                            </div>
                            {allEntriesWO.length > 5 && (
                              <button type="button" className="text-[11px] font-semibold text-primary hover:underline" onClick={() => setAllEntriesWOId(detail._id)}>
                                View All ({allEntriesWO.length})
                              </button>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {recentEntries.map((e, i) => (
                              <div key={e._id + i} className="flex gap-3 items-center text-xs" style={{ opacity: e.invalidated?.done ? 0.55 : 1 }}>
                                <span className="text-gray-400 min-w-[90px] whitespace-nowrap flex items-center gap-1">
                                  {dayjs(e.date).format("DD MMM")}
                                  {dayjs(e.date).format("YYYY-MM-DD") === todayStr && <Badge color="blue" small>Today</Badge>}
                                </span>
                                <span className={`font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] flex-1 ${e.invalidated?.done ? "line-through" : ""}`}>
                                  {e.description}
                                  {personName(e.enteredBy) && (
                                    <span className="font-normal text-gray-400 text-[11px]"> · {personName(e.enteredBy)}</span>
                                  )}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">{formatLocation(e, wpt)}</span>
                                <span className="text-emerald-600 font-bold font-mono min-w-[60px]">+{fmtN(e.qtyAdded)} {e.unit}</span>
                                {canEdit && (
                                  <EntryActions
                                    e={e} deleting={deleting === e._id}
                                    onEdit={() => {
                                      setEditEntry(e);
                                      setEditProjectType(wpt);
                                      editErrors.clearAll();
                                      setEditFormValues({
                                        date: e.date ? dayjs(e.date).format("YYYY-MM-DD") : "",
                                        qtyAdded: String(e.qtyAdded ?? ""),
                                        remarks: e.remarks || "",
                                        tower: e.tower || "", floor: e.floor || "", flatNo: e.flatNo || "",
                                        plotNo: e.plotNo || "", locationNote: e.locationNote || "", plannedQty: "",
                                      });
                                      setEditModal(true);
                                    }}
                                    onDelete={() => handleDeleteEntry(e, detail._id)}
                                    onInvalidate={() => {
                                      setInvalidateEntry(e);
                                      setInvalidateWOId(detail._id);
                                      invalidateErrors.clearAll();
                                      setInvalidateReason("");
                                      setInvalidateModal(true);
                                    }}
                                  />
                                )}
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

          {/* Billing history */}
          {projectBills.length > 0 && (
            <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-hidden mt-2 shadow-sm">
              <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700/40 font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">
                Billing History — {selProjName}
              </div>
              {projectBills.map((br, i) => (
                <div key={br._id} className={`px-5 py-3 border-b border-gray-200 dark:border-gray-700/40 flex gap-3 items-center ${i % 2 === 0 ? "" : "bg-gray-50 dark:bg-gray-800/20"}`}>
                  <div className={`rounded-lg border-2 px-2.5 py-1.5 min-w-[52px] text-center shrink-0 ${br.status === "approved" ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500" : "bg-amber-50 dark:bg-amber-500/10 border-amber-500"}`}>
                    <div className="text-[8px] font-bold text-gray-400 uppercase">Stage</div>
                    <div className={`text-base font-extrabold ${br.status === "approved" ? "text-emerald-600" : "text-amber-600"}`}>{br.stageNo ?? 1}</div>
                  </div>
                  <div className="flex-1">
                    <div className="font-bold font-mono text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9]">{br.reqNo}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {br.vendorName && <span>{br.vendorName} · </span>}
                      {dayjs(br.createdAt).format("DD MMM YYYY")}
                    </div>
                  </div>
                  <Badge color={BR_BADGE[br.status] ?? "gray"}>{br.status.toUpperCase()}</Badge>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Add Measurement Modal (owner/edit-permission only) ──────────────────── */}
      {progModal && (
        <Modal
          icon={Ruler}
          title={
            progTarget?.subItem
              ? `Add Measurement — ${progTarget.item.description} › ${progTarget.subItem.description}`
              : `Add Measurement — ${progTarget?.item.description ?? ""}`
          }
          onClose={() => { setProgModal(false); setProgFormValues(emptyProgForm); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setProgModal(false); setProgFormValues(emptyProgForm); }} />
              <Btn color="primary" label="Save Measurement" loading={progSaving} onClick={handleAddProgress} />
            </div>
          }
        >
          {progModalTarget?.remarks && (
            <Alert type="warning" message="Instruction" description={progModalTarget.remarks} />
          )}
          <div className="mt-3.5">
            <DatePicker
              label="Date"
              value={progFormValues.date}
              onChange={(v) => setProgFormValues(prev => ({ ...prev, date: v }))}
              max={dayjs().format("YYYY-MM-DD")}
            />
            {progErrors.errors.date && <span className="block text-xs text-red-500 mt-1">{progErrors.errors.date}</span>}
          </div>
          <div className="mt-3.5">
            <LocationFields
              pt={progProjectType}
              tower={progFormValues.tower} floor={progFormValues.floor} flatNo={progFormValues.flatNo}
              plotNo={progFormValues.plotNo} locationNote={progFormValues.locationNote}
              onChange={(field, value) => setProgFormValues(prev => ({ ...prev, [field]: value }))}
            />
          </div>
          {progModalTarget && !progModalTarget.plannedQty && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 mb-3.5">
              <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1.5">Planned quantity not set for this item</div>
              <div className="text-[11px] text-amber-600/80 dark:text-amber-300/70 mb-2.5">You can set the total planned quantity now, or leave blank to log measurement without a cap.</div>
              <Field
                label={`Total Planned Qty (${progModalTarget.unit})`}
                type="number" min="0.00001" step="0.00001"
                placeholder={progModalTarget.unit === "per-hr" ? "e.g. 200.0000" : "e.g. 5000"}
                value={progFormValues.plannedQty}
                onChange={(e) => setProgFormValues(prev => ({ ...prev, plannedQty: e.target.value }))}
                error={progErrors.errors.plannedQty}
              />
            </div>
          )}
          <Field
            label={`Quantity Added (${progModalTarget?.unit ?? ""})`}
            type="number" min="0.00001" step="0.00001"
            hint={progModalTarget?.unit === "per-hr" ? "Tip: enter decimals for minutes — e.g. 13.67 = 13 hr 40 min" : undefined}
            placeholder={progModalTarget?.unit === "per-hr" ? "e.g. 13.6667" : "e.g. 500"}
            value={progFormValues.qtyAdded}
            onChange={(e) => setProgFormValues(prev => ({ ...prev, qtyAdded: e.target.value }))}
            error={progErrors.errors.qtyAdded}
          />
          <div className="mt-3.5">
            <Field
              textarea label="Remarks (optional)" placeholder="Notes for today's work…"
              value={progFormValues.remarks}
              onChange={(e) => setProgFormValues(prev => ({ ...prev, remarks: e.target.value }))}
            />
          </div>
          {progModalTarget && (
            <div className="mt-3.5 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/40 rounded-lg p-3">
              <Descriptions columns={3}>
                <DescItem label="Planned">
                  {progModalTarget.plannedQty > 0 ? `${fmtN(progModalTarget.plannedQty)} ${progModalTarget.unit}` : "Not set"}
                </DescItem>
                <DescItem label="Done">
                  <span className="text-emerald-600 font-semibold">{fmtN(progModalTarget.completedQty)} {progModalTarget.unit}</span>
                </DescItem>
                <DescItem label="Remaining">
                  <span className="text-primary font-semibold">
                    {progModalTarget.plannedQty > 0
                      ? `${fmtN(Math.max(0, progModalTarget.plannedQty - (progModalTarget.completedQty ?? 0)))} ${progModalTarget.unit}`
                      : "Unlimited"}
                  </span>
                </DescItem>
              </Descriptions>
            </div>
          )}
        </Modal>
      )}

      {/* ── Edit Entry Modal ───────────────────────────────────────────────── */}
      {editModal && (
        <Modal
          icon={Pencil}
          title="Edit Measurement Entry"
          onClose={() => { setEditModal(false); setEditFormValues(emptyProgForm); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setEditModal(false); setEditFormValues(emptyProgForm); }} />
              <Btn color="primary" label="Save Changes" loading={progSaving} onClick={handleEditEntry} />
            </div>
          }
        >
          <DatePicker
            label="Date"
            value={editFormValues.date}
            onChange={(v) => setEditFormValues(prev => ({ ...prev, date: v }))}
            max={dayjs().format("YYYY-MM-DD")}
          />
          <div className="mt-3.5">
            <LocationFields
              pt={editProjectType}
              tower={editFormValues.tower} floor={editFormValues.floor} flatNo={editFormValues.flatNo}
              plotNo={editFormValues.plotNo} locationNote={editFormValues.locationNote}
              onChange={(field, value) => setEditFormValues(prev => ({ ...prev, [field]: value }))}
            />
          </div>
          <Field
            label="Quantity Added" type="number" min="0.00001" step="0.00001" placeholder="e.g. 13.6667"
            value={editFormValues.qtyAdded}
            onChange={(e) => setEditFormValues(prev => ({ ...prev, qtyAdded: e.target.value }))}
            error={editErrors.errors.qtyAdded}
          />
          <div className="mt-3.5">
            <Field
              textarea label="Remarks (optional)"
              value={editFormValues.remarks}
              onChange={(e) => setEditFormValues(prev => ({ ...prev, remarks: e.target.value }))}
            />
          </div>
        </Modal>
      )}

      {/* ── Invalidate Entry Modal ─────────────────────────────────────────── */}
      {invalidateModal && (
        <Modal
          icon={Ban}
          title="Invalidate Measurement Entry"
          onClose={() => { setInvalidateModal(false); setInvalidateReason(""); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setInvalidateModal(false); setInvalidateReason(""); }} />
              <Btn color="red" label="Invalidate" loading={invalidating} onClick={handleInvalidateEntry} />
            </div>
          }
        >
          <Alert
            type="error"
            message="This entry stays visible in history (who logged it, when, why it was invalidated) but no longer counts toward measurement or future billing."
            description="Log the correct measurement as a fresh entry afterwards."
          />
          {invalidateEntry && (
            <div className="text-xs text-gray-500 dark:text-gray-400 my-3.5">
              <strong className="text-[#1A1A2E] dark:text-[#F1F5F9]">{invalidateEntry.description}</strong> · +{fmtN(invalidateEntry.qtyAdded)} {invalidateEntry.unit} · {dayjs(invalidateEntry.date).format("DD MMM YYYY")}
            </div>
          )}
          <Field
            textarea label="Reason" required placeholder="e.g. Measurement was wrong, double-counted, wrong item…"
            value={invalidateReason}
            onChange={(e) => setInvalidateReason(e.target.value)}
            error={invalidateErrors.errors.reason}
          />
        </Modal>
      )}

      {/* ── View All Entries Modal ───────────────────────────────────────────── */}
      {allEntriesWOId && (() => {
        const detail = woDetails.get(allEntriesWOId);
        const wpt = detail?.projectId?.projectType === "plot" ? "plot" : "apartment";
        const todayStr = dayjs().format("YYYY-MM-DD");
        const allEntriesWO: EntryRow[] = detail
          ? detail.scopeItems.flatMap(si =>
              (si.progressEntries ?? []).map(pe => ({
                ...pe, unit: si.unit, description: si.description,
                scopeId: `${si._id}||${detail._id}`,
                scopePlanned: si.plannedQty, scopeCompleted: si.completedQty, scopeLastBilled: si.lastBilledQty || 0,
              }))
            ).sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())
          : [];

        return (
          <Modal icon={History} title="All Measurement Entries" wide onClose={() => setAllEntriesWOId(null)}>
            <div className="max-h-[60vh] overflow-y-auto pr-2">
              {!detail ? (
                <div className="text-center text-gray-400 py-10 text-sm">No data available.</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {allEntriesWO.map((e, i) => (
                    <div key={e._id + i} className="flex gap-3 items-center text-xs py-2 border-b border-gray-100 dark:border-gray-700/40" style={{ opacity: e.invalidated?.done ? 0.55 : 1 }}>
                      <span className="text-gray-400 min-w-[90px] whitespace-nowrap flex items-center gap-1">
                        {dayjs(e.date).format("DD MMM")}
                        {dayjs(e.date).format("YYYY-MM-DD") === todayStr && <Badge color="blue" small>Today</Badge>}
                      </span>
                      <span className={`font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] flex-1 ${e.invalidated?.done ? "line-through" : ""}`}>
                        {e.description}
                        {personName(e.enteredBy) && (
                          <span className="font-normal text-gray-400 text-[11px]"> · {personName(e.enteredBy)}</span>
                        )}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">{formatLocation(e, wpt)}</span>
                      <span className="text-emerald-600 font-bold font-mono min-w-[60px]">+{fmtN(e.qtyAdded)} {e.unit}</span>
                      {canEdit && (
                        <EntryActions
                          e={e} deleting={deleting === e._id}
                          onEdit={() => {
                            setEditEntry(e);
                            setEditProjectType(wpt);
                            editErrors.clearAll();
                            setEditFormValues({
                              date: e.date ? dayjs(e.date).format("YYYY-MM-DD") : "",
                              qtyAdded: String(e.qtyAdded ?? ""),
                              remarks: e.remarks || "",
                              tower: e.tower || "", floor: e.floor || "", flatNo: e.flatNo || "",
                              plotNo: e.plotNo || "", locationNote: e.locationNote || "", plannedQty: "",
                            });
                            setEditModal(true);
                          }}
                          onDelete={() => handleDeleteEntry(e, detail._id)}
                          onInvalidate={() => {
                            setInvalidateEntry(e);
                            setInvalidateWOId(detail._id);
                            invalidateErrors.clearAll();
                            setInvalidateReason("");
                            setInvalidateModal(true);
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Modal>
        );
      })()}

      {/* ── Generate Bill Request Modal (owner/edit-permission only) ──────────── */}
      {billModal && (
        <Modal
          icon={Send}
          title={`Generate Bill Request — ${selProjName}`}
          extraWide
          onClose={() => setBillModal(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => setBillModal(false)} />
              <Btn
                color="primary"
                label={`Submit Bill Request${billWOIds.size > 1 ? ` (${billWOIds.size} Work Orders)` : ""}`}
                loading={billGenerating}
                disabled={billWOIds.size === 0}
                onClick={handleGenerateBill}
              />
            </div>
          }
        >
          <Alert type="info" message="Project bill request" description="Select work orders to include. Quantities are auto-calculated from recorded measurement since last billing." />

          <div className="mt-3.5">
            {billableWODetails.length === 0 ? (
              <EmptyState icon={FileText} title="No pending measurement to bill" message="Record daily measurement first." />
            ) : (
              <div className="flex flex-col gap-3">
                {vendorGroups.map(vg => {
                  const vgBillableWOs = vg.wos
                    .map(wo => woDetails.get(wo._id))
                    .filter((d): d is WODetail => !!d && billableWODetails.some(b => b._id === d._id));

                  if (!vgBillableWOs.length) return null;
                  return (
                    <div key={vg.vendorCode} className="border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 dark:bg-gray-800/40 px-3.5 py-2.5 font-bold text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] border-b border-gray-200 dark:border-gray-700/40">
                        👷 {vg.vendorName} <span className="font-mono text-primary text-[11px] font-normal">({vg.vendorCode})</span>
                      </div>
                      {vgBillableWOs.map(detail => {
                        const pendingItems = getPendingBillableRows(detail.scopeItems);
                        const isChecked = billWOIds.has(detail._id);
                        return (
                          <div key={detail._id} className={`p-3.5 border-b border-gray-200 dark:border-gray-700/40 ${isChecked ? "bg-gray-50 dark:bg-gray-800/20" : ""}`}>
                            <div className="flex gap-2.5 items-start">
                              <Checkbox
                                checked={isChecked}
                                onChange={(checked) => setBillWOIds(prev => {
                                  const next = new Set(prev);
                                  if (checked) next.add(detail._id); else next.delete(detail._id);
                                  return next;
                                })}
                              />
                              <div className="flex-1">
                                <div className="font-bold text-primary font-mono text-[13px]">{detail.workOrderNo}</div>
                                {detail.category && <div className="text-[11px] text-gray-400 mb-2">{detail.category}</div>}
                                <table className="w-full border-collapse text-xs">
                                  <tbody>
                                    {pendingItems.map(row => (
                                      <tr key={row.key}>
                                        <td className="py-0.5 text-[#1A1A2E] dark:text-[#F1F5F9] font-medium">{row.description}</td>
                                        <td className="py-0.5 px-2 text-gray-500 dark:text-gray-400">{row.unit}</td>
                                        <td className="py-0.5 text-gray-500 dark:text-gray-400">Prev billed: {fmtN(row.lastBilledQty)}</td>
                                        <td className="py-0.5 text-right text-primary font-bold font-mono">+{fmtN(row.billedQty)}</td>
                                      </tr>
                                    ))}
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
          </div>

          {billableWODetails.length > 0 && (
            <div className="mt-4">
              <Field
                textarea label="Remarks (optional)" placeholder="Any notes for this consolidated bill request…"
                value={billRemarks} onChange={(e) => setBillRemarks(e.target.value)}
              />
            </div>
          )}

          {billWOIds.size > 0 && (
            <div className="mt-3">
              <Alert
                type="warning"
                message={<><strong>{billWOIds.size} work order{billWOIds.size !== 1 ? "s" : ""}</strong> will be included in this bill request.</>}
              />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
