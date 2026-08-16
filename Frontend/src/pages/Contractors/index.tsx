import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Download, Plus, Eye, Pencil, Trash2, Upload, Search, Loader2 } from "lucide-react";

import ContractorDetailView from "../../components/ContractorDetailView";
import { downloadContractorListPDF } from "../../components/ContractorListPDF";
import apiClient from "../../services/apiClient";
import type { Contractor, VendorGroup } from "../../types/VendorBilling";
import { vendorLabel } from "../../utils/vendorLabel";
import { useFormErrors } from "../../hooks/useFormErrors";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Field from "../../ui/Field";
import MultiSelect from "../../ui/MultiSelect";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import Badge from "../../ui/Badge";
import EmptyState from "../../ui/EmptyState";
import Spinner from "../../ui/Spinner";
import { SearchFilter } from "../../ui/Filters";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";

const normalizeId = (obj: any) => ({ ...obj, id: obj._id || obj.id });

const WORK_OPTIONS = [
  "General Contractors",
  "Excavation",
  "Concrete",
  "Framing",
  "Steel",
  "Window & Door",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Fire Alarm & Sprinkler",
  "Roofing",
  "Insulation",
  "Drywall",
  "Taping",
  "Plaster",
  "Flooring",
  "Finish Carpentry",
  "Painting",
  "Masonry",
  "Landscaping",
];

const DOCUMENT_TYPES = ["GST Certificate", "PAN Card", "Cancelled Cheque", "Business Card", "Aadhaar Card"];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700/40 pb-2 mb-4 mt-6 first:mt-0">
      {children}
    </div>
  );
}

