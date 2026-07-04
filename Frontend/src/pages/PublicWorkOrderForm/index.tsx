import { useEffect, useState } from "react";
import {
  Form, Select, DatePicker, Input, InputNumber, Button,
  Divider, Card, Typography, Space, Spin, Result, Tag,
} from "antd";
import {
  CheckCircleOutlined,
  FileTextOutlined,
  PlusOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { TextArea } = Input;

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");
const pub  = axios.create({ baseURL: BASE.replace(/\/api$/, "/api/public") });

const GST_OPTIONS = [
  { label: "0%",              value: 0  },
  { label: "5%",              value: 5  },
  { label: "12%",             value: 12 },
  { label: "18% (Standard)",  value: 18 },
  { label: "28%",             value: 28 },
];

const STATUS_OPTIONS = [
  { label: "Draft",       value: "draft" },
  { label: "Issued",      value: "issued" },
  { label: "In Progress", value: "in-progress" },
];

const UNIT_OPTIONS = [
  { label: "Sq.Ft",       value: "sq.ft"      },
  { label: "Sq.M",        value: "sq.m"       },
  { label: "Cu.M",        value: "cu.m"       },
  { label: "Cu.Ft",       value: "cu.ft"      },
  { label: "RMT",         value: "rmt"        },
  { label: "Kg",          value: "kg"         },
  { label: "MT",          value: "mt"         },
  { label: "Nos",         value: "nos"        },
  { label: "Daily Wage",  value: "daily-wage" },
  { label: "Per Hour",    value: "per-hr"     },
  { label: "Per Trip",    value: "per-trip"   },
  { label: "Lump Sum",    value: "lump-sum"   },
];

interface ScopeDraft {
  id: string;
  description: string;
  unit: string;
  plannedQty: number | null;
  rate: number | null;
}

interface Lookup { _id?: string; id?: string; name: string; }
interface Contractor { vendorCode: string; companyName: string; ownerName: string; }

function newScope(): ScopeDraft {
  return { id: crypto.randomUUID(), description: "", unit: "sq.ft", plannedQty: null, rate: null };
}

export default function PublicWorkOrderForm() {
  const [form] = Form.useForm();

  const [projects,     setProjects]     = useState<Lookup[]>([]);
  const [contractors,  setContractors]  = useState<Contractor[]>([]);
  const [categories,   setCategories]   = useState<Lookup[]>([]);
  const [companies,    setCompanies]    = useState<Lookup[]>([]);
  const [driUsers,     setDriUsers]     = useState<(Lookup & { email: string })[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState<{ workOrderNo: string } | null>(null);
  const [scopeItems,   setScopeItems]   = useState<ScopeDraft[]>([newScope()]);

  useEffect(() => {
    Promise.all([
      pub.get("/projects"),
      pub.get("/contractors"),
      pub.get("/categories"),
      pub.get("/companies"),
      pub.get("/dri-users"),
    ]).then(([p, c, cat, co, dri]) => {
      const unwrap = (r: any) => r.data?.data ?? r.data;
      setProjects(unwrap(p).projects    || []);
      setContractors(unwrap(c).contractors || []);
      setCategories(unwrap(cat).categories || []);
      setCompanies(unwrap(co).companies  || []);
      setDriUsers(unwrap(dri).users      || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const addScope   = () => setScopeItems(s => [...s, newScope()]);
  const dropScope  = (id: string) => setScopeItems(s => s.filter(x => x.id !== id));
  const patchScope = (id: string, field: keyof ScopeDraft, val: any) =>
    setScopeItems(s => s.map(x => x.id === id ? { ...x, [field]: val } : x));

  const contractValue = scopeItems.reduce((s, i) => s + (i.plannedQty || 0) * (i.rate || 0), 0);

  async function onFinish(vals: any) {
    setSubmitting(true);
    try {
      const payload = {
        projectId:   vals.projectId,
        vendorCode:  vals.vendorCode,
        issueDate:   (vals.issueDate as dayjs.Dayjs).toISOString(),
        companyId:   vals.companyId   || null,
        category:    vals.category    || "",
        scopeOfWork: vals.scopeOfWork || "",
        status:      vals.status      || "draft",
        gstPercent:  vals.gstPercent  ?? 18,
        assignedDRI: vals.assignedDRI || [],
        scopeItems:  scopeItems
          .filter(i => i.description.trim())
          .map(i => ({
            description: i.description,
            unit:        i.unit,
            plannedQty:  i.plannedQty || 0,
            rate:        i.rate || 0,
            amount:      (i.plannedQty || 0) * (i.rate || 0),
          })),
        contractValue,
      };
      const res = await pub.post("/work-orders", payload);
      const wo  = (res.data?.data ?? res.data)?.workOrder;
      setSubmitted({ workOrderNo: wo?.workOrderNo || "—" });
    } catch {
      // error toast handled by axios default
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    form.resetFields();
    setScopeItems([newScope()]);
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
              <Button type="primary" onClick={reset} style={{ background: "#f37916", borderColor: "#f37916" }}>
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
        background: "#fff",
        borderBottom: "1px solid #eaedf2",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        height: 60,
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
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

      {/* Form */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 16px 64px" }}>
        <div style={{ marginBottom: 28 }}>
          <Title level={3} style={{ margin: 0, color: "#1a1f2e" }}>Work Order Request</Title>
          <Text type="secondary">Fill in the details below to create a new work order.</Text>
        </div>

        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark="optional">

          {/* ── Section 1: Order Details ── */}
          <Card
            title={<span style={{ fontWeight: 700 }}>Order Details</span>}
            style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>

              <Form.Item label="Work Order Number">
                <Input disabled placeholder="Auto-assign on submit" style={{ background: "#f5f6f8", color: "#9ba3b8" }} />
              </Form.Item>

              <Form.Item name="companyId" label="Issuing Company">
                <Select placeholder="Select company (optional)" allowClear showSearch
                  optionFilterProp="label"
                  options={companies.map(c => ({ label: c.name, value: c._id || (c as any).id }))}
                />
              </Form.Item>

              <Form.Item name="projectId" label="Project" rules={[{ required: true, message: "Select a project" }]}>
                <Select placeholder="Select project" showSearch optionFilterProp="label"
                  options={projects.map(p => ({ label: p.name, value: p._id || (p as any).id }))}
                />
              </Form.Item>

              <Form.Item name="issueDate" label="Issue Date" rules={[{ required: true, message: "Select issue date" }]}>
                <DatePicker style={{ width: "100%" }} format="DD MMM YYYY" />
              </Form.Item>

              <Form.Item name="vendorCode" label="Vendor Code" rules={[{ required: true, message: "Select a vendor" }]}>
                <Select placeholder="Select vendor" showSearch
                  optionFilterProp="label"
                  options={contractors.map(c => ({
                    label: `${c.vendorCode} — ${c.companyName}`,
                    value: c.vendorCode,
                  }))}
                />
              </Form.Item>

              <Form.Item name="category" label="Category">
                <Select placeholder="Select category (optional)" allowClear showSearch optionFilterProp="label"
                  options={categories.map(c => ({ label: c.name, value: c.name }))}
                />
              </Form.Item>

              <Form.Item name="status" label="Status" initialValue="draft">
                <Select options={STATUS_OPTIONS} />
              </Form.Item>

              <Form.Item name="gstPercent" label="GST Slab" initialValue={18}>
                <Select options={GST_OPTIONS} />
              </Form.Item>

              <Form.Item name="assignedDRI" label="Assign DRI (Site Engineer)" style={{ gridColumn: "1 / -1" }}>
                <Select mode="multiple" placeholder="Select DRI(s) to assign (optional)" allowClear showSearch
                  optionFilterProp="label"
                  options={driUsers.map(u => ({ label: `${u.name} (${u.email})`, value: u._id || (u as any).id }))}
                />
              </Form.Item>

              <Form.Item name="scopeOfWork" label="Scope of Work" style={{ gridColumn: "1 / -1" }}>
                <TextArea rows={3} placeholder="Brief description of work scope..." />
              </Form.Item>

            </div>
          </Card>

          {/* ── Section 2: Scope Items ── */}
          <Card
            title={<span style={{ fontWeight: 700 }}>Scope Items</span>}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>Define work line items (optional)</Text>}
            style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
          >
            {scopeItems.map((item, idx) => (
              <div key={item.id} style={{
                background: "#f8f9fb", borderRadius: 10, padding: "14px 16px",
                marginBottom: 12, border: "1px solid #eaedf2",
              }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 8 }}>
                  <Tag style={{ background: "#f37916", color: "#fff", border: "none", borderRadius: 6 }}>
                    #{idx + 1}
                  </Tag>
                  {scopeItems.length > 1 && (
                    <Button size="small" danger type="text" icon={<DeleteOutlined />}
                      onClick={() => dropScope(item.id)}
                      style={{ marginLeft: "auto" }}
                    />
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "0 16px" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#5a6278", marginBottom: 4 }}>Description *</div>
                    <Input
                      value={item.description}
                      onChange={e => patchScope(item.id, "description", e.target.value)}
                      placeholder="Work item description"
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#5a6278", marginBottom: 4 }}>Unit</div>
                    <Select style={{ width: "100%" }} value={item.unit}
                      onChange={v => patchScope(item.id, "unit", v)}
                      options={UNIT_OPTIONS}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#5a6278", marginBottom: 4 }}>Planned Qty</div>
                    <InputNumber style={{ width: "100%" }} min={0} step={0.01} precision={2}
                      value={item.plannedQty}
                      onChange={v => patchScope(item.id, "plannedQty", v)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#5a6278", marginBottom: 4 }}>Rate (₹)</div>
                    <InputNumber style={{ width: "100%" }} min={0}
                      value={item.rate}
                      onChange={v => patchScope(item.id, "rate", v)}
                      placeholder="0"
                    />
                  </div>
                </div>
                {(item.plannedQty || 0) > 0 && (item.rate || 0) > 0 && (
                  <div style={{ marginTop: 8, textAlign: "right", color: "#16a85a", fontWeight: 600, fontSize: 13 }}>
                    ₹{((item.plannedQty || 0) * (item.rate || 0)).toLocaleString("en-IN")}
                  </div>
                )}
              </div>
            ))}

            <Button type="dashed" icon={<PlusOutlined />} onClick={addScope} style={{ width: "100%", marginTop: 4 }}>
              Add Scope Item
            </Button>

            {contractValue > 0 && (
              <>
                <Divider style={{ margin: "16px 0 8px" }} />
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
                  <Text type="secondary">Estimated Contract Value:</Text>
                  <Text style={{ fontWeight: 700, fontSize: 18, color: "#f37916" }}>
                    ₹{contractValue.toLocaleString("en-IN")}
                  </Text>
                </div>
              </>
            )}
          </Card>

          {/* ── Submit ── */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <Button onClick={() => { form.resetFields(); setScopeItems([newScope()]); }}>
              Reset
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={submitting}
              style={{ background: "#f37916", borderColor: "#f37916", minWidth: 160, height: 42, fontWeight: 600 }}
            >
              Submit Work Order
            </Button>
          </div>

        </Form>
      </div>
    </div>
  );
}
