import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import toast from "react-hot-toast";
import { FileText, Plus, Trash2 } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import { selectableProjects } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";
import { formatThousands, parseThousands, formatPercent, parsePercent } from "../../utils/numberFormat";
import { useFormErrors } from "../../hooks/useFormErrors";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import Btn from "../../ui/Btn";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import { DatePicker } from "../../ui/DatePicker";
import Segmented from "../../ui/Segmented";
import StatusBadge from "../../ui/StatusBadge";
import Badge from "../../ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import type { Contractor, Consultant } from "../../types/VendorBilling";
import { BILL_TYPE_CFG, RELATIONSHIP_OPTIONS } from "../../shared/constants/billOptions";
import { billFinancials, holdAmountFromPercent } from "../../shared/utils/billMath";

// ── Types — a self-contained slice of what AccountsPayment's own Bill/LineItem
// types look like, since this drawer fetches and posts independently ────────

interface LineItem {
  key: number;
  scopeItemId?: string;
  // Set only when this row bills one particular within scopeItemId rather
  // than the scope item as a whole — a scope item that HAS particulars is
  // never billed directly, only through its particulars (see importFromWO).
  subItemId?: string;
  // The parent scope item's own description — set only on particular rows,
  // used purely to group them under a collapsible header in the table.
  groupLabel?: string;
  description: string;
  unit: string;
  plannedQty: number;
  // How much has already been billed against this scope item/particular,
  // cumulative across EVERY bill ever raised for it (progress-cycle or
  // manual) — drives the remaining-% cap shown here; the backend enforces
  // the real limit.
  lastBilledQty?: number;
  percentComplete?: number;
  billedQty: number;
  rate: number;
  amount: number;
}

interface ExistingBill { id: string; billNo: string; amount: number; status: string; isActive?: boolean; }

interface ProjectOpt { id: string; name: string; code: string; parentId?: string | null; }
interface CompanyOpt { id: string; name: string; shortCode: string; isActive?: boolean; }
interface SubItemOpt { id: string; description: string; unit: string; plannedQty: number; lastBilledQty: number; rate?: number; }
interface ScopeItemOpt { id: string; description: string; unit: string; plannedQty: number; lastBilledQty: number; rate?: number; subItems?: SubItemOpt[]; }
interface WorkOrderOpt { id: string; workOrderNo: string; projectId: string; projectName: string; vendorCode: string; vendorName: string; contractType?: string; scopeItems: ScopeItemOpt[]; }
interface AdvanceSlipOpt { _id: string; slipNo: string; amount: number; amountRecovered: number; balance: number; date?: string; reference?: string; }

const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const normalizeId = (obj: Record<string, unknown>) => ({ ...obj, id: (obj._id || obj.id)?.toString() || "" });
const normalizeWO = (wo: Record<string, unknown>): WorkOrderOpt => ({
  ...normalizeId(wo),
  scopeItems: ((wo.scopeItems as Record<string, unknown>[]) || []).map((si) => ({
    ...normalizeId(si),
    subItems: ((si.subItems as Record<string, unknown>[]) || []).map(normalizeId),
  })),
} as unknown as WorkOrderOpt);

let _key = 0;
const nextKey = () => ++_key;
const blankRow = (): LineItem => ({ key: nextKey(), description: "", unit: "", plannedQty: 0, billedQty: 0, rate: 0, amount: 0 });

// Remaining % still billable for a scope-item/particular-linked row — null for plain rows.
function remainingPercent(li: LineItem): number | null {
  if (!li.scopeItemId || !(li.plannedQty > 0)) return null;
  const remaining = li.plannedQty - (li.lastBilledQty || 0);
  return Math.max(0, Math.round((remaining / li.plannedQty) * 10000) / 100);
}

const GST_SLABS = [
  { value: "0", label: "0% — Exempt / Nil" },
  { value: "5", label: "5%" },
  { value: "12", label: "12%" },
  { value: "18", label: "18% (Standard)" },
  { value: "-1", label: "Custom…" },
];

