import { useEffect, useState } from "react";
import {
  Button, Col, Drawer, Form, Input, Row, Select, Space, Spin, Table, Tag, Upload, message,
} from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import PageShell from "../../components/PageShell";
import ConsultantDetailView from "../../components/ConsultantDetailView";
import apiClient from "../../services/apiClient";
import type { Consultant, ConsultancyType } from "../../types/VendorBilling";

const normalizeId = (obj: any) => ({ ...obj, id: obj._id || obj.id });

const CONSULTANCY_TYPES: ConsultancyType[] = [
  "Architect", "Interior Designer", "Structural Consultant", "MEP Consultant",
  "Landscape Consultant", "Facade Consultant", "Quantity Surveyor",
  "Project Management Consultant", "BIM Consultant", "Environmental Consultant",
  "Lighting Consultant", "Other",
];

const DESIGN_SOFTWARE_OPTIONS = [
  "AutoCAD", "Revit", "SketchUp", "3ds Max", "Lumion", "V-Ray", "ArchiCAD",
  "STAAD Pro", "ETABS", "Primavera P6", "MS Project", "BIM 360",
];

const TYPE_COLOR: Record<ConsultancyType, string> = {
  Architect: "purple",
  "Interior Designer": "magenta",
  "Structural Consultant": "blue",
  "MEP Consultant": "cyan",
  "Landscape Consultant": "green",
  "Facade Consultant": "geekblue",
  "Quantity Surveyor": "gold",
  "Project Management Consultant": "volcano",
  "BIM Consultant": "blue",
  "Environmental Consultant": "green",
  "Lighting Consultant": "orange",
  Other: "default",
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12, fontWeight: 700, color: "#6B7280", textTransform: "uppercase",
        letterSpacing: "0.06em", borderBottom: "1px solid #E5E7EB",
        paddingBottom: 8, marginBottom: 16, marginTop: 24,
      }}
    >
      {children}
    </div>
  );
}

