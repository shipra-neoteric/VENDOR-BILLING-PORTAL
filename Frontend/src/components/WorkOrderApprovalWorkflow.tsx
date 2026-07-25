import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button, Input, Steps, message } from "antd";
import { CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled } from "@ant-design/icons";
import dayjs from "dayjs";
import apiClient from "../services/apiClient";
import { useAuth } from "../context/AuthContext";
import type { AuthUser } from "../context/AuthContext";

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

const actionPanelStyle: React.CSSProperties = {
  border: "1px solid #E5E7EB", borderRadius: 10, padding: "14px 16px", marginTop: 14, background: "#F9FAFB",
};

function MutedText({ text }: { text: string }) {
  return (
    <div style={{ marginTop: 14, padding: "10px 14px", background: "#F9FAFB", border: "1px dashed #E5E7EB", borderRadius: 8, color: "#9CA3AF", fontSize: 12.5 }}>
      {text}
    </div>
  );
}

// Vertical, append-only timeline built directly from approvalHistory — a work
// order can cycle through submit → send-back → resubmit → approve multiple
// times, so this renders every entry (oldest first), not just the latest state.
function ApprovalTimeline({ history, actorLabel }: { history: ApprovalHistoryEntry[]; actorLabel: (by: ActorRef | undefined, roleFallback: string) => string }) {
  if (!history || history.length === 0) {
    return <div style={{ fontSize: 12.5, color: "#9CA3AF" }}>No workflow activity yet.</div>;
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
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flexShrink: 0, textAlign: "center" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: bg, border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color }}>
                {isReject ? "✕" : isReopened ? "↺" : isApprove ? "✓" : "●"}
              </div>
              {i < history.length - 1 && <div style={{ width: 2, height: 30, background: "#E5E7EB", margin: "2px auto" }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                {isReopened ? actorLabel(h.by, roleLabel) : roleLabel} {verb}
                {!isReopened && (
                  <span style={{ fontWeight: 400, color: "#9CA3AF", marginLeft: 8, fontSize: 12 }}>
                    {actorLabel(h.by, roleLabel)}{h.at ? ` · ${dayjs(h.at).format("DD MMM YYYY, hh:mm A")}` : ""}
                  </span>
                )}
                {isReopened && h.at && (
                  <span style={{ fontWeight: 400, color: "#9CA3AF", marginLeft: 8, fontSize: 12 }}>
                    · {dayjs(h.at).format("DD MMM YYYY, hh:mm A")}
                  </span>
                )}
              </div>
              {h.remarks && (
                <div style={{ fontSize: 12.5, color: isReject ? "#B91C1C" : isReopened ? "#92400E" : "#6B7280", marginTop: 4, background: isReject ? "#FEF2F2" : isReopened ? "#FFFBEB" : "#F9FAFB", border: `1px solid ${isReject ? "#FCA5A5" : isReopened ? "#FDE68A" : "#E5E7EB"}`, borderRadius: 6, padding: "6px 10px" }}>
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
  workOrder, onUpdated,
}: {
  workOrder: T;
  onUpdated: (updated: T) => void;
}) {
  const { user } = useAuth();
  const wo = workOrder;

  // Best-effort id → name lookup for approvalHistory/maker/checker/approver/
  // finalApprovedBy — none of those come back populated from the backend, and
  // /auth/users itself is only reachable for owner/gm/accounts (or explicit
  // user-management:view perm), so this silently no-ops for anyone else and
  // falls back to a role label instead of fabricating a name.
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

  function buildApprovalSteps(): { title: string; description?: string; icon: ReactNode; status: "wait" | "process" | "finish" | "error" }[] {
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
      let status: "wait" | "process" | "finish" | "error" = "wait";
      if (rejectedIdx !== null && idx === rejectedIdx) status = "error";
      else if (idx < currentIdx) status = "finish";
      else if (idx === currentIdx) status = "process";

      let icon: ReactNode = <span style={{ fontWeight: 700 }}>{idx + 1}</span>;
      if (status === "finish") icon = <CheckCircleFilled style={{ color: "#16A34A" }} />;
      else if (status === "error") icon = <CloseCircleFilled style={{ color: "#DC2626" }} />;
      else if (status === "process") icon = <ExclamationCircleFilled style={{ color: "#D97706" }} />;

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
      message.success("Submitted — awaiting checker review");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to submit");
    } finally {
      setSubmitSaving(false);
    }
  }

  async function handleCheckerApproveWO() {
    setCheckerSaving(true);
    try {
      const res = await apiClient.patch(`/work-orders/${wo._id}/checker-approve`, { remarks: checkerRemarks });
      onUpdated(res.data.workOrder as T);
      message.success("Verified & approved — forwarded to approver");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to approve");
    } finally {
      setCheckerSaving(false);
    }
  }

  async function handleApproverApproveWO() {
    setApproverSaving(true);
    try {
      const res = await apiClient.patch(`/work-orders/${wo._id}/approver-approve`, { remarks: approverRemarks });
      onUpdated(res.data.workOrder as T);
      message.success("Approved — forwarded for final approval");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to approve");
    } finally {
      setApproverSaving(false);
    }
  }

  async function handleFinalApproveWO() {
    setFinalSaving(true);
    try {
      const res = await apiClient.patch(`/work-orders/${wo._id}/final-approve`, { remarks: finalRemarks });
      onUpdated(res.data.workOrder as T);
      message.success("Final approval granted — work order locked");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to grant final approval");
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
      message.success("Sent back to maker");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to send back");
    } finally {
      setSendBackSaving(false);
    }
  }

  // Inline (never a popup) action panel — exactly one state at a time, driven
  // by approvalStatus + the logged-in user's work-orders permissions.
  function renderWorkflowAction(): ReactNode {
    if (sendingBack) {
      return (
        <div style={{ ...actionPanelStyle, background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#DC2626", marginBottom: 8 }}>Send Back to Maker</div>
          <Input.TextArea
            rows={3}
            placeholder="Explain what needs to be corrected…"
            value={sendBackReason}
            onChange={(e) => setSendBackReason(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Button danger type="primary" loading={sendBackSaving} disabled={!sendBackReason.trim()} onClick={handleSendBackWO}>
              Confirm Send Back
            </Button>
            <Button onClick={() => { setSendingBack(false); setSendBackReason(""); }}>Cancel</Button>
          </div>
        </div>
      );
    }

    switch (wo.approvalStatus) {
      case "draft":
      case "sent-back": {
        if (!hasPerm(user, "maker")) {
          return <MutedText text={`Awaiting Maker to ${wo.approvalStatus === "sent-back" ? "revise and resubmit" : "submit"} this work order.`} />;
        }
        return (
          <div style={actionPanelStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#FF7A00", marginBottom: 8 }}>
              {wo.approvalStatus === "sent-back" ? "Resubmit for Checker Review" : "Submit for Checker Review"}
            </div>
            <Input.TextArea rows={2} placeholder="Remarks (optional)" value={submitRemarks} onChange={(e) => setSubmitRemarks(e.target.value)} />
            <div style={{ marginTop: 10 }}>
              <Button type="primary" style={{ background: "#FF7A00", borderColor: "#FF7A00" }} loading={submitSaving} onClick={handleSubmitWO}>
                Submit
              </Button>
            </div>
          </div>
        );
      }

      case "pending-checker": {
        if (!hasPerm(user, "checker")) return <MutedText text="Awaiting Checker Verification." />;
        return (
          <div style={actionPanelStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#2563EB", marginBottom: 8 }}>Checker Verification</div>
            <Input.TextArea rows={2} placeholder="Remarks (optional)" value={checkerRemarks} onChange={(e) => setCheckerRemarks(e.target.value)} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Button type="primary" style={{ background: "#16A34A", borderColor: "#16A34A" }} loading={checkerSaving} onClick={handleCheckerApproveWO}>
                Verify & Approve
              </Button>
              <Button danger onClick={() => setSendingBack(true)}>Send Back</Button>
            </div>
          </div>
        );
      }

      case "pending-approver": {
        if (!hasPerm(user, "approver")) return <MutedText text="Awaiting Approver Approval." />;
        return (
          <div style={actionPanelStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#D97706", marginBottom: 8 }}>Approver Approval</div>
            <Input.TextArea rows={2} placeholder="Remarks (optional)" value={approverRemarks} onChange={(e) => setApproverRemarks(e.target.value)} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Button type="primary" style={{ background: "#16A34A", borderColor: "#16A34A" }} loading={approverSaving} onClick={handleApproverApproveWO}>
                Verify & Approve
              </Button>
              <Button danger onClick={() => setSendingBack(true)}>Send Back</Button>
            </div>
          </div>
        );
      }

      case "pending-final": {
        if (!hasPerm(user, "ceo-approve")) return <MutedText text="Awaiting Final (CEO/Owner) Approval." />;
        return (
          <div style={actionPanelStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#7C3AED", marginBottom: 8 }}>Final Approval</div>
            <Input.TextArea rows={2} placeholder="Remarks (optional)" value={finalRemarks} onChange={(e) => setFinalRemarks(e.target.value)} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Button type="primary" style={{ background: "#7C3AED", borderColor: "#7C3AED" }} loading={finalSaving} onClick={handleFinalApproveWO}>
                Final Approval
              </Button>
              <Button danger onClick={() => setSendingBack(true)}>Send Back</Button>
            </div>
          </div>
        );
      }

      case "approved":
        return (
          <div style={{ marginTop: 14 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#16A34A", background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 20, padding: "5px 14px" }}>
              ✓ Approved · Locked
            </span>
          </div>
        );

      default:
        return null;
    }
  }

  const stageInfo = currentStageLabel(wo);

  return (
    <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          Live Workflow
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, padding: "5px 14px", borderRadius: 20, color: stageInfo.color, background: stageInfo.bg, border: `1px solid ${stageInfo.color}` }}>
          {stageInfo.text}
        </div>
      </div>

      <div className="wo-steps" style={{ marginBottom: 18 }}>
        <style>{`
          .wo-steps .ant-steps-item-title, .wo-steps .ant-steps-item-description {
            word-break: keep-all; overflow-wrap: normal; white-space: normal;
          }
        `}</style>
        <Steps size="small" items={buildApprovalSteps()} />
      </div>

      <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
          Workflow Timeline
        </div>
        <ApprovalTimeline history={wo.approvalHistory || []} actorLabel={actorLabel} />
      </div>

      {renderWorkflowAction()}
    </div>
  );
}
