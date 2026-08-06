import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Check, X, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import apiClient from "../services/apiClient";
import { useAuth } from "../context/AuthContext";
import type { AuthUser } from "../context/AuthContext";
import Steps from "../ui/Steps";
import type { StepItem } from "../ui/Steps";
import Btn from "../ui/Btn";
import Field from "../ui/Field";

// ── Shared types ──────────────────────────────────────────────────────────────
// A `by` actor field only ever comes back as a raw ObjectId string from the
// workflow endpoints (none of submit/checker-approve/approver-approve/
// final-approve/getWorkOrder populate it) — stays defensive against a
// populated-object shape too, in case that ever changes.
export type ActorRef = string | { _id?: string; name?: string } | null;

export type ApprovalStage = "maker" | "checker" | "approver" | "final";

export interface ApprovalHistoryEntry {
  stage: ApprovalStage;
  // 'reopened' = the work order was edited after already clearing the full
  // chain (only possible once Owner unlocks it) — distinct from 'sent-back',
  // which is a reviewer's rejection, not an edit.
  action: "submitted" | "approved" | "sent-back" | "reopened";
  by?: ActorRef;
  at?: string;
  remarks?: string;
}

export type ApprovalStatus = "draft" | "pending-checker" | "pending-approver" | "pending-final" | "approved" | "sent-back";

// The minimal shape this component needs — both WorkOrderDashboard's WODetail
// and WorkItems' WorkOrder types satisfy this structurally, no shared base
// class needed.
export interface ApprovalWorkOrder {
  _id: string;
  status?: string;
  cancelReason?: string;
  approvalStatus?: ApprovalStatus;
  makerBy?: ActorRef; makerAt?: string;
  checkerBy?: ActorRef; checkerAt?: string; checkerRemarks?: string;
  approverBy?: ActorRef; approverAt?: string; approverRemarks?: string;
  finalApprovedBy?: ActorRef; finalApprovedAt?: string; finalRemarks?: string;
  approvalHistory?: ApprovalHistoryEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// A grant for module 'work-orders' with the given action name — Owner always
// bypasses, matching every other permission check in this codebase (e.g.
// AccountsPayment's own hasPerm).
function hasPerm(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return !!user.permissions?.find((p) => p.module === "work-orders")?.actions.includes(action);
}

function idOf(by?: ActorRef): string | undefined {
  if (!by) return undefined;
  return typeof by === "string" ? by : by._id;
}

const STAGE_ORDER: ApprovalStage[] = ["maker", "checker", "approver", "final"];
const STAGE_TITLE: Record<ApprovalStage, string> = {
  maker:    "Maker Created",
  checker:  "Checker Verification",
  approver: "Approver Approval",
  final:    "Final (CEO/Owner) Approval",
};
const STAGE_ROLE_LABEL: Record<ApprovalStage, string> = {
  maker: "Maker", checker: "Checker", approver: "Approver", final: "Final Approver",
};

function lastSentBack(history?: ApprovalHistoryEntry[]): ApprovalHistoryEntry | undefined {
  if (!history) return undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].action === "sent-back") return history[i];
  }
  return undefined;
}

// One line, permanently visible: where this work order currently stands.
function currentStageLabel(wo: ApprovalWorkOrder): { text: string; color: string; bg: string } {
  // Cancelling freezes the approval chain wherever it was — approvalStatus is
  // left untouched (so the history above still shows what was approved before
  // cancellation), but the live stage badge/action panel must reflect that no
  // further approval action is possible now.
  if (wo.status === "cancelled") return { text: "Cancelled — Approval Chain Frozen", color: "#DC2626", bg: "#FEF2F2" };
  switch (wo.approvalStatus) {
    case "draft":            return { text: "Draft — Not Yet Submitted for Approval",        color: "#6B7280", bg: "#F9FAFB" };
    case "pending-checker":  return { text: "Waiting for Checker Verification",               color: "#2563EB", bg: "#EFF6FF" };
    case "pending-approver": return { text: "Waiting for Approver Approval",                  color: "#D97706", bg: "#FFFBEB" };
    case "pending-final":    return { text: "Waiting for Final (CEO/Owner) Approval",         color: "#7C3AED", bg: "#F5F3FF" };
    case "approved":         return { text: "Approved · Locked · Ready for Work Progress",    color: "#16A34A", bg: "#F0FDF4" };
    case "sent-back": {
      const sb = lastSentBack(wo.approvalHistory);
      const stageLabel = sb ? STAGE_TITLE[sb.stage] : "a reviewer";
      return { text: `Sent Back by ${stageLabel} — Revise & Resubmit`, color: "#DC2626", bg: "#FEF2F2" };
    }
    default: return { text: "Approved", color: "#16A34A", bg: "#F0FDF4" };
  }
}

