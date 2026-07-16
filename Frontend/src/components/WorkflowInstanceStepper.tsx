import { useState } from "react";
import { Button, Modal, Input, message, Tag, Tooltip } from "antd";
import dayjs from "dayjs";
import apiClient from "../services/apiClient";
import type { WorkflowInstance, WorkflowInstanceStage } from "../types/Workflow";

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
      message.success(`"${stage.name}" marked complete`);
      setRemarksModal(null);
      setRemarks("");
      onChanged?.();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to mark complete");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ margin: compact ? "8px 0" : "14px 0 12px", padding: compact ? "10px 12px" : "12px 14px", background: "var(--nx-fill-2)", borderRadius: 10, border: "1px solid var(--nx-border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {instance.templateName}
        </div>
        {instance.status === "completed" && <Tag color="green">Completed</Tag>}
        {instance.status === "cancelled" && <Tag>Cancelled</Tag>}
        {instance.isBreached && instance.status === "in-progress" && <Tag color="red">SLA Breached</Tag>}
      </div>

      {/* Circles + connectors */}
      <div style={{ display: "flex", alignItems: "center" }}>
        {stages.map((stage, i) => {
          const st = stageStatus(stage);
          const c = STEP_COLORS[st];
          return (
            <div key={stage._id} style={{ display: "flex", alignItems: "center", flex: i < stages.length - 1 ? 1 : "none" }}>
              <Tooltip title={`${stage.name}${userName(stage.assignedUserId) ? ` — ${userName(stage.assignedUserId)}` : stage.assignedRole !== "any" ? ` — ${stage.assignedRole}` : ""}`}>
                <div style={{ width: CIRCLE, height: CIRCLE, borderRadius: "50%", background: c.bg, border: `2.5px solid ${c.ring}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 800, color: c.ring }}>
                  {st === "completed" ? "✓" : <span style={{ fontSize: 10 }}>{i + 1}</span>}
                </div>
              </Tooltip>
              {i < stages.length - 1 && (
                <div style={{ flex: 1, height: 2.5, borderRadius: 2, background: stages[i + 1].status !== "pending" ? "#16a34a" : "var(--nx-border)", margin: "0 2px" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Labels */}
      <div style={{ display: "flex", marginTop: 6 }}>
        {stages.map((stage, i) => (
          <div key={stage._id} style={{ flex: i < stages.length - 1 ? 1 : "none", minWidth: CIRCLE, textAlign: "center", padding: "0 2px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: STEP_COLORS[stageStatus(stage)].text, lineHeight: 1.2 }}>{stage.name}</div>
          </div>
        ))}
      </div>

      {/* Current stage detail card */}
      {currentStage && instance.status === "in-progress" && (
        <div style={{ marginTop: 12, padding: "10px 12px", background: currentStage.breached ? "#fef2f2" : "#fff", border: `1px solid ${currentStage.breached ? "#fecaca" : "var(--nx-border)"}`, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: "var(--nx-text)" }}>{currentStage.name}</div>
            <div style={{ color: "var(--nx-text-muted)", marginTop: 2 }}>
              {userName(currentStage.assignedUserId) || (currentStage.assignedRole !== "any" ? currentStage.assignedRole : "Anyone")}
              {currentStage.dueAt && <> · Due {dayjs(currentStage.dueAt).format("DD MMM, h:mm A")}</>}
            </div>
            {currentStage.breached && (
              <Tag color="red" style={{ marginTop: 4 }}>
                Overdue by {fmtDelay(Math.round((Date.now() - new Date(currentStage.dueAt!).getTime()) / 60000))}
              </Tag>
            )}
          </div>
          {canActOnStage(currentStage, userRole, userId) && (
            <Button
              size="small" type="primary"
              style={{ background: "#16a85a", borderColor: "#16a85a" }}
              onClick={() => setRemarksModal(currentStage)}
            >
              Mark as Complete
            </Button>
          )}
        </div>
      )}

      {/* Completed stages — on-time/delayed badges */}
      {!compact && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {stages.filter(s => s.status === "completed").map(s => (
            <Tag key={s._id} color={s.delayMinutes > 0 ? "red" : "green"}>
              {s.name}: {s.delayMinutes > 0 ? `+${fmtDelay(s.delayMinutes)} late` : "On time"}
            </Tag>
          ))}
        </div>
      )}

      <Modal
        open={!!remarksModal}
        title={`Mark "${remarksModal?.name}" complete`}
        onCancel={() => { setRemarksModal(null); setRemarks(""); }}
        onOk={() => remarksModal && completeStage(remarksModal, remarks)}
        confirmLoading={saving}
        okText="Confirm Complete"
        okButtonProps={{ style: { background: "#16a85a", borderColor: "#16a85a" } }}
      >
        <Input.TextArea
          rows={3}
          placeholder="Remarks (optional)"
          value={remarks}
          onChange={e => setRemarks(e.target.value)}
        />
      </Modal>
    </div>
  );
}
