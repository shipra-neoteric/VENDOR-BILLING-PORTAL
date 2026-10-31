import { useState } from "react";
import { Plus, Trash2, ListPlus } from "lucide-react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import apiClient from "../services/apiClient";
import { useAuth } from "../context/AuthContext";
import type { AuthUser } from "../context/AuthContext";
import Btn from "../ui/Btn";
import Card from "../ui/Card";
import Field from "../ui/Field";
import Modal from "../ui/Modal";
import Badge from "../ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "../ui/Table";
import type { WorkOrder, WorkOrderAddendum } from "../types/VendorBilling";

// "Add Scope": extra work for the same site + vendor + category goes onto this work order as an
// addendum that travels the same approval chain. While it is pending the work order stays approved
// and billable; final approval adds the new items and raises the contract value.

const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const OPEN = ["pending-checker", "pending-approver", "pending-final"];
const STATUS_LABEL: Record<WorkOrderAddendum["status"], { label: string; color: "amber" | "blue" | "green" | "red" }> = {
  "pending-checker": { label: "Awaiting checker", color: "amber" },
  "pending-approver": { label: "Awaiting approver", color: "amber" },
  "pending-final": { label: "Awaiting final approval", color: "blue" },
  approved: { label: "Approved", color: "green" },
  "sent-back": { label: "Sent back", color: "red" },
};
const NEXT_ACTION: Record<string, { path: string; action: string; label: string }> = {
  "pending-checker": { path: "checker-approve", action: "checker", label: "Approve as checker" },
  "pending-approver": { path: "approver-approve", action: "approver", label: "Approve as approver" },
  "pending-final": { path: "final-approve", action: "ceo-approve", label: "Give final approval" },
};

// Owner / CEO can act at every stage; anyone else needs the stage's own work-orders grant. The server
// re-checks all of this (permissions, department, segregation of duties) — this only decides what to show.
function can(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  if (user.role === "owner" || user.role === "CEO") return true;
  return !!user.permissions?.find((p) => p.module === "work-orders")?.actions.includes(action);
}

interface DraftItem { description: string; unit: string; plannedQty: string; rate: string; gstPercent: string; plannedStart: string; plannedEnd: string }
const blankItem = (gst: number): DraftItem => ({ description: "", unit: "sq.ft", plannedQty: "", rate: "", gstPercent: String(gst), plannedStart: "", plannedEnd: "" });
const inputCls = "w-full h-9 px-2.5 text-[13px] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary";
const itemAmount = (d: DraftItem) => Math.round((Number(d.plannedQty) || 0) * (Number(d.rate) || 0) * 100) / 100;