function MutedText({ text }: { text: string }) {
  return (
    <div className="mt-3.5 rounded-lg text-gray-400 text-[12.5px]" style={{ padding: "10px 14px", background: "#F9FAFB", border: "1px dashed #E5E7EB" }}>
      {text}
    </div>
  );
}

function ActionPanel({ children, background }: { children: ReactNode; background?: string }) {
  return (
    <div className="rounded-[10px] mt-3.5 border" style={{ padding: "14px 16px", background: background ?? "#F9FAFB", borderColor: background ? "#FECACA" : "#E5E7EB" }}>
      {children}
    </div>
  );
}

// Vertical, append-only timeline built directly from approvalHistory — a work
// order can cycle through submit → send-back → resubmit → approve multiple
// times, so this renders every entry (oldest first), not just the latest state.
function ApprovalTimeline({ history, actorLabel }: { history: ApprovalHistoryEntry[]; actorLabel: (by: ActorRef | undefined, roleFallback: string) => string }) {
  if (!history || history.length === 0) {
    return <div className="text-[12.5px] text-gray-400">No workflow activity yet.</div>;
  }
  return (
    <div>
      {history.map((h, i) => {
        const isReject   = h.action === "sent-back";
        const isApprove  = h.action === "approved";
        const isReopened = h.action === "reopened";
        const color = isReject ? "#DC2626" : isReopened ? "#D97706" : isApprove ? "#16A34A" : "#2563EB";
        const bg    = isReject ? "#FEF2F2" : isReopened ? "#FFFBEB" : isApprove ? "#F0FDF4" : "#EFF6FF";
        const verb  = h.action === "submitted" ? "submitted" : isApprove ? "approved" : isReopened ? "reopened this work order for editing" : "sent back";
        const roleLabel = STAGE_ROLE_LABEL[h.stage];
        return (
          <div key={i} className="flex gap-3 items-start">
            <div className="shrink-0 text-center">
              <div className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-xs font-bold" style={{ background: bg, border: `2px solid ${color}`, color }}>
                {isReject ? <X className="w-3 h-3" /> : isReopened ? "↺" : isApprove ? <Check className="w-3 h-3" /> : "●"}
              </div>
              {i < history.length - 1 && <div className="w-0.5 h-[30px] bg-gray-200 mx-auto" style={{ marginTop: 2, marginBottom: 2 }} />}
            </div>
            <div className="flex-1 min-w-0 pb-3.5">
              <div className="text-[13px] font-bold text-gray-900">
                {isReopened ? actorLabel(h.by, roleLabel) : roleLabel} {verb}
                {!isReopened && (
                  <span className="font-normal text-gray-400 ml-2 text-xs">
                    {actorLabel(h.by, roleLabel)}{h.at ? ` · ${dayjs(h.at).format("DD MMM YYYY, hh:mm A")}` : ""}
                  </span>
                )}
                {isReopened && h.at && (
                  <span className="font-normal text-gray-400 ml-2 text-xs">
                    · {dayjs(h.at).format("DD MMM YYYY, hh:mm A")}
                  </span>
                )}
              </div>
              {h.remarks && (
                <div
                  className="text-[12.5px] mt-1 rounded-md border"
                  style={{
                    padding: "6px 10px",
                    color: isReject ? "#B91C1C" : isReopened ? "#92400E" : "#6B7280",
                    background: isReject ? "#FEF2F2" : isReopened ? "#FFFBEB" : "#F9FAFB",
                    borderColor: isReject ? "#FCA5A5" : isReopened ? "#FDE68A" : "#E5E7EB",
                  }}
                >
                  {isReject ? "Reason: " : "Remarks: "}{h.remarks}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
// The complete "Live Workflow" block — stage banner, 4-step stepper, append-only
// timeline, and an inline (never-a-popup) action panel driven by the current
// stage + the logged-in user's work-orders permissions. Reused as-is by both
// WorkOrderDashboard's full page and WorkItems' quick View drawer, so the two
// never drift out of sync with each other.
export default function WorkOrderApprovalWorkflow<T extends ApprovalWorkOrder>({
  workOrder, onUpdated, readOnly = false,
}: {
  workOrder: T;
  onUpdated: (updated: T) => void;
  // Renders the stage banner/stepper/timeline exactly as usual, but omits the
  // inline action panel entirely — for viewers (e.g. Accounts Payment's WO
  // quick-view) who should see the work order's approval state without being
  // able to act on it, regardless of what work-orders permissions they hold.
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  const wo = workOrder;

  // Best-effort id → name lookup for approvalHistory/maker/checker/approver/
  // finalApprovedBy — none of those come back populated from the backend.
  // Falls back to a role label instead of fabricating a name if this fails.
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  useEffect(() => {
    apiClient.get("/auth/users")
      .then((r) => {
        const map: Record<string, string> = {};
        (r.data.users || []).forEach((u: { _id?: string; id?: string; name?: string }) => {
          const uid = u._id || u.id;
          if (uid && u.name) map[uid] = u.name;
        });
        setUserMap(map);
      })
      .catch(() => {});
  }, []);

  const [submitRemarks, setSubmitRemarks]     = useState("");
  const [submitSaving,  setSubmitSaving]      = useState(false);
  const [checkerRemarks, setCheckerRemarks]   = useState("");
  const [checkerSaving,  setCheckerSaving]    = useState(false);
  const [approverRemarks, setApproverRemarks] = useState("");
  const [approverSaving,  setApproverSaving]  = useState(false);
  const [finalRemarks, setFinalRemarks]       = useState("");
  const [finalSaving,  setFinalSaving]        = useState(false);
  const [sendingBack,  setSendingBack]        = useState(false);
  const [sendBackReason, setSendBackReason]   = useState("");
  const [sendBackSaving, setSendBackSaving]   = useState(false);

  // Reset every action section's local state whenever the work order's own
  // approval stage changes underneath it (e.g. right after a checker-approve
  // succeeds, so the approver section is ready to go without a page reload).
  useEffect(() => {
    setSendingBack(false);
    setSendBackReason("");
    setSubmitRemarks("");
    setCheckerRemarks("");
    setApproverRemarks("");
    setFinalRemarks("");
  }, [wo.approvalStatus]);

  // `by` resolves to "You" for the current viewer, a real name when /auth/users
  // was reachable, or the role label (Maker/Checker/…) as a last resort.
  function actorLabel(by: ActorRef | undefined, roleFallback: string): string {
    const uid = idOf(by);
    if (!uid) return roleFallback;
    if (user?.id && uid === user.id) return "You";
    return userMap[uid] || roleFallback;
  }

  function buildApprovalSteps(): StepItem[] {
    let currentIdx = 0;
    let rejectedIdx: number | null = null;

    switch (wo.approvalStatus) {
      case "draft":            currentIdx = 0; break;
      case "pending-checker":  currentIdx = 1; break;
      case "pending-approver": currentIdx = 2; break;
      case "pending-final":    currentIdx = 3; break;
      case "approved":         currentIdx = 4; break;
      case "sent-back": {
        const sb = lastSentBack(wo.approvalHistory);
        rejectedIdx = sb ? STAGE_ORDER.indexOf(sb.stage) : 1;
        currentIdx = 0; // maker must revise & resubmit
        break;
      }
      default: currentIdx = 0;
    }

    const byAt: Record<ApprovalStage, { by?: ActorRef; at?: string }> = {
      maker:    { by: wo.makerBy,         at: wo.makerAt },
      checker:  { by: wo.checkerBy,       at: wo.checkerAt },
      approver: { by: wo.approverBy,      at: wo.approverAt },
      final:    { by: wo.finalApprovedBy, at: wo.finalApprovedAt },
    };

    return STAGE_ORDER.map((stage, idx) => {
      let status: StepItem["status"] = "wait";
      if (rejectedIdx !== null && idx === rejectedIdx) status = "error";
      else if (idx < currentIdx) status = "finish";
      else if (idx === currentIdx) status = "process";

      let icon: ReactNode = undefined;
      if (status === "finish") icon = <Check className="w-3.5 h-3.5" style={{ color: "#16A34A" }} />;
      else if (status === "error") icon = <X className="w-3.5 h-3.5" style={{ color: "#DC2626" }} />;
      else if (status === "process") icon = <AlertTriangle className="w-3.5 h-3.5" style={{ color: "#D97706" }} />;

      let description: string | undefined;
      if (status === "finish") {
        const meta = byAt[stage];
        description = `${actorLabel(meta.by, STAGE_ROLE_LABEL[stage])}${meta.at ? " · " + dayjs(meta.at).format("DD MMM YYYY") : ""}`;
      } else if (status === "error") {
        const sb = lastSentBack(wo.approvalHistory);
        description = sb ? `Sent back${sb.remarks ? `: "${sb.remarks}"` : ""}` : "Sent back";
      }

      return { title: STAGE_TITLE[stage], description, icon, status };
    });
  }

  async function handleSubmitWO() {
    setSubmitSaving(true);
    try {
      const res = await apiClient.patch(`/work-orders/${wo._id}/submit`, { remarks: submitRemarks });
      onUpdated(res.data.workOrder as T);
      toast.success("Submitted — awaiting checker review");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to submit");
    } finally {
      setSubmitSaving(false);
    }
  }

  async function handleCheckerApproveWO() {
    setCheckerSaving(true);
    try {
      const res = await apiClient.patch(`/work-orders/${wo._id}/checker-approve`, { remarks: checkerRemarks });
      onUpdated(res.data.workOrder as T);
      toast.success("Verified & approved — forwarded to approver");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to approve");
    } finally {
      setCheckerSaving(false);
    }
  }

  async function handleApproverApproveWO() {
    setApproverSaving(true);
    try {
      const res = await apiClient.patch(`/work-orders/${wo._id}/approver-approve`, { remarks: approverRemarks });
      onUpdated(res.data.workOrder as T);
      toast.success("Approved — forwarded for final approval");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to approve");
    } finally {
      setApproverSaving(false);
    }
  }

  async function handleFinalApproveWO() {
    setFinalSaving(true);
    try {
      const res = await apiClient.patch(`/work-orders/${wo._id}/final-approve`, { remarks: finalRemarks });
      onUpdated(res.data.workOrder as T);
      toast.success("Final approval granted — work order locked");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to grant final approval");
    } finally {
      setFinalSaving(false);
    }
  }

  async function handleSendBackWO() {
    if (!sendBackReason.trim()) return;
    setSendBackSaving(true);
    try {
      const res = await apiClient.patch(`/work-orders/${wo._id}/send-back`, { reason: sendBackReason });
      onUpdated(res.data.workOrder as T);
      toast.success("Sent back to maker");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to send back");
    } finally {
      setSendBackSaving(false);
    }
  }

  // Inline (never a popup) action panel — exactly one state at a time, driven
  // by approvalStatus + the logged-in user's work-orders permissions.
  function renderWorkflowAction(): ReactNode {
    if (wo.status === "cancelled") {
      return <MutedText text={`This work order was cancelled${wo.cancelReason ? ` (${wo.cancelReason})` : ""} — no further approval action is possible.`} />;
    }
    if (sendingBack) {
      return (
        <ActionPanel background="#FEF2F2">
          <div className="font-bold text-[13px] mb-2" style={{ color: "#DC2626" }}>Send Back to Maker</div>
          <Field textarea rows={3} placeholder="Explain what needs to be corrected…" value={sendBackReason} onChange={(e) => setSendBackReason(e.target.value)} />
          <div className="flex gap-2 mt-2.5">
            <Btn color="red" loading={sendBackSaving} disabled={!sendBackReason.trim()} onClick={handleSendBackWO} label="Confirm Send Back" />
            <Btn outline onClick={() => { setSendingBack(false); setSendBackReason(""); }} label="Cancel" />
          </div>
        </ActionPanel>
      );
    }

    switch (wo.approvalStatus) {
      case "draft":
      case "sent-back": {
        if (!hasPerm(user, "maker")) {
          return <MutedText text={`Awaiting Maker to ${wo.approvalStatus === "sent-back" ? "revise and resubmit" : "submit"} this work order.`} />;
        }
        return (
          <ActionPanel>
            <div className="font-bold text-[13px] mb-2 text-primary">
              {wo.approvalStatus === "sent-back" ? "Resubmit for Checker Review" : "Submit for Checker Review"}
            </div>
            <Field textarea rows={2} placeholder="Remarks (optional)" value={submitRemarks} onChange={(e) => setSubmitRemarks(e.target.value)} />
            <div className="mt-2.5">
              <Btn color="primary" loading={submitSaving} onClick={handleSubmitWO} label="Submit" />
            </div>
          </ActionPanel>
        );
      }

      case "pending-checker": {
        if (!hasPerm(user, "checker")) return <MutedText text="Awaiting Checker Verification." />;
        return (
          <ActionPanel>
            <div className="font-bold text-[13px] mb-2" style={{ color: "#2563EB" }}>Checker Verification</div>
            <Field textarea rows={2} placeholder="Remarks (optional)" value={checkerRemarks} onChange={(e) => setCheckerRemarks(e.target.value)} />
            <div className="flex gap-2 mt-2.5">
              <Btn color="green" loading={checkerSaving} onClick={handleCheckerApproveWO} label="Verify & Approve" />
              <Btn color="red" onClick={() => setSendingBack(true)} label="Send Back" />
            </div>
          </ActionPanel>
        );
      }

      case "pending-approver": {
        if (!hasPerm(user, "approver")) return <MutedText text="Awaiting Approver Approval." />;
        return (
          <ActionPanel>
            <div className="font-bold text-[13px] mb-2" style={{ color: "#D97706" }}>Approver Approval</div>
            <Field textarea rows={2} placeholder="Remarks (optional)" value={approverRemarks} onChange={(e) => setApproverRemarks(e.target.value)} />
            <div className="flex gap-2 mt-2.5">
              <Btn color="green" loading={approverSaving} onClick={handleApproverApproveWO} label="Verify & Approve" />
              <Btn color="red" onClick={() => setSendingBack(true)} label="Send Back" />
            </div>
          </ActionPanel>
        );
      }

      case "pending-final": {
        if (!hasPerm(user, "ceo-approve")) return <MutedText text="Awaiting Final (CEO/Owner) Approval." />;
        return (
          <ActionPanel>
            <div className="font-bold text-[13px] mb-2" style={{ color: "#7C3AED" }}>Final Approval</div>
            <Field textarea rows={2} placeholder="Remarks (optional)" value={finalRemarks} onChange={(e) => setFinalRemarks(e.target.value)} />
            <div className="flex gap-2 mt-2.5">
              <Btn color="purple" loading={finalSaving} onClick={handleFinalApproveWO} label="Final Approval" />
              <Btn color="red" onClick={() => setSendingBack(true)} label="Send Back" />
            </div>
          </ActionPanel>
        );
      }

      case "approved":
        return (
          <div className="mt-3.5">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold rounded-full" style={{ color: "#16A34A", background: "#F0FDF4", border: "1px solid #86EFAC", padding: "5px 14px" }}>
              <Check className="w-3.5 h-3.5" /> Approved · Locked
            </span>
          </div>
        );

      default:
        return null;
    }
  }

  const stageInfo = currentStageLabel(wo);

  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-200 dark:border-gray-700/40" style={{ padding: "18px 20px" }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
          Live Workflow
        </div>
        <div className="text-[13px] font-bold rounded-full" style={{ padding: "5px 14px", color: stageInfo.color, background: stageInfo.bg, border: `1px solid ${stageInfo.color}` }}>
          {stageInfo.text}
        </div>
      </div>

      <div className="mb-4.5">
        <Steps items={buildApprovalSteps()} />
      </div>

      <div className="border-t border-gray-100 dark:border-gray-700/40 pt-3.5">
        <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2.5">
          Workflow Timeline
        </div>
        <ApprovalTimeline history={wo.approvalHistory || []} actorLabel={actorLabel} />
      </div>

      {!readOnly && renderWorkflowAction()}
    </div>
  );
}
