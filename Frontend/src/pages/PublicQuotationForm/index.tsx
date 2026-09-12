import { useEffect, useState } from "react";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import { FileCheck2, Send, Plus, Trash2 } from "lucide-react";
import Field from "../../ui/Field";
import Btn from "../../ui/Btn";
import SField from "../../ui/SField";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import { Skeleton } from "../../ui/Skeleton";

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");
const pub = axios.create({ baseURL: BASE.replace(/\/api$/, "/api/public") });
pub.interceptors.response.use(r => {
  if (r.data && "success" in r.data && "data" in r.data) r.data = r.data.data;
  return r;
});

interface ScopeItemContext {
  _id: string;
  description: string;
  unit: string;
  plannedQty: number;
}

interface WorkOrderContext {
  _id: string;
  workOrderNo: string;
  projectName: string;
  isLocked: boolean;
  scopeItems: ScopeItemContext[];
}

const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A contractor's own extra line item, not tied to any of the work order's
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

function workOrderIdFromPath(): string {
  // /public/quotation/:workOrderId — the first per-record-scoped public link
  // in this app; every other public form is a generic unscoped endpoint.
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

export default function PublicQuotationForm() {
  const workOrderId = workOrderIdFromPath();

  const [context, setContext] = useState<WorkOrderContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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
  const [submitted, setSubmitted] = useState<{ quotationNo: string } | null>(null);

  useEffect(() => {
    if (!workOrderId) { setLoadError("No work order specified in this link."); setLoading(false); return; }
    pub.get(`/quotations/work-order/${workOrderId}/context`)
      .then(res => setContext(res.data.workOrder))
      .catch(err => setLoadError(err?.response?.data?.message || "Couldn't load this work order."))
      .finally(() => setLoading(false));
  }, [workOrderId]);

  function updateCustomItem(key: string, patch: Partial<CustomItem>) {
    setCustomItems(items => items.map(i => (i.key === key ? { ...i, ...patch } : i)));
  }

  const visibleScopeItems = (context?.scopeItems || []).filter(i => !excludedIds.has(i._id));
  const customTotal = customItems.reduce((s, i) => s + (Number(i.plannedQty) || 0) * (Number(i.rate) || 0), 0);
  const total = visibleScopeItems.reduce((s, i) => s + (i.plannedQty || 0) * (Number(rates[i._id]) || 0), 0) + customTotal;

  async function submit() {
    if (!contractorName.trim()) return toast.error("Your name is required");
    if (!contractorMobile.trim()) return toast.error("Your contact number is required");
    const scopeQuotedItems = visibleScopeItems
      .filter(i => Number(rates[i._id]) > 0)
      .map(i => ({ scopeItemId: i._id, description: i.description, unit: i.unit, plannedQty: i.plannedQty, rate: Number(rates[i._id]) }));
    const filledCustomItems = customItems.filter(i => i.description.trim() && Number(i.rate) > 0);
    if (filledCustomItems.some(i => !i.unit.trim() || !(Number(i.plannedQty) > 0))) {
      return toast.error("Every extra item needs a unit and a quantity greater than 0");
    }
    const customQuotedItems = filledCustomItems.map(i => ({
      scopeItemId: null, description: i.description.trim(), unit: i.unit.trim(), plannedQty: Number(i.plannedQty), rate: Number(i.rate),
    }));
    const quotedItems = [...scopeQuotedItems, ...customQuotedItems];
    if (quotedItems.length === 0) return toast.error("Enter a rate for at least one item");

    setSubmitting(true);
    try {
      const res = await pub.post(`/quotations/work-order/${workOrderId}`, {
        vendorCode, contractorName, contractorMobile, contractorEmail, remarks, quotedItems,
      });
      setSubmitted({ quotationNo: res.data?.quotation?.quotationNo || "—" });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't submit your quotation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Toaster position="top-right" />

      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 h-15 flex items-center shadow-sm">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white font-extrabold text-lg mr-3">N</div>
        <div>
          <div className="font-bold text-[#1A1A2E] leading-tight">Neoteric Properties</div>
          <div className="text-xs text-gray-400">Project Cost Center</div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-gray-700 font-semibold">
          <FileCheck2 className="w-4.5 h-4.5 text-primary" />
          Submit Quotation
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10">
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {!loading && loadError && (
          <div className="bg-white border border-red-100 rounded-xl p-8 text-center">
            <div className="text-red-500 font-bold mb-1">Couldn't load this link</div>
            <div className="text-sm text-gray-500">{loadError}</div>
          </div>
        )}

        {!loading && context && context.isLocked && !submitted && (
          <div className="bg-white border border-amber-100 rounded-xl p-8 text-center">
            <div className="text-amber-600 font-bold mb-1">Quotations are closed</div>
            <div className="text-sm text-gray-500">
              {context.workOrderNo} has already had its contractor and rates locked in.
            </div>
          </div>
        )}

        {!loading && context && !context.isLocked && !submitted && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-bold text-[#1A1A2E]">Submit a Quotation</h1>
              <p className="text-sm text-gray-500 mt-1">
                {context.workOrderNo} · {context.projectName}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Your Details</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Your Name" required value={contractorName} onChange={e => setContractorName(e.target.value)} placeholder="e.g. Shree Constructions" />
                <Field label="Contact Number" required value={contractorMobile} onChange={e => setContractorMobile(e.target.value)} placeholder="10-digit mobile" />
                <Field label="Email" value={contractorEmail} onChange={e => setContractorEmail(e.target.value)} placeholder="optional" />
                <Field label="Existing Vendor Code" value={vendorCode} onChange={e => setVendorCode(e.target.value)} placeholder="optional, if already registered" />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Quote a Rate Per Item</div>
              <Table>
                <Thead>
                  <Tr><Th>Item</Th><Th>Unit</Th><Th>Qty</Th><Th>Your Rate (₹)</Th><Th>Amount</Th><Th></Th></Tr>
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
                          className="w-28 h-8 px-2 rounded-md border border-gray-200 text-[13px] text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-primary/30"
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

              <div className="flex items-center justify-between mt-5 mb-3">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Have an extra item not listed above?</div>
                <Btn small outline icon={Plus} label="Add Item" onClick={() => setCustomItems(items => [...items, newCustomItem()])} />
              </div>
              {customItems.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-[2fr_1fr_0.8fr_0.9fr_0.9fr_32px] gap-2 px-0.5 text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                    <span>Description</span><span>Unit</span><span>Qty</span><span>Rate (₹)</span><span>Amount</span><span />
                  </div>
                  {customItems.map(item => (
                    <div key={item.key} className="grid grid-cols-[2fr_1fr_0.8fr_0.9fr_0.9fr_32px] gap-2 items-center">
                      <input
                        type="text" value={item.description} placeholder="e.g. Extra waterproofing"
                        onChange={e => updateCustomItem(item.key, { description: e.target.value })}
                        className="w-full h-8 px-2 rounded-md border border-gray-200 text-[13px] text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <SField value={item.unit} onChange={v => updateCustomItem(item.key, { unit: v })} options={UNIT_OPTIONS} placeholder="Unit" />
                      <input
                        type="number" min={0} value={item.plannedQty} placeholder="Qty"
                        onChange={e => updateCustomItem(item.key, { plannedQty: e.target.value })}
                        className="w-full h-8 px-2 rounded-md border border-gray-200 text-[13px] text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <input
                        type="number" min={0} value={item.rate} placeholder="Rate"
                        onChange={e => updateCustomItem(item.key, { rate: e.target.value })}
                        className="w-full h-8 px-2 rounded-md border border-gray-200 text-[13px] text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <span className="text-[13px] text-[#1A1A2E] font-mono">{fmt((Number(item.plannedQty) || 0) * (Number(item.rate) || 0))}</span>
                      <Btn small outline icon={Trash2} onClick={() => setCustomItems(items => items.filter(i => i.key !== item.key))} />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end text-sm mt-4">
                <span className="text-gray-500 mr-2">Total Quoted:</span>
                <span className="font-bold font-mono text-primary text-lg">{fmt(total)}</span>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <Field label="Remarks" textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Anything else you'd like to note about this quote (optional)" />
            </div>

            <div className="flex justify-end">
              <Btn label="Submit Quotation" icon={Send} color="primary" onClick={submit} loading={submitting} />
            </div>
          </div>
        )}

        {submitted && (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center shadow-sm">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <FileCheck2 className="w-7 h-7 text-emerald-500" />
            </div>
            <h2 className="text-lg font-bold text-[#1A1A2E] mb-1">Quotation Submitted!</h2>
            <p className="text-sm text-gray-500 mb-4">Your quote has been recorded successfully.</p>
            <div className="inline-block bg-primary/10 text-primary font-bold rounded-lg px-4 py-2">
              {submitted.quotationNo}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
