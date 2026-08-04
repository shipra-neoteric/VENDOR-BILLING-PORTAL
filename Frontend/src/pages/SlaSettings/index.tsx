import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, Clock } from "lucide-react";
import apiClient from "../../services/apiClient";
import type { WorkflowTemplate } from "../../types/Workflow";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Card from "../../ui/Card";
import Badge from "../../ui/Badge";
import Switch from "../../ui/Switch";
import Spinner from "../../ui/Spinner";
import Alert from "../../ui/Alert";
import ConfirmModal from "../../ui/ConfirmModal";

export default function SlaSettings() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WorkflowTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

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
        actions={<Btn label="New Workflow" icon={Plus} color="primary" onClick={() => navigate("/sla-settings/new")} />}
      />

      {templates.length === 0 ? (
        <Card className="text-center py-14 text-gray-400">
          <Clock className="w-9 h-9 mx-auto mb-3" />
          <div className="font-bold text-gray-600 dark:text-gray-300">No SLA workflows yet</div>
          <div className="text-sm mt-1">Click "New Workflow" to define your first approval chain.</div>
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
                    <Badge color={t.entityType === "WorkOrder" ? "blue" : t.entityType === "BillRequest" ? "purple" : "gray"}>
                      {t.entityType}
                    </Badge>
                    <Badge color="gray">{t.stages.length} stage{t.stages.length !== 1 ? "s" : ""}</Badge>
                  </div>
                  {t.description && <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t.description}</div>}
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {t.stages.map(s => (
                      <Badge key={s.name + s.order} color="gray" small>
                        {s.name} · {s.slaHours}h{s.assignedRole !== "any" ? ` · ${s.assignedRole}` : ""}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div onClick={e => e.stopPropagation()} className="flex items-center gap-2.5 shrink-0">
                  <Switch checked={t.isActive} onLabel="Active" offLabel="Inactive" onChange={v => toggleActive(t, v)} />
                  <Btn small outline icon={Pencil} label="Edit" onClick={() => navigate(`/sla-settings/${t._id}`)} />
                  <Btn small color="red" icon={Trash2} onClick={() => setDeleteTarget(t)} />
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
    </div>
  );
}
