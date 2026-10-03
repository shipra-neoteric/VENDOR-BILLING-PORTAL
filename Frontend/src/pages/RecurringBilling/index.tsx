import { useEffect, useState } from "react";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { Repeat, Plus, Pause, Play, Trash2 } from "lucide-react";
import apiClient from "../../services/apiClient";
import { useCategories } from "../../hooks/useCategories";
import { BILL_TYPE_CFG } from "../../shared/constants/billOptions";
import PageHeader from "../../ui/PageHeader";
import Card from "../../ui/Card";
import Btn from "../../ui/Btn";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import Segmented from "../../ui/Segmented";
import EmptyState from "../../ui/EmptyState";
import Spinner from "../../ui/Spinner";

// A recurring schedule only ever needs ONE line item / scope item — a fixed
// recurring amount (e.g. a flat monthly retainer or rent) can't be tied to
// real logged progress the way a normal bill's quantities are, since nobody
// has billed any quantity yet on a date that hasn't happened. See this
// session's own discussion: recurring billing is deliberately fixed-amount
// only, not progress-based. Everything ELSE about the form (vendor type,
// department, GST, bill type, generated-by, ref no, category…) mirrors the
// real New Bill / New Work Order forms field-for-field, so a scheduled
// entity looks exactly like one a human created by hand.
interface Schedule {
  _id: string;
  entityType: "WorkOrder" | "Bill";
  label: string;
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
  startDate: string;
  endDate?: string | null;
  nextRunAt: string;
  lastRunAt?: string | null;
  isActive: boolean;
  createdBy?: { name?: string; email?: string };
  runHistory: { ranAt: string; success: boolean; error?: string; entityLabel?: string }[];
  templateData: Record<string, unknown>;
}
interface ProjectOpt { _id: string; name: string; }
interface CompanyOpt { _id: string; name: string; isActive?: boolean; }
interface ContractorOpt { vendorCode: string; companyName: string; }
interface ConsultantOpt { consultantCode: string; firmName: string; }

const FREQ_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];
const DEPARTMENT_OPTIONS = [
  { value: "", label: "— None —" },
  { value: "civil", label: "Civil Team" },
  { value: "marketing", label: "Marketing Team" },
  { value: "planning", label: "Planning Team" },
  { value: "maintenance", label: "Maintenance Team" },
];
const BILL_TYPE_OPTIONS = Object.entries(BILL_TYPE_CFG).map(([value, v]) => ({ value, label: v.label }));

function emptyForm() {
  return {
    entityType: "Bill" as "Bill" | "WorkOrder",
    label: "",
    frequency: "monthly" as Schedule["frequency"],
    startDate: dayjs().format("YYYY-MM-DD"),
    endDate: "",
    // Shared
    projectId: "", companyId: "", department: "",
    description: "", amount: "",
    // Vendor type — Bill uses partyType, WorkOrder uses contractType; both
    // just decide whether vendorCode is picked from Contractors or Consultants.
    partyType: "contractor" as "contractor" | "consultant",
    contractType: "execution" as "execution" | "professional-services",
    vendorCode: "",
    // Bill-only (mirrors NewBillDrawer's own required/optional fields)
    generatedBy: "", contractorRefNo: "", gstPercent: "18", billType: "running",
    // WorkOrder-only
    category: "",
  };
}

