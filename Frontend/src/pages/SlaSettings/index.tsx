import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, Clock } from "lucide-react";
import apiClient from "../../services/apiClient";
import type { WorkflowTemplate, WorkflowTemplateStage } from "../../types/Workflow";
import PageHeader from "../../ui/PageHeader";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import Switch from "../../ui/Switch";
import Spinner from "../../ui/Spinner";
import Alert from "../../ui/Alert";
import ConfirmModal from "../../ui/ConfirmModal";
import Modal from "../../ui/Modal";
import Btn from "../../ui/Btn";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import { ENTITY_OPTIONS, StageBuilder, type UserOption } from "./shared";

// NxBadge (see ui/nexora/Badge.tsx) has no "purple", so BillRequest maps onto
// the closest allowed Nexora color instead.
const ENTITY_BADGE_COLOR: Record<string, NxBadgeColor> = {
  WorkOrder: "blue",
  BillRequest: "indigo",
};

// Empty-state shape for the "New Workflow" drawer — same fields
// SlaSettingsDetail.tsx's own `form` state starts a fresh template with.
function emptyForm() {
  return { name: "", description: "", entityType: "WorkOrder" as const, isActive: true };
}

export default function SlaSettings() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WorkflowTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  // "New Workflow" now opens a right-side drawer in place instead of
  // navigating to /sla-settings/new — SlaSettingsDetail.tsx (and its route)
  // is untouched and still handles editing an existing template.
  const [showNewDrawer, setShowNewDrawer] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [newForm, setNewForm] = useState(emptyForm());
  const [newStages, setNewStages] = useState<WorkflowTemplateStage[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiClient.get("/workflows/templates");
      setTemplates(res.data.templates ?? []);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to load SLA templates");
    } finally { setLoading(false); }
  }, []);

  function openNewDrawer() {
    setNewForm(emptyForm());
    setNewStages([]);
    setShowNewDrawer(true);
    if (users.length === 0) {
      apiClient.get("/auth/users").then(res => setUsers(res.data.users ?? [])).catch(() => {});
    }
  }

  async function handleCreate() {
    if (!newForm.name.trim()) return toast.error("Name is required");
    if (newStages.length === 0) return toast.error("Add at least one stage");
    if (newStages.some(s => !s.name.trim())) return toast.error("Every stage needs a name");

    setCreating(true);
    try {
      await apiClient.post("/workflows/templates", { ...newForm, stages: newStages });
      toast.success("Workflow template created");
      setShowNewDrawer(false);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Save failed";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/workflows/templates/${deleteTarget._id}`);
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Delete failed";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  async function toggleActive(t: WorkflowTemplate, isActive: boolean) {
    try {
      await apiClient.put(`/workflows/templates/${t._id}`, { isActive });
      setTemplates(prev => prev.map(x => x._id === t._id ? { ...x, isActive } : x));
    } catch {
      toast.error("Failed to update status");
    }
  }

  if (loading) return <Spinner label="Loading SLA templates…" />;

  if (error) return <div className="p-6"><Alert type="error" message={error} /></div>;

  return (
    <div>
      <PageHeader
        title="SLA Settings"
        subtitle="Define multi-stage approval workflows with per-stage SLA timers, so real approvals in your system are tracked and timed automatically."
        icon={Clock}
        actions={<NxBtn label="New Workflow" icon={Plus} color="primary" onClick={openNewDrawer} />}
      />

      {templates.length === 0 ? (
        <Card padded={false}>
          <EmptyState icon={Clock} title="No SLA workflows yet" message='Click "New Workflow" to define your first approval chain.' />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map(t => (
            <Card
              key={t._id}
              onClick={() => navigate(`/sla-settings/${t._id}`)}
              className={`cursor-pointer transition-opacity ${t.isActive ? "" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">{t.name}</span>
                    <NxBadge color={ENTITY_BADGE_COLOR[t.entityType] || "gray"}>
                      {t.entityType}
                    </NxBadge>
                    <NxBadge color="gray">{t.stages.length} stage{t.stages.length !== 1 ? "s" : ""}</NxBadge>
                  </div>
                  {t.description && <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t.description}</div>}
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {t.stages.map(s => (
                      <NxBadge key={s.name + s.order} color="gray">
                        {s.name} · {s.slaHours}h{s.assignedRole !== "any" ? ` · ${s.assignedRole}` : ""}
                      </NxBadge>
                    ))}
                  </div>
                </div>
                <div onClick={e => e.stopPropagation()} className="flex items-center gap-2.5 shrink-0">
                  <Switch checked={t.isActive} onLabel="Active" offLabel="Inactive" onChange={v => toggleActive(t, v)} />
                  <NxBtn color="icon" title="Edit" icon={Pencil} onClick={() => navigate(`/sla-settings/${t._id}`)} />
                  <NxBtn
                    color="icon" title="Delete" icon={Trash2}
                    className="text-red-500! hover:text-red-600! hover:bg-red-50! dark:hover:bg-red-500/10!"
                    onClick={() => setDeleteTarget(t)}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete "${deleteTarget.name}"?`}
          message="This cannot be undone."
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {showNewDrawer && (
        <Modal
          title="New SLA Workflow"
          subtitle="Configure the stages, SLA timers, and assignees for this workflow."
          icon={Clock}
          onClose={() => setShowNewDrawer(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn label="Cancel" outline onClick={() => setShowNewDrawer(false)} />
              <Btn label="Create Workflow" color="primary" loading={creating} onClick={handleCreate} />
            </div>
          }
        >
          <Card className="mb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Field
                label="Workflow Name" required placeholder='e.g. "Work Order Sign-off Chain"'
                value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
              />
              <SField
                label="Applies To" required value={newForm.entityType} options={ENTITY_OPTIONS}
                onChange={v => setNewForm(f => ({ ...f, entityType: v as typeof f.entityType }))}
              />
            </div>
            <div className="mb-4">
              <Field
                textarea label="Description (optional)" rows={2} placeholder="What is this workflow for?"
                value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <Switch checked={newForm.isActive} onChange={v => setNewForm(f => ({ ...f, isActive: v }))} onLabel="Active" offLabel="Inactive" />
          </Card>

          <Card>
            <StageBuilder stages={newStages} onChange={setNewStages} users={users} />
          </Card>
        </Modal>
      )}
    </div>
  );
}
