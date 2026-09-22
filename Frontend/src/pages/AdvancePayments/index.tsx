import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Printer, Trash2, Wallet } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import { selectableProjects } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";
import { printAdvanceSlip } from "../../shared/utils/printAdvanceSlip";
import type { Contractor } from "../../types/VendorBilling";
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
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td, TdText } from "../../ui/Table";
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
  createdBy?: { name?: string } | string | null;
}

const emptyForm = { projectId: "", contractorCode: "", amount: "", date: dayjs().format("YYYY-MM-DD"), reference: "", notes: "" };

export default function AdvancePayments() {
  const [slips,    setSlips]    = useState<AdvanceSlip[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [modal,    setModal]    = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [projects,     setProjects]     = useState<{ _id: string; name: string; parentId?: string | null }[]>([]);
  // Widened to the full Contractor shape (minus `documents`, which /contractors
  // already omits from the list) — GET /contractors returns bank/GST/PAN
  // fields too, same response resolvePrintParty (printBill.ts) reads for a
  // real bill's contractor lookup; this page already fetches the whole list,
  // so no extra request is needed to get bank details for the detail modal/print.
  const [contractors,  setContractors]  = useState<Contractor[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdvanceSlip | null>(null);
  const [detailTarget, setDetailTarget] = useState<AdvanceSlip | null>(null);

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
                  <Td className="whitespace-nowrap truncate">
                    <button
                      type="button"
                      className="font-bold text-primary hover:underline cursor-pointer"
                      onClick={() => setDetailTarget(s)}
                    >
                      {s.slipNo}
                    </button>
                  </Td>
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
                    <div className="flex items-center justify-center gap-1">
                      <NxBtn
                        color="icon" title="Print"
                        icon={Printer}
                        onClick={() => printAdvanceSlip({
                          slipNo: s.slipNo,
                          contractorName: live ? vendorLabel(live.companyName, live.shortCode) : s.contractorName,
                          contractorCode: s.contractorCode,
                          projectName: s.projectName,
                          amount: s.amount,
                          amountRecovered: s.amountRecovered,
                          reference: s.reference,
                          notes: s.notes,
                          generatedBy: typeof s.createdBy === "object" ? s.createdBy?.name : undefined,
                          date: s.date,
                          status: s.status,
                        }, live ?? null)}
                      />
                      <NxBtn
                        color="icon-red" title={s.amountRecovered !== 0 ? "Has recoveries — cannot delete" : "Delete"}
                        icon={Trash2} disabled={s.amountRecovered !== 0}
                        onClick={() => setDeleteTarget(s)}
                      />
                    </div>
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

      {detailTarget && (() => {
        const live = contractors.find(c => c.vendorCode === detailTarget.contractorCode);
        const cfg = STATUS_CFG[detailTarget.status] ?? { color: "orange" as const, label: detailTarget.status };
        const contractorDisplayName = live ? vendorLabel(live.companyName, live.shortCode) : detailTarget.contractorName;
        const generatedByName = typeof detailTarget.createdBy === "object" ? detailTarget.createdBy?.name : undefined;

        // Same header info-grid convention as BillDetailModal — "Reference"
        // stands in for a bill's "Work Order" (a slip has no work order).
        const headerRows: [string, React.ReactNode][] = [
          ["Project",      detailTarget.projectName || "—"],
          ["Contractor",   `${contractorDisplayName} (${detailTarget.contractorCode})`],
          ["Reference",    detailTarget.reference || "—"],
          ["Generated By", generatedByName || "—"],
          ["Date",         dayjs(detailTarget.date).format("DD MMM YYYY")],
        ];

        return (
          <Modal
            title={
              <div className="flex items-center gap-2">
                <span>Advance Slip — {detailTarget.slipNo}</span>
                <NxBadge color={cfg.color}>{cfg.label}</NxBadge>
              </div>
            }
            icon={Wallet}
            extraWide
            onClose={() => setDetailTarget(null)}
            footer={<Btn label="Close" outline onClick={() => setDetailTarget(null)} />}
          >
            <div className="flex flex-col gap-3.5">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-gray-800/40 p-3.5 rounded-lg">
                {headerRows.map(([label, val]) => (
                  <div key={label}>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
                    <div className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] text-[13px]">{val}</div>
                  </div>
                ))}
              </div>

              {/* Single synthetic "item" row for the advance itself — a slip
                  has no scope items, but the same Description/Unit/Qty/Rate/
                  Amount table keeps the visual convention consistent with a
                  RunningBill's Scope Items table. */}
              <div>
                <div className="font-bold text-xs text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Advance</div>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Description</Th>
                      <Th>Unit</Th>
                      <Th className="text-right">Qty</Th>
                      <Th className="text-right">Rate</Th>
                      <Th className="text-right">Amount</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    <Tr>
                      <Td>{detailTarget.notes || "Advance Payment"}</Td>
                      <Td>—</Td>
                      <Td className="text-right font-mono">1</Td>
                      <Td className="text-right">{fmt(detailTarget.amount)}</Td>
                      <Td className="text-right font-semibold">{fmt(detailTarget.amount)}</Td>
                    </Tr>
                  </Tbody>
                  <Tfoot>
                    <Tr className="bg-primary/5">
                      <Td colSpan={4} className="font-bold text-right text-primary">Advance Given</Td>
                      <Td className="font-bold text-right text-[#1A1A2E] dark:text-[#F1F5F9]">{fmt(detailTarget.amount)}</Td>
                    </Tr>
                  </Tfoot>
                </Table>
              </div>

              {detailTarget.notes && (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-md px-2.5 py-2 text-sm text-amber-800 dark:text-amber-300">
                  <strong>Remarks:</strong> {detailTarget.notes}
                </div>
              )}

              {/* Advance-appropriate equivalent of a bill's Gross/GST/Net
                  Payable summary box — no GST on an advance, just
                  Given/Recovered/Balance. */}
              <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 rounded-lg p-3 text-sm">
                <div className="font-bold mb-2 text-emerald-800 dark:text-emerald-300">Advance Summary</div>
                <div className="font-mono text-xs flex flex-col gap-0.5">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Advance Given</span>
                    <span className="font-semibold">{fmt(detailTarget.amount)}</span>
                  </div>
                  {detailTarget.amountRecovered > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>Recovered</span>
                      <span>− {fmt(detailTarget.amountRecovered)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-emerald-300 dark:border-emerald-500/30 pt-1 mt-0.5 font-bold">
                    <span>Balance</span>
                    <span>{fmt(detailTarget.balance)}</span>
                  </div>
                </div>
              </div>

              {/* Vendor bank/GST/PAN — same convention printBill.ts's Bank
                  Details box uses, pulled from the same Contractor record. */}
              {live?.bankName && (
                <div>
                  <div className="font-bold text-xs text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Bank Details</div>
                  <div className="grid grid-cols-3 gap-3 bg-gray-50 dark:bg-gray-800/40 p-3.5 rounded-lg">
                    {[
                      ["Account Holder Name", live.accountHolderName],
                      ["Bank Name", live.bankName],
                      ["Account No.", live.accountNumber],
                      ["IFSC Code", live.ifscCode],
                      ["Branch", live.branchName],
                      ["PAN No.", live.panNumber],
                      ["Aadhaar No.", live.aadhaarNumber],
                    ].map(([label, val]) => (
                      <div key={label}>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
                        <div className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] text-[13px]">{val || "—"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailTarget.recoveries?.length > 0 && (
                <div>
                  <div className="font-bold text-xs text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Recovery History</div>
                  <div className="flex flex-col gap-2">
                    {detailTarget.recoveries.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-sm border border-gray-100 dark:border-gray-700/40 rounded-lg px-3 py-2">
                        <span>{dayjs(r.date).format("DD MMM YYYY")}</span>
                        <span className="text-gray-500 dark:text-gray-400 truncate">{r.releasedBy || "—"}</span>
                        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{fmt(r.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Modal>
        );
      })()}

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
