import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2, RotateCcw, Eye } from "lucide-react";
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

interface Actor { id?: string | null; name?: string; email?: string }
interface BinRow {
  _id: string; entityType: string; typeTitle: string; entityId: string; label: string; reason?: string;
  deletedBy?: Actor; deletedAt: string; restoredAt?: string | null; restoredBy?: Actor | null;
  snapshot?: Record<string, unknown>;
}
interface TypeOpt { key: string; title: string }

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

// A one-line preview of a stored value (the snapshot is the raw database document).
function previewValue(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  if (typeof v === "object") return "{…}";
  return String(v);
}

// The "Deleted" tab of Masters → Records. Admin/owner-only: the page that hosts it (pages/Records)
// and the backend route (routes/recycleBin.js) both enforce that.
export default function RecycleBinPanel() {
  const [rows, setRows] = useState<BinRow[]>([]);
  const [types, setTypes] = useState<TypeOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [showRestored, setShowRestored] = useState(false);
  const [view, setView] = useState<BinRow | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [confirm, setConfirm] = useState<BinRow | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/recycle-bin", { params: { type: type || undefined, q: q.trim() || undefined, includeRestored: showRestored ? "true" : undefined } });
      setRows(res.data.rows ?? []);
      setTypes(res.data.types ?? []);
    } catch {
      // apiClient's response interceptor already toasts the error.
    } finally {
      setLoading(false);
    }
  }, [type, q, showRestored]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce the search box
    return () => clearTimeout(t);
  }, [load]);

  const typeOptions = useMemo(() => [{ value: "", label: "All types" }, ...types.map((t) => ({ value: t.key, label: t.title }))], [types]);

  async function openView(r: BinRow) {
    setView(r);
    setViewLoading(true);
    try {
      const res = await apiClient.get(`/recycle-bin/${r._id}`);
      setView(res.data.row);
    } finally {
      setViewLoading(false);
    }
  }

  async function doRestore() {
    if (!confirm) return;
    setRestoring(true);
    try {
      const res = await apiClient.post(`/recycle-bin/${confirm._id}/restore`);
      toast.success(res.data?.message || "Restored");
      setConfirm(null);
      setView(null);
      load();
    } catch {
      // The server explains refusals (e.g. the number is now taken) via the interceptor toast.
      setConfirm(null);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div>
      <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-4">Deleted records are kept here. Restoring puts the exact record back with its original ID, so bills and requests that point at it reconnect.</p>

      <Card className="mb-4">
        <MobileFilters
          className="flex gap-3 flex-wrap items-end"
          active={!!type || showRestored}
          search={
            <div className="flex-1 min-w-[200px]">
              <span className="block text-xs font-bold uppercase tracking-wide mb-1.5 invisible">Search</span>
              <SearchFilter value={q} onChange={setQ} placeholder="Search by number or name…" />
            </div>
          }
        >
          <div className="md:w-[200px] md:order-first"><SField label="Type" value={type} onChange={setType} options={typeOptions} /></div>
          <label className="flex items-center gap-2 text-[13px] text-gray-600 dark:text-gray-300 pb-2 cursor-pointer select-none">
            <input type="checkbox" checked={showRestored} onChange={(e) => setShowRestored(e.target.checked)} />
            Show already restored
          </label>
        </MobileFilters>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="large" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Trash2} title="Nothing in the Recycle Bin" message="Records deleted from now on will show up here, ready to restore." />
      ) : (
        <Table className="min-w-[760px]">
          <Thead>
            <Tr><Th>Type</Th><Th>Record</Th><Th>Deleted by</Th><Th>Deleted on</Th><Th>Reason</Th><Th>Status</Th><Th className="w-[190px]">Actions</Th></Tr>
          </Thead>
          <Tbody>
            {rows.map((r) => (
              <Tr key={r._id}>
                <Td><Badge color="blue">{r.typeTitle}</Badge></Td>
                <Td><span className="font-semibold">{r.label || "—"}</span></Td>
                <Td>{r.deletedBy?.name || "—"}</Td>
                <Td>{fmt(r.deletedAt)}</Td>
                <Td><span className="text-gray-500">{r.reason || "—"}</span></Td>
                <Td>{r.restoredAt ? <Badge color="green">Restored {fmt(r.restoredAt)}</Badge> : <Badge color="amber">Deleted</Badge>}</Td>
                <Td>
                  <div className="flex gap-1.5">
                    <Btn outline small icon={Eye} label="View" onClick={() => openView(r)} />
                    {!r.restoredAt && <Btn small color="primary" icon={RotateCcw} label="Restore" onClick={() => setConfirm(r)} />}
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {view && (
        <Modal
          icon={Trash2}
          title={`${view.typeTitle} · ${view.label || ""}`}
          subtitle={`Deleted ${fmt(view.deletedAt)} by ${view.deletedBy?.name || "—"}`}
          extraWide
          onClose={() => setView(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Close" onClick={() => setView(null)} />
              {!view.restoredAt && <Btn color="primary" icon={RotateCcw} label="Restore" onClick={() => setConfirm(view)} />}
            </div>
          }
        >
          {viewLoading || !view.snapshot ? (
            <div className="flex justify-center py-10"><Spinner size="large" /></div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {Object.entries(view.snapshot)
                  .filter(([k]) => !["__v"].includes(k))
                  .map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <div className="text-[10.5px] uppercase tracking-wide text-gray-400 font-bold">{k}</div>
                      <div className="text-[13px] break-words">{previewValue(v)}</div>
                    </div>
                  ))}
              </div>
              <details className="text-[12px]">
                <summary className="cursor-pointer text-gray-500 font-semibold">Full stored copy (JSON)</summary>
                <pre className="mt-2 max-h-[320px] overflow-auto rounded-lg bg-gray-50 dark:bg-gray-800/60 p-3 text-[11px]">{JSON.stringify(view.snapshot, null, 2)}</pre>
              </details>
            </div>
          )}
        </Modal>
      )}

      {confirm && (
        <ConfirmModal
          title="Restore this record?"
          message={`${confirm.typeTitle} ${confirm.label} will be put back exactly as it was when it was deleted (same ID). If its number has been taken by a newer record, the restore is refused and nothing changes.`}
          confirmLabel="Restore"
          loading={restoring}
          onConfirm={doRestore}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
