import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, ArchiveRestore, Trash2, Inbox } from "lucide-react";
import toast from "react-hot-toast";
import apiClient from "../../services/apiClient";
import Card from "../../ui/Card";
import Btn from "../../ui/Btn";
import Badge from "../../ui/Badge";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import SField from "../../ui/SField";
import Spinner from "../../ui/Spinner";
import EmptyState from "../../ui/EmptyState";
import { SearchFilter } from "../../ui/Filters";
import MobileFilters from "../../ui/MobileFilters";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";

// The "Archived", "Cancelled" and "Rejected" tabs of Masters → Records (Admin/owner only — the
// page and every /api/records route enforce that). Each action here reuses the effects of the
// screen the record normally lives on; see Backend/src/controllers/recordsController.js.

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
const inr = (n?: number) => (n ? `₹${n.toLocaleString("en-IN")}` : "—");

interface Row { type: string; typeTitle: string; id: string; label: string; project: string; party: string; status: string; archivedAt?: string | null; updatedAt?: string | null; isArchived?: boolean }
interface CancelledRow { id: string; label: string; project: string; party: string; contractValue: number; reason: string; cancelledBy: string; cancelledAt?: string | null }
interface BatchResult { ok: boolean; label?: string; error?: string }

const TYPE_OPTIONS_ARCHIVED = [{ value: "", label: "All types" }, { value: "RunningBill", label: "Bill" }, { value: "BillRequest", label: "Bill Request" }, { value: "AdvanceSlip", label: "Advance Slip" }];
const TYPE_OPTIONS_REJECTED = [{ value: "", label: "All types" }, { value: "RunningBill", label: "Bill" }, { value: "BillRequest", label: "Bill Request" }];

// Debounced list loader shared by the three tabs.
function useList<T>(path: string, params: Record<string, string | undefined>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(params);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(path, { params: JSON.parse(key) });
      setRows(res.data.rows ?? []);
    } catch {
      // apiClient's response interceptor already toasts the error.
    } finally {
      setLoading(false);
    }
  }, [path, key]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  return { rows, loading, reload: load };
}

const keyOf = (r: { type: string; id: string }) => `${r.type}:${r.id}`;

function Filters({ typeOptions, type, setType, q, setQ }: { typeOptions?: { value: string; label: string }[]; type?: string; setType?: (v: string) => void; q: string; setQ: (v: string) => void }) {
  return (
    <Card className="mb-4">
      {typeOptions && setType ? (
        <MobileFilters
          className="flex gap-3 flex-wrap items-end"
          active={!!type}
          search={
            <div className="flex-1 min-w-[200px]">
              <span className="block text-xs font-bold uppercase tracking-wide mb-1.5 invisible">Search</span>
              <SearchFilter value={q} onChange={setQ} placeholder="Search by number, project or party…" />
            </div>
          }
        >
          <div className="md:w-[200px] md:order-first"><SField label="Type" value={type ?? ""} onChange={setType} options={typeOptions} /></div>
        </MobileFilters>
      ) : (
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <span className="block text-xs font-bold uppercase tracking-wide mb-1.5 invisible">Search</span>
            <SearchFilter value={q} onChange={setQ} placeholder="Search by number, project or party…" />
          </div>
        </div>
      )}
    </Card>
  );
}

function summarize(results: BatchResult[], okVerb: string) {
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok);
  if (ok) toast.success(`${ok} ${okVerb}`);
  if (bad.length) toast.error(`${bad.length} skipped — ${bad.slice(0, 3).map((b) => b.error || b.label).join("; ")}${bad.length > 3 ? "…" : ""}`, { duration: 7000 });
}

