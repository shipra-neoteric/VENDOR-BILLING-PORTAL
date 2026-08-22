import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Diff, Plus, Link as LinkIcon, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import Card from "../../ui/Card";
import Btn from "../../ui/Btn";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import Field from "../../ui/Field";
import { FilterRow, SearchFilter } from "../../ui/Filters";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import { SkeletonTable } from "../../ui/Skeleton";
import EmptyState from "../../ui/EmptyState";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";

interface DraftWorkOrder {
  _id: string;
  workOrderNo: string;
  projectName: string;
  vendorName?: string;
  contractValue: number;
  pendingQuotationCount: number;
}

interface QuotedItem {
  _id?: string;
  scopeItemId: string | null;
  description: string;
  unit: string;
  plannedQty: number;
  rate: number;
  amount: number;
}

interface Quotation {
  _id: string;
  quotationNo: string;
  vendorCode: string;
  contractorName: string;
  contractorMobile: string;
  contractorEmail: string;
  quotedItems: QuotedItem[];
  totalQuoted: number;
  remarks: string;
  status: "submitted" | "approved" | "rejected";
  createdAt: string;
}

interface ScopeItemContext {
  _id: string;
  description: string;
  unit: string;
  plannedQty: number;
}

const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Per-unit rates are fractional far more often than totals are — rounding
// them for display (as fmt() does) silently turns 130.5 into 131.
const fmtRate = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function statusColor(status: Quotation["status"]) {
  if (status === "approved") return "green" as const;
  if (status === "rejected") return "red" as const;
  return "amber" as const;
}

// ── New Quotation entry modal (internal, on the contractor's behalf) ──

