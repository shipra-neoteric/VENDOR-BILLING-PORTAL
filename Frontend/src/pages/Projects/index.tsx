import { useEffect, useMemo, useState } from "react";
import {
  Button, Drawer, Form, Input, InputNumber, Select, Space, Spin, Tag, message,
} from "antd";
import { ArrowLeftOutlined, EditOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Project {
  id: string;
  _id?: string;
  code: string;
  name: string;
  location: string;
  contractValue: number;
  status: "active" | "completed" | "on-hold";
  projectType?: "apartment" | "plot";
}

interface WORow {
  _id: string;
  workOrderNo: string;
  vendorName?: string;
  category?: string;
  status: string;
  contractValue?: number;
}

// ── Config ─────────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  active: "#16a34a", completed: "#2563eb", "on-hold": "#f59e0b",
};
const STATUS_BG: Record<string, string> = {
  active: "#f0fdf4", completed: "#eff6ff", "on-hold": "#fffbeb",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Active", completed: "Completed", "on-hold": "On Hold",
};
const WO_STATUS_COLOR: Record<string, string> = {
  draft: "#9CA3AF", issued: "#3b82f6", "in-progress": "#FF7A00", completed: "#16a34a",
};
const WO_STATUS_LABEL: Record<string, string> = {
  draft: "Draft", issued: "Issued", "in-progress": "In Progress", completed: "Completed",
};

const normalizeId = (obj: any): Project => ({ ...obj, id: obj._id || obj.id });
const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

