import { useEffect, useState } from "react";
import { Form, Select, DatePicker, InputNumber, Button, Card, Typography, Space, Spin, Result } from "antd";
import { CheckCircleOutlined, TeamOutlined } from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
import { WORK_TYPE_OPTIONS, SHIFT_TYPE_OPTIONS } from "../../shared/constants/labourReportOptions";
import type { LabourReportFormValues } from "../../shared/constants/labourReportOptions";

const { Title, Text } = Typography;

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");
const pub = axios.create({ baseURL: BASE.replace(/\/api$/, "/api/public") });
pub.interceptors.response.use(r => {
  if (r.data && "success" in r.data && "data" in r.data) r.data = r.data.data;
  return r;
});

interface Lookup { _id: string; name: string; }
interface ContractorLookup { vendorCode: string; companyName: string; }

export default function PublicLabourReportForm() {
  const [form] = Form.useForm();
  const [projects, setProjects]       = useState<Lookup[]>([]);
  const [contractors, setContractors] = useState<ContractorLookup[]>([]);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);

  useEffect(() => {
    Promise.all([pub.get("/projects"), pub.get("/contractors")])
      .then(([p, c]) => {
        setProjects(p.data.projects || []);
        setContractors(c.data.contractors || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function onFinish(vals: LabourReportFormValues & { date: dayjs.Dayjs }) {
    setSubmitting(true);
    try {
      await pub.post("/daily-labour-reports", { ...vals, date: vals.date.toISOString() });
      setSubmitted(true);
    } catch {
      // axios interceptor shows the error toast
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    form.resetFields();
    setSubmitted(false);
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
            title="Labour Report Submitted!"
            subTitle={<Text>Thanks — today's labour count has been recorded.</Text>}
            extra={
              <Button type="primary" onClick={reset} style={{ background: "#0d9488", borderColor: "#0d9488" }}>
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
      <div style={{
        background: "#fff", borderBottom: "1px solid #eaedf2", padding: "0 24px",
        display: "flex", alignItems: "center", height: 60,
        position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: "#0d9488",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 800, fontSize: 18, marginRight: 12,
        }}>N</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2, color: "#1a1f2e" }}>Neoteric Properties</div>
          <div style={{ fontSize: 11, color: "#9ba3b8" }}>Daily Contractor / Labour Report</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <TeamOutlined style={{ color: "#0d9488", fontSize: 18 }} />
          <Text style={{ fontWeight: 600, color: "#1a1f2e" }}>Labour Report</Text>
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 16px 64px" }}>
        <div style={{ marginBottom: 28 }}>
          <Title level={3} style={{ margin: 0, color: "#1a1f2e" }}>Daily Contractor / Labour Report — All Sites</Title>
          <Text type="secondary">Log today's on-site labour count per contractor and work type.</Text>
        </div>

        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark="optional" initialValues={{ date: dayjs() }}>
          <Card style={{ borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Form.Item label="Contractor Name" name="vendorCode" rules={[{ required: true, message: "Select a contractor" }]} style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Choose"
                  showSearch
                  filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
                  options={contractors.map(c => ({ label: c.companyName, value: c.vendorCode }))}
                />
              </Form.Item>
              <Form.Item label="Location" name="projectId" rules={[{ required: true, message: "Select a location" }]} style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Choose"
                  showSearch
                  filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
                  options={projects.map(p => ({ label: p.name, value: p._id }))}
                />
              </Form.Item>
              <Form.Item label="Date" name="date" rules={[{ required: true, message: "Select a date" }]} style={{ marginBottom: 0 }}>
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" disabledDate={d => d.isAfter(dayjs(), "day")} />
              </Form.Item>
              <Form.Item label="कार्य प्रकार (Work Type)" name="workType" rules={[{ required: true, message: "Select a work type" }]} style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Choose"
                  showSearch
                  filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
                  options={WORK_TYPE_OPTIONS.map(w => ({ label: w, value: w }))}
                />
              </Form.Item>
              <Form.Item label="Shift Type" name="shiftType" rules={[{ required: true, message: "Select a shift" }]} style={{ marginBottom: 0 }}>
                <Select placeholder="Choose" options={SHIFT_TYPE_OPTIONS.map(s => ({ label: s, value: s }))} />
              </Form.Item>
              <Form.Item label="श्रमिक संख्या (Number of Labourers)" name="labourCount" rules={[{ required: true, message: "Enter number of labourers" }]} style={{ marginBottom: 0 }}>
                <InputNumber style={{ width: "100%" }} min={0} placeholder="e.g. 12" />
              </Form.Item>
            </Space>
          </Card>

          <Button
            type="primary" htmlType="submit" size="large" block
            loading={submitting}
            style={{ background: "#0d9488", borderColor: "#0d9488", height: 48, fontWeight: 600, marginTop: 20 }}
          >
            Submit Report
          </Button>
        </Form>
      </div>
    </div>
  );
}
