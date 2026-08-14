import { useEffect, useState } from "react";
import { Check, X, Paperclip, FileText } from "lucide-react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import apiClient from "../services/apiClient";
import { uploadToCloudinary } from "../utils/cloudinaryUpload";
import { useAuth } from "../context/AuthContext";
import Steps from "../ui/Steps";
import type { StepItem } from "../ui/Steps";
import Btn from "../ui/Btn";
import Field from "../ui/Field";
import SField from "../ui/SField";
import { DatePicker } from "../ui/DatePicker";
import type { DrawingRequest, DrawingReviewHistoryEntry } from "../shared/constants/drawingRequestOptions";

const STAGE_ORDER = ["dri", "l1-gm", "l2-architect", "l3-gm", "l4-gm"] as const;
const STAGE_TITLE: Record<(typeof STAGE_ORDER)[number], string> = {
  dri: "Requested", "l1-gm": "GM Screening (L1)", "l2-architect": "Architect Drawing (L2)",
  "l3-gm": "GM Cross-Check (L3)", "l4-gm": "GM Final Approval (L4)",
};
const RETURN_STAGE_LABEL: Record<string, string> = {
  "l1-gm": "GM (L1)", "l3-gm": "GM (L3)", "l4-gm": "GM (L4)",
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

function DrawingFileList({ files }: { files: { name: string; url: string }[] }) {
  if (!files || files.length === 0) return null;
  return (
    <div className="mt-3.5 border-t border-gray-100 dark:border-gray-700/40 pt-3.5">
      <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Uploaded Drawing(s)</div>
      <div className="flex flex-col gap-1.5">
        {files.map((f, i) => (
          <a
            key={i} href={f.url} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 text-[13px] font-medium text-primary hover:underline"
          >
            <FileText className="w-3.5 h-3.5 shrink-0" /> {f.name || `Drawing ${i + 1}`}
          </a>
        ))}
      </div>
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
        const isApprove = h.action === "forwarded" || h.action === "approved" || h.action === "submitted";
        const color = isReturn ? "#DC2626" : isApprove ? "#16A34A" : "#2563EB";
        const bg    = isReturn ? "#FEF2F2" : isApprove ? "#F0FDF4" : "#EFF6FF";
        const verb =
          h.action === "forwarded"   ? "forwarded it on" :
          h.action === "submitted"   ? "submitted the drawing" :
          h.action === "approved"    ? "approved" :
          h.action === "returned"    ? "sent it back" :
          "resubmitted for review";
        const roleLabel =
          h.stage === "l1-gm" ? "GM (L1)" : h.stage === "l2-architect" ? "Architect (L2)" :
          h.stage === "l3-gm" ? "GM (L3)" : h.stage === "l4-gm" ? "GM (L4)" : "DRI";
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
// 5-step stepper (Requested → L1 GM Screening → L2 Architect Drawing → L3 GM
// Cross-Check → L4 GM Final Approval, Approved being the stepper's implicit
// end state), append-only timeline, and an inline action panel driven by
// reviewStatus + the logged-in user's drawing-requests permissions. Who may
// act at L1/L3/L4 is NOT role-based (both current GMs share role 'gm') — it's
// whichever of l1-review/l3-review/l4-approve is individually granted via
// User Management, same mechanism as l2-draw for the Architect stage.
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
  const [l1Remarks, setL1Remarks]     = useState("");
  const [l1Saving, setL1Saving]       = useState(false);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [l2Saving, setL2Saving]       = useState(false);

  const [l3Remarks, setL3Remarks]     = useState("");
  const [l3Saving, setL3Saving]       = useState(false);

  const [priority, setPriority]       = useState(dr.priority || "");
  const [l4Remarks, setL4Remarks]     = useState("");
  const [l4Saving, setL4Saving]       = useState(false);

  const [returning, setReturning]     = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnSaving, setReturnSaving] = useState(false);

  const [resubmitRemarks, setResubmitRemarks] = useState("");
  const [resubmitSaving, setResubmitSaving]   = useState(false);

  useEffect(() => {
    setReturning(false);
    setReturnReason("");
    setL1Remarks("");
    setSelectedFiles([]);
    setL3Remarks("");
    setL4Remarks("");
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
      case "l1-gm":        return { text: "Waiting for GM Screening (L1)",   color: "#D97706", bg: "#FFFBEB" };
      case "l2-architect": return { text: "Waiting for Architect's Drawing", color: "#2563EB", bg: "#EFF6FF" };
      case "l3-gm":        return { text: "Waiting for GM Cross-Check (L3)", color: "#7C3AED", bg: "#F5F3FF" };
      case "l4-gm":        return { text: "Waiting for GM Final Approval (L4)", color: "#0D9488", bg: "#F0FDFA" };
      case "approved":     return { text: "Approved",                         color: "#16A34A", bg: "#F0FDF4" };
      case "returned": {
        const last = [...(dr.reviewHistory || [])].reverse().find((h) => h.action === "returned");
        const by = (last && RETURN_STAGE_LABEL[last.stage]) || "GM";
        return { text: `Returned by ${by} — Revise & Resubmit`, color: "#DC2626", bg: "#FEF2F2" };
      }
      default: return { text: "Approved", color: "#16A34A", bg: "#F0FDF4" };
    }
  }

  function buildSteps(): StepItem[] {
    const STAGE_INDEX: Record<string, number> = { "l1-gm": 1, "l2-architect": 2, "l3-gm": 3, "l4-gm": 4 };
    let currentIdx = 0;
    if (dr.reviewStatus === "returned") {
      const last = [...(dr.reviewHistory || [])].reverse().find((h) => h.action === "returned");
      currentIdx = (last && STAGE_INDEX[last.stage]) ?? 1;
    } else if (dr.reviewStatus === "approved") {
      currentIdx = 4;
    } else {
      currentIdx = STAGE_INDEX[dr.reviewStatus] ?? 1;
    }

    const isApproved = dr.reviewStatus === "approved";
    return STAGE_ORDER.map((stage, idx) => {
      let status: StepItem["status"] = "wait";
      if (dr.reviewStatus === "returned" && idx === currentIdx) status = "error";
      else if (idx < currentIdx || (idx === 4 && isApproved)) status = "finish";
      else if (idx === currentIdx && !isApproved) status = "process";
      else if (idx <= currentIdx) status = "finish";

      let icon: React.ReactNode;
      if (status === "finish") icon = <Check className="w-3.5 h-3.5" style={{ color: "#16A34A" }} />;
      else if (status === "error") icon = <X className="w-3.5 h-3.5" style={{ color: "#DC2626" }} />;

      let description: string | undefined;
      if (stage === "dri") description = `${dr.driName} · ${dayjs(dr.createdAt).format("DD MMM YYYY")}`;
      if (stage === "l1-gm" && (idx < currentIdx || isApproved)) {
        const h = dr.reviewHistory?.find((e) => e.stage === "l1-gm" && e.action === "forwarded");
        if (h) description = `${actorLabel(h.by)} · ${dayjs(h.at).format("DD MMM YYYY")}`;
      }
      if (stage === "l2-architect" && (idx < currentIdx || isApproved)) {
        const h = [...(dr.reviewHistory || [])].reverse().find((e) => e.stage === "l2-architect" && e.action === "submitted");
        if (h) description = `${actorLabel(h.by)} · ${dayjs(h.at).format("DD MMM YYYY")}`;
      }
      if (stage === "l3-gm" && (idx < currentIdx || isApproved)) {
        const h = dr.reviewHistory?.find((e) => e.stage === "l3-gm" && e.action === "forwarded");
        if (h) description = `${actorLabel(h.by)} · ${dayjs(h.at).format("DD MMM YYYY")}`;
      }
      if (stage === "l4-gm" && isApproved) {
        const h = dr.reviewHistory?.find((e) => e.stage === "l4-gm" && e.action === "approved");
        if (h) description = `${actorLabel(h.by)} · ${dayjs(h.at).format("DD MMM YYYY")}`;
      }

      return { title: STAGE_TITLE[stage], description, icon, status };
    });
  }

  async function handleL1Approve() {
    setL1Saving(true);
    try {
      const res = await apiClient.patch(`/drawing-requests/${dr._id}/l1-review`, {
        action: "approve", assignedTo: assignedTo || null, committedDate: committedDate || null, remarks: l1Remarks,
      });
      onUpdated(res.data.request as DrawingRequest);
      toast.success("Forwarded to Architect");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to forward");
    } finally {
      setL1Saving(false);
    }
  }

  async function handleL2Submit() {
    if (selectedFiles.length === 0) return;
    setL2Saving(true);
    try {
      const drawingFiles = [];
      for (const file of selectedFiles) {
        const url = await uploadToCloudinary(apiClient, file, "drawing-requests", file.name);
        drawingFiles.push({ name: file.name, url });
      }
      const res = await apiClient.patch(`/drawing-requests/${dr._id}/l2-drawing`, { drawingFiles });
      onUpdated(res.data.request as DrawingRequest);
      setSelectedFiles([]);
      toast.success("Drawing submitted for GM cross-check");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to submit drawing");
    } finally {
      setL2Saving(false);
    }
  }

  async function handleL3Approve() {
    setL3Saving(true);
    try {
      const res = await apiClient.patch(`/drawing-requests/${dr._id}/l3-review`, { action: "approve", remarks: l3Remarks });
      onUpdated(res.data.request as DrawingRequest);
      toast.success("Forwarded to final approval");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to forward");
    } finally {
      setL3Saving(false);
    }
  }

  async function handleL4Approve() {
    setL4Saving(true);
    try {
      const res = await apiClient.patch(`/drawing-requests/${dr._id}/l4-review`, { action: "approve", priority: priority || undefined, remarks: l4Remarks });
      onUpdated(res.data.request as DrawingRequest);
      toast.success("Approved");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to approve");
    } finally {
      setL4Saving(false);
    }
  }

  async function handleReturn() {
    if (!returnReason.trim()) return;
    setReturnSaving(true);
    const endpoint = dr.reviewStatus === "l4-gm" ? "l4-review" : dr.reviewStatus === "l3-gm" ? "l3-review" : "l1-review";
    try {
      const res = await apiClient.patch(`/drawing-requests/${dr._id}/${endpoint}`, { action: "return", remarks: returnReason });
      onUpdated(res.data.request as DrawingRequest);
      toast.success(endpoint === "l1-review" ? "Returned to DRI" : "Sent back to Architect for rework");
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
      toast.success("Resubmitted for review");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to resubmit");
    } finally {
      setResubmitSaving(false);
    }
  }

  function renderAction(): React.ReactNode {
    if (returning) {
      const label = dr.reviewStatus === "l1-gm" ? "Return to DRI" : "Send Back to Architect for Rework";
      return (
        <ActionPanel background="#FEF2F2">
          <div className="font-bold text-[13px] mb-2" style={{ color: "#DC2626" }}>{label}</div>
          <Field textarea rows={3} placeholder="Explain what needs to be corrected…" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
          <div className="flex gap-2 mt-2.5">
            <Btn color="red" loading={returnSaving} disabled={!returnReason.trim()} onClick={handleReturn} label="Confirm" />
            <Btn outline onClick={() => { setReturning(false); setReturnReason(""); }} label="Cancel" />
          </div>
        </ActionPanel>
      );
    }

    switch (dr.reviewStatus) {
      case "l1-gm": {
        if (!hasPerm(user, "l1-review")) return <MutedText text="Awaiting GM Screening (L1) — is this drawing needed?" />;
        return (
          <ActionPanel>
            <div className="font-bold text-[13px] mb-2" style={{ color: "#D97706" }}>GM Screening (L1)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-2.5">
              <SField label="Assign Architect (optional)" placeholder="Choose" value={assignedTo || null} onChange={setAssignedTo} options={userOptions} />
              <DatePicker label="Committed Date (optional)" value={committedDate} onChange={setCommittedDate} />
            </div>
            <Field textarea rows={2} placeholder="Remarks (optional)" value={l1Remarks} onChange={(e) => setL1Remarks(e.target.value)} />
            <div className="flex gap-2 mt-2.5">
              <Btn color="green" loading={l1Saving} onClick={handleL1Approve} label="Yes — Forward to Architect" />
              <Btn color="red" onClick={() => setReturning(true)} label="Not Needed — Return to DRI" />
            </div>
          </ActionPanel>
        );
      }

      case "l2-architect": {
        if (!hasPerm(user, "l2-draw")) return <MutedText text="Awaiting the Architect's drawing." />;
        return (
          <ActionPanel>
            <div className="font-bold text-[13px] mb-2" style={{ color: "#2563EB" }}>Architect Drawing (L2)</div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 cursor-pointer hover:border-primary transition-colors">
              <Paperclip className="w-4 h-4 shrink-0" />
              {selectedFiles.length > 0 ? `${selectedFiles.length} file(s) selected` : "Attach drawing file(s) — elevation, section, etc."}
              <input type="file" multiple className="hidden" onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))} />
            </label>
            {selectedFiles.length > 0 && (
              <ul className="mt-2 text-xs text-gray-500 dark:text-gray-400 list-disc pl-5">
                {selectedFiles.map((f, i) => <li key={i}>{f.name}</li>)}
              </ul>
            )}
            <div className="flex gap-2 mt-2.5">
              <Btn color="primary" loading={l2Saving} disabled={selectedFiles.length === 0} onClick={handleL2Submit} label="Submit Drawing" />
            </div>
          </ActionPanel>
        );
      }

      case "l3-gm": {
        if (!hasPerm(user, "l3-review")) return <MutedText text="Awaiting GM Cross-Check (L3)." />;
        return (
          <ActionPanel>
            <div className="font-bold text-[13px] mb-2" style={{ color: "#7C3AED" }}>GM Cross-Check (L3)</div>
            <Field textarea rows={2} placeholder="Remarks (optional)" value={l3Remarks} onChange={(e) => setL3Remarks(e.target.value)} />
            <div className="flex gap-2 mt-2.5">
              <Btn color="purple" loading={l3Saving} onClick={handleL3Approve} label="Approve — Forward to Final Approval" />
              <Btn color="red" onClick={() => setReturning(true)} label="Send Back for Rework" />
            </div>
          </ActionPanel>
        );
      }

      case "l4-gm": {
        if (!hasPerm(user, "l4-approve")) return <MutedText text="Awaiting GM Final Approval (L4)." />;
        return (
          <ActionPanel>
            <div className="font-bold text-[13px] mb-2" style={{ color: "#0D9488" }}>GM Final Approval (L4)</div>
            <div className="flex flex-col gap-2.5">
              <SField
                label="Priority (optional)" placeholder="Choose" value={priority || null} onChange={setPriority}
                options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }]}
              />
              <Field textarea rows={2} placeholder="Remarks (optional)" value={l4Remarks} onChange={(e) => setL4Remarks(e.target.value)} />
            </div>
            <div className="flex gap-2 mt-2.5">
              <Btn color="dark" loading={l4Saving} onClick={handleL4Approve} label="Approve" style={{ background: "#0D9488" }} />
              <Btn color="red" onClick={() => setReturning(true)} label="Send Back for Rework" />
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
            <div className="font-bold text-[13px] mb-2 text-primary">Resubmit for Review</div>
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
              <Check className="w-3.5 h-3.5" /> Approved — ready for physical dispatch to site
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

      <DrawingFileList files={dr.drawingFiles || []} />

      <div className="border-t border-gray-100 dark:border-gray-700/40 pt-3.5 mt-3.5">
        <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2.5">Review Timeline</div>
        <ReviewTimeline history={dr.reviewHistory || []} actorLabel={actorLabel} />
      </div>

      {!readOnly && renderAction()}
    </div>
  );
}