export default function Consultants() {
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editingConsultant, setEditingConsultant] = useState<Consultant | null>(null);
  const [viewOpen, setViewOpen]     = useState(false);
  const [selected, setSelected]     = useState<Consultant | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    apiClient
      .get<{ consultants: Consultant[] }>("/consultants")
      .then((r) => setConsultants(r.data.consultants.map(normalizeId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = consultants.filter(
    (c) =>
      c.consultantCode.toLowerCase().includes(search.toLowerCase()) ||
      c.firmName.toLowerCase().includes(search.toLowerCase()) ||
      c.principalName.toLowerCase().includes(search.toLowerCase()) ||
      c.mobile.includes(search)
  );

  const handleRegister = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editingConsultant) {
        const res = await apiClient.put<{ consultant: Consultant }>(`/consultants/${editingConsultant.id}`, values);
        const updated = normalizeId(res.data.consultant);
        setConsultants((prev) => prev.map((c) => (c.id === editingConsultant.id ? updated : c)));
        message.success(`${res.data.consultant.firmName} updated`);
      } else {
        const res = await apiClient.post<{ consultant: Consultant }>("/consultants", values);
        setConsultants((prev) => [normalizeId(res.data.consultant), ...prev]);
        message.success(`${res.data.consultant.firmName} registered as ${res.data.consultant.consultantCode}`);
      }
      form.resetFields();
      setEditingConsultant(null);
      setRegisterOpen(false);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "errorFields" in err) return;
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (record: Consultant) => {
    form.setFieldsValue(record);
    setEditingConsultant(record);
    setRegisterOpen(true);
  };

  const columns = [
    {
      title: "Consultant Code",
      dataIndex: "consultantCode",
      width: 130,
      render: (v: string) => (
        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00" }}>{v}</span>
      ),
    },
    { title: "Firm / Consultant", dataIndex: "firmName", width: 200 },
    { title: "Principal", dataIndex: "principalName", width: 160 },
    {
      title: "Type",
      dataIndex: "consultancyType",
      width: 180,
      render: (v: ConsultancyType) => <Tag color={TYPE_COLOR[v] ?? "default"}>{v}</Tag>,
    },
    { title: "Mobile", dataIndex: "mobile", width: 130 },
    {
      title: "Status",
      dataIndex: "status",
      width: 90,
      render: (v: string) => <Tag color={v === "active" ? "green" : "default"}>{(v || "").toUpperCase()}</Tag>,
    },
    {
      title: "Actions",
      width: 170,
      render: (_: unknown, record: Consultant) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setSelected(record);
              setViewOpen(true);
              apiClient.get<{ consultant: Consultant }>(`/consultants/${record.id}`).then(res => {
                const full = normalizeId(res.data.consultant);
                setSelected(full);
                setConsultants(prev => prev.map(c => c.id === record.id ? full : c));
              }).catch(() => {});
            }}
          >
            View Profile
          </Button>
          <Button type="link" size="small" onClick={() => openEdit(record)}>
            Edit
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <PageShell
      title="Consultants"
      description="Manage registered architects, designers, and professional-services firms."
      cta={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={() => { form.resetFields(); setEditingConsultant(null); setRegisterOpen(true); }}
          style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
        >
          Register Consultant
        </Button>
      }
    >
      <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
        <Input.Search
          placeholder="Search by consultant code, firm, principal, or mobile…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ maxWidth: 420 }}
        />
      </div>

      <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
        <Spin spinning={loading}>
          <Table
            rowKey="id"
            dataSource={filtered}
            columns={columns}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{
              emptyText: loading ? " " : (
                <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📐</div>
                  <div style={{ fontWeight: 600, color: "#374151" }}>No consultants yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Click "Register Consultant" to add your first firm.</div>
                </div>
              ),
            }}
          />
        </Spin>
      </div>

      {/* ── Register Consultant Drawer ─────────────────────────── */}
      <Drawer
        open={registerOpen}
        onClose={() => { setRegisterOpen(false); setEditingConsultant(null); }}
        placement="right"
        width={640}
        title={
          <Space>
            <span style={{ fontSize: 20 }}>📐</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{editingConsultant ? "Edit Consultant" : "Register Consultant"}</div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                {editingConsultant ? `Editing ${editingConsultant.consultantCode}` : "Fill in firm, professional, and bank details"}
              </div>
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => { setRegisterOpen(false); setEditingConsultant(null); }}>Cancel</Button>
            <Button
              size="large" type="primary" loading={saving} onClick={handleRegister}
              style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
            >
              {editingConsultant ? "Save Changes" : "Register Consultant"}
            </Button>
          </div>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <SectionHeading>Firm Details</SectionHeading>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Firm / Consultant Name" name="firmName" rules={[{ required: true }]}>
                <Input placeholder="e.g. Iksana Design" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Principal Name" name="principalName" rules={[{ required: true }]}>
                <Input placeholder="e.g. Vishal Dubey" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Consultancy Type" name="consultancyType" rules={[{ required: true }]}>
            <Select
              placeholder="Select type"
              options={CONSULTANCY_TYPES.map((t) => ({ label: t, value: t }))}
              placement="bottomLeft" getPopupContainer={(trigger) => trigger.parentElement || document.body}
            />
          </Form.Item>
          <Form.Item label="Address" name="address" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Full address…" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Mobile" name="mobile" rules={[{ required: true }]}>
                <Input placeholder="10-digit mobile" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Alternate Mobile" name="alternateMobile" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Email" name="email" rules={[{ required: true }]}>
            <Input type="email" placeholder="firm@email.com" />
          </Form.Item>

          <SectionHeading>Professional Details</SectionHeading>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Professional Registration No." name="professionalRegistration" tooltip="e.g. Council of Architecture (COA) registration number" rules={[{ required: true }]}>
                <Input placeholder="e.g. CA/2015/12345" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="License No." name="licenseNo" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Experience" name="experience" rules={[{ required: true }]}>
                <Input placeholder="e.g. 12 years" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Portfolio URL" name="portfolioUrl" rules={[{ required: true }]}>
                <Input placeholder="https://…" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Design Software" name="designSoftware" rules={[{ required: true, message: "Select at least one" }]}>
            <Select
              mode="tags"
              placeholder="Select or type software used"
              options={DESIGN_SOFTWARE_OPTIONS.map((s) => ({ label: s, value: s }))}
              placement="bottomLeft" getPopupContainer={(trigger) => trigger.parentElement || document.body}
            />
          </Form.Item>

          <SectionHeading>Bank Details</SectionHeading>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Account Holder Name" name="accountHolderName" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Bank Name" name="bankName" rules={[{ required: true }]}>
                <Input placeholder="e.g. HDFC Bank" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="Account Number" name="accountNumber" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="IFSC Code" name="ifscCode" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Branch" name="branchName" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <SectionHeading>Tax Details</SectionHeading>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="PAN Number" name="panNumber" rules={[{ required: true }]}>
                <Input placeholder="10-char PAN" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Aadhaar Number" name="aadhaarNumber" rules={[{ required: true }]}>
                <Input placeholder="12-digit Aadhaar" maxLength={12} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="GST Number" name="gstNumber" tooltip="Optional — many individual consultants aren't GST-registered">
            <Input placeholder="15-char GST (optional)" />
          </Form.Item>

          <SectionHeading>Documents</SectionHeading>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {["GST Certificate", "PAN Card", "Cancelled Cheque", "Business Card", "Professional Registration Certificate"].map(
              (doc) => (
                <Upload key={doc} beforeUpload={() => false} maxCount={1}>
                  <Button icon={<UploadOutlined />} style={{ width: 260 }}>{doc}</Button>
                </Upload>
              )
            )}
          </div>
        </Form>
      </Drawer>

      {/* ── View Profile Drawer ────────────────────────────────── */}
      <Drawer
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        placement="right"
        width={600}
        title={
          selected && (
            <Space>
              <span style={{ fontSize: 20 }}>📐</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.firmName}</div>
                <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>{selected.consultantCode}</div>
              </div>
            </Space>
          )
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button size="large" onClick={() => setViewOpen(false)}>Close</Button>
          </div>
        }
      >
        {selected && <ConsultantDetailView consultant={selected} />}
      </Drawer>
    </PageShell>
  );
}