export default function RecurringBilling() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [contractors, setContractors] = useState<ContractorOpt[]>([]);
  const [consultants, setConsultants] = useState<ConsultantOpt[]>([]);
  const { categories } = useCategories();

  const load = () => {
    setLoading(true);
    apiClient.get<{ schedules: Schedule[] }>("/recurring")
      .then((r) => setSchedules(r.data.schedules ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm(emptyForm());
    setCreateOpen(true);
    if (projects.length === 0) {
      apiClient.get<{ projects: ProjectOpt[] }>("/projects").then((r) => setProjects(r.data.projects ?? [])).catch(() => {});
      apiClient.get<{ companies: CompanyOpt[] }>("/companies").then((r) => setCompanies((r.data.companies ?? []).filter((c) => c.isActive !== false))).catch(() => {});
      apiClient.get<{ contractors: ContractorOpt[] }>("/contractors").then((r) => setContractors(r.data.contractors ?? [])).catch(() => {});
      apiClient.get<{ consultants: ConsultantOpt[] }>("/consultants").then((r) => setConsultants(r.data.consultants ?? [])).catch(() => {});
    }
  }

  const usesConsultant = form.entityType === "Bill" ? form.partyType === "consultant" : form.contractType === "professional-services";
  const vendorOptions = usesConsultant
    ? consultants.map((c) => ({ value: c.consultantCode, label: `${c.firmName} (${c.consultantCode})` }))
    : contractors.map((c) => ({ value: c.vendorCode, label: `${c.companyName} (${c.vendorCode})` }));
  const vendorName = usesConsultant
    ? consultants.find((c) => c.consultantCode === form.vendorCode)?.firmName
    : contractors.find((c) => c.vendorCode === form.vendorCode)?.companyName;

  async function handleCreate() {
    if (!form.label.trim()) return toast.error("Give this schedule a name");
    if (!form.projectId) return toast.error("Select a project");
    if (!form.companyId) return toast.error("Select the issuing company");
    if (!form.vendorCode) return toast.error("Select a vendor");
    if (!form.description.trim()) return toast.error("Description is required");
    const amount = Number(form.amount);
    if (!(amount > 0)) return toast.error("Amount must be a positive number");
    if (form.entityType === "Bill" && !form.generatedBy.trim()) return toast.error("Generated By is required");
    if (form.entityType === "WorkOrder" && !form.category) return toast.error("Select a category");

    const project = projects.find((p) => p._id === form.projectId);

    const templateData = form.entityType === "Bill"
      ? {
          projectId: form.projectId, projectName: project?.name || "",
          companyId: form.companyId,
          vendorCode: form.vendorCode, vendorName: vendorName || "",
          department: form.department,
          generatedBy: form.generatedBy.trim(),
          contractorRefNo: form.contractorRefNo.trim(),
          billType: form.billType,
          lineItems: [{ description: form.description.trim(), unit: "Lump Sum", plannedQty: 1, rate: amount, amount }],
          gstPercent: Number(form.gstPercent) || 0,
        }
      : {
          contractType: form.contractType,
          projectId: form.projectId, projectName: project?.name || "",
          companyId: form.companyId,
          vendorCode: form.vendorCode, vendorName: vendorName || "",
          category: form.category,
          department: form.department,
          scopeOfWork: form.description.trim(),
          scopeItems: [{ description: form.description.trim(), unit: "Lump Sum", plannedQty: 1, rate: amount, amount }],
        };

    setSaving(true);
    try {
      await apiClient.post("/recurring", {
        entityType: form.entityType,
        label: form.label.trim(),
        frequency: form.frequency,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        templateData,
      });
      toast.success("Recurring schedule created");
      setCreateOpen(false);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Failed to create schedule");
    } finally {
      setSaving(false);
    }
  }

  async function toggleSchedule(s: Schedule) {
    try {
      await apiClient.patch(`/recurring/${s._id}/toggle`, { isActive: !s.isActive });
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Failed to update schedule");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/recurring/${deleteTarget._id}`);
      toast.success("Schedule deleted");
      setDeleteTarget(null);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Failed to delete schedule");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        icon={Repeat}
        title="Recurring Billing"
        subtitle="Fixed-amount Work Orders or Bills that auto-create and auto-submit on a schedule (e.g. monthly rent/retainer) — not for progress-based billing."
        actions={<NxBtn color="primary" icon={Plus} label="New Schedule" onClick={openCreate} />}
      />

      {loading ? (
        <Spinner label="Loading schedules…" />
      ) : schedules.length === 0 ? (
        <Card padded={false}>
          <EmptyState icon={Repeat} title="No recurring schedules yet" message='Click "New Schedule" to set one up.' />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {schedules.map((s) => (
            <Card key={s._id} className={s.isActive ? "" : "opacity-60"}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">{s.label}</span>
                    <NxBadge color={s.entityType === "WorkOrder" ? "blue" : "indigo"}>{s.entityType}</NxBadge>
                    <NxBadge color="gray">{s.frequency}</NxBadge>
                    <NxBadge color={s.isActive ? "green" : "gray"}>{s.isActive ? "Active" : "Paused"}</NxBadge>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Next run: {dayjs(s.nextRunAt).format("DD MMM YYYY")}
                    {s.lastRunAt && ` · Last run: ${dayjs(s.lastRunAt).format("DD MMM YYYY")}`}
                    {s.endDate && ` · Ends ${dayjs(s.endDate).format("DD MMM YYYY")}`}
                  </div>
                  {s.runHistory?.length > 0 && (
                    <div className="text-xs text-gray-400 mt-1">
                      Last attempt: {s.runHistory[s.runHistory.length - 1].success
                        ? `created ${s.runHistory[s.runHistory.length - 1].entityLabel}`
                        : <span className="text-red-500">failed — {s.runHistory[s.runHistory.length - 1].error}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <NxBtn color="icon" title={s.isActive ? "Pause" : "Resume"} icon={s.isActive ? Pause : Play} onClick={() => toggleSchedule(s)} />
                  <NxBtn
                    color="icon" title="Delete" icon={Trash2}
                    className="text-red-500! hover:text-red-600! hover:bg-red-50! dark:hover:bg-red-500/10!"
                    onClick={() => setDeleteTarget(s)}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete "${deleteTarget.label}"?`}
          message="This cannot be undone. It won't affect anything already created by it — only stops future runs."
          confirmLabel="Delete" danger
          loading={deleting}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
        />
      )}

      {createOpen && (
        <Modal
          icon={Repeat}
          title="New Recurring Schedule"
          subtitle="A fixed amount, re-created and auto-submitted on this schedule."
          extraWide
          onClose={() => setCreateOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn label="Cancel" outline onClick={() => setCreateOpen(false)} />
              <Btn label="Create Schedule" color="primary" loading={saving} onClick={handleCreate} />
            </div>
          }
        >
          {/* ── Schedule — same boxed-section look as New Bill / New Work
              Order's own "Bill Information" step. ───────────────────── */}
          <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg p-4 mb-5">
            <div className="font-bold text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] mb-3">Schedule</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Field label="Schedule Name" required placeholder='e.g. "Monthly office rent"' value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
              <SField
                label="Creates" required value={form.entityType}
                onChange={(v) => setForm((f) => ({ ...f, entityType: v as "Bill" | "WorkOrder", vendorCode: "" }))}
                options={[{ value: "Bill", label: "A Bill (manual, fixed-amount)" }, { value: "WorkOrder", label: "A Work Order" }]}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SField label="Frequency" required value={form.frequency} onChange={(v) => setForm((f) => ({ ...f, frequency: v as Schedule["frequency"] }))} options={FREQ_OPTIONS} />
              <Field label="Start Date" required type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              <Field label="End Date (optional)" type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} hint="Leave blank to run until paused/deleted" />
            </div>
          </div>

          {/* ── Entity details — mirrors NewBillDrawer's / the Work Order
              form's own "Bill Information"/"Work Order Information" box:
              same Bill For/Contract Type toggle, same field set and order. */}
          <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg p-4 mb-5">
            <div className="font-bold text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] mb-3">
              {form.entityType === "Bill" ? "Bill Information" : "Work Order Information"}
            </div>

            <div className="mb-4">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{form.entityType === "Bill" ? "Bill For" : "Contract Type"}</div>
              {form.entityType === "Bill" ? (
                <Segmented
                  value={form.partyType}
                  onChange={(v) => setForm((f) => ({ ...f, partyType: v as "contractor" | "consultant", vendorCode: "" }))}
                  options={[{ label: "Contractor", value: "contractor" }, { label: "Consultant", value: "consultant" }]}
                />
              ) : (
                <Segmented
                  value={form.contractType}
                  onChange={(v) => setForm((f) => ({ ...f, contractType: v as "execution" | "professional-services", vendorCode: "" }))}
                  options={[{ label: "Execution", value: "execution" }, { label: "Professional Services", value: "professional-services" }]}
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <SField
                label="Site / Project" required value={form.projectId}
                onChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
                options={projects.map((p) => ({ value: p._id, label: p.name }))}
                placeholder="Select project…"
              />
              <SField
                label={usesConsultant ? "Consultant" : "Contractor"} required value={form.vendorCode}
                onChange={(v) => setForm((f) => ({ ...f, vendorCode: v }))}
                options={vendorOptions}
                placeholder={`Search by name or vendor code…`}
              />
              <Field
                label="Vendor Code"
                value={form.vendorCode}
                disabled
                placeholder="Auto-filled"
                className="text-primary font-bold font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <SField
                label="Issuing Company" required value={form.companyId}
                onChange={(v) => setForm((f) => ({ ...f, companyId: v }))}
                options={companies.map((c) => ({ value: c._id, label: c.name }))}
                placeholder="Select company"
              />
              <SField
                label="Department (optional)" value={form.department}
                onChange={(v) => setForm((f) => ({ ...f, department: v }))}
                options={DEPARTMENT_OPTIONS}
              />
              {form.entityType === "WorkOrder" ? (
                <SField
                  label="Category" required value={form.category}
                  onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                  options={categories.filter((c) => !c.parentId).map((c) => ({ value: c.name, label: c.name }))}
                  placeholder="Select category"
                />
              ) : (
                <Field label="Generated By" required placeholder="Full name of person generating bill" value={form.generatedBy} onChange={(e) => setForm((f) => ({ ...f, generatedBy: e.target.value }))} />
              )}
            </div>

            {form.entityType === "Bill" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <Field label="Contractor Ref. No. (optional)" placeholder="e.g. ABCI/2026/003" value={form.contractorRefNo} onChange={(e) => setForm((f) => ({ ...f, contractorRefNo: e.target.value }))} />
                <Field label="GST %" type="number" value={form.gstPercent} onChange={(e) => setForm((f) => ({ ...f, gstPercent: e.target.value }))} />
                <SField label="Bill Type" value={form.billType} onChange={(v) => setForm((f) => ({ ...f, billType: v }))} options={BILL_TYPE_OPTIONS} />
              </div>
            )}

            <Field label="Description" required textarea rows={2} placeholder="What this recurring charge is for" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="mb-4" />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Amount (₹, fixed each period)" required type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
