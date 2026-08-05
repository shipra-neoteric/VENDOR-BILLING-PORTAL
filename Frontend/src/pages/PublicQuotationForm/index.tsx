import { useEffect, useState } from "react";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import { FileCheck2, Send } from "lucide-react";
import Field from "../../ui/Field";
import Btn from "../../ui/Btn";
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

  const total = context
    ? context.scopeItems.reduce((s, i) => s + (i.plannedQty || 0) * (Number(rates[i._id]) || 0), 0)
    : 0;

  async function submit() {
    if (!contractorName.trim()) return toast.error("Your name is required");
    if (!contractorMobile.trim()) return toast.error("Your contact number is required");
    const quotedItems = (context?.scopeItems || [])
      .filter(i => Number(rates[i._id]) > 0)
      .map(i => ({ scopeItemId: i._id, description: i.description, unit: i.unit, plannedQty: i.plannedQty, rate: Number(rates[i._id]) }));
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
                  <Tr><Th>Item</Th><Th>Unit</Th><Th>Qty</Th><Th>Your Rate (₹)</Th><Th>Amount</Th></Tr>
                </Thead>
                <Tbody>
                  {context.scopeItems.map(item => (
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
                          className="w-28 h-8 px-2 rounded-md border border-gray-200 text-sm text-[#1A1A2E] focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </Td>
                      <Td><TdText>{fmt((item.plannedQty || 0) * (Number(rates[item._id]) || 0))}</TdText></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>

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
