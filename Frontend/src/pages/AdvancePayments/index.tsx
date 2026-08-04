import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2, Archive, ArchiveRestore, Wallet } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import { selectableProjects } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Card from "../../ui/Card";
import Badge from "../../ui/Badge";
import Checkbox from "../../ui/Checkbox";
import Switch from "../../ui/Switch";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import { DatePicker } from "../../ui/DatePicker";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import Spinner from "../../ui/Spinner";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

const STATUS_CFG: Record<string, { color: "orange" | "amber" | "green"; label: string }> = {
  outstanding: { color: "orange", label: "Outstanding" },
  partial:     { color: "amber",  label: "Partial"     },
  recovered:   { color: "green",  label: "Recovered"   },
};

interface AdvanceSlip {
  _id: string;
  slipNo: string;
  contractorCode: string;
  contractorName: string;
  projectName: string;
  amount: number;
  amountRecovered: number;
  balance: number;
  date: string;
  reference?: string;
  notes?: string;
  status: "outstanding" | "partial" | "recovered";
  recoveries: { amount: number; date: string; releasedBy: string }[];
  createdAt: string;
  isArchived?: boolean;
  archivedAt?: string;
}

const emptyForm = { projectId: "", contractorCode: "", amount: "", date: dayjs().format("YYYY-MM-DD"), reference: "", notes: "" };

