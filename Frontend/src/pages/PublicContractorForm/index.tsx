import { useState } from "react";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import { CheckCircle2, Users, Upload, Loader2 } from "lucide-react";
import { uploadToCloudinary } from "../../utils/cloudinaryUpload";
import { useFormErrors } from "../../hooks/useFormErrors";
import Field from "../../ui/Field";
import Btn from "../../ui/Btn";
import Checkbox from "../../ui/Checkbox";
import Badge from "../../ui/Badge";

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");
const pub  = axios.create({ baseURL: BASE.replace(/\/api$/, "/api/public") });
// Unwrap { success, data } envelope from backend
pub.interceptors.response.use(r => {
  if (r.data && "success" in r.data && "data" in r.data) r.data = r.data.data;
  return r;
});

const WORK_OPTIONS = [
  "General Contractors", "Excavation", "Concrete", "Framing", "Steel",
  "Window & Door", "Electrical", "Plumbing", "HVAC", "Fire Alarm & Sprinkler",
  "Roofing", "Insulation", "Drywall", "Taping", "Plaster", "Flooring",
  "Finish Carpentry", "Painting", "Masonry", "Landscaping", "Marketing",
];

const DOCUMENT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "gstCertificate",  label: "GST Certificate", required: true },
  { key: "panCard",         label: "PAN Card", required: true },
  { key: "cancelledCheque", label: "Cancelled Cheque", required: true },
  { key: "businessCard",    label: "Business Card" },
  { key: "aadhaarCard",     label: "Aadhaar Card", required: true },
];

const MAX_FILE_MB = 5;

interface FormValues {
  companyName: string; shortCode: string; ownerName: string; mobile: string; alternateMobile: string; email: string;
  address: string;
  accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string; branchName: string;
  gstNumber: string; panNumber: string; aadhaarNumber: string; reference1: string; reference2: string;
  averageTurnover: number | null; workTypes: string[];
}

const blankForm = (): FormValues => ({
  companyName: "", shortCode: "", ownerName: "", mobile: "", alternateMobile: "", email: "",
  address: "",
  accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "", branchName: "",
  gstNumber: "", panNumber: "", aadhaarNumber: "", reference1: "", reference2: "",
  averageTurnover: null, workTypes: [],
});

type RequiredField = "companyName" | "ownerName" | "mobile" | "email" | "address" | "accountHolderName" | "bankName" | "accountNumber" | "ifscCode" | "branchName" | "gstNumber" | "panNumber" | "aadhaarNumber";

