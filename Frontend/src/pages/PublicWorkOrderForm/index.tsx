import { useEffect, useState } from "react";
import {
  Form, Select, DatePicker, Input, InputNumber, Button,
  Divider, Card, Typography, Space, Spin, Result, Tag, Row, Col, message,
} from "antd";
import {
  CheckCircleOutlined,
  FileTextOutlined,
  PlusOutlined,
  DeleteOutlined,
  DownOutlined,
  UpOutlined,
} from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
import { selectableProjects } from "../../utils/projectOptions";
import PaymentMilestonesBuilder, { calcPayable, calcGrandTotal } from "../../components/PaymentMilestonesBuilder";
import type { MilestoneDraft } from "../../components/PaymentMilestonesBuilder";
import WarrantyTermsBuilder from "../../components/WarrantyTermsBuilder";
import GstSelect from "../../components/GstSelect";
import DocumentsUpload from "../../components/DocumentsUpload";
import type { WODocument } from "../../components/DocumentsUpload";

const { Title, Text } = Typography;

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");
const pub  = axios.create({ baseURL: BASE.replace(/\/api$/, "/api/public") });
// Unwrap { success, data } envelope from backend
pub.interceptors.response.use(r => {
  if (r.data && "success" in r.data && "data" in r.data) r.data = r.data.data;
  return r;
});

const STATUS_OPTIONS = [
  { label: "Draft",       value: "draft"       },
  { label: "Issued",      value: "issued"      },
  { label: "In Progress", value: "in-progress" },
];

const UNIT_OPTIONS = [
  { label: "Sq.Ft (Square Feet)", value: "sq.ft"      },
  { label: "Sq.M (Square Meter)", value: "sq.m"       },
  { label: "Cu.M (Cubic Meter)",  value: "cu.m"       },
  { label: "Cu.Ft (Cubic Feet)",  value: "cu.ft"      },
  { label: "RMT (Running Meter)", value: "rmt"        },
  { label: "Kg (Kilogram)",       value: "kg"         },
  { label: "MT (Metric Ton)",     value: "mt"         },
  { label: "Nos (Numbers)",       value: "nos"        },
  { label: "Daily Wage",          value: "daily-wage" },
  { label: "Per Day",             value: "per-day"    },
  { label: "Per Person",          value: "per-person" },
  { label: "Per Hour",            value: "per-hr"     },
  { label: "Per Trip",            value: "per-trip"   },
  { label: "RFT (Running Foot)",  value: "rft"        },
  { label: "Lump Sum",            value: "lump-sum"   },
];

// ── Types ────────────────────────────────────────────────────────

interface CatOption { _id: string; name: string; parentId: string | null; }
interface Contractor { vendorCode: string; companyName: string; ownerName: string; }
interface Lookup     { _id: string; name: string; parentId?: string | null; location?: string; }

interface SubItemDraft {
  id: string;
  description: string;
  unit: string;
  plannedQty: number | null;
  rate: number | null;
}

interface ScopeDraft {
  id: string;
  subCategoryId: string;
  description: string;
  unit: string;
  plannedQty: number | null;
  rate: number | null;
  gstPercent: number;
  remarks: string;
  plannedStart: string;
  plannedEnd: string;
  showSubItems: boolean;
  subItems: SubItemDraft[];
}

// ── Helpers ──────────────────────────────────────────────────────

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

function calcItemAmt(item: ScopeDraft) {
  if (item.subItems.length > 0)
    return item.subItems.reduce((s, si) => s + (si.plannedQty || 0) * (si.rate || 0), 0);
  return (item.plannedQty || 0) * (item.rate || 0);
}

function calcItemInclGst(item: ScopeDraft) {
  return calcItemAmt(item) * (1 + (item.gstPercent || 0) / 100);
}

