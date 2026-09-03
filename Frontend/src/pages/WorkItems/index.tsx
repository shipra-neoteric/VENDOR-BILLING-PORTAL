import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import toast from "react-hot-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Pencil, Eye, Paperclip, Trash2, Ban, Lock, Unlock, AlertTriangle,
  FileText, ClipboardList, BarChart3, Link2, Zap, Briefcase, Search, Check, Loader2,
  CalendarRange, PlayCircle, CheckCircle2, Download,
} from "lucide-react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import MultiSelect from "../../ui/MultiSelect";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import { DatePicker } from "../../ui/DatePicker";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import DropdownMenu from "../../ui/DropdownMenu";
import type { DropdownMenuItem } from "../../ui/DropdownMenu";
import Badge from "../../ui/Badge";
import EmptyState from "../../ui/EmptyState";
import Spinner from "../../ui/Spinner";
import Segmented from "../../ui/Segmented";
import Alert from "../../ui/Alert";
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import { SearchFilter, DropdownSelectFilter } from "../../ui/Filters";
import { useFormErrors } from "../../hooks/useFormErrors";

import { useAuth } from "../../context/AuthContext";
import { useCategories } from "../../hooks/useCategories";
import { createCategory } from "../../features/categories/api";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import { selectableProjects, getWorkOrderProjectId } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";
import PaymentMilestonesBuilder, { calcPayable, calcGrandTotal } from "../../components/PaymentMilestonesBuilder";
import type { MilestoneDraft } from "../../components/PaymentMilestonesBuilder";
import SecurityDepositBuilder, { calcDepositAmount } from "../../components/SecurityDepositBuilder";
import type { SecurityDepositDraft } from "../../components/SecurityDepositBuilder";
import GstSelect from "../../components/GstSelect";
import DocumentsUpload, { getWorkOrderDocuments } from "../../components/DocumentsUpload";
import type { WODocument } from "../../components/DocumentsUpload";
import WarrantyTermsBuilder from "../../components/WarrantyTermsBuilder";
import WorkOrderDetailView from "../../components/WorkOrderDetailView";
import type {
  Contractor,
  Consultant,
  Project,
  WorkOrder,
  WorkOrderStatus,
  WorkOrderApprovalStatus,
  ScopeItem,
  PaymentMilestone,
  SecurityDeposit,
} from "../../types/VendorBilling";

// ── Constants ─────────────────────────────────────────────────

// Collapses the 5 raw backend statuses to Draft/In Progress/Completed for
// display — "issued" reads as still-in-progress operationally; "cancelled"
// is rare enough that it still needs to be visible when it happens, so it
// gets its own fourth badge rather than being folded into (or hidden from)
// the other three.
function displayStatus(status: WorkOrderStatus): { label: string; color: "gray" | "amber" | "green" | "red" } {
  if (status === "draft") return { label: "Draft", color: "gray" };
  if (status === "completed") return { label: "Completed", color: "green" };
  if (status === "cancelled") return { label: "Cancelled", color: "red" };
  return { label: "In Progress", color: "amber" }; // issued + in-progress
}

// ── Approval workflow status pill ─────────────────────────────
// Existing (pre-workflow) work orders were grandfathered to approvalStatus
// 'approved' on the backend, so an undefined/missing value here is treated
// the same way — as fully approved.
const APPROVAL_STATUS_CFG: Record<WorkOrderApprovalStatus, { label: string; color: string; level?: string }> = {
  draft:              { label: "Draft",                  color: "#6B7280", level: "L1" },
  "pending-checker":  { label: "Awaiting Checker",        color: "#0891b2", level: "L2" },
  "pending-approver": { label: "Awaiting Approver",       color: "#d97706", level: "L3" },
  "pending-final":    { label: "Awaiting Final Approval", color: "#7c3aed", level: "L4" },
  approved:           { label: "Approved",                color: "#16a34a" },
  "sent-back":        { label: "Sent Back",               color: "#dc2626" },
};

// The 4 stages that have a real "L1"-"L4" level per APPROVAL_STATUS_CFG —
// used to build the Step filter's pill row and its per-stage counts.
const STEP_KEYS: WorkOrderApprovalStatus[] = ["draft", "pending-checker", "pending-approver", "pending-final"];

const approvalStatusOf = (wo: WorkOrder): WorkOrderApprovalStatus => wo.approvalStatus || "approved";

// Step badge — a plain filled pill (orange while pending, green once
// approved, red if sent back), matching the Nexora style pilot exactly
// rather than the old bordered/two-line pill.
function StepBadge({ wo }: { wo: WorkOrder }) {
  const st = approvalStatusOf(wo);
  if ((STEP_KEYS as string[]).includes(st)) {
    return <NxBadge color="orange">{APPROVAL_STATUS_CFG[st].level} Pending</NxBadge>;
  }
  if (st === "sent-back") return <NxBadge color="red">Sent Back</NxBadge>;
  return <NxBadge color="green">Approved</NxBadge>;
}

const UNIT_OPTIONS = [
  { label: "Sq.Ft (Square Feet)",  value: "sq.ft" },
  { label: "Sq.M (Square Meter)",  value: "sq.m" },
  { label: "Cu.M (Cubic Meter)",   value: "cu.m" },
  { label: "Cu.Ft (Cubic Feet)",   value: "cu.ft" },
  { label: "RMT (Running Meter)",  value: "rmt" },
  { label: "Kg (Kilogram)",        value: "kg" },
  { label: "MT (Metric Ton)",      value: "mt" },
  { label: "Nos (Numbers)",        value: "nos" },
  { label: "Daily Wage",           value: "daily-wage" },
  { label: "Per Day",              value: "per-day" },
  { label: "Per Person",           value: "per-person" },
  { label: "Per Hour",             value: "per-hr" },
  { label: "Per Trip",             value: "per-trip" },
  { label: "RFT (Running Foot)",   value: "rft" },
  { label: "Lump Sum",             value: "lump-sum" },
  { label: "Strip",                value: "strip" },
  { label: "Custom...",            value: "custom" },
];

// ── AI Document Intelligence ────────────────────────────────────
// Mirrors the extract_work_order tool schema in Backend/src/controllers/aiController.js.
interface AiExtractedWorkOrder {
  scopeOfWork: string;
  totalTenure: string;
  issueDate: string;
  retentionPercent: number;
  gstPercent: number;
  warrantyTerms: string[];
  specialConditions: string[];
  scopeItems: { description: string; unit?: string; plannedQty?: number; rate?: number }[];
  paymentMilestones: { stage: string; type?: string; amountPercent?: number; amount?: number }[];
  extractionNotes: string;
}

// Best-effort match of an AI-extracted unit string (e.g. "Sq.Ft", "RMT") onto
// this form's own dropdown values — falls back to "custom" with the raw text
// preserved so nothing extracted is silently dropped.
function matchUnit(raw?: string): { unit: string; customUnit: string } {
  if (!raw || !raw.trim()) return { unit: "sq.ft", customUnit: "" };
  const norm = raw.toLowerCase().replace(/[.\s]/g, "");
  const direct = UNIT_OPTIONS.find(u => u.value !== "custom" && u.value.replace(/[.\s]/g, "") === norm);
  if (direct) return { unit: direct.value, customUnit: "" };
  const aliases: Record<string, string> = {
    sqft: "sq.ft", sqm: "sq.m", cum: "cu.m", cuft: "cu.ft", rmt: "rmt", rft: "rft",
    kg: "kg", mt: "mt", nos: "nos", no: "nos", numbers: "nos", each: "nos",
    lumpsum: "lump-sum", ls: "lump-sum",
  };
  if (aliases[norm]) return { unit: aliases[norm], customUnit: "" };
  return { unit: "custom", customUnit: raw.trim() };
}

// ── Draft types ───────────────────────────────────────────────

interface ScopeSubItemDraft {
  id: string;
  description: string;
  remarks: string;
  unit: string;
  customUnit: string;
  plannedQty: number | null;
  rate: number | null;
  plannedStart: string;
  plannedEnd: string;
}

interface ScopeItemDraft {
  id: string;
  description: string;
  remarks: string;
  subCategoryId: string;
  subSubCategoryId: string;
  unit: string;
  customUnit: string;
  plannedQty: number | null;
  rate: number | null;
  gstPercent: number;
  plannedStart: string;
  plannedEnd: string;
  // Only meaningful for a professional-services deliverable (e.g. "Concept",
  // "Design Development", "Final Submission") — unused for execution items.
  stage: string;
  showSubItems: boolean;
  subItems: ScopeSubItemDraft[];
}

// ── Helpers ──────────────────────────────────────────────────

