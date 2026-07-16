import { useCallback, useEffect, useState } from "react";
import { Button, Switch, Popconfirm, message, Tag, Spin, Alert } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import type { WorkflowTemplate } from "../../types/Workflow";

export default function SlaSettings() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiClient.get("/workflows/templates");
      setTemplates(res.data.templates ?? []);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to load SLA templates");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(t: WorkflowTemplate) {
    try {
      await apiClient.delete(`/workflows/templates/${t._id}`);
      message.success(`"${t.name}" deleted`);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Delete failed";
      message.error(msg);
    }
  }

  async function toggleActive(t: WorkflowTemplate, isActive: boolean) {
    try {
      await apiClient.put(`/workflows/templates/${t._id}`, { isActive });
      setTemplates(prev => prev.map(x => x._id === t._id ? { ...x, isActive } : x));
    } catch {
      message.error("Failed to update status");
    }
  }

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <Spin size="large" tip="Loading SLA templates…" />
    </div>
  );

  if (error) return <Alert type="error" message={error} style={{ margin: 24 }} />;

  return (
    <PageShell
      title="SLA Settings"
      description="Define multi-stage approval workflows with per-stage SLA timers, so real approvals in your system are tracked and timed automatically."
      cta={
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => navigate("/sla-settings/new")}
          style={{ background: "#FF7A00", borderColor: "#FF7A00" }}>
          New Workflow
        </Button>
      }
    >
      {templates.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#9ba3b8", background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 12 }}>
          <ClockCircleOutlined style={{ fontSize: 36, marginBottom: 12 }} />
          <div style={{ fontWeight: 700, fontSize: 15, color: "#374151" }}>No SLA workflows yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Click "New Workflow" to define your first approval chain.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {templates.map(t => (
            <div
              key={t._id}
              onClick={() => navigate(`/sla-settings/${t._id}`)}
              style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 20px", opacity: t.isActive ? 1 : 0.6, cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</span>
                    <Tag color={t.entityType === "WorkOrder" ? "blue" : t.entityType === "BillRequest" ? "purple" : "default"}>{t.entityType}</Tag>
                    <Tag>{t.stages.length} stage{t.stages.length !== 1 ? "s" : ""}</Tag>
                  </div>
                  {t.description && <div style={{ fontSize: 13, color: "var(--nx-text-2)", marginTop: 4 }}>{t.description}</div>}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {t.stages.map(s => (
                      <Tag key={s.name + s.order}>{s.name} · {s.slaHours}h{s.assignedRole !== "any" ? ` · ${s.assignedRole}` : ""}</Tag>
                    ))}
                  </div>
                </div>
                <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Switch checked={t.isActive} checkedChildren="Active" unCheckedChildren="Inactive"
                    onChange={v => toggleActive(t, v)} />
                  <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/sla-settings/${t._id}`)}>Edit</Button>
                  <Popconfirm title={`Delete "${t.name}"?`} description="This cannot be undone." okText="Delete" okType="danger" onConfirm={() => handleDelete(t)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
