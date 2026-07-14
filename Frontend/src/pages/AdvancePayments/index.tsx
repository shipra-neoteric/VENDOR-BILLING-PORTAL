import { useEffect, useState } from "react";
import {
  Button, Table, Modal, Form, Select, DatePicker, Input, InputNumber,
  Tag, message, Spin, Empty, Popconfirm,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import { selectableProjects } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

const STATUS_CFG: Record<string, { color: string; label: string }> = {
  outstanding: { color: "orange", label: "Outstanding" },
  partial:     { color: "gold",   label: "Partial"     },
  recovered:   { color: "green",  label: "Recovered"   },
};

interface AdvanceSlip {
  _id: string;
  slipNo: string;
  contractorCode: string;
  contractorName: string;
  projectName: string;
  amount: number;
  amountRecovered: number;
  balance: number;
  date: string;
  reference?: string;
  notes?: string;
  status: "outstanding" | "partial" | "recovered";
  recoveries: { amount: number; date: string; releasedBy: string }[];
  createdAt: string;
}

export default function AdvancePayments() {
  const [slips,    setSlips]    = useState<AdvanceSlip[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [modal,    setModal]    = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [projects,     setProjects]     = useState<{ _id: string; name: string; parentId?: string | null }[]>([]);
  const [contractors,  setContractors]  = useState<{ vendorCode: string; companyName: string; shortCode?: string }[]>([]);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/advance-slips");
      setSlips(res.data.advanceSlips ?? []);
    } catch { message.error("Failed to load advance slips"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    apiClient.get("/projects").then(r  => setProjects(r.data.projects ?? []));
    apiClient.get("/contractors").then(r => setContractors(r.data.contractors ?? []));
  }, []);

  const handleCreate = async () => {
    try {
      const vals = await form.validateFields();
      setSaving(true);
      const project    = projects.find(p => p._id === vals.projectId);
      const contractor = contractors.find(c => c.vendorCode === vals.contractorCode);
      await apiClient.post("/advance-slips", {
        ...vals,
        date:            dayjs(vals.date).format("YYYY-MM-DD"),
        projectName:     project?.name     ?? "",
        contractorName:  contractor?.companyName ?? "",
      });
      message.success("Advance slip created");
      form.resetFields();
      setModal(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || "Failed to create");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/advance-slips/${id}`);
      message.success("Deleted");
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || "Cannot delete");
    }
  };

  const columns: ColumnsType<AdvanceSlip> = [
    {
      title: "Slip No",
      dataIndex: "slipNo",
      render: v => <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00" }}>{v}</span>,
    },
    { title: "Date",       dataIndex: "date",        render: d => dayjs(d).format("DD MMM YYYY") },
    { title: "Project",    dataIndex: "projectName"  },
    {
      title: "Contractor",
      dataIndex: "contractorName",
      render: (v, r) => {
        const live = contractors.find(c => c.vendorCode === r.contractorCode);
        return (
          <div>
            <div>{live ? vendorLabel(live.companyName, live.shortCode) : v}</div>
            <div style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "monospace" }}>{r.contractorCode}</div>
          </div>
        );
      },
    },
    {
      title: "Advance Given",
      dataIndex: "amount",
      render: v => <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#1a1f2e" }}>{fmt(v)}</span>,
    },
    {
      title: "Recovered",
      dataIndex: "amountRecovered",
      render: v => <span style={{ fontFamily: "monospace", color: "#16a34a" }}>{fmt(v)}</span>,
    },
    {
      title: "Balance",
      dataIndex: "balance",
      render: v => <span style={{ fontFamily: "monospace", fontWeight: 700, color: v > 0 ? "#e03b3b" : "#16a34a" }}>{fmt(v)}</span>,
    },
    {
      title: "Reference",
      dataIndex: "reference",
      render: v => v || <span style={{ color: "#9CA3AF" }}>—</span>,
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (s: string) => {
        const cfg = STATUS_CFG[s] ?? { color: "default", label: s };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: "Actions",
      render: (_, r) => (
        r.amountRecovered === 0 ? (
          <Popconfirm title="Delete this advance slip?" onConfirm={() => handleDelete(r._id)} okText="Delete" okType="danger">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        ) : <span style={{ fontSize: 12, color: "#9CA3AF" }}>Has recoveries</span>
      ),
    },
  ];

  return (
    <PageShell
      title="Advance Payments"
      description="Track advance amounts given to contractors against projects. Recoveries are auto-deducted at bill release."
      cta={
        <Button type="primary" icon={<PlusOutlined />} size="large"
          onClick={() => { form.resetFields(); setModal(true); }}
          style={{ background: "#FF7A00", borderColor: "#FF7A00" }}>
          New Advance Slip
        </Button>
      }
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div>
      ) : slips.length === 0 ? (
        <Empty description="No advance slips yet" />
      ) : (
        <Table dataSource={slips} columns={columns} rowKey="_id" size="middle" pagination={{ pageSize: 20 }} />
      )}

      <Modal
        open={modal}
        onCancel={() => setModal(false)}
        onOk={handleCreate}
        title="New Advance Slip"
        okText="Create Advance Slip"
        okButtonProps={{ loading: saving, style: { background: "#FF7A00", borderColor: "#FF7A00" } }}
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: "Select a project" }]}>
            <Select placeholder="Select project" showSearch optionFilterProp="label"
              options={selectableProjects(projects).map(p => ({ label: p.name, value: p._id }))} />
          </Form.Item>
          <Form.Item name="contractorCode" label="Contractor" rules={[{ required: true, message: "Select a contractor" }]}>
            <Select placeholder="Select contractor" showSearch optionFilterProp="label"
              options={contractors.map(c => ({ label: `${c.vendorCode} — ${vendorLabel(c.companyName, c.shortCode)}`, value: c.vendorCode }))} />
          </Form.Item>
          <Form.Item name="amount" label="Advance Amount (₹)" rules={[{ required: true, message: "Enter amount" }]}>
            <InputNumber style={{ width: "100%" }} min={1} precision={0} prefix="₹" placeholder="e.g. 50000" />
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: "Select date" }]}>
            <DatePicker style={{ width: "100%" }} format="DD MMM YYYY" />
          </Form.Item>
          <Form.Item name="reference" label="Reference / Cheque No. (optional)">
            <Input placeholder="e.g. UTR123456 or CHQ-0042" />
          </Form.Item>
          <Form.Item name="notes" label="Notes (optional)">
            <Input.TextArea rows={2} placeholder="e.g. Advance for mobilisation, Phase 1..." />
          </Form.Item>
        </Form>
      </Modal>
    </PageShell>
  );
}