function newScope(gstPercent = 18): ScopeDraft {
  return {
    id: crypto.randomUUID(), subCategoryId: "", description: "",
    unit: "sq.ft", plannedQty: null, rate: null, gstPercent,
    remarks: "", plannedStart: "", plannedEnd: "",
    showSubItems: false, subItems: [],
  };
}

function newSubItem(): SubItemDraft {
  return { id: crypto.randomUUID(), description: "", unit: "sq.ft", plannedQty: null, rate: null };
}

// ── AmtBox ───────────────────────────────────────────────────────

function AmtBox({ value }: { value: number }) {
  return (
    <div style={{
      background: "#fff8f3", border: "1px solid #f8c9a0", borderRadius: 6,
      padding: "5px 10px", fontFamily: "monospace", fontWeight: 700,
      color: "#d4620c", fontSize: 12, minHeight: 32, display: "flex", alignItems: "center",
    }}>
      {value > 0 ? fmt(value) : "—"}
    </div>
  );
}

// ── Sub-category select that lets vendors type a name that isn't in the
// preset list. Unlike the internal Work Orders page, this public form has no
// login, so it can't call the (auth-protected) category-creation endpoint —
// a typed name is simply carried through as free-text `description` on the
// scope item instead of being added to the shared category list.
function SubCategorySelect({
  value, options, onSelect, onClear,
}: {
  value?: string;
  options: { label: string; value: string }[];
  onSelect: (id: string, name: string) => void;
  onClear: () => void;
}) {
  const [search, setSearch] = useState("");
  const CUSTOM_VALUE = "__custom__";
  const trimmed = search.trim();
  const exists = trimmed.length > 0 && options.some(o => o.label.toLowerCase() === trimmed.toLowerCase());
  const finalOptions = trimmed.length > 0 && !exists
    ? [...options, { label: `+ Use "${trimmed}" as sub-category`, value: CUSTOM_VALUE }]
    : options;

  return (
    <Select
      placeholder="Select or type to add sub-category"
      placement="bottomLeft"
      value={value || undefined}
      options={finalOptions}
      onChange={v => {
        if (v === CUSTOM_VALUE) onSelect("", trimmed);
        else onSelect(v, options.find(o => o.value === v)?.label ?? "");
        setSearch("");
      }}
      allowClear
      onClear={() => { onClear(); setSearch(""); }}
      style={{ width: "100%" }}
      showSearch
      searchValue={search}
      onSearch={setSearch}
      filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
    />
  );
}

// ── ScopeItemCard ────────────────────────────────────────────────

