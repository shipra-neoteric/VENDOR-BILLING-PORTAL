import { useState } from "react";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import { CheckCircle2, BookOpen, Upload, Loader2, Plus } from "lucide-react";
import { uploadToCloudinary } from "../../utils/cloudinaryUpload";
import { useFormErrors } from "../../hooks/useFormErrors";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import Btn from "../../ui/Btn";
import Badge from "../../ui/Badge";

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");
const pub  = axios.create({ baseURL: BASE.replace(/\/api$/, "/api/public") });
pub.interceptors.response.use(r => {
  if (r.data && "success" in r.data && "data" in r.data) r.data = r.data.data;
  return r;
});

const CONSULTANCY_TYPES = [
  "Architect", "Interior Designer", "Structural Consultant", "MEP Consultant",
  "Landscape Consultant", "Facade Consultant", "Quantity Surveyor",
  "Project Management Consultant", "BIM Consultant", "Environmental Consultant",
  "Lighting Consultant", "Other",
];

const DESIGN_SOFTWARE_OPTIONS = [
  "AutoCAD", "Revit", "SketchUp", "3ds Max", "Lumion", "V-Ray", "ArchiCAD",
  "STAAD Pro", "ETABS", "Primavera P6", "MS Project", "BIM 360",
];

const DOCUMENT_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "gstCertificate",  label: "GST Certificate" },
  { key: "panCard",         label: "PAN Card", required: true },
  { key: "cancelledCheque", label: "Cancelled Cheque", required: true },
  { key: "businessCard",    label: "Business Card" },
  { key: "professionalRegistrationCert", label: "Professional Registration Certificate" },
];

const MAX_FILE_MB = 5;

interface FormValues {
  firmName: string; principalName: string; consultancyType: string;
  mobile: string; alternateMobile: string; email: string; address: string;
  professionalRegistration: string; licenseNo: string; experience: string; portfolioUrl: string;
  designSoftware: string[];
  accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string; branchName: string;
  panNumber: string; aadhaarNumber: string; gstNumber: string;
}

const blankForm = (): FormValues => ({
  firmName: "", principalName: "", consultancyType: "",
  mobile: "", alternateMobile: "", email: "", address: "",
  professionalRegistration: "", licenseNo: "", experience: "", portfolioUrl: "",
  designSoftware: [],
  accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "", branchName: "",
  panNumber: "", aadhaarNumber: "", gstNumber: "",
});

type RequiredField = "firmName" | "principalName" | "consultancyType" | "mobile" | "alternateMobile" | "email" | "address"
  | "professionalRegistration" | "licenseNo" | "experience" | "portfolioUrl" | "designSoftware"
  | "accountHolderName" | "bankName" | "accountNumber" | "ifscCode" | "branchName" | "panNumber" | "aadhaarNumber";

