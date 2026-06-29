import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  message,
} from "antd";
import { EditOutlined, PlusOutlined } from "@ant-design/icons";

import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import type { Project } from "../../types/VendorBilling";

const STATUS_CFG: Record<string, { color: string; label: string }> = {
  active:    { color: "green",   label: "Active" },
  completed: { color: "blue",    label: "Completed" },
  "on-hold": { color: "orange",  label: "On Hold" },
};

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN");

const normalizeId = (obj: any) => ({ ...obj, id: obj._id || obj.id });

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState("");
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [form] = Form.useForm();

  // ── Load ──────────────────────────────────────────────────────
  useEffect(() => {
    apiClient
      .get<{ projects: Project[] }>("/projects")
      .then((r) => setProjects(r.data.projects.map(normalizeId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      projects.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.code.toLowerCase().includes(search.toLowerCase()) ||
          p.location.toLowerCase().includes(search.toLowerCase())
      ),
    [projects, search]
  );

  const openCreate = () => {
    setEditingProject(null);
    form.resetFields();
    form.setFieldsValue({ status: "active" });
    setDrawerOpen(true);
  };

  const openEdit = (project: Project) => {
    setEditingProject(project);
    form.setFieldsValue({
      name: project.name,
      location: project.location,
      contractValue: project.contractValue,
      status: project.status,
    });
    setDrawerOpen(true);
  };

  // ── Save ──────────────────────────────────────────────────────
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editingProject) {
        const res = await apiClient.put<{ project: Project }>(`/projects/${editingProject.id}`, values);
        setProjects((prev) => prev.map((p) => (p.id === editingProject.id ? normalizeId(res.data.project) : p)));
        message.success("Project updated");
      } else {
        const res = await apiClient.post<{ project: Project }>("/projects", values);
        setProjects((prev) => [normalizeId(res.data.project), ...prev]);
        message.success(`Project ${res.data.project.code} created`);
      }
      setDrawerOpen(false);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "errorFields" in err) return;
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: "Code",
      dataIndex: "code",
      width: 110,
      render: (v: string) => (
        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00" }}>{v}</span>
      ),
    },
    { title: "Project Name", dataIndex: "name", width: 200 },
    { title: "Location", dataIndex: "location", width: 140 },
    {
      title: "Contract Value",
      dataIndex: "contractValue",
      width: 150,
      render: (v: number) => (
        <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{fmt(v)}</span>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 110,
      render: (v: string) => (
        <Tag color={STATUS_CFG[v]?.color || "default"}>
          {STATUS_CFG[v]?.label || v}
        </Tag>
      ),
    },
    {
      title: "Actions",
      width: 80,
      render: (_: unknown, record: Project) => (
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          onClick={() => openEdit(record)}
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <PageShell
      title="Projects"
      description="Manage project master data — locations, contract values, and status."
      cta={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={openCreate}
          style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
        >
          Add Project
        </Button>
      }
    >
      {/* Search */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E5E7EB",
          borderRadius: 10,
          padding: "14px 16px",
          marginBottom: 16,
        }}
      >
        <Input.Search
          placeholder="Search by project name, code, or location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ maxWidth: 400 }}
        />
      </div>

      {/* Table */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E5E7EB",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <Spin spinning={loading}>
          <Table
            rowKey="id"
            dataSource={filtered}
            columns={columns}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{
              emptyText: loading ? " " : (
                <div style={{ padding: "40px", textAlign: "center", color: "#9CA3AF" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🏗️</div>
                  <div style={{ fontWeight: 600, color: "#374151" }}>No projects yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Click "Add Project" to register your first project.
                  </div>
                </div>
              ),
            }}
          />
        </Spin>
      </div>

      {/* Right Drawer — Create / Edit */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="right"
        width={520}
        title={
          <Space>
            <span style={{ fontSize: 20 }}>🏗️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                {editingProject ? "Edit Project" : "Add Project"}
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                {editingProject
                  ? `Editing ${editingProject.code}`
                  : "Project code will be auto-assigned (PRJ-001)"}
              </div>
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button
              size="large"
              type="primary"
              loading={saving}
              onClick={handleSave}
              style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
            >
              {editingProject ? "Save Changes" : "Add Project"}
            </Button>
          </div>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Project Name"
            name="name"
            rules={[{ required: true, message: "Required" }]}
          >
            <Input placeholder="e.g. Metro Station Phase 2" />
          </Form.Item>

          <Form.Item
            label="Location"
            name="location"
            rules={[{ required: true, message: "Required" }]}
          >
            <Input placeholder="e.g. Bhopal" />
          </Form.Item>

          <Form.Item
            label="Contract Value (₹)"
            name="contractValue"
            rules={[{ required: true, message: "Required" }]}
          >
            <InputNumber
              style={{ width: "100%" }}
              min={0}
              placeholder="e.g. 25000000"
              formatter={(v) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            />
          </Form.Item>

          <Form.Item label="Status" name="status" initialValue="active">
            <Select
              options={[
                { label: "Active", value: "active" },
                { label: "Completed", value: "completed" },
                { label: "On Hold", value: "on-hold" },
              ]}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </PageShell>
  );
}
