import { useEffect, useMemo, useState } from "react";
import {
  Table,
  Button,
  Tag,
  Input,
  Form,
  Select,
  DatePicker,
  Drawer,
  Space,
  message,
  Row,
  Col,
  InputNumber,
  Progress,
  Tooltip,
  Spin,
  Dropdown,
  Modal,
  Alert,
  Radio,
  Segmented,
} from "antd";
import type { FormInstance, MenuProps } from "antd";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  LinkOutlined,
  DeleteOutlined,
  DownOutlined,
  UpOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  FilePdfOutlined,
  MoreOutlined,
  StopOutlined,
  LockOutlined,
  UnlockOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";

import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import type { AuthUser } from "../../context/AuthContext";
import { useCategories } from "../../hooks/useCategories";
import { createCategory } from "../../features/categories/api";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import { downloadWorkOrderPDF } from "../../components/WorkOrderPDF";
import { downloadWorkOrderPDFHindi } from "../../components/WorkOrderPDFHindi";
import { selectableProjects, getWorkOrderProjectId } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";
import PaymentMilestonesBuilder, { calcPayable, calcGrandTotal, newMilestone } from "../../components/PaymentMilestonesBuilder";
import type { MilestoneDraft } from "../../components/PaymentMilestonesBuilder";
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
  ScopeItemStatus,
  PaymentMilestone,
} from "../../types/VendorBilling";

// ── Constants ─────────────────────────────────────────────────

const STATUS_CFG: Record<WorkOrderStatus, { color: string; label: string }> = {
  draft:         { color: "default", label: "Draft" },
  issued:        { color: "blue",    label: "Issued" },
  "in-progress": { color: "orange",  label: "In Progress" },
  completed:     { color: "green",   label: "Completed" },
  cancelled:     { color: "red",     label: "Cancelled" },
};

const STATUS_OPTIONS = [
  { label: "Draft",       value: "draft" },
  { label: "Issued",      value: "issued" },
  { label: "In Progress", value: "in-progress" },
  { label: "Completed",   value: "completed" },
];

