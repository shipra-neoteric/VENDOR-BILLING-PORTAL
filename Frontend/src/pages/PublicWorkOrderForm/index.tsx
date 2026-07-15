import { useEffect, useState } from "react";
import {
  Form, Select, DatePicker, Input, InputNumber, Button,
  Divider, Card, Typography, Space, Spin, Result, Tag, Row, Col, Upload, message,
} from "antd";
import type { UploadProps } from "antd";
import {
  CheckCircleOutlined,
  FileTextOutlined,
  PlusOutlined,
  DeleteOutlined,
  DownOutlined,
  UpOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
import { selectableProjects } from "../../utils/projectOptions";

const { Title, Text } = Typography;

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");
const pub  = axios.create({ baseURL: BASE.replace(/\/api$/, "/api/public") });
// Unwrap { success, data } envelope from backend
pub.interceptors.response.use(r => {
  if (r.data && "success" in r.data && "data" in r.data) r.data = r.data.data;
  return r;
});

const GST_OPTIONS = [
  { label: "0%",             value: 0  },
  { label: "5%",             value: 5  },
  { label: "12%",            value: 12 },
  { label: "18% (Standard)", value: 18 },
  { label: "28%",            value: 28 },
];

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
interface Lookup     { _id: string; name: string; parentId?: string | null; }

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
  remarks: string;
  plannedStart: string;
  plannedEnd: string;
  showSubItems: boolean;
  subItems: SubItemDraft[];
}

// ── Helpers ──────────────────────────────────────────────────────

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

const MAX_FILE_MB = 5;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function calcItemAmt(item: ScopeDraft) {
  if (item.subItems.length > 0)
    return item.subItems.reduce((s, si) => s + (si.plannedQty || 0) * (si.rate || 0), 0);
  return (item.plannedQty || 0) * (item.rate || 0);
}

function newScope(): ScopeDraft {
  return {
    id: crypto.randomUUID(), subCategoryId: "", description: "",
    unit: "sq.ft", plannedQty: null, rate: null,
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
                <Select
                  placeholder="Select sub-category"
                  value={item.subCategoryId || undefined}
                  options={subCatOptions.map(c => ({ label: c.name, value: c._id }))}
                  onChange={v => {
                    const cat = allCategories.find(c => c._id === v);
                    onChange({ subCategoryId: v, description: cat?.name ?? "" });
                  }}
                  allowClear
                  onClear={() => onChange({ subCategoryId: "", description: "" })}
                  style={{ width: "100%" }}
                  showSearch
                  filterOption={(inp, opt) =>
                    String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())
                  }
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
            <Select value={item.unit} options={UNIT_OPTIONS} style={{ width: "100%" }}
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
                <Select value={si.unit} options={UNIT_OPTIONS} style={{ width: 130 }}
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

  const [projects,    setProjects]    = useState<Lookup[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [allCats,     setAllCats]     = useState<CatOption[]>([]);
  const [companies,   setCompanies]   = useState<Lookup[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState<{ workOrderNo: string } | null>(null);
  const [scopeItems,  setScopeItems]  = useState<ScopeDraft[]>([newScope()]);
  const [topCatId,    setTopCatId]    = useState<string>("");
  const [documentFile, setDocumentFile] = useState<{ fileName: string; dataUrl: string } | null>(null);

  const handleDocSelect: NonNullable<UploadProps["beforeUpload"]> = async (file) => {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      message.error(`${file.name} is larger than ${MAX_FILE_MB}MB`);
      return false;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setDocumentFile({ fileName: file.name, dataUrl });
    } catch {
      message.error(`Couldn't read ${file.name}`);
    }
    return false;
  };

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

  function patchItem(id: string, patch: Partial<ScopeDraft>) {
    setScopeItems(items => items.map(it => it.id === id ? { ...it, ...patch } : it));
  }

  async function onFinish(vals: any) {
    setSubmitting(true);
    try {
      const validScope = scopeItems.filter(i => i.description.trim() || i.subCategoryId);
      const payload = {
        projectId:   vals.projectId,
        vendorCode:  vals.vendorCode,
        issueDate:   (vals.issueDate as dayjs.Dayjs).toISOString(),
        companyId:   vals.companyId  || null,
        category:    topCatOptions.find(c => c._id === topCatId)?.name || vals.category || "",
        scopeOfWork: vals.scopeOfWork || "",
        status:      vals.status     || "draft",
        gstPercent:  vals.gstPercent ?? 18,
        documentUrl:  documentFile?.dataUrl  || "",
        documentName: documentFile?.fileName || "",
        scopeItems: validScope.map(i => ({
          description: i.description,
          unit:        i.unit,
          plannedQty:  i.subItems.length > 0 ? 0 : (i.plannedQty || 0),
          rate:        i.subItems.length > 0 ? 0 : (i.rate || 0),
          amount:      calcItemAmt(i),
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
    setDocumentFile(null);
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

              <Form.Item name="companyId" label="Issuing Company">
                <Select placeholder="Select company (optional)" allowClear showSearch
                  optionFilterProp="label"
                  options={companies.map(c => ({ label: c.name, value: c._id }))} />
              </Form.Item>

              <Form.Item name="projectId" label="Project"
                rules={[{ required: true, message: "Select a project" }]}>
                <Select placeholder="Select project" showSearch optionFilterProp="label"
                  options={selectableProjects(projects).map(p => ({ label: p.name, value: p._id }))} />
              </Form.Item>

              <Form.Item name="issueDate" label="Issue Date"
                rules={[{ required: true, message: "Select issue date" }]}>
                <DatePicker style={{ width: "100%" }} format="DD MMM YYYY" />
              </Form.Item>

              <Form.Item name="vendorCode" label="Vendor Code"
                rules={[{ required: true, message: "Select a vendor" }]}>
                <Select placeholder="Select vendor" showSearch
                  optionFilterProp="label"
                  options={contractors.map(c => ({
                    label: `${c.vendorCode} — ${c.companyName}`,
                    value: c.vendorCode,
                  }))} />
              </Form.Item>

              <Form.Item name="category" label="Category">
                <Select placeholder="Select category (optional)" allowClear showSearch
                  optionFilterProp="label"
                  options={topCatOptions.map(c => ({ label: c.name, value: c._id }))}
                  onChange={v => setTopCatId(v || "")}
                />
              </Form.Item>

              <Form.Item name="status" label="Status" initialValue="draft">
                <Select options={STATUS_OPTIONS} />
              </Form.Item>

              <Form.Item name="gstPercent" label="GST Slab" initialValue={18}>
                <Select options={GST_OPTIONS} />
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

            <Form.Item label="Upload Work Order Document">
              <Upload beforeUpload={handleDocSelect} maxCount={1} showUploadList={false} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png">
                <Button icon={<UploadOutlined />}>{documentFile?.fileName || "Upload PDF / Doc / Image"}</Button>
              </Upload>
              {documentFile && (
                <div style={{ fontSize: 11, color: "#16a85a", marginTop: 4 }}>✓ Attached</div>
              )}
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
                onClick={() => setScopeItems(s => [...s, newScope()])}
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
                    <Text type="secondary">Total Contract Value ({scopeItems.length} item{scopeItems.length !== 1 ? "s" : ""}):</Text>
                    <Text style={{ fontWeight: 700, fontSize: 18, color: "#f37916" }}>
                      {fmt(contractValue)}
                    </Text>
                  </div>
                </>
              )}
            </div>
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
