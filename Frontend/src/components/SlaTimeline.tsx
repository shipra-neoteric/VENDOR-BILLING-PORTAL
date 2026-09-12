import { useEffect, useState } from "react";
import dayjs from "dayjs";
import apiClient from "../services/apiClient";

interface ActorRef { name?: string; }
type Actor = ActorRef | string | null | undefined;

interface InstanceStage {
  _id: string;
  name: string;
  status: "pending" | "in-progress" | "completed";
  slaHours: number;
  startedAt?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  completedBy?: Actor;
  assignedUserId?: Actor;
  breached: boolean;
}

interface WorkflowInstance {
  _id: string;
  status: "in-progress" | "completed" | "cancelled";
  stages: InstanceStage[];
}

function actorName(a?: Actor): string | undefined {
  if (!a || typeof a === "string") return undefined;
  return a.name;
}

function humanize(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""}`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours !== 1 ? "s" : ""}`;
  const days = Math.round(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""}`;
}

// Duration label on the timeline's left rail — actual time taken for a
// completed stage, elapsed-so-far for the current one, or the stage's
// allotted SLA window before it's even started.
function durationLabel(stage: InstanceStage): string {
  if (stage.completedAt && stage.startedAt) return humanize(dayjs(stage.completedAt).diff(stage.startedAt));
  if (stage.status === "in-progress" && stage.startedAt) return humanize(dayjs().diff(stage.startedAt));
  return `${stage.slaHours}h SLA`;
}

// The stage's own name (e.g. "L1 AGM Approval") is the actual identifier —
// status used to be shown INSTEAD of it ("Pending"/"Completed" for every
// stage, indistinguishable from one another except by the tiny SLA-hours
// label on the left rail). Now it's a small suffix next to the real name.
function stageVisual(stage: InstanceStage, isLast: boolean, instanceCompleted: boolean) {
  if (stage.status === "completed") {
    if (stage.breached) return { color: "#DC2626", status: "Breached" };
    return { color: "#16A34A", status: isLast && instanceCompleted ? "Approved" : "Completed" };
  }
  if (stage.status === "in-progress") {
    return stage.breached ? { color: "#DC2626", status: "Breached" } : { color: "#7C3AED", status: "Awaiting Approval" };
  }
  return { color: "#9CA3AF", status: "Pending" };
}

// Vertical dotted-timeline SLA view for whichever WorkflowTemplate-driven
// WorkflowInstance is currently tracking this entity — reuses the same
// slaEngine data that already powers the SLA Dashboard, just scoped to one
// Work Order/Bill Request. Renders nothing if no active template covers this
// entity type (SLA tracking is opt-in via WorkflowTemplate, not every entity
// has an instance).
export default function SlaTimeline({ entityType, entityId }: { entityType: "WorkOrder" | "BillRequest"; entityId: string }) {
  const [instance, setInstance] = useState<WorkflowInstance | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    apiClient
      .get("/workflows/instances", { params: { entityType, entityId } })
      .then((res) => {
        if (cancelled) return;
        const instances: WorkflowInstance[] = res.data?.instances || [];
        setInstance(instances[0] || null);
      })
      .catch(() => { if (!cancelled) setInstance(null); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  if (!loaded || !instance || instance.stages.length === 0) return null;

  const currentIndex = instance.stages.findIndex((s) => s.status !== "completed");

  return (
    <div className="mt-1">
      <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
        SLA Timeline
      </div>
      <div className="flex flex-col">
        {instance.stages.map((stage, i) => {
          const isLast = i === instance.stages.length - 1;
          const isCurrent = i === currentIndex || (currentIndex === -1 && isLast);
          const { color, status } = stageVisual(stage, isLast, instance.status === "completed");
          // A stage that hasn't started yet has no one who's "initiated"
          // anything — assignedUserId is just who WILL act once it's their
          // turn, not a name to show yet (showing it here read as if that
          // person had already done something).
          const who = stage.status === "pending" ? undefined : (actorName(stage.completedBy) || actorName(stage.assignedUserId));
          return (
            <div key={stage._id} className="flex gap-3">
              <div className="flex flex-col items-center w-16 shrink-0">
                <div className="text-[10.5px] text-gray-400 mb-1 text-center whitespace-nowrap">{durationLabel(stage)}</div>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {!isLast && <span className="flex-1 border-l border-dashed" style={{ borderColor: color }} />}
              </div>
              <div className="pb-4">
                <div className="text-[13px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">
                  {stage.name}
                  <span className="ml-1.5 font-semibold" style={{ color }}>· {status}</span>
                  {isCurrent && <span className="ml-1.5 text-[10px] font-bold text-gray-400 uppercase">(Current State)</span>}
                </div>
                {who && (
                  <div className="text-[12px] text-gray-600 dark:text-gray-300 mt-0.5">
                    Initiated by <strong>{who}</strong>
                  </div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-400 mt-1">
                  {stage.startedAt && <span>Start Date: {dayjs(stage.startedAt).format("DD MMM YYYY, hh:mm A")}</span>}
                  {stage.dueAt && <span>Due Date: {dayjs(stage.dueAt).format("DD MMM YYYY, hh:mm A")}</span>}
                  {stage.completedAt && <span>End Date: {dayjs(stage.completedAt).format("DD MMM YYYY, hh:mm A")}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