// A grant for module 'work-orders' with the given action name — Owner always
// bypasses, matching the identical pattern used on AccountsPayment's hasPerm.
function hasPerm(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return !!user.permissions?.find(p => p.module === "work-orders")?.actions.includes(action);
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

const approvalStatusOf = (wo: WorkOrder): WorkOrderApprovalStatus => wo.approvalStatus || "approved";

// makerBy/checkerBy/approverBy come back as raw ObjectId strings from
// listWorkOrders/getWorkOrder today (those fields aren't populated there) —
// only show a name when the backend happens to have populated it as an object.
function nameOfActor(v?: { _id: string; name: string; email?: string } | string): string | undefined {
  return v && typeof v === "object" ? v.name : undefined;
}

// Small muted sub-line under the approval pill: who acted last (which tells
// you who/what it's now waiting behind), shown only when that name is known.
function approvalSubline(wo: WorkOrder): string | undefined {
  const st = approvalStatusOf(wo);
  if (st === "pending-checker") {
    const n = nameOfActor(wo.makerBy);
    return n ? `Submitted by ${n}` : undefined;
  }
  if (st === "pending-approver") {
    const n = nameOfActor(wo.checkerBy);
    return n ? `Checked by ${n}` : undefined;
  }
  if (st === "pending-final") {
    const n = nameOfActor(wo.approverBy);
    return n ? `Approved by ${n}` : undefined;
  }
  if (st === "sent-back") {
    const last = [...(wo.approvalHistory || [])].reverse().find(h => h.action === "sent-back");
    if (!last) return undefined;
    const n = nameOfActor(last.by);
    return n ? `By ${n}${last.remarks ? " — " + last.remarks : ""}` : last.remarks;
  }
  return undefined;
}

function ApprovalStatusPill({ wo }: { wo: WorkOrder }) {
  const st = approvalStatusOf(wo);
  const cfg = APPROVAL_STATUS_CFG[st];
  const sub = approvalSubline(wo);
  return (
    <div>
      <Tag
        style={{
          background: "#F9FAFB",
          border: `1px solid ${cfg.color}`,
          color: cfg.color,
          fontWeight: 600,
          fontSize: 11,
          borderRadius: 6,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {cfg.level && (
          <span style={{ background: cfg.color, color: "#fff", borderRadius: 4, padding: "0 4px", fontSize: 9, fontWeight: 700, lineHeight: "14px" }}>
            {cfg.level}
          </span>
        )}
        {cfg.label}
      </Tag>
      {sub && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Pill tab bar ───────────────────────────────────────────────
// Same visual pattern as AccountsPayment's tab bar (pill buttons, soft green
// count badge) — kept local here since that component isn't exported.
interface WOTabDef { key: "all" | "pending"; label: string; count: number; }

function PillTabs({ tabs, active, onChange }: { tabs: WOTabDef[]; active: string; onChange: (k: "all" | "pending") => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {tabs.map(t => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "7px 15px", borderRadius: 20,
              border: isActive ? "1.5px solid #1a1f2e" : "1px solid transparent",
              background: isActive ? "var(--nx-white)" : "transparent",
              fontWeight: isActive ? 700 : 500,
              color: isActive ? "#1a1f2e" : "#6B7280",
              fontSize: 13, cursor: "pointer", outline: "none",
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{ background: "#DCFCE7", color: "#15803D", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const SCOPE_STATUS_CFG: Record<ScopeItemStatus, { color: string; bg: string; label: string }> = {
  pending:   { color: "#9ba3b8", bg: "#f5f6f8", label: "Pending" },
  running:   { color: "#f37916", bg: "#fff8f3", label: "Running" },
  completed: { color: "#16a85a", bg: "#f0faf4", label: "Completed" },
};

// ── Work Categories ───────────────────────────────────────────

// Categories are now loaded from API via useCategories() hook inside the component.

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

const delayDays = (item: ScopeItem): number =>
  Math.max(0, dayjs().diff(dayjs(item.plannedEnd), "day"));

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
function actorName(by: WorkOrder["makerBy"], userMap: Record<string, string>): string | undefined {
  if (!by) return undefined;
  if (typeof by === "string") return userMap[by];
  return by.name;
}

// No "maker" here, deliberately — the Maker is Neoteric staff entering the
// work order on the contractor's behalf, not the contractor themselves, so
// it's never bound to the PDF's Contractor signature slot (that stays a
// blank line for the contractor's own physical signature).
function buildApprovals(wo: WorkOrder, userMap: Record<string, string>) {
  return {
    checker:  wo.checkerBy       ? { name: actorName(wo.checkerBy, userMap),       at: wo.checkerAt }       : null,
    approver: wo.approverBy      ? { name: actorName(wo.approverBy, userMap),      at: wo.approverAt }      : null,
    final:    wo.finalApprovedBy ? { name: actorName(wo.finalApprovedBy, userMap), at: wo.finalApprovedAt } : null,
  };
}

const toMilestoneDraft = (pm: PaymentMilestone): MilestoneDraft => ({
  id: pm.id, stage: pm.stage, date: pm.date, type: pm.type,
  mode: pm.mode, amount: pm.amount,
  amountMode: pm.amountMode ?? "fixed", amountPercent: pm.amountPercent ?? null,
  gstPercent: pm.gstPercent,
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
});

const newSubDraft = (): ScopeSubItemDraft => ({
  id: crypto.randomUUID(),
  description: "", remarks: "", unit: "sq.ft", customUnit: "",
  plannedQty: null, rate: null,
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
      <Input
        placeholder="Type unit (e.g. bags, trips)"
        value={customUnit}
        onChange={e => onChange({ customUnit: e.target.value })}
        addonAfter={
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: "auto", lineHeight: 1 }}
            onClick={() => onChange({ unit: "sq.ft", customUnit: "" })}
          >
            ✕
          </Button>
        }
      />
    );
  }
  return (
    <Select
      value={unit}
      options={UNIT_OPTIONS}
      onChange={v => onChange({ unit: v, customUnit: "" })}
      style={{ width: "100%" }}
      showSearch
      filterOption={(inp, opt) =>
        String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())
      }
      placement="bottomLeft" getPopupContainer={(trigger) => trigger.parentElement || document.body}
    />
  );
}

// ── ScopeItemsBuilder ─────────────────────────────────────────

interface CatOption {
  _id: string; name: string; parentId?: string | null; isActive: boolean; color?: string;
}

// Sub-category / sub-sub-category Select that lets the user type a name that
// isn't in the default list and add it on the fly (POST /categories) instead
// of being limited to whatever an admin pre-configured on the Categories page.
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
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const trimmed = search.trim();
  const exists = trimmed.length > 0 && options.some(o => o.label.toLowerCase() === trimmed.toLowerCase());
  const showCreateOption = trimmed.length > 0 && !exists;
  const CREATE_VALUE = "__create_new__";

  const finalOptions = showCreateOption
    ? [...options, { label: `+ Add "${trimmed}" as new option`, value: CREATE_VALUE }]
    : options;

  async function handleChange(v: string) {
    if (v !== CREATE_VALUE) {
      onSelect(v, options.find(o => o.value === v)?.label ?? "");
      setSearch("");
      return;
    }
    setCreating(true);
    try {
      const res = await createCategory({ name: trimmed, color: parentColor || "#6B7280", parentId });
      const newCat = res.data.category as CatOption;
      onCreated(newCat);
      // Pass the name straight from the API response — appending to allCategories
      // via onCreated() above is a state update, so any lookup by id in the
      // caller's onSelect would still see the pre-update array on this render.
      onSelect(newCat._id, newCat.name);
      message.success(`Added "${newCat.name}"`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || "Failed to add new option");
    } finally {
      setCreating(false);
      setSearch("");
    }
  }

  return (
    <Select
      placeholder={placeholder}
      value={value || undefined}
      options={finalOptions}
      onChange={handleChange}
      allowClear
      onClear={() => { onClear(); setSearch(""); }}
      style={{ width: "100%" }}
      showSearch
      searchValue={search}
      onSearch={setSearch}
      filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
      placement="bottomLeft" getPopupContainer={(trigger) => trigger.parentElement || document.body}
      loading={creating}
      notFoundContent={creating ? "Adding..." : "Type a name to add it"}
    />
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1f2e" }}>
          Scope of Work
        </div>
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          size="small"
          onClick={() => onChange([...items, newItemDraft(gstPercent)])}
          style={{ borderColor: "#f37916", color: "#f37916" }}
        >
          Add Work Item
        </Button>
      </div>

      {items.length === 0 && (
        <div
          style={{
            border: "2px dashed #e4e7ee",
            borderRadius: 8,
            padding: "32px 20px",
            textAlign: "center",
            color: "#9ba3b8",
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📐</div>
          <div style={{ fontWeight: 600, color: "#5a6278" }}>No work items yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            Click "Add Work Item" to define the scope.
          </div>
        </div>
      )}

      {items.map((item, idx) => (
        <div
          key={item.id}
          style={{
            border: "1px solid #e4e7ee",
            borderRadius: 8,
            marginBottom: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: "#f5f6f8",
              padding: "9px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderBottom: "1px solid #e4e7ee",
            }}
          >
            <span
              style={{
                background: "#f37916",
                color: "#fff",
                borderRadius: "50%",
                width: 22,
                height: 22,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {idx + 1}
            </span>
            <span style={{ fontWeight: 600, fontSize: 13, flex: 1, color: "#1a1f2e" }}>
              {item.description || `Work Item ${idx + 1}`}
            </span>
            {calcDraftItemAmt(item) > 0 && (
              <span style={{ fontFamily: "monospace", color: "#d4620c", fontWeight: 700, fontSize: 13 }}>
                {fmt(calcDraftItemAmt(item))}
              </span>
            )}
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onChange(items.filter(it => it.id !== item.id))}
              style={{ padding: "0 4px" }}
            />
          </div>

          <div style={{ padding: "14px 14px 10px" }}>
            {(() => {
              const hasSubSub = subCatOptions.length > 0 && !!item.subCategoryId &&
                getSubSubCatOptions(item.subCategoryId).length > 0;

              const amtBox = (fontSize = 12) => (
                <div style={{ background: "#fff8f3", border: "1px solid #f8c9a0", borderRadius: 6, padding: "5px 10px", fontFamily: "monospace", fontWeight: 700, color: "#d4620c", fontSize, minHeight: 32, display: "flex", alignItems: "center" }}>
                  {calcDraftItemAmt(item) > 0 ? fmt(calcDraftItemAmt(item)) : "—"}
                </div>
              );

              const unitQtyRateCols = (
                <>
                  <Col span={4}>
                    <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Unit</div>
                    <UnitCell unit={item.unit} customUnit={item.customUnit} onChange={patch => upd(item.id, patch)} />
                  </Col>
                  <Col span={4}>
                    <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Planned Qty</div>
                    <InputNumber placeholder="Qty" value={item.plannedQty} onChange={v => upd(item.id, { plannedQty: v })} style={{ width: "100%" }} min={0} />
                  </Col>
                  <Col span={4}>
                    <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Rate (₹)</div>
                    <InputNumber placeholder="Rate" value={item.rate} onChange={v => upd(item.id, { rate: v })} style={{ width: "100%" }} min={0} />
                  </Col>
                  <Col span={4}>
                    <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Amount</div>
                    {amtBox()}
                  </Col>
                </>
              );

              if (hasSubSub) {
                return (
                  <>
                    {/* Row 1: Sub-Category full width */}
                    <Row gutter={[10, 0]}>
                      <Col span={24}>
                        <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Sub-Category *</div>
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
                      </Col>
                    </Row>
                    {/* Row 2: Sub-Sub-Category + Unit + Qty + Rate + Amount */}
                    <Row gutter={[10, 0]} style={{ marginTop: 8 }}>
                      <Col span={8}>
                        <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Sub-Sub-Category</div>
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
                      </Col>
                      {unitQtyRateCols}
                    </Row>
                  </>
                );
              }

              // Standard layout: description/sub-cat + unit/qty/rate on same row
              return (
                <Row gutter={[10, 0]}>
                  <Col span={8}>
                    {subCatOptions.length > 0 ? (
                      <>
                        <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Sub-Category *</div>
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
                        <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Description *</div>
                        <Input
                          placeholder="e.g. Raft Area, Plaster Works, HT Panel..."
                          value={item.description}
                          onChange={e => upd(item.id, { description: e.target.value })}
                        />
                      </>
                    )}
                  </Col>
                  {unitQtyRateCols}
                </Row>
              );
            })()}

            <Row gutter={[10, 0]} style={{ marginTop: 8 }}>
              <Col span={6}>
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>GST %</div>
                <GstSelect value={item.gstPercent} onChange={v => upd(item.id, { gstPercent: v })} style={{ width: "100%" }} />
              </Col>
              <Col span={18} style={{ display: "flex", alignItems: "flex-end", paddingBottom: 6 }}>
                <div style={{ fontSize: 12, color: "#5a6278" }}>
                  Amount incl. GST: <strong style={{ color: "#d4620c", fontFamily: "monospace" }}>
                    {calcDraftItemAmt(item) > 0 ? fmt(calcDraftItemInclGst(item)) : "—"}
                  </strong>
                </div>
              </Col>
            </Row>

            <Row gutter={[10, 0]} style={{ marginTop: 8 }}>
              <Col span={24}>
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Notes / Remarks (optional)</div>
                <Input
                  placeholder="e.g. RCC wall, 1st floor, upto 300MM…"
                  value={item.remarks}
                  onChange={e => upd(item.id, { remarks: e.target.value })}
                />
              </Col>
            </Row>

            <Row gutter={[10, 0]} style={{ marginTop: 10 }}>
              <Col span={6}>
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Start Date <span style={{ color: "#e03b3b" }}>*</span></div>
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: "100%" }}
                  status={!item.plannedStart ? "error" : undefined}
                  value={item.plannedStart ? dayjs(item.plannedStart) : null}
                  onChange={d => upd(item.id, { plannedStart: d ? d.format("YYYY-MM-DD") : "" })}
                />
              </Col>
              <Col span={6}>
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>End Date <span style={{ color: "#e03b3b" }}>*</span></div>
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: "100%" }}
                  status={!item.plannedEnd ? "error" : undefined}
                  value={item.plannedEnd ? dayjs(item.plannedEnd) : null}
                  onChange={d => upd(item.id, { plannedEnd: d ? d.format("YYYY-MM-DD") : "" })}
                />
              </Col>
              <Col
                span={12}
                style={{ display: "flex", alignItems: "flex-end", gap: 8, paddingBottom: 0 }}
              >
                <Button
                  type="link"
                  size="small"
                  icon={item.showSubItems ? <UpOutlined /> : <DownOutlined />}
                  onClick={() => upd(item.id, { showSubItems: !item.showSubItems })}
                  style={{ color: "#5a6278", padding: 0 }}
                >
                  {item.showSubItems ? "Hide" : "Add"} Particulars
                  {item.subItems.length > 0 && (
                    <Tag color="blue" style={{ marginLeft: 4, fontSize: 10 }}>
                      {item.subItems.length}
                    </Tag>
                  )}
                </Button>
              </Col>
            </Row>

            {item.showSubItems && (
              <div
                style={{
                  marginTop: 12,
                  background: "#f8f9fc",
                  border: "1px solid #dde1ec",
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#9ba3b8",
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    marginBottom: 10,
                  }}
                >
                  Particulars — Reference Only, Not Included in Contract Value
                </div>
                <div style={{ color: "#9ba3b8", fontSize: 11, marginTop: -6, marginBottom: 10 }}>
                  The main item's own Qty/Rate/Amount above drive the contract value. Particulars are just a descriptive breakdown for this item.
                </div>

                {item.subItems.length === 0 && (
                  <div style={{ color: "#9ba3b8", fontSize: 12, marginBottom: 8 }}>
                    No sub-items yet.
                  </div>
                )}

                {item.subItems.map((si, siIdx) => (
                  <div
                    key={si.id}
                    style={{
                      marginBottom: 8,
                      background: "var(--nx-white)",
                      border: "1px solid #e4e7ee",
                      borderRadius: 6,
                      padding: "8px 10px",
                    }}
                  >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "#9ba3b8", minWidth: 22, fontWeight: 600 }}>
                      {idx + 1}.{siIdx + 1}
                    </span>
                    <Input
                      placeholder="Sub-item description"
                      value={si.description}
                      onChange={e => updSub(item.id, si.id, { description: e.target.value })}
                      style={{ flex: 2, minWidth: 200 }}
                    />
                    {si.unit === "custom" ? (
                      <Input
                        placeholder="Type unit"
                        value={si.customUnit}
                        onChange={e => updSub(item.id, si.id, { customUnit: e.target.value })}
                        style={{ width: 100 }}
                      />
                    ) : (
                      <Select
                        value={si.unit}
                        options={UNIT_OPTIONS}
                        onChange={v => updSub(item.id, si.id, { unit: v, customUnit: "" })}
                        style={{ width: 130 }}
                        showSearch
                        filterOption={(inp, opt) =>
                          String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())
                        }
                      />
                    )}
                    <InputNumber
                      placeholder="Qty"
                      value={si.plannedQty}
                      onChange={v => updSub(item.id, si.id, { plannedQty: v })}
                      style={{ width: 85 }}
                      min={0}
                    />
                    <InputNumber
                      placeholder="Rate ₹"
                      value={si.rate}
                      onChange={v => updSub(item.id, si.id, { rate: v })}
                      style={{ width: 95 }}
                      min={0}
                    />
                    <div
                      style={{
                        fontFamily: "monospace",
                        fontWeight: 700,
                        color: "#d4620c",
                        fontSize: 12,
                        minWidth: 85,
                        textAlign: "right",
                      }}
                    >
                      {calcSubItemAmt(si) > 0 ? fmt(calcSubItemAmt(si)) : "—"}
                    </div>
                    <Button
                      type="link"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeSub(item.id, si.id)}
                      style={{ padding: 0 }}
                    />
                  </div>
                  <Input
                    placeholder="Remarks (optional)"
                    value={si.remarks}
                    onChange={e => updSub(item.id, si.id, { remarks: e.target.value })}
                    style={{ marginTop: 6 }}
                    size="small"
                  />
                  </div>
                ))}

                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => addSub(item.id)}
                  style={{ borderColor: "#9ba3b8", color: "#5a6278", marginTop: 4 }}
                >
                  Add Sub-Item
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}

      {items.length > 0 && (
        <div
          style={{
            background: "#fff8f3",
            border: "1px solid #f8c9a0",
            borderRadius: 8,
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, color: "#5a6278" }}>
              Contract Value ({items.length} item{items.length !== 1 ? "s" : ""}) — Excl. GST
            </span>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#5a6278", fontSize: 14 }}>
              {total > 0 ? fmt(total) : "—"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <span style={{ fontWeight: 600, color: "#5a6278" }}>GST (per work item, see above)</span>
            <span style={{ fontFamily: "monospace", color: "#5a6278", fontSize: 13 }}>
              {total > 0 ? fmt(totalInclGst - total) : "—"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid #f8c9a0" }}>
            <span style={{ fontWeight: 700, color: "#1a1f2e" }}>Total Contract Value — Incl. GST</span>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#d4620c", fontSize: 16 }}>
              {total > 0 ? fmt(totalInclGst) : "—"}
            </span>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1f2e" }}>Deliverables</div>
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          size="small"
          onClick={() => onChange([...items, newDeliverableDraft(gstPercent)])}
          style={{ borderColor: "#f37916", color: "#f37916" }}
        >
          Add Deliverable
        </Button>
      </div>

      {items.length === 0 && (
        <div style={{ border: "2px dashed #e4e7ee", borderRadius: 8, padding: "32px 20px", textAlign: "center", color: "#9ba3b8", marginBottom: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <div style={{ fontWeight: 600, color: "#5a6278" }}>No deliverables yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Click "Add Deliverable" to define the scope of this engagement.</div>
        </div>
      )}

      {items.map((item, idx) => (
        <div key={item.id} style={{ border: "1px solid #e4e7ee", borderRadius: 8, marginBottom: 10, padding: "12px 14px" }}>
          <Row gutter={[10, 10]} align="middle">
            <Col flex="0 0 24px">
              <span style={{ background: "#7c3aed", color: "#fff", borderRadius: "50%", width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                {idx + 1}
              </span>
            </Col>
            <Col flex="2 1 220px">
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Deliverable *</div>
              <Input
                placeholder="e.g. Façade Concept Design"
                value={item.description}
                onChange={e => upd(item.id, { description: e.target.value })}
              />
            </Col>
            <Col flex="1 1 160px">
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Stage</div>
              <Select
                placeholder="Select or type a stage"
                value={item.stage || undefined}
                onChange={v => upd(item.id, { stage: v })}
                options={STAGE_SUGGESTIONS.map(s => ({ label: s, value: s }))}
                allowClear
                showSearch
                onSearch={(v) => { if (v && !STAGE_SUGGESTIONS.includes(v)) upd(item.id, { stage: v }); }}
                filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
                style={{ width: "100%" }}
                placement="bottomLeft" getPopupContainer={(trigger) => trigger.parentElement || document.body}
              />
            </Col>
            <Col flex="0 0 150px">
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Due Date</div>
              <DatePicker
                format="DD/MM/YYYY"
                style={{ width: "100%" }}
                value={item.plannedEnd ? dayjs(item.plannedEnd) : null}
                onChange={d => upd(item.id, { plannedEnd: d ? d.format("YYYY-MM-DD") : "" })}
              />
            </Col>
            <Col flex="0 0 140px">
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Amount (₹) *</div>
              <InputNumber
                placeholder="Fee"
                value={item.rate}
                onChange={v => upd(item.id, { rate: v })}
                style={{ width: "100%" }}
                min={0}
              />
            </Col>
            <Col flex="0 0 32px">
              <Button
                type="link" size="small" danger icon={<DeleteOutlined />}
                onClick={() => onChange(items.filter(it => it.id !== item.id))}
              />
            </Col>
          </Row>
        </div>
      ))}

      {items.length > 0 && (
        <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 8, padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, color: "#5a6278" }}>
              Total Fee ({items.length} deliverable{items.length !== 1 ? "s" : ""}) — Excl. GST
            </span>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#5a6278", fontSize: 14 }}>
              {total > 0 ? fmt(total) : "—"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid #ddd6fe" }}>
            <span style={{ fontWeight: 700, color: "#1a1f2e" }}>Total Fee — Incl. GST</span>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#7c3aed", fontSize: 16 }}>
              {total > 0 ? fmt(totalInclGst) : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ScopeItemsViewer (removed — progress entered via Work Progress module) ──
// @ts-ignore -- dead code, kept for reference
function _ScopeItemsViewer_UNUSED({ scopeItems }: { scopeItems: ScopeItem[] }) {
  const totalPlanned  = scopeItems.reduce((s, it) => s + it.amount, 0);
  const totalBillable = scopeItems.reduce((s, it) => {
    if (it.subItems.length > 0) return s;
    return s + it.completedQty * it.rate;
  }, 0);
  const delayedCount = scopeItems.filter(isItemDelayed).length;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1f2e" }}>
          Scope of Work — Live Progress
        </div>
        {delayedCount > 0 && (
          <Tag color="red" icon={<ExclamationCircleOutlined />} style={{ fontWeight: 600 }}>
            {delayedCount} item{delayedCount > 1 ? "s" : ""} overdue
          </Tag>
        )}
      </div>

      {scopeItems.map((item, idx) => {
        const delayed = isItemDelayed(item);
        const days = delayDays(item);
        const pct = getCompletionPct(item);
        const cfg = SCOPE_STATUS_CFG[item.status];

        return (
          <div
            key={item.id}
            style={{
              border: `1px solid ${delayed ? "#ffcdd2" : "#e4e7ee"}`,
              borderLeft: `4px solid ${delayed ? "#e03b3b" : cfg.color}`,
              borderRadius: 8,
              marginBottom: 14,
              overflow: "hidden",
              background: delayed ? "#fff9f9" : "#fff",
            }}
          >
            <div style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                <span
                  style={{
                    background: cfg.color,
                    color: "#fff",
                    borderRadius: "50%",
                    width: 22,
                    height: 22,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {idx + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#1a1f2e" }}>
                      {item.description}
                    </span>
                    <Tag
                      style={{
                        background: cfg.bg,
                        border: `1px solid ${cfg.color}`,
                        color: cfg.color,
                        fontWeight: 600,
                        fontSize: 11,
                      }}
                    >
                      {cfg.label}
                    </Tag>
                    {delayed && (
                      <Tooltip title={`Was due ${dayjs(item.plannedEnd).format("DD MMM YYYY")}`}>
                        <Tag color="red" icon={<ExclamationCircleOutlined />} style={{ fontWeight: 600 }}>
                          Overdue {days} day{days > 1 ? "s" : ""}
                        </Tag>
                      </Tooltip>
                    )}
                  </div>
                  {(item.plannedStart || item.plannedEnd) && (
                    <div style={{ fontSize: 12, color: "#9ba3b8", marginTop: 3 }}>
                      {item.plannedStart && dayjs(item.plannedStart).format("DD MMM YYYY")}
                      {item.plannedStart && item.plannedEnd && " → "}
                      {item.plannedEnd && (
                        <span style={{ color: delayed ? "#e03b3b" : "#9ba3b8", fontWeight: delayed ? 600 : 400 }}>
                          {dayjs(item.plannedEnd).format("DD MMM YYYY")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* Progress is entered via the Work Progress module */}
              </div>

              {item.status !== "pending" && (
                <div style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: "#5a6278" }}>
                      Completed:{" "}
                      <strong style={{ color: "#1a1f2e" }}>
                        {item.completedQty.toLocaleString("en-IN")} {item.unit}
                      </strong>
                    </span>
                    <span style={{ color: "#5a6278" }}>
                      Remaining:{" "}
                      <strong>
                        {Math.max(0, item.plannedQty - (item.completedQty ?? 0)).toLocaleString("en-IN")} {item.unit}
                      </strong>
                    </span>
                    <strong style={{ color: pct >= 100 ? "#16a85a" : delayed ? "#e03b3b" : "#f37916" }}>
                      {pct}%
                    </strong>
                  </div>
                  <Progress
                    percent={pct}
                    size="small"
                    strokeColor={pct >= 100 ? "#16a85a" : delayed ? "#e03b3b" : "#f37916"}
                    trailColor="#f0f0f0"
                    showInfo={false}
                  />
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 20,
                  flexWrap: "wrap",
                  fontSize: 12,
                  color: "#9ba3b8",
                  borderTop: "1px solid #f0f0f0",
                  paddingTop: 8,
                  marginTop: 6,
                }}
              >
                {item.subItems.length === 0 ? (
                  <>
                    <span>Scope: <strong style={{ color: "#1a1f2e" }}>{item.plannedQty.toLocaleString("en-IN")} {item.unit}</strong></span>
                    <span>Rate: <strong style={{ color: "#1a1f2e" }}>₹{item.rate.toLocaleString("en-IN")}/{item.unit}</strong></span>
                    <span>Contract: <strong style={{ fontFamily: "monospace", color: "#2563eb" }}>{fmt(item.amount)}</strong></span>
                    {item.status !== "pending" && (
                      <span>Billable now: <strong style={{ fontFamily: "monospace", color: "#16a85a" }}>{fmt(item.completedQty * item.rate)}</strong></span>
                    )}
                  </>
                ) : (
                  <span>Contract value (sub-items): <strong style={{ fontFamily: "monospace", color: "#2563eb" }}>{fmt(item.amount)}</strong></span>
                )}
              </div>

              {item.subItems.length > 0 && (
                <div style={{ marginTop: 10, border: "1px solid #e4e7ee", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "#9ba3b8", textTransform: "uppercase", letterSpacing: "0.07em", background: "#f5f6f8", borderBottom: "1px solid #e4e7ee" }}>
                    Sub-Items
                  </div>
                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#fafafa" }}>
                        {["#", "Description", "Unit", "Qty", "Rate (₹)", "Amount"].map(h => (
                          <th key={h} style={{ padding: "6px 10px", textAlign: ["Amount", "Rate (₹)", "Qty"].includes(h) ? "right" : "left", color: "#5a6278", fontWeight: 600, fontSize: 11, borderBottom: "1px solid #e4e7ee" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {item.subItems.map((si, siIdx) => (
                        <tr key={si.id} style={{ borderBottom: "1px solid #f5f6f8" }}>
                          <td style={{ padding: "6px 10px", color: "#9ba3b8", fontSize: 11 }}>{idx + 1}.{siIdx + 1}</td>
                          <td style={{ padding: "6px 10px", color: "#1a1f2e" }}>{si.description}</td>
                          <td style={{ padding: "6px 10px", color: "#5a6278" }}>{si.unit}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "monospace" }}>{si.plannedQty.toLocaleString("en-IN")}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "monospace" }}>₹{si.rate.toLocaleString("en-IN")}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#d4620c" }}>{fmt(si.amount)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: "#fff8f3" }}>
                        <td colSpan={5} style={{ padding: "8px 10px", fontWeight: 700, color: "#5a6278" }}>Sub-Total</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#d4620c", fontSize: 13 }}>{fmt(item.amount)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {item.progressEntries.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#9ba3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    <HistoryOutlined /> Progress History
                  </div>
                  {item.progressEntries.map((pe, peIdx) => (
                    <div
                      key={pe.id}
                      style={{ display: "flex", gap: 12, alignItems: "center", padding: "5px 0", borderBottom: peIdx < item.progressEntries.length - 1 ? "1px solid #f5f6f8" : "none", fontSize: 12 }}
                    >
                      <span style={{ color: "#9ba3b8", minWidth: 95 }}>{dayjs(pe.date).format("DD MMM YYYY")}</span>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#16a85a", minWidth: 80 }}>
                        +{pe.qtyAdded.toLocaleString("en-IN")} {item.unit}
                      </span>
                      {pe.remarks && <span style={{ color: "#5a6278", flex: 1 }}>{pe.remarks}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {scopeItems.length > 0 && (
        <div style={{ border: "1px solid #e4e7ee", borderRadius: 8, overflow: "hidden", marginTop: 4 }}>
          <div style={{ background: "#f5f6f8", padding: "8px 14px", fontWeight: 700, fontSize: 11, color: "#5a6278", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid #e4e7ee" }}>
            Financial Summary
          </div>
          <div style={{ padding: "12px 14px" }}>
            {scopeItems.map(it => (
              <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid #f5f6f8" }}>
                <span style={{ color: "#5a6278" }}>{it.description}</span>
                <span style={{ fontFamily: "monospace", color: "#1a1f2e" }}>{fmt(it.amount)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, color: "#d4620c", padding: "10px 0 4px", marginTop: 6, borderTop: "2px solid #e4e7ee" }}>
              <span>Total Contract Value</span>
              <span style={{ fontFamily: "monospace" }}>{fmt(totalPlanned)}</span>
            </div>
            {totalBillable > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#16a85a", fontWeight: 600, padding: "4px 0" }}>
                <span>Billable (executed so far)</span>
                <span style={{ fontFamily: "monospace" }}>{fmt(totalBillable)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── WOFormFields ──────────────────────────────────────────────

function WOFormFields({
  form,
  isEdit = false,
  nextWONo,
  nextCWONo,
  contractorsList,
  consultantsList,
  projectsList,
  categoriesList,
  companiesList = [],
  driList = [],
  preparedByName,
  preparedByContact,
  onExtracted,
}: {
  form: FormInstance;
  isEdit?: boolean;
  nextWONo: string;
  nextCWONo: string;
  contractorsList: Contractor[];
  consultantsList: Consultant[];
  projectsList: Project[];
  categoriesList: { _id: string; name: string; isActive: boolean; parentId?: string | null }[];
  companiesList?: any[];
  driList?: { _id: string; name: string; email: string }[];
  preparedByName?: string;
  preparedByContact?: string;
  // Scope items / milestones / warranty live in the parent's own state, not
  // this form — extraction hands the full result up so the parent can apply
  // those pieces itself, while this component applies the plain form fields.
  onExtracted?: (data: AiExtractedWorkOrder) => void;
}) {
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState("");
  const watchedVendorName = Form.useWatch("vendorName", form) as string | undefined;
  const watchedOwnerName  = Form.useWatch("ownerName", form) as string | undefined;
  const contractType = (Form.useWatch("contractType", form) as string | undefined) ?? "execution";
  const isProfessionalServices = contractType === "professional-services";

  const handleExtract = async () => {
    const docs: WODocument[] = form.getFieldValue("documents") || [];
    const target = [...docs].reverse().find(d => /\.(pdf|jpe?g|png)$/i.test(d.name));
    if (!target) {
      message.warning("Upload a PDF or image document above first");
      return;
    }
    setExtracting(true);
    setExtractNote("");
    try {
      const res = await apiClient.post<{ extracted: AiExtractedWorkOrder }>("/ai/extract-work-order", {
        documentBase64: target.url,
        fileName: target.name,
      });
      const data = res.data.extracted;
      form.setFieldsValue({
        description:      data.scopeOfWork || undefined,
        totalTenure:       data.totalTenure || undefined,
        issueDate:         data.issueDate ? dayjs(data.issueDate) : undefined,
        retentionPercent: data.retentionPercent ?? undefined,
        gstPercent:        data.gstPercent ?? undefined,
      });
      onExtracted?.(data);
      if (data.extractionNotes) setExtractNote(data.extractionNotes);
      message.success(
        `Extracted ${data.scopeItems?.length ?? 0} scope item(s) and ${data.paymentMilestones?.length ?? 0} payment milestone(s) — review before saving`
      );
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "AI extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const fillVendor = (vendorCode: string) => {
    const c = contractorsList.find(x => x.vendorCode === vendorCode);
    if (c) {
      form.setFieldsValue({
        vendorName: c.companyName,
        ownerName:  c.ownerName,
        mobile:     c.mobile,
      });
    }
  };

  const fillConsultant = (consultantCode: string) => {
    const c = consultantsList.find(x => x.consultantCode === consultantCode);
    if (c) {
      form.setFieldsValue({
        vendorName: c.firmName,
        ownerName:  c.principalName,
        mobile:     c.mobile,
      });
    }
  };

  const fillProject = (projectId: string) => {
    const p = projectsList.find(x => (x as any)._id === projectId || x.id === projectId);
    if (p) form.setFieldsValue({ projectName: p.name });
  };

  return (
    <>
      {preparedByName && (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 16, fontSize: 12, color: "#5a6278", background: "#f5f6f8", border: "1px solid #e4e7ee", borderRadius: 8, padding: "8px 14px" }}>
          <span>Prepared By: <strong style={{ color: "#1a1f2e" }}>{preparedByName}</strong></span>
          {preparedByContact && <span>Contact: <strong style={{ color: "#1a1f2e" }}>{preparedByContact}</strong></span>}
        </div>
      )}

      <Form.Item label="Contract Type" name="contractType" initialValue="execution" style={{ marginBottom: 16 }}>
        {isEdit ? (
          <Tag color={isProfessionalServices ? "purple" : "blue"} style={{ fontSize: 12, padding: "4px 10px" }}>
            {isProfessionalServices ? "Professional Services Contract" : "Execution Contract"}
          </Tag>
        ) : (
          <Radio.Group
            onChange={() => form.setFieldsValue({ vendorCode: undefined, vendorName: "", ownerName: "", mobile: "" })}
          >
            <Radio.Button value="execution">Execution Contract</Radio.Button>
            <Radio.Button value="professional-services">Professional Services Contract</Radio.Button>
          </Radio.Group>
        )}
      </Form.Item>

      <Row gutter={16} style={{ marginBottom: 4 }}>
        <Col span={12}>
          <Form.Item
            label={isProfessionalServices ? "Consultancy Order Number" : "Work Order Number"}
            name="workOrderNo"
            tooltip={!isEdit ? `Leave blank to auto-assign (${isProfessionalServices ? nextCWONo : nextWONo})` : undefined}
          >
            <Input
              placeholder={isEdit ? undefined : `Auto-assign: ${isProfessionalServices ? nextCWONo : nextWONo}`}
              disabled={isEdit}
              style={{ fontFamily: "monospace" }}
              maxLength={20}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label="Issuing Company"
            name="companyId"
            tooltip="Which Neoteric entity is issuing this work order? (printed on the WO PDF)"
          >
            <Select
              placeholder="Select company (optional)"
              allowClear
              showSearch
              filterOption={(inp, opt) =>
                String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())
              }
              options={companiesList.filter((c: any) => c.isActive).map((c: any) => ({
                label: `${c.shortCode} – ${c.name}`,
                value: c._id,
              }))}
              placement="bottomLeft" getPopupContainer={(trigger) => trigger.parentElement || document.body}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            label="Project"
            name="projectId"
            rules={[{ required: true, message: "Select a project" }]}
          >
            <Select
              placeholder="Select project"
              onChange={fillProject}
              showSearch
              filterOption={(inp, opt) =>
                String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())
              }
              options={selectableProjects(projectsList).map(p => ({
                label: p.name,
                value: (p as any)._id || p.id,
              }))}
              placement="bottomLeft" getPopupContainer={(trigger) => trigger.parentElement || document.body}
            />
          </Form.Item>
          <Form.Item name="projectName" hidden><Input /></Form.Item>
          <Form.Item
            label="Location"
            name="projectLocation"
            tooltip="Exact site location for this work order (e.g. tower, plot no., landmark)"
          >
            <Input placeholder="e.g. Tower A, Ground Floor" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label="Issue Date"
            name="issueDate"
            rules={[{ required: true, message: "Select issue date" }]}
          >
            <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            label={isProfessionalServices ? "Consultant" : "Vendor Code"}
            name="vendorCode"
            rules={[{ required: true, message: isProfessionalServices ? "Select a consultant" : "Select a vendor" }]}
          >
            {isProfessionalServices ? (
              <Select
                placeholder="Select consultant"
                showSearch
                filterOption={(input, opt) =>
                  String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())
                }
                onChange={fillConsultant}
                options={consultantsList.map(c => ({
                  label: `${c.consultantCode} — ${c.firmName}`,
                  value: c.consultantCode,
                }))}
                placement="bottomLeft" getPopupContainer={(trigger) => trigger.parentElement || document.body}
              />
            ) : (
              <Select
                placeholder="Select vendor"
                showSearch
                filterOption={(input, opt) =>
                  String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())
                }
                onChange={fillVendor}
                options={contractorsList.map(c => ({
                  label: `${c.vendorCode} — ${vendorLabel(c.companyName, c.shortCode)}`,
                  value: c.vendorCode,
                }))}
                placement="bottomLeft" getPopupContainer={(trigger) => trigger.parentElement || document.body}
              />
            )}
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="Category" name="category">
            <Select
              placeholder="Select category (optional)"
              allowClear
              options={categoriesList.filter(c => c.isActive && !c.parentId).map(c => ({
                label: c.name,
                value: c.name,
              }))}
              placement="bottomLeft" getPopupContainer={(trigger) => trigger.parentElement || document.body}
            />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="Status" name="status" rules={[{ required: true }]}>
            <Select
              options={STATUS_OPTIONS}
              placement="bottomLeft" getPopupContainer={(trigger) => trigger.parentElement || document.body}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={isProfessionalServices ? 24 : 12}>
          <Form.Item label="GST Slab" name="gstPercent" initialValue={18} tooltip="GST % applicable on billing for this work order">
            <GstSelect />
          </Form.Item>
        </Col>
        {/* No retention/hold for a professional-services engagement — there's
            no defect-liability-period measurement concept to hold security
            against. Field stays registered (hidden) so it keeps saving 0. */}
        <Col span={12} style={isProfessionalServices ? { display: "none" } : undefined}>
          <Form.Item label="Retention / Hold %" name="retentionPercent" initialValue={0} tooltip="% of each bill withheld until work completion (e.g. 5%)">
            <Select
              options={[
                { label: "0% — No retention", value: 0 },
                { label: "2.5%", value: 2.5 },
                { label: "5%", value: 5 },
                { label: "10%", value: 10 },
                { label: "15%", value: 15 },
                { label: "20%", value: 20 },
              ]}
              placement="bottomLeft" getPopupContainer={(trigger) => trigger.parentElement || document.body}
            />
          </Form.Item>
        </Col>
      </Row>

      {driList.length > 0 && (
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item label="Assign DRI (Site Engineer)" name="assignedDRI" tooltip="Site engineers who will track progress on this work order">
              <Select
                mode="multiple"
                placeholder="Select DRI(s) to assign (optional)"
                allowClear
                options={driList.map(d => ({ label: `${d.name} (${d.email})`, value: d._id }))}
                placement="bottomLeft" getPopupContainer={(trigger) => trigger.parentElement || document.body}
              />
            </Form.Item>
          </Col>
        </Row>
      )}

      <div
        style={{
          background: "#f5f6f8",
          border: "1px solid #e4e7ee",
          borderRadius: 8,
          padding: "14px 16px",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#9ba3b8",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            marginBottom: 12,
          }}
        >
          {isProfessionalServices ? "Auto-filled from Consultant Master" : "Auto-filled from Contractor Master"}
        </div>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label={isProfessionalServices ? "Firm Name" : "Company Name"} name="vendorName" style={{ marginBottom: 10 }}>
              <Input disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label={isProfessionalServices ? "Principal Name" : "Owner Name"} name="ownerName" style={{ marginBottom: 10 }}>
              <Input disabled />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="Mobile" name="mobile" style={{ marginBottom: 0 }}>
          <Input disabled />
        </Form.Item>
      </div>

      <Form.Item
        label="Work Order Issued Under"
        name="issuedUnder"
        initialValue="company"
        tooltip="Whether this work order is drawn up in the contractor's company/firm name or their personal (owner) name — affects the printed WO PDF only, not the contractor record itself"
      >
        <Radio.Group>
          <Radio value="company">Company Name{watchedVendorName ? ` (${watchedVendorName})` : ""}</Radio>
          <Radio value="owner">Owner Name{watchedOwnerName ? ` (${watchedOwnerName})` : ""}</Radio>
        </Radio.Group>
      </Form.Item>

      <Form.Item
        label="Overall Description / Scope of Work"
        name="description"
        tooltip="Describe the full scope of this work order — shown in the downloaded PDF before the item list"
      >
        <Input.TextArea
          rows={3}
          placeholder="e.g. Supply and installation of false ceiling including framework, boarding and finishing as per approved drawings..."
        />
      </Form.Item>

      <Form.Item
        label="Total Tenure of Entire Work"
        name="totalTenure"
        tooltip="Overall time allotted to complete this work order — shown in the PDF under Project Details"
      >
        <Input placeholder="e.g. 45 Days, 3 Months" />
      </Form.Item>

      <Form.Item
        label="Remarks"
        name="internalRemark"
        tooltip="A general note on this work order — shown in the detail view and printed on the WO PDF under Project Details"
      >
        <Input.TextArea rows={2} placeholder="e.g. Site access via rear gate only, coordinate with security…" />
      </Form.Item>

      <Form.Item label="Upload Work Order Documents" name="documents">
        <DocumentsUpload />
      </Form.Item>

      {!isEdit && (
        <div style={{ marginBottom: 20 }}>
          <Button
            icon={<ThunderboltOutlined />}
            loading={extracting}
            onClick={handleExtract}
            style={{ borderColor: "#f37916", color: "#f37916" }}
          >
            Extract with AI
          </Button>
          <span style={{ marginLeft: 10, fontSize: 11.5, color: "#9ba3b8" }}>
            Reads an uploaded PDF/image and auto-fills scope, dates, BOQ items &amp; payment milestones below — always review before saving.
          </span>
          {extractNote && (
            <Alert
              style={{ marginTop: 10 }}
              type="warning"
              showIcon
              message="AI extraction notes — please verify"
              description={extractNote}
              closable
              onClose={() => setExtractNote("")}
            />
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
  const canMaker    = hasPerm(user, "maker");
  const canChecker  = hasPerm(user, "checker");
  const canApprover = hasPerm(user, "approver");
  const canFinal    = hasPerm(user, "ceo-approve");
  const [activeTab, setActiveTab] = useState<"all" | "pending">("all");
  const [searchParams] = useSearchParams();
  // Two sidebar nav items ("Work Orders" / "Consultancy Orders") both land
  // here, pre-filtered via ?type= — one shared list/table, not a second page.
  const [contractTypeFilter, setContractTypeFilter] = useState<"all" | "execution" | "professional-services">(
    (searchParams.get("type") as "execution" | "professional-services" | null) || "all"
  );
  const [viewMode, setViewMode] = useState<"list" | "monthly">("list");

  const { categories: apiCategories, lighten, setCategories: setApiCategories } = useCategories();
  const handleCategoryCreated = (cat: CatOption) => setApiCategories(prev => [...prev, cat as any]);

  // Resolve color/bg for a category name from API data
  function getCatColor(name?: string) {
    const found = apiCategories.find(c => c.name === name);
    return { color: found?.color ?? "#6B7280", bg: found ? lighten(found.color) : "#F3F4F6" };
  }

  function CategoryBadge({ cat }: { cat?: string }) {
    if (!cat) return null;
    const { color, bg } = getCatColor(cat);
    return (
      <span style={{ background: bg, color, border: `1px solid ${color}30`, borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
        {cat}
      </span>
    );
  }

  const [workOrders,   setWorkOrders]   = useState<WorkOrder[]>([]);
  const [contractors,  setContractors]  = useState<Contractor[]>([]);
  const [consultants,  setConsultants]  = useState<Consultant[]>([]);
  const [projects,     setProjects]     = useState<Project[]>([]);
  const [companies,    setCompanies]    = useState<any[]>([]);
  const [driList,      setDriList]      = useState<{ _id: string; name: string; email: string }[]>([]);
  const [loadingData,  setLoadingData]  = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [pdfLoading,   setPdfLoading]   = useState(false);

  const [createDrawerOpen,    setCreateDrawerOpen]    = useState(false);
  const [search,              setSearch]              = useState("");
  const [statusFilter,        setStatusFilter]        = useState<WorkOrderStatus | "all">("all");
  const [categoryFilter,      setCategoryFilter]      = useState<string>("all");
  const [subCategoryFilter,   setSubCategoryFilter]   = useState<string>("all");
  const [progressFilter,      setProgressFilter]      = useState<string>("all");
  const [projectFilter,       setProjectFilter]       = useState<string>("all");
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
  const [progressItem,     setProgressItem]     = useState<ScopeItem | null>(null);
  const [progressModalOpen, setProgressModalOpen] = useState(false);

  const [createMilestones, setCreateMilestones] = useState<MilestoneDraft[]>([]);
  const [editMilestones,   setEditMilestones]   = useState<MilestoneDraft[]>([]);
  const [createDiscount,   setCreateDiscount]   = useState<number | null>(null);
  const [editDiscount,     setEditDiscount]     = useState<number | null>(null);
  const [createWarranty,   setCreateWarranty]   = useState<string[]>([]);
  const [editWarranty,     setEditWarranty]     = useState<string[]>([]);

  const [editForm]     = Form.useForm();
  const [createForm]   = Form.useForm();
  const [progressForm] = Form.useForm();

  const createCatName = Form.useWatch("category", createForm) as string | undefined;
  const editCatName   = Form.useWatch("category", editForm)   as string | undefined;
  const createGstPercent = (Form.useWatch("gstPercent", createForm) as number | undefined) ?? 18;
  const editGstPercent   = (Form.useWatch("gstPercent", editForm)   as number | undefined) ?? 18;
  const createContractType = (Form.useWatch("contractType", createForm) as string | undefined) ?? "execution";
  const editContractType   = (Form.useWatch("contractType", editForm)   as string | undefined) ?? "execution";

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
  // live outside the antd Form (scope items / milestones / warranty terms are
  // their own component state, unlike description/dates/etc. which WOFormFields
  // already writes straight onto the form).
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
    if (data.paymentMilestones?.length) {
      setCreateMilestones(data.paymentMilestones.map(m => ({
        ...newMilestone(),
        stage: m.stage || "",
        type: m.type || m.stage || "",
        amountMode: m.amountPercent != null ? "percent" : "fixed",
        amountPercent: m.amountPercent ?? null,
        amount: m.amount ?? null,
      })));
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

  // Can this user act on wo's current approval stage? (Owner bypasses via hasPerm.)
  function canActOnWO(wo: WorkOrder): boolean {
    const st = wo.approvalStatus || "approved";
    if (st === "draft" || st === "sent-back") return canMaker;
    if (st === "pending-checker") return canChecker;
    if (st === "pending-approver") return canApprover;
    if (st === "pending-final") return canFinal;
    return false;
  }

  // What the "Pending Approvals" tab should show for THIS user specifically —
  // distinct from canActOnWO's raw "am I authorized to act here" check, which
  // is universally true for owner at every stage (the intentional bypass).
  // That bypass is correct for actually taking the action, but wrong for a
  // personal queue: it would make an owner's queue show every WO stuck at
  // someone else's stage too. Owner's own natural stage in the chain is L4
  // (final approval) — a WO only genuinely needs the owner's attention once
  // it actually reaches pending-final, not before.
  function isPendingForMe(wo: WorkOrder): boolean {
    if (user?.role === "owner") return (wo.approvalStatus || "approved") === "pending-final";
    return canActOnWO(wo);
  }

  const pendingApprovals = useMemo(
    () => workOrders.filter(isPendingForMe),
    [workOrders, user?.role, canMaker, canChecker, canApprover, canFinal]
  );

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

      // Status
      const matchStatus = statusFilter === "all" || wo.status === statusFilter;

      // Category + SubCategory
      let matchCategory = true;
      if (subCategoryFilter !== "all") {
        matchCategory = wo.subCategory === subCategoryFilter;
      } else if (categoryFilter !== "all") {
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
        }
      }

      const matchDate    = inDateRange(wo.issueDate, dateFrom, dateTo);
      const matchProject = projectFilter === "all" || getWorkOrderProjectId(wo.projectId) === projectFilter;
      const matchTab      = activeTab === "all" || isPendingForMe(wo);
      const matchContractType = contractTypeFilter === "all" || (wo.contractType || "execution") === contractTypeFilter;
      return matchSearch && matchStatus && matchCategory && matchProgress && matchDate && matchProject && matchTab && matchContractType;
    }).sort((a, b) => {
      const numA = parseInt(a.workOrderNo.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.workOrderNo.replace(/\D/g, ""), 10) || 0;
      return numB - numA;
    });
  }, [workOrders, search, statusFilter, categoryFilter, subCategoryFilter, progressFilter, projectFilter, subCatsOfSelected, dateFrom, dateTo, activeTab, contractTypeFilter, user?.role, canMaker, canChecker, canApprover, canFinal]);

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

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      const totalAmt  = calcTotalAmt(createScopeItems);
      const contractValueInclGst = calcTotalInclGst(createScopeItems);
      const milestonesTotal = calcGrandTotal(createMilestones);
      if (milestonesTotal > contractValueInclGst + 1) {
        message.error(`Payment milestones total (${fmt(milestonesTotal)}) exceeds the scope of work's contract value incl. GST (${fmt(contractValueInclGst)})`);
        return;
      }
      if (values.contractType !== "professional-services" && createScopeItems.some(it => it.description.trim() && (!it.plannedStart || !it.plannedEnd))) {
        message.error("Start Date and End Date are required for every work item");
        return;
      }
      const scopeOfWork = values.description?.trim()
        || createScopeItems.map(it => it.description).filter(Boolean).join(", ");

      const body: Record<string, unknown> = {
        contractType: values.contractType || "execution",
        issueDate:    values.issueDate ? dayjs(values.issueDate).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"),
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
        warrantyTerms:     createWarranty.filter(t => t.trim()),
      };
      if (values.workOrderNo?.trim()) body.workOrderNo = values.workOrderNo.trim();

      setSaving(true);
      const res = await apiClient.post<{ workOrder: WorkOrder }>("/work-orders", body);
      setWorkOrders(prev => [normalizeWO(res.data.workOrder), ...prev]);
      message.success(`Work order ${res.data.workOrder.workOrderNo} created`);
      createForm.resetFields();
      setCreateScopeItems([]);
      setCreateMilestones([]);
      setCreateDiscount(null);
      setCreateWarranty([]);
      setCreateDrawerOpen(false);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "errorFields" in err) return;
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
    editForm.setFieldsValue({ ...wo, issueDate: dayjs(wo.issueDate), projectId: getWorkOrderProjectId(wo.projectId), category: wo.category || "", subCategory: wo.subCategory || "", assignedDRI: ((wo as any).assignedDRI || []).map((d: any) => d._id || d), gstPercent: wo.gstPercent ?? 18, retentionPercent: (wo as any).retentionPercent ?? 0, issuedUnder: wo.issuedUnder || "company", contractType: wo.contractType || "execution" });
    setEditScopeItems((wo.scopeItems || []).map(toDraft));
    setEditMilestones((wo.paymentMilestones || []).map(toMilestoneDraft));
    setEditDiscount(wo.discount || null);
    setEditWarranty(wo.warrantyTerms || []);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      const values = await editForm.validateFields();
      if (!currentEditWO) return;

      const totalAmt    = calcTotalAmt(editScopeItems);
      const contractValueInclGst = calcTotalInclGst(editScopeItems);
      const milestonesTotal = calcGrandTotal(editMilestones);
      if (milestonesTotal > contractValueInclGst + 1) {
        message.error(`Payment milestones total (${fmt(milestonesTotal)}) exceeds the scope of work's contract value incl. GST (${fmt(contractValueInclGst)})`);
        return;
      }
      if (values.contractType !== "professional-services" && editScopeItems.some(it => it.description.trim() && (!it.plannedStart || !it.plannedEnd))) {
        message.error("Start Date and End Date are required for every work item");
        return;
      }
      const scopeOfWork = values.description?.trim()
        || editScopeItems.map(it => it.description).filter(Boolean).join(", ");
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
        companyId:    values.companyId    ?? (currentEditWO as any).companyId ?? null,
        assignedDRI:  values.assignedDRI  ?? (currentEditWO as any).assignedDRI ?? [],
        issueDate:    values.issueDate ? dayjs(values.issueDate).format("YYYY-MM-DD") : currentEditWO.issueDate,
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
        warrantyTerms:     editWarranty.filter(t => t.trim()),
      };

      setSaving(true);
      const res = await apiClient.put<{ workOrder: WorkOrder }>(`/work-orders/${currentEditWO.id}`, body);
      setWorkOrders(prev => prev.map(wo => wo.id === currentEditWO.id ? normalizeWO(res.data.workOrder) : wo));
      message.success("Work order updated");
      setEditModalOpen(false);
      setEditWOId(null);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "errorFields" in err) return;
    } finally {
      setSaving(false);
    }
  };

  const handleAddProgress = async () => {
    try {
      const values = await progressForm.validateFields();
      if (!currentSelectedWO || !progressItem) return;

      const body = {
        date:     values.date ? dayjs(values.date).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"),
        qtyAdded: values.qtyAdded,
        remarks:  values.remarks?.trim() || undefined,
      };

      setSaving(true);
      const res = await apiClient.post<{ workOrder: WorkOrder }>(
        `/work-orders/${currentSelectedWO.id}/scope-items/${progressItem.id}/progress`,
        body
      );
      setWorkOrders(prev => prev.map(wo => wo.id === currentSelectedWO.id ? normalizeWO(res.data.workOrder) : wo));
      message.success(`Progress recorded: +${values.qtyAdded.toLocaleString("en-IN")} ${progressItem.unit}`);
      setProgressModalOpen(false);
      setProgressItem(null);
      progressForm.resetFields();
    } catch (err: unknown) {
      if (err && typeof err === "object" && "errorFields" in err) return;
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
      await downloadWorkOrderPDF({ ...wo, approvals: buildApprovals(wo, userMap) } as any, company, contractor as any);
    } catch {
      message.error("Failed to generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadPDFHindi = async (wo: WorkOrder) => {
    setPdfLoading(true);
    const hide = message.loading("Translating to Hindi…", 0);
    try {
      const company    = companies.find((c: any) => c._id === (wo as any).companyId) ?? null;
      const contractor = contractors.find(c => c.vendorCode === wo.vendorCode) ?? null;
      const userMap    = await fetchUserMap();
      await downloadWorkOrderPDFHindi({ ...wo, approvals: buildApprovals(wo, userMap) } as any, company, contractor as any);
    } catch {
      message.error("Failed to generate Hindi PDF");
    } finally {
      hide();
      setPdfLoading(false);
    }
  };

  const handleCancelWorkOrder = async () => {
    if (!cancelRecord) return;
    if (!cancelRemark.trim()) {
      message.error("Please enter a remark for cancellation");
      return;
    }
    setCancelSubmitting(true);
    try {
      const res = await apiClient.patch<{ workOrder: WorkOrder }>(`/work-orders/${cancelRecord.id}/cancel`, { remark: cancelRemark.trim() });
      setWorkOrders(prev => prev.map(w => w.id === cancelRecord.id ? normalizeWO(res.data.workOrder) : w));
      message.success(`Work order ${cancelRecord.workOrderNo} cancelled`);
      setCancelRecord(null);
      setCancelRemark("");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to cancel work order";
      message.error(msg);
    } finally {
      setCancelSubmitting(false);
    }
  };

  const handleLockToggle = (wo: WorkOrder) => {
    const locking = !wo.isLocked;
    Modal.confirm({
      title: locking ? `Lock ${wo.workOrderNo}?` : `Unlock ${wo.workOrderNo}?`,
      icon: locking ? <LockOutlined /> : <UnlockOutlined />,
      content: locking
        ? "Once locked, its rates, scope items, milestones, and contract value can no longer be edited until it's unlocked again."
        : "This will allow rates, scope items, milestones, and contract value to be edited again.",
      okText: locking ? "Lock" : "Unlock",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const res = await apiClient.patch<{ workOrder: WorkOrder }>(`/work-orders/${wo.id}/${locking ? "lock" : "unlock"}`);
          setWorkOrders(prev => prev.map(w => w.id === wo.id ? normalizeWO(res.data.workOrder) : w));
          message.success(`Work order ${wo.workOrderNo} ${locking ? "locked" : "unlocked"}`);
        } catch (e: unknown) {
          const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to update lock status";
          message.error(msg);
        }
      },
    });
  };

  const handleDelete = async (wo: WorkOrder) => {
    try {
      await apiClient.delete(`/work-orders/${wo.id}`);
      setWorkOrders(prev => prev.filter(w => w.id !== wo.id));
      message.success(`Work order ${wo.workOrderNo} deleted`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Delete failed";
      message.error(msg);
    }
  };

  // ── Columns ───────────────────────────────────────────────────

  const columns = [
    {
      title: "WO No",
      dataIndex: "workOrderNo",
      width: 120,
      render: (t: string, record: WorkOrder) => (
        <span
          onClick={e => { e.stopPropagation(); navigate(`/work-items/${record.id}`); }}
          style={{ fontFamily: "monospace", fontWeight: 700, color: "#f37916", cursor: "pointer" }}
        >
          {t}
        </span>
      ),
    },
    {
      title: "Date",
      dataIndex: "issueDate",
      width: 110,
      render: (d: string) => dayjs(d).format("DD MMM YYYY"),
    },
    {
      title: "Project",
      dataIndex: "projectName",
      render: (name: string, wo: WorkOrder) => (
        <div>
          <div>{name}</div>
          {wo.projectLocation && (
            <div style={{ fontSize: 11, color: "#9ba3b8" }}>{wo.projectLocation}</div>
          )}
        </div>
      ),
    },
    {
      title: "Category",
      dataIndex: "category",
      width: 140,
      render: (cat: string) => <CategoryBadge cat={cat} />,
    },
    {
      title: "Vendor Code",
      dataIndex: "vendorCode",
      width: 110,
      render: (t: string) => (
        <span style={{ fontFamily: "monospace", background: "#eff4ff", color: "#2563eb", padding: "2px 7px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
          {t}
        </span>
      ),
    },
    { title: "Company Name", dataIndex: "vendorName" },
    {
      title: "Contract Value",
      dataIndex: "contractValue",
      width: 140,
      render: (v: number) =>
        v ? (
          <span style={{ fontFamily: "monospace", color: "#f37916", fontWeight: 600 }}>{fmt(v)}</span>
        ) : (
          <span style={{ color: "#9ba3b8" }}>—</span>
        ),
    },
    {
      title: "Progress",
      width: 140,
      render: (_: unknown, record: WorkOrder) => {
        const items = record.scopeItems || [];
        if (items.length === 0) return <span style={{ color: "#9ba3b8" }}>—</span>;
        const done    = items.filter(it => it.status === "completed").length;
        const running = items.filter(it => it.status === "running").length;
        const pct     = Math.round((done / items.length) * 100);
        return (
          <div>
            <div style={{ fontSize: 11, color: "#5a6278", marginBottom: 3 }}>
              {done}/{items.length} items done
              {running > 0 && <span style={{ color: "#f37916", marginLeft: 4 }}>{running} running</span>}
            </div>
            <Progress percent={pct} size="small" strokeColor="#16a85a" trailColor="#f0f0f0" showInfo={false} />
          </div>
        );
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 170,
      render: (s: WorkOrderStatus, record: WorkOrder) => {
        const delays = countDelays(record);
        return (
          <div>
            <ApprovalStatusPill wo={record} />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
              <Tag color={STATUS_CFG[s]?.color} style={{ fontSize: 11 }}>{STATUS_CFG[s]?.label ?? s}</Tag>
              {record.isLocked && (
                <Tooltip title="Rates, scope items, milestones, and contract value are locked">
                  <Tag color="gold" icon={<LockOutlined />} style={{ fontSize: 11, cursor: "default" }}>
                    Locked
                  </Tag>
                </Tooltip>
              )}
              {delays > 0 && (
                <Tooltip title={`${delays} scope item${delays > 1 ? "s" : ""} past their planned end date`}>
                  <Tag color="red" icon={<ExclamationCircleOutlined />} style={{ fontSize: 11, cursor: "default" }}>
                    {delays} overdue
                  </Tag>
                </Tooltip>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: "Created At",
      dataIndex: "createdAt",
      width: 110,
      render: (d: string) => d ? dayjs(d).format("DD MMM YYYY") : <span style={{ color: "#9ba3b8" }}>—</span>,
    },
    {
      title: "Created By",
      width: 130,
      render: (_: unknown, record: WorkOrder) => {
        const cb = record.createdBy;
        const name = cb && typeof cb === "object" ? cb.name : undefined;
        return name || <span style={{ color: "#9ba3b8" }}>—</span>;
      },
    },
    {
      title: "Actions",
      width: 110,
      render: (_: unknown, record: WorkOrder) => {
        const docCount = getWorkOrderDocuments(record).length;
        const canCancel = record.status !== "cancelled" && record.status !== "completed";
        const menuItems: MenuProps["items"] = [
          { key: "edit", label: "Edit", icon: <EditOutlined />, disabled: record.isLocked, ...(record.isLocked ? { title: "Locked — unlock to edit" } : {}) },
          { key: "pdf-hindi", label: "Download PDF (Hindi)", icon: <FilePdfOutlined /> },
          ...(docCount > 0 ? [{ key: "doc", label: `Documents (${docCount})`, icon: <LinkOutlined /> }] : []),
          ...(isOwner ? [{
            key: "lock-toggle",
            label: record.isLocked ? "Unlock Work Order" : "Lock Work Order",
            icon: record.isLocked ? <UnlockOutlined /> : <LockOutlined />,
          }] : []),
          ...(canCancel ? [{ key: "cancel", label: "Cancel Work Order", icon: <StopOutlined />, danger: true }] : []),
          ...(isOwner ? [{ key: "delete", label: "Delete", icon: <DeleteOutlined />, danger: true }] : []),
        ];
        const onMenuClick: MenuProps["onClick"] = ({ key }) => {
          if (key === "edit") {
            openEdit(record);
          } else if (key === "pdf-hindi") {
            handleDownloadPDFHindi(record);
          } else if (key === "doc") {
            ensureFullWorkOrder(record).then(setDocsRecord);
          } else if (key === "lock-toggle") {
            handleLockToggle(record);
          } else if (key === "cancel") {
            setCancelRemark("");
            setCancelRecord(record);
          } else if (key === "delete") {
            Modal.confirm({
              title: `Delete ${record.workOrderNo}?`,
              icon: <ExclamationCircleOutlined />,
              content: "This permanently removes the work order and cannot be undone.",
              okText: "Yes, Delete",
              okType: "danger",
              cancelText: "Cancel",
              onOk: () => handleDelete(record),
            });
          }
        };
        return (
          <div onClick={e => e.stopPropagation()}>
            <Space size={4}>
              <Tooltip title="View">
                <Button
                  type="text"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => { setSelectedWOId(record.id); setDrawerOpen(true); }}
                />
              </Tooltip>
              <Tooltip title="Download PDF">
                <Button
                  type="text"
                  size="small"
                  loading={pdfLoading}
                  onClick={() => handleDownloadPDF(record)}
                  style={{ fontSize: 16 }}
                >
                  📄
                </Button>
              </Tooltip>
              {menuItems.length > 0 && (
                <Dropdown menu={{ items: menuItems, onClick: onMenuClick }} trigger={["click"]}>
                  <Button type="text" size="small" icon={<MoreOutlined />} />
                </Dropdown>
              )}
            </Space>
          </div>
        );
      },
    },
  ];

  const hasActiveFilters =
    statusFilter !== "all" || categoryFilter !== "all" ||
    subCategoryFilter !== "all" || progressFilter !== "all" || projectFilter !== "all" || search !== "";

  const clearAllFilters = () => {
    setSearch(""); setStatusFilter("all");
    setCategoryFilter("all"); setSubCategoryFilter("all"); setProgressFilter("all"); setProjectFilter("all");
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <PageShell
      title="Work Orders"
      description="Define scope of work items, track progress per item, and flag overdue milestones."
      cta={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={() => {
            createForm.resetFields();
            createForm.setFieldsValue({
              status: "draft", assignedDRI: defaultDRIIds,
              // Default to whichever type the list is currently filtered to
              // (e.g. clicking "New" while viewing Consultancy Orders).
              contractType: contractTypeFilter === "professional-services" ? "professional-services" : "execution",
            });
            setCreateScopeItems([]);
            setCreateMilestones([]);
            setCreateDiscount(null);
            setCreateWarranty([]);
            setCreateDrawerOpen(true);
          }}
          style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
        >
          {contractTypeFilter === "professional-services" ? "New Consultancy Order" : "New Work Order"}
        </Button>
      }
    >
      {/* ── Tabs ────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <PillTabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { key: "all",     label: "All Work Orders",    count: 0 },
            { key: "pending", label: "Pending Approvals",  count: pendingApprovals.length },
          ]}
        />
        <Space size={12}>
          <Segmented
            value={contractTypeFilter}
            onChange={(v) => setContractTypeFilter(v as typeof contractTypeFilter)}
            options={[
              { label: "All", value: "all" },
              { label: "Execution", value: "execution" },
              { label: "Professional Services", value: "professional-services" },
            ]}
          />
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as typeof viewMode)}
            options={[
              { label: "List View", value: "list" },
              { label: "Monthly Report", value: "monthly" },
            ]}
          />
        </Space>
      </div>

      {/* ── Filters ─────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--nx-white)",
          border: "1px solid #E5E7EB",
          borderRadius: 10,
          padding: "14px 16px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Search */}
          <Input.Search
            placeholder="Search by WO No, project, vendor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 260 }}
          />

          {/* Status */}
          <Select
            value={statusFilter}
            onChange={val => setStatusFilter(val)}
            style={{ width: 148 }}
            suffixIcon={<span style={{ fontSize: 11, color: "#9CA3AF" }}>Status ▾</span>}
            options={[
              { label: "All Statuses",  value: "all" },
              { label: "Draft",         value: "draft" },
              { label: "Issued",        value: "issued" },
              { label: "In Progress",   value: "in-progress" },
              { label: "Completed",     value: "completed" },
              { label: "Cancelled",     value: "cancelled" },
            ]}
          />

          {/* Category */}
          <Select
            value={categoryFilter}
            onChange={val => { setCategoryFilter(val); setSubCategoryFilter("all"); }}
            style={{ width: 170 }}
            suffixIcon={<span style={{ fontSize: 11, color: "#9CA3AF" }}>Category ▾</span>}
            options={[
              { label: "All Categories", value: "all" },
              ...topLevelCats.filter(c => c.isActive).map(c => ({
                label: c.name,
                value: c.name,
              })),
            ]}
          />

          {/* Sub-category — only enabled when a category with subcats is selected */}
          <Select
            value={subCategoryFilter}
            onChange={setSubCategoryFilter}
            disabled={subCatsOfSelected.length === 0}
            style={{ width: 180 }}
            suffixIcon={<span style={{ fontSize: 11, color: "#9CA3AF" }}>Sub-category ▾</span>}
            options={[
              { label: subCatsOfSelected.length === 0 ? "No sub-categories" : "All Sub-categories", value: "all" },
              ...subCatsOfSelected.map(c => ({ label: c.name, value: c.name })),
            ]}
          />

          {/* Progress */}
          <Select
            value={progressFilter}
            onChange={setProgressFilter}
            style={{ width: 152 }}
            suffixIcon={<span style={{ fontSize: 11, color: "#9CA3AF" }}>Progress ▾</span>}
            options={[
              { label: "All Progress",  value: "all" },
              { label: "Not Started",   value: "not-started" },
              { label: "In Progress",   value: "running" },
              { label: "Completed",     value: "completed" },
              { label: "⚠ Overdue",     value: "overdue" },
            ]}
          />

          {/* Project */}
          <Select
            value={projectFilter}
            onChange={setProjectFilter}
            showSearch
            style={{ width: 180 }}
            suffixIcon={<span style={{ fontSize: 11, color: "#9CA3AF" }}>Project ▾</span>}
            filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
            options={[
              { label: "All Projects", value: "all" },
              ...selectableProjects(projects).map(p => ({ label: p.name, value: p.id })),
            ]}
          />

          {/* Date */}
          <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />

          {/* Clear */}
          {hasActiveFilters && (
            <Button size="small" onClick={clearAllFilters} style={{ color: "#6B7280" }}>
              Clear all
            </Button>
          )}

          <span style={{ marginLeft: "auto", color: "#9CA3AF", fontSize: 12, whiteSpace: "nowrap" }}>
            {filtered.length} work order{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {statusFilter !== "all" && (
              <span style={{ background: "#FFF4E8", border: "1px solid #f37916", color: "#f37916", fontSize: 11, padding: "2px 8px", borderRadius: 5, display: "flex", alignItems: "center", gap: 4 }}>
                Status: {statusFilter}
                <button type="button" onClick={() => setStatusFilter("all")} style={{ background: "none", border: "none", cursor: "pointer", color: "#f37916", padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
              </span>
            )}
            {categoryFilter !== "all" && (
              <span style={{ background: "#EFF6FF", border: "1px solid #2563eb", color: "#2563eb", fontSize: 11, padding: "2px 8px", borderRadius: 5, display: "flex", alignItems: "center", gap: 4 }}>
                Category: {categoryFilter}
                <button type="button" onClick={() => { setCategoryFilter("all"); setSubCategoryFilter("all"); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
              </span>
            )}
            {subCategoryFilter !== "all" && (
              <span style={{ background: "#F5F3FF", border: "1px solid #7c3aed", color: "#7c3aed", fontSize: 11, padding: "2px 8px", borderRadius: 5, display: "flex", alignItems: "center", gap: 4 }}>
                Sub-cat: {subCategoryFilter}
                <button type="button" onClick={() => setSubCategoryFilter("all")} style={{ background: "none", border: "none", cursor: "pointer", color: "#7c3aed", padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
              </span>
            )}
            {progressFilter !== "all" && (
              <span style={{ background: "#F0FDF4", border: "1px solid #16a85a", color: "#16a85a", fontSize: 11, padding: "2px 8px", borderRadius: 5, display: "flex", alignItems: "center", gap: 4 }}>
                Progress: {progressFilter === "not-started" ? "Not Started" : progressFilter === "running" ? "In Progress" : progressFilter === "completed" ? "Completed" : "Overdue"}
                <button type="button" onClick={() => setProgressFilter("all")} style={{ background: "none", border: "none", cursor: "pointer", color: "#16a85a", padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
              </span>
            )}
            {projectFilter !== "all" && (
              <span style={{ background: "#FFF7ED", border: "1px solid #FF7A00", color: "#FF7A00", fontSize: 11, padding: "2px 8px", borderRadius: 5, display: "flex", alignItems: "center", gap: 4 }}>
                Project: {selectableProjects(projects).find(p => p.id === projectFilter)?.name ?? projectFilter}
                <button type="button" onClick={() => setProjectFilter("all")} style={{ background: "none", border: "none", cursor: "pointer", color: "#FF7A00", padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      {viewMode === "list" ? (
        <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
          <Spin spinning={loadingData}>
            <Table
              rowKey="id"
              dataSource={filtered}
              columns={columns}
              onRow={record => ({
                onClick: () => { setSelectedWOId(record.id); setDrawerOpen(true); },
                style: { cursor: "pointer" },
              })}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              scroll={{ x: 1300 }}
              locale={{
                emptyText: loadingData ? " " : (
                  <div style={{ padding: "40px 20px", color: "#9CA3AF", textAlign: "center" }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
                    <div style={{ fontWeight: 600, color: "#374151" }}>No work orders yet</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      Click "New Work Order" to create your first one.
                    </div>
                  </div>
                ),
              }}
            />
          </Spin>
        </div>
      ) : (
        <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
          <Spin spinning={loadingData}>
            <Table
              rowKey="key"
              dataSource={monthlyReport}
              pagination={false}
              scroll={{ x: 1100 }}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ background: "#FFF8F3", fontWeight: 700 }}>
                    <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
                    <Table.Summary.Cell index={1}>{monthlyReportTotals.count}</Table.Summary.Cell>
                    <Table.Summary.Cell index={2}>{fmt(monthlyReportTotals.contractValue)}</Table.Summary.Cell>
                    <Table.Summary.Cell index={3}>{fmt(monthlyReportTotals.billed)}</Table.Summary.Cell>
                    <Table.Summary.Cell index={4}>{monthlyReportTotals.draft}</Table.Summary.Cell>
                    <Table.Summary.Cell index={5}>{monthlyReportTotals.issued}</Table.Summary.Cell>
                    <Table.Summary.Cell index={6}>{monthlyReportTotals.inProgress}</Table.Summary.Cell>
                    <Table.Summary.Cell index={7}>{monthlyReportTotals.completed}</Table.Summary.Cell>
                    <Table.Summary.Cell index={8}>{monthlyReportTotals.cancelled}</Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
              columns={[
                { title: "Month", dataIndex: "label", fixed: "left", width: 150, render: (v: string) => <strong>{v}</strong> },
                { title: "WOs", dataIndex: "count", width: 70, align: "right" as const },
                { title: "Contract Value", dataIndex: "contractValue", width: 150, align: "right" as const, render: fmt },
                { title: "Billed", dataIndex: "billed", width: 150, align: "right" as const, render: (v: number) => <span style={{ color: "#16a85a", fontWeight: 600 }}>{fmt(v)}</span> },
                { title: "Draft", dataIndex: "draft", width: 80, align: "right" as const },
                { title: "Issued", dataIndex: "issued", width: 80, align: "right" as const },
                { title: "In Progress", dataIndex: "inProgress", width: 100, align: "right" as const },
                { title: "Completed", dataIndex: "completed", width: 100, align: "right" as const },
                { title: "Cancelled", dataIndex: "cancelled", width: 100, align: "right" as const },
              ]}
              locale={{
                emptyText: loadingData ? " " : (
                  <div style={{ padding: "40px 20px", color: "#9CA3AF", textAlign: "center" }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
                    <div style={{ fontWeight: 600, color: "#374151" }}>No work orders match the current filters</div>
                  </div>
                ),
              }}
            />
          </Spin>
        </div>
      )}

      {/* ── View Drawer ──────────────────────────────────────── */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="right"
        title={
          <Space>
            <span style={{ fontSize: 20 }}>📋</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                Work Order —{" "}
                <span style={{ color: "#FF7A00", fontFamily: "monospace" }}>
                  {currentSelectedWO?.workOrderNo}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                {currentSelectedWO?.projectName}
                {currentSelectedWO?.projectLocation && ` — ${currentSelectedWO.projectLocation}`}
              </div>
            </div>
          </Space>
        }
        width={820}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                icon={<FilePdfOutlined />}
                loading={pdfLoading}
                onClick={() => currentSelectedWO && handleDownloadPDF(currentSelectedWO)}
                style={{ borderColor: "#e03b3b", color: "#e03b3b" }}
              >
                Download PDF
              </Button>
              <Button
                icon={<FilePdfOutlined />}
                loading={pdfLoading}
                onClick={() => currentSelectedWO && handleDownloadPDFHindi(currentSelectedWO)}
                style={{ borderColor: "#FF7A00", color: "#FF7A00" }}
              >
                Download PDF (Hindi)
              </Button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {currentSelectedWO && (
                <Button onClick={() => { setDrawerOpen(false); navigate(`/work-items/${currentSelectedWO.id}`); }}>
                  Open Full Page →
                </Button>
              )}
              {currentSelectedWO && (
                <Button
                  icon={<EditOutlined />}
                  onClick={() => { setDrawerOpen(false); openEdit(currentSelectedWO); }}
                >
                  Edit Work Order
                </Button>
              )}
              <Button size="large" onClick={() => setDrawerOpen(false)}>Close</Button>
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
      </Drawer>

      {/* ── Create Drawer ────────────────────────────────────── */}
      <Drawer
        open={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        placement="right"
        width={900}
        title={
          <Space>
            <span style={{ fontSize: 20 }}>📋</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>New Work Order</div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                Select project & vendor, then define the scope of work
              </div>
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => { createForm.resetFields(); setCreateScopeItems([]); setCreateMilestones([]); setCreateDiscount(null); setCreateWarranty([]); setCreateDrawerOpen(false); }}>
              Cancel
            </Button>
            <Button
              size="large"
              type="primary"
              loading={saving}
              onClick={handleCreate}
              style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
            >
              Save Work Order
            </Button>
          </div>
        }
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" initialValues={{ status: "draft" }}>
          <WOFormFields
            form={createForm}
            nextWONo={nextWONo}
            nextCWONo={nextCWONo}
            contractorsList={contractors}
            consultantsList={consultants}
            projectsList={projects}
            categoriesList={apiCategories}
            companiesList={companies}
            driList={driList}
            preparedByName={user?.name}
            preparedByContact={user?.email}
            onExtracted={applyAiExtraction}
          />
        </Form>
        <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 16, paddingTop: 16 }}>
          {createContractType === "professional-services" ? (
            <DeliverablesBuilder
              items={createScopeItems}
              onChange={setCreateScopeItems}
              gstPercent={createGstPercent}
            />
          ) : (
            <ScopeItemsBuilder
              items={createScopeItems}
              onChange={setCreateScopeItems}
              allCategories={apiCategories}
              topCatId={createTopCatId}
              onCategoryCreated={handleCategoryCreated}
              gstPercent={createGstPercent}
            />
          )}
        </div>
        <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 16, paddingTop: 16 }}>
          <PaymentMilestonesBuilder
            items={createMilestones}
            onChange={setCreateMilestones}
            contractValue={calcTotalAmt(createScopeItems)}
            contractValueInclGst={calcTotalInclGst(createScopeItems)}
            discount={createDiscount}
            onDiscountChange={setCreateDiscount}
          />
        </div>
        <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 16, paddingTop: 16 }}>
          <WarrantyTermsBuilder items={createWarranty} onChange={setCreateWarranty} />
        </div>
      </Drawer>

      {/* ── Edit Drawer ───────────────────────────────────────── */}
      <Drawer
        open={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditWOId(null); }}
        placement="right"
        width={900}
        title={
          <Space>
            <span style={{ fontSize: 20 }}>✏️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                Edit Work Order —{" "}
                <span style={{ color: "#FF7A00", fontFamily: "monospace" }}>
                  {currentEditWO?.workOrderNo}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                Changes preserve existing progress data
              </div>
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => { setEditModalOpen(false); setEditWOId(null); }}>
              Cancel
            </Button>
            <Button
              size="large"
              type="primary"
              loading={saving}
              onClick={handleSaveEdit}
              style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
            >
              Save Changes
            </Button>
          </div>
        }
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <WOFormFields
            form={editForm}
            isEdit
            nextWONo={nextWONo}
            nextCWONo={nextCWONo}
            contractorsList={contractors}
            consultantsList={consultants}
            projectsList={projects}
            categoriesList={apiCategories}
            companiesList={companies}
            driList={driList}
            preparedByName={currentEditWO?.preparedByName}
            preparedByContact={currentEditWO?.preparedByContact}
          />
        </Form>
        <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 16, paddingTop: 16 }}>
          {editContractType === "professional-services" ? (
            <DeliverablesBuilder
              items={editScopeItems}
              onChange={setEditScopeItems}
              gstPercent={editGstPercent}
            />
          ) : (
            <ScopeItemsBuilder
              items={editScopeItems}
              onChange={setEditScopeItems}
              allCategories={apiCategories}
              topCatId={editTopCatId}
              onCategoryCreated={handleCategoryCreated}
              gstPercent={editGstPercent}
            />
          )}
        </div>
        <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 16, paddingTop: 16 }}>
          <PaymentMilestonesBuilder
            items={editMilestones}
            onChange={setEditMilestones}
            contractValue={calcTotalAmt(editScopeItems)}
            contractValueInclGst={calcTotalInclGst(editScopeItems)}
            discount={editDiscount}
            onDiscountChange={setEditDiscount}
          />
        </div>
        <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 16, paddingTop: 16 }}>
          <WarrantyTermsBuilder items={editWarranty} onChange={setEditWarranty} />
        </div>
      </Drawer>

      {/* ── Progress Drawer ──────────────────────────────────── */}
      <Drawer
        open={progressModalOpen}
        onClose={() => { setProgressModalOpen(false); setProgressItem(null); progressForm.resetFields(); }}
        placement="right"
        width={480}
        title={
          <Space>
            <span style={{ fontSize: 20 }}>📈</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Record Progress</div>
              {progressItem && (
                <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                  {progressItem.description}
                </div>
              )}
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => { setProgressModalOpen(false); setProgressItem(null); progressForm.resetFields(); }}>
              Cancel
            </Button>
            <Button
              size="large"
              type="primary"
              loading={saving}
              onClick={handleAddProgress}
              style={{ background: "#16a85a", borderColor: "#16a85a" }}
            >
              Record Progress
            </Button>
          </div>
        }
        destroyOnClose
      >
        {progressItem && (
          <>
            <div
              style={{
                background: "#f0faf4",
                border: "1px solid #b7e8c8",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 20,
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 8 }}>
                <span><span style={{ color: "#9ba3b8" }}>Planned: </span><strong>{(progressItem.plannedQty ?? 0).toLocaleString("en-IN")} {progressItem.unit}</strong></span>
                <span><span style={{ color: "#9ba3b8" }}>Completed: </span><strong style={{ color: "#16a85a" }}>{(progressItem.completedQty ?? 0).toLocaleString("en-IN")} {progressItem.unit}</strong></span>
                <span><span style={{ color: "#9ba3b8" }}>Remaining: </span><strong>{Math.max(0, progressItem.plannedQty - (progressItem.completedQty ?? 0)).toLocaleString("en-IN")} {progressItem.unit}</strong></span>
              </div>
              <Progress
                percent={getCompletionPct(progressItem)}
                size="small"
                strokeColor={isItemDelayed(progressItem) ? "#e03b3b" : "#16a85a"}
                showInfo
              />
            </div>

            <Form form={progressForm} layout="vertical">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Date" name="date" rules={[{ required: true, message: "Select date" }]}>
                    <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label={`Qty Completed (${progressItem.unit})`}
                    name="qtyAdded"
                    extra={progressItem.unit === "per-hr" ? "e.g. 13.67 = 13 hr 40 min" : undefined}
                    rules={[
                      { required: true, message: "Enter quantity" },
                      { validator: (_, v) => v > 0 ? Promise.resolve() : Promise.reject("Must be > 0") },
                    ]}
                  >
                    <InputNumber style={{ width: "100%" }} min={0.01} step={0.01} precision={2} placeholder={progressItem.unit === "per-hr" ? "e.g. 13.67" : "e.g. 3000"} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="Remarks (optional)" name="remarks">
                <Input.TextArea rows={3} placeholder="e.g. Zone B concrete poured, curing in progress…" />
              </Form.Item>
            </Form>
          </>
        )}
      </Drawer>

      <Modal
        open={!!docsRecord}
        onCancel={() => setDocsRecord(null)}
        footer={null}
        title={`Documents — ${docsRecord?.workOrderNo ?? ""}`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {docsRecord && getWorkOrderDocuments(docsRecord).map((d, i) => (
            <a
              key={i} href={d.url} target="_blank" rel="noreferrer" download={d.name}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#f5f6f8", border: "1px solid #e4e7ee", borderRadius: 6 }}
            >
              <LinkOutlined /> {d.name}
            </a>
          ))}
        </div>
      </Modal>

      <Modal
        open={!!cancelRecord}
        onCancel={() => { setCancelRecord(null); setCancelRemark(""); }}
        onOk={handleCancelWorkOrder}
        okText="Cancel Work Order"
        okType="danger"
        okButtonProps={{ loading: cancelSubmitting, disabled: !cancelRemark.trim() }}
        cancelText="Back"
        title={`Cancel Work Order — ${cancelRecord?.workOrderNo ?? ""}`}
      >
        <p style={{ color: "#5a6278", marginBottom: 10 }}>
          This marks the work order as <strong>Cancelled</strong>. Existing bills/progress are not deleted, but no further
          progress or billing should be added against it. A remark is required.
        </p>
        <Input.TextArea
          rows={3}
          placeholder="Reason for cancelling this work order…"
          value={cancelRemark}
          onChange={e => setCancelRemark(e.target.value)}
        />
      </Modal>
    </PageShell>
  );
}
