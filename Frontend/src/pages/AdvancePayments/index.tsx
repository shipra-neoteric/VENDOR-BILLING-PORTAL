import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2, Wallet } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import { selectableProjects } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import Switch from "../../ui/Switch";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import { DatePicker } from "../../ui/DatePicker";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import EmptyState from "../../ui/EmptyState";
import Spinner from "../../ui/Spinner";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";

const fmt = (n: number) => "₹" + (n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CFG: Record<string, { color: NxBadgeColor; label: string }> = {
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
  const [deleteTarget, setDeleteTarget] = useState<AdvanceSlip | null>(null);

  const load = async (archived: boolean) => {
    setLoading(true);
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


  const pager = usePagination(slips, 10);

  return (
    <div>
      <PageHeader
        title="Advance Payments"
        subtitle="Track advance amounts given to contractors against projects. Recoveries are auto-deducted at bill release."
        icon={Wallet}
        actions={<NxBtn color="primary" icon={Plus} label="New Advance Slip" onClick={() => { setForm(emptyForm); setModal(true); }} />}
      />

      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Switch checked={showArchived} onChange={setShowArchived} onLabel="Archived" offLabel="Active" />
      </div>

      {loading ? (
        <Spinner label="Loading advance slips…" />
      ) : slips.length === 0 ? (
        <EmptyState icon={Wallet} title={showArchived ? "No archived advance slips" : "No advance slips yet"} />
      ) : (
        <Table className="min-w-[1200px]">
          <Thead>
            <Tr>
              <Th className="w-[9%]">Slip No</Th>
              <Th className="w-[10%]">Date</Th>
              <Th className="w-[14%]">Project</Th>
              <Th className="w-[15%]">Contractor</Th>
              <Th className="text-right w-[11%]">Advance Given</Th>
              <Th className="text-right w-[10%]">Recovered</Th>
              <Th className="text-right w-[10%]">Balance</Th>
              <Th className="w-[9%]">Reference</Th>
              <Th className="w-[10%]">Status</Th>
              <Th className="w-[8%] text-center">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {pager.pageItems.map(s => {
              const live = contractors.find(c => c.vendorCode === s.contractorCode);
              const cfg = STATUS_CFG[s.status] ?? { color: "orange" as const, label: s.status };
              return (
                <Tr key={s._id}>
                  <Td className="whitespace-nowrap truncate"><span className="font-bold text-primary">{s.slipNo}</span></Td>
                  <Td className="whitespace-nowrap truncate"><TdText>{dayjs(s.date).format("DD MMM YYYY")}</TdText></Td>
                  <Td className="whitespace-nowrap truncate"><TdText>{s.projectName}</TdText></Td>
                  <Td className="whitespace-nowrap truncate">
                    <div className="text-sm text-[#1A1A2E] dark:text-[#F1F5F9] truncate">{live ? vendorLabel(live.companyName, live.shortCode) : s.contractorName}</div>
                    <div className="text-[11px] text-gray-400 truncate">{s.contractorCode}</div>
                  </Td>
                  <Td className="text-right whitespace-nowrap"><span className="font-mono font-semibold"><TdText>{fmt(s.amount)}</TdText></span></Td>
                  <Td className="text-right whitespace-nowrap"><span className="font-mono text-emerald-600 dark:text-emerald-400">{fmt(s.amountRecovered)}</span></Td>
                  <Td className="text-right whitespace-nowrap"><span className={`font-mono font-bold ${s.balance > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{fmt(s.balance)}</span></Td>
                  <Td className="whitespace-nowrap truncate">{s.reference || <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                  <Td className="whitespace-nowrap"><NxBadge color={cfg.color}>{cfg.label}</NxBadge></Td>
                  <Td className="text-center">
                    <NxBtn
                      color="icon-red" title={s.amountRecovered !== 0 ? "Has recoveries — cannot delete" : "Delete"}
                      icon={Trash2} disabled={s.amountRecovered !== 0}
                      onClick={() => setDeleteTarget(s)}
                    />
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}
      {slips.length > 0 && pager.totalPages > 1 && (
        <div className="mt-4"><Pagination page={pager.page} totalPages={pager.totalPages} onChange={pager.setPage} /></div>
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

    </div>
  );
}
