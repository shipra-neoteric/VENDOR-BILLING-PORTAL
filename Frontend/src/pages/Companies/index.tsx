import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, RotateCw, Landmark } from "lucide-react";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import KPICard from "../../ui/KPICard";
import Badge from "../../ui/Badge";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import { SearchFilter } from "../../ui/Filters";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import Spinner from "../../ui/Spinner";
import Alert from "../../ui/Alert";

// ── Types ──────────────────────────────────────────────────────
interface Company {
  _id: string;
  name: string;
  shortCode: string;
  type: string;
  cin?: string;
  gstNumber?: string;
  panNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  color: string;
  isActive: boolean;
  createdAt?: string;
}

const COMPANY_TYPES = [
  "Private Limited",
  "LLP",
  "Proprietorship",
  "Partnership",
  "Company",
  "Other",
];

const TYPE_COLORS: Record<string, string> = {
  "Private Limited": "#2563eb",
  "LLP":             "#7c3aed",
  "Proprietorship":  "#16a85a",
  "Partnership":     "#0d9488",
  "Company":         "#f37916",
  "Other":           "#6B7280",
};

const PALETTE = [
  "#2563eb","#7c3aed","#16a85a","#f37916","#0d9488","#e03b3b",
  "#0ea5e9","#d97706","#6366f1","#ec4899","#14b8a6","#84cc16",
  "#f43f5e","#8b5cf6","#22c55e","#64748b",
];

function lighten(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c * 0.12 + 255 * 0.88);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

const emptyForm = {
  name: "", shortCode: "", type: "Private Limited", contactPerson: "", phone: "",
  email: "", address: "", city: "", state: "", gstNumber: "", panNumber: "", cin: "",
  isActive: true,
};