function ScopeItemCard({
  item, idx, allCategories, topCatId,
  onChange, onRemove,
}: {
  item: ScopeDraft;
  idx: number;
  allCategories: CatOption[];
  topCatId: string;
  onChange: (patch: Partial<ScopeDraft>) => void;
  onRemove: () => void;
}) {
  const subCatOptions = topCatId
    ? allCategories.filter(c => c.parentId === topCatId)
    : [];

  const amt = calcItemAmt(item);

  const updSub = (subId: string, patch: Partial<SubItemDraft>) =>
    onChange({ subItems: item.subItems.map(s => s.id === subId ? { ...s, ...patch } : s) });

  return (
    <div style={{ border: "1px solid #e4e7ee", borderRadius: 8, marginBottom: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        background: "#f5f6f8", padding: "9px 14px",
        display: "flex", alignItems: "center", gap: 8,
        borderBottom: "1px solid #e4e7ee",
      }}>
        <span style={{
          background: "#f37916", color: "#fff", borderRadius: "50%",
          width: 22, height: 22, display: "inline-flex", alignItems: "center",
          justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>{idx + 1}</span>
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1, color: "#1a1f2e" }}>
          {item.description || `Work Item ${idx + 1}`}
        </span>
        {amt > 0 && (
          <span style={{ fontFamily: "monospace", color: "#d4620c", fontWeight: 700, fontSize: 13 }}>
            {fmt(amt)}
          </span>
        )}
        <Button type="link" size="small" danger icon={<DeleteOutlined />}
          onClick={onRemove} style={{ padding: "0 4px" }} />
      </div>

      {/* Body */}
      <div style={{ padding: "14px 14px 10px" }}>
        {/* Row 1: Sub-Category / Description | Unit | Qty | Rate | Amount */}
        <Row gutter={[10, 10]}>
          <Col xs={24} sm={item.subItems.length > 0 ? 12 : 8}>
            {subCatOptions.length > 0 ? (
              <>
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Sub-Category *</div>
                <SubCategorySelect
                  value={item.subCategoryId}
                  options={subCatOptions.map(c => ({ label: c.name, value: c._id }))}
                  onSelect={(id, name) => onChange({ subCategoryId: id, description: name })}
                  onClear={() => onChange({ subCategoryId: "", description: "" })}
                />
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Description *</div>
                <Input
                  placeholder="e.g. Raft Area, Plaster Works, HT Panel…"
                  value={item.description}
                  onChange={e => onChange({ description: e.target.value })}
                />
              </>
            )}
          </Col>

          <Col xs={12} sm={item.subItems.length > 0 ? 6 : 4}>
            <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Unit</div>
            <Select value={item.unit} options={UNIT_OPTIONS} style={{ width: "100%" }} placement="bottomLeft"
              onChange={v => onChange({ unit: v })} showSearch
              filterOption={(inp, opt) =>
                String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())
              }
            />
          </Col>

          {item.subItems.length === 0 && (
            <>
              <Col xs={12} sm={4}>
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Planned Qty</div>
                <InputNumber placeholder="Qty" value={item.plannedQty} style={{ width: "100%" }}
                  min={0} step={0.01} precision={2}
                  onChange={v => onChange({ plannedQty: v })} />
              </Col>
              <Col xs={12} sm={4}>
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Rate (₹)</div>
                <InputNumber placeholder="Rate" value={item.rate} style={{ width: "100%" }}
                  min={0} onChange={v => onChange({ rate: v })} />
              </Col>
              <Col xs={24} sm={4}>
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Amount</div>
                <AmtBox value={amt} />
              </Col>
            </>
          )}
          {item.subItems.length > 0 && (
            <Col xs={24} sm={6}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Total (from sub-items)</div>
              <AmtBox value={amt} />
            </Col>
          )}
        </Row>

        {/* Row 1b: GST + Incl. GST amount */}
        <Row gutter={[10, 0]} style={{ marginTop: 8 }}>
          <Col xs={12} sm={6}>
            <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>GST %</div>
            <GstSelect value={item.gstPercent} onChange={v => onChange({ gstPercent: v })} style={{ width: "100%" }} />
          </Col>
          <Col xs={12} sm={18} style={{ display: "flex", alignItems: "flex-end", paddingBottom: 6 }}>
            <div style={{ fontSize: 12, color: "#5a6278" }}>
              Amount incl. GST: <strong style={{ color: "#d4620c", fontFamily: "monospace" }}>{amt > 0 ? fmt(calcItemInclGst(item)) : "—"}</strong>
            </div>
          </Col>
        </Row>

        {/* Row 2: Notes/Remarks */}
        <Row gutter={[10, 0]} style={{ marginTop: 8 }}>
          <Col span={24}>
            <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Notes / Remarks (optional)</div>
            <Input
              placeholder="e.g. RCC wall, 1st floor, upto 300MM…"
              value={item.remarks}
              onChange={e => onChange({ remarks: e.target.value })}
            />
          </Col>
        </Row>

        {/* Row 3: Dates + Sub-Items toggle */}
        <Row gutter={[10, 10]} style={{ marginTop: 10 }}>
          <Col xs={12} sm={6}>
            <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Start Date</div>
            <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }}
              value={item.plannedStart ? dayjs(item.plannedStart) : null}
              onChange={d => onChange({ plannedStart: d ? d.format("YYYY-MM-DD") : "" })} />
          </Col>
          <Col xs={12} sm={6}>
            <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>End Date</div>
            <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }}
              value={item.plannedEnd ? dayjs(item.plannedEnd) : null}
              onChange={d => onChange({ plannedEnd: d ? d.format("YYYY-MM-DD") : "" })} />
          </Col>
          <Col xs={24} sm={12} style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <Button type="link" size="small"
              icon={item.showSubItems ? <UpOutlined /> : <DownOutlined />}
              onClick={() => onChange({ showSubItems: !item.showSubItems })}
              style={{ color: "#5a6278", padding: 0 }}
            >
              {item.showSubItems ? "Hide" : "Add"} Sub-Items
              {item.subItems.length > 0 && (
                <Tag color="blue" style={{ marginLeft: 4, fontSize: 10 }}>{item.subItems.length}</Tag>
              )}
            </Button>
          </Col>
        </Row>

        {/* Sub-items */}
        {item.showSubItems && (
          <div style={{ marginTop: 12, background: "#f8f9fc", border: "1px solid #dde1ec", borderRadius: 6, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ba3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
              Sub-Items — Detailed Pricing Breakdown
            </div>
            {item.subItems.length === 0 && (
              <div style={{ color: "#9ba3b8", fontSize: 12, marginBottom: 8 }}>No sub-items yet.</div>
            )}
            {item.subItems.map((si, siIdx) => (
              <div key={si.id} style={{
                display: "flex", gap: 8, alignItems: "center", marginBottom: 8,
                background: "#fff", border: "1px solid #e4e7ee", borderRadius: 6,
                padding: "8px 10px", flexWrap: "wrap",
              }}>
                <span style={{ fontSize: 11, color: "#9ba3b8", minWidth: 28, fontWeight: 600 }}>
                  {idx + 1}.{siIdx + 1}
                </span>
                <Input placeholder="Sub-item description" value={si.description}
                  onChange={e => updSub(si.id, { description: e.target.value })}
                  style={{ flex: 2, minWidth: 180 }} />
                <Select value={si.unit} options={UNIT_OPTIONS} style={{ width: 130 }} placement="bottomLeft"
                  onChange={v => updSub(si.id, { unit: v })} showSearch
                  filterOption={(inp, opt) =>
                    String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())
                  }
                />
                <InputNumber placeholder="Qty" value={si.plannedQty} style={{ width: 90 }}
                  min={0} step={0.01} precision={2}
                  onChange={v => updSub(si.id, { plannedQty: v })} />
                <InputNumber placeholder="Rate" value={si.rate} style={{ width: 100 }}
                  min={0} onChange={v => updSub(si.id, { rate: v })} />
                <div style={{ minWidth: 90 }}>
                  <AmtBox value={(si.plannedQty || 0) * (si.rate || 0)} />
                </div>
                <Button type="link" size="small" danger icon={<DeleteOutlined />}
                  onClick={() => onChange({ subItems: item.subItems.filter(s => s.id !== si.id) })} />
              </div>
            ))}
            <Button type="dashed" size="small" icon={<PlusOutlined />}
              onClick={() => onChange({ subItems: [...item.subItems, newSubItem()], showSubItems: true })}
              style={{ borderColor: "#f37916", color: "#f37916" }}
            >
              Add Sub-Item
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function PublicWorkOrderForm() {
  const [form] = Form.useForm();
  const gstPercent = (Form.useWatch("gstPercent", form) as number | undefined) ?? 18;

  const [projects,    setProjects]    = useState<Lookup[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [allCats,     setAllCats]     = useState<CatOption[]>([]);
  const [companies,   setCompanies]   = useState<Lookup[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState<{ workOrderNo: string } | null>(null);
  const [scopeItems,  setScopeItems]  = useState<ScopeDraft[]>([newScope()]);
  const [topCatId,    setTopCatId]    = useState<string>("");
  const [documents,   setDocuments]   = useState<WODocument[]>([]);
  const [milestones,  setMilestones]  = useState<MilestoneDraft[]>([]);
  const [warrantyTerms, setWarrantyTerms] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      pub.get("/projects"),
      pub.get("/contractors"),
      pub.get("/categories"),
      pub.get("/companies"),
    ]).then(([p, c, cat, co]) => {
      setProjects(p.data.projects    || []);
      setContractors(c.data.contractors || []);
      setAllCats(cat.data.categories   || []);
      setCompanies(co.data.companies   || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const topCatOptions = allCats.filter(c => !c.parentId);

  const contractValue = scopeItems.reduce((s, i) => s + calcItemAmt(i), 0);
  const contractValueInclGst = scopeItems.reduce((s, i) => s + calcItemInclGst(i), 0);

  function patchItem(id: string, patch: Partial<ScopeDraft>) {
    setScopeItems(items => items.map(it => it.id === id ? { ...it, ...patch } : it));
  }

  async function onFinish(vals: any) {
    const milestonesTotal = calcGrandTotal(milestones);
    if (milestonesTotal > contractValueInclGst + 1) {
      message.error(`Payment milestones total (${fmt(milestonesTotal)}) exceeds the scope of work's contract value incl. GST (${fmt(contractValueInclGst)})`);
      return;
    }
    setSubmitting(true);
    try {
      const validScope = scopeItems.filter(i => i.description.trim() || i.subCategoryId);
      const payload = {
        projectId:   vals.projectId,
        projectLocation: vals.projectLocation || "",
        vendorCode:  vals.vendorCode,
        issueDate:   (vals.issueDate as dayjs.Dayjs).toISOString(),
        companyId:   vals.companyId  || null,
        category:    topCatOptions.find(c => c._id === topCatId)?.name || vals.category || "",
        scopeOfWork: vals.scopeOfWork || "",
        status:      vals.status     || "draft",
        gstPercent:  vals.gstPercent ?? 18,
        documents:   documents,
        preparedByName:    vals.preparedByName    || "",
        preparedByContact: vals.preparedByContact || "",
        paymentMilestones: milestones.map(m => ({
          stage: m.stage, date: m.date, type: m.type, mode: m.mode,
          amount: m.amount || 0, amountMode: m.amountMode, amountPercent: m.amountPercent,
          gstPercent: m.gstPercent, gstType: m.gstType,
          payable: calcPayable(m),
        })),
        warrantyTerms: warrantyTerms.filter(t => t.trim()),
        scopeItems: validScope.map(i => ({
          description: i.description,
          unit:        i.unit,
          plannedQty:  i.subItems.length > 0 ? 0 : (i.plannedQty || 0),
          rate:        i.subItems.length > 0 ? 0 : (i.rate || 0),
          amount:      calcItemAmt(i),
          gstPercent:  i.gstPercent,
          remarks:     i.remarks,
          plannedStart: i.plannedStart,
          plannedEnd:   i.plannedEnd,
          subItems:    i.subItems.map(si => ({
            description: si.description,
            unit:        si.unit,
            plannedQty:  si.plannedQty || 0,
            rate:        si.rate || 0,
            amount:      (si.plannedQty || 0) * (si.rate || 0),
          })),
        })),
        contractValue,
      };
      const res = await pub.post("/work-orders", payload);
      setSubmitted({ workOrderNo: res.data?.workOrder?.workOrderNo || "—" });
    } catch {
      // axios interceptor shows toast
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    form.resetFields();
    setScopeItems([newScope()]);
    setTopCatId("");
    setDocuments([]);
    setMilestones([]);
    setWarrantyTerms([]);
    setSubmitted(null);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fb" }}>
        <Spin size="large" tip="Loading form…" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f9fb", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Card style={{ maxWidth: 480, width: "100%", textAlign: "center", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <Result
            icon={<CheckCircleOutlined style={{ color: "#16a85a", fontSize: 64 }} />}
            title="Work Order Submitted!"
            subTitle={
              <Space direction="vertical" size={4}>
                <Text>Your request has been submitted successfully.</Text>
                <Text type="secondary">Work Order Number:</Text>
                <Tag color="orange" style={{ fontSize: 18, padding: "4px 16px", borderRadius: 8 }}>
                  {submitted.workOrderNo}
                </Tag>
              </Space>
            }
            extra={
              <Button type="primary" onClick={reset}
                style={{ background: "#f37916", borderColor: "#f37916" }}>
                Submit Another
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fb" }}>
      {/* Top bar */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #eaedf2", padding: "0 24px",
        display: "flex", alignItems: "center", height: 60,
        position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: "#f37916",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 800, fontSize: 18, marginRight: 12,
        }}>N</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2, color: "#1a1f2e" }}>Neoteric Properties</div>
          <div style={{ fontSize: 11, color: "#9ba3b8" }}>Project Cost Center</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <FileTextOutlined style={{ color: "#f37916", fontSize: 18 }} />
          <Text style={{ fontWeight: 600, color: "#1a1f2e" }}>New Work Order</Text>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 16px 64px" }}>
        <div style={{ marginBottom: 28 }}>
          <Title level={3} style={{ margin: 0, color: "#1a1f2e" }}>Work Order Request</Title>
          <Text type="secondary">Fill in the details below to create a new work order.</Text>
        </div>

        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark="optional">

          {/* ── Order Details ── */}
          <Card
            title={<span style={{ fontWeight: 700 }}>Order Details</span>}
            style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 24px" }}>

              <Form.Item label="Work Order Number">
                <Input disabled placeholder="Auto-assign on submit"
                  style={{ background: "#f5f6f8", color: "#9ba3b8" }} />
              </Form.Item>

              <Form.Item name="preparedByName" label="Your Name"
                rules={[{ required: true, message: "Your name is required" }]}>
                <Input placeholder="e.g. Yash Gupta" />
              </Form.Item>

              <Form.Item name="preparedByContact" label="Your Contact"
                rules={[{ required: true, message: "Your contact is required" }]}>
                <Input placeholder="Phone or email" />
              </Form.Item>

              <Form.Item name="companyId" label="Issuing Company">
                <Select placeholder="Select company (optional)" allowClear showSearch placement="bottomLeft"
                  optionFilterProp="label"
                  options={companies.map(c => ({ label: c.name, value: c._id }))} />
              </Form.Item>

              <Form.Item name="projectId" label="Project"
                rules={[{ required: true, message: "Select a project" }]}>
                <Select placeholder="Select project" showSearch optionFilterProp="label" placement="bottomLeft"
                  options={selectableProjects(projects).map(p => ({ label: p.name, value: p._id }))} />
              </Form.Item>

              <Form.Item
                name="projectLocation"
                label="Location"
                tooltip="Exact site location for this work order (e.g. tower, plot no., landmark)"
              >
                <Input placeholder="e.g. Tower A, Ground Floor" />
              </Form.Item>

              <Form.Item name="issueDate" label="Issue Date"
                rules={[{ required: true, message: "Select issue date" }]}>
                <DatePicker style={{ width: "100%" }} format="DD MMM YYYY" />
              </Form.Item>

              <Form.Item name="vendorCode" label="Vendor Code"
                rules={[{ required: true, message: "Select a vendor" }]}>
                <Select placeholder="Select vendor" showSearch placement="bottomLeft"
                  optionFilterProp="label"
                  options={contractors.map(c => ({
                    label: `${c.vendorCode} — ${c.companyName}`,
                    value: c.vendorCode,
                  }))} />
              </Form.Item>

              <Form.Item name="category" label="Category">
                <Select placeholder="Select category (optional)" allowClear showSearch placement="bottomLeft"
                  optionFilterProp="label"
                  options={topCatOptions.map(c => ({ label: c.name, value: c._id }))}
                  onChange={v => setTopCatId(v || "")}
                />
              </Form.Item>

              <Form.Item name="status" label="Status" initialValue="draft">
                <Select options={STATUS_OPTIONS} placement="bottomLeft" />
              </Form.Item>

              <Form.Item name="gstPercent" label="GST Slab" initialValue={18}>
                <GstSelect />
              </Form.Item>

            </div>

            <Form.Item
              name="scopeOfWork"
              label="Overall Description / Scope of Work"
              tooltip="Describe the full scope of this work order"
            >
              <Input.TextArea
                rows={3}
                placeholder="e.g. Supply and installation of false ceiling including framework, boarding and finishing as per approved drawings..."
              />
            </Form.Item>

            <Form.Item label="Upload Work Order Documents">
              <DocumentsUpload value={documents} onChange={setDocuments} />
            </Form.Item>
          </Card>

          {/* ── Scope of Work ── */}
          <Card
            style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
            bodyStyle={{ paddingTop: 0 }}
          >
            {/* Section header matching internal system */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 0 12px", marginBottom: 4,
              borderBottom: "1px solid #f0f0f0",
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1f2e" }}>Scope of Work</div>
              <Button type="dashed" icon={<PlusOutlined />} size="small"
                onClick={() => setScopeItems(s => [...s, newScope(gstPercent)])}
                style={{ borderColor: "#f37916", color: "#f37916" }}
              >
                Add Work Item
              </Button>
            </div>

            <div style={{ paddingTop: 14 }}>
              {scopeItems.length === 0 && (
                <div style={{
                  border: "2px dashed #e4e7ee", borderRadius: 8, padding: "32px 20px",
                  textAlign: "center", color: "#9ba3b8", marginBottom: 12,
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📐</div>
                  <div style={{ fontWeight: 600, color: "#5a6278" }}>No work items yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Click "Add Work Item" to define the scope.</div>
                </div>
              )}

              {scopeItems.map((item, idx) => (
                <ScopeItemCard
                  key={item.id}
                  item={item}
                  idx={idx}
                  allCategories={allCats}
                  topCatId={topCatId}
                  onChange={patch => patchItem(item.id, patch)}
                  onRemove={() => setScopeItems(s => s.filter(x => x.id !== item.id))}
                />
              ))}

              {contractValue > 0 && (
                <>
                  <Divider style={{ margin: "8px 0 12px" }} />
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
                    <Text type="secondary">Contract Value ({scopeItems.length} item{scopeItems.length !== 1 ? "s" : ""}) — Excl. GST:</Text>
                    <Text style={{ fontWeight: 600, fontSize: 14 }}>{fmt(contractValue)}</Text>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 6 }}>
                    <Text type="secondary">GST (per work item, see above):</Text>
                    <Text style={{ fontSize: 13 }}>{fmt(contractValueInclGst - contractValue)}</Text>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 6 }}>
                    <Text strong>Total Contract Value — Incl. GST:</Text>
                    <Text style={{ fontWeight: 700, fontSize: 18, color: "#f37916" }}>
                      {fmt(contractValueInclGst)}
                    </Text>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* ── Payment Milestones ── */}
          <Card style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <PaymentMilestonesBuilder items={milestones} onChange={setMilestones} contractValueInclGst={contractValueInclGst} />
          </Card>

          {/* ── Warranty / Guarantee Terms ── */}
          <Card style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <WarrantyTermsBuilder items={warrantyTerms} onChange={setWarrantyTerms} />
          </Card>

          {/* ── Submit ── */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <Button onClick={reset} style={{ flex: "1 1 auto" }}>Reset</Button>
            <Button type="primary" htmlType="submit" loading={submitting}
              style={{ background: "#f37916", borderColor: "#f37916", minWidth: 160, height: 42, fontWeight: 600, flex: "2 1 auto" }}>
              Save Work Order
            </Button>
          </div>

        </Form>
      </div>
    </div>
  );
}
