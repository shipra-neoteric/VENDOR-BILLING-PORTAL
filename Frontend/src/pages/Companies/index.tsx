import { useEffect, useState, useCallback } from "react";
import {
  Button, Drawer, Form, Input, Select, Spin, Alert, Popconfirm, message, Tag, Space, Row, Col,
} from "antd";
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, BankOutlined, SearchOutlined,
} from "@ant-design/icons";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";

// ── Types ──────────────────────────────────────────────────────
interface Company {
  _id: string;
  name: string;
  shortCode: string;
  type: string;
  cin?: string;
  gstNumber?: string;
  panNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  color: string;
  isActive: boolean;
  createdAt?: string;
}

const COMPANY_TYPES = [
  "Private Limited",
  "LLP",
  "Proprietorship",
  "Partnership",
  "Company",
  "Other",
];

const TYPE_COLORS: Record<string, string> = {
  "Private Limited": "#2563eb",
  "LLP":             "#7c3aed",
  "Proprietorship":  "#16a85a",
  "Partnership":     "#0d9488",
  "Company":         "#f37916",
  "Other":           "#6B7280",
};

const PALETTE = [
  "#2563eb","#7c3aed","#16a85a","#f37916","#0d9488","#e03b3b",
  "#0ea5e9","#d97706","#6366f1","#ec4899","#14b8a6","#84cc16",
  "#f43f5e","#8b5cf6","#22c55e","#64748b",
];

function lighten(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c * 0.12 + 255 * 0.88);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