export default function AdvancePayments() {
  const [slips,    setSlips]    = useState<AdvanceSlip[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [modal,    setModal]    = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [projects,     setProjects]     = useState<{ _id: string; name: string; parentId?: string | null }[]>([]);
  const [contractors,  setContractors]  = useState<{ vendorCode: string; companyName: string; shortCode?: string }[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [archiving,   setArchiving]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdvanceSlip | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AdvanceSlip | null>(null);
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);

  const load = async (archived: boolean) => {
    setLoading(true);
    setSelectedIds([]);
    try {
      const res = await apiClient.get(`/advance-slips${archived ? "?archived=true" : ""}`);
      setSlips(res.data.advanceSlips ?? []);
    } catch { toast.error("Failed to load advance slips"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load(showArchived);
  }, [showArchived]);

  useEffect(() => {
    apiClient.get("/projects").then(r  => setProjects(r.data.projects ?? []));
    apiClient.get("/contractors").then(r => setContractors(r.data.contractors ?? []));
  }, []);

  const handleCreate = async () => {
    if (!form.projectId) return toast.error("Select a project");
    if (!form.contractorCode) return toast.error("Select a contractor");
    if (!form.amount || Number(form.amount) <= 0) return toast.error("Enter a valid advance amount");
    if (!form.date) return toast.error("Select a date");
    setSaving(true);
    try {
      const project    = projects.find(p => p._id === form.projectId);
      const contractor = contractors.find(c => c.vendorCode === form.contractorCode);
      await apiClient.post("/advance-slips", {
        projectId:       form.projectId,
        contractorCode:  form.contractorCode,
        amount:          Number(form.amount),
        date:            form.date,
        reference:       form.reference,
        notes:           form.notes,
        projectName:     project?.name     ?? "",
        contractorName:  contractor?.companyName ?? "",
      });
      toast.success("Advance slip created");
      setForm(emptyForm);
      setModal(false);
      load(showArchived);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to create";
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/advance-slips/${deleteTarget._id}`);
      toast.success("Deleted");
      setDeleteTarget(null);
      load(showArchived);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Cannot delete";
      toast.error(msg);
    }
  };

  const archiveOne = async () => {
    if (!archiveTarget) return;
    try {
      await apiClient.patch(`/advance-slips/${archiveTarget._id}/${showArchived ? "unarchive" : "archive"}`);
      toast.success(showArchived ? `${archiveTarget.slipNo} unarchived` : `${archiveTarget.slipNo} archived`);
      setArchiveTarget(null);
      load(showArchived);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Action failed";
      toast.error(msg);
    }
  };

  const archiveSelected = async () => {
    if (selectedIds.length === 0) return;
    setArchiving(true);
    try {
      await apiClient.patch(`/advance-slips/${showArchived ? "unarchive-bulk" : "archive-bulk"}`, { ids: selectedIds });
      toast.success(`${selectedIds.length} slip(s) ${showArchived ? "unarchived" : "archived"}`);
      setBulkArchiveConfirm(false);
      load(showArchived);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Action failed";
      toast.error(msg);
    } finally {
      setArchiving(false);
    }
  };

  const allSelected = slips.length > 0 && selectedIds.length === slips.length;
  const toggleAll = () => setSelectedIds(allSelected ? [] : slips.map(s => s._id));
  const toggleOne = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div>
      <PageHeader
        title="Advance Payments"
        subtitle="Track advance amounts given to contractors against projects. Recoveries are auto-deducted at bill release."
        icon={Wallet}
        actions={<Btn label="New Advance Slip" icon={Plus} color="primary" onClick={() => { setForm(emptyForm); setModal(true); }} />}
      />

      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Switch checked={showArchived} onChange={setShowArchived} onLabel="Archived" offLabel="Active" />
        {selectedIds.length > 0 && (
          <Btn
            small icon={showArchived ? ArchiveRestore : Archive}
            label={`${showArchived ? "Unarchive" : "Archive"} Selected (${selectedIds.length})`}
            loading={archiving}
            onClick={() => setBulkArchiveConfirm(true)}
          />
        )}
      </div>

      {loading ? (
        <Spinner label="Loading advance slips…" />
      ) : slips.length === 0 ? (
        <Card className="text-center py-14 text-gray-400">
          {showArchived ? "No archived advance slips" : "No advance slips yet"}
        </Card>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th><Checkbox checked={allSelected} onChange={toggleAll} /></Th>
              <Th>Slip No</Th>
              <Th>Date</Th>
              <Th>Project</Th>
              <Th>Contractor</Th>
              <Th className="text-right">Advance Given</Th>
              <Th className="text-right">Recovered</Th>
              <Th className="text-right">Balance</Th>
              <Th>Reference</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {slips.map(s => {
              const live = contractors.find(c => c.vendorCode === s.contractorCode);
              const cfg = STATUS_CFG[s.status] ?? { color: "orange" as const, label: s.status };
              return (
                <Tr key={s._id}>
                  <Td><Checkbox checked={selectedIds.includes(s._id)} onChange={() => toggleOne(s._id)} /></Td>
                  <Td><span className="font-mono font-bold text-primary">{s.slipNo}</span></Td>
                  <Td><TdText>{dayjs(s.date).format("DD MMM YYYY")}</TdText></Td>
                  <Td><TdText>{s.projectName}</TdText></Td>
                  <Td>
                    <div className="text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{live ? vendorLabel(live.companyName, live.shortCode) : s.contractorName}</div>
                    <div className="text-[11px] text-gray-400 font-mono">{s.contractorCode}</div>
                  </Td>
                  <Td className="text-right"><span className="font-mono font-semibold"><TdText>{fmt(s.amount)}</TdText></span></Td>
                  <Td className="text-right"><span className="font-mono text-emerald-600 dark:text-emerald-400">{fmt(s.amountRecovered)}</span></Td>
                  <Td className="text-right"><span className={`font-mono font-bold ${s.balance > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{fmt(s.balance)}</span></Td>
                  <Td>{s.reference || <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                  <Td><Badge color={cfg.color} small>{cfg.label}</Badge></Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {s.amountRecovered === 0 ? (
                        <Btn small color="red" icon={Trash2} onClick={() => setDeleteTarget(s)} />
                      ) : (
                        <span className="text-xs text-gray-400">Has recoveries</span>
                      )}
                      <Btn small outline icon={showArchived ? ArchiveRestore : Archive} label={showArchived ? "Unarchive" : "Archive"} onClick={() => setArchiveTarget(s)} />
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}

      {modal && (
        <Modal title="New Advance Slip" onClose={() => setModal(false)} footer={
          <div className="flex justify-end gap-2">
            <Btn label="Cancel" outline onClick={() => setModal(false)} disabled={saving} />
            <Btn label="Create Advance Slip" color="primary" loading={saving} onClick={handleCreate} />
          </div>
        }>
          <div className="flex flex-col gap-4">
            <SField
              label="Project" required placeholder="Select project"
              value={form.projectId || null}
              onChange={v => setForm(f => ({ ...f, projectId: v }))}
              options={selectableProjects(projects).map(p => ({ label: p.name, value: p._id }))}
            />
            <SField
              label="Contractor" required placeholder="Select contractor"
              value={form.contractorCode || null}
              onChange={v => setForm(f => ({ ...f, contractorCode: v }))}
              options={contractors.map(c => ({ label: `${c.vendorCode} — ${vendorLabel(c.companyName, c.shortCode)}`, value: c.vendorCode }))}
            />
            <Field
              label="Advance Amount (₹)" required type="number" min={1} step={1}
              placeholder="e.g. 50000"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            />
            <DatePicker label="Date" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} />
            <Field
              label="Reference / Cheque No. (optional)"
              placeholder="e.g. UTR123456 or CHQ-0042"
              value={form.reference}
              onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
            />
            <Field
              textarea label="Notes (optional)" rows={2}
              placeholder="e.g. Advance for mobilisation, Phase 1..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete this advance slip?" message={`${deleteTarget.slipNo} will be permanently removed.`}
          confirmLabel="Delete" danger
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
        />
      )}

      {archiveTarget && (
        <ConfirmModal
          title={showArchived ? `Unarchive ${archiveTarget.slipNo}?` : `Archive ${archiveTarget.slipNo}?`}
          message={showArchived ? "It will reappear in the normal list." : "It will be hidden from the normal list, but not deleted."}
          confirmLabel={showArchived ? "Unarchive" : "Archive"}
          onConfirm={archiveOne} onCancel={() => setArchiveTarget(null)}
        />
      )}

      {bulkArchiveConfirm && (
        <ConfirmModal
          title={showArchived ? `Unarchive ${selectedIds.length} slip(s)?` : `Archive ${selectedIds.length} slip(s)?`}
          message={showArchived ? "They will reappear in the normal list." : "They will be hidden from the normal list, but not deleted."}
          confirmLabel={showArchived ? "Unarchive" : "Archive"}
          loading={archiving}
          onConfirm={archiveSelected} onCancel={() => setBulkArchiveConfirm(false)}
        />
      )}
    </div>
  );
}
