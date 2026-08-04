import { useState } from "react";
import toast from "react-hot-toast";
import { Check } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../services/apiClient";
import type { WorkflowInstance, WorkflowInstanceStage } from "../types/Workflow";
import Modal from "../ui/Modal";
import Btn from "../ui/Btn";
import Badge from "../ui/Badge";
import Field from "../ui/Field";

type StepStatus = "completed" | "current" | "pending" | "breached";

const STEP_COLORS: Record<StepStatus, { ring: string; bg: string; text: string }> = {
  completed: { ring: "#16a34a", bg: "#f0fdf4", text: "#16a34a" },
  current:   { ring: "#FF7A00", bg: "#FFF4E8", text: "#FF7A00" },
  breached:  { ring: "#ef4444", bg: "#fef2f2", text: "#ef4444" },
  pending:   { ring: "#D1D5DB", bg: "#F9FAFB", text: "#9CA3AF" },
};

const userName = (u: WorkflowInstanceStage["assignedUserId"]) =>
  u && typeof u === "object" ? u.name : undefined;

function stageStatus(stage: WorkflowInstanceStage): StepStatus {
  if (stage.status === "completed") return "completed";
  if (stage.status === "in-progress") return stage.breached ? "breached" : "current";
  return "pending";
}

function fmtDelay(minutes: number) {
  if (minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function canActOnStage(stage: WorkflowInstanceStage, userRole?: string, userId?: string): boolean {
  if (!userRole) return false;
  if (userRole === "owner") return true;
  const assignedId = stage.assignedUserId && typeof stage.assignedUserId === "object"
    ? stage.assignedUserId._id
    : stage.assignedUserId;
  if (assignedId && assignedId === userId) return true;
  return stage.assignedRole === "any" || stage.assignedRole === userRole;
}

export default function WorkflowInstanceStepper({
  instance, userRole, userId, onChanged, compact = false,
}: {
  instance: WorkflowInstance;
  userRole?: string;
  userId?: string;
  onChanged?: () => void;
  compact?: boolean;
}) {
  const [remarksModal, setRemarksModal] = useState<WorkflowInstanceStage | null>(null);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const stages = instance.stages;
  const currentStage = stages[instance.currentStageIndex];
  const CIRCLE = compact ? 24 : 30;

  async function completeStage(stage: WorkflowInstanceStage, remarksText: string) {
    setSaving(true);
    try {
      await apiClient.patch(`/workflows/instances/${instance._id}/complete-stage`, {
        stageId: stage._id,
        remarks: remarksText,
      });
      toast.success(`"${stage.name}" marked complete`);
      setRemarksModal(null);
      setRemarks("");
      onChanged?.();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to mark complete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800/40 rounded-[10px] border border-gray-200 dark:border-gray-700/40" style={{ margin: compact ? "8px 0" : "14px 0 12px", padding: compact ? "10px 12px" : "12px 14px" }}>
      <div className="flex justify-between items-center mb-2.5">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
          {instance.templateName}
        </div>
        {instance.status === "completed" && <Badge color="green" small>Completed</Badge>}
        {instance.status === "cancelled" && <Badge color="gray" small>Cancelled</Badge>}
        {instance.isBreached && instance.status === "in-progress" && <Badge color="red" small>SLA Breached</Badge>}
      </div>

      {/* Circles + connectors */}
      <div className="flex items-center">
        {stages.map((stage, i) => {
          const st = stageStatus(stage);
          const c = STEP_COLORS[st];
          const tooltip = `${stage.name}${userName(stage.assignedUserId) ? ` — ${userName(stage.assignedUserId)}` : stage.assignedRole !== "any" ? ` — ${stage.assignedRole}` : ""}`;
          return (
            <div key={stage._id} className={`flex items-center ${i < stages.length - 1 ? "flex-1" : ""}`}>
              <div
                title={tooltip}
                className="rounded-full flex items-center justify-center shrink-0 font-extrabold"
                style={{ width: CIRCLE, height: CIRCLE, background: c.bg, border: `2.5px solid ${c.ring}`, fontSize: 12, color: c.ring }}
              >
                {st === "completed" ? <Check className="w-3.5 h-3.5" /> : <span className="text-[10px]">{i + 1}</span>}
              </div>
              {i < stages.length - 1 && (
                <div className="flex-1 h-[2.5px] rounded mx-0.5" style={{ background: stages[i + 1].status !== "pending" ? "#16a34a" : "#E5E7EB" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Labels */}
      <div className="flex mt-1.5">
        {stages.map((stage, i) => (
          <div key={stage._id} className={`text-center px-0.5 ${i < stages.length - 1 ? "flex-1" : ""}`} style={{ minWidth: CIRCLE }}>
            <div className="text-[10px] font-bold leading-tight" style={{ color: STEP_COLORS[stageStatus(stage)].text }}>{stage.name}</div>
          </div>
        ))}
      </div>

      {/* Current stage detail card */}
      {currentStage && instance.status === "in-progress" && (
        <div
          className="mt-3 rounded-lg flex justify-between items-center flex-wrap gap-2 border"
          style={{ padding: "10px 12px", background: currentStage.breached ? "#fef2f2" : "#fff", borderColor: currentStage.breached ? "#fecaca" : "#E5E7EB" }}
        >
          <div className="text-xs">
            <div className="font-semibold text-[#1A1A2E]">{currentStage.name}</div>
            <div className="text-gray-400 mt-0.5">
              {userName(currentStage.assignedUserId) || (currentStage.assignedRole !== "any" ? currentStage.assignedRole : "Anyone")}
              {currentStage.dueAt && <> · Due {dayjs(currentStage.dueAt).format("DD MMM, h:mm A")}</>}
            </div>
            {currentStage.breached && (
              <div className="mt-1"><Badge color="red" small>Overdue by {fmtDelay(Math.round((Date.now() - new Date(currentStage.dueAt!).getTime()) / 60000))}</Badge></div>
            )}
          </div>
          {canActOnStage(currentStage, userRole, userId) && (
            <Btn small style={{ background: "#16a85a", borderColor: "#16a85a" }} label="Mark as Complete" onClick={() => setRemarksModal(currentStage)} />
          )}
        </div>
      )}

      {/* Completed stages — on-time/delayed badges */}
      {!compact && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {stages.filter(s => s.status === "completed").map(s => (
            <Badge key={s._id} color={s.delayMinutes > 0 ? "red" : "green"} small>
              {s.name}: {s.delayMinutes > 0 ? `+${fmtDelay(s.delayMinutes)} late` : "On time"}
            </Badge>
          ))}
        </div>
      )}

      {remarksModal && (
        <Modal
          title={`Mark "${remarksModal.name}" complete`}
          onClose={() => { setRemarksModal(null); setRemarks(""); }}
          footer={<Btn label="Confirm Complete" style={{ background: "#16a85a", borderColor: "#16a85a" }} loading={saving} onClick={() => completeStage(remarksModal, remarks)} />}
        >
          <Field textarea rows={3} placeholder="Remarks (optional)" value={remarks} onChange={e => setRemarks(e.target.value)} />
        </Modal>
      )}
    </div>
  );
}
