import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import { Diff, Plus, Link as LinkIcon, Check, X, Trash2, FileText, Lock, Eye } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import Card from "../../ui/Card";
import Btn from "../../ui/Btn";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import { FilterRow, SearchFilter, SelectFilter } from "../../ui/Filters";
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td, TdText } from "../../ui/Table";
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
  category?: string;
  subCategory?: string;
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

// A vendor's own extra line item, not tied to any of the work order's
// pre-listed scope items — has no scopeItemId, so it flows through
// approveQuotation's existing "append as a new scope item" branch instead of
// being matched onto one (see Backend/src/controllers/contractorQuotationController.js).
interface CustomItem {
  key: string;
  description: string;
  unit: string;
  plannedQty: string;
  rate: string;
}
let _customItemKey = 0;
const newCustomItem = (): CustomItem => ({ key: String(++_customItemKey), description: "", unit: "", plannedQty: "", rate: "" });

// Same list Work Orders' own scope-item unit picker uses (WorkItems/index.tsx,
// PublicWorkOrderForm/index.tsx) — kept consistent rather than free-text so a
// contractor's extra item's unit always matches something the rest of the app
// already recognizes.
const UNIT_OPTIONS = [
  { label: "Sq.Ft (Square Feet)", value: "sq.ft"      },
  { label: "Sq.M (Square Meter)", value: "sq.m"       },
  { label: "Cu.M (Cubic Meter)",  value: "cu.m"       },
  { label: "Cu.Ft (Cubic Feet)",  value: "cu.ft"      },
  { label: "RMT (Running Meter)", value: "rmt"        },
  { label: "Kg (Kilogram)",       value: "kg"         },
  { label: "MT (Metric Ton)",     value: "mt"         },
  { label: "Nos (Numbers)",       value: "nos"        },
  { label: "Daily Wage",          value: "daily-wage" },
  { label: "Per Day",             value: "per-day"    },
  { label: "Per Person",          value: "per-person" },
  { label: "Per Hour",            value: "per-hr"     },
  { label: "Per Trip",            value: "per-trip"   },
  { label: "RFT (Running Foot)",  value: "rft"        },
  { label: "Lump Sum",            value: "lump-sum"   },
];

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
  // Removing one of the work order's own items here only excludes it from
  // THIS quotation (never touches the real scope item on the work order
  // itself) — same end result as leaving its rate blank, just an explicit
  // action instead of an implicit one.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [contractorName, setContractorName] = useState("");
  const [contractorMobile, setContractorMobile] = useState("");
  const [contractorEmail, setContractorEmail] = useState("");
  const [vendorCode, setVendorCode] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCustomItems([]);
    setExcludedIds(new Set());
    apiClient.get(`/quotations/work-order/${workOrder._id}/context`)
      .then(res => setScopeItems(res.data.workOrder.scopeItems || []))
      .catch(() => {})
      .finally(() => setLoadingCtx(false));
  }, [workOrder._id]);

  function updateCustomItem(key: string, patch: Partial<CustomItem>) {
    setCustomItems(items => items.map(i => (i.key === key ? { ...i, ...patch } : i)));
  }

  const visibleScopeItems = scopeItems.filter(i => !excludedIds.has(i._id));
  const customTotal = customItems.reduce((s, i) => s + (Number(i.plannedQty) || 0) * (Number(i.rate) || 0), 0);
  const total = visibleScopeItems.reduce((s, i) => s + (i.plannedQty || 0) * (Number(rates[i._id]) || 0), 0) + customTotal;

  async function submit() {
    if (!contractorName.trim()) return toast.error("Contractor's name is required");
    if (!contractorMobile.trim()) return toast.error("Contractor's contact is required");
    const scopeQuotedItems = visibleScopeItems
      .filter(i => Number(rates[i._id]) > 0)
      .map(i => ({ scopeItemId: i._id, description: i.description, unit: i.unit, plannedQty: i.plannedQty, rate: Number(rates[i._id]) }));
    const filledCustomItems = customItems.filter(i => i.description.trim() && Number(i.rate) > 0);
    if (filledCustomItems.some(i => !i.unit.trim() || !(Number(i.plannedQty) > 0))) {
      return toast.error("Every custom item needs a unit and a quantity greater than 0");
    }
    const customQuotedItems = filledCustomItems.map(i => ({
      scopeItemId: null, description: i.description.trim(), unit: i.unit.trim(), plannedQty: Number(i.plannedQty), rate: Number(i.rate),
    }));
    const quotedItems = [...scopeQuotedItems, ...customQuotedItems];
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
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {visibleScopeItems.map(item => (
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
                        className="w-28 h-8 px-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </Td>
                    <Td><TdText>{fmt((item.plannedQty || 0) * (Number(rates[item._id]) || 0))}</TdText></Td>
                    <Td>
                      <Btn small outline icon={Trash2} onClick={() => setExcludedIds(s => new Set(s).add(item._id))} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Extra items (not in the work order's scope)</div>
            <Btn small outline icon={Plus} label="Add Item" onClick={() => setCustomItems(items => [...items, newCustomItem()])} />
          </div>
          {customItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-[2fr_1fr_0.8fr_0.9fr_0.9fr_32px] gap-2 px-0.5 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <span>Description</span><span>Unit</span><span>Qty</span><span>Rate (₹)</span><span>Amount</span><span />
              </div>
              {customItems.map(item => (
                <div key={item.key} className="grid grid-cols-[2fr_1fr_0.8fr_0.9fr_0.9fr_32px] gap-2 items-center">
                  <input
                    type="text" value={item.description} placeholder="e.g. Extra waterproofing"
                    onChange={e => updateCustomItem(item.key, { description: e.target.value })}
                    className="w-full h-8 px-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <SField value={item.unit} onChange={v => updateCustomItem(item.key, { unit: v })} options={UNIT_OPTIONS} placeholder="Unit" />
                  <input
                    type="number" min={0} value={item.plannedQty} placeholder="Qty"
                    onChange={e => updateCustomItem(item.key, { plannedQty: e.target.value })}
                    className="w-full h-8 px-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    type="number" min={0} value={item.rate} placeholder="Rate"
                    onChange={e => updateCustomItem(item.key, { rate: e.target.value })}
                    className="w-full h-8 px-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <span className="text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] font-mono">{fmt((Number(item.plannedQty) || 0) * (Number(item.rate) || 0))}</span>
                  <Btn small outline icon={Trash2} onClick={() => setCustomItems(items => items.filter(i => i.key !== item.key))} />
                </div>
              ))}
            </div>
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

function QuotationCard({ q, onApprove, onReject }: { q: Quotation; onApprove: () => void; onReject: () => void }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const approved = q.status === "approved";
  const rejected = q.status === "rejected";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 flex flex-col gap-3 ${
        approved
          ? "bg-emerald-50/60 dark:bg-emerald-500/[0.06] border-emerald-300 dark:border-emerald-500/40"
          : rejected
          ? "bg-gray-50 dark:bg-[#1A2436] border-gray-200 dark:border-gray-700/40"
          : "bg-white dark:bg-[#1E293B] border-gray-200 dark:border-gray-700/40"
      }`}
    >
      {approved && (
        <div className="absolute -top-px -right-px w-12 h-12 overflow-hidden">
          <div className="absolute top-2.5 -right-6 w-24 rotate-45 bg-emerald-500 text-white flex items-center justify-center py-1 shadow-sm">
            <Check className="w-3 h-3" />
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-[#1A1A2E] dark:text-[#F1F5F9] truncate">{q.contractorName}</div>
            <div className="text-xs text-gray-400 truncate">{q.vendorCode || q.quotationNo}</div>
          </div>
        </div>
        {!approved && <NxBadge color={statusColor(q.status)}>{q.status}</NxBadge>}
      </div>

      <div className="bg-white dark:bg-[#162032] rounded-lg px-3 py-2.5 flex flex-col gap-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Total amount</span>
          <span className={`font-bold font-mono ${approved ? "text-emerald-600 dark:text-emerald-400" : rejected ? "text-gray-400 line-through" : "text-[#1A1A2E] dark:text-[#F1F5F9]"}`}>
            {fmt(q.totalQuoted)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Submitted</span>
          <span className="text-gray-600 dark:text-gray-300">{dayjs(q.createdAt).format("DD-MM-YYYY")}</span>
        </div>
      </div>

      {approved && (
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 rounded-md px-2.5 py-1.5">
          <Lock className="w-3 h-3" /> Locked — applied to Work Order
        </div>
      )}

      <div className="flex gap-2 mt-auto pt-1">
        <Btn small outline icon={Eye} label="Details" onClick={() => setDetailsOpen(true)} className="flex-1" />
        {q.status === "submitted" && (
          <Btn small color="primary" icon={Check} label="Approve" onClick={onApprove} className="flex-1" />
        )}
      </div>

      {detailsOpen && (
        <QuotationDetailsPanel q={q} onClose={() => setDetailsOpen(false)} onApprove={onApprove} onReject={onReject} />
      )}
    </div>
  );
}

function QuotationDetailsPanel({
  q, onClose, onApprove, onReject,
}: { q: Quotation; onClose: () => void; onApprove: () => void; onReject: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[560px] h-full bg-white dark:bg-[#0F172A] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700/40 shrink-0">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Quotation</div>
            <div className="text-lg font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">{q.quotationNo}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <NxBadge color={statusColor(q.status)}>{q.status}</NxBadge>
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmt(q.totalQuoted)}</span>
          </div>

          {/* Field grid — only real, existing data (no invented GST/Delivery
              Date/Brand fields — this quotation model doesn't carry those). */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-gray-50 dark:bg-[#162032] rounded-md px-2.5 py-1.5">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Contact Person</div>
              <div className="text-[12.5px] font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] truncate">{q.contractorName}</div>
            </div>
            <div className="bg-gray-50 dark:bg-[#162032] rounded-md px-2.5 py-1.5">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Mobile</div>
              <div className="text-[12.5px] font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{q.contractorMobile}</div>
            </div>
            <div className="bg-gray-50 dark:bg-[#162032] rounded-md px-2.5 py-1.5">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Submitted</div>
              <div className="text-[12.5px] font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{dayjs(q.createdAt).format("DD MMM YYYY")}</div>
            </div>
            {q.vendorCode && (
              <div className="bg-gray-50 dark:bg-[#162032] rounded-md px-2.5 py-1.5">
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">Vendor Code</div>
                <div className="text-[12.5px] font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{q.vendorCode}</div>
              </div>
            )}
            {q.contractorEmail && (
              <div className="bg-gray-50 dark:bg-[#162032] rounded-md px-2.5 py-1.5 col-span-2">
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">Email</div>
                <div className="text-[12.5px] font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] truncate">{q.contractorEmail}</div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              <FileText className="w-3.5 h-3.5" /> Quoted Items ({q.quotedItems.length})
            </div>
            <Table>
              <Thead>
                <Tr><Th className="w-8"></Th><Th>Description</Th><Th>Unit</Th><Th>Qty</Th><Th>Rate</Th><Th>Amount</Th></Tr>
              </Thead>
              <Tbody>
                {q.quotedItems.map(item => (
                  <Tr key={item._id ?? item.description}>
                    <Td>
                      <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    </Td>
                    <Td><TdText>{item.description}</TdText></Td>
                    <Td><TdText>{item.unit}</TdText></Td>
                    <Td><TdText>{item.plannedQty}</TdText></Td>
                    <Td><TdText>{fmtRate(item.rate)}</TdText></Td>
                    <Td><TdText>{fmt(item.amount)}</TdText></Td>
                  </Tr>
                ))}
              </Tbody>
              <Tfoot>
                <Tr className="bg-emerald-50 dark:bg-emerald-500/10">
                  <Td colSpan={5} className="font-bold text-right text-emerald-700 dark:text-emerald-400">Grand Total</Td>
                  <Td className="font-bold text-emerald-700 dark:text-emerald-400">{fmt(q.totalQuoted)}</Td>
                </Tr>
              </Tfoot>
            </Table>
          </div>

          {q.remarks && (
            <div className="bg-gray-50 dark:bg-[#162032] rounded-md px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-600 dark:text-gray-300">Remarks: </span>{q.remarks}
            </div>
          )}

          {q.status === "approved" && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 rounded-md px-2.5 py-1.5">
              <Lock className="w-3 h-3" /> Locked — applied to Work Order
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-gray-700/40 shrink-0">
          {q.status === "submitted" ? (
            <>
              <Btn outline color="red" icon={X} label="Reject" onClick={() => { onReject(); onClose(); }} />
              <Btn color="primary" icon={Check} label="Approve" onClick={() => { onApprove(); onClose(); }} />
            </>
          ) : (
            <Btn outline label="Close" onClick={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

function CompareQuotationsInline({
  workOrder, onChanged,
}: {
  workOrder: DraftWorkOrder;
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
      <div className="border-t border-gray-100 dark:border-gray-700/40 mt-3 pt-4">
        {loading ? (
          <SkeletonTable rows={4} cols={5} />
        ) : quotations.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-10">No quotations submitted yet for this work order.</div>
        ) : (
          <>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Comparing {quotations.length} quotation{quotations.length !== 1 ? "s" : ""} for <span className="font-semibold">{workOrder.workOrderNo}</span> ({workOrder.category})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {quotations.map(q => (
                <QuotationCard
                  key={q._id}
                  q={q}
                  onApprove={() => setConfirm({ quotation: q, action: "approve" })}
                  onReject={() => setConfirm({ quotation: q, action: "reject" })}
                />
              ))}
            </div>
          </>
        )}
      </div>

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
  const [category, setCategory] = useState("");
  const [newQuoteFor, setNewQuoteFor] = useState<DraftWorkOrder | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    apiClient.get("/quotations/draft-work-orders")
      .then(res => setWorkOrders(res.data.workOrders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  // Populated straight from whatever categories these draft WOs actually
  // carry — narrower than the full /categories list, but every option here
  // is guaranteed to actually match something (no "Furniture" option sitting
  // there with zero results if no draft WO happens to be in it right now).
  const categoryOptions = useMemo(() => {
    const names = [...new Set(workOrders.map(w => w.category).filter(Boolean))] as string[];
    return names.sort((a, b) => a.localeCompare(b));
  }, [workOrders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workOrders.filter(w => {
      if (category && w.category !== category) return false;
      if (!q) return true;
      return (
        w.workOrderNo.toLowerCase().includes(q) ||
        w.projectName?.toLowerCase().includes(q) ||
        w.vendorName?.toLowerCase().includes(q)
      );
    });
  }, [workOrders, search, category]);

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
        <SelectFilter
          value={category} onChange={setCategory} placeholder="All Categories"
          options={categoryOptions.map(c => ({ value: c, label: c }))}
        />
      </FilterRow>

      {loading ? (
        <SkeletonTable rows={4} cols={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Diff} title="No draft work orders" message="No draft work orders are awaiting quotation right now." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(w => {
            const isExpanded = expandedId === w._id;
            return (
              <Card key={w._id} className={isExpanded ? "lg:col-span-2" : undefined}>
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
                  <NxBtn
                    color="secondary" label={isExpanded ? "Hide Quotes" : "Compare Quotes"}
                    onClick={() => setExpandedId(isExpanded ? null : w._id)}
                  />
                  <NxBtn color="primary" icon={Plus} label="New Quotation" onClick={() => setNewQuoteFor(w)} />
                  <NxBtn color="secondary" icon={LinkIcon} label="Copy Public Link" onClick={() => copyPublicLink(w._id)} />
                </div>

                {isExpanded && <CompareQuotationsInline workOrder={w} onChanged={load} />}
              </Card>
            );
          })}
        </div>
      )}

      {newQuoteFor && (
        <NewQuotationModal
          workOrder={newQuoteFor}
          onClose={() => setNewQuoteFor(null)}
          onSubmitted={() => { setNewQuoteFor(null); load(); }}
        />
      )}
    </div>
  );
}
