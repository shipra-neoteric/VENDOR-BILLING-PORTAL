import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import apiClient from "../services/apiClient";
import { useAuth } from "../context/AuthContext";
import Steps from "../ui/Steps";
import type { StepItem } from "../ui/Steps";
import Btn from "../ui/Btn";
import Field from "../ui/Field";
import SField from "../ui/SField";
import { DatePicker } from "../ui/DatePicker";
import type { DrawingRequest, DrawingReviewHistoryEntry } from "../shared/constants/drawingRequestOptions";

const STAGE_ORDER = ["dri", "agm", "gm"] as const;
const STAGE_TITLE: Record<(typeof STAGE_ORDER)[number], string> = {
  dri: "Requested", agm: "AGM Review", gm: "GM Review",
};

// A grant for module 'drawing-requests' with the given action name — Owner
// always bypasses, matching every other permission check in this codebase.
function hasPerm(user: { role?: string; permissions?: { module: string; actions: string[] }[] } | null, action: string): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return !!user.permissions?.find((p) => p.module === "drawing-requests")?.actions.includes(action);
}

function ActionPanel({ children, background }: { children: React.ReactNode; background?: string }) {
  return (
    <div className="rounded-[10px] mt-3.5 border" style={{ padding: "14px 16px", background: background ?? "#F9FAFB", borderColor: background ? "#FECACA" : "#E5E7EB" }}>
      {children}
    </div>
  );
}

function MutedText({ text }: { text: string }) {
  return (
    <div className="mt-3.5 rounded-lg text-gray-400 text-[12.5px]" style={{ padding: "10px 14px", background: "#F9FAFB", border: "1px dashed #E5E7EB" }}>
      {text}
    </div>
  );
}

