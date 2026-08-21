import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Upload, X, Ruler, Eye, Pencil, Users, UserCheck, UserX } from "lucide-react";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import EmptyState from "../../ui/EmptyState";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import { SearchFilter } from "../../ui/Filters";
import Modal from "../../ui/Modal";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import { SectionHeading } from "../../ui/Descriptions";
import Spinner from "../../ui/Spinner";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import ConsultantDetailView from "../../components/ConsultantDetailView";
import apiClient from "../../services/apiClient";
import type { Consultant, ConsultancyType } from "../../types/VendorBilling";

const normalizeId = (obj: Consultant & { _id?: string }) => ({ ...obj, id: obj._id || obj.id });

const CONSULTANCY_TYPES: ConsultancyType[] = [
  "Architect", "Interior Designer", "Structural Consultant", "MEP Consultant",
  "Landscape Consultant", "Facade Consultant", "Quantity Surveyor",
  "Project Management Consultant", "BIM Consultant", "Environmental Consultant",
  "Lighting Consultant", "Other",
];

const DESIGN_SOFTWARE_OPTIONS = [
  "AutoCAD", "Revit", "SketchUp", "3ds Max", "Lumion", "V-Ray", "ArchiCAD",
  "STAAD Pro", "ETABS", "Primavera P6", "MS Project", "BIM 360",
];

const REQUIRED_FIELDS: { key: keyof typeof emptyForm; label: string }[] = [
  { key: "firmName", label: "Firm / Consultant Name" },
  { key: "principalName", label: "Principal Name" },
  { key: "consultancyType", label: "Consultancy Type" },
  { key: "address", label: "Address" },
  { key: "mobile", label: "Mobile" },
  { key: "alternateMobile", label: "Alternate Mobile" },
  { key: "email", label: "Email" },
  { key: "professionalRegistration", label: "Professional Registration No." },
  { key: "licenseNo", label: "License No." },
  { key: "experience", label: "Experience" },
  { key: "portfolioUrl", label: "Portfolio URL" },
  { key: "accountHolderName", label: "Account Holder Name" },
  { key: "bankName", label: "Bank Name" },
  { key: "accountNumber", label: "Account Number" },
  { key: "ifscCode", label: "IFSC Code" },
  { key: "branchName", label: "Branch" },
  { key: "panNumber", label: "PAN Number" },
  { key: "aadhaarNumber", label: "Aadhaar Number" },
];

const emptyForm = {
  firmName: "", principalName: "", consultancyType: "" as ConsultancyType | "", address: "",
  mobile: "", alternateMobile: "", email: "",
  professionalRegistration: "", licenseNo: "", experience: "", portfolioUrl: "",
  designSoftware: [] as string[],
  accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "", branchName: "",
  panNumber: "", aadhaarNumber: "", gstNumber: "",
};

