import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ArrowLeft, Clock } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import apiClient from "../../services/apiClient";
import type { WorkflowTemplate, WorkflowTemplateStage } from "../../types/Workflow";
import { ENTITY_OPTIONS, StageBuilder, type UserOption } from "./shared";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Card from "../../ui/Card";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import Switch from "../../ui/Switch";
import Spinner from "../../ui/Spinner";
import Alert from "../../ui/Alert";

export default function SlaSettingsDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";

  const [stages, setStages] = useState<WorkflowTemplateStage[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [form, setForm] = useState({ name: "", description: "", entityType: "WorkOrder", isActive: true });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const uRes = await apiClient.get("/auth/users").catch(() => ({ data: { users: [] } }));
      setUsers(uRes.data.users ?? []);

      if (!isNew) {
        const tRes = await apiClient.get("/workflows/templates");
        const template: WorkflowTemplate | undefined = (tRes.data.templates ?? []).find((t: WorkflowTemplate) => t._id === id);
        if (!template) { setError("Workflow template not found"); return; }
        setForm({ name: template.name, description: template.description ?? "", entityType: template.entityType, isActive: template.isActive });
        setName(template.name);
        setStages(template.stages.map(s => ({ ...s })));
      } else {
        setForm({ name: "", description: "", entityType: "WorkOrder", isActive: true });
        setStages([]);
      }
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to load workflow");
    } finally { setLoading(false); }
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Name is required");
    if (stages.length === 0) { toast.error("Add at least one stage"); return; }
    if (stages.some(s => !s.name.trim())) { toast.error("Every stage needs a name"); return; }

    setSaving(true);
    try {
      const payload = { ...form, stages };
      if (isNew) {
        await apiClient.post("/workflows/templates", payload);
        toast.success("Workflow template created");
      } else {
        await apiClient.put(`/workflows/templates/${id}`, payload);
        toast.success("Workflow template updated");
      }
      navigate("/sla-settings");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Save failed";
      toast.error(msg);
    } finally { setSaving(false); }
  }

  if (loading) return <Spinner label="Loading workflow…" />;
  if (error) return <div className="m-6"><Alert type="error" message={error} /></div>;

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => navigate("/sla-settings")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <ArrowLeft className="w-4 h-4" />
            </button>
            {isNew ? "New SLA Workflow" : `Edit "${name}"`}
          </span>
        }
        subtitle="Configure the stages, SLA timers, and assignees for this workflow."
        icon={Clock}
        actions={
          <>
            <Btn label="Cancel" outline onClick={() => navigate("/sla-settings")} />
            <Btn label={isNew ? "Create Workflow" : "Save Changes"} color="primary" loading={saving} onClick={handleSave} />
          </>
        }
      />

      <Card className="mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Field
            label="Workflow Name" required placeholder='e.g. "Work Order Sign-off Chain"'
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <SField
            label="Applies To" required value={form.entityType} options={ENTITY_OPTIONS}
            onChange={v => setForm(f => ({ ...f, entityType: v }))}
          />
        </div>
        <div className="mb-4">
          <Field
            textarea label="Description (optional)" rows={2} placeholder="What is this workflow for?"
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>
        <Switch checked={form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))} onLabel="Active" offLabel="Inactive" />
      </Card>

      <Card>
        <StageBuilder stages={stages} onChange={setStages} users={users} />
      </Card>
    </div>
  );
}