function ReviewTimeline({ history, actorLabel }: { history: DrawingReviewHistoryEntry[]; actorLabel: (by: DrawingReviewHistoryEntry["by"]) => string }) {
  if (!history || history.length === 0) {
    return <div className="text-[12.5px] text-gray-400">No review activity yet.</div>;
  }
  return (
    <div>
      {history.map((h, i) => {
        const isReturn  = h.action === "returned";
        const isApprove = h.action === "forwarded" || h.action === "approved";
        const color = isReturn ? "#DC2626" : isApprove ? "#16A34A" : "#2563EB";
        const bg    = isReturn ? "#FEF2F2" : isApprove ? "#F0FDF4" : "#EFF6FF";
        const verb  = h.action === "forwarded" ? "forwarded to GM" : h.action === "approved" ? "approved" : h.action === "returned" ? "returned to DRI" : "resubmitted for AGM review";
        const roleLabel = h.stage === "agm" ? "AGM" : h.stage === "gm" ? "GM" : "DRI";
        return (
          <div key={i} className="flex gap-3 items-start">
            <div className="shrink-0 text-center">
              <div className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs font-bold" style={{ background: bg, border: `2px solid ${color}`, color }}>
                {isReturn ? <X className="w-3 h-3" /> : isApprove ? <Check className="w-3 h-3" /> : "●"}
              </div>
              {i < history.length - 1 && <div className="w-0.5 h-[30px] bg-gray-200 mx-auto" style={{ marginTop: 2, marginBottom: 2 }} />}
            </div>
            <div className="flex-1 min-w-0 pb-3.5">
              <div className="text-[13px] font-bold text-gray-900">
                {roleLabel} {verb}
                <span className="font-normal text-gray-400 ml-2 text-xs">
                  {actorLabel(h.by)}{h.at ? ` · ${dayjs(h.at).format("DD MMM YYYY, hh:mm A")}` : ""}
                </span>
              </div>
              {h.remarks && (
                <div
                  className="text-[12.5px] mt-1 rounded-md border"
                  style={{ padding: "6px 10px", color: isReturn ? "#B91C1C" : "#6B7280", background: isReturn ? "#FEF2F2" : "#F9FAFB", borderColor: isReturn ? "#FCA5A5" : "#E5E7EB" }}
                >
                  {isReturn ? "Reason: " : "Remarks: "}{h.remarks}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// The complete "Review Workflow" block for a Drawing Request — stage banner,
// 3-step stepper (Requested → AGM Review → GM Review, Approved being the
// stepper's implicit end state), append-only timeline, and an inline action
// panel driven by reviewStatus + the logged-in user's drawing-requests
// permissions. Mirrors WorkOrderApprovalWorkflow's shape so both approval
// chains in this app read the same way.
export default function DrawingRequestReviewWorkflow({
  request, onUpdated, readOnly = false,
}: {
  request: DrawingRequest;
  onUpdated: (updated: DrawingRequest) => void;
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  const dr = request;

  const [userOptions, setUserOptions] = useState<{ value: string; label: string }[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  useEffect(() => {
    apiClient.get("/auth/users")
      .then((r) => {
        const map: Record<string, string> = {};
        const opts: { value: string; label: string }[] = [];
        (r.data.users || []).forEach((u: { _id?: string; id?: string; name?: string }) => {
          const uid = u._id || u.id;
          if (uid && u.name) { map[uid] = u.name; opts.push({ value: uid, label: u.name }); }
        });
        setUserMap(map);
        setUserOptions(opts);
      })
      .catch(() => {});
  }, []);

  const [assignedTo, setAssignedTo]   = useState(dr.assignedTo?._id ?? "");
  const [committedDate, setCommittedDate] = useState(dr.committedDate ? dayjs(dr.committedDate).format("YYYY-MM-DD") : "");
  const [agmRemarks, setAgmRemarks]   = useState("");
  const [agmSaving, setAgmSaving]     = useState(false);

  const [priority, setPriority]       = useState(dr.priority || "");
  const [gmRemarks, setGmRemarks]     = useState("");
  const [gmSaving, setGmSaving]       = useState(false);

  const [returning, setReturning]     = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnSaving, setReturnSaving] = useState(false);

  const [resubmitRemarks, setResubmitRemarks] = useState("");
  const [resubmitSaving, setResubmitSaving]   = useState(false);

  useEffect(() => {
    setReturning(false);
    setReturnReason("");
    setAgmRemarks("");
    setGmRemarks("");
    setResubmitRemarks("");
  }, [dr.reviewStatus]);

  function actorLabel(by: DrawingReviewHistoryEntry["by"]): string {
    const uid = typeof by === "string" ? by : by?._id;
    if (!uid) return "—";
    if (user?.id && uid === user.id) return "You";
    return userMap[uid] || by?.name || "—";
  }

  function currentStageInfo(): { text: string; color: string; bg: string } {
    switch (dr.reviewStatus) {
      case "agm-review": return { text: "Waiting for AGM Review", color: "#D97706", bg: "#FFFBEB" };
      case "gm-review":  return { text: "Waiting for GM Review",  color: "#7C3AED", bg: "#F5F3FF" };
      case "approved":   return { text: "Approved",               color: "#16A34A", bg: "#F0FDF4" };
      case "returned": {
        const last = [...(dr.reviewHistory || [])].reverse().find((h) => h.action === "returned");
        const by = last?.stage === "gm" ? "GM" : "AGM";
        return { text: `Returned by ${by} — Revise & Resubmit`, color: "#DC2626", bg: "#FEF2F2" };
      }
      default: return { text: "Approved", color: "#16A34A", bg: "#F0FDF4" };
    }
  }

  function buildSteps(): StepItem[] {
    let currentIdx = 0;
    if (dr.reviewStatus === "gm-review" || dr.reviewStatus === "approved") currentIdx = 2;
    else if (dr.reviewStatus === "agm-review") currentIdx = 1;
    else if (dr.reviewStatus === "returned") currentIdx = 0;

    const isApproved = dr.reviewStatus === "approved";
    return STAGE_ORDER.map((stage, idx) => {
      let status: StepItem["status"] = "wait";
      if (dr.reviewStatus === "returned" && idx === 0) status = "error";
      else if (idx < currentIdx || (idx === 2 && isApproved)) status = "finish";
      else if (idx === currentIdx && !isApproved) status = "process";
      else if (idx <= currentIdx) status = "finish";

      let icon: React.ReactNode;
      if (status === "finish") icon = <Check className="w-3.5 h-3.5" style={{ color: "#16A34A" }} />;
      else if (status === "error") icon = <X className="w-3.5 h-3.5" style={{ color: "#DC2626" }} />;

      let description: string | undefined;
      if (stage === "dri") description = `${dr.driName} · ${dayjs(dr.createdAt).format("DD MMM YYYY")}`;
      if (stage === "agm" && (idx < currentIdx || isApproved)) {
        const h = dr.reviewHistory?.find((e) => e.stage === "agm" && e.action === "forwarded");
        if (h) description = `${actorLabel(h.by)} · ${dayjs(h.at).format("DD MMM YYYY")}`;
      }
      if (stage === "gm" && isApproved) {
        const h = dr.reviewHistory?.find((e) => e.stage === "gm" && e.action === "approved");
        if (h) description = `${actorLabel(h.by)} · ${dayjs(h.at).format("DD MMM YYYY")}`;
      }

      return { title: STAGE_TITLE[stage], description, icon, status };
    });
  }

  async function handleAgmForward() {
    setAgmSaving(true);
    try {
      const res = await apiClient.patch(`/drawing-requests/${dr._id}/agm-review`, {
        action: "forward", assignedTo: assignedTo || null, committedDate: committedDate || null, remarks: agmRemarks,
      });
      onUpdated(res.data.request as DrawingRequest);
      toast.success("Forwarded to GM review");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to forward");
    } finally {
      setAgmSaving(false);
    }
  }

  async function handleGmApprove() {
    setGmSaving(true);
    try {
      const res = await apiClient.patch(`/drawing-requests/${dr._id}/gm-review`, { action: "approve", priority: priority || undefined, remarks: gmRemarks });
      onUpdated(res.data.request as DrawingRequest);
      toast.success("Approved");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to approve");
    } finally {
      setGmSaving(false);
    }
  }

  async function handleReturn() {
    if (!returnReason.trim()) return;
    setReturnSaving(true);
    const endpoint = dr.reviewStatus === "gm-review" ? "gm-review" : "agm-review";
    try {
      const res = await apiClient.patch(`/drawing-requests/${dr._id}/${endpoint}`, { action: "return", remarks: returnReason });
      onUpdated(res.data.request as DrawingRequest);
      toast.success("Returned to DRI");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to return");
    } finally {
      setReturnSaving(false);
    }
  }

  async function handleResubmit() {
    setResubmitSaving(true);
    try {
      const res = await apiClient.patch(`/drawing-requests/${dr._id}/resubmit`, { remarks: resubmitRemarks });
      onUpdated(res.data.request as DrawingRequest);
      toast.success("Resubmitted for AGM review");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to resubmit");
    } finally {
      setResubmitSaving(false);
    }
  }

  function renderAction(): React.ReactNode {
    if (returning) {
      return (
        <ActionPanel background="#FEF2F2">
          <div className="font-bold text-[13px] mb-2" style={{ color: "#DC2626" }}>Return to DRI</div>
          <Field textarea rows={3} placeholder="Explain what needs to be corrected…" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
          <div className="flex gap-2 mt-2.5">
            <Btn color="red" loading={returnSaving} disabled={!returnReason.trim()} onClick={handleReturn} label="Confirm Return" />
            <Btn outline onClick={() => { setReturning(false); setReturnReason(""); }} label="Cancel" />
          </div>
        </ActionPanel>
      );
    }

    switch (dr.reviewStatus) {
      case "agm-review": {
        if (!hasPerm(user, "agm-approve")) return <MutedText text="Awaiting AGM Review." />;
        return (
          <ActionPanel>
            <div className="font-bold text-[13px] mb-2" style={{ color: "#D97706" }}>AGM Review</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-2.5">
              <SField label="Assign To (optional)" placeholder="Choose" value={assignedTo || null} onChange={setAssignedTo} options={userOptions} />
              <DatePicker label="Committed Date (optional)" value={committedDate} onChange={setCommittedDate} />
            </div>
            <Field textarea rows={2} placeholder="Remarks (optional)" value={agmRemarks} onChange={(e) => setAgmRemarks(e.target.value)} />
            <div className="flex gap-2 mt-2.5">
              <Btn color="green" loading={agmSaving} onClick={handleAgmForward} label="Forward to GM" />
              <Btn color="red" onClick={() => setReturning(true)} label="Return to DRI" />
            </div>
          </ActionPanel>
        );
      }

      case "gm-review": {
        if (!hasPerm(user, "gm-approve")) return <MutedText text="Awaiting GM Review." />;
        return (
          <ActionPanel>
            <div className="font-bold text-[13px] mb-2" style={{ color: "#7C3AED" }}>GM Review</div>
            <div className="flex flex-col gap-2.5">
              <SField
                label="Priority (optional)" placeholder="Choose" value={priority || null} onChange={setPriority}
                options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }]}
              />
              <Field textarea rows={2} placeholder="Remarks (optional)" value={gmRemarks} onChange={(e) => setGmRemarks(e.target.value)} />
            </div>
            <div className="flex gap-2 mt-2.5">
              <Btn color="purple" loading={gmSaving} onClick={handleGmApprove} label="Approve" />
              <Btn color="red" onClick={() => setReturning(true)} label="Return to DRI" />
            </div>
          </ActionPanel>
        );
      }

      case "returned": {
        // Raising a request is unconditional for a DRI (same treatment the
        // "Request a Drawing" button itself gets — no permission gate at
        // all), so resubmitting a returned one gets the same bypass.
        if (!hasPerm(user, "create") && user?.role !== "site-dri") {
          return <MutedText text="Returned to DRI — awaiting revision and resubmission." />;
        }
        return (
          <ActionPanel>
            <div className="font-bold text-[13px] mb-2 text-primary">Resubmit for AGM Review</div>
            <Field textarea rows={2} placeholder="What changed? (optional)" value={resubmitRemarks} onChange={(e) => setResubmitRemarks(e.target.value)} />
            <div className="mt-2.5">
              <Btn color="primary" loading={resubmitSaving} onClick={handleResubmit} label="Resubmit" />
            </div>
          </ActionPanel>
        );
      }

      case "approved":
        return (
          <div className="mt-3.5">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold rounded-full" style={{ color: "#16A34A", background: "#F0FDF4", border: "1px solid #86EFAC", padding: "5px 14px" }}>
              <Check className="w-3.5 h-3.5" /> Approved
            </span>
          </div>
        );

      default:
        return null;
    }
  }

  const stageInfo = currentStageInfo();

  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-200 dark:border-gray-700/40" style={{ padding: "18px 20px" }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Review Workflow</div>
        <div className="text-[13px] font-bold rounded-full" style={{ padding: "5px 14px", color: stageInfo.color, background: stageInfo.bg, border: `1px solid ${stageInfo.color}` }}>
          {stageInfo.text}
        </div>
      </div>

      <div className="mb-4.5">
        <Steps items={buildSteps()} />
      </div>

      <div className="border-t border-gray-100 dark:border-gray-700/40 pt-3.5">
        <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2.5">Review Timeline</div>
        <ReviewTimeline history={dr.reviewHistory || []} actorLabel={actorLabel} />
      </div>

      {!readOnly && renderAction()}
    </div>
  );
}
