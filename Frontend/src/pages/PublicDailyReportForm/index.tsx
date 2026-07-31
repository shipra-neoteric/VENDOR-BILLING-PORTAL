import { useEffect, useState } from "react";
import { Form, Select, DatePicker, Button, Card, Typography, Space, Spin, Result } from "antd";
import { CheckCircleOutlined, FileTextOutlined } from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
import DailyProjectReportSections from "../../components/DailyProjectReportSections";
import type { DprFormValues } from "../../shared/constants/dprOptions";

const { Title, Text } = Typography;

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");
const pub = axios.create({ baseURL: BASE.replace(/\/api$/, "/api/public") });
pub.interceptors.response.use(r => {
  if (r.data && "success" in r.data && "data" in r.data) r.data = r.data.data;
  return r;
});

interface Lookup { _id: string; name: string; }

export default function PublicDailyReportForm() {
  const [form] = Form.useForm();
  const [projects, setProjects] = useState<Lookup[]>([]);
  const [driUsers, setDriUsers] = useState<Lookup[]>([]);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);

  useEffect(() => {
    Promise.all([pub.get("/projects"), pub.get("/dri-users")])
      .then(([p, u]) => {
        setProjects(p.data.projects || []);
        setDriUsers(u.data.users || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function onFinish(vals: DprFormValues & { date: dayjs.Dayjs }) {
    setSubmitting(true);
    try {
      await pub.post("/daily-reports", {
        ...vals,
        date: vals.date.toISOString(),
      });
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
            title="Daily Project Report Submitted!"
            subTitle={<Text>Thanks — your report for today has been recorded.</Text>}
            extra={
              <Button type="primary" onClick={reset} style={{ background: "#4f46e5", borderColor: "#4f46e5" }}>
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
          width: 36, height: 36, borderRadius: 10, background: "#4f46e5",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 800, fontSize: 18, marginRight: 12,
        }}>N</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2, color: "#1a1f2e" }}>Neoteric Properties</div>
          <div style={{ fontSize: 11, color: "#9ba3b8" }}>Daily Project Report</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <FileTextOutlined style={{ color: "#4f46e5", fontSize: 18 }} />
          <Text style={{ fontWeight: 600, color: "#1a1f2e" }}>Daily Project Report</Text>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 16px 64px" }}>
        <div style={{ marginBottom: 28 }}>
          <Title level={3} style={{ margin: 0, color: "#1a1f2e" }}>Daily Project Report</Title>
          <Text type="secondary">Fill this in at the end of each site day — takes about 2 minutes.</Text>
        </div>

        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark="optional" initialValues={{ date: dayjs() }}>
          <Card style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Form.Item label="Project Name" name="projectId" rules={[{ required: true, message: "Select a project" }]} style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Choose"
                  showSearch
                  filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
                  options={projects.map(p => ({ label: p.name, value: p._id }))}
                />
              </Form.Item>
              <Form.Item label="DRI Name" name="driName" rules={[{ required: true, message: "Select your name" }]} style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Choose"
                  showSearch
                  filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
                  options={driUsers.map(d => ({ label: d.name, value: d.name }))}
                />
              </Form.Item>
              <Form.Item label="Date" name="date" rules={[{ required: true, message: "Select a date" }]} style={{ marginBottom: 0 }}>
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" disabledDate={d => d.isAfter(dayjs(), "day")} />
              </Form.Item>
            </Space>
          </Card>

          <DailyProjectReportSections />

          <Button
            type="primary" htmlType="submit" size="large" block
            loading={submitting}
            style={{ background: "#4f46e5", borderColor: "#4f46e5", height: 48, fontWeight: 600 }}
          >
            Submit Report
          </Button>
        </Form>
      </div>
    </div>
  );
}