// ── Vendor Group select — pick an existing group or type a new name to
// create one on the fly (POST /vendor-groups), same "type to add" pattern
// used for Categories elsewhere in the app. Purely internal — lets several
// vendor codes belonging to the same real business (e.g. "Ambika
// Construction" has multiple individually-registered members) share bill
// payee routing later on.
function GroupCreatableSelect({
  value, groups, onSelect, onClear, onCreated,
}: {
  value?: string | null;
  groups: VendorGroup[];
  onSelect: (groupId: string) => void;
  onClear: () => void;
  onCreated: (group: VendorGroup) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const trimmed = search.trim();
  const exists = trimmed.length > 0 && groups.some(g => g.name.toLowerCase() === trimmed.toLowerCase());
  const filtered = trimmed
    ? groups.filter(g => g.name.toLowerCase().includes(trimmed.toLowerCase()))
    : groups;
  const selected = groups.find(g => g.id === value);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await apiClient.post<{ group: VendorGroup }>("/vendor-groups", { name: trimmed });
      const group = normalizeId(res.data.group) as unknown as VendorGroup;
      onCreated(group);
      onSelect(group.id);
      toast.success(`Vendor group "${group.name}" created`);
      setOpen(false);
      setSearch("");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to create vendor group");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-sm flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      >
        <span className={selected ? "text-[#1A1A2E] dark:text-[#F1F5F9] truncate" : "text-gray-400 truncate"}>
          {selected ? `${selected.name}${selected.memberCount ? ` (${selected.memberCount} members)` : ""}` : "No group — standalone vendor"}
        </span>
        {selected ? (
          <span onClick={(e) => { e.stopPropagation(); onClear(); setSearch(""); }} className="text-gray-400 hover:text-gray-600 shrink-0">✕</span>
        ) : (
          <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 mt-1 w-full bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700/40">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Type a name…"
                className="w-full text-sm bg-transparent outline-none text-[#1A1A2E] dark:text-[#F1F5F9] placeholder:text-gray-400"
              />
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {filtered.map(g => (
                <button
                  key={g.id} type="button"
                  onClick={() => { onSelect(g.id); setSearch(""); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-[#1A1A2E]! dark:text-[#F1F5F9]! hover:bg-gray-50 dark:hover:bg-gray-700/40"
                >
                  {g.name}{g.memberCount ? ` (${g.memberCount} members)` : ""}
                </button>
              ))}
              {filtered.length === 0 && !trimmed && (
                <div className="px-3 py-2 text-sm text-gray-400">Type a name to add it</div>
              )}
              {trimmed.length > 0 && !exists && (
                <button
                  type="button" disabled={creating} onClick={handleCreate}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-primary! hover:bg-primary/5 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add "{trimmed}" as new vendor group
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface ContractorFormValues {
  companyName: string; shortCode: string; ownerName: string; address: string;
  mobile: string; alternateMobile: string; email: string;
  accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string; branchName: string;
  gstNumber: string; panNumber: string; aadhaarNumber: string;
  workTypes: string[]; reference1: string; reference2: string; averageTurnover: number | null;
}

const blankForm = (): ContractorFormValues => ({
  companyName: "", shortCode: "", ownerName: "", address: "",
  mobile: "", alternateMobile: "", email: "",
  accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "", branchName: "",
  gstNumber: "", panNumber: "", aadhaarNumber: "",
  workTypes: [], reference1: "", reference2: "", averageTurnover: null,
});

// ── Main Component ─────────────────────────────────────────────

export default function Contractors() {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editingContractor, setEditingContractor] = useState<Contractor | null>(null);
  const [viewOpen, setViewOpen]       = useState(false);
  const [selected, setSelected]       = useState<Contractor | null>(null);
  const [vendorGroups, setVendorGroups] = useState<VendorGroup[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contractor | null>(null);
  const [formValues, setFormValues] = useState<ContractorFormValues>(blankForm());
  const formErrors = useFormErrors<"companyName" | "ownerName" | "address" | "mobile" | "accountHolderName" | "bankName">();

  const patch = (p: Partial<ContractorFormValues>) => setFormValues(prev => ({ ...prev, ...p }));

  // ── Load ──────────────────────────────────────────────────────
  useEffect(() => {
    apiClient
      .get<{ contractors: Contractor[] }>("/contractors")
      .then((r) => setContractors(r.data.contractors.map(normalizeId)))
      .catch(() => {})
      .finally(() => setLoading(false));
    apiClient
      .get<{ groups: VendorGroup[] }>("/vendor-groups")
      .then((r) => setVendorGroups(r.data.groups.map(normalizeId)))
      .catch(() => {});
  }, []);

  const groupById = (id?: string | null) => vendorGroups.find((g) => g.id === id);

  const filtered = contractors.filter(
    (c) =>
      c.vendorCode.toLowerCase().includes(search.toLowerCase()) ||
      c.companyName.toLowerCase().includes(search.toLowerCase()) ||
      c.mobile.includes(search)
  );
  const { page, totalPages, setPage, pageItems: pagedContractors } = usePagination(filtered, 10);

  function validateForm(): boolean {
    formErrors.clearAll();
    let ok = true;
    if (!formValues.companyName.trim()) { formErrors.setError("companyName", "Required"); ok = false; }
    if (!formValues.ownerName.trim()) { formErrors.setError("ownerName", "Required"); ok = false; }
    if (!formValues.address.trim()) { formErrors.setError("address", "Required"); ok = false; }
    if (!formValues.mobile.trim()) { formErrors.setError("mobile", "Required"); ok = false; }
    if (!formValues.accountHolderName.trim()) { formErrors.setError("accountHolderName", "Required"); ok = false; }
    if (!formValues.bankName.trim()) { formErrors.setError("bankName", "Required"); ok = false; }
    return ok;
  }

  // ── Register / Edit ──────────────────────────────────────────────
  const handleRegister = async () => {
    if (!validateForm()) return;
    const payload = { ...formValues, groupId };
    setSaving(true);
    try {
      if (editingContractor) {
        const res = await apiClient.put<{ contractor: Contractor }>(`/contractors/${editingContractor.id}`, payload);
        const updated = normalizeId(res.data.contractor);
        setContractors((prev) => prev.map((c) => (c.id === editingContractor.id ? updated : c)));
        toast.success(`${res.data.contractor.companyName} updated`);
      } else {
        const res = await apiClient.post<{ contractor: Contractor }>("/contractors", payload);
        setContractors((prev) => [normalizeId(res.data.contractor), ...prev]);
        toast.success(`${res.data.contractor.companyName} registered as ${res.data.contractor.vendorCode}`);
      }
      setFormValues(blankForm());
      setGroupId(null);
      setEditingContractor(null);
      setRegisterOpen(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (record: Contractor) => {
    setFormValues({
      companyName: record.companyName || "", shortCode: record.shortCode || "", ownerName: record.ownerName || "",
      address: record.address || "", mobile: record.mobile || "", alternateMobile: record.alternateMobile || "",
      email: record.email || "", accountHolderName: record.accountHolderName || "", bankName: record.bankName || "",
      accountNumber: record.accountNumber || "", ifscCode: record.ifscCode || "", branchName: record.branchName || "",
      gstNumber: record.gstNumber || "", panNumber: record.panNumber || "", aadhaarNumber: record.aadhaarNumber || "",
      workTypes: record.workTypes || [], reference1: record.reference1 || "", reference2: record.reference2 || "",
      averageTurnover: record.averageTurnover ?? null,
    });
    formErrors.clearAll();
    setGroupId(record.groupId || null);
    setEditingContractor(record);
    setRegisterOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/contractors/${deleteTarget.id}`);
      setContractors((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast.success(`"${vendorLabel(deleteTarget.companyName, deleteTarget.shortCode)}" deleted`);
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Delete failed");
    }
  };

  return (
    <div>
      <PageHeader
        title="Contractors"
        subtitle="Manage registered vendors and sub-contractors."
        actions={
          <div className="flex gap-2">
            <Btn label="Download List" icon={Download} outline onClick={() => downloadContractorListPDF(contractors, vendorGroups)} />
            <Btn
              label="Register Contractor" icon={Plus} color="primary"
              onClick={() => { setFormValues(blankForm()); formErrors.clearAll(); setGroupId(null); setEditingContractor(null); setRegisterOpen(true); }}
            />
          </div>
        }
      />

      {/* Search */}
      <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
        <SearchFilter placeholder="Search by vendor code, company name, or mobile…" value={search} onChange={setSearch} />
      </div>

      {/* Table */}
      {loading ? (
        <Spinner size="large" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Download} title="No contractors yet" message='Click "Register Contractor" to add your first vendor.' />
      ) : (
        <>
          <Table>
            <Thead>
              <Tr>
                <Th>Vendor Code</Th>
                <Th>Company</Th>
                <Th>Owner</Th>
                <Th>Mobile</Th>
                <Th>Vendor Group</Th>
                <Th>Work Types</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {pagedContractors.map((record) => {
                const group = groupById(record.groupId);
                return (
                  <Tr key={record.id}>
                    <Td className="font-mono font-bold text-primary">{record.vendorCode}</Td>
                    <Td>{vendorLabel(record.companyName, record.shortCode)}</Td>
                    <Td>{record.ownerName}</Td>
                    <Td>{record.mobile}</Td>
                    <Td>{group ? <Badge color="purple">{group.name}</Badge> : <span className="text-gray-300">—</span>}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {(record.workTypes || []).slice(0, 2).map(t => <Badge key={t} color="gray" small>{t}</Badge>)}
                      </div>
                    </Td>
                    <Td><Badge color={record.status === "active" ? "green" : "gray"}>{(record.status || "").toUpperCase()}</Badge></Td>
                    <Td>
                      <div className="flex gap-1">
                        <Btn
                          small color="blue" icon={Eye} title="View Contractor"
                          onClick={() => {
                            setSelected(record);
                            setViewOpen(true);
                            // The list omits each contractor's uploaded documents (GST/PAN certs
                            // etc. can run MBs as base64) to keep it fast — fetch the full record
                            // here so the profile drawer's download links actually work.
                            apiClient.get<{ contractor: Contractor }>(`/contractors/${record.id}`).then(res => {
                              const full = normalizeId(res.data.contractor);
                              setSelected(full);
                              setContractors(prev => prev.map(c => c.id === record.id ? full : c));
                            }).catch(() => {});
                          }}
                        />
                        <Btn small color="amber" icon={Pencil} title="Edit Contractor" onClick={() => openEdit(record)} />
                        <Btn small color="red" icon={Trash2} title="Delete Contractor" onClick={() => setDeleteTarget(record)} />
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          {totalPages > 1 && <div className="mt-4"><Pagination page={page} totalPages={totalPages} onChange={setPage} /></div>}
        </>
      )}

      {/* ── Register Contractor Drawer ─────────────────────────── */}
      {registerOpen && (
        <Modal
          title={editingContractor ? "Edit Contractor" : "Register Contractor"}
          subtitle={editingContractor ? `Editing ${editingContractor.vendorCode}` : "Fill in firm, bank, and tax details"}
          wide
          onClose={() => { setRegisterOpen(false); setEditingContractor(null); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setRegisterOpen(false); setEditingContractor(null); }} />
              <Btn color="primary" loading={saving} label={editingContractor ? "Save Changes" : "Register Contractor"} onClick={handleRegister} />
            </div>
          }
        >
          <SectionHeading>Firm Details</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Company / Firm Name" required placeholder="e.g. ABC Infra Pvt Ltd" value={formValues.companyName} onChange={e => patch({ companyName: e.target.value })} error={formErrors.errors.companyName} />
            <Field
              label="Short Form (optional)" placeholder="e.g. D" maxLength={10}
              value={formValues.shortCode} onChange={e => patch({ shortCode: e.target.value })}
              hint="If this vendor code is really part of a bigger firm billed under several separate vendor codes for tax reasons, tag them all with the same short form (e.g. 'D') — it'll show in brackets next to the company name."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Field label="Owner Name" required placeholder="e.g. Rajesh Sharma" value={formValues.ownerName} onChange={e => patch({ ownerName: e.target.value })} error={formErrors.errors.ownerName} />
            <div>
              <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">Vendor Group (optional)</span>
              <GroupCreatableSelect
                value={groupId} groups={vendorGroups}
                onSelect={setGroupId} onClear={() => setGroupId(null)}
                onCreated={(group) => setVendorGroups((prev) => [...prev, group])}
              />
              <span className="block text-[11px] text-gray-400 mt-1">
                If this vendor code is one of several individually-registered members of the same real business (e.g. different people at 'Ambika Construction' each with their own vendor code), group them here — a bill against any member's work order can then be paid into any other member's account.
              </span>
            </div>
          </div>
          <div className="mt-4">
            <Field textarea label="Address" required placeholder="Full address…" value={formValues.address} onChange={e => patch({ address: e.target.value })} error={formErrors.errors.address} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Field label="Mobile" required placeholder="10-digit mobile" value={formValues.mobile} onChange={e => patch({ mobile: e.target.value })} error={formErrors.errors.mobile} />
            <Field label="Alternate Mobile" value={formValues.alternateMobile} onChange={e => patch({ alternateMobile: e.target.value })} />
          </div>
          <div className="mt-4">
            <Field label="Email" type="email" placeholder="company@email.com" value={formValues.email} onChange={e => patch({ email: e.target.value })} />
          </div>

          <SectionHeading>Bank Details</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Account Holder Name" required value={formValues.accountHolderName} onChange={e => patch({ accountHolderName: e.target.value })} error={formErrors.errors.accountHolderName} />
            <Field label="Bank Name" required placeholder="e.g. HDFC Bank" value={formValues.bankName} onChange={e => patch({ bankName: e.target.value })} error={formErrors.errors.bankName} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <Field label="Account Number" value={formValues.accountNumber} onChange={e => patch({ accountNumber: e.target.value })} />
            <Field label="IFSC Code" value={formValues.ifscCode} onChange={e => patch({ ifscCode: e.target.value })} />
            <Field label="Branch" value={formValues.branchName} onChange={e => patch({ branchName: e.target.value })} />
          </div>

          <SectionHeading>Tax Details</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="GST Number" placeholder="15-char GST" value={formValues.gstNumber} onChange={e => patch({ gstNumber: e.target.value })} />
            <Field label="PAN Number" placeholder="10-char PAN" value={formValues.panNumber} onChange={e => patch({ panNumber: e.target.value })} />
            <Field label="Aadhaar Number" placeholder="12-digit Aadhaar" value={formValues.aadhaarNumber} onChange={e => patch({ aadhaarNumber: e.target.value })} />
          </div>

          <SectionHeading>Type of Work</SectionHeading>
          <MultiSelect
            placeholder="Select work types…"
            values={formValues.workTypes}
            onChange={v => patch({ workTypes: v })}
            options={WORK_OPTIONS.map(w => ({ label: w, value: w }))}
          />

          <SectionHeading>References</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Reference Company 1" value={formValues.reference1} onChange={e => patch({ reference1: e.target.value })} />
            <Field label="Reference Company 2" value={formValues.reference2} onChange={e => patch({ reference2: e.target.value })} />
          </div>
          <div className="mt-4">
            <Field
              label="Average Turnover (Lakhs)" type="number" min="0" placeholder="e.g. 50"
              value={formValues.averageTurnover ?? ""} onChange={e => patch({ averageTurnover: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>

          <SectionHeading>Documents</SectionHeading>
          <div className="flex flex-col gap-2.5 pb-2">
            {DOCUMENT_TYPES.map((doc) => (
              <label key={doc} className="inline-flex">
                <input type="file" className="hidden" />
                <span className="inline-flex items-center gap-2 h-10 px-4 w-[220px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-transparent text-sm text-gray-700 dark:text-[#F1F5F9] cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                  <Upload className="w-4 h-4" /> {doc}
                </span>
              </label>
            ))}
          </div>
        </Modal>
      )}

      {/* ── View Profile Drawer ────────────────────────────────── */}
      {viewOpen && selected && (
        <Modal
          title={vendorLabel(selected.companyName, selected.shortCode)}
          subtitle={selected.vendorCode}
          wide
          onClose={() => setViewOpen(false)}
          footer={<div className="flex justify-end"><Btn outline label="Close" onClick={() => setViewOpen(false)} /></div>}
        >
          <ContractorDetailView contractor={selected} />
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete "${vendorLabel(deleteTarget.companyName, deleteTarget.shortCode)}"?`}
          message="This cannot be undone. Work orders and bills already raised against this contractor keep their own record of the name/contact — only the vendor master record itself is removed."
          confirmLabel="Yes, Delete" danger
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