const fmt = (n: number) => "₹" + (n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const resolveUnit = (unit: string, customUnit: string) =>
  unit === "custom" ? (customUnit.trim() || "unit") : unit;

const isKnownUnit = (unit: string) =>
  UNIT_OPTIONS.some(u => u.value === unit && u.value !== "custom");

// Sub-items ("Particulars") are a read-only breakdown for reference only — the
// main work item's own qty/rate is always what drives the contract value, so
// the two don't get added together or shown as if both count.
const calcSubItemAmt = (si: ScopeSubItemDraft) =>
  (si.plannedQty || 0) * (si.rate || 0);

const calcDraftItemAmt = (item: ScopeItemDraft): number =>
  (item.plannedQty || 0) * (item.rate || 0);

const calcTotalAmt = (items: ScopeItemDraft[]) =>
  items.reduce((s, it) => s + calcDraftItemAmt(it), 0);

const calcDraftItemInclGst = (item: ScopeItemDraft): number =>
  calcDraftItemAmt(item) * (1 + (item.gstPercent || 0) / 100);

const calcTotalInclGst = (items: ScopeItemDraft[]) =>
  items.reduce((s, it) => s + calcDraftItemInclGst(it), 0);

const getCompletionPct = (item: ScopeItem): number => {
  const total = item.plannedQty ||
    item.subItems.reduce((s, si) => s + si.plannedQty, 0);
  if (!total) return 0;
  return Math.min(100, Math.round((item.completedQty / total) * 100));
};

const isItemDelayed = (item: ScopeItem): boolean => {
  if (item.status === "completed" || !item.plannedEnd) return false;
  return dayjs().isAfter(dayjs(item.plannedEnd), "day");
};

const countDelays = (wo: WorkOrder) =>
  (wo.scopeItems || []).filter(isItemDelayed).length;

const normalizeId = (obj: any) => ({ ...obj, id: obj._id || obj.id });

const normalizeWO = (wo: any): WorkOrder => ({
  ...normalizeId(wo),
  scopeItems: (wo.scopeItems || []).map((si: any) => ({
    ...normalizeId(si),
    progressEntries: (si.progressEntries || []).map(normalizeId),
    subItems: (si.subItems || []).map(normalizeId),
  })),
  paymentMilestones: (wo.paymentMilestones || []).map(normalizeId),
});

// `xBy` fields only ever come back as a raw ObjectId string from the workflow
// endpoints (matches WorkOrderApprovalWorkflow's own note on this) — resolves
// against a fresh id->name map so the PDF can print the real approver's name.
function actorName(by: WorkOrder["makerBy"], userMap: Record<string, string>, at?: string | Date | null, roleKey?: "checker" | "approver" | "final"): string | undefined {
  if (!by) return undefined;
  const resolved = typeof by === "string" ? userMap[by] : (by as any)?.name;
  if (!at) {
    if (roleKey === "checker" || resolved === "Sagar Gupta" || resolved === "Akhilesh Bhadoriya") {
      return "Sagar Gupta / Akhilesh Bhadoriya";
    }
    if (roleKey === "approver" || resolved === "Rakesh Bhargava" || resolved === "Jalaj Gupta") {
      return "Rakesh Bhargava / Jalaj Gupta";
    }
  }
  return resolved;
}

function buildApprovals(wo: WorkOrder, userMap: Record<string, string>) {
  return {
    checker:  wo.checkerBy       ? { name: actorName(wo.checkerBy, userMap, wo.checkerAt, "checker"),       at: wo.checkerAt }       : null,
    approver: wo.approverBy      ? { name: actorName(wo.approverBy, userMap, wo.approverAt, "approver"),      at: wo.approverAt }      : null,
    final:    wo.finalApprovedBy ? { name: actorName(wo.finalApprovedBy, userMap, wo.finalApprovedAt, "final"), at: wo.finalApprovedAt } : null,
  };
}

const toMilestoneDraft = (pm: PaymentMilestone): MilestoneDraft => ({
  id: pm.id, stage: pm.stage, date: pm.date, type: pm.type,
  mode: pm.mode, amount: pm.amount,
  amountMode: pm.amountMode ?? "fixed", amountPercent: pm.amountPercent ?? null,
  gstPercent: pm.gstPercent, scopeItemIds: pm.scopeItemIds ?? [],
});

const toSecurityDepositDraft = (sd: SecurityDeposit): SecurityDepositDraft => ({
  id: sd.id, scopeItemIds: sd.scopeItemIds, mode: sd.mode, rate: sd.rate, notes: sd.notes || "",
});

const securityDepositDraftToPayload = (d: SecurityDepositDraft, scopeItems: ScopeItemDraft[]) => ({
  scopeItemIds: d.scopeItemIds,
  mode: d.mode,
  rate: d.rate || 0,
  amount: calcDepositAmount(d, scopeItems.map(si => ({ id: si.id, description: si.description, plannedQty: si.plannedQty, amount: calcDraftItemAmt(si) }))),
  notes: d.notes,
});

const milestoneDraftToPayload = (m: MilestoneDraft) => ({
  stage: m.stage, date: m.date, type: m.type, mode: m.mode,
  amount: m.amount || 0, amountMode: m.amountMode, amountPercent: m.amountPercent,
  gstPercent: m.gstPercent,
  // `amount` is always the pre-GST base figure regardless of mode (a percent-
  // mode amount is resolved as % of the pre-GST contract value) — GST is
  // always added on top, so this tells the backend's own recompute
  // (validateMilestones.js) to do exactly that, matching calcPayable.
  gstType: "exclusive",
  payable: calcPayable(m),
  scopeItemIds: m.scopeItemIds,
});

const newSubDraft = (): ScopeSubItemDraft => ({
  id: crypto.randomUUID(),
  description: "", remarks: "", unit: "sq.ft", customUnit: "",
  plannedQty: null, rate: null, plannedStart: "", plannedEnd: "",
});

const newItemDraft = (gstPercent = 18): ScopeItemDraft => ({
  id: crypto.randomUUID(),
  description: "", remarks: "", subCategoryId: "", subSubCategoryId: "",
  unit: "sq.ft", customUnit: "",
  plannedQty: null, rate: null, gstPercent,
  plannedStart: "", plannedEnd: "", stage: "",
  showSubItems: false, subItems: [],
});

// A deliverable is a scope item with plannedQty pinned to 1 and unit fixed to
// "lump-sum" — so `amount` (= plannedQty * rate) is just the fee entered
// directly as "rate", and every existing downstream reader of `amount`
// (billing, PDF, ledger) needs no change to handle it.
const newDeliverableDraft = (gstPercent = 18): ScopeItemDraft => ({
  ...newItemDraft(gstPercent),
  plannedQty: 1, unit: "lump-sum",
});

const toDraft = (si: ScopeItem): ScopeItemDraft => ({
  id: si.id,
  description: si.description,
  remarks: si.remarks ?? "",
  subCategoryId: "", subSubCategoryId: "",
  unit: isKnownUnit(si.unit) ? si.unit : "custom",
  customUnit: isKnownUnit(si.unit) ? "" : si.unit,
  plannedQty: si.plannedQty,
  rate: si.rate,
  gstPercent: si.gstPercent ?? 18,
  plannedStart: si.plannedStart,
  plannedEnd: si.plannedEnd,
  stage: si.stage ?? "",
  showSubItems: si.subItems.length > 0,
  subItems: si.subItems.map(sub => ({
    id: sub.id,
    description: sub.description,
    remarks: sub.remarks ?? "",
    unit: isKnownUnit(sub.unit) ? sub.unit : "custom",
    customUnit: isKnownUnit(sub.unit) ? "" : sub.unit,
    plannedQty: sub.plannedQty,
    rate: sub.rate,
    plannedStart: sub.plannedStart ?? "",
    plannedEnd: sub.plannedEnd ?? "",
  })),
});

const draftToNewItem = (d: ScopeItemDraft): ScopeItem => ({
  id: d.id,
  description: d.description,
  remarks: d.remarks,
  unit: resolveUnit(d.unit, d.customUnit),
  plannedQty: d.plannedQty || 0,
  rate: d.rate || 0,
  amount: calcDraftItemAmt(d),
  gstPercent: d.gstPercent,
  plannedStart: d.plannedStart,
  plannedEnd: d.plannedEnd,
  stage: d.stage,
  status: "pending",
  completedQty: 0,
  progressEntries: [],
  subItems: d.subItems.map(si => ({
    id: si.id,
    description: si.description,
    remarks: si.remarks || "",
    unit: resolveUnit(si.unit, si.customUnit),
    plannedQty: si.plannedQty || 0,
    rate: si.rate || 0,
    amount: calcSubItemAmt(si),
    plannedStart: si.plannedStart || "",
    plannedEnd: si.plannedEnd || "",
  })),
});

const mergeWithExisting = (
  d: ScopeItemDraft,
  existing: ScopeItem | undefined
): ScopeItem => ({
  id: d.id,
  // Without this, the backend has no way to tell "same item, edited" from
  // "brand new item" and mints a fresh _id every time — which silently
  // orphans any bill/progress record that already references the old one
  // (rates/quantities on already-billed items would start reading as 0).
  ...(existing ? { _id: existing.id } : {}),
  description: d.description,
  remarks: d.remarks,
  unit: resolveUnit(d.unit, d.customUnit),
  plannedQty: d.plannedQty || 0,
  rate: d.rate || 0,
  amount: calcDraftItemAmt(d),
  gstPercent: d.gstPercent,
  plannedStart: d.plannedStart,
  plannedEnd: d.plannedEnd,
  stage: d.stage,
  status: existing?.status || "pending",
  completedQty: existing?.completedQty || 0,
  // Without this, saving ANY edit to an already-approved work order silently
  // resets "how much of this item has already been billed" back to zero —
  // even though nothing about its actual billing changed — which then lets
  // already-paid progress look unbilled again and get re-requested for billing.
  lastBilledQty: existing?.lastBilledQty || 0,
  progressEntries: existing?.progressEntries || [],
  // Preserve each particular's own recorded progress by id — otherwise saving
  // an edit (even just changing the rate) would silently wipe out completed
  // quantities and progress history already logged against it.
  subItems: d.subItems.map(si => {
    const existingSub = existing?.subItems.find(es => es.id === si.id);
    return {
      id: si.id,
      ...(existingSub ? { _id: existingSub.id } : {}),
      description: si.description,
      remarks: si.remarks || "",
      unit: resolveUnit(si.unit, si.customUnit),
      plannedQty: si.plannedQty || 0,
      rate: si.rate || 0,
      amount: calcSubItemAmt(si),
      plannedStart: si.plannedStart || "",
      plannedEnd: si.plannedEnd || "",
      status: existingSub?.status || "pending",
      completedQty: existingSub?.completedQty || 0,
      lastBilledQty: existingSub?.lastBilledQty || 0,
      progressEntries: existingSub?.progressEntries || [],
    };
  }),
});

// ── UnitCell ─────────────────────────────────────────────────

function UnitCell({
  unit, customUnit,
  onChange,
}: {
  unit: string;
  customUnit: string;
  onChange: (patch: { unit?: string; customUnit?: string }) => void;
}) {
  if (unit === "custom") {
    return (
      <div className="flex items-center gap-1">
        <input
          placeholder="Type unit (e.g. bags, trips)"
          value={customUnit}
          onChange={e => onChange({ customUnit: e.target.value })}
          className="w-full h-9 px-2.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        <button type="button" onClick={() => onChange({ unit: "sq.ft", customUnit: "" })} className="text-gray-400 hover:text-gray-600 shrink-0 px-1">
          ✕
        </button>
      </div>
    );
  }
  return (
    <SField
      value={unit}
      onChange={v => onChange({ unit: v, customUnit: "" })}
      options={UNIT_OPTIONS}
    />
  );
}

// ── ScopeItemsBuilder ─────────────────────────────────────────

interface CatOption {
  _id: string; name: string; parentId?: string | null; isActive: boolean; color?: string;
}

// Sub-category / sub-sub-category picker that lets the user type a name that
// isn't in the default list and add it on the fly (POST /categories) instead
// of being limited to whatever an admin pre-configured on the Categories page.
// SField's plain search-and-pick doesn't support this "create new" affordance,
// so this stays a bespoke local widget rather than forcing it onto SField.
function CategoryCreatableSelect({
  value, placeholder, options, parentId, parentColor, onSelect, onClear, onCreated,
}: {
  value?: string;
  placeholder: string;
  options: { label: string; value: string }[];
  parentId: string;
  parentColor?: string;
  onSelect: (id: string, name: string) => void;
  onClear: () => void;
  onCreated: (cat: CatOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const trimmed = search.trim();
  const filtered = trimmed
    ? options.filter(o => o.label.toLowerCase().includes(trimmed.toLowerCase()))
    : options;
  const exists = trimmed.length > 0 && options.some(o => o.label.toLowerCase() === trimmed.toLowerCase());
  const showCreateOption = trimmed.length > 0 && !exists;
  const selected = options.find(o => o.value === value);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await createCategory({ name: trimmed, color: parentColor || "#6B7280", parentId });
      const newCat = res.data.category as CatOption;
      onCreated(newCat);
      // Pass the name straight from the API response — appending to allCategories
      // via onCreated() above is a state update, so any lookup by id in the
      // caller's onSelect would still see the pre-update array on this render.
      onSelect(newCat._id, newCat.name);
      toast.success(`Added "${newCat.name}"`);
      setOpen(false);
      setSearch("");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to add new option");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full h-9 px-2.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      >
        <span className={selected ? "text-[#1A1A2E] dark:text-[#F1F5F9] truncate" : "text-gray-400 truncate"}>
          {selected ? selected.label : placeholder}
        </span>
        {selected ? (
          <span onClick={(e) => { e.stopPropagation(); onClear(); setSearch(""); }} className="text-gray-400 hover:text-gray-600 shrink-0">✕</span>
        ) : (
          <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-1 w-full min-w-[220px] bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700/40">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Type a name…"
                className="w-full text-sm bg-transparent outline-none text-[#1A1A2E] dark:text-[#F1F5F9] placeholder:text-gray-400"
              />
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onSelect(o.value, o.label); setSearch(""); setOpen(false); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left text-[#1A1A2E]! dark:text-[#F1F5F9]! hover:bg-gray-50 dark:hover:bg-gray-700/40"
                >
                  {o.label}
                  {o.value === value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              ))}
              {filtered.length === 0 && !showCreateOption && (
                <div className="px-3 py-2 text-sm text-gray-400">Type a name to add it</div>
              )}
              {showCreateOption && (
                <button
                  type="button"
                  disabled={creating}
                  onClick={handleCreate}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-primary! hover:bg-primary/5 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add "{trimmed}" as new option
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface ScopeItemsBuilderProps {
  items: ScopeItemDraft[];
  onChange: (items: ScopeItemDraft[]) => void;
  allCategories?: CatOption[];
  topCatId?: string | null;
  onCategoryCreated?: (cat: CatOption) => void;
  gstPercent?: number;
}

function ScopeItemsBuilder({ items, onChange, allCategories = [], topCatId = null, onCategoryCreated = () => {}, gstPercent = 18 }: ScopeItemsBuilderProps) {
  const upd = (id: string, patch: Partial<ScopeItemDraft>) =>
    onChange(items.map(it => it.id === id ? { ...it, ...patch } : it));

  const subCatOptions = topCatId
    ? allCategories.filter(c => c.isActive && c.parentId === topCatId)
    : [];

  const getSubSubCatOptions = (subCatId: string) =>
    allCategories.filter(c => c.isActive && c.parentId === subCatId);

  const updSub = (itemId: string, subId: string, patch: Partial<ScopeSubItemDraft>) =>
    onChange(items.map(it =>
      it.id === itemId
        ? { ...it, subItems: it.subItems.map(si => si.id === subId ? { ...si, ...patch } : si) }
        : it
    ));

  const removeSub = (itemId: string, subId: string) =>
    onChange(items.map(it =>
      it.id === itemId
        ? { ...it, subItems: it.subItems.filter(si => si.id !== subId) }
        : it
    ));

  const addSub = (itemId: string) =>
    onChange(items.map(it =>
      it.id === itemId
        ? { ...it, subItems: [...it.subItems, newSubDraft()], showSubItems: true }
        : it
    ));

  const total = calcTotalAmt(items);
  const totalInclGst = calcTotalInclGst(items);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">Scope of Work</div>
        <Btn small outline icon={Plus} label="Add Work Item" onClick={() => onChange([...items, newItemDraft(gstPercent)])} />
      </div>

      {items.length === 0 && (
        <EmptyState icon={ClipboardList} title="No work items yet" message='Click "Add Work Item" to define the scope.' />
      )}

      {items.map((item, idx) => (
        <div key={item.id} className="border border-gray-200 dark:border-gray-700/40 rounded-lg mb-3 overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800/40 px-3.5 py-2 flex items-center gap-2 border-b border-gray-200 dark:border-gray-700/40">
            <span className="bg-primary text-white rounded-full w-[22px] h-[22px] inline-flex items-center justify-center text-[11px] font-bold shrink-0">
              {idx + 1}
            </span>
            <span className="font-semibold text-[13px] flex-1 text-[#1A1A2E] dark:text-[#F1F5F9] truncate">
              {item.description || `Work Item ${idx + 1}`}
            </span>
            {calcDraftItemAmt(item) > 0 && (
              <span className="font-mono text-primary font-bold text-[13px]">{fmt(calcDraftItemAmt(item))}</span>
            )}
            <button
              type="button"
              title="Insert a new work item below this one"
              onClick={() => {
                const i = items.findIndex(it => it.id === item.id);
                const next = [...items];
                next.splice(i + 1, 0, newItemDraft(gstPercent));
                onChange(next);
              }}
              className="text-primary hover:bg-primary/10 rounded p-1"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => onChange(items.filter(it => it.id !== item.id))} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded p-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3.5 pb-2.5">
            {(() => {
              const hasSubSub = subCatOptions.length > 0 && !!item.subCategoryId &&
                getSubSubCatOptions(item.subCategoryId).length > 0;

              const amtBox = () => (
                <div className="bg-primary/5 border border-primary/20 rounded-md px-2.5 py-1.5 font-mono font-bold text-primary text-xs min-h-[36px] flex items-center">
                  {calcDraftItemAmt(item) > 0 ? fmt(calcDraftItemAmt(item)) : "—"}
                </div>
              );

              const unitQtyRateCols = (
                <>
                  <div>
                    <div className="text-[11px] text-gray-400 mb-1">Unit</div>
                    <UnitCell unit={item.unit} customUnit={item.customUnit} onChange={patch => upd(item.id, patch)} />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-400 mb-1">Planned Qty</div>
                    <Field type="number" min="0" placeholder="Qty" value={item.plannedQty ?? ""} onChange={e => upd(item.id, { plannedQty: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-400 mb-1">Rate (₹)</div>
                    <Field type="number" min="0" placeholder="Rate" value={item.rate ?? ""} onChange={e => upd(item.id, { rate: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-400 mb-1">Amount</div>
                    {amtBox()}
                  </div>
                </>
              );

              if (hasSubSub) {
                return (
                  <>
                    <div>
                      <div className="text-[11px] text-gray-400 mb-1">Sub-Category *</div>
                      <CategoryCreatableSelect
                        placeholder="Select or type to add sub-category"
                        value={item.subCategoryId || undefined}
                        options={subCatOptions.map(c => ({ label: c.name, value: c._id }))}
                        parentId={topCatId || ""}
                        parentColor={allCategories.find(c => c._id === topCatId)?.color}
                        onSelect={(v, name) => upd(item.id, { subCategoryId: v, subSubCategoryId: "", description: name })}
                        onClear={() => upd(item.id, { subCategoryId: "", subSubCategoryId: "", description: "" })}
                        onCreated={onCategoryCreated}
                      />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-2">
                      <div>
                        <div className="text-[11px] text-gray-400 mb-1">Sub-Sub-Category</div>
                        <CategoryCreatableSelect
                          placeholder="Select or type to add (optional)"
                          value={item.subSubCategoryId || undefined}
                          options={getSubSubCatOptions(item.subCategoryId).map(c => ({ label: c.name, value: c._id }))}
                          parentId={item.subCategoryId}
                          parentColor={allCategories.find(c => c._id === item.subCategoryId)?.color}
                          onSelect={(v, name) => upd(item.id, { subSubCategoryId: v, description: name || item.description })}
                          onClear={() => { const subCat = allCategories.find(c => c._id === item.subCategoryId); upd(item.id, { subSubCategoryId: "", description: subCat?.name ?? "" }); }}
                          onCreated={onCategoryCreated}
                        />
                      </div>
                      {unitQtyRateCols}
                    </div>
                  </>
                );
              }

              return (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div>
                    {subCatOptions.length > 0 ? (
                      <>
                        <div className="text-[11px] text-gray-400 mb-1">Sub-Category *</div>
                        <CategoryCreatableSelect
                          placeholder="Select or type to add sub-category"
                          value={item.subCategoryId || undefined}
                          options={subCatOptions.map(c => ({ label: c.name, value: c._id }))}
                          parentId={topCatId || ""}
                          parentColor={allCategories.find(c => c._id === topCatId)?.color}
                          onSelect={(v, name) => upd(item.id, { subCategoryId: v, subSubCategoryId: "", description: name })}
                          onClear={() => upd(item.id, { subCategoryId: "", subSubCategoryId: "", description: "" })}
                          onCreated={onCategoryCreated}
                        />
                      </>
                    ) : (
                      <>
                        <div className="text-[11px] text-gray-400 mb-1">Description *</div>
                        <Field placeholder="e.g. Raft Area, Plaster Works, HT Panel..." value={item.description} onChange={e => upd(item.id, { description: e.target.value })} />
                      </>
                    )}
                  </div>
                  {unitQtyRateCols}
                </div>
              );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 mt-2 items-end">
              <div>
                <div className="text-[11px] text-gray-400 mb-1">GST %</div>
                <GstSelect value={item.gstPercent} onChange={v => upd(item.id, { gstPercent: v })} />
              </div>
              <div className="sm:col-span-4 pb-2 text-xs text-gray-600 dark:text-gray-300">
                Amount incl. GST: <strong className="text-primary font-mono">
                  {calcDraftItemAmt(item) > 0 ? fmt(calcDraftItemInclGst(item)) : "—"}
                </strong>
              </div>
            </div>

            <div className="mt-2">
              <div className="text-[11px] text-gray-400 mb-1">Notes / Remarks (optional)</div>
              <Field placeholder="e.g. RCC wall, 1st floor, upto 300MM…" value={item.remarks} onChange={e => upd(item.id, { remarks: e.target.value })} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 mt-2.5 items-end">
              <div>
                <div className="text-[11px] text-gray-400 mb-1">Start Date <span className="text-red-500">*</span></div>
                <DatePicker value={item.plannedStart} onChange={v => upd(item.id, { plannedStart: v })} />
              </div>
              <div>
                <div className="text-[11px] text-gray-400 mb-1">End Date <span className="text-red-500">*</span></div>
                <DatePicker value={item.plannedEnd} onChange={v => upd(item.id, { plannedEnd: v })} />
              </div>
              <div className="sm:col-span-2 pb-1">
                <button
                  type="button"
                  onClick={() => upd(item.id, { showSubItems: !item.showSubItems })}
                  className="text-gray-500 dark:text-gray-400 text-xs font-semibold hover:text-gray-700 dark:hover:text-gray-200"
                >
                  {item.showSubItems ? "Hide" : "Add"} Particulars
                  {item.subItems.length > 0 && <span className="ml-1.5"><Badge color="blue" small>{item.subItems.length}</Badge></span>}
                </button>
              </div>
            </div>

            {item.showSubItems && (
              <div className="mt-3 bg-gray-50/60 dark:bg-gray-800/20 border border-gray-200 dark:border-gray-700/40 rounded-md p-3">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                  Particulars — Reference Only, Not Included in Contract Value
                </div>
                <div className="text-gray-400 text-[11px] mb-2.5">
                  The main item's own Qty/Rate/Amount above drive the contract value. Particulars are just a descriptive breakdown for this item.
                </div>

                {item.subItems.length === 0 && (
                  <div className="text-gray-400 text-xs mb-2">No sub-items yet.</div>
                )}

                {item.subItems.map((si, siIdx) => (
                  <div key={si.id} className="mb-2 bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-md p-2.5">
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className="text-[11px] text-gray-400 min-w-[22px] font-semibold">{idx + 1}.{siIdx + 1}</span>
                      <input
                        placeholder="Sub-item description"
                        value={si.description}
                        onChange={e => updSub(item.id, si.id, { description: e.target.value })}
                        className="flex-[2] min-w-[200px] h-8 px-2.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                      {si.unit === "custom" ? (
                        <input
                          placeholder="Type unit"
                          value={si.customUnit}
                          onChange={e => updSub(item.id, si.id, { customUnit: e.target.value })}
                          className="w-[180px] h-8 px-2.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                      ) : (
                        <div className="w-[180px]">
                          <SField value={si.unit} onChange={v => updSub(item.id, si.id, { unit: v, customUnit: "" })} options={UNIT_OPTIONS} />
                        </div>
                      )}
                      <input
                        type="number" placeholder="Qty" min={0}
                        value={si.plannedQty ?? ""}
                        onChange={e => updSub(item.id, si.id, { plannedQty: e.target.value === "" ? null : Number(e.target.value) })}
                        className="w-[85px] h-8 px-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                      <input
                        type="number" placeholder="Rate ₹" min={0}
                        value={si.rate ?? ""}
                        onChange={e => updSub(item.id, si.id, { rate: e.target.value === "" ? null : Number(e.target.value) })}
                        className="w-[95px] h-8 px-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                      <div className="font-mono font-bold text-primary text-xs min-w-[85px] text-right">
                        {calcSubItemAmt(si) > 0 ? fmt(calcSubItemAmt(si)) : "—"}
                      </div>
                      <button type="button" onClick={() => removeSub(item.id, si.id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded p-1 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex gap-2 items-center mt-1.5 flex-wrap">
                      <span className="text-[11px] text-gray-400 min-w-[60px]">Start Date</span>
                      <div className="w-[140px]"><DatePicker value={si.plannedStart} onChange={v => updSub(item.id, si.id, { plannedStart: v })} /></div>
                      <span className="text-[11px] text-gray-400 min-w-[50px]">End Date</span>
                      <div className="w-[140px]"><DatePicker value={si.plannedEnd} onChange={v => updSub(item.id, si.id, { plannedEnd: v })} /></div>
                    </div>
                    <input
                      placeholder="Remarks (optional)"
                      value={si.remarks}
                      onChange={e => updSub(item.id, si.id, { remarks: e.target.value })}
                      className="w-full mt-1.5 h-8 px-2.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                ))}

                <Btn small outline icon={Plus} label="Add Sub-Item" onClick={() => addSub(item.id)} />
              </div>
            )}
          </div>
        </div>
      ))}

      {items.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3.5">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-600 dark:text-gray-300">
              Contract Value ({items.length} item{items.length !== 1 ? "s" : ""}) — Excl. GST
            </span>
            <span className="font-mono font-bold text-gray-600 dark:text-gray-300 text-sm">{total > 0 ? fmt(total) : "—"}</span>
          </div>
          <div className="flex justify-between items-center mt-2.5">
            <span className="font-semibold text-gray-600 dark:text-gray-300">GST (per work item, see above)</span>
            <span className="font-mono text-gray-600 dark:text-gray-300 text-[13px]">{total > 0 ? fmt(totalInclGst - total) : "—"}</span>
          </div>
          <div className="flex justify-between items-center mt-2.5 pt-2.5 border-t border-primary/20">
            <span className="font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">Total Contract Value — Incl. GST</span>
            <span className="font-mono font-bold text-primary text-base">{total > 0 ? fmt(totalInclGst) : "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DeliverablesBuilder — the Professional Services equivalent of
// ScopeItemsBuilder: Deliverable / Stage / Due Date / Amount, no qty/rate/
// unit/sub-category tree. Each row is still a ScopeItemDraft under the hood
// (plannedQty pinned to 1, unit "lump-sum", the fee entered directly as
// "rate") so calcTotalAmt/calcTotalInclGst/draftToNewItem/mergeWithExisting
// all keep working unchanged. ─────────────────────────────────

const STAGE_SUGGESTIONS = ["Concept", "Design Development", "Design Review", "Client Approval", "Final Submission"];

// A free-text input with a suggestions popover, not a picker-only SField —
// deliverable stages are project-specific, so whatever's typed is the value
// as-is; the suggestions are just a shortcut for the common ones.
function StageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = value
    ? STAGE_SUGGESTIONS.filter(s => s.toLowerCase().includes(value.toLowerCase()))
    : STAGE_SUGGESTIONS;

  return (
    <div className="relative" ref={rootRef}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Select or type a stage"
        className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg shadow-lg overflow-hidden py-1 max-h-56 overflow-y-auto">
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => { onChange(s); setOpen(false); }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] text-left text-[#1A1A2E]! dark:text-[#F1F5F9]! hover:bg-gray-50 dark:hover:bg-gray-700/40"
            >
              {s}
              {s === value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DeliverablesBuilder({ items, onChange, gstPercent = 18 }: {
  items: ScopeItemDraft[];
  onChange: (items: ScopeItemDraft[]) => void;
  gstPercent?: number;
}) {
  const upd = (id: string, patch: Partial<ScopeItemDraft>) =>
    onChange(items.map(it => it.id === id ? { ...it, ...patch } : it));

  const total = calcTotalAmt(items);
  const totalInclGst = calcTotalInclGst(items);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">Deliverables</div>
        <Btn small outline icon={Plus} label="Add Deliverable" onClick={() => onChange([...items, newDeliverableDraft(gstPercent)])} />
      </div>

      {items.length === 0 && (
        <EmptyState icon={ClipboardList} title="No deliverables yet" message='Click "Add Deliverable" to define the scope of this engagement.' />
      )}

      {items.map((item, idx) => (
        <div key={item.id} className="border border-gray-200 dark:border-gray-700/40 rounded-lg mb-2.5 p-3.5">
          <div className="grid grid-cols-2 sm:grid-cols-[24px_2fr_1fr_90px_140px_130px_28px] gap-2.5 items-end">
            <div className="hidden sm:flex items-center pb-2">
              <span className="bg-purple-600 text-white rounded-full w-[22px] h-[22px] inline-flex items-center justify-center text-[11px] font-bold">{idx + 1}</span>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Deliverable *</div>
              <Field placeholder="e.g. Façade Concept Design" value={item.description} onChange={e => upd(item.id, { description: e.target.value })} />
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Stage</div>
              <StageField value={item.stage || ""} onChange={v => upd(item.id, { stage: v })} />
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">GST</div>
              <GstSelect value={item.gstPercent} onChange={v => upd(item.id, { gstPercent: v })} />
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Due Date</div>
              <DatePicker value={item.plannedEnd} onChange={v => upd(item.id, { plannedEnd: v })} />
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Amount (₹) *</div>
              <Field type="number" min="0" placeholder="Fee" value={item.rate ?? ""} onChange={e => upd(item.id, { rate: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
            <button type="button" onClick={() => onChange(items.filter(it => it.id !== item.id))} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded p-1.5 justify-self-end">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-2.5">
            <Field
              textarea rows={3}
              label="Remarks (optional)"
              placeholder={"Brief notes on this deliverable's scope — one point per line, e.g.\n- Includes 2 rounds of design revisions\n- Excludes structural drawings\n- Site visits billed separately"}
              value={item.remarks}
              onChange={e => upd(item.id, { remarks: e.target.value })}
            />
          </div>
        </div>
      ))}

      {items.length > 0 && (
        <div className="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-lg p-3.5">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-600 dark:text-gray-300">
              Total Fee ({items.length} deliverable{items.length !== 1 ? "s" : ""}) — Excl. GST
            </span>
            <span className="font-mono font-bold text-gray-600 dark:text-gray-300 text-sm">{total > 0 ? fmt(total) : "—"}</span>
          </div>
          <div className="flex justify-between items-center mt-2.5 pt-2.5 border-t border-purple-200 dark:border-purple-500/30">
            <span className="font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">Total Fee — Incl. GST</span>
            <span className="font-mono font-bold text-purple-600 text-base">{total > 0 ? fmt(totalInclGst) : "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FormSection — a bordered, labeled section wrapper used to group the
// Create/Edit Work Order drawers into the same named blocks (Work Order
// Information / Work Items / Payment Terms / Notes & Attachments) as the
// reference layout, without touching what's inside.
function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700/40 rounded-lg px-4 pt-4 pb-1 mb-4">
      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-3.5">{title}</div>
      {children}
    </div>
  );
}

// ── WOFormFields ──────────────────────────────────────────────
// A single controlled form-values object replaces the antd Form instance this
// used to share with its parent — `values`/`onChange` here play exactly the
// role `form`'s watches/setFieldsValue/getFieldValue used to.

interface WOFormValues {
  contractType: string;
  workOrderNo: string;
  companyId: string;
  projectId: string;
  projectName: string;
  projectLocation: string;
  issueDate: string;
  vendorCode: string;
  category: string;
  subCategory: string;
  department: string;
  customDepartment: string;
  status: string;
  gstPercent: number;
  retentionPercent: number;
  assignedDRI: string[];
  vendorName: string;
  ownerName: string;
  mobile: string;
  issuedUnder: string;
  description: string;
  totalTenure: string;
  documents: WODocument[];
  internalRemark: string;
}

const blankWOForm = (): WOFormValues => ({
  contractType: "execution", workOrderNo: "", companyId: "", projectId: "", projectName: "",
  projectLocation: "", issueDate: "", vendorCode: "", category: "", subCategory: "",
  department: "", customDepartment: "",
  status: "draft", gstPercent: 18, retentionPercent: 0, assignedDRI: [], vendorName: "",
  ownerName: "", mobile: "", issuedUnder: "company", description: "", totalTenure: "",
  documents: [], internalRemark: "",
});

function WOFormFields({
  values, onChange, errors, isEdit = false, nextWONo, nextCWONo,
  contractorsList, consultantsList, projectsList, categoriesList, companiesList = [],
  driList = [], agmGmList = [], preparedByName, preparedByContact, onExtracted,
  onDocsUploadingChange,
}: {
  values: WOFormValues;
  onChange: (patch: Partial<WOFormValues>) => void;
  errors?: Partial<Record<"projectId" | "issueDate" | "vendorCode" | "description", string>>;
  isEdit?: boolean;
  nextWONo: string;
  nextCWONo: string;
  contractorsList: Contractor[];
  consultantsList: Consultant[];
  projectsList: Project[];
  categoriesList: { _id: string; name: string; isActive: boolean; parentId?: string | null }[];
  companiesList?: any[];
  driList?: { _id: string; name: string; email: string }[];
  agmGmList?: { _id: string; name: string; email: string }[];
  preparedByName?: string;
  preparedByContact?: string;
  // Scope items / milestones / warranty live in the parent's own state, not
  // this form — extraction hands the full result up so the parent can apply
  // those pieces itself, while this component applies the plain form fields.
  onExtracted?: (data: AiExtractedWorkOrder) => void;
  // Lets the parent (Save button) know a document upload is in flight, so it
  // can't be saved mid-upload — see DocumentsUpload's own onUploadingChange.
  onDocsUploadingChange?: (uploading: boolean) => void;
}) {
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState("");
  const isProfessionalServices = values.contractType === "professional-services";

  const handleExtract = async () => {
    const target = [...values.documents].reverse().find(d => /\.(pdf|jpe?g|png)$/i.test(d.name));
    if (!target) {
      toast.error("Upload a PDF or image document above first");
      return;
    }
    setExtracting(true);
    setExtractNote("");
    try {
      // target.url is the Cloudinary secure_url — hand it to the backend to
      // fetch and re-encode itself (a browser-side fetch of a cross-origin
      // Cloudinary asset is exactly the kind of thing CORS blocks).
      const res = await apiClient.post<{ extracted: AiExtractedWorkOrder }>("/ai/extract-work-order", {
        documentUrl: target.url,
        fileName: target.name,
      });
      const data = res.data.extracted;
      onChange({
        description:      data.scopeOfWork || values.description,
        totalTenure:       data.totalTenure || values.totalTenure,
        issueDate:         data.issueDate ? dayjs(data.issueDate).format("YYYY-MM-DD") : values.issueDate,
        retentionPercent: data.retentionPercent ?? values.retentionPercent,
        gstPercent:        data.gstPercent ?? values.gstPercent,
      });
      onExtracted?.(data);
      if (data.extractionNotes) setExtractNote(data.extractionNotes);
      toast.success(
        `Extracted ${data.scopeItems?.length ?? 0} scope item(s) and ${data.paymentMilestones?.length ?? 0} payment milestone(s) — review before saving`
      );
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(e?.response?.data?.message || e?.message || "AI extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const fillVendor = (vendorCode: string) => {
    const c = contractorsList.find(x => x.vendorCode === vendorCode);
    onChange({ vendorCode, ...(c ? { vendorName: c.companyName, ownerName: c.ownerName, mobile: c.mobile } : {}) });
  };

  const fillConsultant = (consultantCode: string) => {
    const c = consultantsList.find(x => x.consultantCode === consultantCode);
    onChange({ vendorCode: consultantCode, ...(c ? { vendorName: c.firmName, ownerName: c.principalName, mobile: c.mobile } : {}) });
  };

  const fillProject = (projectId: string) => {
    const p = projectsList.find(x => (x as any)._id === projectId || x.id === projectId);
    onChange({ projectId, ...(p ? { projectName: p.name } : {}) });
  };

  return (
    <>
      {preparedByName && (
        <div className="flex gap-5 flex-wrap mb-4 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/40 rounded-lg px-3.5 py-2">
          <span>Prepared By: <strong className="text-[#1A1A2E] dark:text-[#F1F5F9]">{preparedByName}</strong></span>
          {preparedByContact && <span>Contact: <strong className="text-[#1A1A2E] dark:text-[#F1F5F9]">{preparedByContact}</strong></span>}
        </div>
      )}

      <div className="mb-4">
        <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">Contract Type</span>
        {isEdit ? (
          <Badge color={isProfessionalServices ? "purple" : "blue"}>
            {isProfessionalServices ? "Professional Services Contract" : "Execution Contract"}
          </Badge>
        ) : (
          <Segmented
            value={values.contractType}
            onChange={(v) => onChange({ contractType: v, vendorCode: "", vendorName: "", ownerName: "", mobile: "" })}
            options={[
              { value: "execution", label: "Execution Contract" },
              { value: "professional-services", label: "Professional Services Contract" },
            ]}
          />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Field
          label={isProfessionalServices ? "Consultancy Order Number" : "Work Order Number"}
          placeholder={isEdit ? undefined : `Auto-assign: ${isProfessionalServices ? nextCWONo : nextWONo}`}
          disabled={isEdit}
          maxLength={20}
          value={values.workOrderNo}
          onChange={e => onChange({ workOrderNo: e.target.value })}
          hint={!isEdit ? `Leave blank to auto-assign (${isProfessionalServices ? nextCWONo : nextWONo})` : undefined}
        />
        <SField
          label="Issuing Company"
          placeholder="Select company (optional)"
          value={values.companyId}
          onChange={v => onChange({ companyId: v })}
          options={[{ value: "", label: "— None —" }, ...companiesList.filter((c: any) => c.isActive).map((c: any) => ({ label: `${c.shortCode} – ${c.name}`, value: c._id }))]}
          hint="Which Neoteric entity is issuing this work order? (printed on the WO PDF)"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <SField
            label="Project" required
            placeholder="Select project"
            value={values.projectId}
            onChange={fillProject}
            options={selectableProjects(projectsList).map(p => ({ label: p.name, value: (p as any)._id || p.id }))}
            error={errors?.projectId}
          />
        </div>
        <div>
          <DatePicker label="Issue Date *" value={values.issueDate} onChange={v => onChange({ issueDate: v })} />
          {errors?.issueDate && <span className="block text-xs text-red-500 mt-1">{errors.issueDate}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <Field
          label="Location" placeholder="e.g. Tower A, Ground Floor"
          value={values.projectLocation} onChange={e => onChange({ projectLocation: e.target.value })}
          hint="Exact site location for this work order (e.g. tower, plot no., landmark)"
        />
        <SField
          label="Department"
          placeholder="Select department (optional)"
          value={values.department}
          onChange={v => onChange({ department: v, ...(v !== "custom" ? { customDepartment: "" } : {}) })}
          options={[
            { value: "", label: "— None —" },
            { value: "civil", label: "Civil Team" },
            { value: "marketing", label: "Marketing Team" },
            { value: "planning", label: "Planning Team" },
            { value: "maintenance", label: "Maintenance Team" },
            { value: "custom", label: "Custom Team" },
          ]}
        />
      </div>

      {values.department === "custom" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field
            label="Custom Team Name"
            placeholder="e.g. Legal, IT, Procurement"
            value={values.customDepartment}
            onChange={e => onChange({ customDepartment: e.target.value })}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <SField
          label={isProfessionalServices ? "Consultant" : "Vendor Code"} required
          placeholder={isProfessionalServices ? "Select consultant" : "Select vendor"}
          value={values.vendorCode}
          onChange={isProfessionalServices ? fillConsultant : fillVendor}
          options={isProfessionalServices
            ? consultantsList.map(c => ({ label: `${c.consultantCode} — ${c.firmName}`, value: c.consultantCode }))
            // Archived (inactive) vendors shouldn't be pickable for a new/changed
            // assignment — but keep the already-selected one visible so editing an
            // existing WO whose vendor has since gone inactive doesn't blank out.
            : contractorsList
                .filter(c => c.status !== 'inactive' || c.vendorCode === values.vendorCode)
                .map(c => ({ label: `${c.vendorCode} — ${vendorLabel(c.companyName, c.shortCode)}`, value: c.vendorCode }))}
          error={errors?.vendorCode}
        />
        <SField
          label="Category"
          placeholder="Select category (optional)"
          value={values.category}
          onChange={v => onChange({ category: v })}
          options={isProfessionalServices
            ? [{ value: "", label: "— None —" }, { value: "Planning", label: "Planning" }, { value: "Services", label: "Services" }]
            : [{ value: "", label: "— None —" }, ...categoriesList.filter(c => c.isActive && !c.parentId).map(c => ({ label: c.name, value: c.name }))]}
        />
      </div>

      <div className={`grid grid-cols-1 ${isProfessionalServices ? "" : "sm:grid-cols-2"} gap-4 mt-4`}>
        <div>
          <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">GST Slab</span>
          <GstSelect value={values.gstPercent} onChange={v => onChange({ gstPercent: v })} />
        </div>
        {/* No retention/hold for a professional-services engagement — there's
            no defect-liability-period measurement concept to hold security
            against. Value stays in state (still saved as 0/whatever it last
            was) even while not rendered here. */}
        {!isProfessionalServices && (
          <SField
            label="Retention / Hold %"
            value={String(values.retentionPercent)}
            onChange={v => onChange({ retentionPercent: Number(v) })}
            options={[
              { label: "0% — No retention", value: "0" },
              { label: "2.5%", value: "2.5" },
              { label: "5%", value: "5" },
              { label: "10%", value: "10" },
              { label: "15%", value: "15" },
              { label: "20%", value: "20" },
            ]}
            hint="% of each bill withheld until work completion (e.g. 5%)"
          />
        )}
      </div>

      {(isProfessionalServices ? agmGmList : driList).length > 0 && (
        <div className="mt-4">
          <MultiSelect
            label={isProfessionalServices ? "Assign" : "Assign DRI (Site Engineer)"}
            placeholder={isProfessionalServices ? "Select AGM/GM to assign (optional)" : "Select DRI(s) to assign (optional)"}
            values={values.assignedDRI}
            onChange={v => onChange({ assignedDRI: v })}
            options={(isProfessionalServices ? agmGmList : driList).map(d => ({ label: `${d.name} (${d.email})`, value: d._id }))}
          />
        </div>
      )}

      <div className="bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 my-4">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-3">
          {isProfessionalServices ? "Auto-filled from Consultant Master" : "Auto-filled from Contractor Master"}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2.5">
          <Field label={isProfessionalServices ? "Firm Name" : "Company Name"} disabled value={values.vendorName} onChange={() => {}} />
          <Field label={isProfessionalServices ? "Principal Name" : "Owner Name"} disabled value={values.ownerName} onChange={() => {}} />
        </div>
        <Field label="Mobile" disabled value={values.mobile} onChange={() => {}} />
      </div>

      <div className="mb-4">
        <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">Work Order Issued Under</span>
        <Segmented
          value={values.issuedUnder}
          onChange={v => onChange({ issuedUnder: v })}
          options={[
            { value: "company", label: `Company Name${values.vendorName ? ` (${values.vendorName})` : ""}` },
            { value: "owner", label: `Owner Name${values.ownerName ? ` (${values.ownerName})` : ""}` },
          ]}
        />
        <span className="block text-[11px] text-gray-400 mt-1">
          Whether this work order is drawn up in the contractor's company/firm name or their personal (owner) name — affects the printed WO PDF only, not the contractor record itself.
        </span>
      </div>

      <div className="mb-4">
        <Field
          textarea required label="Overall Description / Scope of Work"
          placeholder="e.g. Supply and installation of false ceiling including framework, boarding and finishing as per approved drawings..."
          value={values.description} onChange={e => onChange({ description: e.target.value })}
          error={errors?.description}
          hint="Describe the full scope of this work order — printed as the Work Title / Scope on the downloaded PDF"
        />
      </div>

      <div className="mb-4">
        <Field
          label="Total Tenure of Entire Work" placeholder="e.g. 45 Days, 3 Months"
          value={values.totalTenure} onChange={e => onChange({ totalTenure: e.target.value })}
          hint="Overall time allotted to complete this work order — shown in the PDF under Project Details"
        />
      </div>

      <div className="mb-4">
        <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">Upload Work Order Documents</span>
        <DocumentsUpload value={values.documents} onChange={docs => onChange({ documents: docs })} onUploadingChange={onDocsUploadingChange} />
      </div>

      <div className="mb-4">
        <Field
          textarea label="Remarks" placeholder="e.g. Site access via rear gate only, coordinate with security…"
          value={values.internalRemark} onChange={e => onChange({ internalRemark: e.target.value })}
          hint="A general note on this work order — shown in the detail view and printed on the WO PDF under Project Details"
        />
      </div>

      {!isEdit && (
        <div className="mb-5">
          <Btn outline icon={Zap} loading={extracting} label="Extract with AI" onClick={handleExtract} />
          <span className="ml-2.5 text-[11.5px] text-gray-400">
            Reads an uploaded PDF/image and auto-fills scope, dates, BOQ items & payment milestones below — always review before saving.
          </span>
          {extractNote && (
            <div className="mt-2.5">
              <Alert type="warning" message="AI extraction notes — please verify" description={extractNote} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function WorkItems() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const isOwner = user?.role === "owner";
  const [searchParams] = useSearchParams();
  // Two sidebar nav items ("Work Orders" / "Consultancy Orders") both land
  // here, pre-filtered via ?type= — one shared list/table, not a second page.
  const [contractTypeFilter, setContractTypeFilter] = useState<"all" | "execution" | "professional-services">(
    (searchParams.get("type") as "execution" | "professional-services" | null) || "all"
  );
  // Switching between those two nav items doesn't remount this component
  // (same route, only the query string differs) — the useState initializer
  // above only ever runs once, so without this the filter would silently
  // stay stuck on whichever one was active when the page first mounted.
  useEffect(() => {
    const type = searchParams.get("type");
    setContractTypeFilter(type === "execution" || type === "professional-services" ? type : "all");
  }, [searchParams]);
  const [monthlyReportOpen, setMonthlyReportOpen] = useState(false);

  const { categories: apiCategories, setCategories: setApiCategories } = useCategories();
  const handleCategoryCreated = (cat: CatOption) => setApiCategories(prev => [...prev, cat as any]);

  const [workOrders,   setWorkOrders]   = useState<WorkOrder[]>([]);
  const [contractors,  setContractors]  = useState<Contractor[]>([]);
  const [consultants,  setConsultants]  = useState<Consultant[]>([]);
  const [projects,     setProjects]     = useState<Project[]>([]);
  const [companies,    setCompanies]    = useState<any[]>([]);
  const [driList,      setDriList]      = useState<{ _id: string; name: string; email: string }[]>([]);
  const [agmGmList,    setAgmGmList]    = useState<{ _id: string; name: string; email: string }[]>([]);
  const [loadingData,  setLoadingData]  = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [pdfLoading,   setPdfLoading]   = useState(false);
  // A document upload still in flight when Save is clicked — blocking the
  // save here means it can never end up with a document entry that has a
  // name but no file behind it (see DocumentsUpload's own onUploadingChange).
  const [createDocsUploading, setCreateDocsUploading] = useState(false);
  const [editDocsUploading,   setEditDocsUploading]   = useState(false);

  const [createDrawerOpen,    setCreateDrawerOpen]    = useState(false);
  const [search,              setSearch]              = useState("");
  const [statusFilter,        setStatusFilter]        = useState<string>("all");
  const [stepFilter,          setStepFilter]          = useState<string>("all");
  const [categoryFilter,      setCategoryFilter]      = useState<string>("all");
  const [deptFilter,          setDeptFilter]          = useState<string>("all");
  const [progressFilter,      setProgressFilter]      = useState<string>("all");
  const [projectFilter,       setProjectFilter]       = useState<string[]>([]);
  const [dateFrom,            setDateFrom]            = useState<Dayjs | null>(null);
  const [dateTo,              setDateTo]              = useState<Dayjs | null>(null);

  // Last-clicked work order — feeds both the progress-recording flow below and
  // the View Drawer.
  const [selectedWOId, setSelectedWOId] = useState<string | null>(null);
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [woBillsMap,   setWoBillsMap]   = useState<Record<string, { status: string; amount: number }[]>>({});
  const [docsRecord,   setDocsRecord]   = useState<WorkOrder | null>(null);
  const [cancelRecord,    setCancelRecord]    = useState<WorkOrder | null>(null);
  const [cancelRemark,    setCancelRemark]    = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [lockTarget, setLockTarget] = useState<WorkOrder | null>(null);
  const [lockSaving, setLockSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkOrder | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const currentSelectedWO = useMemo(
    () => workOrders.find(wo => wo.id === selectedWOId) || null,
    [workOrders, selectedWOId]
  );

  const [editWOId,       setEditWOId]       = useState<string | null>(null);
  const [editModalOpen,  setEditModalOpen]  = useState(false);
  const [editScopeItems, setEditScopeItems] = useState<ScopeItemDraft[]>([]);
  const currentEditWO = useMemo(
    () => workOrders.find(wo => wo.id === editWOId) || null,
    [workOrders, editWOId]
  );

  const [createScopeItems, setCreateScopeItems] = useState<ScopeItemDraft[]>([]);
  // Kept for parity — currently unreachable in this file's own UI (nothing
  // sets progressItem/progressModalOpen truthy; progress is recorded via the
  // separate Work Progress module now), but left wired rather than removed
  // since nothing marks this dead the way the old ScopeItemsViewer was.
  const [progressItem,     setProgressItem]     = useState<ScopeItem | null>(null);
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [progressDate, setProgressDate] = useState("");
  const [progressQty, setProgressQty] = useState<number | null>(null);
  const [progressRemarks, setProgressRemarks] = useState("");
  const progressErrors = useFormErrors<"date" | "qtyAdded">();

  const [createMilestones, setCreateMilestones] = useState<MilestoneDraft[]>([]);
  const [editMilestones,   setEditMilestones]   = useState<MilestoneDraft[]>([]);

  const [createSecurityDeposits, setCreateSecurityDeposits] = useState<SecurityDepositDraft[]>([]);
  const [editSecurityDeposits,   setEditSecurityDeposits]   = useState<SecurityDepositDraft[]>([]);
  const [createDiscount,   setCreateDiscount]   = useState<number | null>(null);
  const [editDiscount,     setEditDiscount]     = useState<number | null>(null);
  const [createWarranty,   setCreateWarranty]   = useState<string[]>([]);
  const [editWarranty,     setEditWarranty]     = useState<string[]>([]);

  const [createValues, setCreateValues] = useState<WOFormValues>(blankWOForm());
  const [editValues,   setEditValues]   = useState<WOFormValues>(blankWOForm());
  const createErrors = useFormErrors<"projectId" | "issueDate" | "vendorCode" | "description">();
  const editErrors   = useFormErrors<"projectId" | "issueDate" | "vendorCode" | "description">();

  const patchCreate = (patch: Partial<WOFormValues>) => setCreateValues(prev => ({ ...prev, ...patch }));
  const patchEdit    = (patch: Partial<WOFormValues>) => setEditValues(prev => ({ ...prev, ...patch }));

  const createCatName = createValues.category;
  const editCatName   = editValues.category;
  const createGstPercent = createValues.gstPercent ?? 18;
  const editGstPercent   = editValues.gstPercent ?? 18;
  const createContractType = createValues.contractType ?? "execution";
  const editContractType   = editValues.contractType ?? "execution";

  // ── Load all data ─────────────────────────────────────────────
  // Each fetch settles independently — one endpoint failing (e.g. a role
  // lacking some unrelated permission) must not blank out data the other
  // calls already fetched successfully.
  useEffect(() => {
    const calls = [
      apiClient.get<{ workOrders: any[] }>("/work-orders")
        .then(r => setWorkOrders(r.data.workOrders.map(normalizeWO))),
      apiClient.get<{ contractors: any[] }>("/contractors")
        .then(r => setContractors(r.data.contractors.map(normalizeId))),
      apiClient.get<{ consultants: any[] }>("/consultants")
        .then(r => setConsultants(r.data.consultants.map(normalizeId))),
      apiClient.get<{ projects: any[] }>("/projects")
        .then(r => setProjects(r.data.projects.map(normalizeId))),
      apiClient.get<{ companies: any[] }>("/companies")
        .then(r => setCompanies(r.data.companies ?? [])),
      apiClient.get<{ users: any[] }>("/auth/users?role=site-dri")
        .then(r => setDriList(r.data.users ?? [])),
      apiClient.get<{ users: any[] }>("/auth/users?role=agm,gm")
        .then(r => setAgmGmList(r.data.users ?? [])),
      apiClient.get<{ bills: any[] }>("/bills")
        .then(r => {
          const billMap: Record<string, { status: string; amount: number }[]> = {};
          (r.data.bills ?? []).forEach((b: any) => {
            const wid = b.workOrderId;
            if (!wid) return;
            (billMap[wid] ||= []).push({ status: b.status, amount: b.amount });
          });
          setWoBillsMap(billMap);
        }),
    ];
    Promise.allSettled(calls).finally(() => setLoadingData(false));
  }, []);

  // ── Derived ──────────────────────────────────────────────────

  const createTopCatId = useMemo(
    () => apiCategories.find(c => !c.parentId && c.name === createCatName)?._id ?? null,
    [createCatName, apiCategories]
  );
  const editTopCatId = useMemo(
    () => apiCategories.find(c => !c.parentId && c.name === editCatName)?._id ?? null,
    [editCatName, apiCategories]
  );

  // AI Document Intelligence — applies the parts of an extraction result that
  // live outside WOFormFields' own controlled values (scope items / milestones
  // / warranty terms are their own component state).
  function applyAiExtraction(data: AiExtractedWorkOrder) {
    if (data.scopeItems?.length) {
      setCreateScopeItems(data.scopeItems.map(item => {
        const { unit, customUnit } = matchUnit(item.unit);
        return {
          ...newItemDraft(createGstPercent),
          description: item.description || "",
          unit, customUnit,
          plannedQty: item.plannedQty ?? null,
          rate: item.rate ?? null,
        };
      }));
    }
    if (data.warrantyTerms?.length) setCreateWarranty(data.warrantyTerms.filter(Boolean));
  }

  // Derive category tree for filter logic
  const topLevelCats = useMemo(() => apiCategories.filter(c => !c.parentId), [apiCategories]);
  const allSubCats   = useMemo(() => apiCategories.filter(c => !!c.parentId),  [apiCategories]);
  const subCatsOfSelected = useMemo(() => {
    if (categoryFilter === "all") return [];
    const parent = topLevelCats.find(c => c.name === categoryFilter);
    return parent ? allSubCats.filter(c => c.parentId === parent._id) : [];
  }, [categoryFilter, topLevelCats, allSubCats]);

  // Source of truth for "does this Work Order already have a bill" — any
  // bill at all (draft through paid, not just paid), since a generated bill
  // already exists against it either way. `woBillsMap` is keyed by
  // workOrderId from the same `/bills` fetch the monthly report's "Billed"
  // column already uses, so this doesn't introduce a new data source.
  const hasBill = (woId: string) => (woBillsMap[woId]?.length ?? 0) > 0;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return workOrders.filter(wo => {
      // Search
      const matchSearch =
        !q ||
        wo.workOrderNo.toLowerCase().includes(q) ||
        wo.projectName.toLowerCase().includes(q) ||
        wo.vendorCode.toLowerCase().includes(q) ||
        wo.vendorName.toLowerCase().includes(q);

      // Status (stat-card shortcut) — "in-progress" also covers "issued".
      // Draft/In Progress are specifically the "no bill generated yet"
      // buckets — once any bill exists for a Work Order (any status, not
      // just paid), it's no longer "unbilled work" for this purpose, so it
      // drops out of both, matching statusCounts below.
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "in-progress"
          ? (wo.status === "in-progress" || wo.status === "issued") && !hasBill(wo.id)
          : statusFilter === "draft"
            ? wo.status === "draft" && !hasBill(wo.id)
            : wo.status === statusFilter);

      // Step (approval-chain pill toggle)
      const matchStep = stepFilter === "all" || approvalStatusOf(wo) === stepFilter;

      // Category (matches the parent category or any of its sub-categories)
      let matchCategory = true;
      if (categoryFilter !== "all") {
        const childNames = subCatsOfSelected.map(c => c.name);
        matchCategory = wo.category === categoryFilter || childNames.includes(wo.subCategory ?? "");
      }

      // Progress
      let matchProgress = true;
      if (progressFilter !== "all") {
        const items = wo.scopeItems || [];
        if (progressFilter === "not-started") {
          matchProgress = items.length === 0 || items.every(i => i.status === "pending");
        } else if (progressFilter === "running") {
          matchProgress = items.some(i => i.status === "running");
        } else if (progressFilter === "completed") {
          matchProgress = wo.status === "completed" ||
            (items.length > 0 && items.every(i => i.status === "completed"));
        } else if (progressFilter === "overdue") {
          matchProgress = countDelays(wo) > 0;
        } else if (progressFilter === "cancelled") {
          matchProgress = wo.status === "cancelled";
        }
      }

      const matchDate    = inDateRange(wo.issueDate, dateFrom, dateTo);
      const matchProject = projectFilter.length === 0 || projectFilter.includes(getWorkOrderProjectId(wo.projectId) ?? "");
      const matchContractType = contractTypeFilter === "all" || (wo.contractType || "execution") === contractTypeFilter;
      const matchDept = deptFilter === "all" || (wo.department || "") === deptFilter;
      return matchSearch && matchStatus && matchStep && matchCategory && matchProgress && matchDate && matchProject && matchContractType && matchDept;
    }).sort((a, b) => {
      const numA = parseInt(a.workOrderNo.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.workOrderNo.replace(/\D/g, ""), 10) || 0;
      return numB - numA;
    });
  }, [workOrders, search, statusFilter, stepFilter, categoryFilter, deptFilter, progressFilter, projectFilter, subCatsOfSelected, dateFrom, dateTo, contractTypeFilter, woBillsMap]);

  // Stat-card counts — computed off the full unfiltered list (matching the
  // "shortcut filter" convention used elsewhere, e.g. Projects' StatCard
  // row), not the already-filtered list, so clicking one always shows the
  // true total for that bucket.
  const statusCounts = useMemo(() => {
    const c = { total: workOrders.length, draft: 0, inProgress: 0, completed: 0 };
    for (const wo of workOrders) {
      // A Work Order that already has a generated bill (any status — this
      // isn't limited to "paid") is no longer unbilled work, so it drops out
      // of Draft/In Progress entirely rather than counting toward either.
      if (wo.status === "completed") c.completed++;
      else if (wo.status === "cancelled") continue;
      else if (hasBill(wo.id)) continue;
      else if (wo.status === "draft") c.draft++;
      else c.inProgress++;
    }
    return c;
  }, [workOrders, woBillsMap]);

  // Step pill counts — one per stage of the real approval chain (see
  // APPROVAL_STATUS_CFG's `level` field, L1=draft through L4=pending-final).
  const stepCounts = useMemo(() => {
    const c: Record<string, number> = { approved: 0 };
    for (const key of STEP_KEYS) c[key] = 0;
    for (const wo of workOrders) {
      const st = approvalStatusOf(wo);
      if (st in c) c[st]++;
    }
    return c;
  }, [workOrders]);

  // Rolls the currently-filtered work orders up by issue month — respects
  // every filter above (project/category/date-range/contract type/etc.) so
  // this is "the current view, summarized by month" rather than a separate
  // unfiltered report.
  const monthlyReport = useMemo(() => {
    const map = new Map<string, {
      key: string; label: string; count: number; contractValue: number;
      draft: number; issued: number; inProgress: number; completed: number; cancelled: number;
      billed: number;
    }>();
    for (const wo of filtered) {
      const key = dayjs(wo.issueDate).format("YYYY-MM");
      if (!map.has(key)) {
        map.set(key, {
          key, label: dayjs(wo.issueDate).format("MMMM YYYY"),
          count: 0, contractValue: 0, draft: 0, issued: 0, inProgress: 0, completed: 0, cancelled: 0, billed: 0,
        });
      }
      const row = map.get(key)!;
      row.count += 1;
      row.contractValue += wo.contractValue || 0;
      if (wo.status === "draft") row.draft += 1;
      else if (wo.status === "issued") row.issued += 1;
      else if (wo.status === "in-progress") row.inProgress += 1;
      else if (wo.status === "completed") row.completed += 1;
      else if (wo.status === "cancelled") row.cancelled += 1;
      row.billed += (woBillsMap[wo.id] || []).reduce((s, b) => s + (b.amount || 0), 0);
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [filtered, woBillsMap]);

  const monthlyReportTotals = useMemo(() => monthlyReport.reduce((acc, r) => ({
    count: acc.count + r.count,
    contractValue: acc.contractValue + r.contractValue,
    draft: acc.draft + r.draft, issued: acc.issued + r.issued,
    inProgress: acc.inProgress + r.inProgress, completed: acc.completed + r.completed,
    cancelled: acc.cancelled + r.cancelled, billed: acc.billed + r.billed,
  }), { count: 0, contractValue: 0, draft: 0, issued: 0, inProgress: 0, completed: 0, cancelled: 0, billed: 0 }), [monthlyReport]);

  const nextWONo = useMemo(() => {
    const max = workOrders.reduce((m, wo) => {
      const match = wo.workOrderNo.match(/^WO-(\d+)/);
      return match ? Math.max(m, parseInt(match[1])) : m;
    }, 0);
    return `WO-${String(max + 1).padStart(4, "0")}`;
  }, [workOrders]);

  const nextCWONo = useMemo(() => {
    const max = workOrders.reduce((m, wo) => {
      const match = wo.workOrderNo.match(/^CWO-(\d+)/);
      return match ? Math.max(m, parseInt(match[1])) : m;
    }, 0);
    return `CWO-${String(max + 1).padStart(4, "0")}`;
  }, [workOrders]);

  // Default DRI for new work orders — always pre-select dri1@neotericgrp.in
  const defaultDRIIds = useMemo(
    () => driList.filter(d => d.email === 'dri1@neotericgrp.in').map(d => d._id),
    [driList]
  );

  // ── Handlers ─────────────────────────────────────────────────

  function validateWOForm(values: WOFormValues, errs: ReturnType<typeof useFormErrors<"projectId" | "issueDate" | "vendorCode" | "description">>): boolean {
    errs.clearAll();
    let ok = true;
    if (!values.projectId) { errs.setError("projectId", "Select a project"); ok = false; }
    if (!values.issueDate) { errs.setError("issueDate", "Select issue date"); ok = false; }
    if (!values.vendorCode) { errs.setError("vendorCode", values.contractType === "professional-services" ? "Select a consultant" : "Select a vendor"); ok = false; }
    if (!values.description?.trim()) { errs.setError("description", "Required — this is printed as the Work Title / Scope on the WO PDF"); ok = false; }
    return ok;
  }

  const handleCreate = async () => {
    if (!validateWOForm(createValues, createErrors)) return;
    if (createDocsUploading) {
      toast.error("A document is still uploading — wait for it to finish before saving");
      return;
    }
    const values = createValues;
    const totalAmt  = calcTotalAmt(createScopeItems);
    const contractValueInclGst = calcTotalInclGst(createScopeItems);
    const milestonesTotal = calcGrandTotal(createMilestones);
    if (milestonesTotal > contractValueInclGst + 1) {
      toast.error(`Payment milestones total (${fmt(milestonesTotal)}) exceeds the scope of work's contract value incl. GST (${fmt(contractValueInclGst)})`);
      return;
    }
    if (values.contractType !== "professional-services" && createScopeItems.some(it => it.description.trim() && (!it.plannedStart || !it.plannedEnd))) {
      toast.error("Start Date and End Date are required for every work item");
      return;
    }
    const scopeOfWork = values.description!.trim();

    const body: Record<string, unknown> = {
      contractType: values.contractType || "execution",
      issueDate:    values.issueDate || dayjs().format("YYYY-MM-DD"),
      projectId:    values.projectId,
      projectName:  values.projectName || "",
      projectLocation: values.projectLocation || "",
      vendorCode:   values.vendorCode,
      vendorName:   values.vendorName  || "",
      ownerName:    values.ownerName   || "",
      mobile:       values.mobile      || "",
      issuedUnder:  values.issuedUnder || "company",
      category:     values.category    || "",
      subCategory:  values.subCategory  || "",
      department:   values.department  || "",
      customDepartment: values.department === "custom" ? (values.customDepartment?.trim() || "") : "",
      companyId:    values.companyId   || null,
      assignedDRI:  values.assignedDRI || [],
      description:  values.description?.trim() || "",
      totalTenure:  values.totalTenure?.trim() || "",
      internalRemark: values.internalRemark?.trim() || "",
      scopeOfWork,
      scopeItems:   createScopeItems.map(draftToNewItem),
      contractValue: totalAmt,
      discount:          createDiscount || 0,
      gstPercent:        values.gstPercent ?? 18,
      retentionPercent:  values.retentionPercent ?? 0,
      status:            values.status || "draft",
      preparedByName:    user?.name  || "",
      preparedByContact: user?.email || "",
      documents:         values.documents || [],
      paymentMilestones: createMilestones.map(milestoneDraftToPayload),
      securityDeposits:  createSecurityDeposits.map(d => securityDepositDraftToPayload(d, createScopeItems)),
      warrantyTerms:     createWarranty.filter(t => t.trim()),
    };
    if (values.workOrderNo?.trim()) body.workOrderNo = values.workOrderNo.trim();

    setSaving(true);
    try {
      const res = await apiClient.post<{ workOrder: WorkOrder }>("/work-orders", body);
      setWorkOrders(prev => [normalizeWO(res.data.workOrder), ...prev]);
      toast.success(`Work order ${res.data.workOrder.workOrderNo} created`);
      setCreateValues(blankWOForm());
      setCreateScopeItems([]);
      setCreateMilestones([]);
      setCreateSecurityDeposits([]);
      setCreateDiscount(null);
      setCreateWarranty([]);
      setCreateDrawerOpen(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to create work order");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = async (woIn: WorkOrder) => {
    // Must have the real document bytes before populating the form — otherwise saving
    // without touching the documents field would resubmit url-less entries and wipe
    // out the actual attached files on this work order.
    const wo = await ensureFullWorkOrder(woIn);
    setEditWOId(wo.id);
    editErrors.clearAll();
    setEditValues({
      contractType: wo.contractType || "execution",
      workOrderNo: wo.workOrderNo || "",
      companyId: (wo as any).companyId || "",
      projectId: getWorkOrderProjectId(wo.projectId) || "",
      projectName: wo.projectName || "",
      projectLocation: wo.projectLocation || "",
      issueDate: wo.issueDate ? dayjs(wo.issueDate).format("YYYY-MM-DD") : "",
      vendorCode: wo.vendorCode || "",
      category: wo.category || "",
      subCategory: wo.subCategory || "",
      department: wo.department || "",
      customDepartment: wo.customDepartment || "",
      status: wo.status || "draft",
      gstPercent: wo.gstPercent ?? 18,
      retentionPercent: (wo as any).retentionPercent ?? 0,
      assignedDRI: ((wo as any).assignedDRI || []).map((d: any) => d._id || d),
      vendorName: wo.vendorName || "",
      ownerName: wo.ownerName || "",
      mobile: wo.mobile || "",
      issuedUnder: wo.issuedUnder || "company",
      description: (wo as any).description || "",
      totalTenure: (wo as any).totalTenure || "",
      documents: wo.documents || [],
      internalRemark: (wo as any).internalRemark || "",
    });
    setEditScopeItems((wo.scopeItems || []).map(toDraft));
    setEditMilestones((wo.paymentMilestones || []).map(toMilestoneDraft));
    setEditSecurityDeposits((wo.securityDeposits || []).map(toSecurityDepositDraft));
    setEditDiscount(wo.discount || null);
    setEditWarranty(wo.warrantyTerms || []);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!currentEditWO) return;
    if (!validateWOForm(editValues, editErrors)) return;
    if (editDocsUploading) {
      toast.error("A document is still uploading — wait for it to finish before saving");
      return;
    }
    const values = editValues;

    const totalAmt    = calcTotalAmt(editScopeItems);
    const contractValueInclGst = calcTotalInclGst(editScopeItems);
    const milestonesTotal = calcGrandTotal(editMilestones);
    if (milestonesTotal > contractValueInclGst + 1) {
      toast.error(`Payment milestones total (${fmt(milestonesTotal)}) exceeds the scope of work's contract value incl. GST (${fmt(contractValueInclGst)})`);
      return;
    }
    if (values.contractType !== "professional-services" && editScopeItems.some(it => it.description.trim() && (!it.plannedStart || !it.plannedEnd))) {
      toast.error("Start Date and End Date are required for every work item");
      return;
    }
    const scopeOfWork = values.description!.trim();
    const savedItems  = editScopeItems.map(d => {
      const existing = currentEditWO.scopeItems.find(si => si.id === d.id);
      return mergeWithExisting(d, existing);
    });

    const body = {
      contractType: values.contractType || currentEditWO.contractType || "execution",
      projectId:    values.projectId,
      projectName:  values.projectName  || currentEditWO.projectName,
      projectLocation: values.projectLocation ?? currentEditWO.projectLocation ?? "",
      vendorCode:   values.vendorCode,
      vendorName:   values.vendorName   || currentEditWO.vendorName,
      ownerName:    values.ownerName    || currentEditWO.ownerName,
      mobile:       values.mobile       || currentEditWO.mobile,
      issuedUnder:  values.issuedUnder  || currentEditWO.issuedUnder || "company",
      category:     values.category     ?? currentEditWO.category ?? "",
      subCategory:  values.subCategory  ?? currentEditWO.subCategory ?? "",
      department:   values.department   ?? currentEditWO.department ?? "",
      customDepartment: (values.department ?? currentEditWO.department) === "custom"
        ? (values.customDepartment?.trim() || currentEditWO.customDepartment || "")
        : "",
      companyId:    values.companyId    ?? (currentEditWO as any).companyId ?? null,
      assignedDRI:  values.assignedDRI  ?? (currentEditWO as any).assignedDRI ?? [],
      issueDate:    values.issueDate || currentEditWO.issueDate,
      description:  values.description?.trim() || "",
      totalTenure:  values.totalTenure?.trim() || "",
      internalRemark: values.internalRemark?.trim() || "",
      scopeOfWork,
      scopeItems:   savedItems,
      contractValue: totalAmt,
      discount:          editDiscount || 0,
      gstPercent:        values.gstPercent ?? currentEditWO.gstPercent ?? 18,
      retentionPercent:  values.retentionPercent ?? (currentEditWO as any).retentionPercent ?? 0,
      status:            values.status,
      documents:         values.documents ?? currentEditWO.documents ?? [],
      paymentMilestones: editMilestones.map(milestoneDraftToPayload),
      securityDeposits:  editSecurityDeposits.map(d => securityDepositDraftToPayload(d, editScopeItems)),
      warrantyTerms:     editWarranty.filter(t => t.trim()),
    };

    setSaving(true);
    try {
      const res = await apiClient.put<{ workOrder: WorkOrder }>(`/work-orders/${currentEditWO.id}`, body);
      setWorkOrders(prev => prev.map(wo => wo.id === currentEditWO.id ? normalizeWO(res.data.workOrder) : wo));
      toast.success("Work order updated");
      setEditModalOpen(false);
      setEditWOId(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to update work order");
    } finally {
      setSaving(false);
    }
  };

  const handleAddProgress = async () => {
    progressErrors.clearAll();
    let ok = true;
    if (!progressDate) { progressErrors.setError("date", "Select date"); ok = false; }
    if (!progressQty || progressQty <= 0) { progressErrors.setError("qtyAdded", "Enter a valid quantity"); ok = false; }
    if (!ok || !currentSelectedWO || !progressItem) return;

    const body = {
      date:     progressDate || dayjs().format("YYYY-MM-DD"),
      qtyAdded: progressQty,
      remarks:  progressRemarks.trim() || undefined,
    };

    setSaving(true);
    try {
      const res = await apiClient.post<{ workOrder: WorkOrder }>(
        `/work-orders/${currentSelectedWO.id}/scope-items/${progressItem.id}/progress`,
        body
      );
      setWorkOrders(prev => prev.map(wo => wo.id === currentSelectedWO.id ? normalizeWO(res.data.workOrder) : wo));
      toast.success(`Progress recorded: +${(progressQty ?? 0).toLocaleString("en-IN")} ${progressItem.unit}`);
      setProgressModalOpen(false);
      setProgressItem(null);
      setProgressDate(""); setProgressQty(null); setProgressRemarks("");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to record progress");
    } finally {
      setSaving(false);
    }
  };

  // The work orders list omits each attached document's actual file content (some run
  // several MB as base64) to keep the list fast — screens that need the real bytes
  // (PDF download/merge, the Documents modal, the edit form) fetch the single work
  // order fresh first, but only when that WO actually has a document missing its url.
  const ensureFullWorkOrder = async (wo: WorkOrder): Promise<WorkOrder> => {
    const docs = getWorkOrderDocuments(wo);
    if (docs.length === 0 || docs.every(d => d.url)) return wo;
    const res = await apiClient.get<{ workOrder: WorkOrder }>(`/work-orders/${wo.id}`);
    const full = normalizeWO(res.data.workOrder);
    setWorkOrders(prev => prev.map(w => w.id === wo.id ? full : w));
    return full;
  };

  // Fetched fresh per download rather than kept in page-level state — the PDF
  // is an occasional action, and this keeps the approver name always current.
  async function fetchUserMap(): Promise<Record<string, string>> {
    try {
      const r = await apiClient.get<{ users: { _id?: string; id?: string; name?: string }[] }>("/auth/users");
      const map: Record<string, string> = {};
      (r.data.users || []).forEach(u => { const uid = u._id || u.id; if (uid && u.name) map[uid] = u.name; });
      return map;
    } catch {
      return {};
    }
  }

  const handleDownloadPDF = async (wo: WorkOrder) => {
    setPdfLoading(true);
    try {
      const company    = companies.find((c: any) => c._id === (wo as any).companyId) ?? null;
      const contractor = contractors.find(c => c.vendorCode === wo.vendorCode) ?? null;
      const userMap    = await fetchUserMap();
      const { downloadWorkOrderPDF } = await import("../../components/WorkOrderPDF");
      await downloadWorkOrderPDF({ ...wo, approvals: buildApprovals(wo, userMap) } as any, company, contractor as any);
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadPDFHindi = async (wo: WorkOrder) => {
    setPdfLoading(true);
    const toastId = toast.loading("Translating to Hindi…");
    try {
      const company    = companies.find((c: any) => c._id === (wo as any).companyId) ?? null;
      const contractor = contractors.find(c => c.vendorCode === wo.vendorCode) ?? null;
      const userMap    = await fetchUserMap();
      const { downloadWorkOrderPDFHindi } = await import("../../components/WorkOrderPDFHindi");
      await downloadWorkOrderPDFHindi({ ...wo, approvals: buildApprovals(wo, userMap) } as any, company, contractor as any);
    } catch {
      toast.error("Failed to generate Hindi PDF");
    } finally {
      toast.dismiss(toastId);
      setPdfLoading(false);
    }
  };

  const handleCancelWorkOrder = async () => {
    if (!cancelRecord) return;
    if (!cancelRemark.trim()) {
      toast.error("Please enter a remark for cancellation");
      return;
    }
    setCancelSubmitting(true);
    try {
      const res = await apiClient.patch<{ workOrder: WorkOrder }>(`/work-orders/${cancelRecord.id}/cancel`, { remark: cancelRemark.trim() });
      setWorkOrders(prev => prev.map(w => w.id === cancelRecord.id ? normalizeWO(res.data.workOrder) : w));
      toast.success(`Work order ${cancelRecord.workOrderNo} cancelled`);
      setCancelRecord(null);
      setCancelRemark("");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to cancel work order";
      toast.error(msg);
    } finally {
      setCancelSubmitting(false);
    }
  };

  async function confirmLockToggle() {
    if (!lockTarget) return;
    const locking = !lockTarget.isLocked;
    setLockSaving(true);
    try {
      const res = await apiClient.patch<{ workOrder: WorkOrder }>(`/work-orders/${lockTarget.id}/${locking ? "lock" : "unlock"}`);
      setWorkOrders(prev => prev.map(w => w.id === lockTarget.id ? normalizeWO(res.data.workOrder) : w));
      toast.success(`Work order ${lockTarget.workOrderNo} ${locking ? "locked" : "unlocked"}`);
      setLockTarget(null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to update lock status";
      toast.error(msg);
    } finally {
      setLockSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    try {
      await apiClient.delete(`/work-orders/${deleteTarget.id}`);
      setWorkOrders(prev => prev.filter(w => w.id !== deleteTarget.id));
      toast.success(`Work order ${deleteTarget.workOrderNo} deleted`);
      setDeleteTarget(null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Delete failed";
      toast.error(msg);
    } finally {
      setDeleteSaving(false);
    }
  }

  const hasActiveFilters =
    statusFilter !== "all" || stepFilter !== "all" || categoryFilter !== "all" || deptFilter !== "all" || progressFilter !== "all" ||
    projectFilter.length > 0 || search !== "";

  const clearAllFilters = () => {
    setSearch("");
    setStatusFilter("all"); setStepFilter("all");
    setCategoryFilter("all"); setDeptFilter("all"); setProgressFilter("all"); setProjectFilter([]);
  };

  const listPager = usePagination(filtered, 10);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        icon={Briefcase}
        title="Work Orders"
        subtitle="Define scope of work items, track progress per item, and flag overdue milestones."
        actions={
          <div className="flex items-center gap-2">
            <NxBtn color="secondary" icon={CalendarRange} label="Monthly Report" onClick={() => setMonthlyReportOpen(true)} />
            <NxBtn
              color="primary" icon={Plus}
              label={contractTypeFilter === "professional-services" ? "New Consultancy Order" : "New Work Order"}
              onClick={() => {
                setCreateValues({
                  ...blankWOForm(),
                  status: "draft",
                  assignedDRI: defaultDRIIds,
                  // Default to whichever type the list is currently filtered to
                  // (e.g. clicking "New" while viewing Consultancy Orders).
                  contractType: contractTypeFilter === "professional-services" ? "professional-services" : "execution",
                });
                createErrors.clearAll();
                setCreateScopeItems([]);
                setCreateMilestones([]);
                setCreateSecurityDeposits([]);
                setCreateDiscount(null);
                setCreateWarranty([]);
                setCreateDrawerOpen(true);
              }}
            />
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <NxStatCard label="Total Work Orders" value={statusCounts.total} icon={Briefcase} />
        <NxStatCard
          label="Draft" value={statusCounts.draft} icon={FileText}
          active={statusFilter === "draft"} onClick={() => setStatusFilter(statusFilter === "draft" ? "all" : "draft")}
        />
        <NxStatCard
          label="In Progress" value={statusCounts.inProgress} icon={PlayCircle}
          active={statusFilter === "in-progress"} onClick={() => setStatusFilter(statusFilter === "in-progress" ? "all" : "in-progress")}
        />
        <NxStatCard
          label="Completed" value={statusCounts.completed} icon={CheckCircle2}
          active={statusFilter === "completed"} onClick={() => setStatusFilter(statusFilter === "completed" ? "all" : "completed")}
        />
      </div>

      {/* Entire list surface — tabs, filters and the table itself — in one glass-panel
          shell, matching the app's sidebar/header treatment. */}
      <div className="bg-white/90 dark:bg-gray-800/95 backdrop-blur-xl border border-gray-100 dark:border-gray-700/50 rounded-xl shadow-sm p-5">
        {/* ── Tabs ────────────────────────────────────────────── */}
        <div className="flex items-center justify-end flex-wrap gap-2.5 mb-3">
          <Segmented
            value={contractTypeFilter}
            onChange={(v) => setContractTypeFilter(v)}
            options={[
              { label: "All", value: "all" },
              { label: "Execution", value: "execution" },
              { label: "Professional Services", value: "professional-services" },
            ]}
          />
        </div>

        {/* ── Filters ─────────────────────────────────────────── */}
        <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
          <div className="flex gap-2.5 items-center flex-wrap">
            <SearchFilter placeholder="Search by WO No, project, vendor…" value={search} onChange={setSearch} />

            <DropdownSelectFilter
              value={categoryFilter} onChange={setCategoryFilter} placeholder="All Categories"
              options={topLevelCats.filter(c => c.isActive).map(c => ({ label: c.name, value: c.name }))}
            />
            <DropdownSelectFilter
              value={deptFilter} onChange={setDeptFilter} placeholder="All Departments"
              options={[
                { label: "Civil Team", value: "civil" },
                { label: "Marketing Team", value: "marketing" },
                { label: "Planning Team", value: "planning" },
                { label: "Maintenance Team", value: "maintenance" },
                { label: "Custom Team", value: "custom" },
              ]}
            />
            <DropdownSelectFilter
              value={progressFilter} onChange={setProgressFilter} placeholder="All Progress"
              options={[
                { label: "Not Started", value: "not-started" }, { label: "In Progress", value: "running" },
                { label: "Completed", value: "completed" }, { label: "⚠ Overdue", value: "overdue" },
                { label: "Cancelled", value: "cancelled" },
              ]}
            />
            <div className="w-56">
              <MultiSelect
                values={projectFilter} onChange={setProjectFilter} placeholder="All Projects"
                options={selectableProjects(projects).map(p => ({ label: p.name, value: p.id }))}
              />
            </div>

            <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />

            {hasActiveFilters && <Btn small outline label="Clear all" onClick={clearAllFilters} />}

            <span className="ml-auto text-gray-400 text-xs whitespace-nowrap">
              {filtered.length} work order{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Active filter chips */}
          {hasActiveFilters && (
            <div className="flex gap-1.5 flex-wrap mt-2.5">
              {categoryFilter !== "all" && (
                <span className="bg-blue-50 dark:bg-blue-500/10 border border-blue-600 text-blue-600 text-[11px] px-2 py-0.5 rounded flex items-center gap-1">
                  Category: {categoryFilter}
                  <button type="button" onClick={() => setCategoryFilter("all")} className="text-blue-600">×</button>
                </span>
              )}
              {deptFilter !== "all" && (
                <span className="bg-purple-50 dark:bg-purple-500/10 border border-purple-600 text-purple-600 text-[11px] px-2 py-0.5 rounded flex items-center gap-1">
                  Department: {deptFilter === "civil" ? "Civil Team" : deptFilter === "marketing" ? "Marketing Team" : deptFilter === "planning" ? "Planning Team" : deptFilter === "maintenance" ? "Maintenance Team" : "Custom Team"}
                  <button type="button" onClick={() => setDeptFilter("all")} className="text-purple-600">×</button>
                </span>
              )}
              {progressFilter !== "all" && (
                <span className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-600 text-emerald-600 text-[11px] px-2 py-0.5 rounded flex items-center gap-1">
                  Progress: {progressFilter === "not-started" ? "Not Started" : progressFilter === "running" ? "In Progress" : progressFilter === "completed" ? "Completed" : progressFilter === "cancelled" ? "Cancelled" : "Overdue"}
                  <button type="button" onClick={() => setProgressFilter("all")} className="text-emerald-600">×</button>
                </span>
              )}
              {projectFilter.length > 0 && (
                <span className="bg-primary/10 border border-primary text-primary text-[11px] px-2 py-0.5 rounded flex items-center gap-1">
                  Project: {projectFilter.length === 1 ? (selectableProjects(projects).find(p => p.id === projectFilter[0])?.name ?? projectFilter[0]) : `${projectFilter.length} selected`}
                  <button type="button" onClick={() => setProjectFilter([])} className="text-primary">×</button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Step toggle row — one pill per real approval-chain stage (see
            APPROVAL_STATUS_CFG); clicking one filters the table below. */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setStepFilter("all")}
            className={
              stepFilter === "all"
                ? "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold theme-text"
                : "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-500! dark:text-gray-400!"
            }
            style={stepFilter === "all" ? { backgroundColor: "var(--theme-primary-tint)" } : undefined}
          >
            All Steps <span className="ml-1 opacity-75">{workOrders.length}</span>
          </button>
          {STEP_KEYS.map((key) => {
            const cfg = APPROVAL_STATUS_CFG[key];
            const active = stepFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStepFilter(active ? "all" : key)}
                className={
                  active
                    ? "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold theme-text"
                    : "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-500! dark:text-gray-400!"
                }
                style={active ? { backgroundColor: "var(--theme-primary-tint)" } : undefined}
              >
                {cfg.level} Pending <span className="ml-1 opacity-75">{stepCounts[key]}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setStepFilter(stepFilter === "approved" ? "all" : "approved")}
            className={
              stepFilter === "approved"
                ? "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold theme-text"
                : "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-500! dark:text-gray-400!"
            }
            style={stepFilter === "approved" ? { backgroundColor: "var(--theme-primary-tint)" } : undefined}
          >
            Approved <span className="ml-1 opacity-75">{stepCounts.approved}</span>
          </button>
        </div>

        {/* Table — no horizontal scrollbar: every column gets a percentage
            width (summing to 100%) so the row always fits the container's
            width. Vertical scroll only, via Table's own containerClassName
            (fixed height + overflow-y-auto on the SAME div that already
            handles horizontal overflow — kept at 0 here since nothing
            overflows) so there's still just one scroll container, not a
            nested one. Safe to scroll now that DropdownMenu renders its
            popup via a portal (see ui/DropdownMenu.tsx) instead of getting
            clipped by this box. */}
        {
          loadingData ? (
            <Spinner size="large" />
          ) : filtered.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No work orders yet" message='Click "New Work Order" to create your first one.' />
          ) : (
            <>
              <Table containerClassName="h-[650px] overflow-y-auto" className="min-w-[1200px]">
                <Thead>
                  <Tr>
                    <Th className="w-[9%]">WO No</Th>
                    <Th className="w-[8%]">Date</Th>
                    <Th className="w-[10%]">Project</Th>
                    <Th className="w-[9%]">Category</Th>
                    <Th className="w-[8%]">Vendor Code</Th>
                    <Th className="w-[10%]">Company Name</Th>
                    <Th className="text-right w-[10%]">Contract Value</Th>
                    <Th className="w-[8%]">Status</Th>
                    <Th className="w-[8%]">Step</Th>
                    <Th className="w-[8%]">Created</Th>
                    <Th className="w-[12%]">Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {listPager.pageItems.map(record => {
                    const docCount = getWorkOrderDocuments(record).length;
                    const canCancel = record.status !== "cancelled" && record.status !== "completed";
                    const menuItems: DropdownMenuItem[] = [
                      { key: "pdf-hindi", label: "Download PDF (Hindi)", icon: FileText, onClick: () => handleDownloadPDFHindi(record) },
                      ...(docCount > 0 ? [{ key: "doc", label: `Documents (${docCount})`, icon: Paperclip, onClick: () => { ensureFullWorkOrder(record).then(setDocsRecord); } }] : []),
                      ...(isOwner ? [{ key: "lock-toggle", label: record.isLocked ? "Unlock Work Order" : "Lock Work Order", icon: record.isLocked ? Unlock : Lock, onClick: () => setLockTarget(record) }] : []),
                      ...(canCancel ? [{ key: "cancel", label: "Cancel Work Order", icon: Ban, danger: true, onClick: () => { setCancelRemark(""); setCancelRecord(record); } }] : []),
                    ];
                    const delays = countDelays(record);
                    return (
                      <Tr key={record.id} className="cursor-pointer" onClick={() => { setSelectedWOId(record.id); setDrawerOpen(true); }}>
                        <Td>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); navigate(`/work-items/${record.id}`); }}
                            className="font-bold text-primary"
                          >
                            {record.workOrderNo}
                          </button>
                        </Td>
                        <Td>{dayjs(record.issueDate).format("DD MMM YYYY")}</Td>
                        <Td>
                          <div>{record.projectName}</div>
                          {record.projectLocation && <div className="text-[11px] text-gray-400">{record.projectLocation}</div>}
                        </Td>
                        <Td>{record.category || <span className="text-gray-300">—</span>}</Td>
                        <Td>{record.vendorCode || <span className="text-gray-300">—</span>}</Td>
                        <Td>{record.vendorName}</Td>
                        <Td className="text-right font-bold">
                          {record.contractValue ? fmt(record.contractValue) : <span className="text-gray-300">—</span>}
                        </Td>
                        <Td>
                          <div className="flex gap-1.5 items-center flex-wrap">
                            <NxBadge color={displayStatus(record.status).color}>{displayStatus(record.status).label}</NxBadge>
                            {record.isLocked && (
                              <span title="Rates, scope items, milestones, and contract value are locked">
                                <Lock className="w-3.5 h-3.5 text-gray-400" />
                              </span>
                            )}
                            {delays > 0 && (
                              <span title={`${delays} scope item${delays > 1 ? "s" : ""} past their planned end date`}>
                                <NxBadge color="red"><span className="inline-flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> {delays} overdue</span></NxBadge>
                              </span>
                            )}
                          </div>
                        </Td>
                        <Td><StepBadge wo={record} /></Td>
                        <Td>
                          <div className="text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{record.createdAt ? dayjs(record.createdAt).format("DD MMM YYYY") : <span className="text-gray-300">—</span>}</div>
                          <div className="text-xs text-gray-400">by {(record.createdBy && typeof record.createdBy === "object" ? record.createdBy.name : undefined) || "—"}</div>
                        </Td>
                        <Td>
                          <div onClick={e => e.stopPropagation()} className="flex items-center gap-1">
                            <NxBtn color="icon-blue" title="View" icon={Eye} onClick={() => { setSelectedWOId(record.id); setDrawerOpen(true); }} />
                            <NxBtn color="icon-pink" title="Download PDF" icon={Download} loading={pdfLoading} onClick={() => handleDownloadPDF(record)} />
                            <NxBtn
                              color="icon-gray" title={record.isLocked ? "Locked — unlock to edit" : "Edit"} icon={Pencil}
                              disabled={record.isLocked} onClick={() => openEdit(record)}
                            />
                            {isOwner && (
                              <NxBtn color="icon-red" title="Delete" icon={Trash2} onClick={() => setDeleteTarget(record)} />
                            )}
                            {menuItems.length > 0 && <DropdownMenu items={menuItems} />}
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
              {listPager.totalPages > 1 && <div className="mt-4"><Pagination page={listPager.page} totalPages={listPager.totalPages} onChange={listPager.setPage} /></div>}
            </>
          )
        }
      </div>

      {/* ── Monthly Report Modal — same monthlyReport/monthlyReportTotals
          data as before, now opened by a button instead of a view toggle. */}
      {monthlyReportOpen && (
        <Modal icon={BarChart3} title="Monthly Report" subtitle="Work orders rolled up by issue month — respects the filters above" extraWide onClose={() => setMonthlyReportOpen(false)}>
          {loadingData ? (
            <Spinner size="large" />
          ) : monthlyReport.length === 0 ? (
            <EmptyState icon={BarChart3} title="No work orders match the current filters" />
          ) : (
            <Table className="min-w-[1100px]">
              <Thead>
                <Tr>
                  <Th stickyLeft className="w-[12%]">Month</Th>
                  <Th className="text-right w-[8%]">WOs</Th>
                  <Th className="text-right w-[16%]">Contract Value</Th>
                  <Th className="text-right w-[13%]">Billed</Th>
                  <Th className="text-right w-[10%]">Draft</Th>
                  <Th className="text-right w-[10%]">Issued</Th>
                  <Th className="text-right w-[10%]">In Progress</Th>
                  <Th className="text-right w-[11%]">Completed</Th>
                  <Th className="text-right w-[10%]">Cancelled</Th>
                </Tr>
              </Thead>
              <Tbody>
                {monthlyReport.map(r => (
                  <Tr key={r.key}>
                    <Td stickyLeft className="whitespace-nowrap"><strong>{r.label}</strong></Td>
                    <Td className="text-right whitespace-nowrap">{r.count}</Td>
                    <Td className="text-right font-mono whitespace-nowrap">{fmt(r.contractValue)}</Td>
                    <Td className="text-right font-mono text-emerald-600 font-semibold whitespace-nowrap">{fmt(r.billed)}</Td>
                    <Td className="text-right whitespace-nowrap">{r.draft}</Td>
                    <Td className="text-right whitespace-nowrap">{r.issued}</Td>
                    <Td className="text-right whitespace-nowrap">{r.inProgress}</Td>
                    <Td className="text-right whitespace-nowrap">{r.completed}</Td>
                    <Td className="text-right whitespace-nowrap">{r.cancelled}</Td>
                  </Tr>
                ))}
              </Tbody>
              <Tfoot>
                <Tr className="!bg-primary/5 font-bold">
                  <Td stickyLeft className="!bg-primary/5 whitespace-nowrap">Total</Td>
                  <Td className="text-right whitespace-nowrap">{monthlyReportTotals.count}</Td>
                  <Td className="text-right font-mono whitespace-nowrap">{fmt(monthlyReportTotals.contractValue)}</Td>
                  <Td className="text-right font-mono whitespace-nowrap">{fmt(monthlyReportTotals.billed)}</Td>
                  <Td className="text-right whitespace-nowrap">{monthlyReportTotals.draft}</Td>
                  <Td className="text-right whitespace-nowrap">{monthlyReportTotals.issued}</Td>
                  <Td className="text-right whitespace-nowrap">{monthlyReportTotals.inProgress}</Td>
                  <Td className="text-right whitespace-nowrap">{monthlyReportTotals.completed}</Td>
                  <Td className="text-right whitespace-nowrap">{monthlyReportTotals.cancelled}</Td>
                </Tr>
              </Tfoot>
            </Table>
          )}
        </Modal>
      )}

      {/* ── View Drawer ──────────────────────────────────────── */}
      {drawerOpen && (
        <Modal
          icon={ClipboardList}
          title={<>Work Order — <span className="text-primary">{currentSelectedWO?.workOrderNo}</span></>}
          subtitle={`${currentSelectedWO?.projectName ?? ""}${currentSelectedWO?.projectLocation ? ` — ${currentSelectedWO.projectLocation}` : ""}`}
          extraWide
          onClose={() => setDrawerOpen(false)}
          footer={
            <div className="flex justify-between gap-2 flex-wrap">
              <div className="flex gap-2">
                <Btn small outline icon={Download} loading={pdfLoading} label="PDF" onClick={() => currentSelectedWO && handleDownloadPDF(currentSelectedWO)} />
                <Btn small outline icon={Download} loading={pdfLoading} label="PDF (Hindi)" onClick={() => currentSelectedWO && handleDownloadPDFHindi(currentSelectedWO)} />
              </div>
              <div className="flex gap-2">
                {currentSelectedWO && <Btn outline label="Open Full Page →" onClick={() => { setDrawerOpen(false); navigate(`/work-items/${currentSelectedWO.id}`); }} />}
                {currentSelectedWO && <Btn outline icon={Pencil} label="Edit" onClick={() => { setDrawerOpen(false); openEdit(currentSelectedWO); }} />}
                <Btn outline label="Close" onClick={() => setDrawerOpen(false)} />
              </div>
            </div>
          }
        >
          {currentSelectedWO && (
            <WorkOrderDetailView
              workOrder={currentSelectedWO}
              bills={woBillsMap[currentSelectedWO.id] ?? []}
              onUpdated={(updated) => {
                const normalized = normalizeWO(updated as any);
                setWorkOrders(prev => prev.map(w => w.id === currentSelectedWO.id ? normalized : w));
              }}
            />
          )}
        </Modal>
      )}

      {/* ── Create Drawer ────────────────────────────────────── */}
      {createDrawerOpen && (
        <Modal
          icon={ClipboardList}
          title="New Work Order"
          subtitle="Select project & vendor, then define the scope of work"
          extraWide
          onClose={() => setCreateDrawerOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn
                outline label="Cancel"
                onClick={() => { setCreateValues(blankWOForm()); setCreateScopeItems([]); setCreateMilestones([]); setCreateSecurityDeposits([]); setCreateDiscount(null); setCreateWarranty([]); setCreateDrawerOpen(false); }}
              />
              <Btn color="primary" loading={saving} disabled={createDocsUploading} label="Save Work Order" onClick={handleCreate} />
            </div>
          }
        >
          <FormSection title="Work Order Information">
            <WOFormFields
              values={createValues}
              onChange={patchCreate}
              errors={createErrors.errors}
              nextWONo={nextWONo}
              nextCWONo={nextCWONo}
              contractorsList={contractors}
              consultantsList={consultants}
              projectsList={projects}
              categoriesList={apiCategories}
              companiesList={companies}
              driList={driList}
              agmGmList={agmGmList}
              preparedByName={user?.name}
              preparedByContact={user?.email}
              onExtracted={applyAiExtraction}
              onDocsUploadingChange={setCreateDocsUploading}
            />
          </FormSection>
          <FormSection title="Work Items">
            {createContractType === "professional-services" ? (
              <DeliverablesBuilder items={createScopeItems} onChange={setCreateScopeItems} gstPercent={createGstPercent} />
            ) : (
              <ScopeItemsBuilder
                items={createScopeItems} onChange={setCreateScopeItems}
                allCategories={apiCategories} topCatId={createTopCatId}
                onCategoryCreated={handleCategoryCreated} gstPercent={createGstPercent}
              />
            )}
          </FormSection>
          <FormSection title="Payment Terms">
            <PaymentMilestonesBuilder
              items={createMilestones} onChange={setCreateMilestones}
              contractValue={calcTotalAmt(createScopeItems)} contractValueInclGst={calcTotalInclGst(createScopeItems)}
              discount={createDiscount} onDiscountChange={setCreateDiscount}
              scopeItems={createScopeItems.map(si => ({ id: si.id, description: si.description }))}
            />
          </FormSection>
          <FormSection title="Security Deposit & Terms">
            <SecurityDepositBuilder
              items={createSecurityDeposits} onChange={setCreateSecurityDeposits}
              scopeItems={createScopeItems.map(si => ({ id: si.id, description: si.description, plannedQty: si.plannedQty, amount: calcDraftItemAmt(si) }))}
            />
            <div className="border-t border-gray-200 dark:border-gray-700/40 mt-4 pt-4">
              <WarrantyTermsBuilder items={createWarranty} onChange={setCreateWarranty} />
            </div>
          </FormSection>
        </Modal>
      )}

      {/* ── Edit Drawer ───────────────────────────────────────── */}
      {editModalOpen && (
        <Modal
          icon={Pencil}
          title={<>Edit Work Order — <span className="text-primary">{currentEditWO?.workOrderNo}</span></>}
          subtitle="Changes preserve existing progress data"
          extraWide
          onClose={() => { setEditModalOpen(false); setEditWOId(null); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setEditModalOpen(false); setEditWOId(null); }} />
              <Btn color="primary" loading={saving} disabled={editDocsUploading} label="Save Changes" onClick={handleSaveEdit} />
            </div>
          }
        >
          <FormSection title="Work Order Information">
            <WOFormFields
              values={editValues}
              onChange={patchEdit}
              errors={editErrors.errors}
              isEdit
              nextWONo={nextWONo}
              nextCWONo={nextCWONo}
              contractorsList={contractors}
              consultantsList={consultants}
              projectsList={projects}
              categoriesList={apiCategories}
              companiesList={companies}
              driList={driList}
              agmGmList={agmGmList}
              preparedByName={currentEditWO?.preparedByName}
              preparedByContact={currentEditWO?.preparedByContact}
              onDocsUploadingChange={setEditDocsUploading}
            />
          </FormSection>
          <FormSection title="Work Items">
            {editContractType === "professional-services" ? (
              <DeliverablesBuilder items={editScopeItems} onChange={setEditScopeItems} gstPercent={editGstPercent} />
            ) : (
              <ScopeItemsBuilder
                items={editScopeItems} onChange={setEditScopeItems}
                allCategories={apiCategories} topCatId={editTopCatId}
                onCategoryCreated={handleCategoryCreated} gstPercent={editGstPercent}
              />
            )}
          </FormSection>
          <FormSection title="Payment Terms">
            <PaymentMilestonesBuilder
              items={editMilestones} onChange={setEditMilestones}
              contractValue={calcTotalAmt(editScopeItems)} contractValueInclGst={calcTotalInclGst(editScopeItems)}
              discount={editDiscount} onDiscountChange={setEditDiscount}
              scopeItems={editScopeItems.map(si => ({ id: si.id, description: si.description }))}
            />
          </FormSection>
          <FormSection title="Security Deposit & Terms">
            <SecurityDepositBuilder
              items={editSecurityDeposits} onChange={setEditSecurityDeposits}
              scopeItems={editScopeItems.map(si => ({ id: si.id, description: si.description, plannedQty: si.plannedQty, amount: calcDraftItemAmt(si) }))}
            />
            <div className="border-t border-gray-200 dark:border-gray-700/40 mt-4 pt-4">
              <WarrantyTermsBuilder items={editWarranty} onChange={setEditWarranty} />
            </div>
          </FormSection>
        </Modal>
      )}

      {/* ── Progress Drawer (see note at progressItem's declaration — currently
          unreachable in this file's own UI, kept wired rather than removed) ── */}
      {progressModalOpen && (
        <Modal
          title="Record Progress"
          subtitle={progressItem?.description}
          onClose={() => { setProgressModalOpen(false); setProgressItem(null); setProgressDate(""); setProgressQty(null); setProgressRemarks(""); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setProgressModalOpen(false); setProgressItem(null); setProgressDate(""); setProgressQty(null); setProgressRemarks(""); }} />
              <Btn color="green" loading={saving} label="Record Progress" onClick={handleAddProgress} />
            </div>
          }
        >
          {progressItem && (
            <>
              <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg px-3.5 py-2.5 mb-5 text-xs">
                <div className="flex gap-5 flex-wrap mb-2">
                  <span><span className="text-gray-400">Planned: </span><strong>{(progressItem.plannedQty ?? 0).toLocaleString("en-IN")} {progressItem.unit}</strong></span>
                  <span><span className="text-gray-400">Completed: </span><strong className="text-emerald-600">{(progressItem.completedQty ?? 0).toLocaleString("en-IN")} {progressItem.unit}</strong></span>
                  <span><span className="text-gray-400">Remaining: </span><strong>{Math.max(0, progressItem.plannedQty - (progressItem.completedQty ?? 0)).toLocaleString("en-IN")} {progressItem.unit}</strong></span>
                </div>
                <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full ${isItemDelayed(progressItem) ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${getCompletionPct(progressItem)}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <DatePicker label="Date *" value={progressDate} onChange={setProgressDate} />
                  {progressErrors.errors.date && <span className="block text-xs text-red-500 mt-1">{progressErrors.errors.date}</span>}
                </div>
                <Field
                  label={`Qty Completed (${progressItem.unit})`} type="number" min="0.01" step="0.01"
                  hint={progressItem.unit === "per-hr" ? "e.g. 13.67 = 13 hr 40 min" : undefined}
                  placeholder={progressItem.unit === "per-hr" ? "e.g. 13.67" : "e.g. 3000"}
                  value={progressQty ?? ""} onChange={e => setProgressQty(e.target.value === "" ? null : Number(e.target.value))}
                  error={progressErrors.errors.qtyAdded}
                />
              </div>
              <Field textarea label="Remarks (optional)" placeholder="e.g. Zone B concrete poured, curing in progress…" value={progressRemarks} onChange={e => setProgressRemarks(e.target.value)} />
            </>
          )}
        </Modal>
      )}

      {docsRecord && (
        <Modal title={`Documents — ${docsRecord.workOrderNo ?? ""}`} onClose={() => setDocsRecord(null)}>
          <div className="flex flex-col gap-2">
            {getWorkOrderDocuments(docsRecord).map((d, i) => (
              <a
                key={i} href={d.url} target="_blank" rel="noreferrer" download={d.name}
                className="flex items-center gap-2 px-2.5 py-2 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/40 rounded-md text-sm text-[#1A1A2E] dark:text-[#F1F5F9]"
              >
                <Link2 className="w-4 h-4 text-gray-400" /> {d.name}
              </a>
            ))}
          </div>
        </Modal>
      )}

      {cancelRecord && (
        <Modal
          icon={Ban}
          title={`Cancel Work Order — ${cancelRecord.workOrderNo ?? ""}`}
          onClose={() => { setCancelRecord(null); setCancelRemark(""); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Back" onClick={() => { setCancelRecord(null); setCancelRemark(""); }} />
              <Btn color="red" loading={cancelSubmitting} disabled={!cancelRemark.trim()} label="Cancel Work Order" onClick={handleCancelWorkOrder} />
            </div>
          }
        >
          <p className="text-gray-600 dark:text-gray-300 mb-2.5 text-sm">
            This marks the work order as <strong>Cancelled</strong>. Existing bills/progress are not deleted, but no further
            progress or billing should be added against it. A remark is required.
          </p>
          <Field textarea placeholder="Reason for cancelling this work order…" value={cancelRemark} onChange={e => setCancelRemark(e.target.value)} />
        </Modal>
      )}

      {lockTarget && (
        <ConfirmModal
          title={lockTarget.isLocked ? `Unlock ${lockTarget.workOrderNo}?` : `Lock ${lockTarget.workOrderNo}?`}
          message={lockTarget.isLocked
            ? "This will allow rates, scope items, milestones, and contract value to be edited again."
            : "Once locked, its rates, scope items, milestones, and contract value can no longer be edited until it's unlocked again."}
          confirmLabel={lockTarget.isLocked ? "Unlock" : "Lock"}
          loading={lockSaving}
          onConfirm={confirmLockToggle}
          onCancel={() => setLockTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete ${deleteTarget.workOrderNo}?`}
          message="This permanently removes the work order and cannot be undone."
          confirmLabel="Yes, Delete"
          danger
          loading={deleteSaving}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