// ── Archived ─────────────────────────────────────────────────────────────
export function ArchivedPanel() {
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const { rows, loading, reload } = useList<Row>("/records/archived", { type: type || undefined, q: q.trim() || undefined });
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPicked((p) => p.filter((k) => rows.some((r) => keyOf(r) === k))); }, [rows]);

  async function run(list: Row[]) {
    setBusy(true);
    try {
      const res = await apiClient.post("/records/archived/unarchive", { items: list.map((r) => ({ type: r.type, id: r.id })) });
      summarize(res.data.results ?? [], "unarchived");
      setPicked([]);
      reload();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const chosen = rows.filter((r) => picked.includes(keyOf(r)));
  const allOn = rows.length > 0 && picked.length === rows.length;
  return (
    <div>
      <Filters typeOptions={TYPE_OPTIONS_ARCHIVED} type={type} setType={setType} q={q} setQ={setQ} />
      {loading ? <div className="flex justify-center py-16"><Spinner size="large" /></div>
        : rows.length === 0 ? <EmptyState icon={Inbox} title="No archived records" message="Archived bills, bill requests and advance slips appear here." />
        : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12.5px] text-gray-500">{rows.length} archived · {picked.length} selected</span>
              <Btn small color="primary" icon={ArchiveRestore} label={`Unarchive selected (${picked.length})`} disabled={picked.length === 0 || busy} onClick={() => setConfirm(chosen)} />
            </div>
            <Table className="min-w-[820px]">
              <Thead><Tr>
                <Th className="w-[36px]"><input type="checkbox" checked={allOn} onChange={(e) => setPicked(e.target.checked ? rows.map(keyOf) : [])} /></Th>
                <Th>Type</Th><Th>Record</Th><Th>Project</Th><Th>Party</Th><Th>Status</Th><Th>Archived on</Th><Th className="w-[130px]">Action</Th>
              </Tr></Thead>
              <Tbody>
                {rows.map((r) => (
                  <Tr key={keyOf(r)}>
                    <Td><input type="checkbox" checked={picked.includes(keyOf(r))} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, keyOf(r)] : p.filter((k) => k !== keyOf(r))))} /></Td>
                    <Td><Badge color="blue">{r.typeTitle}</Badge></Td>
                    <Td><span className="font-semibold">{r.label}</span></Td>
                    <Td>{r.project || "—"}</Td>
                    <Td>{r.party || "—"}</Td>
                    <Td><Badge color="gray">{r.status || "—"}</Badge></Td>
                    <Td>{fmt(r.archivedAt)}</Td>
                    <Td><Btn outline small icon={ArchiveRestore} label="Unarchive" disabled={busy} onClick={() => run([r])} /></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </>
        )}
      {confirm && (
        <ConfirmModal
          title={`Unarchive ${confirm.length} record${confirm.length === 1 ? "" : "s"}?`}
          message="They go back to their normal lists. Archiving or unarchiving a bill also does the same to its bill requests."
          confirmLabel="Unarchive" loading={busy} onConfirm={() => run(confirm)} onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ── Cancelled work orders ────────────────────────────────────────────────
export function CancelledPanel() {
  const [q, setQ] = useState("");
  const { rows, loading, reload } = useList<CancelledRow>("/records/cancelled", { q: q.trim() || undefined });
  const [confirm, setConfirm] = useState<CancelledRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function reactivate() {
    if (!confirm) return;
    setBusy(true);
    try {
      await apiClient.post(`/records/cancelled/${confirm.id}/reactivate`);
      toast.success(`${confirm.label} reactivated`);
      reload();
    } catch {
      // The server explains refusals via the interceptor toast.
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <div>
      <Filters q={q} setQ={setQ} />
      {loading ? <div className="flex justify-center py-16"><Spinner size="large" /></div>
        : rows.length === 0 ? <EmptyState icon={Inbox} title="No cancelled work orders" message="Work orders that are cancelled show up here, with the reason." />
        : (
          <Table className="min-w-[860px]">
            <Thead><Tr><Th>Work Order</Th><Th>Project</Th><Th>Vendor</Th><Th>Contract value</Th><Th>Reason</Th><Th>Cancelled by</Th><Th>Cancelled on</Th><Th className="w-[140px]">Action</Th></Tr></Thead>
            <Tbody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td><span className="font-semibold">{r.label}</span></Td>
                  <Td>{r.project || "—"}</Td>
                  <Td>{r.party || "—"}</Td>
                  <Td>{inr(r.contractValue)}</Td>
                  <Td><span className="text-gray-500">{r.reason || "—"}</span></Td>
                  <Td>{r.cancelledBy || "—"}</Td>
                  <Td>{fmt(r.cancelledAt)}</Td>
                  <Td><Btn small color="primary" icon={RotateCcw} label="Reactivate" disabled={busy} onClick={() => setConfirm(r)} /></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      {confirm && (
        <ConfirmModal
          title="Reactivate this work order?"
          message={`${confirm.label} goes back to the status it had before it was cancelled and its cancel details are cleared. Its SLA timer was stopped by the cancel and is NOT restarted — start a new one separately if you need it.`}
          confirmLabel="Reactivate" loading={busy} onConfirm={reactivate} onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ── Rejected bills / bill requests (delete → Recycle Bin) ────────────────
export function RejectedPanel({ onDeleted }: { onDeleted?: () => void }) {
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const { rows, loading, reload } = useList<Row>("/records/rejected", { q: q.trim() || undefined });
  const [picked, setPicked] = useState<string[]>([]);
  const [asking, setAsking] = useState<Row[] | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => (type ? rows.filter((r) => r.type === type) : rows), [rows, type]);
  useEffect(() => { setPicked((p) => p.filter((k) => shown.some((r) => keyOf(r) === k))); }, [shown]);

  async function doDelete() {
    if (!asking) return;
    setBusy(true);
    try {
      const res = await apiClient.post("/records/rejected/delete", { items: asking.map((r) => ({ type: r.type, id: r.id })), reason: reason.trim() || undefined });
      summarize(res.data.results ?? [], "moved to the Recycle Bin");
      setPicked([]);
      setAsking(null);
      setReason("");
      reload();
      onDeleted?.();
    } finally {
      setBusy(false);
    }
  }

  const chosen = shown.filter((r) => picked.includes(keyOf(r)));
  const allOn = shown.length > 0 && picked.length === shown.length;
  return (
    <div>
      <Filters typeOptions={TYPE_OPTIONS_REJECTED} type={type} setType={setType} q={q} setQ={setQ} />
      {loading ? <div className="flex justify-center py-16"><Spinner size="large" /></div>
        : shown.length === 0 ? <EmptyState icon={Inbox} title="No rejected records" message="Rejected bills and bill requests appear here. Deleting one keeps a copy in the Deleted tab." />
        : (
          <>
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <span className="text-[12.5px] text-gray-500">{shown.length} rejected · {picked.length} selected. Only rejected records can be deleted — rejecting already released their billed quantity and advance recovery.</span>
              <Btn small color="red" icon={Trash2} label={`Delete selected (${picked.length})`} disabled={picked.length === 0 || busy} onClick={() => setAsking(chosen)} />
            </div>
            <Table className="min-w-[820px]">
              <Thead><Tr>
                <Th className="w-[36px]"><input type="checkbox" checked={allOn} onChange={(e) => setPicked(e.target.checked ? shown.map(keyOf) : [])} /></Th>
                <Th>Type</Th><Th>Record</Th><Th>Project</Th><Th>Party</Th><Th>Rejected / updated</Th><Th className="w-[110px]">Action</Th>
              </Tr></Thead>
              <Tbody>
                {shown.map((r) => (
                  <Tr key={keyOf(r)}>
                    <Td><input type="checkbox" checked={picked.includes(keyOf(r))} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, keyOf(r)] : p.filter((k) => k !== keyOf(r))))} /></Td>
                    <Td><Badge color="blue">{r.typeTitle}</Badge>{r.isArchived && <Badge color="gray">Archived</Badge>}</Td>
                    <Td><span className="font-semibold">{r.label}</span></Td>
                    <Td>{r.project || "—"}</Td>
                    <Td>{r.party || "—"}</Td>
                    <Td>{fmt(r.updatedAt)}</Td>
                    <Td><Btn outline small color="red" icon={Trash2} label="Delete" disabled={busy} onClick={() => setAsking([r])} /></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </>
        )}
      {asking && (
        <Modal
          icon={Trash2}
          title={`Delete ${asking.length} rejected record${asking.length === 1 ? "" : "s"}?`}
          onClose={() => { setAsking(null); setReason(""); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setAsking(null); setReason(""); }} />
              <Btn color="red" icon={Trash2} label="Delete" loading={busy} onClick={doDelete} />
            </div>
          }
        >
          <div className="flex flex-col gap-3 text-[13px]">
            <p>{asking.slice(0, 6).map((r) => r.label).join(", ")}{asking.length > 6 ? ` and ${asking.length - 6} more` : ""} will be removed from the normal lists. A full copy is kept in the <b>Deleted</b> tab, from where you can restore it.</p>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Reason (optional)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. created by mistake"
                className="w-full text-[13px] border border-gray-200 dark:border-gray-700/40 rounded-md px-2.5 py-2 bg-transparent" />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}
