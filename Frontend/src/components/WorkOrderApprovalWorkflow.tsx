import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import apiClient from "../services/apiClient";
import { useAuth } from "../context/AuthContext";
import type { AuthUser } from "../context/AuthContext";
import Btn from "../ui/Btn";
import Field from "../ui/Field";
import Badge from "../ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "../ui/Table";

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
  // Snapshotted from the acting user at the moment of this event — preferred
  // over the `by` id lookup below since it's locked in even if that user's
  // name/role later changes. Absent on records created before this field
  // existed, which keep falling back to the id-lookup/hardcoded label below.
  byName?: string;
  byRole?: string;
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
// Human-facing role titles for the approval table (matches how this org
// actually refers to these sign-offs).
const TABLE_ROLE_LABEL: Record<ApprovalStage, string> = {
  maker: "Maker (L1)", checker: "AGM (L2)", approver: "GM (L3)", final: "Director (L4)",
};

function MutedText({ text }: { text: string }) {
  return (
    <div
      className="mt-3.5 rounded-lg text-gray-400 dark:text-gray-500 text-[12.5px] bg-gray-50 dark:bg-gray-800/40 border border-dashed border-gray-200 dark:border-gray-700/40"
      style={{ padding: "10px 14px" }}
    >
      {text}
    </div>
  );
}

function ActionPanel({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return (
    <div
      className={[
        "rounded-[10px] mt-3.5 border",
        danger
          ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30"
          : "bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/40",
      ].join(" ")}
      style={{ padding: "14px 16px" }}
    >
      {children}
    </div>
  );
}

// A work order can cycle through submit → send-back → resubmit → approve
// multiple times. `approvalHistory` is a flat, append-only log of every event
// across every cycle — this groups it back into cycles (one row per
// submit-to-resolution pass) so the table below reads as "cycle 1's approvals,
// then cycle 2's approvals" instead of one blurred-together list.
// `reopened` events (only possible via a post-unlock edit, not a send-back)
// are a rare edge case — they aren't given their own cycle boundary here; that
// cycle's next 'maker'+'submitted' entry (from resubmitting) still opens the
// next row normally.
interface ApprovalCycle {
  maker?: ApprovalHistoryEntry;
  checker?: ApprovalHistoryEntry;
  approver?: ApprovalHistoryEntry;
  final?: ApprovalHistoryEntry;
  sentBack?: ApprovalHistoryEntry;
}

function groupIntoCycles(history: ApprovalHistoryEntry[]): ApprovalCycle[] {
  const cycles: ApprovalCycle[] = [];
  let current: ApprovalCycle | null = null;
  for (const entry of history) {
    if (entry.stage === "maker" && entry.action === "submitted") {
      current = { maker: entry };
      cycles.push(current);
    } else if (current) {
      if (entry.action === "sent-back") current.sentBack = entry;
      else current[entry.stage] = entry;
    }
  }
  return cycles;
}

function CycleCell({
  action, entry, actorLabel, roleLabel,
}: { action: "submitted" | "approved" | "sent-back"; entry: ApprovalHistoryEntry; actorLabel: (by: ActorRef | undefined, roleFallback: string, at?: string | null, byName?: string, byRole?: string) => string; roleLabel: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-[130px]">
      <div className="text-[12.5px] font-bold text-gray-900 dark:text-[#F1F5F9]">{actorLabel(entry.by, roleLabel, entry.at, entry.byName, entry.byRole)}</div>
      {entry.byName && entry.byRole && <div className="text-[10.5px] text-gray-400 uppercase tracking-wide">{entry.byRole}</div>}
      {entry.at && <div className="text-[11px] text-gray-400">{dayjs(entry.at).format("DD MMM YYYY, hh:mm A")}</div>}
      <div>
        {action === "sent-back" ? <Badge color="red" small>Sent Back</Badge> : action === "submitted" ? <Badge color="blue" small>Initiated</Badge> : <Badge color="green" small>Approved</Badge>}
      </div>
      {entry.remarks && (
        <div className={`text-[11px] italic ${action === "sent-back" ? "text-red-600 dark:text-red-400" : "text-gray-400"}`}>
          "{entry.remarks}"
        </div>
      )}
    </div>
  );
}

// Replaces the old vertical timeline — same underlying data (approvalHistory),
// but organized as one row per submit→resolution cycle instead of one flat
// event list, so a sent-back-and-resubmitted work order shows its prior
// cycle's approvals and its new cycle's approvals as clearly separate rows.
function ApprovalCyclesTable({ history, actorLabel }: { history: ApprovalHistoryEntry[]; actorLabel: (by: ActorRef | undefined, roleFallback: string, at?: string | null, byName?: string, byRole?: string) => string }) {
  const cycles = groupIntoCycles(history);
  if (cycles.length === 0) {
    return <div className="text-[12.5px] text-gray-400">No workflow activity yet.</div>;
  }
  return (
    <Table>
      <Thead>
        <Tr>
          <Th>Cycle</Th>
          {STAGE_ORDER.map(stage => <Th key={stage}>{TABLE_ROLE_LABEL[stage]}</Th>)}
        </Tr>
      </Thead>
      <Tbody>
        {cycles.map((cycle, i) => (
          <Tr key={i}>
            <Td className="align-top text-[12.5px] font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">
              #{i + 1}{i === cycles.length - 1 && <div className="text-[10px] font-bold text-primary uppercase mt-0.5">Current</div>}
            </Td>
            {STAGE_ORDER.map(stage => {
              if (stage === "maker") {
                return (
                  <Td key={stage} className="align-top">
                    {cycle.maker ? <CycleCell action="submitted" entry={cycle.maker} actorLabel={actorLabel} roleLabel={TABLE_ROLE_LABEL.maker} /> : <span className="text-gray-300">—</span>}
                  </Td>
                );
              }
              const approved = cycle[stage];
              const rejectedHere = cycle.sentBack?.stage === stage ? cycle.sentBack : undefined;
              return (
                <Td key={stage} className="align-top">
                  {approved ? (
                    <CycleCell action="approved" entry={approved} actorLabel={actorLabel} roleLabel={TABLE_ROLE_LABEL[stage]} />
                  ) : rejectedHere ? (
                    <CycleCell action="sent-back" entry={rejectedHere} actorLabel={actorLabel} roleLabel={TABLE_ROLE_LABEL[stage]} />
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </Td>
              );
            })}
          </Tr>
        ))}
      </Tbody>
    </Table>
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
  function actorLabel(by: ActorRef | undefined, roleFallback: string, at?: string | null, byName?: string, byRole?: string): string {
    // Real, historically-snapshotted name — preferred whenever present, ahead
    // of the id-lookup/hardcoded-guess fallbacks below (which only exist for
    // approval records logged before byName/byRole started being captured).
    if (byName) return byName;
    void byRole; // rendered separately by CycleCell, alongside this label

    const uid = idOf(by);
    const resolvedName = uid ? (userMap[uid] || (typeof by === "object" ? (by as any)?.name : undefined)) : undefined;

    if (!uid) return roleFallback;
    if (user?.id && uid === user.id) return "You";
    return resolvedName || roleFallback;
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
        <ActionPanel danger>
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

  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-200 dark:border-gray-700/40" style={{ padding: "18px 20px" }}>
      <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2.5">
        Approval Workflow &amp; Signatures
      </div>
      <ApprovalCyclesTable history={wo.approvalHistory || []} actorLabel={actorLabel} />

      {!readOnly && renderWorkflowAction()}
    </div>
  );
}