export default function Companies() {
  const { user } = useAuth();
  const isOwner  = user?.role === "owner";

  const [companies, setCompanies]     = useState<Company[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [search, setSearch]           = useState("");
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [editing, setEditing]         = useState<Company | null>(null);
  const [saving, setSaving]           = useState(false);
  const [form, setForm]               = useState(emptyForm);
  const [pickedColor, setPickedColor] = useState(PALETTE[0]);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiClient.get("/companies");
      setCompanies(res.data.companies ?? []);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to load companies");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.shortCode.toLowerCase().includes(search.toLowerCase()) ||
    (c.city ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.contactPerson ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function openAdd() {
    setEditing(null);
    setPickedColor(PALETTE[0]);
    setForm(emptyForm);
    setDrawerOpen(true);
  }

  function openEdit(co: Company) {
    setEditing(co);
    setPickedColor(co.color);
    setForm({
      name: co.name, shortCode: co.shortCode, type: co.type,
      cin: co.cin ?? "", gstNumber: co.gstNumber ?? "", panNumber: co.panNumber ?? "",
      address: co.address ?? "", city: co.city ?? "", state: co.state ?? "",
      email: co.email ?? "", phone: co.phone ?? "", contactPerson: co.contactPerson ?? "",
      isActive: co.isActive,
    });
    setDrawerOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error("Company name is required");
    if (!form.shortCode.trim()) return toast.error("Short code is required");
    if (form.shortCode.length > 8) return toast.error("Short code: max 8 characters");

    setSaving(true);
    try {
      const payload = { ...form, color: pickedColor };
      if (editing) {
        const res = await apiClient.put(`/companies/${editing._id}`, payload);
        setCompanies(prev => prev.map(c => c._id === editing._id ? res.data.company : c));
        toast.success("Company updated");
      } else {
        const res = await apiClient.post("/companies", payload);
        setCompanies(prev => [res.data.company, ...prev]);
        toast.success("Company added");
      }
      setDrawerOpen(false);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Save failed";
      toast.error(msg);
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/companies/${deleteTarget._id}`);
      setCompanies(prev => prev.filter(c => c._id !== deleteTarget._id));
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Delete failed";
      toast.error(msg);
    }
  }

  if (loading) return <Spinner label="Loading companies…" />;
  if (error) return <div className="m-6"><Alert type="error" message={error} /></div>;

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle="All entities under the Neoteric Group umbrella. Each project can be tagged to a company for billing and reporting."
        icon={Landmark}
        actions={
          <>
            <Btn outline icon={RotateCw} onClick={load} />
            <Btn label="Add Company" icon={Plus} color="primary" onClick={openAdd} />
          </>
        }
      />

      {/* Stats */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <KPICard label="Total Companies" value={companies.length} accent="#FF7A00" />
        <KPICard label="Active" value={companies.filter(c => c.isActive).length} accent="#16a85a" />
        <KPICard label="Private Limited" value={companies.filter(c => c.type === "Private Limited").length} accent="#2563eb" />
        <KPICard label="LLP / Other" value={companies.filter(c => c.type !== "Private Limited").length} accent="#7c3aed" />
      </div>

      <div className="mb-5">
        <SearchFilter value={search} onChange={setSearch} placeholder="Search by name, code, city, or contact…" />
      </div>

      {/* Company cards */}
      {filtered.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={Landmark}
            title={search ? "No companies match your search" : "No companies yet"}
            message={!search ? 'Click "Add Company" to get started.' : undefined}
            actionLabel={!search ? "Add Company" : undefined}
            onAction={!search ? openAdd : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {filtered.map(co => (
            <Card key={co._id} className={`transition-shadow hover:shadow-md ${co.isActive ? "" : "opacity-60"}`} style={{ borderLeft: `4px solid ${co.color}` }}>
              {/* Header row */}
              <div className="flex items-start justify-between gap-2.5 mb-2.5">
                <div className="flex-1 min-w-0">
                  <span
                    className="inline-block font-mono font-bold text-[11px] px-2 py-0.5 rounded mb-1.5"
                    style={{ background: lighten(co.color), color: co.color }}
                  >
                    {co.shortCode}
                  </span>
                  {!co.isActive && <Badge color="gray" small>Inactive</Badge>}

                  <div className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9] leading-snug">{co.name}</div>

                  <div className="mt-1">
                    <span
                      className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: `${TYPE_COLORS[co.type] ?? "#6B7280"}15`, color: TYPE_COLORS[co.type] ?? "#6B7280" }}
                    >
                      {co.type}
                    </span>
                  </div>
                </div>

                <div className="flex gap-1 shrink-0">
                  <Btn small outline icon={Pencil} onClick={() => openEdit(co)} />
                  {isOwner && <Btn small color="red" icon={Trash2} onClick={() => setDeleteTarget(co)} />}
                </div>
              </div>

              {/* Details */}
              <div className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                {co.contactPerson && <div><span className="text-gray-400">Contact: </span><span className="text-gray-700 dark:text-gray-300 font-medium">{co.contactPerson}</span></div>}
                {(co.city || co.state) && <div><span className="text-gray-400">Location: </span><span className="text-gray-700 dark:text-gray-300">{[co.city, co.state].filter(Boolean).join(", ")}</span></div>}
                {co.phone && <div><span className="text-gray-400">Phone: </span><span className="text-gray-700 dark:text-gray-300">{co.phone}</span></div>}
                {co.email && <div><span className="text-gray-400">Email: </span><span className="text-gray-700 dark:text-gray-300">{co.email}</span></div>}
                {co.gstNumber && (
                  <div className="mt-0.5">
                    <span className="font-mono bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 text-[11px]">GST: {co.gstNumber}</span>
                  </div>
                )}
                {co.panNumber && (
                  <div>
                    <span className="font-mono bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 text-[11px]">PAN: {co.panNumber}</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Add / Edit Drawer ──────────────────────────────────── */}
      {drawerOpen && (
        <Modal
          title={editing ? `Edit — ${editing.name}` : "Add New Company"}
          onClose={() => setDrawerOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn label="Cancel" outline onClick={() => setDrawerOpen(false)} />
              <Btn label={editing ? "Save Changes" : "Add Company"} color="primary" loading={saving} onClick={handleSave} />
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Company Name" required maxLength={120} placeholder="e.g. Gravity Infrastructure Pvt Ltd"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Short Code" required maxLength={8} placeholder="e.g. GLR" className="uppercase font-mono"
                hint="A short abbreviation used in reports and badges (e.g. GLR, NPL)"
                value={form.shortCode} onChange={e => setForm(f => ({ ...f, shortCode: e.target.value }))} />
              <SField label="Company Type" required value={form.type}
                onChange={v => setForm(f => ({ ...f, type: v }))}
                options={COMPANY_TYPES.map(t => ({ label: t, value: t }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact Person" placeholder="Primary point of contact"
                value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
              <Field label="Phone" maxLength={15} placeholder="10-digit mobile"
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>

            <Field label="Email" type="email" placeholder="company@example.com"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />

            <Field textarea label="Address" rows={2} maxLength={300} placeholder="Registered office address"
              value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />

            <div className="grid grid-cols-2 gap-3">
              <Field label="City" placeholder="Gwalior" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              <Field label="State" placeholder="Madhya Pradesh" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="GST Number" maxLength={15} placeholder="23ABCDE1234F1Z5" className="font-mono"
                value={form.gstNumber} onChange={e => setForm(f => ({ ...f, gstNumber: e.target.value }))} />
              <Field label="PAN Number" maxLength={10} placeholder="ABCDE1234F" className="font-mono"
                value={form.panNumber} onChange={e => setForm(f => ({ ...f, panNumber: e.target.value }))} />
            </div>

            <Field label="CIN / LLPIN" maxLength={21} placeholder="U74999MP2020PTC123456" className="font-mono"
              hint="Company Identification Number or LLP Identification Number"
              value={form.cin} onChange={e => setForm(f => ({ ...f, cin: e.target.value }))} />

            {/* Colour */}
            <div>
              <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">Brand Colour</span>
              <div className="flex items-center gap-3 mb-2">
                <input type="color" value={pickedColor} onChange={e => setPickedColor(e.target.value)}
                  className="w-10 h-9 border border-gray-200 dark:border-gray-700 rounded-md p-0.5 cursor-pointer bg-transparent" />
                <span className="font-mono text-[13px] text-gray-700 dark:text-gray-300">{pickedColor}</span>
                <span className="font-bold text-[11px] px-2.5 py-0.5 rounded" style={{ background: lighten(pickedColor), color: pickedColor }}>
                  {form.shortCode || "CODE"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PALETTE.map(c => (
                  <button key={c} type="button" onClick={() => setPickedColor(c)} title={c}
                    className="w-[26px] h-[26px] rounded-full cursor-pointer p-0"
                    style={{ background: c, border: pickedColor === c ? "3px solid #111" : "2px solid #fff", boxShadow: "0 0 0 1px #E5E7EB" }} />
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">Status</span>
              <div className="flex gap-2.5">
                {[{ label: "Active", value: true, color: "#16a85a" }, { label: "Inactive", value: false, color: "#9CA3AF" }].map(opt => (
                  <button key={String(opt.value)} type="button" onClick={() => setForm(f => ({ ...f, isActive: opt.value }))}
                    className="px-4.5 py-1.5 rounded-lg border font-semibold text-xs cursor-pointer"
                    style={{
                      borderColor: form.isActive === opt.value ? opt.color : "#E5E7EB",
                      background: form.isActive === opt.value ? `${opt.color}18` : "transparent",
                      color: form.isActive === opt.value ? opt.color : "#6B7280",
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete "${deleteTarget.name}"?`} message="This cannot be undone."
          confirmLabel="Yes, Delete" danger
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