export default function NewBillDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (bill: Record<string, unknown>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const formErrors = useFormErrors<"contractorId" | "billDate" | "generatedBy" | "companyId">();

  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  // Only relevant for a standalone bill (no project/work order to inherit a
  // company from, see isStandalone below) — which group company this bill is
  // being raised through.
  const [companyId, setCompanyId] = useState<string>("");
  // A bill is raised against either a Contractor (execution work orders) or
  // a Consultant (professional-services work orders) — never both, so only
  // one id is ever set at a time; switching the toggle clears the other.
  const [partyType, setPartyType] = useState<"contractor" | "consultant">("contractor");
  const [contractorId, setContractorId] = useState<string>("");
  const [consultantId, setConsultantId] = useState<string>("");
  // Who this bill's payment actually goes to — normally the same as the
  // selected contractor, but a fellow Vendor Group member can be picked
  // instead (e.g. "Ambika Construction" takes the work, this particular
  // bill pays a different individually-registered member of that group).
  const [payeeVendorCode, setPayeeVendorCode] = useState<string>("");
  const [woList, setWoList] = useState<WorkOrderOpt[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([blankRow()]);
  const [gstPercent, setGstPercent] = useState<number>(18);
  const [isCustomGst, setIsCustomGst] = useState(false);
  const [billType, setBillType] = useState<string>("running");
  const [relType, setRelType] = useState<string>("NONE");
  const [linkedBillIds, setLinkedBillIds] = useState<string[]>([]);
  const [selectedWOId, setSelectedWOId] = useState<string>("");
  const [woExistingBills, setWoExistingBills] = useState<ExistingBill[]>([]);
  // The WO scope items were actually imported from — kept separate from
  // selectedWOId (the "Bill Relationship" picker) so changing that picker
  // afterward can't silently disconnect the imported qty/variance checks
  // from the WO that actually owns them.
  const [importedFromWOId, setImportedFromWOId] = useState<string>("");
  // Scope items with particulars are collapsed by default — the arrow next
  // to their group header reveals the particulars to bill against.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [importWOPick, setImportWOPick] = useState("");
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<number | null>(null);

  // Bill Information fields (previously an antd Form)
  const [billDate, setBillDate] = useState("");
  const [generatedBy, setGeneratedBy] = useState("");
  const [contractorRefNo, setContractorRefNo] = useState("");
  const [remarksInput, setRemarksInput] = useState("");

  // Hold (retention) decided at creation time — either a % or a flat amount.
  const [holdMode, setHoldMode] = useState<"percent" | "amount">("percent");
  const [holdPercent, setHoldPercent] = useState<number>(0);
  const [holdAmountInput, setHoldAmountInput] = useState<number>(0);

  // Advance recovery decided at creation time.
  const [pendingAdvances, setPendingAdvances] = useState<AdvanceSlipOpt[]>([]);
  const [advancesLoading, setAdvancesLoading] = useState(false);
  const [advancesUnavailable, setAdvancesUnavailable] = useState(false);
  const [recoveryAmount, setRecoveryAmount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    formErrors.clearAll();
    setProjectId("");
    setCompanyId("");
    setPartyType("contractor");
    setContractorId("");
    setConsultantId("");
    setPayeeVendorCode("");
    setWoList([]);
    setLineItems([blankRow()]);
    setGstPercent(18);
    setIsCustomGst(false);
    setBillType("running");
    setRelType("NONE");
    setLinkedBillIds([]);
    setSelectedWOId("");
    setWoExistingBills([]);
    setImportedFromWOId("");
    setExpandedGroups(new Set());
    setImportWOPick("");
    setBillDate(dayjs().format("YYYY-MM-DD"));
    setGeneratedBy("");
    setContractorRefNo("");
    setRemarksInput("");
    setHoldMode("percent");
    setHoldPercent(0);
    setHoldAmountInput(0);
    setPendingAdvances([]);
    setAdvancesUnavailable(false);
    setRecoveryAmount(null);

    apiClient.get<{ projects: Record<string, unknown>[] }>("/projects")
      .then((r) => setProjects((r.data.projects || []).map((p) => normalizeId(p) as unknown as ProjectOpt)))
      .catch(() => { });
    apiClient.get<{ contractors: Record<string, unknown>[] }>("/contractors")
      .then((r) => setContractors((r.data.contractors || []).map((c) => normalizeId(c) as unknown as Contractor)))
      .catch(() => { });
    apiClient.get<{ consultants: Record<string, unknown>[] }>("/consultants")
      .then((r) => setConsultants((r.data.consultants || []).map((c) => normalizeId(c) as unknown as Consultant)))
      .catch(() => { });
    apiClient.get<{ companies: Record<string, unknown>[] }>("/companies")
      .then((r) => setCompanies((r.data.companies || []).map((c) => normalizeId(c) as unknown as CompanyOpt).filter((c) => c.isActive !== false)))
      .catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // No project selected means no work order can be linked either (the WO
  // list below is only ever fetched once a project is picked) — so this bill
  // is standalone and needs its own company selection instead of inheriting
  // one from a work order.
  const isStandalone = !projectId;

  const selectedContractor = useMemo(
    () => contractors.find((c) => c.id === contractorId) || null,
    [contractors, contractorId]
  );
  const selectedConsultant = useMemo(
    () => consultants.find((c) => c.id === consultantId) || null,
    [consultants, consultantId]
  );

  // Defaults the payee back to the selected contractor's own code whenever
  // that selection changes — a previous group override shouldn't silently
  // carry over onto an unrelated contractor. Vendor Group pay-to-a-different-
  // member is a Contractor-only concept (Consultant has no groupId), so this
  // stays scoped to the contractor path.
  useEffect(() => {
    setPayeeVendorCode(selectedContractor?.vendorCode || "");
  }, [selectedContractor?.vendorCode]);

  const groupSiblings = useMemo(
    () => selectedContractor?.groupId
      ? contractors.filter((c) => c.groupId === selectedContractor.groupId)
      : [],
    [contractors, selectedContractor?.groupId]
  );
  const selectedPayee = useMemo(
    () => contractors.find((c) => c.vendorCode === payeeVendorCode) || selectedContractor,
    [contractors, payeeVendorCode, selectedContractor]
  );

  // The vendor this bill is actually raised against, whichever type is
  // active — everything downstream (WO lookup, payload) reads through this
  // rather than branching on partyType itself.
  const activeVendorCode = partyType === "consultant" ? (selectedConsultant?.consultantCode || "") : (selectedPayee?.vendorCode || "");
  const activeVendorName = partyType === "consultant" ? (selectedConsultant?.firmName || "") : (selectedPayee?.companyName || "");

  useEffect(() => {
    const code = partyType === "consultant" ? selectedConsultant?.consultantCode : selectedContractor?.vendorCode;
    if (!projectId || !code) { setWoList([]); return; }
    apiClient.get<{ workOrders: Record<string, unknown>[] }>(`/work-orders?projectId=${projectId}`)
      .then((r) => {
        const all = (r.data.workOrders || []).map(normalizeWO);
        setWoList(all.filter((wo) => wo.vendorCode === code && (wo.contractType === "professional-services") === (partyType === "consultant")));
      })
      .catch(() => setWoList([]));
  }, [projectId, partyType, selectedContractor?.vendorCode, selectedConsultant?.consultantCode]);

  // Advance recovery is a Contractor-only concept (AdvanceSlip is keyed by
  // contractorCode, not raised for Consultants in this system).
  useEffect(() => {
    if (partyType !== "contractor" || !projectId || !selectedContractor?.vendorCode) { setPendingAdvances([]); return; }
    setAdvancesLoading(true);
    setAdvancesUnavailable(false);
    apiClient.get<{ advanceSlips: AdvanceSlipOpt[] }>(`/advance-slips/pending?projectId=${projectId}&vendorCode=${selectedContractor.vendorCode}`)
      .then((r) => {
        const slips = (r.data.advanceSlips || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        setPendingAdvances(slips);
      })
      .catch(() => { setPendingAdvances([]); setAdvancesUnavailable(true); })
      .finally(() => setAdvancesLoading(false));
  }, [partyType, projectId, selectedContractor?.vendorCode]);

  function updateLineItem(key: number, field: keyof LineItem, val: unknown) {
    setLineItems((prev) =>
      prev.map((li) => {
        if (li.key !== key) return li;
        const updated = { ...li, [field]: val };
        if (field === "percentComplete") {
          const cap = remainingPercent(li);
          const pct = Math.max(0, cap != null ? Math.min(Number(val) || 0, cap) : Number(val) || 0);
          updated.percentComplete = pct;
          updated.billedQty = Math.round(((li.plannedQty || 0) * pct / 100) * 100) / 100;
        } else if (field === "billedQty" && li.scopeItemId && li.plannedQty > 0) {
          updated.percentComplete = Math.round(((Number(val) || 0) / li.plannedQty) * 10000) / 100;
        }
        if (field === "billedQty" || field === "rate" || field === "percentComplete") {
          // Rounded to paise (2 decimals), not the nearest whole rupee — a
          // fractional rate (e.g. ₹50.5/sqft) produces a genuinely fractional
          // amount, and rounding it away here would discard real money.
          updated.amount = Math.round((Number(updated.billedQty) || 0) * (Number(updated.rate) || 0) * 100) / 100;
        }
        return updated;
      })
    );
  }

  function removeLineItem(key: number) {
    setLineItems((prev) => prev.filter((li) => li.key !== key));
  }

  function importFromWO(woId: string) {
    const wo = woList.find((w) => w.id === woId);
    if (!wo) return;
    // A scope item with particulars is never billed as a whole — only its
    // particulars carry a real plannedQty/rate — so import ITS particulars
    // as individual rows, grouped under a collapsible header, instead of one
    // row for the parent.
    const imported: LineItem[] = wo.scopeItems.flatMap((si) => {
      if (si.subItems && si.subItems.length > 0) {
        return si.subItems.map((sub) => ({
          key: nextKey(),
          scopeItemId: si.id,
          subItemId: sub.id,
          groupLabel: si.description,
          description: sub.description,
          unit: sub.unit || "",
          plannedQty: sub.plannedQty || 0,
          lastBilledQty: sub.lastBilledQty || 0,
          percentComplete: 0,
          billedQty: 0,
          rate: sub.rate || 0,
          amount: 0,
        }));
      }
      return [{
        key: nextKey(),
        scopeItemId: si.id,
        description: si.description,
        unit: si.unit || "",
        plannedQty: si.plannedQty || 0,
        lastBilledQty: si.lastBilledQty || 0,
        percentComplete: 0,
        billedQty: 0,
        rate: si.rate || 0,
        amount: 0,
      }];
    });
    setLineItems((prev) => [...prev.filter((li) => li.description.trim()), ...imported]);
    setImportedFromWOId(woId);
    toast.success(`${imported.length} item${imported.length === 1 ? "" : "s"} imported — enter % complete or quantity`);
  }

  async function handleWOSelectForLinking(woId: string) {
    setSelectedWOId(woId);
    if (!woId) { setWoExistingBills([]); return; }
    try {
      const res = await apiClient.get<{ bills: Record<string, unknown>[] }>(`/bills/chain/${woId}`);
      const existing = (res.data.bills || []).map(b => normalizeId(b) as unknown as ExistingBill);
      setWoExistingBills(existing.filter(b => b.status !== "rejected"));
    } catch { setWoExistingBills([]); }
  }

  const totalLineAmount = useMemo(
    () => lineItems.reduce((s, li) => s + (li.amount || 0), 0),
    [lineItems]
  );

  const gross = totalLineAmount;
  const holdAmount = holdMode === "percent"
    ? holdAmountFromPercent(gross, holdPercent || 0)
    : Math.round(holdAmountInput || 0);
  const { gstAmount: gstAmt, netAfterHold } = billFinancials({ gross, gstPercent, retentionAmount: holdAmount, advanceRecovery: recoveryAmount || 0 });
  const maxRecovery = pendingAdvances.reduce((s, sl) => s + sl.balance, 0);
  const payableNow = netAfterHold;

  async function handleSubmit() {
    const validItems = lineItems.filter((li) => li.description.trim() && li.billedQty > 0);
    if (validItems.length === 0) {
      toast.error("Add at least one work item with a description and quantity > 0");
      return;
    }
    formErrors.clearAll();
    let hasError = false;
    if (!activeVendorCode) {
      formErrors.setError("contractorId", partyType === "consultant" ? "Select a consultant" : "Select a contractor");
      hasError = true;
    }
    if (!billDate) { formErrors.setError("billDate", "Required"); hasError = true; }
    if (!generatedBy.trim()) { formErrors.setError("generatedBy", "Required"); hasError = true; }
    if (isStandalone && !companyId) {
      formErrors.setError("companyId", "Select which company this bill is raised through");
      hasError = true;
    }
    if (hasError) return;

    const project = projects.find((p) => p.id === projectId);

    const linkedBills = linkedBillIds.map(id => {
      const found = woExistingBills.find(b => b.id === id);
      return { billId: id, billNo: found?.billNo ?? id, relationshipType: relType };
    });

    // Distribute the entered recovery amount across outstanding slips
    // oldest-first, capped at each slip's own balance — same allocation
    // Accounts Payment's own late-stage recovery picker already uses.
    const recoveries: { slipId: string; amount: number }[] = [];
    let remaining = recoveryAmount || 0;
    for (const slip of pendingAdvances) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, slip.balance);
      if (take > 0) recoveries.push({ slipId: slip._id, amount: take });
      remaining -= take;
    }

    const linkedToScopeItems = validItems.some((li) => li.scopeItemId);

    const payload = {
      billDate: dayjs(billDate).toISOString(),
      projectId: projectId || undefined,
      projectName: project?.name ?? "",
      vendorCode: activeVendorCode,
      vendorName: activeVendorName,
      generatedBy: generatedBy ?? "",
      contractorRefNo: contractorRefNo ?? "",
      remarks: remarksInput ?? "",
      gstPercent,
      tdsPercent: 0,
      billType,
      relationshipType: linkedBills.length > 0 ? relType : "NONE",
      linkedBills: linkedBills.length > 0 ? linkedBills : [],
      workOrderId: linkedToScopeItems ? (importedFromWOId || selectedWOId || undefined) : (selectedWOId || undefined),
      ...(isStandalone ? { companyId } : {}),
      retentionPercent: holdMode === "percent" ? (holdPercent || 0) : (gross > 0 ? Math.round((holdAmount / gross) * 10000) / 100 : 0),
      retentionAmount: holdAmount,
      ...(recoveries.length ? { advanceRecoveries: recoveries } : {}),
      lineItems: validItems.map(({ key: _k, lastBilledQty: _l, percentComplete: _p, groupLabel: _g, ...rest }) => ({
        ...rest,
        amount: rest.billedQty * rest.rate,
      })),
    };

    setSaving(true);
    try {
      const res = await apiClient.post<{ bill: Record<string, unknown> }>("/bills", payload);
      toast.success(`Bill ${res.data.bill.billNo} created — awaiting maker confirmation`);
      onCreated(res.data.bill);
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to create bill");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  // Bare, borderless inline-editable table-cell input — matches antd's
  // `bordered={false}` Input/InputNumber look used throughout this table
  // (as opposed to ui/Field's always-bordered, labeled form-field look).
  const cellInputClass = "w-full bg-transparent text-[13px] px-1 py-1 outline-none focus:ring-1 focus:ring-primary/30 rounded";

  return (
    <>
      <Modal
        icon={FileText}
        title="New Bill"
        subtitle="Select project → contractor or consultant → add work items → submit — lands in Draft, awaiting maker confirmation"
        extraWide
        onClose={onClose}
        footer={
          <div className="flex justify-end gap-2">
            <Btn outline label="Cancel" onClick={onClose} />
            <Btn color="primary" label="Save as Draft" loading={saving} onClick={handleSubmit} />
          </div>
        }
      >
        {/* Step 1 — Project, Contractor, Date */}
        <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg p-4 mb-5">
          <div className="font-bold text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] mb-3">Bill Information</div>

          <div className="mb-4">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Bill For</div>
            <Segmented
              value={partyType}
              onChange={(v) => {
                setPartyType(v as "contractor" | "consultant");
                setContractorId(""); setConsultantId(""); setWoList([]);
                setSelectedWOId(""); setWoExistingBills([]); setImportedFromWOId("");
              }}
              options={[{ value: "contractor", label: "Contractor" }, { value: "consultant", label: "Consultant" }]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <SField
              label="Site / Project"
              placeholder="Select project…"
              value={projectId || ""}
              onChange={(v) => { setProjectId(v); setWoList([]); }}
              options={[{ value: "", label: "— No project —" }, ...selectableProjects(projects).map((p) => ({ value: p.id, label: `${p.code ? p.code + " — " : ""}${p.name}` }))]}
            />
            {partyType === "contractor" ? (
              <>
                <SField
                  label="Contractor" required
                  placeholder="Search by name or vendor code…"
                  value={contractorId || ""}
                  onChange={(v) => setContractorId(v)}
                  options={contractors.map((c) => ({ value: c.id, label: `${vendorLabel(c.companyName, c.shortCode)}  (${c.vendorCode})` }))}
                  error={formErrors.errors.contractorId}
                />
                <Field
                  label="Vendor Code"
                  value={selectedContractor?.vendorCode || ""}
                  disabled
                  placeholder="Auto-filled"
                  className="text-primary font-bold font-mono"
                />
              </>
            ) : (
              <>
                <SField
                  label="Consultant" required
                  placeholder="Search by firm name or consultant code…"
                  value={consultantId || ""}
                  onChange={(v) => setConsultantId(v)}
                  options={consultants.map((c) => ({ value: c.id, label: `${c.firmName} (${c.consultantCode})` }))}
                  error={formErrors.errors.contractorId}
                />
                <Field
                  label="Consultant Code"
                  value={selectedConsultant?.consultantCode || ""}
                  disabled
                  placeholder="Auto-filled"
                  className="text-primary font-bold font-mono"
                />
              </>
            )}
          </div>

          {isStandalone && (
            <div className="mb-4 max-w-xs">
              <SField
                label="Company" required
                placeholder="Select billing company…"
                value={companyId}
                onChange={setCompanyId}
                options={companies.map((c) => ({ value: c.id, label: `${c.name} (${c.shortCode})` }))}
                error={formErrors.errors.companyId}
                hint="No project/work order linked — pick which group company this bill is raised through."
              />
            </div>
          )}

          {partyType === "contractor" && groupSiblings.length > 1 && (
            <div className="mb-4 max-w-md">
              <SField
                label="Pay To (Vendor Group)"
                hint={`${selectedContractor?.companyName} is part of a Vendor Group — this bill's payment can go to any member, not just the one whose Work Order this is.`}
                value={payeeVendorCode}
                onChange={setPayeeVendorCode}
                options={groupSiblings.map((c) => ({
                  value: c.vendorCode,
                  label: `${vendorLabel(c.companyName, c.shortCode)}  (${c.vendorCode})${c.vendorCode === selectedContractor?.vendorCode ? " — this work order's own vendor" : ""}`,
                }))}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <DatePicker label="Bill Date *" value={billDate} onChange={setBillDate} />
            <Field
              label="Generated By *" placeholder="Full name of person generating bill"
              value={generatedBy} onChange={(e) => setGeneratedBy(e.target.value)}
              error={formErrors.errors.generatedBy}
            />
            <Field
              label={partyType === "consultant" ? "Consultant Ref. No." : "Contractor Ref. No."} placeholder="e.g. ABCI/2026/003"
              value={contractorRefNo} onChange={(e) => setContractorRefNo(e.target.value)}
            />
          </div>
          {formErrors.errors.billDate && <div className="text-xs text-red-500 -mt-3 mb-3">{formErrors.errors.billDate}</div>}

          <div className="flex flex-wrap gap-4 mb-4">
            <div className="w-40">
              <SField
                label="GST Slab"
                hint="GST % applicable on this bill. TDS deduction is handled at payment time."
                value={isCustomGst ? "-1" : String(gstPercent)}
                onChange={(v) => {
                  if (v === "-1") { setIsCustomGst(true); return; }
                  setIsCustomGst(false);
                  setGstPercent(Number(v));
                }}
                options={GST_SLABS}
              />
            </div>
            {isCustomGst && (
              <div className="w-28">
                <Field
                  label="Custom %" type="number" min="0" max="100"
                  value={gstPercent} onChange={(e) => setGstPercent(Number(e.target.value) || 0)}
                />
              </div>
            )}
            <div className="flex-1 min-w-[200px]">
              <SField
                label="Bill Type"
                hint="Categorise what kind of bill this is for the billing chain"
                value={billType}
                onChange={setBillType}
                options={Object.entries(BILL_TYPE_CFG).map(([k, v]) => ({ value: k, label: v.label }))}
              />
            </div>
          </div>

          {/* Bill Relationship — link to existing bills on this WO */}
          <div className="rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-3.5 mb-3">
            <div className="font-bold text-xs text-blue-700 dark:text-blue-300 mb-2.5">
              Bill Relationship (optional)
              <span className="font-normal text-gray-500 dark:text-gray-400 ml-2">Link this bill to existing bills in a Work Order</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SField
                label="Select Work Order"
                placeholder="Search work order…"
                value={selectedWOId}
                onChange={(v) => { handleWOSelectForLinking(v); setLinkedBillIds([]); }}
                options={[{ value: "", label: "— None —" }, ...woList.map(wo => ({ value: wo.id, label: wo.workOrderNo }))]}
              />
              <SField
                label="Relationship Type"
                value={relType}
                onChange={setRelType}
                options={RELATIONSHIP_OPTIONS}
              />
            </div>
            {woExistingBills.length > 0 && (
              <div className="mt-2.5">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                  Select bills this new bill relates to:
                  {["SUPERSEDES", "REVISION_OF", "CORRECTION_OF"].includes(relType) && (
                    <span className="text-red-600 ml-1.5 font-semibold">
                      ⚠ Selected bills will be marked inactive (superseded)
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {woExistingBills.map(b => {
                    const isSelected = linkedBillIds.includes(b.id);
                    const isSuperseded = b.isActive === false;
                    return (
                      <div
                        key={b.id}
                        onClick={() => {
                          if (isSuperseded) return;
                          setLinkedBillIds(prev =>
                            prev.includes(b.id) ? prev.filter(x => x !== b.id) : [...prev, b.id]
                          );
                        }}
                        className={[
                          "rounded-md border px-2.5 py-1.5 text-xs select-none",
                          isSuperseded ? "cursor-not-allowed opacity-50 bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/40"
                            : isSelected ? "cursor-pointer bg-blue-50 dark:bg-blue-500/10 border-blue-600"
                              : "cursor-pointer bg-white dark:bg-transparent border-gray-200 dark:border-gray-700/40",
                        ].join(" ")}
                      >
                        <span className={`font-mono font-bold ${isSelected ? "text-blue-600" : "text-primary"}`}>{b.billNo}</span>
                        <span className="text-gray-400 ml-1.5">{fmt(b.amount)}</span>
                        <span className="ml-1.5"><StatusBadge status={b.status} /></span>
                        {isSuperseded && <Badge color="gray" small>Superseded</Badge>}
                        {isSelected && <span className="text-blue-600 ml-1">✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Work order import (optional) */}
          {woList.length > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3">
              <div className="font-semibold text-xs text-amber-700 dark:text-amber-300 mb-2">
                Work orders found — import scope items (optional)
              </div>
              <SField
                placeholder="Select a work order to import its scope items…"
                value={importWOPick}
                onChange={(v) => { if (v) { importFromWO(v); setImportWOPick(""); } }}
                options={woList.map((wo) => ({ value: wo.id, label: wo.workOrderNo + (wo.projectName ? " — " + wo.projectName : "") }))}
              />
            </div>
          )}
        </div>

        {/* Step 2 — Work Items table */}
        <div className="mb-5">
          <div className="font-bold text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] mb-2.5">
            Work Items
            <span className="font-normal text-[11px] text-gray-400 ml-2">
              Items imported from a work order show a Master Qty + % of Work Done — quantity auto-computes from the percent
            </span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th className="min-w-[300px] w-[36%]">Description of Work *</Th>
                  <Th className="text-center">Unit</Th>
                  <Th className="text-right">Master Qty</Th>
                  <Th className="text-right">% of Work</Th>
                  <Th className="text-right">Quantity *</Th>
                  <Th className="text-right">Rate (₹) *</Th>
                  <Th className="text-right">Amount (₹)</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {(() => {
                  const rows: ReactNode[] = [];
                  const seenGroups = new Set<string>();
                  lineItems.forEach((item) => {
                    const groupKey = item.scopeItemId && item.subItemId ? item.scopeItemId : null;

                    if (groupKey && !seenGroups.has(groupKey)) {
                      seenGroups.add(groupKey);
                      const isExpanded = expandedGroups.has(groupKey);
                      const particulars = lineItems.filter((li) => li.scopeItemId === groupKey && li.subItemId);
                      const groupAmount = particulars.reduce((s, li) => s + (li.amount || 0), 0);
                      rows.push(
                        <Tr
                          key={`group-${groupKey}`}
                          onClick={() => setExpandedGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
                            return next;
                          })}
                          className="cursor-pointer bg-blue-50 dark:bg-blue-500/10"
                        >
                          <Td colSpan={6} className="font-bold text-blue-700 dark:text-blue-300">
                            <span className={`inline-block mr-2 transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                            {item.groupLabel}
                            <span className="font-normal text-gray-500 dark:text-gray-400 ml-2">
                              {particulars.length} particular{particulars.length === 1 ? "" : "s"} — click to {isExpanded ? "collapse" : "add % of work done per particular"}
                            </span>
                          </Td>
                          <Td className={`text-right font-mono font-bold ${groupAmount > 0 ? "text-emerald-600" : "text-gray-300"}`}>
                            {groupAmount > 0 ? fmt(groupAmount) : "—"}
                          </Td>
                          <Td></Td>
                        </Tr>
                      );
                    }

                    if (groupKey && !expandedGroups.has(groupKey)) return;

                    const cap = remainingPercent(item);
                    rows.push(
                      <Tr key={item.key} className={groupKey ? "bg-gray-50/60 dark:bg-gray-800/20" : ""}>
                        <Td
                          className="min-w-[300px] w-[36%]"
                          style={groupKey ? { paddingLeft: 26 } : undefined}
                        >
                          <input
                            value={item.description}
                            placeholder="e.g. RCC work, Plastering, Tile fixing…"
                            onChange={(e) => updateLineItem(item.key, "description", e.target.value)}
                            className={`${cellInputClass} min-w-0`}
                          />
                        </Td>
                        <Td className="text-center">
                          <input
                            value={item.unit}
                            placeholder="sqft"
                            onChange={(e) => updateLineItem(item.key, "unit", e.target.value)}
                            className={`${cellInputClass} text-center`}
                          />
                        </Td>
                        <Td className="text-right font-mono text-gray-500 dark:text-gray-400">
                          {item.scopeItemId ? item.plannedQty : "—"}
                        </Td>
                        <Td>
                          {item.scopeItemId ? (
                            <div>
                              <input
                                value={formatPercent(item.percentComplete)}
                                placeholder="0"
                                onChange={(e) => updateLineItem(item.key, "percentComplete", parsePercent(e.target.value))}
                                className={`${cellInputClass} text-right`}
                              />
                              {cap != null && <div className="text-[10px] text-gray-400 text-right">{cap}% remaining</div>}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-[11px] block text-right">—</span>
                          )}
                        </Td>
                        <Td>
                          <input
                            type="number" min="0"
                            value={item.billedQty || ""}
                            placeholder="0"
                            onChange={(e) => updateLineItem(item.key, "billedQty", Number(e.target.value) || 0)}
                            className={`${cellInputClass} text-right`}
                          />
                        </Td>
                        <Td>
                          <input
                            value={formatThousands(item.rate || "")}
                            placeholder="0.00"
                            onChange={(e) => updateLineItem(item.key, "rate", parseThousands(e.target.value))}
                            className={`${cellInputClass} text-right`}
                          />
                        </Td>
                        <Td className={`text-right font-mono font-bold whitespace-nowrap ${item.amount > 0 ? "text-emerald-600" : "text-gray-300"}`}>
                          {item.amount > 0 ? fmt(item.amount) : "—"}
                        </Td>
                        <Td className="text-center">
                          <button
                            type="button"
                            disabled={lineItems.length === 1}
                            onClick={() => setConfirmRemoveKey(item.key)}
                            className="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:pointer-events-none p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Td>
                      </Tr>
                    );
                  });
                  return rows;
                })()}
              </Tbody>
            </Table>
          </div>
          <div className="mt-2">
            <Btn outline icon={Plus} label="Add Work Item" className="w-full" onClick={() => setLineItems((prev) => [...prev, blankRow()])} />
          </div>

          {/* Financial Summary — Gross/GST, then Hold and Advance Recovery both
              decided right here at creation time, both live-reducing what's shown
              as actually payable. */}
          <div className="border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-hidden mt-3">
            <div className="bg-primary/5 border-b border-primary/20 px-3.5 py-2">
              <span className="font-bold text-xs text-primary uppercase tracking-wide">Financial Summary</span>
            </div>
            <div className="font-mono text-[13px]">
              <div className="flex justify-between px-3.5 py-1.5 border-b border-gray-100 dark:border-gray-700/40">
                <span>Gross Amount</span><span>{fmt(gross)}</span>
              </div>
            </div>

            {/* Hold — taken off the gross first, since it's a security deposit on the
                contractor's own basic value, not on the GST they merely collect on
                the government's behalf. GST below is calculated on what's left. */}
            <div className="p-3.5 border-b border-gray-100 dark:border-gray-700/40 bg-amber-50 dark:bg-amber-500/10">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-xs text-amber-800 dark:text-amber-300">Hold (Retention)</span>
                <Segmented
                  value={holdMode}
                  onChange={setHoldMode}
                  options={[{ value: "percent", label: "%" }, { value: "amount", label: "₹" }]}
                />
              </div>
              {holdMode === "percent" ? (
                <Field
                  type="number" min="0" max="100" placeholder="0 — leave blank to skip"
                  value={holdPercent || ""} onChange={(e) => setHoldPercent(Number(e.target.value) || 0)}
                />
              ) : (
                <Field
                  type="number" min="0" max={gross} placeholder="0 — leave blank to skip"
                  value={holdAmountInput || ""} onChange={(e) => setHoldAmountInput(Number(e.target.value) || 0)}
                />
              )}
              <div className="flex justify-between text-xs mt-1.5 text-amber-700 dark:text-amber-400 font-mono">
                <span>Held this bill</span><span>− {fmt(holdAmount)}</span>
              </div>
            </div>

            {/* Advance Recovery — deducted (along with Hold, above) BEFORE GST is
                calculated, not after, so it's shown here rather than below.
                Contractor-only — Consultants don't carry advance slips. */}
            {partyType === "contractor" && !advancesUnavailable && (
              <div className="p-3.5 border-b border-gray-100 dark:border-gray-700/40 bg-amber-50/60 dark:bg-amber-500/5">
                <div className="font-bold text-xs text-amber-800 dark:text-amber-300 mb-2">Advance Recovery</div>
                {advancesLoading && <div className="text-xs text-gray-400 mb-2">Checking pending advances…</div>}
                {!advancesLoading && pendingAdvances.length > 0 && (
                  <div className="mb-2.5">
                    {pendingAdvances.map(slip => (
                      <div key={slip._id} className="flex justify-between text-xs py-0.5 border-b border-amber-200/60 dark:border-amber-500/20">
                        <span className="text-amber-900 dark:text-amber-200">{slip.slipNo}{slip.reference ? ` — ${slip.reference}` : ""}</span>
                        <span className="font-mono font-semibold text-amber-700 dark:text-amber-400">Balance: {fmt(slip.balance)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!advancesLoading && pendingAdvances.length === 0 && (
                  <div className="text-xs text-gray-400 mb-2">No outstanding advance slips for this vendor on this project.</div>
                )}
                <Field
                  type="number" min="0" max={maxRecovery > 0 ? maxRecovery : undefined} step="1"
                  placeholder="0 — leave blank to skip recovery"
                  value={recoveryAmount ?? ""}
                  onChange={(e) => setRecoveryAmount(e.target.value ? Number(e.target.value) : null)}
                  disabled={pendingAdvances.length === 0}
                  hint="Recovered right now, real-time — the advance slip's own balance updates immediately."
                />
              </div>
            )}

            <div className="font-mono text-[13px]">
              <div className="flex justify-between px-3.5 py-1.5 border-b border-gray-100 dark:border-gray-700/40">
                <span>Net Before GST</span><span>{fmt(gross - holdAmount - (recoveryAmount || 0))}</span>
              </div>
              <div className="flex justify-between px-3.5 py-1.5 border-b border-gray-100 dark:border-gray-700/40 text-emerald-600">
                <span>+ GST @ {gstPercent}%</span><span>{fmt(gstAmt)}</span>
              </div>
            </div>

            <div className="flex justify-between px-3.5 py-2.5 bg-primary/5 font-extrabold text-[15px] text-primary">
              <span>Payable Now</span>
              <span>{fmt(payableNow)}</span>
            </div>
            <div className="px-3.5 py-1.5 text-[11px] text-gray-400 border-t border-gray-100 dark:border-gray-700/40">
              TDS deduction is recorded at payment initiation time
            </div>
          </div>
        </div>

        <Field
          textarea label="Remarks" placeholder="Describe the scope of work covered in this bill…"
          value={remarksInput} onChange={(e) => setRemarksInput(e.target.value)}
        />
      </Modal>

      {confirmRemoveKey != null && (
        <ConfirmModal
          title="Remove this row?"
          message="This work item row will be removed from the bill."
          confirmLabel="Remove"
          danger
          onConfirm={() => { removeLineItem(confirmRemoveKey); setConfirmRemoveKey(null); }}
          onCancel={() => setConfirmRemoveKey(null)}
          zIndex={210}
        />
      )}
    </>
  );
}