export default function Companies() {
  const { user } = useAuth();
  const isOwner  = user?.role === "owner";

  const [companies, setCompanies]     = useState<Company[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [search, setSearch]           = useState("");
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [editing, setEditing]         = useState<Company | null>(null);
  const [saving, setSaving]           = useState(false);
  const [form]                        = Form.useForm();
  const [pickedColor, setPickedColor] = useState(PALETTE[0]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiClient.get("/companies");
      setCompanies(res.data.companies ?? []);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to load companies");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.shortCode.toLowerCase().includes(search.toLowerCase()) ||
    (c.city ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.contactPerson ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function openAdd() {
    setEditing(null);
    setPickedColor(PALETTE[0]);
    form.resetFields();
    form.setFieldsValue({ isActive: true, type: "Private Limited", color: PALETTE[0] });
    setDrawerOpen(true);
  }

  function openEdit(co: Company) {
    setEditing(co);
    setPickedColor(co.color);
    form.setFieldsValue({
      name: co.name, shortCode: co.shortCode, type: co.type,
      cin: co.cin, gstNumber: co.gstNumber, panNumber: co.panNumber,
      address: co.address, city: co.city, state: co.state,
      email: co.email, phone: co.phone, contactPerson: co.contactPerson,
      color: co.color, isActive: co.isActive,
    });
    setDrawerOpen(true);
  }

  async function handleSave() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = { ...values, color: pickedColor };
      if (editing) {
        const res = await apiClient.put(`/companies/${editing._id}`, payload);
        setCompanies(prev => prev.map(c => c._id === editing._id ? res.data.company : c));
        message.success("Company updated");
      } else {
        const res = await apiClient.post("/companies", payload);
        setCompanies(prev => [res.data.company, ...prev]);
        message.success("Company added");
      }
      setDrawerOpen(false);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Save failed";
      message.error(msg);
    } finally { setSaving(false); }
  }

  async function handleDelete(co: Company) {
    try {
      await apiClient.delete(`/companies/${co._id}`);
      setCompanies(prev => prev.filter(c => c._id !== co._id));
      message.success(`"${co.name}" deleted`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Delete failed";
      message.error(msg);
    }
  }

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
      <Spin size="large" tip="Loading companies…" />
    </div>
  );

  if (error) return <Alert type="error" message={error} style={{ margin: 24 }} />;

  return (
    <PageShell
      title="Companies"
      description="All entities under the Neoteric Group umbrella. Each project can be tagged to a company for billing and reporting."
      cta={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} />
          <Button
            type="primary" icon={<PlusOutlined />}
            onClick={openAdd}
            style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
          >
            Add Company
          </Button>
        </Space>
      }
    >
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total Companies",  value: companies.length,                                          color: "#FF7A00" },
          { label: "Active",           value: companies.filter(c => c.isActive).length,                  color: "#16a85a" },
          { label: "Private Limited",  value: companies.filter(c => c.type === "Private Limited").length, color: "#2563eb" },
          { label: "LLP / Other",      value: companies.filter(c => c.type !== "Private Limited").length, color: "#7c3aed" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 20px", minWidth: 150, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <Input
          prefix={<SearchOutlined style={{ color: "#9CA3AF" }} />}
          placeholder="Search by name, code, city, or contact…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 380 }}
          allowClear
        />
      </div>

      {/* Company cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#9CA3AF" }}>
          <BankOutlined style={{ fontSize: 40, marginBottom: 12, display: "block" }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>
            {search ? "No companies match your search" : "No companies yet"}
          </div>
          {!search && (
            <div style={{ fontSize: 13, marginTop: 4 }}>Click "Add Company" to get started.</div>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {filtered.map(co => (
            <div
              key={co._id}
              style={{
                background: "#fff",
                border: "1px solid #E5E7EB",
                borderLeft: `4px solid ${co.color}`,
                borderRadius: 12,
                padding: "18px 18px 14px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                opacity: co.isActive ? 1 : 0.6,
                transition: "box-shadow 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.09)")}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)")}
            >
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Short code badge */}
                  <span style={{
                    display: "inline-block",
                    background: lighten(co.color), color: co.color,
                    fontFamily: "monospace", fontWeight: 700, fontSize: 11,
                    padding: "2px 8px", borderRadius: 5, marginBottom: 6,
                  }}>
                    {co.shortCode}
                  </span>
                  {!co.isActive && <Tag style={{ marginLeft: 6, fontSize: 10 }}>Inactive</Tag>}

                  {/* Company name */}
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", lineHeight: 1.4 }}>
                    {co.name}
                  </div>

                  {/* Type badge */}
                  <div style={{ marginTop: 5 }}>
                    <Tag
                      color={TYPE_COLORS[co.type] ?? "#6B7280"}
                      style={{ fontSize: 11, borderRadius: 4 }}
                    >
                      {co.type}
                    </Tag>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(co)} style={{ color: "#6B7280" }} />
                  {isOwner && (
                    <Popconfirm
                      title={`Delete "${co.name}"?`}
                      description="This cannot be undone."
                      okText="Yes, Delete" okType="danger" cancelText="Cancel"
                      onConfirm={() => handleDelete(co)}
                    >
                      <Button size="small" icon={<DeleteOutlined />} danger />
                    </Popconfirm>
                  )}
                </div>
              </div>

              {/* Details */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#6B7280" }}>
                {co.contactPerson && (
                  <div><span style={{ color: "#9CA3AF" }}>Contact: </span><span style={{ color: "#374151", fontWeight: 500 }}>{co.contactPerson}</span></div>
                )}
                {(co.city || co.state) && (
                  <div><span style={{ color: "#9CA3AF" }}>Location: </span><span style={{ color: "#374151" }}>{[co.city, co.state].filter(Boolean).join(", ")}</span></div>
                )}
                {co.phone && (
                  <div><span style={{ color: "#9CA3AF" }}>Phone: </span><span style={{ color: "#374151" }}>{co.phone}</span></div>
                )}
                {co.email && (
                  <div><span style={{ color: "#9CA3AF" }}>Email: </span><span style={{ color: "#374151" }}>{co.email}</span></div>
                )}
                {co.gstNumber && (
                  <div style={{ marginTop: 2 }}>
                    <span style={{ fontFamily: "monospace", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 4, padding: "1px 6px", fontSize: 11 }}>
                      GST: {co.gstNumber}
                    </span>
                  </div>
                )}
                {co.panNumber && (
                  <div>
                    <span style={{ fontFamily: "monospace", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 4, padding: "1px 6px", fontSize: 11 }}>
                      PAN: {co.panNumber}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Drawer ──────────────────────────────────── */}
      <Drawer
        open={drawerOpen}
        title={editing ? `Edit — ${editing.name}` : "Add New Company"}
        onClose={() => setDrawerOpen(false)}
        width={480}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button
              type="primary" onClick={handleSave} loading={saving}
              style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
            >
              {editing ? "Save Changes" : "Add Company"}
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name" label="Company Name"
            rules={[{ required: true, message: "Company name is required" }]}
          >
            <Input placeholder="e.g. Gravity Infrastructure Pvt Ltd" maxLength={120} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="shortCode" label="Short Code"
                tooltip="A short abbreviation used in reports and badges (e.g. GLR, NPL)"
                rules={[{ required: true, message: "Short code is required" }, { max: 8, message: "Max 8 characters" }]}
              >
                <Input placeholder="e.g. GLR" maxLength={8} style={{ textTransform: "uppercase", fontFamily: "monospace" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type" label="Company Type" rules={[{ required: true }]}>
                <Select
                  options={COMPANY_TYPES.map(t => ({ label: t, value: t }))}
                  getPopupContainer={trigger => trigger.parentElement || document.body}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contactPerson" label="Contact Person">
                <Input placeholder="Primary point of contact" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="Phone">
                <Input placeholder="10-digit mobile" maxLength={15} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="email" label="Email">
            <Input placeholder="company@example.com" type="email" />
          </Form.Item>

          <Form.Item name="address" label="Address">
            <Input.TextArea placeholder="Registered office address" rows={2} maxLength={300} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="city" label="City">
                <Input placeholder="Gwalior" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="state" label="State">
                <Input placeholder="Madhya Pradesh" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="gstNumber" label="GST Number">
                <Input placeholder="23ABCDE1234F1Z5" maxLength={15} style={{ fontFamily: "monospace" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="panNumber" label="PAN Number">
                <Input placeholder="ABCDE1234F" maxLength={10} style={{ fontFamily: "monospace" }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="cin" label="CIN / LLPIN" tooltip="Company Identification Number or LLP Identification Number">
            <Input placeholder="U74999MP2020PTC123456" maxLength={21} style={{ fontFamily: "monospace" }} />
          </Form.Item>

          {/* Colour */}
          <Form.Item label="Brand Colour">
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <input
                type="color" value={pickedColor}
                onChange={e => { setPickedColor(e.target.value); form.setFieldValue("color", e.target.value); }}
                style={{ width: 40, height: 36, border: "1px solid #E5E7EB", borderRadius: 6, padding: 2, cursor: "pointer", background: "none" }}
              />
              <span style={{ fontFamily: "monospace", fontSize: 13, color: "#374151" }}>{pickedColor}</span>
              <span style={{ background: lighten(pickedColor), color: pickedColor, fontWeight: 700, fontSize: 11, padding: "3px 10px", borderRadius: 5 }}>
                {form.getFieldValue("shortCode") || "CODE"}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PALETTE.map(c => (
                <button
                  key={c} type="button"
                  onClick={() => { setPickedColor(c); form.setFieldValue("color", c); }}
                  style={{
                    width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", padding: 0,
                    border: pickedColor === c ? "3px solid #111" : "2px solid #fff",
                    boxShadow: "0 0 0 1px #E5E7EB",
                  }}
                  title={c}
                />
              ))}
            </div>
            <Form.Item name="color" hidden><Input /></Form.Item>
          </Form.Item>

          {/* Status */}
          <Form.Item name="isActive" label="Status">
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { label: "Active",   value: true,  color: "#16a85a" },
                { label: "Inactive", value: false, color: "#9CA3AF" },
              ].map(opt => (
                <button
                  key={String(opt.value)} type="button"
                  onClick={() => form.setFieldValue("isActive", opt.value)}
                  style={{
                    padding: "6px 18px", borderRadius: 7, border: "1px solid", cursor: "pointer",
                    fontWeight: 600, fontSize: 12,
                    borderColor: form.getFieldValue("isActive") === opt.value ? opt.color : "#E5E7EB",
                    background:  form.getFieldValue("isActive") === opt.value ? `${opt.color}18` : "#fff",
                    color:       form.getFieldValue("isActive") === opt.value ? opt.color : "#6B7280",
                  }}
                >{opt.label}</button>
              ))}
            </div>
          </Form.Item>
        </Form>
      </Drawer>
    </PageShell>
  );
}
