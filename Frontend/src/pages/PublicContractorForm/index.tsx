import { useState } from "react";
import {
  Form, Input, InputNumber, Select, Button, Card, Typography, Space, Result, Tag,
} from "antd";
import { CheckCircleOutlined, TeamOutlined } from "@ant-design/icons";
import axios from "axios";

const { Title, Text } = Typography;

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");
const pub  = axios.create({ baseURL: BASE.replace(/\/api$/, "/api/public") });
// Unwrap { success, data } envelope from backend
pub.interceptors.response.use(r => {
  if (r.data && "success" in r.data && "data" in r.data) r.data = r.data.data;
  return r;
});

const WORK_OPTIONS = [
  "General Contractors", "Excavation", "Concrete", "Framing", "Steel",
  "Window & Door", "Electrical", "Plumbing", "HVAC", "Fire Alarm & Sprinkler",
  "Roofing", "Insulation", "Drywall", "Taping", "Plaster", "Flooring",
  "Finish Carpentry", "Painting", "Masonry", "Landscaping",
];

export default function PublicContractorForm() {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState<{ vendorCode: string; companyName: string } | null>(null);

  async function onFinish(values: Record<string, unknown>) {
    setSubmitting(true);
    try {
      const res = await pub.post("/contractors", values);
      setSubmitted({
        vendorCode:  res.data?.contractor?.vendorCode ?? "—",
        companyName: res.data?.contractor?.companyName ?? "",
      });
    } catch {
      // axios interceptor shows toast
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    form.resetFields();
    setSubmitted(null);
  }

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f9fb", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Card style={{ maxWidth: 480, width: "100%", textAlign: "center", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <Result
            icon={<CheckCircleOutlined style={{ color: "#16a85a", fontSize: 64 }} />}
            title="Contractor Registered!"
            subTitle={
              <Space direction="vertical" size={4}>
                <Text>{submitted.companyName} has been registered successfully.</Text>
                <Text type="secondary">Vendor Code:</Text>
                <Tag color="orange" style={{ fontSize: 18, padding: "4px 16px", borderRadius: 8 }}>
                  {submitted.vendorCode}
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
          <TeamOutlined style={{ color: "#f37916", fontSize: 18 }} />
          <Text style={{ fontWeight: 600, color: "#1a1f2e" }}>New Contractor</Text>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px 64px" }}>
        <div style={{ marginBottom: 28 }}>
          <Title level={3} style={{ margin: 0, color: "#1a1f2e" }}>Contractor Registration</Title>
          <Text type="secondary">Fill in your firm, bank, and tax details to get registered as a vendor.</Text>
        </div>

        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark="optional">
          <Card
            title={<span style={{ fontWeight: 700 }}>Firm Details</span>}
            style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
              <Form.Item name="companyName" label="Company / Firm Name" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="e.g. ABC Infra Pvt Ltd" />
              </Form.Item>
              <Form.Item
                name="shortCode"
                label="Short Form (optional)"
                tooltip="If this firm is billed under multiple vendor codes for tax reasons, use the same short form on each so they're recognizable as one group."
              >
                <Input placeholder="e.g. D" maxLength={10} />
              </Form.Item>
              <Form.Item name="ownerName" label="Owner Name" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="e.g. Rajesh Sharma" />
              </Form.Item>
              <Form.Item name="mobile" label="Mobile" rules={[{ required: true, message: "Required" }]}>
                <Input placeholder="10-digit mobile number" maxLength={10} />
              </Form.Item>
              <Form.Item name="alternateMobile" label="Alternate Mobile">
                <Input placeholder="Optional" maxLength={10} />
              </Form.Item>
              <Form.Item name="email" label="Email">
                <Input placeholder="Optional" />
              </Form.Item>
            </div>
            <Form.Item name="address" label="Address" rules={[{ required: true, message: "Required" }]}>
              <Input.TextArea rows={2} placeholder="Full address…" />
            </Form.Item>
          </Card>

          <Card
            title={<span style={{ fontWeight: 700 }}>Bank Details</span>}
            style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
              <Form.Item name="accountHolderName" label="Account Holder Name">
                <Input placeholder="As per bank records" />
              </Form.Item>
              <Form.Item name="bankName" label="Bank Name">
                <Input placeholder="e.g. SBI" />
              </Form.Item>
              <Form.Item name="accountNumber" label="Account Number">
                <Input placeholder="Bank account number" />
              </Form.Item>
              <Form.Item name="ifscCode" label="IFSC Code">
                <Input placeholder="e.g. SBIN0001234" />
              </Form.Item>
              <Form.Item name="branchName" label="Branch">
                <Input placeholder="Branch name" />
              </Form.Item>
            </div>
          </Card>

          <Card
            title={<span style={{ fontWeight: 700 }}>Tax & Work Details</span>}
            style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
              <Form.Item name="gstNumber" label="GST Number">
                <Input placeholder="15-char GST" />
              </Form.Item>
              <Form.Item name="panNumber" label="PAN Number">
                <Input placeholder="10-char PAN" />
              </Form.Item>
              <Form.Item name="reference1" label="Reference Company 1">
                <Input placeholder="Optional" />
              </Form.Item>
              <Form.Item name="reference2" label="Reference Company 2">
                <Input placeholder="Optional" />
              </Form.Item>
              <Form.Item name="averageTurnover" label="Average Turnover (Lakhs)">
                <InputNumber style={{ width: "100%" }} min={0} placeholder="e.g. 50" />
              </Form.Item>
            </div>
            <Form.Item name="workTypes" label="Work Types">
              <Select
                mode="multiple"
                placeholder="Select all that apply"
                options={WORK_OPTIONS.map(w => ({ label: w, value: w }))}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Card>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <Button onClick={() => form.resetFields()}>Reset</Button>
            <Button type="primary" htmlType="submit" loading={submitting}
              style={{ background: "#f37916", borderColor: "#f37916", minWidth: 160, height: 42, fontWeight: 600 }}>
              Register Contractor
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
