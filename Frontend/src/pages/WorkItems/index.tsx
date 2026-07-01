import { useEffect, useMemo, useState } from "react";
import {
  Table,
  Button,
  Tag,
  Input,
  Form,
  Select,
  DatePicker,
  Upload,
  Drawer,
  Descriptions,
  Space,
  message,
  Row,
  Col,
  InputNumber,
  Progress,
  Tooltip,
  Spin,
  Popconfirm,
} from "antd";
import type { FormInstance } from "antd";
import { useNavigate } from "react-router-dom";
import {
  PlusOutlined,
  UploadOutlined,
  EditOutlined,
  EyeOutlined,
  LinkOutlined,
  DeleteOutlined,
  DownOutlined,
  UpOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  FilePdfOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import { useCategories } from "../../hooks/useCategories";
import { downloadWorkOrderPDF } from "../../components/WorkOrderPDF";
import type {
  Contractor,
  Project,
  WorkOrder,
  WorkOrderStatus,
  ScopeItem,
  ScopeItemStatus,
} from "../../types/VendorBilling";

// ── Constants ─────────────────────────────────────────────────

const STATUS_CFG: Record<WorkOrderStatus, { color: string; label: string }> = {
  draft:         { color: "default", label: "Draft" },
  issued:        { color: "blue",    label: "Issued" },
  "in-progress": { color: "orange",  label: "In Progress" },
  completed:     { color: "green",   label: "Completed" },
};

const STATUS_OPTIONS = [
  { label: "Draft",       value: "draft" },
  { label: "Issued",      value: "issued" },
  { label: "In Progress", value: "in-progress" },
  { label: "Completed",   value: "completed" },
];

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
  { label: "Per Hour",             value: "per-hr" },
  { label: "Per Trip",             value: "per-trip" },
  { label: "Lump Sum",             value: "lump-sum" },
  { label: "Strip",                value: "strip" },
  { label: "Custom...",            value: "custom" },
];

// ── Draft types ───────────────────────────────────────────────

interface ScopeSubItemDraft {
  id: string;
  description: string;
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
  plannedStart: string;
  plannedEnd: string;
  showSubItems: boolean;
  subItems: ScopeSubItemDraft[];
}

// ── Helpers ──────────────────────────────────────────────────

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

const resolveUnit = (unit: string, customUnit: string) =>
  unit === "custom" ? (customUnit.trim() || "unit") : unit;

const isKnownUnit = (unit: string) =>
  UNIT_OPTIONS.some(u => u.value === unit && u.value !== "custom");

const calcSubItemAmt = (si: ScopeSubItemDraft) =>
  (si.plannedQty || 0) * (si.rate || 0);

const calcDraftItemAmt = (item: ScopeItemDraft): number =>
  item.subItems.length > 0
    ? item.subItems.reduce((s, si) => s + calcSubItemAmt(si), 0)
    : (item.plannedQty || 0) * (item.rate || 0);

const calcTotalAmt = (items: ScopeItemDraft[]) =>
  items.reduce((s, it) => s + calcDraftItemAmt(it), 0);

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
});

const newSubDraft = (): ScopeSubItemDraft => ({
  id: crypto.randomUUID(),
  description: "", unit: "sq.ft", customUnit: "",
  plannedQty: null, rate: null,
});