// ── Project Detail View ────────────────────────────────────────────────────────
function ProjectDetail({
  project, onBack, onEdit,
}: {
  project: Project;
  onBack: () => void;
  onEdit: (p: Project, e: React.MouseEvent) => void;
}) {
  const [wos, setWOs] = useState<WORow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = project._id || project.id;
    setLoading(true);
    apiClient.get(`/work-orders?projectId=${id}`)
      .then(r => setWOs(r.data.workOrders ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [project]);

  const totalWOValue   = wos.reduce((s, w) => s + (w.contractValue || 0), 0);
  const activeCount    = wos.filter(w => w.status === "in-progress" || w.status === "issued").length;
  const completedCount = wos.filter(w => w.status === "completed").length;

  return (
    <div>
      {/* Back */}
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={onBack}
        style={{ marginBottom: 20, fontWeight: 500 }}
      >
        Back to Projects
      </Button>

      {/* Project header card */}
      <div style={{
        background: "var(--nx-white)",
        border: "1px solid var(--nx-border)",
        borderLeft: `6px solid ${STATUS_COLOR[project.status] || "#9CA3AF"}`,
        borderRadius: 12,
        padding: "24px 28px",
        marginBottom: 20,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 20,
        flexWrap: "wrap",
      }}>
        <div>
          <span style={{
            display: "inline-block",
            background: "#FFF4E8", color: "#FF7A00",
            fontFamily: "monospace", fontWeight: 700, fontSize: 12,
            padding: "3px 10px", borderRadius: 6, marginBottom: 8,
          }}>
            {project.code}
          </span>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--nx-text)", lineHeight: 1.2, marginBottom: 6 }}>
            {project.name}
          </div>
          <div style={{ fontSize: 14, color: "var(--nx-text-2)" }}>📍 {project.location || "—"}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{
              background: STATUS_BG[project.status], color: STATUS_COLOR[project.status],
              fontSize: 12, fontWeight: 600, padding: "3px 12px", borderRadius: 20,
            }}>
              {STATUS_LABEL[project.status]}
            </span>
            {project.projectType && (
              <span style={{
                background: project.projectType === "apartment" ? "#ede9fe" : "#ccfbf1",
                color: project.projectType === "apartment" ? "#7c3aed" : "#0d9488",
                fontSize: 12, fontWeight: 600, padding: "3px 12px", borderRadius: 20,
              }}>
                {project.projectType === "apartment" ? "🏢 Apartment" : "🏠 Plot"}
              </span>
            )}
          </div>
        </div>
        <Button
          type="primary" icon={<EditOutlined />}
          onClick={e => onEdit(project, e)}
          style={{ background: "#FF7A00", borderColor: "#FF7A00", flexShrink: 0 }}
        >
          Edit Project
        </Button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Contract Value",   value: fmt(project.contractValue || 0), color: "#FF7A00" },
          { label: "Total WO Value",   value: fmt(totalWOValue),               color: "#2563eb" },
          { label: "Work Orders",      value: String(wos.length),              color: "#374151" },
          { label: "Active / Issued",  value: String(activeCount),             color: "#16a34a" },
          { label: "Completed",        value: String(completedCount),          color: "#7c3aed" },
        ].map(s => (
          <div key={s.label} style={{
            background: "var(--nx-white)", border: "1px solid var(--nx-border)",
            borderRadius: 12, padding: "16px 20px",
          }}>
            <div style={{ fontSize: 10, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Work Orders */}
      <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--nx-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--nx-text)" }}>Work Orders</div>
          <div style={{ fontSize: 12, color: "var(--nx-text-muted)" }}>{wos.length} total</div>
        </div>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center" }}><Spin /></div>
        ) : wos.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--nx-text-muted)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--nx-text-2)" }}>No work orders yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Work orders assigned to this project will appear here.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--nx-fill-2)" }}>
                  {["WO Number", "Vendor", "Category", "Status", "Contract Value"].map(h => (
                    <th key={h} style={{
                      padding: "10px 16px", fontSize: 11, fontWeight: 700,
                      color: "var(--nx-table-header-color)", textAlign: "left",
                      textTransform: "uppercase", letterSpacing: "0.05em",
                      borderBottom: "1px solid var(--nx-border)", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wos.map((wo, i) => (
                  <tr key={wo._id} style={{ borderBottom: "1px solid var(--nx-border)", background: i % 2 === 0 ? "var(--nx-white)" : "var(--nx-fill-2)" }}>
                    <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 700, color: "#FF7A00", fontSize: 13 }}>{wo.workOrderNo}</td>
                    <td style={{ padding: "10px 16px", fontSize: 13, color: "var(--nx-text)", fontWeight: 500 }}>{wo.vendorName || "—"}</td>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "var(--nx-text-2)" }}>{wo.category || "—"}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{
                        background: (WO_STATUS_COLOR[wo.status] || "#9CA3AF") + "22",
                        color: WO_STATUS_COLOR[wo.status] || "#9CA3AF",
                        fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 20,
                      }}>
                        {WO_STATUS_LABEL[wo.status] || wo.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 13, color: "var(--nx-text)", fontWeight: 600 }}>
                      {fmt(wo.contractValue || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Projects() {
  const [projects, setProjects]           = useState<Project[]>([]);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [search, setSearch]               = useState("");
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [detailProject, setDetailProject] = useState<Project | null>(null);
  const [form] = Form.useForm();

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    apiClient.get<{ projects: Project[] }>("/projects")
      .then(r => setProjects(r.data.projects.map(normalizeId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() =>
    projects.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      (p.location || "").toLowerCase().includes(search.toLowerCase())
    ),
    [projects, search]
  );

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = [
    { label: "Total Projects", value: projects.length,                                     color: "#FF7A00" },
    { label: "Active",         value: projects.filter(p => p.status === "active").length,    color: "#16a34a" },
    { label: "Completed",      value: projects.filter(p => p.status === "completed").length, color: "#2563eb" },
    { label: "On Hold",        value: projects.filter(p => p.status === "on-hold").length,   color: "#f59e0b" },
  ];

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingProject(null);
    form.resetFields();
    form.setFieldsValue({ status: "active", projectType: "apartment" });
    setDrawerOpen(true);
  };

  const openEdit = (project: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingProject(project);
    form.setFieldsValue({
      name: project.name,
      location: project.location,
      contractValue: project.contractValue,
      status: project.status,
      projectType: project.projectType || "apartment",
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editingProject) {
        const res = await apiClient.put<{ project: Project }>(`/projects/${editingProject.id}`, values);
        const updated = normalizeId(res.data.project);
        setProjects(prev => prev.map(p => p.id === editingProject.id ? updated : p));
        if (detailProject?.id === editingProject.id) setDetailProject(updated);
        message.success("Project updated");
      } else {
        const res = await apiClient.post<{ project: Project }>("/projects", values);
        setProjects(prev => [normalizeId(res.data.project), ...prev]);
        message.success(`Project ${res.data.project.code} created`);
      }
      setDrawerOpen(false);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "errorFields" in err) return;
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <PageShell
      title={detailProject ? detailProject.name : "Projects"}
      description={
        detailProject
          ? `${detailProject.code} · ${detailProject.location || "No location"}`
          : "Manage project master data — locations, contract values, and status."
      }
      cta={
        detailProject ? (
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={e => openEdit(detailProject, e)}
            style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
          >
            Edit Project
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={openCreate}
            style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
          >
            Add Project
          </Button>
        )
      }
    >
      {detailProject ? (
        /* ── Detail view ──────────────────────────────────────────────────── */
        <ProjectDetail
          project={detailProject}
          onBack={() => setDetailProject(null)}
          onEdit={openEdit}
        />
      ) : loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : (
        /* ── List view ────────────────────────────────────────────────────── */
        <>
          {/* Stats strip */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            {stats.map(s => (
              <div key={s.label} style={{
                background: "var(--nx-white)", border: "1px solid var(--nx-border)",
                borderRadius: 12, padding: "14px 20px", minWidth: 150,
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--nx-text-muted)", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ marginBottom: 20 }}>
            <Input
              prefix={<SearchOutlined style={{ color: "#9CA3AF" }} />}
              placeholder="Search by project name, code, or location…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 400 }}
              allowClear
            />
          </div>

          {/* Cards grid */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏗️</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--nx-text-3)" }}>
                {search ? "No projects match your search" : "No projects yet"}
              </div>
              {!search && (
                <div style={{ fontSize: 13, color: "var(--nx-text-muted)", marginTop: 4 }}>
                  Click "Add Project" to get started.
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
              {filtered.map(proj => (
                <div
                  key={proj.id}
                  onClick={() => setDetailProject(proj)}
                  style={{
                    background: "var(--nx-white)",
                    border: "1px solid var(--nx-border)",
                    borderLeft: `4px solid ${STATUS_COLOR[proj.status] || "#9CA3AF"}`,
                    borderRadius: 12,
                    padding: "18px 18px 14px",
                    cursor: "pointer",
                    transition: "box-shadow 0.15s, transform 0.12s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.1)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  {/* Top row: code + status */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{
                      background: "#FFF4E8", color: "#FF7A00",
                      fontFamily: "monospace", fontWeight: 700, fontSize: 11,
                      padding: "2px 8px", borderRadius: 5,
                    }}>
                      {proj.code}
                    </span>
                    <span style={{
                      background: STATUS_BG[proj.status], color: STATUS_COLOR[proj.status],
                      fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 20,
                    }}>
                      {STATUS_LABEL[proj.status]}
                    </span>
                  </div>

                  {/* Project name */}
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--nx-text)", lineHeight: 1.35, marginBottom: 6 }}>
                    {proj.name}
                  </div>

                  {/* Location */}
                  <div style={{ fontSize: 12, color: "var(--nx-text-2)", marginBottom: 12 }}>
                    📍 {proj.location || "—"}
                  </div>

                  {/* Bottom row: value + type + arrow */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--nx-border)", paddingTop: 10, gap: 8 }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14, color: "var(--nx-text)" }}>
                      {fmt(proj.contractValue || 0)}
                    </span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {proj.projectType && (
                        <span style={{
                          background: proj.projectType === "apartment" ? "#ede9fe" : "#ccfbf1",
                          color: proj.projectType === "apartment" ? "#7c3aed" : "#0d9488",
                          fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                        }}>
                          {proj.projectType === "apartment" ? "Apartment" : "Plot"}
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: "var(--nx-text-muted)" }}>→</span>
                    </div>
                  </div>

                  {/* Edit button */}
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                    <Button
                      size="small" type="link" icon={<EditOutlined />}
                      onClick={e => openEdit(proj, e)}
                      style={{ padding: "0 4px", fontSize: 12, color: "var(--nx-text-muted)" }}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Create / Edit Drawer ─────────────────────────────────────────── */}
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
            <Button size="large" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button
              size="large" type="primary" loading={saving} onClick={handleSave}
              style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
            >
              {editingProject ? "Save Changes" : "Add Project"}
            </Button>
          </div>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Project Name" name="name" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="e.g. Metro Station Phase 2" />
          </Form.Item>

          <Form.Item label="Location" name="location" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="e.g. Bhopal" />
          </Form.Item>

          <Form.Item label="Project Type" name="projectType" initialValue="apartment">
            <Select>
              <Select.Option value="apartment">🏢 Apartment / Commercial</Select.Option>
              <Select.Option value="plot">🏠 Plot / Villa</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Contract Value (₹)" name="contractValue"
            rules={[{ required: true, message: "Required" }]}
          >
            <InputNumber
              style={{ width: "100%" }} min={0}
              placeholder="e.g. 25000000"
              formatter={v => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            />
          </Form.Item>

          <Form.Item label="Status" name="status" initialValue="active">
            <Select>
              <Select.Option value="active"><Tag color="green">Active</Tag></Select.Option>
              <Select.Option value="completed"><Tag color="blue">Completed</Tag></Select.Option>
              <Select.Option value="on-hold"><Tag color="orange">On Hold</Tag></Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Drawer>
    </PageShell>
  );
}