function NewQuotationModal({
  workOrder, onClose, onSubmitted,
}: {
  workOrder: DraftWorkOrder;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [scopeItems, setScopeItems] = useState<ScopeItemContext[]>([]);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [contractorName, setContractorName] = useState("");
  const [contractorMobile, setContractorMobile] = useState("");
  const [contractorEmail, setContractorEmail] = useState("");
  const [vendorCode, setVendorCode] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiClient.get(`/quotations/work-order/${workOrder._id}/context`)
      .then(res => setScopeItems(res.data.workOrder.scopeItems || []))
      .catch(() => {})
      .finally(() => setLoadingCtx(false));
  }, [workOrder._id]);

  const total = scopeItems.reduce((s, i) => s + (i.plannedQty || 0) * (Number(rates[i._id]) || 0), 0);

  async function submit() {
    if (!contractorName.trim()) return toast.error("Contractor's name is required");
    if (!contractorMobile.trim()) return toast.error("Contractor's contact is required");
    const quotedItems = scopeItems
      .filter(i => Number(rates[i._id]) > 0)
      .map(i => ({ scopeItemId: i._id, description: i.description, unit: i.unit, plannedQty: i.plannedQty, rate: Number(rates[i._id]) }));
    if (quotedItems.length === 0) return toast.error("Enter a rate for at least one item");

    setSubmitting(true);
    try {
      await apiClient.post(`/quotations/work-order/${workOrder._id}`, {
        vendorCode, contractorName, contractorMobile, contractorEmail, remarks, quotedItems,
      });
      toast.success("Quotation submitted");
      onSubmitted();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't submit the quotation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="New Quotation"
      subtitle={`${workOrder.workOrderNo} · ${workOrder.projectName}`}
      icon={Plus}
      onClose={onClose}
      extraWide
      footer={
        <div className="flex justify-end gap-2">
          <Btn label="Cancel" outline onClick={onClose} disabled={submitting} />
          <Btn label="Submit Quotation" color="primary" onClick={submit} loading={submitting} />
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Contractor Name" required value={contractorName} onChange={e => setContractorName(e.target.value)} placeholder="e.g. Shree Constructions" />
          <Field label="Contact Number" required value={contractorMobile} onChange={e => setContractorMobile(e.target.value)} placeholder="10-digit mobile" />
          <Field label="Email" value={contractorEmail} onChange={e => setContractorEmail(e.target.value)} placeholder="optional" />
          <Field label="Existing Vendor Code" value={vendorCode} onChange={e => setVendorCode(e.target.value)} placeholder="optional, if already registered" />
        </div>

        <div>
          <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Quote a rate per item</div>
          {loadingCtx ? (
            <SkeletonTable rows={3} cols={4} />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Item</Th>
                  <Th>Unit</Th>
                  <Th>Qty</Th>
                  <Th>Rate (₹)</Th>
                  <Th>Amount</Th>
                </Tr>
              </Thead>
              <Tbody>
                {scopeItems.map(item => (
                  <Tr key={item._id}>
                    <Td><TdText>{item.description}</TdText></Td>
                    <Td><TdText>{item.unit}</TdText></Td>
                    <Td><TdText>{item.plannedQty}</TdText></Td>
                    <Td>
                      <input
                        type="number"
                        min={0}
                        value={rates[item._id] ?? ""}
                        onChange={e => setRates(r => ({ ...r, [item._id]: e.target.value }))}
                        className="w-28 h-8 px-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </Td>
                    <Td><TdText>{fmt((item.plannedQty || 0) * (Number(rates[item._id]) || 0))}</TdText></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>

        <Field label="Remarks" textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional notes about this quote" />

        <div className="flex justify-end text-sm">
          <span className="text-gray-500 dark:text-gray-400 mr-2">Total Quoted:</span>
          <span className="font-bold font-mono text-primary">{fmt(total)}</span>
        </div>
      </div>
    </Modal>
  );
}

// ── Quotation comparison modal (view + approve/reject) ──

function QuotationRow({ q, onApprove, onReject }: { q: Quotation; onApprove: () => void; onReject: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <Tr>
        <Td>
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-[#1A1A2E] dark:text-[#F1F5F9] font-semibold"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {q.contractorName}
          </button>
          <div className="text-xs text-gray-400">{q.contractorMobile}{q.vendorCode ? ` · ${q.vendorCode}` : ""}</div>
        </Td>
        <Td><TdText>{q.quotationNo}</TdText></Td>
        <Td><TdText>{fmt(q.totalQuoted)}</TdText></Td>
        <Td><NxBadge color={statusColor(q.status)}>{q.status}</NxBadge></Td>
        <Td>
          {q.status === "submitted" && (
            <div className="flex gap-2">
              <NxBtn color="success" icon={Check} label="Approve" onClick={onApprove} />
              <NxBtn color="danger" icon={X} label="Reject" onClick={onReject} />
            </div>
          )}
        </Td>
      </Tr>
      {expanded && (
        <Tr className="hover:!bg-transparent">
          <Td colSpan={5} className="bg-gray-50 dark:bg-[#162032]">
            <div className="py-1">
              {q.remarks && <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Remarks: {q.remarks}</div>}
              <Table>
                <Thead>
                  <Tr><Th>Item</Th><Th>Unit</Th><Th>Qty</Th><Th>Rate</Th><Th>Amount</Th></Tr>
                </Thead>
                <Tbody>
                  {q.quotedItems.map(item => (
                    <Tr key={item._id ?? item.description}>
                      <Td><TdText>{item.description}</TdText></Td>
                      <Td><TdText>{item.unit}</TdText></Td>
                      <Td><TdText>{item.plannedQty}</TdText></Td>
                      <Td><TdText>{fmtRate(item.rate)}</TdText></Td>
                      <Td><TdText>{fmt(item.amount)}</TdText></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </Td>
        </Tr>
      )}
    </>
  );
}

function CompareModal({
  workOrder, onClose, onChanged,
}: {
  workOrder: DraftWorkOrder;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<{ quotation: Quotation; action: "approve" | "reject" } | null>(null);
  const [acting, setActing] = useState(false);

  function load() {
    setLoading(true);
    apiClient.get(`/quotations/work-order/${workOrder._id}`)
      .then(res => setQuotations(res.data.quotations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, [workOrder._id]);

  async function act() {
    if (!confirm) return;
    setActing(true);
    try {
      if (confirm.action === "approve") {
        await apiClient.patch(`/quotations/${confirm.quotation._id}/approve`);
        toast.success("Quotation approved — the work order's rates have been updated");
      } else {
        await apiClient.patch(`/quotations/${confirm.quotation._id}/reject`);
        toast.success("Quotation rejected");
      }
      setConfirm(null);
      load();
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't complete this action");
    } finally {
      setActing(false);
    }
  }

  return (
    <>
      <Modal
        title="Compare Quotations"
        subtitle={`${workOrder.workOrderNo} · ${workOrder.projectName}`}
        icon={Diff}
        onClose={onClose}
        extraWide
      >
        {loading ? (
          <SkeletonTable rows={4} cols={5} />
        ) : quotations.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-10">No quotations submitted yet for this work order.</div>
        ) : (
          <Table>
            <Thead>
              <Tr><Th>Contractor</Th><Th>Quotation No.</Th><Th>Total Quoted</Th><Th>Status</Th><Th>Actions</Th></Tr>
            </Thead>
            <Tbody>
              {quotations.map(q => (
                <QuotationRow
                  key={q._id}
                  q={q}
                  onApprove={() => setConfirm({ quotation: q, action: "approve" })}
                  onReject={() => setConfirm({ quotation: q, action: "reject" })}
                />
              ))}
            </Tbody>
          </Table>
        )}
      </Modal>

      {confirm && (
        <ConfirmModal
          title={confirm.action === "approve" ? "Approve this quotation?" : "Reject this quotation?"}
          message={
            confirm.action === "approve"
              ? `This will lock ${confirm.quotation.contractorName}'s rates onto ${workOrder.workOrderNo} and reject any other pending quotations for it.`
              : `${confirm.quotation.contractorName}'s quotation will be marked rejected.`
          }
          confirmLabel={confirm.action === "approve" ? "Approve" : "Reject"}
          danger={confirm.action === "reject"}
          loading={acting}
          onConfirm={act}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// ── Main page ──

export default function QuotationComparison() {
  const [workOrders, setWorkOrders] = useState<DraftWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newQuoteFor, setNewQuoteFor] = useState<DraftWorkOrder | null>(null);
  const [compareFor, setCompareFor] = useState<DraftWorkOrder | null>(null);

  function load() {
    setLoading(true);
    apiClient.get("/quotations/draft-work-orders")
      .then(res => setWorkOrders(res.data.workOrders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workOrders;
    return workOrders.filter(w =>
      w.workOrderNo.toLowerCase().includes(q) ||
      w.projectName?.toLowerCase().includes(q) ||
      w.vendorName?.toLowerCase().includes(q)
    );
  }, [workOrders, search]);

  function copyPublicLink(workOrderId: string) {
    const url = `${window.location.origin}/public/quotation/${workOrderId}`;
    navigator.clipboard.writeText(url)
      .then(() => toast.success("Public quotation link copied"))
      .catch(() => toast.error("Couldn't copy — copy it manually"));
  }

  return (
    <div>
      <PageHeader
        title="Quotation Comparison"
        subtitle="Compare contractor quotes against draft work orders before rates are locked in"
        icon={Diff}
      />

      <FilterRow>
        <SearchFilter value={search} onChange={setSearch} placeholder="Search work order, project, or contractor…" />
      </FilterRow>

      {loading ? (
        <SkeletonTable rows={4} cols={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Diff} title="No draft work orders" message="No draft work orders are awaiting quotation right now." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(w => (
            <Card key={w._id}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="font-bold text-[#1A1A2E] dark:text-[#F1F5F9] truncate">{w.workOrderNo}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 truncate">{w.projectName}</div>
                </div>
                {w.pendingQuotationCount > 0 && (
                  <NxBadge color="orange">{w.pendingQuotationCount} pending</NxBadge>
                )}
              </div>
              <div className="text-xs text-gray-400 mb-3">
                {w.vendorName ? `Current: ${w.vendorName}` : "No contractor locked yet"} · Contract Value {fmt(w.contractValue)}
              </div>
              <div className="flex flex-wrap gap-2">
                <NxBtn color="secondary" label="Compare Quotes" onClick={() => setCompareFor(w)} />
                <NxBtn color="primary" icon={Plus} label="New Quotation" onClick={() => setNewQuoteFor(w)} />
                <NxBtn color="secondary" icon={LinkIcon} label="Copy Public Link" onClick={() => copyPublicLink(w._id)} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {newQuoteFor && (
        <NewQuotationModal
          workOrder={newQuoteFor}
          onClose={() => setNewQuoteFor(null)}
          onSubmitted={() => { setNewQuoteFor(null); load(); }}
        />
      )}

      {compareFor && (
        <CompareModal
          workOrder={compareFor}
          onClose={() => setCompareFor(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