const newItemDraft = (): ScopeItemDraft => ({
  id: crypto.randomUUID(),
  description: "", remarks: "", subCategoryId: "", subSubCategoryId: "",
  unit: "sq.ft", customUnit: "",
  plannedQty: null, rate: null,
  plannedStart: "", plannedEnd: "",
  showSubItems: false, subItems: [],
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
  plannedStart: si.plannedStart,
  plannedEnd: si.plannedEnd,
  showSubItems: si.subItems.length > 0,
  subItems: si.subItems.map(sub => ({
    id: sub.id,
    description: sub.description,
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
  rate: d.subItems.length > 0 ? 0 : (d.rate || 0),
  amount: calcDraftItemAmt(d),
  plannedStart: d.plannedStart,
  plannedEnd: d.plannedEnd,
  status: "pending",
  completedQty: 0,
  progressEntries: [],
  subItems: d.subItems.map(si => ({
    id: si.id,
    description: si.description,
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
  description: d.description,
  remarks: d.remarks,
  unit: resolveUnit(d.unit, d.customUnit),
  plannedQty: d.plannedQty || 0,
  rate: d.subItems.length > 0 ? 0 : (d.rate || 0),
  amount: calcDraftItemAmt(d),
  plannedStart: d.plannedStart,
  plannedEnd: d.plannedEnd,
  status: existing?.status || "pending",
  completedQty: existing?.completedQty || 0,
  progressEntries: existing?.progressEntries || [],
  subItems: d.subItems.map(si => ({
    id: si.id,
    description: si.description,
    unit: resolveUnit(si.unit, si.customUnit),
    plannedQty: si.plannedQty || 0,
    rate: si.rate || 0,
    amount: calcSubItemAmt(si),
  })),
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
      getPopupContainer={(trigger) => trigger.parentElement || document.body}
    />
  );
}

// ── ScopeItemsBuilder ─────────────────────────────────────────

interface CatOption {
  _id: string; name: string; parentId?: string | null; isActive: boolean;
}

interface ScopeItemsBuilderProps {
  items: ScopeItemDraft[];
  onChange: (items: ScopeItemDraft[]) => void;
  allCategories?: CatOption[];
  topCatId?: string | null;
}

function ScopeItemsBuilder({ items, onChange, allCategories = [], topCatId = null }: ScopeItemsBuilderProps) {
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
          onClick={() => onChange([...items, newItemDraft()])}
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
                  <Col span={item.subItems.length > 0 ? 6 : 4}>
                    <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Unit</div>
                    <UnitCell unit={item.unit} customUnit={item.customUnit} onChange={patch => upd(item.id, patch)} />
                  </Col>
                  {item.subItems.length === 0 && (
                    <>
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
                  )}
                  {item.subItems.length > 0 && (
                    <Col span={6}>
                      <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Total (from sub-items)</div>
                      {amtBox(13)}
                    </Col>
                  )}
                </>
              );

              if (hasSubSub) {
                return (
                  <>
                    {/* Row 1: Sub-Category full width */}
                    <Row gutter={[10, 0]}>
                      <Col span={24}>
                        <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Sub-Category *</div>
                        <Select
                          placeholder="Select sub-category"
                          value={item.subCategoryId || undefined}
                          options={subCatOptions.map(c => ({ label: c.name, value: c._id }))}
                          onChange={v => { const cat = allCategories.find(c => c._id === v); upd(item.id, { subCategoryId: v, subSubCategoryId: "", description: cat?.name ?? "" }); }}
                          allowClear
                          onClear={() => upd(item.id, { subCategoryId: "", subSubCategoryId: "", description: "" })}
                          style={{ width: "100%" }}
                          showSearch
                          filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
                          getPopupContainer={(trigger) => trigger.parentElement || document.body}
                        />
                      </Col>
                    </Row>
                    {/* Row 2: Sub-Sub-Category + Unit + Qty + Rate + Amount */}
                    <Row gutter={[10, 0]} style={{ marginTop: 8 }}>
                      <Col span={item.subItems.length > 0 ? 12 : 8}>
                        <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Sub-Sub-Category</div>
                        <Select
                          placeholder="Select (optional)"
                          value={item.subSubCategoryId || undefined}
                          options={getSubSubCatOptions(item.subCategoryId).map(c => ({ label: c.name, value: c._id }))}
                          onChange={v => { const cat = allCategories.find(c => c._id === v); upd(item.id, { subSubCategoryId: v, description: cat?.name ?? item.description }); }}
                          allowClear
                          onClear={() => { const subCat = allCategories.find(c => c._id === item.subCategoryId); upd(item.id, { subSubCategoryId: "", description: subCat?.name ?? "" }); }}
                          style={{ width: "100%" }}
                          showSearch
                          filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
                          getPopupContainer={(trigger) => trigger.parentElement || document.body}
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
                  <Col span={item.subItems.length > 0 ? 12 : 8}>
                    {subCatOptions.length > 0 ? (
                      <>
                        <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Sub-Category *</div>
                        <Select
                          placeholder="Select sub-category"
                          value={item.subCategoryId || undefined}
                          options={subCatOptions.map(c => ({ label: c.name, value: c._id }))}
                          onChange={v => { const cat = allCategories.find(c => c._id === v); upd(item.id, { subCategoryId: v, subSubCategoryId: "", description: cat?.name ?? "" }); }}
                          allowClear
                          onClear={() => upd(item.id, { subCategoryId: "", subSubCategoryId: "", description: "" })}
                          style={{ width: "100%" }}
                          showSearch
                          filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
                          getPopupContainer={(trigger) => trigger.parentElement || document.body}
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
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Start Date</div>
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: "100%" }}
                  value={item.plannedStart ? dayjs(item.plannedStart) : null}
                  onChange={d => upd(item.id, { plannedStart: d ? d.format("YYYY-MM-DD") : "" })}
                />
              </Col>
              <Col span={6}>
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>End Date</div>
                <DatePicker
                  format="DD/MM/YYYY"
                  style={{ width: "100%" }}
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
                  {item.showSubItems ? "Hide" : "Add"} Sub-Items
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
                  Sub-Items — Detailed Pricing Breakdown
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
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 8,
                      background: "#fff",
                      border: "1px solid #e4e7ee",
                      borderRadius: 6,
                      padding: "8px 10px",
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
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 600, color: "#5a6278" }}>
            Total Contract Value ({items.length} item{items.length !== 1 ? "s" : ""})
          </span>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#d4620c", fontSize: 16 }}>
            {total > 0 ? fmt(total) : "—"}
          </span>
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
                        {Math.max(0, item.plannedQty - item.completedQty).toLocaleString("en-IN")} {item.unit}
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
  contractorsList,
  projectsList,
  categoriesList,
  companiesList = [],
  driList = [],
}: {
  form: FormInstance;
  isEdit?: boolean;
  nextWONo: string;
  contractorsList: Contractor[];
  projectsList: Project[];
  categoriesList: { _id: string; name: string; isActive: boolean; parentId?: string | null }[];
  companiesList?: any[];
  driList?: { _id: string; name: string; email: string }[];
}) {

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

  const fillProject = (projectId: string) => {
    const p = projectsList.find(x => (x as any)._id === projectId || x.id === projectId);
    if (p) form.setFieldsValue({ projectName: p.name });
  };

  return (
    <>
      <Row gutter={16} style={{ marginBottom: 4 }}>
        <Col span={12}>
          <Form.Item
            label="Work Order Number"
            name="workOrderNo"
            tooltip={!isEdit ? `Leave blank to auto-assign (${nextWONo})` : undefined}
          >
            <Input
              placeholder={isEdit ? undefined : `Auto-assign: ${nextWONo}`}
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
              getPopupContainer={(trigger) => trigger.parentElement || document.body}
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
              options={projectsList.map(p => ({ label: p.name, value: (p as any)._id || p.id }))}
              getPopupContainer={(trigger) => trigger.parentElement || document.body}
            />
          </Form.Item>
          <Form.Item name="projectName" hidden><Input /></Form.Item>
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
            label="Vendor Code"
            name="vendorCode"
            rules={[{ required: true, message: "Select a vendor" }]}
          >
            <Select
              placeholder="Select vendor"
              showSearch
              filterOption={(input, opt) =>
                String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())
              }
              onChange={fillVendor}
              options={contractorsList.map(c => ({
                label: `${c.vendorCode} — ${c.companyName}`,
                value: c.vendorCode,
              }))}
              getPopupContainer={(trigger) => trigger.parentElement || document.body}
            />
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
              getPopupContainer={(trigger) => trigger.parentElement || document.body}
            />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="Status" name="status" rules={[{ required: true }]}>
            <Select
              options={STATUS_OPTIONS}
              getPopupContainer={(trigger) => trigger.parentElement || document.body}
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
                getPopupContainer={(trigger) => trigger.parentElement || document.body}
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
          Auto-filled from Contractor Master
        </div>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Company Name" name="vendorName" style={{ marginBottom: 10 }}>
              <Input disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Owner Name" name="ownerName" style={{ marginBottom: 10 }}>
              <Input disabled />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="Mobile" name="mobile" style={{ marginBottom: 0 }}>
          <Input disabled />
        </Form.Item>
      </div>

      <Form.Item
        label="Upload Work Order Document"
        name="document"
        valuePropName="fileList"
        getValueFromEvent={e => (Array.isArray(e) ? e : e?.fileList)}
      >
        <Upload beforeUpload={() => false} maxCount={1} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png">
          <Button icon={<UploadOutlined />}>Upload PDF / Doc / Image</Button>
        </Upload>
      </Form.Item>
    </>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function WorkItems() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const isOwner = user?.role === "owner";

  const { categories: apiCategories, lighten } = useCategories();

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
  // bills keyed by workOrderId for billing tape in view drawer
  const [woBillsMap, setWoBillsMap] = useState<Record<string, { amount: number; status: string }[]>>({});

  const [selectedWOId, setSelectedWOId] = useState<string | null>(null);
  const [drawerOpen,   setDrawerOpen]   = useState(false);
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

  const [editForm]     = Form.useForm();
  const [createForm]   = Form.useForm();
  const [progressForm] = Form.useForm();

  const createCatName = Form.useWatch("category", createForm) as string | undefined;
  const editCatName   = Form.useWatch("category", editForm)   as string | undefined;

  // ── Load all data ─────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      apiClient.get<{ workOrders: any[] }>("/work-orders"),
      apiClient.get<{ contractors: any[] }>("/contractors"),
      apiClient.get<{ projects: any[] }>("/projects"),
      apiClient.get<{ bills: any[] }>("/bills"),
      apiClient.get<{ companies: any[] }>("/companies"),
      apiClient.get<{ users: any[] }>("/auth/users?role=dri"),
    ])
      .then(([woRes, cRes, pRes, billRes, coRes, driRes]) => {
        setWorkOrders(woRes.data.workOrders.map(normalizeWO));
        setContractors(cRes.data.contractors.map(normalizeId));
        setProjects(pRes.data.projects.map(normalizeId));
        setCompanies(coRes.data.companies ?? []);
        setDriList(driRes.data.users ?? []);
        // Build map: workOrderId → [{amount, status}]
        const map: Record<string, { amount: number; status: string }[]> = {};
        for (const b of (billRes.data.bills || [])) {
          const wid = b.workOrderId?.toString();
          if (!wid) continue;
          if (!map[wid]) map[wid] = [];
          map[wid].push({ amount: b.amount || 0, status: b.status });
        }
        setWoBillsMap(map);
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
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

  // Derive category tree for filter logic
  const topLevelCats = useMemo(() => apiCategories.filter(c => !c.parentId), [apiCategories]);
  const allSubCats   = useMemo(() => apiCategories.filter(c => !!c.parentId),  [apiCategories]);
  const subCatsOfSelected = useMemo(() => {
    if (categoryFilter === "all") return [];
    const parent = topLevelCats.find(c => c.name === categoryFilter);
    return parent ? allSubCats.filter(c => c.parentId === parent._id) : [];
  }, [categoryFilter, topLevelCats, allSubCats]);

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

      return matchSearch && matchStatus && matchCategory && matchProgress;
    });
  }, [workOrders, search, statusFilter, categoryFilter, subCategoryFilter, progressFilter, subCatsOfSelected]);

  const nextWONo = useMemo(() => {
    const max = workOrders.reduce((m, wo) => {
      const match = wo.workOrderNo.match(/WO-(\d+)/);
      return match ? Math.max(m, parseInt(match[1])) : m;
    }, 0);
    return `WO-${String(max + 1).padStart(4, "0")}`;
  }, [workOrders]);

  // ── Handlers ─────────────────────────────────────────────────

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      const totalAmt  = calcTotalAmt(createScopeItems);
      const scopeOfWork = createScopeItems.map(it => it.description).filter(Boolean).join(", ");

      const body: Record<string, unknown> = {
        issueDate:    values.issueDate ? dayjs(values.issueDate).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"),
        projectId:    values.projectId,
        projectName:  values.projectName || "",
        vendorCode:   values.vendorCode,
        vendorName:   values.vendorName  || "",
        ownerName:    values.ownerName   || "",
        mobile:       values.mobile      || "",
        category:     values.category    || "",
        subCategory:  values.subCategory  || "",
        companyId:    values.companyId   || null,
        assignedDRI:  values.assignedDRI || [],
        scopeOfWork,
        scopeItems:   createScopeItems.map(draftToNewItem),
        contractValue: totalAmt,
        status:       values.status || "draft",
      };
      if (values.workOrderNo?.trim()) body.workOrderNo = values.workOrderNo.trim();

      setSaving(true);
      const res = await apiClient.post<{ workOrder: WorkOrder }>("/work-orders", body);
      setWorkOrders(prev => [normalizeWO(res.data.workOrder), ...prev]);
      message.success(`Work order ${res.data.workOrder.workOrderNo} created`);
      createForm.resetFields();
      setCreateScopeItems([]);
      setCreateDrawerOpen(false);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "errorFields" in err) return;
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (wo: WorkOrder) => {
    setEditWOId(wo.id);
    editForm.setFieldsValue({ ...wo, issueDate: dayjs(wo.issueDate), category: wo.category || "", subCategory: wo.subCategory || "", assignedDRI: ((wo as any).assignedDRI || []).map((d: any) => d._id || d) });
    setEditScopeItems((wo.scopeItems || []).map(toDraft));
    setEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      const values = await editForm.validateFields();
      if (!currentEditWO) return;

      const totalAmt    = calcTotalAmt(editScopeItems);
      const scopeOfWork = editScopeItems.map(it => it.description).filter(Boolean).join(", ");
      const savedItems  = editScopeItems.map(d => {
        const existing = currentEditWO.scopeItems.find(si => si.id === d.id);
        return mergeWithExisting(d, existing);
      });

      const body = {
        projectId:    values.projectId,
        projectName:  values.projectName  || currentEditWO.projectName,
        vendorCode:   values.vendorCode,
        vendorName:   values.vendorName   || currentEditWO.vendorName,
        ownerName:    values.ownerName    || currentEditWO.ownerName,
        mobile:       values.mobile       || currentEditWO.mobile,
        category:     values.category     ?? currentEditWO.category ?? "",
        subCategory:  values.subCategory  ?? currentEditWO.subCategory ?? "",
        assignedDRI:  values.assignedDRI  ?? (currentEditWO as any).assignedDRI ?? [],
        issueDate:    values.issueDate ? dayjs(values.issueDate).format("YYYY-MM-DD") : currentEditWO.issueDate,
        scopeOfWork,
        scopeItems:   savedItems,
        contractValue: totalAmt,
        status:       values.status,
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

  const handleDownloadPDF = async (wo: WorkOrder) => {
    setPdfLoading(true);
    try {
      const company    = companies.find((c: any) => c._id === (wo as any).companyId) ?? null;
      const contractor = contractors.find(c => c.vendorCode === wo.vendorCode) ?? null;
      await downloadWorkOrderPDF(wo as any, company, contractor as any);
    } catch {
      message.error("Failed to generate PDF");
    } finally {
      setPdfLoading(false);
    }
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
      render: (t: string) => (
        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#f37916" }}>{t}</span>
      ),
    },
    {
      title: "Date",
      dataIndex: "issueDate",
      width: 110,
      render: (d: string) => dayjs(d).format("DD MMM YYYY"),
    },
    { title: "Project", dataIndex: "projectName" },
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
      width: 130,
      render: (s: WorkOrderStatus, record: WorkOrder) => {
        const delays = countDelays(record);
        return (
          <div>
            <Tag color={STATUS_CFG[s]?.color}>{STATUS_CFG[s]?.label ?? s}</Tag>
            {delays > 0 && (
              <div style={{ marginTop: 3 }}>
                <Tooltip title={`${delays} scope item${delays > 1 ? "s" : ""} past their planned end date`}>
                  <Tag color="red" icon={<ExclamationCircleOutlined />} style={{ fontSize: 11, cursor: "default" }}>
                    {delays} overdue
                  </Tag>
                </Tooltip>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "Actions",
      width: 180,
      render: (_: unknown, record: WorkOrder) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => { setSelectedWOId(record.id); setDrawerOpen(true); }}
          >
            View
          </Button>
          <Tooltip title="Progress Dashboard">
            <Button
              type="link"
              size="small"
              icon={<BarChartOutlined />}
              style={{ color: "#FF7A00" }}
              onClick={() => navigate(`/work-items/${record.id}`)}
            />
          </Tooltip>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          >
            Edit
          </Button>
          {record.documentName && (
            <Button type="link" size="small" icon={<LinkOutlined />}>Doc</Button>
          )}
          {isOwner && (
            <Popconfirm
              title={`Delete ${record.workOrderNo}?`}
              description="This permanently removes the work order and cannot be undone."
              okText="Yes, Delete"
              okType="danger"
              cancelText="Cancel"
              onConfirm={() => handleDelete(record)}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const hasActiveFilters =
    statusFilter !== "all" || categoryFilter !== "all" ||
    subCategoryFilter !== "all" || progressFilter !== "all" || search !== "";

  const clearAllFilters = () => {
    setSearch(""); setStatusFilter("all");
    setCategoryFilter("all"); setSubCategoryFilter("all"); setProgressFilter("all");
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
            createForm.setFieldsValue({ status: "draft" });
            setCreateScopeItems([]);
            setCreateDrawerOpen(true);
          }}
          style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
        >
          New Work Order
        </Button>
      }
    >
      {/* ── Filters ─────────────────────────────────────────── */}
      <div
        style={{
          background: "#fff",
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
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
        <Spin spinning={loadingData}>
          <Table
            rowKey="id"
            dataSource={filtered}
            columns={columns}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1100 }}
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
            <Button size="large" onClick={() => { createForm.resetFields(); setCreateScopeItems([]); setCreateDrawerOpen(false); }}>
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
            contractorsList={contractors}
            projectsList={projects}
            categoriesList={apiCategories}
            companiesList={companies}
            driList={driList}
          />
        </Form>
        <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 16, paddingTop: 16 }}>
          <ScopeItemsBuilder
            items={createScopeItems}
            onChange={setCreateScopeItems}
            allCategories={apiCategories}
            topCatId={createTopCatId}
          />
        </div>
      </Drawer>

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
              </div>
            </div>
          </Space>
        }
        width={780}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <Button
              icon={<FilePdfOutlined />}
              loading={pdfLoading}
              onClick={() => currentSelectedWO && handleDownloadPDF(currentSelectedWO)}
              style={{ borderColor: "#e03b3b", color: "#e03b3b" }}
            >
              Download PDF
            </Button>
            <div style={{ display: "flex", gap: 8 }}>
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
          <>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 20 }}>
              <Descriptions.Item label="Work Order No">
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00" }}>
                  {currentSelectedWO.workOrderNo}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Issue Date">
                {dayjs(currentSelectedWO.issueDate).format("DD MMM YYYY")}
              </Descriptions.Item>
              <Descriptions.Item label="Project">{currentSelectedWO.projectName}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_CFG[currentSelectedWO.status]?.color}>
                  {STATUS_CFG[currentSelectedWO.status]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Vendor Code">
                <span style={{ fontFamily: "monospace", background: "#eff4ff", color: "#2563eb", padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>
                  {currentSelectedWO.vendorCode}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Company">{currentSelectedWO.vendorName}</Descriptions.Item>
              <Descriptions.Item label="Owner">{currentSelectedWO.ownerName}</Descriptions.Item>
              <Descriptions.Item label="Mobile">{currentSelectedWO.mobile}</Descriptions.Item>
              <Descriptions.Item label="Contract Value" span={2}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00", fontSize: 15 }}>
                  {fmt(currentSelectedWO.contractValue)}
                </span>
              </Descriptions.Item>
              {currentSelectedWO.documentName && (
                <Descriptions.Item label="Document" span={2}>
                  <Button type="link" icon={<LinkOutlined />} style={{ padding: 0 }}>
                    {currentSelectedWO.documentName}
                  </Button>
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* ── Billing Tape ─────────────────────────────── */}
            {(() => {
              const bills = woBillsMap[currentSelectedWO.id] ?? [];
              const contractVal = currentSelectedWO.contractValue ?? 0;
              const certifiedAmt = bills.filter(b => b.status === "approved" || b.status === "paid").reduce((s, b) => s + b.amount, 0);
              const pendingAmt = bills.filter(b => b.status === "submitted" || b.status === "verified").reduce((s, b) => s + b.amount, 0);
              const remaining = Math.max(0, contractVal - certifiedAmt - pendingAmt);
              const certPct = contractVal > 0 ? (certifiedAmt / contractVal) * 100 : 0;
              const pendPct = contractVal > 0 ? (pendingAmt / contractVal) * 100 : 0;
              return (
                <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: "16px 20px", marginBottom: 20 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 12 }}>Billing Summary</div>
                  <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "#E5E7EB", marginBottom: 14 }}>
                    {certPct > 0 && <div style={{ width: `${certPct}%`, background: "#16a34a" }} title={`Certified: ${fmt(certifiedAmt)}`} />}
                    {pendPct > 0 && <div style={{ width: `${pendPct}%`, background: "#f59e0b" }} title={`Pending: ${fmt(pendingAmt)}`} />}
                  </div>
                  <div style={{ display: "flex", gap: 0, borderTop: "1px solid #E5E7EB", paddingTop: 12 }}>
                    {[
                      { label: "Contract Value", value: fmt(contractVal), color: "#374151", dot: "#6B7280" },
                      { label: "Certified ✓", value: fmt(certifiedAmt), color: "#16a34a", dot: "#16a34a" },
                      { label: "Pending ⏳", value: fmt(pendingAmt), color: "#d97706", dot: "#f59e0b" },
                      { label: "Remaining", value: fmt(remaining), color: "#6B7280", dot: "#D1D5DB" },
                    ].map((s, i) => (
                      <div key={i} style={{ flex: 1, textAlign: i === 0 ? "left" : "center", borderRight: i < 3 ? "1px solid #E5E7EB" : "none", paddingRight: 12, paddingLeft: i > 0 ? 12 : 0 }}>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 3, display: "flex", alignItems: "center", gap: 5, justifyContent: i === 0 ? "flex-start" : "center" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
                          {s.label}
                        </div>
                        <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 13, color: s.color }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

          </>
        )}
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
            contractorsList={contractors}
            projectsList={projects}
            categoriesList={apiCategories}
            companiesList={companies}
            driList={driList}
          />
        </Form>
        <div style={{ borderTop: "1px solid #E5E7EB", marginTop: 16, paddingTop: 16 }}>
          <ScopeItemsBuilder
            items={editScopeItems}
            onChange={setEditScopeItems}
            allCategories={apiCategories}
            topCatId={editTopCatId}
          />
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
                <span><span style={{ color: "#9ba3b8" }}>Planned: </span><strong>{progressItem.plannedQty.toLocaleString("en-IN")} {progressItem.unit}</strong></span>
                <span><span style={{ color: "#9ba3b8" }}>Completed: </span><strong style={{ color: "#16a85a" }}>{progressItem.completedQty.toLocaleString("en-IN")} {progressItem.unit}</strong></span>
                <span><span style={{ color: "#9ba3b8" }}>Remaining: </span><strong>{Math.max(0, progressItem.plannedQty - progressItem.completedQty).toLocaleString("en-IN")} {progressItem.unit}</strong></span>
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
                    rules={[
                      { required: true, message: "Enter quantity" },
                      { validator: (_, v) => v > 0 ? Promise.resolve() : Promise.reject("Must be > 0") },
                    ]}
                  >
                    <InputNumber style={{ width: "100%" }} min={0.01} placeholder="e.g. 3000" />
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
    </PageShell>
  );
}