// Design Software needs both "pick from the common list" and "type one not
// listed" (antd's Select mode="tags" did both) — a plain multi-select can't
// do the second half, so this stays a small bespoke chip-toggle + free-entry
// row rather than forcing it onto MultiSelect.
function SoftwareTagPicker({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [custom, setCustom] = useState("");
  const toggle = (s: string) => onChange(values.includes(s) ? values.filter(v => v !== s) : [...values, s]);
  function addCustom() {
    const v = custom.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setCustom("");
  }
  const extras = values.filter(v => !DESIGN_SOFTWARE_OPTIONS.includes(v));
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {DESIGN_SOFTWARE_OPTIONS.map(s => (
          <button
            key={s} type="button" onClick={() => toggle(s)}
            className={values.includes(s) ? "" : "opacity-60 hover:opacity-100"}
          >
            <Badge color={values.includes(s) ? "orange" : "gray"} small>{s}</Badge>
          </button>
        ))}
        {extras.map(s => (
          <button key={s} type="button" onClick={() => toggle(s)}>
            <Badge color="orange" small>{s} ✕</Badge>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={custom} onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
          placeholder="Type another software and press Enter…"
          className="flex-1 h-9 px-3 rounded-md border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        <Btn small outline icon={Plus} label="Add" onClick={addCustom} />
      </div>
    </div>
  );
}

export default function PublicConsultantForm() {
  const [values, setValues] = useState<FormValues>(blankForm());
  const errors = useFormErrors<RequiredField>();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState<{ consultantCode: string; firmName: string } | null>(null);
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
    const required: Exclude<RequiredField, "designSoftware">[] = [
      "firmName", "principalName", "consultancyType", "mobile", "alternateMobile", "email", "address",
      "professionalRegistration", "licenseNo", "experience", "portfolioUrl",
      "accountHolderName", "bankName", "accountNumber", "ifscCode", "branchName", "panNumber", "aadhaarNumber",
    ];
    for (const f of required) {
      if (!values[f].trim()) { errors.setError(f, "Required"); ok = false; }
    }
    if (values.designSoftware.length === 0) { errors.setError("designSoftware", "Select at least one"); ok = false; }
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
      const res = await pub.post("/consultants", { ...values, documents });
      setSubmitted({
        consultantCode: res.data?.consultant?.consultantCode ?? "—",
        firmName:       res.data?.consultant?.firmName ?? "",
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
          <div className="text-xl font-bold text-[#1A1A2E] mb-2">Consultant Registered!</div>
          <div className="text-sm text-gray-500 mb-1">{submitted.firmName} has been registered successfully.</div>
          <div className="text-xs text-gray-400 mt-3 mb-1.5">Consultant Code</div>
          <div className="flex justify-center mb-6">
            <Badge color="purple">{submitted.consultantCode}</Badge>
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
          <BookOpen className="w-4.5 h-4.5 text-primary" />
          New Consultant
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 pb-16">
        <div className="mb-7">
          <h1 className="text-xl font-bold text-[#1A1A2E]">Consultant Registration</h1>
          <p className="text-sm text-gray-500 mt-1">Fill in your firm, professional, and bank details to get registered.</p>
        </div>

        <div className="flex flex-col gap-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Firm Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Firm / Consultant Name" required placeholder="e.g. Iksana Design" value={values.firmName} onChange={e => patch({ firmName: e.target.value })} error={errors.errors.firmName} />
              <Field label="Principal Name" required placeholder="e.g. Vishal Dubey" value={values.principalName} onChange={e => patch({ principalName: e.target.value })} error={errors.errors.principalName} />
              <SField
                label="Consultancy Type" required placeholder="Select type"
                value={values.consultancyType} onChange={v => patch({ consultancyType: v })}
                options={CONSULTANCY_TYPES.map(t => ({ label: t, value: t }))}
                error={errors.errors.consultancyType}
              />
              <Field label="Mobile" required placeholder="10-digit mobile number" maxLength={10} value={values.mobile} onChange={e => patch({ mobile: e.target.value })} error={errors.errors.mobile} />
              <Field label="Alternate Mobile" required maxLength={10} value={values.alternateMobile} onChange={e => patch({ alternateMobile: e.target.value })} error={errors.errors.alternateMobile} />
              <Field label="Email" required value={values.email} onChange={e => patch({ email: e.target.value })} error={errors.errors.email} />
            </div>
            <div className="mt-3">
              <Field textarea label="Address" required placeholder="Full address…" value={values.address} onChange={e => patch({ address: e.target.value })} error={errors.errors.address} />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Professional Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Professional Registration No." required placeholder="e.g. CA/2015/12345"
                value={values.professionalRegistration} onChange={e => patch({ professionalRegistration: e.target.value })}
                error={errors.errors.professionalRegistration}
                hint="e.g. Council of Architecture (COA) registration number"
              />
              <Field label="License No." required value={values.licenseNo} onChange={e => patch({ licenseNo: e.target.value })} error={errors.errors.licenseNo} />
              <Field label="Experience" required placeholder="e.g. 12 years" value={values.experience} onChange={e => patch({ experience: e.target.value })} error={errors.errors.experience} />
              <Field label="Portfolio URL" required placeholder="https://…" value={values.portfolioUrl} onChange={e => patch({ portfolioUrl: e.target.value })} error={errors.errors.portfolioUrl} />
            </div>
            <div className="mt-3">
              <span className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Design Software <span className="text-red-500">*</span></span>
              <SoftwareTagPicker values={values.designSoftware} onChange={v => patch({ designSoftware: v })} />
              {errors.errors.designSoftware && <span className="block text-xs text-red-500 mt-1">{errors.errors.designSoftware}</span>}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Bank & Tax Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Account Holder Name" required placeholder="As per bank records" value={values.accountHolderName} onChange={e => patch({ accountHolderName: e.target.value })} error={errors.errors.accountHolderName} />
              <Field label="Bank Name" required placeholder="e.g. SBI" value={values.bankName} onChange={e => patch({ bankName: e.target.value })} error={errors.errors.bankName} />
              <Field label="Account Number" required placeholder="Bank account number" value={values.accountNumber} onChange={e => patch({ accountNumber: e.target.value })} error={errors.errors.accountNumber} />
              <Field label="IFSC Code" required placeholder="e.g. SBIN0001234" value={values.ifscCode} onChange={e => patch({ ifscCode: e.target.value })} error={errors.errors.ifscCode} />
              <Field label="Branch" required placeholder="Branch name" value={values.branchName} onChange={e => patch({ branchName: e.target.value })} error={errors.errors.branchName} />
              <Field label="PAN Number" required placeholder="10-char PAN" value={values.panNumber} onChange={e => patch({ panNumber: e.target.value })} error={errors.errors.panNumber} />
              <Field label="Aadhaar Number" required placeholder="12-digit Aadhaar" maxLength={12} value={values.aadhaarNumber} onChange={e => patch({ aadhaarNumber: e.target.value })} error={errors.errors.aadhaarNumber} />
              <Field
                label="GST Number" placeholder="15-char GST (optional)" value={values.gstNumber} onChange={e => patch({ gstNumber: e.target.value })}
                hint="Optional — many individual consultants aren't GST-registered"
              />
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
            <Btn color="primary" loading={submitting} label="Register Consultant" onClick={onSubmit} />
          </div>
        </div>
      </div>
    </div>
  );
}