function TagInput({ value, onChange, suggestions }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[] }) {
  const [input, setInput] = useState("");
  function add(v: string) {
    const t = v.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setInput("");
  }
  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map(v => (
            <span key={v} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-semibold px-2 py-1 rounded-md">
              {v}
              <button type="button" onClick={() => onChange(value.filter(x => x !== v))}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if ((e.key === "Enter" || e.key === ",") && input.trim()) { e.preventDefault(); add(input); } }}
        placeholder="Type software name and press Enter…"
        className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm text-[#1A1A2E] dark:text-[#F1F5F9] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
      <div className="flex flex-wrap gap-1.5 mt-2">
        {suggestions.filter(s => !value.includes(s)).map(s => (
          <button key={s} type="button" onClick={() => add(s)}
            className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-primary hover:text-primary">
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Consultants() {
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editingConsultant, setEditingConsultant] = useState<Consultant | null>(null);
  const [viewOpen, setViewOpen]     = useState(false);
  const [selected, setSelected]     = useState<Consultant | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    apiClient
      .get<{ consultants: Consultant[] }>("/consultants")
      .then((r) => setConsultants(r.data.consultants.map(normalizeId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = consultants.filter(
    (c) =>
      (c.consultantCode.toLowerCase().includes(search.toLowerCase()) ||
        c.firmName.toLowerCase().includes(search.toLowerCase()) ||
        c.principalName.toLowerCase().includes(search.toLowerCase()) ||
        c.mobile.includes(search)) &&
      (statusFilter === "all" || (c.status || "active") === statusFilter)
  );

  const activeCount = consultants.filter(c => (c.status || "active") === "active").length;
  const inactiveCount = consultants.length - activeCount;
  const hasActiveFilters = search !== "" || statusFilter !== "all";
  const clearAllFilters = () => { setSearch(""); setStatusFilter("all"); };

  function openAdd() {
    setEditingConsultant(null);
    setForm(emptyForm);
    setRegisterOpen(true);
  }

  const openEdit = (record: Consultant) => {
    setForm({
      firmName: record.firmName, principalName: record.principalName, consultancyType: record.consultancyType,
      address: record.address ?? "", mobile: record.mobile, alternateMobile: record.alternateMobile ?? "",
      email: record.email ?? "", professionalRegistration: record.professionalRegistration ?? "",
      licenseNo: record.licenseNo ?? "", experience: record.experience ?? "", portfolioUrl: record.portfolioUrl ?? "",
      designSoftware: record.designSoftware ?? [],
      accountHolderName: record.accountHolderName ?? "", bankName: record.bankName ?? "",
      accountNumber: record.accountNumber ?? "", ifscCode: record.ifscCode ?? "", branchName: record.branchName ?? "",
      panNumber: record.panNumber ?? "", aadhaarNumber: record.aadhaarNumber ?? "", gstNumber: record.gstNumber ?? "",
    });
    setEditingConsultant(record);
    setRegisterOpen(true);
  };

  const handleRegister = async () => {
    const missing = REQUIRED_FIELDS.find(f => !form[f.key]);
    if (missing) return toast.error(`${missing.label} is required`);
    if (form.designSoftware.length === 0) return toast.error("Select at least one design software");

    setSaving(true);
    try {
      if (editingConsultant) {
        const res = await apiClient.put<{ consultant: Consultant }>(`/consultants/${editingConsultant.id}`, form);
        const updated = normalizeId(res.data.consultant);
        setConsultants((prev) => prev.map((c) => (c.id === editingConsultant.id ? updated : c)));
        toast.success(`${res.data.consultant.firmName} updated`);
      } else {
        const res = await apiClient.post<{ consultant: Consultant }>("/consultants", form);
        setConsultants((prev) => [normalizeId(res.data.consultant), ...prev]);
        toast.success(`${res.data.consultant.firmName} registered as ${res.data.consultant.consultantCode}`);
      }
      setEditingConsultant(null);
      setRegisterOpen(false);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  function viewProfile(record: Consultant) {
    setSelected(record);
    setViewOpen(true);
    apiClient.get<{ consultant: Consultant }>(`/consultants/${record.id}`).then(res => {
      const full = normalizeId(res.data.consultant);
      setSelected(full);
      setConsultants(prev => prev.map(c => c.id === record.id ? full : c));
    }).catch(() => {});
  }

  return (
    <div>
      <PageHeader
        title="Consultants"
        subtitle="Manage registered architects, designers, and professional-services firms."
        icon={Ruler}
        actions={<NxBtn label="Register Consultant" icon={Plus} color="primary" onClick={openAdd} />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-5">
        <NxStatCard
          label="Total Consultants" value={consultants.length} icon={Users}
          active={statusFilter === "all"} onClick={() => setStatusFilter("all")}
        />
        <NxStatCard
          label="Active" value={activeCount} icon={UserCheck}
          active={statusFilter === "active"} onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
        />
        <NxStatCard
          label="Inactive" value={inactiveCount} icon={UserX}
          active={statusFilter === "inactive"} onClick={() => setStatusFilter(statusFilter === "inactive" ? "all" : "inactive")}
        />
      </div>

      <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
        <div className="flex gap-2.5 items-center flex-wrap">
          <SearchFilter value={search} onChange={setSearch} placeholder="Search by consultant code, firm, principal, or mobile…" />
          {hasActiveFilters && <Btn small outline label="Clear all" onClick={clearAllFilters} />}
          <span className="ml-auto text-gray-400 text-xs whitespace-nowrap">
            {filtered.length} consultant{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {loading ? (
        <Spinner size="large" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Ruler}
          title={search ? "No consultants match your search" : "No consultants yet"}
          message={!search ? 'Click "Register Consultant" to add your first firm.' : undefined}
          actionLabel={!search ? "Register Consultant" : undefined}
          onAction={!search ? openAdd : undefined}
        />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Consultant Code</Th>
              <Th>Firm / Consultant</Th>
              <Th>Principal</Th>
              <Th>Type</Th>
              <Th>Mobile</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map(c => (
              <Tr key={c.id} className="cursor-pointer" onClick={() => viewProfile(c)}>
                <Td><TdText>{c.consultantCode}</TdText></Td>
                <Td><TdText>{c.firmName}</TdText></Td>
                <Td><TdText>{c.principalName}</TdText></Td>
                <Td><TdText>{c.consultancyType}</TdText></Td>
                <Td><TdText>{c.mobile}</TdText></Td>
                <Td><NxBadge color={(c.status || "active") === "active" ? "green" : "red"}>{(c.status || "active").toUpperCase()}</NxBadge></Td>
                <Td>
                  <div onClick={e => e.stopPropagation()} className="flex items-center gap-1">
                    <NxBtn color="icon" title="View Consultant" icon={Eye} onClick={() => viewProfile(c)} />
                    <NxBtn color="icon" title="Edit Consultant" icon={Pencil} onClick={() => openEdit(c)} />
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {/* ── Register Consultant Modal ─────────────────────────── */}
      {registerOpen && (
        <Modal
          title={editingConsultant ? "Edit Consultant" : "Register Consultant"}
          subtitle={editingConsultant ? `Editing ${editingConsultant.consultantCode}` : "Fill in firm, professional, and bank details"}
          icon={Ruler}
          wide
          onClose={() => { setRegisterOpen(false); setEditingConsultant(null); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn label="Cancel" outline onClick={() => { setRegisterOpen(false); setEditingConsultant(null); }} />
              <Btn label={editingConsultant ? "Save Changes" : "Register Consultant"} color="primary" loading={saving} onClick={handleRegister} />
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <SectionHeading>Firm Details</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Firm / Consultant Name" required placeholder="e.g. Iksana Design"
                value={form.firmName} onChange={e => setForm(f => ({ ...f, firmName: e.target.value }))} />
              <Field label="Principal Name" required placeholder="e.g. Vishal Dubey"
                value={form.principalName} onChange={e => setForm(f => ({ ...f, principalName: e.target.value }))} />
            </div>
            <SField label="Consultancy Type" required placeholder="Select type"
              value={form.consultancyType || null}
              onChange={v => setForm(f => ({ ...f, consultancyType: v as ConsultancyType }))}
              options={CONSULTANCY_TYPES.map(t => ({ label: t, value: t }))} />
            <Field textarea label="Address" required rows={2} placeholder="Full address…"
              value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mobile" required placeholder="10-digit mobile"
                value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} />
              <Field label="Alternate Mobile" required
                value={form.alternateMobile} onChange={e => setForm(f => ({ ...f, alternateMobile: e.target.value }))} />
            </div>
            <Field label="Email" required type="email" placeholder="firm@email.com"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />

            <SectionHeading>Professional Details</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Professional Registration No." required placeholder="e.g. CA/2015/12345"
                hint="e.g. Council of Architecture (COA) registration number"
                value={form.professionalRegistration} onChange={e => setForm(f => ({ ...f, professionalRegistration: e.target.value }))} />
              <Field label="License No." required
                value={form.licenseNo} onChange={e => setForm(f => ({ ...f, licenseNo: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Experience" required placeholder="e.g. 12 years"
                value={form.experience} onChange={e => setForm(f => ({ ...f, experience: e.target.value }))} />
              <Field label="Portfolio URL" required placeholder="https://…"
                value={form.portfolioUrl} onChange={e => setForm(f => ({ ...f, portfolioUrl: e.target.value }))} />
            </div>
            <div>
              <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">Design Software <span className="text-red-500">*</span></span>
              <TagInput value={form.designSoftware} onChange={v => setForm(f => ({ ...f, designSoftware: v }))} suggestions={DESIGN_SOFTWARE_OPTIONS} />
            </div>

            <SectionHeading>Bank Details</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Account Holder Name" required
                value={form.accountHolderName} onChange={e => setForm(f => ({ ...f, accountHolderName: e.target.value }))} />
              <Field label="Bank Name" required placeholder="e.g. HDFC Bank"
                value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Account Number" required
                value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))} />
              <Field label="IFSC Code" required
                value={form.ifscCode} onChange={e => setForm(f => ({ ...f, ifscCode: e.target.value }))} />
              <Field label="Branch" required
                value={form.branchName} onChange={e => setForm(f => ({ ...f, branchName: e.target.value }))} />
            </div>

            <SectionHeading>Tax Details</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <Field label="PAN Number" required placeholder="10-char PAN"
                value={form.panNumber} onChange={e => setForm(f => ({ ...f, panNumber: e.target.value }))} />
              <Field label="Aadhaar Number" required placeholder="12-digit Aadhaar" maxLength={12}
                value={form.aadhaarNumber} onChange={e => setForm(f => ({ ...f, aadhaarNumber: e.target.value }))} />
            </div>
            <Field label="GST Number" placeholder="15-char GST (optional)"
              hint="Optional — many individual consultants aren't GST-registered"
              value={form.gstNumber} onChange={e => setForm(f => ({ ...f, gstNumber: e.target.value }))} />

            <SectionHeading>Documents</SectionHeading>
            <div className="flex flex-col gap-2.5">
              {["GST Certificate", "PAN Card", "Cancelled Cheque", "Business Card", "Professional Registration Certificate"].map(doc => (
                <Btn key={doc} outline icon={Upload} label={doc} className="w-[260px] justify-start" />
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* ── View Profile Modal ────────────────────────────────── */}
      {viewOpen && selected && (
        <Modal
          title={selected.firmName} subtitle={selected.consultantCode}
          onClose={() => setViewOpen(false)}
          footer={<Btn label="Close" outline onClick={() => setViewOpen(false)} />}
        >
          <ConsultantDetailView consultant={selected} />
        </Modal>
      )}
    </div>
  );
}