export default function PublicContractorForm() {
  const [values, setValues] = useState<FormValues>(blankForm());
  const errors = useFormErrors<RequiredField>();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState<{ vendorCode: string; companyName: string } | null>(null);
  const [documents, setDocuments]   = useState<Record<string, { fileName: string; dataUrl: string } | undefined>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const patch = (p: Partial<FormValues>) => setValues(prev => ({ ...prev, ...p }));

  async function handleDocSelect(key: string, file: File) {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`${file.name} is larger than ${MAX_FILE_MB}MB`);
      return;
    }
    setUploadingKey(key);
    try {
      const url = await uploadToCloudinary(pub, file, "public-submissions", file.name);
      setDocuments(prev => ({ ...prev, [key]: { fileName: file.name, dataUrl: url } }));
    } catch {
      toast.error(`Couldn't upload ${file.name}`);
    } finally {
      setUploadingKey(null);
    }
  }

  function validate(): boolean {
    errors.clearAll();
    let ok = true;
    const required: RequiredField[] = ["companyName", "ownerName", "mobile", "email", "address", "accountHolderName", "bankName", "accountNumber", "ifscCode", "branchName", "gstNumber", "panNumber", "aadhaarNumber"];
    for (const f of required) {
      if (!values[f].trim()) { errors.setError(f, "Required"); ok = false; }
    }
    if (values.email.trim() && !/^\S+@\S+\.\S+$/.test(values.email.trim())) {
      errors.setError("email", "Enter a valid email");
      ok = false;
    }
    return ok;
  }

  async function onSubmit() {
    if (!validate()) return;
    const missingDocs = DOCUMENT_FIELDS.filter(f => f.required && !documents[f.key]);
    if (missingDocs.length) {
      toast.error(`Please attach: ${missingDocs.map(f => f.label).join(", ")}`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await pub.post("/contractors", { ...values, documents });
      setSubmitted({
        vendorCode:  res.data?.contractor?.vendorCode ?? "—",
        companyName: res.data?.contractor?.companyName ?? "",
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't submit registration");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setValues(blankForm());
    errors.clearAll();
    setDocuments({});
    setSubmitted(null);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
        <Toaster position="top-right" />
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 max-w-[480px] w-full text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
          <div className="text-xl font-bold text-[#1A1A2E] mb-2">Contractor Registered!</div>
          <div className="text-sm text-gray-500 mb-1">{submitted.companyName} has been registered successfully.</div>
          <div className="text-xs text-gray-400 mt-3 mb-1.5">Vendor Code</div>
          <div className="flex justify-center mb-6">
            <Badge color="orange">{submitted.vendorCode}</Badge>
          </div>
          <Btn color="primary" label="Register Another" onClick={reset} />
        </div>
      </div>
    );
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
          <Users className="w-4.5 h-4.5 text-primary" />
          New Contractor
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 pb-16">
        <div className="mb-7">
          <h1 className="text-xl font-bold text-[#1A1A2E]">Contractor Registration</h1>
          <p className="text-sm text-gray-500 mt-1">Fill in your firm, bank, and tax details to get registered as a vendor.</p>
        </div>

        <div className="flex flex-col gap-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Firm Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Company / Firm Name" required placeholder="e.g. ABC Infra Pvt Ltd" value={values.companyName} onChange={e => patch({ companyName: e.target.value })} error={errors.errors.companyName} />
              <Field
                label="Short Form" placeholder="e.g. D" maxLength={10} value={values.shortCode} onChange={e => patch({ shortCode: e.target.value })}
                hint="If this firm is billed under multiple vendor codes for tax reasons, use the same short form on each so they're recognizable as one group."
              />
              <Field label="Owner Name" required placeholder="e.g. Rajesh Sharma" value={values.ownerName} onChange={e => patch({ ownerName: e.target.value })} error={errors.errors.ownerName} />
              <Field label="Mobile" required placeholder="10-digit mobile number" maxLength={10} value={values.mobile} onChange={e => patch({ mobile: e.target.value })} error={errors.errors.mobile} />
              <Field label="Alternate Mobile" placeholder="Optional" maxLength={10} value={values.alternateMobile} onChange={e => patch({ alternateMobile: e.target.value })} />
              <Field label="Email" required type="email" placeholder="company@email.com" value={values.email} onChange={e => patch({ email: e.target.value })} error={errors.errors.email} />
            </div>
            <div className="mt-3">
              <Field textarea label="Address" required placeholder="Full address…" value={values.address} onChange={e => patch({ address: e.target.value })} error={errors.errors.address} />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Bank Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Account Holder Name" required placeholder="As per bank records" value={values.accountHolderName} onChange={e => patch({ accountHolderName: e.target.value })} error={errors.errors.accountHolderName} />
              <Field label="Bank Name" required placeholder="e.g. SBI" value={values.bankName} onChange={e => patch({ bankName: e.target.value })} error={errors.errors.bankName} />
              <Field label="Account Number" required placeholder="Bank account number" value={values.accountNumber} onChange={e => patch({ accountNumber: e.target.value })} error={errors.errors.accountNumber} />
              <Field label="IFSC Code" required placeholder="e.g. SBIN0001234" value={values.ifscCode} onChange={e => patch({ ifscCode: e.target.value })} error={errors.errors.ifscCode} />
              <Field label="Branch" required placeholder="Branch name" value={values.branchName} onChange={e => patch({ branchName: e.target.value })} error={errors.errors.branchName} />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Tax & Work Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="GST Number" required placeholder="15-char GST" value={values.gstNumber} onChange={e => patch({ gstNumber: e.target.value })} error={errors.errors.gstNumber} />
              <Field label="PAN Number" required placeholder="10-char PAN" value={values.panNumber} onChange={e => patch({ panNumber: e.target.value })} error={errors.errors.panNumber} />
              <Field label="Aadhaar Number" required placeholder="12-digit Aadhaar" value={values.aadhaarNumber} onChange={e => patch({ aadhaarNumber: e.target.value })} error={errors.errors.aadhaarNumber} />
              <Field label="Reference Company 1" placeholder="Optional" value={values.reference1} onChange={e => patch({ reference1: e.target.value })} />
              <Field label="Reference Company 2" placeholder="Optional" value={values.reference2} onChange={e => patch({ reference2: e.target.value })} />
              <Field
                label="Average Turnover (Lakhs)" type="number" min="0" placeholder="e.g. 50"
                value={values.averageTurnover ?? ""} onChange={e => patch({ averageTurnover: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div className="mt-4">
              <span className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Type of Work</span>
              <div className="flex flex-wrap gap-x-7 gap-y-2.5">
                {WORK_OPTIONS.map(w => (
                  <Checkbox
                    key={w} label={w}
                    checked={values.workTypes.includes(w)}
                    onChange={(checked) => patch({ workTypes: checked ? [...values.workTypes, w] : values.workTypes.filter(t => t !== w) })}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Documents</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {DOCUMENT_FIELDS.map(({ key, label, required }) => (
                <div key={key}>
                  <div className="text-[13px] font-medium mb-1.5 text-[#1A1A2E]">
                    {required && <span className="text-red-500 mr-1">*</span>}
                    {label}
                  </div>
                  <label className="inline-flex w-full">
                    <input
                      type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleDocSelect(key, f); e.target.value = ""; }}
                    />
                    <span className="w-full inline-flex items-center gap-2 h-10 px-3.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 cursor-pointer hover:bg-gray-50">
                      {uploadingKey === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span className="truncate">{uploadingKey === key ? "Uploading…" : (documents[key]?.fileName || label)}</span>
                    </span>
                  </label>
                  {documents[key] && <div className="text-[11px] text-emerald-600 mt-1">✓ Attached</div>}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 flex-wrap">
            <Btn outline label="Reset" onClick={() => { setValues(blankForm()); errors.clearAll(); setDocuments({}); }} />
            <Btn color="primary" loading={submitting} label="Register Contractor" onClick={onSubmit} />
          </div>
        </div>
      </div>
    </div>
  );
}
