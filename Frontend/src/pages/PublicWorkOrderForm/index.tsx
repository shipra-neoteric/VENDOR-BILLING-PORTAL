import { useEffect, useState } from "react";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import { CheckCircle2, FileText, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import dayjs from "dayjs";
import { selectableProjects } from "../../utils/projectOptions";
import { useFormErrors } from "../../hooks/useFormErrors";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import { DatePicker } from "../../ui/DatePicker";
import Btn from "../../ui/Btn";
import Badge from "../../ui/Badge";
import Spinner from "../../ui/Spinner";
import WarrantyTermsBuilder from "../../components/WarrantyTermsBuilder";
import GstSelect from "../../components/GstSelect";
import DocumentsUpload from "../../components/DocumentsUpload";
import type { WODocument } from "../../components/DocumentsUpload";

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");
const pub  = axios.create({ baseURL: BASE.replace(/\/api$/, "/api/public") });
// Unwrap { success, data } envelope from backend
pub.interceptors.response.use(r => {
  if (r.data && "success" in r.data && "data" in r.data) r.data = r.data.data;
  return r;
});

const STATUS_OPTIONS = [
  { label: "Draft",       value: "draft"       },
  { label: "Issued",      value: "issued"      },
  { label: "In Progress", value: "in-progress" },
];

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

// ── Types ────────────────────────────────────────────────────────

interface CatOption { _id: string; name: string; parentId: string | null; }
interface Contractor { vendorCode: string; companyName: string; ownerName: string; }
interface Lookup     { _id: string; name: string; parentId?: string | null; location?: string; }

interface SubItemDraft {
  id: string;
  description: string;
  unit: string;
  plannedQty: number | null;
  rate: number | null;
}

interface ScopeDraft {
  id: string;
  subCategoryId: string;
  description: string;
  unit: string;
  plannedQty: number | null;
  rate: number | null;
  gstPercent: number;
  remarks: string;
  plannedStart: string;
  plannedEnd: string;
  showSubItems: boolean;
  subItems: SubItemDraft[];
}

// ── Helpers ──────────────────────────────────────────────────────

const fmt = (n: number) => "₹" + (n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Sub-items ("Particulars") are a read-only descriptive breakdown — the main
// item's own qty/rate always drives the amount, so the two never get summed
// together.
function calcItemAmt(item: ScopeDraft) {
  return (item.plannedQty || 0) * (item.rate || 0);
}

function calcItemInclGst(item: ScopeDraft) {
  return calcItemAmt(item) * (1 + (item.gstPercent || 0) / 100);
}

function newScope(gstPercent = 18): ScopeDraft {
  return {
    id: crypto.randomUUID(), subCategoryId: "", description: "",
    unit: "sq.ft", plannedQty: null, rate: null, gstPercent,
    remarks: "", plannedStart: "", plannedEnd: "",
    showSubItems: false, subItems: [],
  };
}

function newSubItem(): SubItemDraft {
  return { id: crypto.randomUUID(), description: "", unit: "sq.ft", plannedQty: null, rate: null };
}

// ── AmtBox ───────────────────────────────────────────────────────

function AmtBox({ value }: { value: number }) {
  return (
    <div className="bg-primary/5 border border-primary/20 rounded-md px-2.5 py-1.5 font-mono font-bold text-primary text-xs min-h-[36px] flex items-center">
      {value > 0 ? fmt(value) : "—"}
    </div>
  );
}

// ── Sub-category select that lets vendors type a name that isn't in the
// preset list. Unlike the internal Work Orders page, this public form has no
// login, so it can't call the (auth-protected) category-creation endpoint —
// a typed name is simply carried through as free-text `description` on the
// scope item instead of being added to the shared category list.
function SubCategorySelect({
  value, options, onSelect, onClear,
}: {
  value?: string;
  options: { label: string; value: string }[];
  onSelect: (id: string, name: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const trimmed = search.trim();
  const exists = trimmed.length > 0 && options.some(o => o.label.toLowerCase() === trimmed.toLowerCase());
  const filtered = trimmed ? options.filter(o => o.label.toLowerCase().includes(trimmed.toLowerCase())) : options;
  const selected = options.find(o => o.value === value);

  return (
    <div className="relative">
      <button
        type="button" onClick={() => setOpen(o => !o)}
        className="w-full h-9 px-2.5 rounded-md border border-gray-200 bg-white text-sm flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      >
        <span className={selected ? "text-[#1A1A2E] truncate" : "text-gray-400 truncate"}>{selected ? selected.label : "Select or type to add sub-category"}</span>
        {selected && <span onClick={(e) => { e.stopPropagation(); onClear(); setSearch(""); }} className="text-gray-400 hover:text-gray-600 shrink-0">✕</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100">
              <input
                autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Type a name…" className="w-full text-sm bg-transparent outline-none text-[#1A1A2E] placeholder:text-gray-400"
              />
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {filtered.map(o => (
                <button
                  key={o.value} type="button"
                  onClick={() => { onSelect(o.value, o.label); setSearch(""); setOpen(false); }}
                  className="w-full flex items-center px-3 py-2 text-sm text-left text-[#1A1A2E]! hover:bg-gray-50"
                >
                  {o.label}
                </button>
              ))}
              {trimmed.length > 0 && !exists && (
                <button
                  type="button"
                  onClick={() => { onSelect("", trimmed); setSearch(""); setOpen(false); }}
                  className="w-full flex items-center gap-1.5 px-3 py-2 text-sm text-left text-primary! hover:bg-primary/5"
                >
                  <Plus className="w-3.5 h-3.5" /> Use "{trimmed}" as sub-category
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── ScopeItemCard ────────────────────────────────────────────────

function ScopeItemCard({
  item, idx, allCategories, topCatId,
  onChange, onRemove,
}: {
  item: ScopeDraft;
  idx: number;
  allCategories: CatOption[];
  topCatId: string;
  onChange: (patch: Partial<ScopeDraft>) => void;
  onRemove: () => void;
}) {
  const subCatOptions = topCatId
    ? allCategories.filter(c => c.parentId === topCatId)
    : [];

  const amt = calcItemAmt(item);

  const updSub = (subId: string, patch: Partial<SubItemDraft>) =>
    onChange({ subItems: item.subItems.map(s => s.id === subId ? { ...s, ...patch } : s) });

  return (
    <div className="border border-gray-200 rounded-lg mb-3 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-3.5 py-2 flex items-center gap-2 border-b border-gray-200">
        <span className="bg-primary text-white rounded-full w-[22px] h-[22px] inline-flex items-center justify-center text-[11px] font-bold shrink-0">{idx + 1}</span>
        <span className="font-semibold text-[13px] flex-1 text-[#1A1A2E] truncate">{item.description || `Work Item ${idx + 1}`}</span>
        {amt > 0 && <span className="font-mono text-primary font-bold text-[13px]">{fmt(amt)}</span>}
        <button type="button" onClick={onRemove} className="text-red-500 hover:bg-red-50 rounded p-1"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>

      {/* Body */}
      <div className="p-3.5 pb-2.5">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div className="col-span-2 sm:col-span-1">
            {subCatOptions.length > 0 ? (
              <>
                <div className="text-[11px] text-gray-400 mb-1">Sub-Category *</div>
                <SubCategorySelect
                  value={item.subCategoryId}
                  options={subCatOptions.map(c => ({ label: c.name, value: c._id }))}
                  onSelect={(id, name) => onChange({ subCategoryId: id, description: name })}
                  onClear={() => onChange({ subCategoryId: "", description: "" })}
                />
              </>
            ) : (
              <>
                <div className="text-[11px] text-gray-400 mb-1">Description *</div>
                <Field placeholder="e.g. Raft Area, Plaster Works, HT Panel…" value={item.description} onChange={e => onChange({ description: e.target.value })} />
              </>
            )}
          </div>
          <div>
            <div className="text-[11px] text-gray-400 mb-1">Unit</div>
            <SField value={item.unit} onChange={v => onChange({ unit: v })} options={UNIT_OPTIONS} />
          </div>
          <div>
            <div className="text-[11px] text-gray-400 mb-1">Planned Qty</div>
            <Field type="number" min="0" step="0.01" placeholder="Qty" value={item.plannedQty ?? ""} onChange={e => onChange({ plannedQty: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div>
            <div className="text-[11px] text-gray-400 mb-1">Rate (₹)</div>
            <Field type="number" min="0" placeholder="Rate" value={item.rate ?? ""} onChange={e => onChange({ rate: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div>
            <div className="text-[11px] text-gray-400 mb-1">Amount</div>
            <AmtBox value={amt} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2 items-end">
          <div>
            <div className="text-[11px] text-gray-400 mb-1">GST %</div>
            <GstSelect value={item.gstPercent} onChange={v => onChange({ gstPercent: v })} />
          </div>
          <div className="col-span-3 pb-2 text-xs text-gray-600">
            Amount incl. GST: <strong className="text-primary font-mono">{amt > 0 ? fmt(calcItemInclGst(item)) : "—"}</strong>
          </div>
        </div>

        <div className="mt-2">
          <div className="text-[11px] text-gray-400 mb-1">Notes / Remarks (optional)</div>
          <Field placeholder="e.g. RCC wall, 1st floor, upto 300MM…" value={item.remarks} onChange={e => onChange({ remarks: e.target.value })} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 mt-2.5 items-end">
          <div>
            <div className="text-[11px] text-gray-400 mb-1">Start Date <span className="text-red-500">*</span></div>
            <DatePicker value={item.plannedStart} onChange={v => onChange({ plannedStart: v })} />
          </div>
          <div>
            <div className="text-[11px] text-gray-400 mb-1">End Date <span className="text-red-500">*</span></div>
            <DatePicker value={item.plannedEnd} onChange={v => onChange({ plannedEnd: v })} />
          </div>
          <div className="sm:col-span-2 pb-1">
            <button
              type="button" onClick={() => onChange({ showSubItems: !item.showSubItems })}
              className="text-gray-500 text-xs font-semibold hover:text-gray-700 inline-flex items-center gap-1"
            >
              {item.showSubItems ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {item.showSubItems ? "Hide" : "Add"} Particulars
              {item.subItems.length > 0 && <span className="ml-1"><Badge color="blue" small>{item.subItems.length}</Badge></span>}
            </button>
          </div>
        </div>

        {item.showSubItems && (
          <div className="mt-3 bg-gray-50/60 border border-gray-200 rounded-md p-3">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">
              Particulars — Reference Only, Not Included in Contract Value
            </div>
            {item.subItems.length === 0 && <div className="text-gray-400 text-xs mb-2">No sub-items yet.</div>}
            {item.subItems.map((si, siIdx) => (
              <div key={si.id} className="flex gap-2 items-center mb-2 bg-white border border-gray-200 rounded-md p-2.5 flex-wrap">
                <span className="text-[11px] text-gray-400 min-w-[28px] font-semibold">{idx + 1}.{siIdx + 1}</span>
                <input
                  placeholder="Sub-item description" value={si.description} onChange={e => updSub(si.id, { description: e.target.value })}
                  className="flex-[2] min-w-[180px] h-8 px-2.5 rounded-md border border-gray-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <div className="w-[130px]"><SField value={si.unit} onChange={v => updSub(si.id, { unit: v })} options={UNIT_OPTIONS} /></div>
                <input
                  type="number" placeholder="Qty" min={0} step={0.01} value={si.plannedQty ?? ""}
                  onChange={e => updSub(si.id, { plannedQty: e.target.value === "" ? null : Number(e.target.value) })}
                  className="w-[90px] h-8 px-2 rounded-md border border-gray-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <input
                  type="number" placeholder="Rate" min={0} value={si.rate ?? ""}
                  onChange={e => updSub(si.id, { rate: e.target.value === "" ? null : Number(e.target.value) })}
                  className="w-[100px] h-8 px-2 rounded-md border border-gray-200 bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <div className="min-w-[90px]"><AmtBox value={(si.plannedQty || 0) * (si.rate || 0)} /></div>
                <button type="button" onClick={() => onChange({ subItems: item.subItems.filter(s => s.id !== si.id) })} className="text-red-500 hover:bg-red-50 rounded p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <Btn small outline icon={Plus} label="Add Sub-Item" onClick={() => onChange({ subItems: [...item.subItems, newSubItem()], showSubItems: true })} />
          </div>
        )}
      </div>
    </div>
  );
}

interface FormValues {
  preparedByName: string; preparedByContact: string; companyId: string;
  projectId: string; projectLocation: string; issueDate: string;
  vendorCode: string; category: string; status: string; gstPercent: number; scopeOfWork: string;
}

const blankForm = (): FormValues => ({
  preparedByName: "", preparedByContact: "", companyId: "",
  projectId: "", projectLocation: "", issueDate: "",
  vendorCode: "", category: "", status: "draft", gstPercent: 18, scopeOfWork: "",
});

// ── Main Component ───────────────────────────────────────────────

export default function PublicWorkOrderForm() {
  const [values, setValues] = useState<FormValues>(blankForm());
  const errors = useFormErrors<"preparedByName" | "preparedByContact" | "projectId" | "issueDate" | "vendorCode">();
  const patch = (p: Partial<FormValues>) => setValues(prev => ({ ...prev, ...p }));

  const [projects,    setProjects]    = useState<Lookup[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [allCats,     setAllCats]     = useState<CatOption[]>([]);
  const [companies,   setCompanies]   = useState<Lookup[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState<{ workOrderNo: string } | null>(null);
  const [scopeItems,  setScopeItems]  = useState<ScopeDraft[]>([newScope()]);
  const [topCatId,    setTopCatId]    = useState<string>("");
  const [documents,   setDocuments]   = useState<WODocument[]>([]);
  const [docsUploading, setDocsUploading] = useState(false);
  const [warrantyTerms, setWarrantyTerms] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      pub.get("/projects"),
      pub.get("/contractors"),
      pub.get("/categories"),
      pub.get("/companies"),
    ]).then(([p, c, cat, co]) => {
      setProjects(p.data.projects    || []);
      setContractors(c.data.contractors || []);
      setAllCats(cat.data.categories   || []);
      setCompanies(co.data.companies   || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const topCatOptions = allCats.filter(c => !c.parentId);

  const contractValue = scopeItems.reduce((s, i) => s + calcItemAmt(i), 0);
  const contractValueInclGst = scopeItems.reduce((s, i) => s + calcItemInclGst(i), 0);

  function patchItem(id: string, patch: Partial<ScopeDraft>) {
    setScopeItems(items => items.map(it => it.id === id ? { ...it, ...patch } : it));
  }

  function validate(): boolean {
    errors.clearAll();
    let ok = true;
    if (!values.preparedByName.trim()) { errors.setError("preparedByName", "Your name is required"); ok = false; }
    if (!values.preparedByContact.trim()) { errors.setError("preparedByContact", "Your contact is required"); ok = false; }
    if (!values.projectId) { errors.setError("projectId", "Select a project"); ok = false; }
    if (!values.issueDate) { errors.setError("issueDate", "Select issue date"); ok = false; }
    if (!values.vendorCode) { errors.setError("vendorCode", "Select a vendor"); ok = false; }
    return ok;
  }

  async function onSubmit() {
    if (!validate()) return;
    if (docsUploading) {
      toast.error("A document is still uploading — wait for it to finish before saving");
      return;
    }
    if (scopeItems.some(i => (i.description.trim() || i.subCategoryId) && (!i.plannedStart || !i.plannedEnd))) {
      toast.error("Start Date and End Date are required for every work item");
      return;
    }
    setSubmitting(true);
    try {
      const validScope = scopeItems.filter(i => i.description.trim() || i.subCategoryId);
      const payload = {
        projectId:   values.projectId,
        projectLocation: values.projectLocation || "",
        vendorCode:  values.vendorCode,
        issueDate:   dayjs(values.issueDate).toISOString(),
        companyId:   values.companyId  || null,
        category:    topCatOptions.find(c => c._id === topCatId)?.name || values.category || "",
        scopeOfWork: values.scopeOfWork || "",
        status:      values.status     || "draft",
        gstPercent:  values.gstPercent ?? 18,
        documents:   documents,
        preparedByName:    values.preparedByName    || "",
        preparedByContact: values.preparedByContact || "",
        warrantyTerms: warrantyTerms.filter(t => t.trim()),
        scopeItems: validScope.map(i => ({
          description: i.description,
          unit:        i.unit,
          plannedQty:  i.plannedQty || 0,
          rate:        i.rate || 0,
          amount:      calcItemAmt(i),
          gstPercent:  i.gstPercent,
          remarks:     i.remarks,
          plannedStart: i.plannedStart,
          plannedEnd:   i.plannedEnd,
          subItems:    i.subItems.map(si => ({
            description: si.description,
            unit:        si.unit,
            plannedQty:  si.plannedQty || 0,
            rate:        si.rate || 0,
            amount:      (si.plannedQty || 0) * (si.rate || 0),
          })),
        })),
        contractValue,
      };
      const res = await pub.post("/work-orders", payload);
      setSubmitted({ workOrderNo: res.data?.workOrder?.workOrderNo || "—" });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't submit work order");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setValues(blankForm());
    errors.clearAll();
    setScopeItems([newScope()]);
    setTopCatId("");
    setDocuments([]);
    setWarrantyTerms([]);
    setSubmitted(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <Spinner size="large" label="Loading form…" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
        <Toaster position="top-right" />
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 max-w-[480px] w-full text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
          <div className="text-xl font-bold text-[#1A1A2E] mb-2">Work Order Submitted!</div>
          <div className="text-sm text-gray-500 mb-1">Your request has been submitted successfully.</div>
          <div className="text-xs text-gray-400 mt-3 mb-1.5">Work Order Number</div>
          <div className="flex justify-center mb-6">
            <Badge color="orange">{submitted.workOrderNo}</Badge>
          </div>
          <Btn color="primary" label="Submit Another" onClick={reset} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Toaster position="top-right" />

      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 h-15 flex items-center shadow-sm">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white font-extrabold text-lg mr-3">N</div>
        <div>
          <div className="font-bold text-[#1A1A2E] leading-tight">Neoteric Properties</div>
          <div className="text-xs text-gray-400">Project Cost Center</div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-gray-700 font-semibold">
          <FileText className="w-4.5 h-4.5 text-primary" />
          New Work Order
        </div>
      </div>

      {/* Body */}
      <div className="max-w-[900px] mx-auto px-4 py-8 pb-16">
        <div className="mb-7">
          <h1 className="text-xl font-bold text-[#1A1A2E]">Work Order Request</h1>
          <p className="text-sm text-gray-500 mt-1">Fill in the details below to create a new work order.</p>
        </div>

        <div className="flex flex-col gap-5">
          {/* ── Order Details ── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Order Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Work Order Number" disabled placeholder="Auto-assign on submit" value="" onChange={() => {}} />
              <Field label="Your Name" required placeholder="e.g. Yash Gupta" value={values.preparedByName} onChange={e => patch({ preparedByName: e.target.value })} error={errors.errors.preparedByName} />
              <Field label="Your Contact" required placeholder="Phone or email" value={values.preparedByContact} onChange={e => patch({ preparedByContact: e.target.value })} error={errors.errors.preparedByContact} />
              <SField
                label="Issuing Company" placeholder="Select company (optional)"
                value={values.companyId} onChange={v => patch({ companyId: v })}
                options={[{ value: "", label: "— None —" }, ...companies.map(c => ({ label: c.name, value: c._id }))]}
              />
              <SField
                label="Project" required placeholder="Select project"
                value={values.projectId} onChange={v => patch({ projectId: v })}
                options={selectableProjects(projects).map(p => ({ label: p.name, value: p._id }))}
                error={errors.errors.projectId}
              />
              <Field
                label="Location" placeholder="e.g. Tower A, Ground Floor"
                value={values.projectLocation} onChange={e => patch({ projectLocation: e.target.value })}
                hint="Exact site location for this work order (e.g. tower, plot no., landmark)"
              />
              <div>
                <DatePicker label="Issue Date *" value={values.issueDate} onChange={v => patch({ issueDate: v })} />
                {errors.errors.issueDate && <span className="block text-xs text-red-500 mt-1">{errors.errors.issueDate}</span>}
              </div>
              <SField
                label="Vendor Code" required placeholder="Select vendor"
                value={values.vendorCode} onChange={v => patch({ vendorCode: v })}
                options={contractors.map(c => ({ label: `${c.vendorCode} — ${c.companyName}`, value: c.vendorCode }))}
                error={errors.errors.vendorCode}
              />
              <SField
                label="Category" placeholder="Select category (optional)"
                value={values.category} onChange={v => { patch({ category: v }); setTopCatId(v || ""); }}
                options={[{ value: "", label: "— None —" }, ...topCatOptions.map(c => ({ label: c.name, value: c._id }))]}
              />
              <SField label="Status" value={values.status} onChange={v => patch({ status: v })} options={STATUS_OPTIONS} />
              <div>
                <span className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">GST Slab</span>
                <GstSelect value={values.gstPercent} onChange={v => patch({ gstPercent: v })} />
              </div>
            </div>

            <div className="mt-3">
              <Field
                textarea label="Overall Description / Scope of Work"
                placeholder="e.g. Supply and installation of false ceiling including framework, boarding and finishing as per approved drawings..."
                value={values.scopeOfWork} onChange={e => patch({ scopeOfWork: e.target.value })}
                hint="Describe the full scope of this work order"
              />
            </div>

            <div className="mt-3">
              <span className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Upload Work Order Documents</span>
              <DocumentsUpload value={documents} onChange={setDocuments} uploadClient={pub} onUploadingChange={setDocsUploading} />
            </div>
          </div>

          {/* ── Scope of Work ── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 mb-1 border-b border-gray-100">
              <div className="font-bold text-sm text-[#1A1A2E]">Scope of Work</div>
              <Btn small outline icon={Plus} label="Add Work Item" onClick={() => setScopeItems(s => [...s, newScope(values.gstPercent)])} />
            </div>

            <div className="pt-3.5">
              {scopeItems.length === 0 && (
                <div className="border-2 border-dashed border-gray-200 rounded-lg py-8 px-5 text-center text-gray-400 mb-3">
                  <div className="text-3xl mb-2">📐</div>
                  <div className="font-semibold text-gray-600">No work items yet</div>
                  <div className="text-xs mt-1">Click "Add Work Item" to define the scope.</div>
                </div>
              )}

              {scopeItems.map((item, idx) => (
                <ScopeItemCard
                  key={item.id}
                  item={item}
                  idx={idx}
                  allCategories={allCats}
                  topCatId={topCatId}
                  onChange={p => patchItem(item.id, p)}
                  onRemove={() => setScopeItems(s => s.filter(x => x.id !== item.id))}
                />
              ))}

              {contractValue > 0 && (
                <>
                  <div className="border-t border-gray-200 my-2" />
                  <div className="flex justify-end items-center gap-3">
                    <span className="text-gray-400 text-sm">Contract Value ({scopeItems.length} item{scopeItems.length !== 1 ? "s" : ""}) — Excl. GST:</span>
                    <span className="font-semibold text-[14px]">{fmt(contractValue)}</span>
                  </div>
                  <div className="flex justify-end items-center gap-3 mt-1.5">
                    <span className="text-gray-400 text-sm">GST (per work item, see above):</span>
                    <span className="text-[13px]">{fmt(contractValueInclGst - contractValue)}</span>
                  </div>
                  <div className="flex justify-end items-center gap-3 mt-1.5">
                    <span className="font-bold">Total Contract Value — Incl. GST:</span>
                    <span className="font-bold text-lg text-primary">{fmt(contractValueInclGst)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Warranty / Guarantee Terms ── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <WarrantyTermsBuilder items={warrantyTerms} onChange={setWarrantyTerms} />
          </div>

          {/* ── Submit ── */}
          <div className="flex justify-end gap-3 flex-wrap">
            <Btn outline label="Reset" onClick={reset} />
            <Btn color="primary" loading={submitting} disabled={docsUploading} label="Save Work Order" onClick={onSubmit} />
          </div>
        </div>
      </div>
    </div>
  );
}
