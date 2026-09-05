import { useEffect, useState } from "react";
import dayjs from "dayjs";
import apiClient from "../services/apiClient";
import Badge from "../ui/Badge";

interface InstanceStage {
  _id: string;
  name: string;
  status: "pending" | "in-progress" | "completed";
  startedAt?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  breached: boolean;
}

interface WorkflowInstance {
  _id: string;
  status: "in-progress" | "completed" | "cancelled";
  stages: InstanceStage[];
}

const fmt = (d?: string | null) => (d ? dayjs(d).format("DD MMM YYYY, hh:mm A") : null);

function stageBadge(stage: InstanceStage) {
  if (stage.status === "completed") {
    return stage.breached ? <Badge color="red" small>Completed · Breached</Badge> : <Badge color="green" small>Within SLA</Badge>;
  }
  if (stage.status === "in-progress") {
    return stage.breached ? <Badge color="red" small>Breached</Badge> : <Badge color="blue" small>Within SLA</Badge>;
  }
  return <Badge color="gray" small>Pending</Badge>;
}

// Renders the SLA timeline (Start/Due/Done + a breach badge per stage) for
// whichever WorkflowTemplate-driven WorkflowInstance is currently tracking
// this entity — reuses the same slaEngine data that already powers the SLA
// Dashboard, just scoped to one Work Order/Bill Request. Renders nothing if
// no active template covers this entity type (SLA tracking is opt-in via
// WorkflowTemplate, not every entity has an instance).
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

  return (
    <div className="mt-1">
      <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        SLA Timeline
      </div>
      <div className="flex flex-col gap-2.5">
        {instance.stages.map((stage) => (
          <div key={stage._id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-gray-200 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-800/40 px-3 py-2">
            <div className="text-[12.5px] font-bold text-gray-900 dark:text-[#F1F5F9] min-w-[110px]">{stage.name}</div>
            {stageBadge(stage)}
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-400 ml-auto">
              {fmt(stage.startedAt) && <span>Start: {fmt(stage.startedAt)}</span>}
              {fmt(stage.dueAt) && <span>Due: {fmt(stage.dueAt)}</span>}
              {fmt(stage.completedAt) && <span>Done: {fmt(stage.completedAt)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