export default function WorkOrderAddenda({ workOrder, onUpdated, readOnly = false }: {
  workOrder: WorkOrder;
  onUpdated?: (updated: WorkOrder) => void;
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  const wo = workOrder;
  const addenda = wo.addenda ?? [];
  const professional = wo.contractType === "professional-services";
  const hasOpen = addenda.some((a) => OPEN.includes(a.status));
  const canAdd = !readOnly && wo.approvalStatus === "approved" && wo.status !== "cancelled" && !hasOpen
    && (can(user, "create") || can(user, "maker") || can(user, "edit"));

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [items, setItems] = useState<DraftItem[]>([blankItem(wo.gstPercent ?? 18)]);
  const [saving, setSaving] = useState(false);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [backFor, setBackFor] = useState<string | null>(null);

  if (addenda.length === 0 && !canAdd) return null;

  const setItem = (i: number, patch: Partial<DraftItem>) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const total = items.reduce((s, it) => s + itemAmount(it), 0);

  function reset() {
    setOpen(false); setReason(""); setItems([blankItem(wo.gstPercent ?? 18)]);
  }

  // The server hands back the raw work-order document; the detail views read it as `{ ...wo, id }`.
  const emit = (raw: unknown) => {
    const r = raw as WorkOrder & { _id?: string };
    onUpdated?.({ ...r, id: r.id || r._id || wo.id } as WorkOrder);
  };

  async function submit() {
    if (!reason.trim()) { toast.error("Write the reason for the extra work"); return; }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.description.trim()) { toast.error(`Item ${i + 1}: description is required`); return; }
      if (!(Number(it.plannedQty) > 0)) { toast.error(`Item ${i + 1}: quantity must be above 0`); return; }
      if (!(Number(it.rate) >= 0) || it.rate === "") { toast.error(`Item ${i + 1}: enter the rate`); return; }
      if (!professional && (!it.plannedStart || !it.plannedEnd)) { toast.error(`Item ${i + 1}: start and end date are required`); return; }
    }
    setSaving(true);
    try {
      const res = await apiClient.post(`/work-orders/${wo.id}/addenda`, {
        reason: reason.trim(),
        items: items.map((it) => ({
          description: it.description.trim(), unit: it.unit.trim() || "sq.ft", plannedQty: Number(it.plannedQty), rate: Number(it.rate),
          gstPercent: Number(it.gstPercent) || 0, plannedStart: it.plannedStart || undefined, plannedEnd: it.plannedEnd || undefined,
        })),
      });
      emit(res.data.workOrder);
      toast.success(res.data.message || "Submitted for approval");
      reset();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Could not add the scope");
    } finally {
      setSaving(false);
    }
  }

  async function act(a: WorkOrderAddendum, path: string, body: Record<string, string>, okMsg: string) {
    const id = (a._id || a.id) as string;
    setBusyId(id);
    try {
      const res = await apiClient.patch(`/work-orders/${wo.id}/addenda/${id}/${path}`, body);
      emit(res.data.workOrder);
      toast.success(res.data.message || okMsg);
      setRemarks((r) => ({ ...r, [id]: "" }));
      setBackFor(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="font-bold text-[14px] text-[#1A1A2E] dark:text-[#F1F5F9]">Added scope</div>
          <div className="text-xs text-gray-400">Extra work on this work order — approved the same way, billing on the existing items carries on meanwhile.</div>
        </div>
        {canAdd && <Btn small color="primary" icon={ListPlus} label="Add Scope" onClick={() => setOpen(true)} />}
      </div>

      {addenda.length === 0 && <div className="text-sm text-gray-400 py-2">Nothing added yet.</div>}

      <div className="flex flex-col gap-3">
        {[...addenda].sort((a, b) => b.no - a.no).map((a) => {
          const id = (a._id || a.id) as string;
          const next = NEXT_ACTION[a.status];
          const myTurn = !readOnly && !!next && can(user, next.action);
          const canSendBack = !readOnly && !!next && (can(user, "checker") || can(user, "approver") || can(user, "ceo-approve"));
          const st = STATUS_LABEL[a.status];
          return (
            <div key={id} className="border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 flex-wrap px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800/40">
                <span className="font-bold">Addendum {a.no}</span>
                <Badge color={st.color} small>{st.label}</Badge>
                <span className="text-xs text-gray-400">{a.createdByName || "—"}{a.createdAt ? ` · ${dayjs(a.createdAt).format("DD MMM YYYY")}` : ""}</span>
                <span className="ml-auto font-bold">+ {fmt(a.amount)}</span>
              </div>
              <div className="px-3.5 py-2.5 text-sm">
                {a.reason && <div className="text-gray-600 dark:text-gray-300 mb-2"><span className="text-gray-400">Reason: </span>{a.reason}</div>}
                <Table className="min-w-[560px]">
                  <Thead>
                    <Tr><Th dense>Item</Th><Th dense>Unit</Th><Th dense className="text-right">Qty</Th><Th dense className="text-right">Rate</Th><Th dense className="text-right">Amount</Th></Tr>
                  </Thead>
                  <Tbody>
                    {a.items.map((it, i) => (
                      <Tr key={i}>
                        <Td dense className="whitespace-normal">{it.description}</Td>
                        <Td dense>{it.unit || "—"}</Td>
                        <Td dense className="text-right font-mono">{it.plannedQty}</Td>
                        <Td dense className="text-right font-mono">{fmt(it.rate)}</Td>
                        <Td dense className="text-right font-mono font-semibold">{fmt(it.amount)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                {a.status === "approved" && a.contractBefore != null && (
                  <div className="text-xs text-gray-500 mt-2">Contract value {fmt(a.contractBefore)} → <b>{fmt(a.contractAfter ?? 0)}</b></div>
                )}
                {(a.history?.length ?? 0) > 0 && (
                  <div className="mt-2.5 flex flex-col gap-0.5 text-[11px] text-gray-500">
                    {a.history!.map((h, i) => (
                      <div key={i}>
                        <span className="font-semibold capitalize">{h.stage}</span> {h.action}{h.byName ? ` — ${h.byName}` : ""}{h.at ? ` · ${dayjs(h.at).format("DD MMM, hh:mm A")}` : ""}{h.remarks ? ` — ${h.remarks}` : ""}
                      </div>
                    ))}
                  </div>
                )}

                {next && !readOnly && (
                  <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-800/40 p-3">
                    {!myTurn && !canSendBack ? (
                      <div className="text-xs text-gray-400">{st.label} — nothing for you to do here.</div>
                    ) : backFor === id ? (
                      <>
                        <div className="font-bold text-[13px] mb-2 text-red-600">Send back</div>
                        <Field textarea rows={2} placeholder="Why is it being sent back?" value={remarks[id] || ""} onChange={(e) => setRemarks((r) => ({ ...r, [id]: e.target.value }))} />
                        <div className="flex gap-2 mt-2">
                          <Btn color="red" small loading={busyId === id} disabled={!(remarks[id] || "").trim()} label="Confirm send back" onClick={() => act(a, "send-back", { reason: remarks[id] || "" }, "Sent back")} />
                          <Btn outline small label="Cancel" onClick={() => setBackFor(null)} />
                        </div>
                      </>
                    ) : (
                      <>
                        <Field textarea rows={2} placeholder="Remarks (optional)" value={remarks[id] || ""} onChange={(e) => setRemarks((r) => ({ ...r, [id]: e.target.value }))} />
                        <div className="flex gap-2 mt-2">
                          {myTurn && <Btn color="primary" small loading={busyId === id} label={next.label} onClick={() => act(a, next.path, { remarks: remarks[id] || "" }, "Done")} />}
                          {canSendBack && <Btn outline small label="Send back" onClick={() => setBackFor(id)} />}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <Modal
          icon={ListPlus}
          title={`Add Scope — ${wo.workOrderNo}`}
          extraWide
          onClose={reset}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={reset} />
              <Btn color="primary" label="Submit for approval" loading={saving} onClick={submit} />
            </div>
          }
        >
          <div className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 -mt-1 mb-3.5">
            {wo.vendorName} · {wo.projectName} · {wo.category || "—"} · only the new items — existing items, rates and billing are untouched.
          </div>

          <div className="flex flex-col gap-3">
            {items.map((it, i) => (
              <div key={i} className="border border-gray-200 dark:border-gray-700/40 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Item {i + 1}</div>
                  {items.length > 1 && (
                    <button type="button" aria-label="Remove item" className="text-gray-400 hover:text-red-500" onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <input className={inputCls} placeholder="Description of work" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                  <input className={inputCls} placeholder="Unit" list="addendum-units" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} />
                  <input className={`${inputCls} text-right`} type="number" min="0" step="any" placeholder="Qty" value={it.plannedQty} onChange={(e) => setItem(i, { plannedQty: e.target.value })} />
                  <input className={`${inputCls} text-right`} type="number" min="0" step="any" placeholder="Rate (₹)" value={it.rate} onChange={(e) => setItem(i, { rate: e.target.value })} />
                  <input className={`${inputCls} text-right`} type="number" min="0" step="any" placeholder="GST %" value={it.gstPercent} onChange={(e) => setItem(i, { gstPercent: e.target.value })} />
                  <div className="h-9 flex items-center justify-end text-sm font-mono font-semibold">{fmt(itemAmount(it))}</div>
                </div>
                {!professional && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <label className="text-[11px] text-gray-400">Start date<input className={inputCls} type="date" value={it.plannedStart} onChange={(e) => setItem(i, { plannedStart: e.target.value })} /></label>
                    <label className="text-[11px] text-gray-400">End date<input className={inputCls} type="date" value={it.plannedEnd} onChange={(e) => setItem(i, { plannedEnd: e.target.value })} /></label>
                  </div>
                )}
              </div>
            ))}
          </div>
          <datalist id="addendum-units">
            {["sq.ft", "sq.mt", "rft", "rmt", "cu.ft", "cu.mt", "nos", "per piece", "per person", "kg", "ltr", "lump-sum"].map((u) => <option key={u} value={u} />)}
          </datalist>

          <div className="mt-2.5"><Btn outline small icon={Plus} label="Add another item" onClick={() => setItems((prev) => [...prev, blankItem(wo.gstPercent ?? 18)])} /></div>

          <div className="flex justify-end items-center gap-2 mt-4 text-sm">
            <span className="text-gray-400">Added amount (before GST)</span>
            <span className="font-bold font-mono">{fmt(total)}</span>
          </div>

          <div className="mt-3.5">
            <Field textarea rows={3} label="Reason for the extra work" required placeholder="Why is this being added to the existing work order?" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </Modal>
      )}
    </Card>
  );
}
