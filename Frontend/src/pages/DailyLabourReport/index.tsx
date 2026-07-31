import { useEffect, useState } from "react";
import { Form, Select, DatePicker, InputNumber, Button, Card, Table, Modal, message, Empty } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import { WORK_TYPE_OPTIONS, SHIFT_TYPE_OPTIONS } from "../../shared/constants/labourReportOptions";
import type { LabourReportFormValues } from "../../shared/constants/labourReportOptions";

interface ProjectOption { _id: string; name: string; }
interface ContractorOption { vendorCode: string; companyName: string; }

interface LabourReportRow extends LabourReportFormValues {
  _id: string;
  vendorName: string;
  projectName: string;
  date: string;
}

export default function DailyLabourReport() {
  const [form] = Form.useForm();

  const [projects, setProjects]       = useState<ProjectOption[]>([]);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [reports, setReports]         = useState<LabourReportRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [showForm, setShowForm]       = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get("/projects"),
      apiClient.get("/contractors"),
      apiClient.get("/daily-labour-reports"),
    ]).then(([p, c, r]) => {
      setProjects(p.data.projects || []);
      setContractors(c.data.contractors || []);
      setReports(r.data.reports || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function onFinish(vals: LabourReportFormValues & { date: dayjs.Dayjs }) {
    setSubmitting(true);
    try {
      await apiClient.post("/daily-labour-reports", { ...vals, date: vals.date.toISOString() });
      message.success("Daily Labour Report submitted");
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

  const columns: ColumnsType<LabourReportRow> = [
    { title: "Date", dataIndex: "date", width: 110, render: v => dayjs(v).format("DD MMM YYYY") },
    { title: "Contractor", dataIndex: "vendorName", ellipsis: true },
    { title: "Location", dataIndex: "projectName", ellipsis: true },
    { title: "Work Type", dataIndex: "workType", width: 120 },
    { title: "Shift", dataIndex: "shiftType", width: 80 },
    { title: "Labourers", dataIndex: "labourCount", width: 100, align: "right" },
  ];

  return (
    <PageShell
      title="Daily Contractor / Labour Report"
      description="Log today's on-site labour count per contractor, work type, and shift."
      cta={<Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)} style={{ background: "#0d9488", borderColor: "#0d9488" }}>New Report</Button>}
    >
      <Card title="Recent Labour Reports" style={{ borderRadius: 12 }}>
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
        title="New Daily Labour Report"
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ date: dayjs() }}>
          <Form.Item label="Contractor Name" name="vendorCode" rules={[{ required: true, message: "Select a contractor" }]}>
            <Select
              placeholder="Choose"
              showSearch
              filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
              options={contractors.map(c => ({ label: c.companyName, value: c.vendorCode }))}
            />
          </Form.Item>
          <Form.Item label="Location" name="projectId" rules={[{ required: true, message: "Select a location" }]}>
            <Select
              placeholder="Choose"
              showSearch
              filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
              options={projects.map(p => ({ label: p.name, value: p._id }))}
            />
          </Form.Item>
          <Form.Item label="Date" name="date" rules={[{ required: true, message: "Select a date" }]}>
            <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" disabledDate={d => d.isAfter(dayjs(), "day")} />
          </Form.Item>
          <Form.Item label="कार्य प्रकार (Work Type)" name="workType" rules={[{ required: true, message: "Select a work type" }]}>
            <Select
              placeholder="Choose"
              showSearch
              filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
              options={WORK_TYPE_OPTIONS.map(w => ({ label: w, value: w }))}
            />
          </Form.Item>
          <Form.Item label="Shift Type" name="shiftType" rules={[{ required: true, message: "Select a shift" }]}>
            <Select placeholder="Choose" options={SHIFT_TYPE_OPTIONS.map(s => ({ label: s, value: s }))} />
          </Form.Item>
          <Form.Item label="श्रमिक संख्या (Number of Labourers)" name="labourCount" rules={[{ required: true, message: "Enter number of labourers" }]}>
            <InputNumber style={{ width: "100%" }} min={0} placeholder="e.g. 12" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting} size="large" style={{ background: "#0d9488", borderColor: "#0d9488", height: 46, fontWeight: 600 }}>
            Submit Report
          </Button>
        </Form>
      </Modal>
    </PageShell>
  );
}
