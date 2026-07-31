import { useEffect, useState } from "react";
import { Form, Select, DatePicker, Button, Card, Table, Tag, Modal, Descriptions, message, Empty } from "antd";
import { PlusOutlined, EyeOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import DailyProjectReportSections from "../../components/DailyProjectReportSections";
import { isAlert } from "../../shared/constants/dprOptions";
import type { DprFormValues } from "../../shared/constants/dprOptions";

interface ProjectOption { _id: string; name: string; }

interface DprRow extends DprFormValues {
  _id: string;
  createdAt: string;
}

const ALERT_FIELDS: { key: keyof DprFormValues; label: string }[] = [
  { key: "workDelayed",       label: "Delay" },
  { key: "labourShort",       label: "Labour" },
  { key: "materialShort",     label: "Material" },
  { key: "drawingPending",    label: "Drawing" },
  { key: "challengeBlocking", label: "Challenge" },
  { key: "escalationRequired",label: "Escalation" },
];

export default function DailyProjectReport() {
  const { user } = useAuth();
  const [form] = Form.useForm();

  const [projects, setProjects]   = useState<ProjectOption[]>([]);
  const [reports, setReports]     = useState<DprRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [viewReport, setViewReport] = useState<DprRow | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get("/projects"),
      apiClient.get("/daily-reports"),
    ]).then(([p, r]) => {
      setProjects(p.data.projects || []);
      setReports(r.data.reports || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function onFinish(vals: Omit<DprFormValues, "driName"> & { date: dayjs.Dayjs }) {
    setSubmitting(true);
    try {
      await apiClient.post("/daily-reports", {
        ...vals,
        driName: user?.name,
        date: vals.date.toISOString(),
      });
      message.success("Daily Project Report submitted");
      form.resetFields();
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  const columns: ColumnsType<DprRow> = [
    { title: "Date", dataIndex: "date", width: 110, render: v => dayjs(v).format("DD MMM YYYY") },
    { title: "Project", dataIndex: "projectName", ellipsis: true },
    {
      title: "Alerts",
      render: (_, r) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {ALERT_FIELDS.filter(f => isAlert(r[f.key] as string)).map(f => (
            <Tag key={f.key} color={f.key === "escalationRequired" ? "red" : "orange"}>{f.label}</Tag>
          ))}
          {ALERT_FIELDS.every(f => !isAlert(r[f.key] as string)) && <Tag color="green">All clear</Tag>}
        </div>
      ),
    },
    {
      title: "", width: 70, render: (_, r) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => setViewReport(r)} />
      ),
    },
  ];

  return (
    <PageShell
      title="Daily Project Report"
      description="Log your end-of-day site report — work progress, labour/material/drawing alerts, and anything that needs escalation."
      cta={<Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)} style={{ background: "#4f46e5", borderColor: "#4f46e5" }}>New Report</Button>}
    >
      <Card title="My Recent Reports" style={{ borderRadius: 12 }}>
        <Table
          rowKey="_id"
          loading={loading}
          dataSource={reports}
          columns={columns}
          size="middle"
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty description="No reports submitted yet" /> }}
        />
      </Card>

      <Modal
        open={showForm}
        onCancel={() => setShowForm(false)}
        title="New Daily Project Report"
        width={760}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ date: dayjs() }}>
          <Card style={{ borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <Form.Item label="Project" name="projectId" rules={[{ required: true, message: "Select a project" }]}>
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
          </Card>

          <DailyProjectReportSections />

          <Button type="primary" htmlType="submit" block loading={submitting} size="large" style={{ background: "#4f46e5", borderColor: "#4f46e5", height: 46, fontWeight: 600 }}>
            Submit Report
          </Button>
        </Form>
      </Modal>

      <Modal open={!!viewReport} onCancel={() => setViewReport(null)} title={`DPR — ${viewReport?.projectName ?? ""}`} footer={null} width={640}>
        {viewReport && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Date">{dayjs(viewReport.date).format("DD MMM YYYY")}</Descriptions.Item>
            <Descriptions.Item label="DRI">{viewReport.driName}</Descriptions.Item>
            <Descriptions.Item label="Tomorrow's Plan">{viewReport.tomorrowsPlan}</Descriptions.Item>
            <Descriptions.Item label="Work Delayed">{viewReport.workDelayed}</Descriptions.Item>
            <Descriptions.Item label="Labour Short">{viewReport.labourShort}</Descriptions.Item>
            {viewReport.additionalLabourNeeded && <Descriptions.Item label="Additional Labour Needed">{viewReport.additionalLabourNeeded}</Descriptions.Item>}
            {viewReport.labourShortageImpact && <Descriptions.Item label="Labour Impact">{viewReport.labourShortageImpact}</Descriptions.Item>}
            <Descriptions.Item label="Material Short">{viewReport.materialShort}</Descriptions.Item>
            {viewReport.materialRunOutDays && <Descriptions.Item label="Material Runs Out In">{viewReport.materialRunOutDays}</Descriptions.Item>}
            <Descriptions.Item label="Material Received On Time">{viewReport.materialReceivedOnTime}</Descriptions.Item>
            {viewReport.materialShortageImpact && <Descriptions.Item label="Material Impact">{viewReport.materialShortageImpact}</Descriptions.Item>}
            <Descriptions.Item label="Drawing Pending">{viewReport.drawingPending}</Descriptions.Item>
            {viewReport.drawingReference && <Descriptions.Item label="Drawing Reference">{viewReport.drawingReference}</Descriptions.Item>}
            {viewReport.drawingPendingDays && <Descriptions.Item label="Pending Since">{viewReport.drawingPendingDays}</Descriptions.Item>}
            {viewReport.drawingBlockedActivity && <Descriptions.Item label="Blocked Activity">{viewReport.drawingBlockedActivity}</Descriptions.Item>}
            <Descriptions.Item label="Challenge">{viewReport.challengeBlocking}</Descriptions.Item>
            {viewReport.challengeDescription && <Descriptions.Item label="Challenge Details">{viewReport.challengeDescription}</Descriptions.Item>}
            <Descriptions.Item label="Escalation Required">{viewReport.escalationRequired}</Descriptions.Item>
            {viewReport.escalationAction && <Descriptions.Item label="Escalation Action">{viewReport.escalationAction}</Descriptions.Item>}
          </Descriptions>
        )}
      </Modal>
    </PageShell>
  );
}
