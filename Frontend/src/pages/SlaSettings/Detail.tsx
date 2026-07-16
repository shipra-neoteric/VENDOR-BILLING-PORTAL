import { useCallback, useEffect, useState } from "react";
import { Button, Form, Input, Select, Switch, Row, Col, message, Spin, Alert } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import type { WorkflowTemplate, WorkflowTemplateStage } from "../../types/Workflow";
import { ENTITY_OPTIONS, StageBuilder, type UserOption } from "./shared";

export default function SlaSettingsDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";

  const [form] = Form.useForm();
  const [stages, setStages] = useState<WorkflowTemplateStage[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const uRes = await apiClient.get("/users").catch(() => ({ data: { users: [] } }));
      setUsers(uRes.data.users ?? []);

      if (!isNew) {
        const tRes = await apiClient.get("/workflows/templates");
        const template: WorkflowTemplate | undefined = (tRes.data.templates ?? []).find((t: WorkflowTemplate) => t._id === id);
        if (!template) { setError("Workflow template not found"); return; }
        form.setFieldsValue({ name: template.name, description: template.description, entityType: template.entityType, isActive: template.isActive });
        setName(template.name);
        setStages(template.stages.map(s => ({ ...s })));
      } else {
        form.setFieldsValue({ entityType: "WorkOrder", isActive: true });
        setStages([]);
      }
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to load workflow");
    } finally { setLoading(false); }
  }, [id, isNew, form]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    let values: Record<string, unknown>;
    try { values = await form.validateFields(); } catch { return; }
    if (stages.length === 0) { message.error("Add at least one stage"); return; }
    if (stages.some(s => !s.name.trim())) { message.error("Every stage needs a name"); return; }

    setSaving(true);
    try {
      const payload = { ...values, stages };
      if (isNew) {
        await apiClient.post("/workflows/templates", payload);
        message.success("Workflow template created");
      } else {
        await apiClient.put(`/workflows/templates/${id}`, payload);
        message.success("Workflow template updated");
      }
      navigate("/sla-settings");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Save failed";
      message.error(msg);
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <Spin size="large" tip="Loading workflow…" />
    </div>
  );

  if (error) return <Alert type="error" message={error} style={{ margin: 24 }} />;

  return (
    <PageShell
      title={
        <span>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/sla-settings")} style={{ marginRight: 8, color: "#6B7280" }} />
          {isNew ? "New SLA Workflow" : `Edit "${name}"`}
        </span>
      }
      description="Configure the stages, SLA timers, and assignees for this workflow."
      cta={
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="large" onClick={() => navigate("/sla-settings")}>Cancel</Button>
          <Button size="large" type="primary" loading={saving} onClick={handleSave}
            style={{ background: "#FF7A00", borderColor: "#FF7A00" }}>
            {isNew ? "Create Workflow" : "Save Changes"}
          </Button>
        </div>
      }
    >
      <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label="Workflow Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
                <Input placeholder='e.g. "Work Order Sign-off Chain"' />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Applies To" name="entityType" rules={[{ required: true }]}>
                <Select options={ENTITY_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Description (optional)" name="description">
            <Input.TextArea rows={2} placeholder="What is this workflow for?" />
          </Form.Item>
          <Form.Item label="Active" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </div>

      <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px 24px" }}>
        <StageBuilder stages={stages} onChange={setStages} users={users} />
      </div>
    </PageShell>
  );
}
