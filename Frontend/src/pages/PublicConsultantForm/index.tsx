import { useState } from "react";
import {
  Form, Input, Select, Button, Card, Typography, Space, Result, Tag, Upload, message,
} from "antd";
import type { UploadProps } from "antd";
import { CheckCircleOutlined, ReadOutlined, UploadOutlined } from "@ant-design/icons";
import axios from "axios";

const { Title, Text } = Typography;

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");
const pub  = axios.create({ baseURL: BASE.replace(/\/api$/, "/api/public") });
pub.interceptors.response.use(r => {
  if (r.data && "success" in r.data && "data" in r.data) r.data = r.data.data;
  return r;
});

const CONSULTANCY_TYPES = [
  "Architect", "Interior Designer", "Structural Consultant", "MEP Consultant",
  "Landscape Consultant", "Facade Consultant", "Quantity Surveyor",
  "Project Management Consultant", "BIM Consultant", "Environmental Consultant",
  "Lighting Consultant", "Other",
];

const DESIGN_SOFTWARE_OPTIONS = [
  "AutoCAD", "Revit", "SketchUp", "3ds Max", "Lumion", "V-Ray", "ArchiCAD",
  "STAAD Pro", "ETABS", "Primavera P6", "MS Project", "BIM 360",
];

const DOCUMENT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "gstCertificate",  label: "GST Certificate" },
  { key: "panCard",         label: "PAN Card", required: true },
  { key: "cancelledCheque", label: "Cancelled Cheque", required: true },
  { key: "businessCard",    label: "Business Card" },
  { key: "professionalRegistrationCert", label: "Professional Registration Certificate" },
];

const MAX_FILE_MB = 5;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PublicConsultantForm() {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState<{ consultantCode: string; firmName: string } | null>(null);
  const [documents, setDocuments]   = useState<Record<string, { fileName: string; dataUrl: string } | undefined>>({});

  const handleDocSelect: (key: string) => UploadProps["beforeUpload"] = (key) => async (file) => {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      message.error(`${file.name} is larger than ${MAX_FILE_MB}MB`);
      return false;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setDocuments(prev => ({ ...prev, [key]: { fileName: file.name, dataUrl } }));
    } catch {
      message.error(`Couldn't read ${file.name}`);
    }
    return false;
  };

  async function onFinish(values: Record<string, unknown>) {
    const missingDocs = DOCUMENT_FIELDS.filter(f => f.required && !documents[f.key]);
    if (missingDocs.length) {
      message.error(`Please attach: ${missingDocs.map(f => f.label).join(", ")}`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await pub.post("/consultants", { ...values, documents });
      setSubmitted({
        consultantCode: res.data?.consultant?.consultantCode ?? "—",
        firmName:       res.data?.consultant?.firmName ?? "",
      });
    } catch {
      // axios interceptor shows toast
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    form.resetFields();
    setDocuments({});
    setSubmitted(null);
  }

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f9fb", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Card style={{ maxWidth: 480, width: "100%", textAlign: "center", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <Result
            icon={<CheckCircleOutlined style={{ color: "#16a85a", fontSize: 64 }} />}
            title="Consultant Registered!"
            subTitle={
              <Space direction="vertical" size={4}>
                <Text>{submitted.firmName} has been registered successfully.</Text>
                <Text type="secondary">Consultant Code:</Text>
                <Tag color="purple" style={{ fontSize: 18, padding: "4px 16px", borderRadius: 8 }}>
                  {submitted.consultantCode}
                </Tag>
              </Space>
            }
            extra={
              <Button type="primary" onClick={reset}
                style={{ background: "#f37916", borderColor: "#f37916" }}>
                Register Another
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fb" }}>
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
          <ReadOutlined style={{ color: "#f37916", fontSize: 18 }} />
          <Text style={{ fontWeight: 600, color: "#1a1f2e" }}>New Consultant</Text>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px 64px" }}>
        <div style={{ marginBottom: 28 }}>
          <Title level={3} style={{ margin: 0, color: "#1a1f2e" }}>Consultant Registration</Title>
          <Text type="secondary">Fill in your firm, professional, and bank details to get registered.</Text>
        </div>

        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark="optional">
          <Card
            title={<span style={{ fontWeight: 700 }}>Firm Details</span>}
            style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 24px" }}>
              <Form.Item name="firmName" label="Firm / Consultant Name" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="e.g. Iksana Design" />
              </Form.Item>
              <Form.Item name="principalName" label="Principal Name" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="e.g. Vishal Dubey" />
              </Form.Item>
              <Form.Item name="consultancyType" label="Consultancy Type" rules={[{ required: true, message: "Required" }]}>
                <Select placeholder="Select type" options={CONSULTANCY_TYPES.map(t => ({ label: t, value: t }))} />
              </Form.Item>
              <Form.Item name="mobile" label="Mobile" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="10-digit mobile number" maxLength={10} />
              </Form.Item>
              <Form.Item name="alternateMobile" label="Alternate Mobile" rules={[{ required: true, message: "Required" }]}>
                <Input maxLength={10} />
              </Form.Item>
              <Form.Item name="email" label="Email" rules={[{ required: true, message: "Required" }]}>
                <Input />
              </Form.Item>
            </div>
            <Form.Item name="address" label="Address" rules={[{ required: true, message: "Required" }]}>
              <Input.TextArea rows={2} placeholder="Full address…" />
            </Form.Item>
          </Card>

          <Card
            title={<span style={{ fontWeight: 700 }}>Professional Details</span>}
            style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 24px" }}>
              <Form.Item name="professionalRegistration" label="Professional Registration No." tooltip="e.g. Council of Architecture (COA) registration number" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="e.g. CA/2015/12345" />
              </Form.Item>
              <Form.Item name="licenseNo" label="License No." rules={[{ required: true, message: "Required" }]}>
                <Input />
              </Form.Item>
              <Form.Item name="experience" label="Experience" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="e.g. 12 years" />
              </Form.Item>
              <Form.Item name="portfolioUrl" label="Portfolio URL" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="https://…" />
              </Form.Item>
            </div>
            <Form.Item name="designSoftware" label="Design Software" rules={[{ required: true, message: "Select at least one" }]}>
              <Select mode="tags" placeholder="Select or type software used" options={DESIGN_SOFTWARE_OPTIONS.map(s => ({ label: s, value: s }))} />
            </Form.Item>
          </Card>

          <Card
            title={<span style={{ fontWeight: 700 }}>Bank & Tax Details</span>}
            style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 24px" }}>
              <Form.Item name="accountHolderName" label="Account Holder Name" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="As per bank records" />
              </Form.Item>
              <Form.Item name="bankName" label="Bank Name" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="e.g. SBI" />
              </Form.Item>
              <Form.Item name="accountNumber" label="Account Number" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="Bank account number" />
              </Form.Item>
              <Form.Item name="ifscCode" label="IFSC Code" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="e.g. SBIN0001234" />
              </Form.Item>
              <Form.Item name="branchName" label="Branch" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="Branch name" />
              </Form.Item>
              <Form.Item name="panNumber" label="PAN Number" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="10-char PAN" />
              </Form.Item>
              <Form.Item name="aadhaarNumber" label="Aadhaar Number" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="12-digit Aadhaar" maxLength={12} />
              </Form.Item>
              <Form.Item name="gstNumber" label="GST Number" tooltip="Optional — many individual consultants aren't GST-registered">
                <Input placeholder="15-char GST (optional)" />
              </Form.Item>
            </div>
          </Card>

          <Card
            title={<span style={{ fontWeight: 700 }}>Documents</span>}
            style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px 24px" }}>
              {DOCUMENT_FIELDS.map(({ key, label, required }) => (
                <div key={key}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: "#1a1f2e" }}>
                    {required && <span style={{ color: "#ff4d4f", marginRight: 4 }}>*</span>}
                    {label}
                  </div>
                  <Upload
                    beforeUpload={handleDocSelect(key)}
                    maxCount={1}
                    showUploadList={false}
                    accept=".pdf,.jpg,.jpeg,.png"
                  >
                    <Button icon={<UploadOutlined />} style={{ width: "100%", textAlign: "left" }}>
                      {documents[key]?.fileName || label}
                    </Button>
                  </Upload>
                  {documents[key] && (
                    <div style={{ fontSize: 11, color: "#16a85a", marginTop: 4 }}>✓ Attached</div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <Button onClick={() => { form.resetFields(); setDocuments({}); }} style={{ flex: "1 1 auto" }}>Reset</Button>
            <Button type="primary" htmlType="submit" loading={submitting}
              style={{ background: "#f37916", borderColor: "#f37916", minWidth: 160, height: 42, fontWeight: 600, flex: "2 1 auto" }}>
              Register Consultant
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
