import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Receipt, FileText, Ban, CheckCircle2, Eye, Download, Printer, FileStack, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import apiClient from "../../services/apiClient";
import { printBill, resolvePrintParty } from "../../shared/utils/printBill";
import { printAdvanceSlip } from "../../shared/utils/printAdvanceSlip";
import PageHeader from "../../ui/PageHeader";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import { Descriptions, DescItem } from "../../ui/Descriptions";
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import Spinner from "../../ui/Spinner";
import EmptyState from "../../ui/EmptyState";
import { SearchFilter, DropdownSelectFilter } from "../../ui/Filters";
import VendorParty, { vendorPartyText } from "../../components/VendorParty";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import { selectableProjects } from "../../utils/projectOptions";
import { useAuth } from "../../context/AuthContext";
import type { AuthUser } from "../../context/AuthContext";
import { BILL_TYPE_CFG } from "../../shared/constants/billOptions";
import { BILL_STATUS, BILL_STATUS_LABEL } from "../../shared/constants/billStatus";
import { billFinancials } from "../../shared/utils/billMath";
import NewBillDrawer from "./NewBillDrawer";
import SiteProgress from "../SiteProgress";
import { BillStageCell } from "../../components/BillDetailModal";
import SlaTimeline from "../../components/SlaTimeline";

// ── Types — a read-only slice of what AccountsPayment's own Bill looks
// like; this page never edits a bill, only lists/views + creates new ones ──

interface BillLineItem {
  description: string;
  unit: string;
  plannedQty: number;
  billedQty: number;
  rate: number;
  amount: number;
}

interface Bill {
  id: string;
  billNo: string;
  workOrderId?: string;
  workOrderNo?: string;
  projectId?: string;
  projectName?: string;
  vendorCode?: string;
  vendorName?: string;
  // Set on a merged-in BillRequest row when a GM/L3/L4 approver overrode who
  // actually gets paid (a fellow Vendor Group member) — print/download must
  // resolve bank details for this payee, not the row's own vendorCode.
  payeeVendorCode?: string;
  payeeVendorName?: string;
  // Vendor Group the paid-to vendor belongs to, when any (display / filter only).
  vendorGroupId?: string;
  vendorGroupName?: string;
  companyName?: string;
  billDate: string;
  generatedBy?: string;
  lineItems: BillLineItem[];
  amount: number;
  gstPercent: number;
  retentionPercent?: number;
  retentionAmount?: number;
  advanceRecovery?: number;
  supersedeDeduction?: number;
  linkedBills?: { billNo: string; relationshipType?: string; amount?: number; description?: string }[];
  tdsPercent?: number;
  tdsAmount?: number;
  remarks?: string;
  // Only on a merged-in Bill Request row (billType === "bill_request"): its raw
  // status, since `status` there is just a display label.
  requestStatus?: "pending" | "pending-gm" | "pending-l3" | "pending-l4";
  // How many approval levels this request's department needs (1-4).
  approvalLevels?: number;
  documents?: { name: string; url: string }[];
  status: string;
  manualApprovalStatus?: "pending" | "pending-gm" | "pending-l3" | "pending-l4" | "approved" | "rejected";
  billType?: string;
  createdAt?: string;
  // Only set on a merged-in BillRequest row (billType === 'bill_request') —
  // its own AGM/GM/L3/L4 chain, read instead of the RunningBill stage
  // fields below for that row's "Bill Approvals" table.
  approvalHistory?: { stage: string; action: string; byName?: string; at?: string }[];
  // Set only for a manually-created bill saved via "Save as Draft" — hasn't
  // entered the AGM/GM approval chain yet (manualApprovalStatus stays
  // unset/undefined for it). The backend already scopes listBills to only
  // return these to their own creator or Owner, so a row with this true here
  // is always one this user is allowed to see.
  isUnsubmittedDraft?: boolean;
  createdBy?: { _id?: string; name?: string } | string;
  // Denormalized from the linked Work Order at bill-creation time (see
  // RunningBill.department) — which internal team this bill belongs to.
  department?: string;
  customDepartment?: string;

  // ── Accounts Payment's own Verification → L1 AGM → L2 Director → TMS
  // chain — always present on the bill itself (regardless of how it was
  // created), just empty until each stage is actually reached.
  verificationBy?: { name: string } | null;
  verificationAt?: string;
  l1ApprovedBy?: { name: string } | null;
  l1ApprovedAt?: string;
  l2ApprovedBy?: { name: string } | null;
  l2ApprovedAt?: string;
  tmsSentAt?: string;
  tmsCallbackReceivedAt?: string;
  paidAmount?: number;
  adjustmentAmount?: number;
  adjustmentRemark?: string;
  retentionReleased?: number;
  retentionReleaseRemark?: string;
  paymentUTR?: string;

  // ── Pre-Accounts sign-off ────────────────────────────────────
  // A progress-driven bill's AGM/GM approval happened on its originating
  // BillRequest, fetched separately (see loadApprovalHistory) — these are
  // only the RunningBill-level fallbacks for older/batch-created bills.
  agmApprovedBy?: { name: string } | null;
  agmApprovedAt?: string;
  // Only set on a merged-in BillRequest row whose department needed more
  // than 2 levels — see approvalHistory's own comment above; these mirror
  // agmApprovedBy's shape so printBill's signature block can read them.
  gmApprovedBy?: { name: string } | null;
  gmApprovedAt?: string;
  l3ApprovedBy?: { name: string } | null;
  l3ApprovedAt?: string;
  l4ApprovedBy?: { name: string } | null;
  l4ApprovedAt?: string;
  // A manually created bill (Billing → New Bill) has no BillRequest at all —
  // this is its own, separate AGM/GM sign-off chain instead.
  manualAgmApprovedBy?: { name: string } | null;
  manualAgmApprovedAt?: string;
  manualGmApprovedBy?: { name: string } | null;
  manualGmApprovedAt?: string;
  manualRejectedBy?: { name: string } | null;
  manualRejectReason?: string;

  // Only set on a merged-in AdvanceSlip row (billType === 'advance_slip') —
  // see billController.js::listBills.
  amountRecovered?: number;
  reference?: string;
  notes?: string;
}

// billType === "advance_slip" is the discriminator the backend sets only on
// a merged-in AdvanceSlip row (see billController.js::listBills) — every
// other field on that row stays undefined except the ones mapped there
// (billNo/vendorName/projectName/amount/billDate/status). A real RunningBill
// row's billType is always one of BILL_TYPE_CFG's own keys, never this.
function isAdvanceSlipRow(b: Bill): boolean {
  return b.billType === "advance_slip";
}

interface ProjectOpt { id: string; name: string; code: string; parentId?: string | null; }

const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Per-unit rates are fractional far more often than totals are — rounding
// them for display (as fmt() does) silently turns 130.5 into 131.
const fmtRate = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const netAfterAdvance = (b: Bill) =>
  billFinancials({
    gross: b.amount || 0, gstPercent: b.gstPercent ?? 0,
    retentionAmount: b.retentionAmount ?? 0, advanceRecovery: b.advanceRecovery ?? 0,
    supersedeDeduction: b.supersedeDeduction ?? 0, retentionReleased: b.retentionReleased ?? 0,
  }).netPayable;
import { normalizeId } from "../../shared/utils/normalizeId";

// Nexora semantic mapping for each backend bill status — gray/amber for the
// early not-yet-approved stages, blue/indigo/cyan as it moves through the
// approval chain, orange for the on-hold warning state, green once paid,
// red once rejected. Mirrors BILL_STATUS_COLOR's ordering, just recolored
// onto the fixed Nexora badge palette instead of arbitrary hex.
const BILL_STATUS_BADGE_COLOR: Record<string, NxBadgeColor> = {
  draft: "gray",
  "verify-done": "amber",
  "l1-approved": "blue",
  approved: "indigo",
  "sent-to-tms": "cyan",
  hold: "orange",
  paid: "green",
  rejected: "red",
};

function hasPerm(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  return !!user.permissions?.find((p) => p.module === "billing")?.actions.includes(action);
}

const ADVANCE_SLIP_STATUS_BADGE_COLOR: Record<string, NxBadgeColor> = {
  outstanding: "amber",
  partial: "blue",
  recovered: "green",
};
const ADVANCE_SLIP_STATUS_LABEL: Record<string, string> = {
  outstanding: "Outstanding",
  partial: "Partially Recovered",
  recovered: "Recovered",
};

export default function Billing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = hasPerm(user, "create");

  const [bills, setBills] = useState<Bill[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);

  const [viewBillId, setViewBillId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  // Edit re-opens the New Bill drawer prefilled; Delete asks first.
  const [editBill, setEditBill] = useState<Bill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bill | null>(null);
  // A Bill Request (not a manual bill) being re-picked — opens Site Progress's edit drawer right here.
  const [editBRId, setEditBRId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // The originating BillRequest's own _id — only resolvable when this bill
  // came from the normal request flow (matched below) — used to look up its
  // SLA timeline, since a manually created bill has no BillRequest and thus
  // no SLA instance to show.
  const [viewApprovalBillRequestId, setViewApprovalBillRequestId] = useState<string | null>(null);

  // Same print-ready template Accounts Payment/Site Progress already use for
  // a bill — opens a new window and triggers window.print(), where "Save as
  // PDF" is the actual "download". The list here already carries every field
  // the template needs (lineItems, gstPercent, etc. — see the Bill interface
  // above), so only the vendor's (Contractor or Consultant) bank details need
  // a fresh lookup.
  async function handleDownload(bill: Bill) {
    // An AdvanceSlip row has no line items/GST/approval chain — the full
    // RunningBill print template doesn't apply, so it gets its own minimal
    // template (see printAdvanceSlip.ts) instead of being forced through
    // printBill's pre/post-payment layout.
    if (isAdvanceSlipRow(bill)) {
      setDownloadingId(bill.id);
      try {
        // Same contractor lookup a real bill's print already does (bank/GST/
        // PAN details) — see resolvePrintParty in printBill.ts.
        const contractor = await resolvePrintParty(bill.vendorCode);
        printAdvanceSlip({
          slipNo: bill.billNo,
          contractorName: bill.vendorName,
          contractorCode: bill.vendorCode,
          projectName: bill.projectName,
          companyName: bill.companyName,
          generatedBy: bill.generatedBy,
          amount: bill.amount,
          amountRecovered: bill.amountRecovered,
          reference: bill.reference,
          notes: bill.notes,
          date: bill.billDate,
          status: bill.status,
        }, contractor);
      } catch {
        toast.error("Failed to prepare the advance slip for download");
      } finally {
        setDownloadingId(null);
      }
      return;
    }
    setDownloadingId(bill.id);
    try {
      const contractor = await resolvePrintParty(bill.vendorCode);
      // Bank Details must reflect who actually gets paid — a GM/L3/L4
      // approver's payeeVendorCode override, when one was set, same as
      // BillRequests page's own printBillRequest already does.
      const payeeContractor = bill.payeeVendorCode && bill.payeeVendorCode !== bill.vendorCode
        ? await resolvePrintParty(bill.payeeVendorCode)
        : null;
      // A merged-in BillRequest row (billType === 'bill_request') never
      // carries the flat agmApprovedBy/gmApprovedBy/etc. fields the print
      // template's signature block reads — only approvalHistory (used for
      // the "Bill Request Approvals" table above) — so the printout showed
      // a blank L1/L2 signature even once actually approved. Derived here,
      // same stage/byName/at shape printBillRequest's own pseudoBill build
      // already uses on the BillRequests page.
      const approvalByStage = (stage: string) => bill.approvalHistory?.find(h => h.stage === stage && h.action === "approved");
      const printableBill = bill.billType === "bill_request" ? {
        ...bill,
        agmApprovedBy: approvalByStage("agm")?.byName ? { name: approvalByStage("agm")!.byName! } : bill.agmApprovedBy,
        agmApprovedAt: approvalByStage("agm")?.at ?? bill.agmApprovedAt,
        gmApprovedBy: approvalByStage("gm")?.byName ? { name: approvalByStage("gm")!.byName! } : bill.gmApprovedBy,
        gmApprovedAt: approvalByStage("gm")?.at ?? bill.gmApprovedAt,
        l3ApprovedBy: approvalByStage("l3")?.byName ? { name: approvalByStage("l3")!.byName! } : bill.l3ApprovedBy,
        l3ApprovedAt: approvalByStage("l3")?.at ?? bill.l3ApprovedAt,
        l4ApprovedBy: approvalByStage("l4")?.byName ? { name: approvalByStage("l4")!.byName! } : bill.l4ApprovedBy,
        l4ApprovedAt: approvalByStage("l4")?.at ?? bill.l4ApprovedAt,
      } : bill;
      printBill(printableBill, contractor, bill.status === "paid" ? "post" : "pre", undefined, payeeContractor);
    } catch {
      toast.error("Failed to prepare the bill for download");
    } finally {
      setDownloadingId(null);
    }
  }

  // A slip row has no bill-detail drawer to open (no lineItems/approval
  // chain/etc. worth showing there) — clicking it instead goes to the
  // Advance Payments page, where its full outstanding/partial/recovered
  // lifecycle actually lives, rather than opening the RunningBill-shaped
  // view modal below on a row it wasn't built for.
  function handleRowClick(bill: Bill) {
    if (isAdvanceSlipRow(bill)) {
      navigate("/advance-payments");
      return;
    }
    setViewBillId(bill.id);
  }

  // Submits a "Save as Draft" bill into the AGM/GM approval chain — same
  // pattern as handleDownload's own loading-flag-per-row above.
  async function handleSubmitDraft(bill: Bill) {
    setSubmittingId(bill.id);
    try {
      await apiClient.patch(`/bills/${bill.id}/submit-draft`);
      toast.success(`Bill ${bill.billNo} submitted — awaiting AGM/GM sign-off`);
      loadBills();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to submit draft");
    } finally {
      setSubmittingId(null);
    }
  }

  // Same eligibility the backend enforces for editing/deleting a manual bill:
  // nobody has approved it yet (pending L1) or it is still an unsubmitted draft.
  // At L1 (or a draft) anyone granted "Edit Bill"/"Delete Bill" (on Billing or
  // Bill Approval) may; once the bill is past L1 only an admin (Owner) can.
  const canChangeBill = (b: Bill, action: "edit-bill" | "delete-bill") => {
    if (!user || isAdvanceSlipRow(b)) return false;
    const isRequest = b.billType === "bill_request";
    if (!isRequest && b.status !== "draft") return false;
    const status = isRequest ? b.requestStatus : (b.isUnsubmittedDraft ? "pending" : (b.manualApprovalStatus as string | undefined));
    if (!status || !["pending", "pending-gm", "pending-l3", "pending-l4"].includes(status)) return false;
    if (user.role === "owner") return true;
    if (status !== "pending") return false;
    return !!user.permissions?.some((p) => (p.module === "billing" || p.module === "bill-requests") && p.actions.includes(action));
  };

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(deleteTarget.billType === "bill_request" ? `/bill-requests/${deleteTarget.id}` : `/bills/${deleteTarget.id}`);
      toast.success(`${deleteTarget.billType === "bill_request" ? "Bill request" : "Bill"} ${deleteTarget.billNo} deleted`);
      setBills((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to delete bill");
    } finally {
      setDeleting(false);
    }
  }

  const loadBills = useCallback(() => {
    setLoading(true);
    apiClient.get<{ bills: Record<string, unknown>[] }>("/bills")
      .then((r) => setBills((r.data.bills || []).map((b) => normalizeId(b) as unknown as Bill)))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadBills(); }, [loadBills]);

  // Deep link from Advance Payments (and anywhere else): /billing?billNo=RA-0123
  // opens that bill's view drawer once the list has loaded.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const wanted = searchParams.get("billNo");
    if (!wanted || loading) return;
    const found = bills.find((b) => b.billNo === wanted && !isAdvanceSlipRow(b));
    if (found) setViewBillId(found.id);
    else toast.error(`Bill ${wanted} was not found — it may have been renumbered after approval`);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, bills, searchParams]);

  useEffect(() => {
    apiClient.get<{ projects: Record<string, unknown>[] }>("/projects")
      .then((r) => setProjects((r.data.projects || []).map((p) => normalizeId(p) as unknown as ProjectOpt)))
      .catch(() => { });
  }, []);

  // A SUPERSEDES bill's linked bills stay active forever (only their amount
  // is deducted — see billMath.ts) so there's nothing on the old bill itself
  // marking it "used up". Build the reverse lookup here instead: for every
  // bill, which OTHER bill(s) list it in their own linkedBills as SUPERSEDES —
  // keyed by billNo since that's all linkedBills carries (no billId on it).
  const supersededByMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const b of bills) {
      for (const l of b.linkedBills ?? []) {
        if (l.relationshipType !== "SUPERSEDES") continue;
        (map[l.billNo] ??= []).push(b.billNo);
      }
    }
    return map;
  }, [bills]);

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        (b.billNo || "").toLowerCase().includes(q) ||
        (b.vendorName || "").toLowerCase().includes(q) ||
        (b.vendorGroupName || "").toLowerCase().includes(q) ||
        (b.workOrderNo || "").toLowerCase().includes(q) ||
        (b.projectName || "").toLowerCase().includes(q) ||
        (b.generatedBy || "").toLowerCase().includes(q) ||
        String(b.amount ?? "").includes(q);
      const matchProject = !projectFilter || b.projectId === projectFilter;
      const matchStatus = !statusFilter || b.status === statusFilter;
      const matchDept = !deptFilter || (b.department || "") === deptFilter;
      const matchGroup = !groupFilter || b.vendorGroupId === groupFilter;
      const matchDate = inDateRange(b.billDate, dateFrom, dateTo);
      return matchSearch && matchProject && matchStatus && matchDept && matchGroup && matchDate;
    }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [bills, search, projectFilter, statusFilter, deptFilter, groupFilter, dateFrom, dateTo]);

  // Vendor Groups that actually appear in the loaded bills — the group filter's options.
  const groupOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of bills) if (b.vendorGroupId && b.vendorGroupName) seen.set(b.vendorGroupId, b.vendorGroupName);
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [bills]);

  const { page, totalPages, setPage, pageItems: pagedBills } = usePagination(filteredBills, 20);

  // Computed off the raw (unfiltered) list so clicking a stat card always
  // shows the true total for that bucket, not a number depressed by
  // whatever filter is already active — same convention as WorkItems.
  const statusCounts = useMemo(() => {
    const c = { total: bills.length, draft: 0, hold: 0, paid: 0 };
    for (const b of bills) {
      if (b.status === "draft") c.draft++;
      else if (b.status === "hold") c.hold++;
      else if (b.status === "paid") c.paid++;
    }
    return c;
  }, [bills]);

  const viewBill = useMemo(
    () => (viewBillId ? bills.find((b) => b.id === viewBillId) || null : null),
    [bills, viewBillId]
  );

  useEffect(() => {
    setViewApprovalBillRequestId(null);
    if (!viewBill?.workOrderId) return;
    apiClient.get<{ billRequests: Record<string, unknown>[] }>(`/bill-requests?workOrderId=${viewBill.workOrderId}`)
      .then((r) => {
        const match = (r.data.billRequests || []).find((br) => {
          const billId = br.billId as { _id?: string } | string | undefined;
          const id = typeof billId === "string" ? billId : billId?._id;
          return id === viewBill.id;
        });
        if (match) setViewApprovalBillRequestId((match as { _id?: string })._id ?? null);
      })
      .catch(() => { });
  }, [viewBill?.workOrderId, viewBill?.id]);

  return (
    <div>
      <PageHeader
        icon={Receipt}
        title="Billing"
        subtitle="Every bill in the system — from DRI-progress → L1 → L2 approvals, or created directly here — still processed through Accounts Payment"
        actions={
          <div className="flex items-center gap-2">
            <NxBtn color="secondary" icon={FileStack} label="Advance Slips" onClick={() => navigate("/advance-payments?from=billing")} />
            {canCreate && <NxBtn color="primary" icon={Plus} label="New Bill" onClick={() => setNewOpen(true)} />}
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <NxStatCard label="Total Bills" value={statusCounts.total} icon={Receipt} />
        <NxStatCard
          label="Awaiting Verification" value={statusCounts.draft} icon={FileText}
          active={statusFilter === BILL_STATUS.DRAFT}
          onClick={() => setStatusFilter(statusFilter === BILL_STATUS.DRAFT ? "" : BILL_STATUS.DRAFT)}
        />
        <NxStatCard
          label="Hold" value={statusCounts.hold} icon={Ban}
          active={statusFilter === BILL_STATUS.HOLD}
          onClick={() => setStatusFilter(statusFilter === BILL_STATUS.HOLD ? "" : BILL_STATUS.HOLD)}
        />
        <NxStatCard
          label="Paid" value={statusCounts.paid} icon={CheckCircle2}
          active={statusFilter === BILL_STATUS.PAID}
          onClick={() => setStatusFilter(statusFilter === BILL_STATUS.PAID ? "" : BILL_STATUS.PAID)}
        />
      </div>

      <div className="bg-white/90 dark:bg-gray-800/95 backdrop-blur-xl border border-gray-100 dark:border-gray-700/50 rounded-xl shadow-sm p-5">
        <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
          <div className="flex gap-2.5 items-center flex-wrap">
            <SearchFilter placeholder="Search bill no., vendor, group, WO, project…" value={search} onChange={setSearch} />
            <DropdownSelectFilter
              value={projectFilter}
              onChange={setProjectFilter}
              placeholder="All Projects"
              resetValue=""
              options={selectableProjects(projects).map((p) => ({ value: p.id, label: p.name }))}
            />
            <DropdownSelectFilter
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="All Statuses"
              resetValue=""
              options={Object.values(BILL_STATUS).map((s) => ({ value: s, label: BILL_STATUS_LABEL[s] || s }))}
            />
            <DropdownSelectFilter
              value={deptFilter}
              onChange={setDeptFilter}
              placeholder="All Departments"
              resetValue=""
              options={[
                { label: "Civil Team", value: "civil" },
                { label: "Marketing Team", value: "marketing" },
                { label: "Planning Team", value: "planning" },
                { label: "Maintenance Team", value: "maintenance" },
                { label: "Custom Team", value: "custom" },
              ]}
            />
            {groupOptions.length > 0 && (
              <DropdownSelectFilter
                value={groupFilter}
                onChange={setGroupFilter}
                placeholder="All Vendor Groups"
                resetValue=""
                options={groupOptions}
              />
            )}
            <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
            <span className="ml-auto text-gray-400 text-xs whitespace-nowrap">
              {filteredBills.length} bill{filteredBills.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {loading ? (
          <Spinner size="large" />
        ) : filteredBills.length === 0 ? (
          <EmptyState icon={FileText} title="No bills found" message="Try adjusting your search or filters." />
        ) : (
          <>
            <Table>
              <Thead>
                <Tr>
                  <Th className="w-[105px]">Bill No.</Th>
                  <Th className="w-[125px]">Bill Type</Th>
                  <Th className="w-[100px]">Work Order</Th>
                  <Th className="w-[150px]">Vendor</Th>
                  <Th className="w-[110px]">Project</Th>
                  <Th className="text-right w-[105px]">Amount</Th>
                  <Th className="w-[105px]">Approval</Th>
                  <Th className="w-[135px]">Accounts</Th>
                  <Th className="w-[90px] whitespace-nowrap">Date</Th>
                  <Th className="w-[140px]">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pagedBills.map((r) => (
                  <Tr key={r.id} className="cursor-pointer" onClick={() => handleRowClick(r)}>
                    <Td className="font-bold text-primary">
                      <div className="whitespace-nowrap truncate" title={r.billNo}>{r.billNo}</div>
                      {supersededByMap[r.billNo]?.length ? (
                        <div
                          className="mt-0.5 inline-block text-[10px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-500/20 px-1.5 py-0.5 rounded-full whitespace-nowrap"
                          title={`Superseded by ${supersededByMap[r.billNo].join(", ")}`}
                        >
                          Superseded
                        </div>
                      ) : null}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {isAdvanceSlipRow(r) ? (
                        <NxBadge color="indigo">Advance Slip</NxBadge>
                      ) : r.billType ? (
                        <NxBadge color="blue">{BILL_TYPE_CFG[r.billType]?.label || r.billType}</NxBadge>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap truncate" title={r.workOrderNo || ""}>{r.workOrderNo || <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                    <Td className="truncate" title={[r.vendorGroupName, r.vendorName].filter(Boolean).join(" · ")}>
                      <VendorParty vendorName={r.vendorName} groupName={r.vendorGroupName} payeeName={r.billType === "bill_request" ? r.payeeVendorName : r.vendorName} />
                    </Td>
                    <Td className="whitespace-nowrap truncate" title={r.projectName || ""}>{r.projectName || <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                    <Td className="text-right font-bold whitespace-nowrap">{fmt(netAfterAdvance(r))}</Td>
                    <Td>
                      {r.isUnsubmittedDraft ? (
                        <NxBadge color="gray">Draft</NxBadge>
                      ) : (r.manualApprovalStatus === "pending" || r.manualApprovalStatus === "pending-gm" || r.manualApprovalStatus === "rejected") ? (
                        <>
                          {r.manualApprovalStatus === "pending" && <NxBadge color="orange">Pending L1</NxBadge>}
                          {r.manualApprovalStatus === "pending-gm" && <NxBadge color="orange">Pending L2</NxBadge>}
                          {r.manualApprovalStatus === "rejected" && <NxBadge color="red">L1/L2 Rejected</NxBadge>}
                        </>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </Td>
                    <Td>
                      {isAdvanceSlipRow(r) ? (
                        <NxBadge color={ADVANCE_SLIP_STATUS_BADGE_COLOR[r.status] ?? "gray"}>{ADVANCE_SLIP_STATUS_LABEL[r.status] || r.status}</NxBadge>
                      ) : (
                        <NxBadge color={BILL_STATUS_BADGE_COLOR[r.status] ?? "gray"}>{BILL_STATUS_LABEL[r.status] || r.status}</NxBadge>
                      )}
                    </Td>
                    <Td>{r.billDate ? dayjs(r.billDate).format("DD MMM YYYY") : "—"}</Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-0">
                        {r.isUnsubmittedDraft && (
                          <NxBtn
                            color="primary"
                            title="Submit for approval"
                            label="Submit"
                            loading={submittingId === r.id}
                            onClick={() => handleSubmitDraft(r)}
                          />
                        )}
                        <NxBtn color="icon" title="View" icon={Eye} className="shrink-0 !w-7" onClick={() => handleRowClick(r)} />
                        <NxBtn color="icon" title="Print / Download" icon={Download} className="shrink-0 !w-7" loading={downloadingId === r.id} onClick={() => handleDownload(r)} />
                        {canChangeBill(r, "edit-bill") && (
                          <NxBtn color="icon" title="Edit" icon={Pencil} className="shrink-0 !w-7" onClick={() => (r.billType === "bill_request" ? setEditBRId(r.id) : setEditBill(r))} />
                        )}
                        {canChangeBill(r, "delete-bill") && (
                          <NxBtn color="icon" title="Delete" icon={Trash2} className="shrink-0 !w-7" onClick={() => setDeleteTarget(r)} />
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination page={page} totalPages={totalPages} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {viewBill && (
        <Modal
          extraWide
          title={viewBill.billNo}
          subtitle="Read-only — process this bill in Accounts Payment"
          onClose={() => setViewBillId(null)}
          footer={
            <div className="flex justify-end gap-2">
              <NxBtn color="secondary" icon={Eye} label="View" loading={downloadingId === viewBill.id} onClick={() => handleDownload(viewBill)} />
              <NxBtn color="secondary" icon={Printer} label="Print" loading={downloadingId === viewBill.id} onClick={() => handleDownload(viewBill)} />
            </div>
          }
        >
          <Descriptions columns={2}>
            <DescItem label="Status"><NxBadge color={BILL_STATUS_BADGE_COLOR[viewBill.status] ?? "gray"}>{BILL_STATUS_LABEL[viewBill.status] || viewBill.status}</NxBadge></DescItem>
            <DescItem label="Bill Date">{viewBill.billDate ? dayjs(viewBill.billDate).format("DD MMM YYYY") : "—"}</DescItem>
            <DescItem label="Project">{viewBill.projectName || "—"}</DescItem>
            <DescItem label="Work Order">{viewBill.workOrderNo || "—"}</DescItem>
            <DescItem label="Vendor">{vendorPartyText(viewBill.vendorName, viewBill.vendorGroupName, viewBill.vendorName)}</DescItem>
            <DescItem label="Generated By">{viewBill.generatedBy || "—"}</DescItem>
          </Descriptions>

          <div className="border-t border-gray-200 dark:border-gray-700/40 my-4" />

          {/* Accounts Payment's own Verification → L1 AGM → L2 Director → TMS
              chain — same table the Work Order's own bill view shows. Only
              meaningful for a real RunningBill: a merged-in BillRequest row
              (billType === 'bill_request') never has these fields at all —
              it's still on its own separate AGM/GM approval chain, not yet
              a RunningBill — so it gets a plain status line instead of a
              table of all-blank stage cells. */}
          {viewBill.billType === "bill_request" ? (
            <div className="mb-4">
              <div className="font-bold text-xs text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                Bill Request Approvals
              </div>
              <Table>
                <Thead>
                  <Tr>
                    {(["L1", "L2", "L3", "L4"] as const).slice(0, viewBill.approvalLevels ?? 4).map((l) => <Th key={l}>{l}</Th>)}
                  </Tr>
                </Thead>
                <Tbody>
                  <Tr>
                    {(["agm", "gm", "l3", "l4"] as const).slice(0, viewBill.approvalLevels ?? 4).map((stage) => {
                      const entry = (viewBill.approvalHistory ?? []).find((h) => h.stage === stage && h.action === "approved");
                      return <Td key={stage} className="align-top"><BillStageCell by={entry?.byName} at={entry?.at} /></Td>;
                    })}
                  </Tr>
                </Tbody>
              </Table>
            </div>
          ) : (
            <div className="mb-4">
              <div className="font-bold text-xs text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                Bill Approvals
              </div>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Verification</Th>
                    <Th>L1</Th>
                    <Th>L2</Th>
                    <Th>Sent to TMS</Th>
                    <Th>Paid</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  <Tr>
                    <Td className="align-top"><BillStageCell by={viewBill.verificationBy?.name} at={viewBill.verificationAt} /></Td>
                    <Td className="align-top"><BillStageCell by={viewBill.l1ApprovedBy?.name} at={viewBill.l1ApprovedAt} /></Td>
                    <Td className="align-top"><BillStageCell by={viewBill.l2ApprovedBy?.name} at={viewBill.l2ApprovedAt} /></Td>
                    <Td className="align-top"><BillStageCell at={viewBill.tmsSentAt} /></Td>
                    <Td className="align-top"><BillStageCell at={viewBill.tmsCallbackReceivedAt} /></Td>
                  </Tr>
                </Tbody>
              </Table>
            </div>
          )}

          <div className="font-bold text-xs text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Scope Items</div>
          <div className="mb-4">
            <Table>
              <Thead>
                <Tr>
                  <Th>Description</Th>
                  <Th>Unit</Th>
                  <Th className="text-right">Qty Billed</Th>
                  <Th className="text-right">Rate</Th>
                  <Th className="text-right">Amount</Th>
                </Tr>
              </Thead>
              <Tbody>
                {(viewBill.lineItems || []).map((li, i) => (
                  <Tr key={i}>
                    <Td>{li.description}</Td>
                    <Td>{li.unit}</Td>
                    <Td className="text-right font-mono">{li.billedQty.toLocaleString("en-IN")}</Td>
                    <Td className="text-right">{fmtRate(li.rate)}</Td>
                    <Td className="text-right font-bold">{fmt(li.amount)}</Td>
                  </Tr>
                ))}
              </Tbody>
              <Tfoot>
                <Tr className="bg-primary/5">
                  <Td colSpan={4} className="font-bold text-right text-primary">Gross Total</Td>
                  <Td className="font-bold text-right text-[#1A1A2E] dark:text-[#F1F5F9]">{fmt(viewBill.amount)}</Td>
                </Tr>
              </Tfoot>
            </Table>
          </div>

          {(() => {
            const gross = viewBill.amount || 0;
            const retAmt = viewBill.retentionAmount ?? 0;
            const advRec = viewBill.advanceRecovery ?? 0;
            const { gstAmount: gstAmt, netAfterHold: netPay } = billFinancials({ gross, gstPercent: viewBill.gstPercent ?? 0, retentionAmount: retAmt, advanceRecovery: advRec, supersedeDeduction: viewBill.supersedeDeduction ?? 0, retentionReleased: viewBill.retentionReleased ?? 0 });
            const paid = viewBill.paidAmount;
            return (
              <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 rounded-lg p-3 text-sm mb-4">
                <div className="font-bold mb-2 text-emerald-800 dark:text-emerald-300">
                  {viewBill.billType === "bill_request" ? "Bill Request" : "Running Bill"}: {viewBill.billNo}
                  {supersededByMap[viewBill.billNo]?.length ? (
                    <span
                      className="ml-2 align-middle inline-block text-[10px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-500/20 px-1.5 py-0.5 rounded-full whitespace-nowrap"
                      title={`Superseded by ${supersededByMap[viewBill.billNo].join(", ")}`}
                    >
                      Superseded by {supersededByMap[viewBill.billNo].join(", ")}
                    </span>
                  ) : null}
                </div>
                <div className="font-mono text-xs flex flex-col gap-0.5">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Gross Billed</span>
                    <span className="font-semibold">{fmt(gross)}</span>
                  </div>
                  {retAmt > 0 && (
                    <div className="flex justify-between text-red-600 dark:text-red-400">
                      <span>Hold / Retention{(viewBill.retentionPercent ?? 0) > 0 ? ` @ ${viewBill.retentionPercent}%` : ""}</span>
                      <span>− {fmt(retAmt)}</span>
                    </div>
                  )}
                  {advRec > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>Less: Advance Recovery</span>
                      <span>− {fmt(advRec)}</span>
                    </div>
                  )}
                  {gstAmt > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>GST @ {viewBill.gstPercent}%</span>
                      <span>+ {fmt(gstAmt)}</span>
                    </div>
                  )}
                  {(viewBill.supersedeDeduction ?? 0) > 0 && (
                    <div className="text-red-600 dark:text-red-400">
                      <div className="font-semibold">Less: Superseded Bills</div>
                      {(viewBill.linkedBills ?? []).filter(l => l.relationshipType === "SUPERSEDES").map(l => (
                        <div key={l.billNo} className="flex justify-between pl-2">
                          <span>
                            {l.billNo}
                            {l.description ? <span className="block text-[10px] font-sans opacity-75">{l.description}</span> : null}
                          </span>
                          <span>− {fmt(l.amount ?? 0)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between border-t border-emerald-300 dark:border-emerald-500/30 pt-1 mt-0.5 font-bold">
                    <span>Net Payable</span>
                    <span>{fmt(netPay)}</span>
                  </div>
                  {(viewBill.adjustmentAmount ?? 0) !== 0 && (
                    <div className={`flex justify-between ${(viewBill.adjustmentAmount ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      <span>Adjustment{viewBill.adjustmentRemark ? ` (${viewBill.adjustmentRemark})` : ""}</span>
                      <span>{(viewBill.adjustmentAmount ?? 0) > 0 ? "+" : "−"} {fmt(Math.abs(viewBill.adjustmentAmount ?? 0))}</span>
                    </div>
                  )}
                  {paid != null && (
                    <div className="flex justify-between font-bold text-emerald-600 dark:text-emerald-400 text-[13px] mt-1 border-t border-emerald-300 dark:border-emerald-500/30 pt-1">
                      <span>Actually Paid</span>
                      <span>{fmt(paid)}</span>
                    </div>
                  )}
                </div>
                {viewBill.paymentUTR && (
                  <div className="mt-2 font-mono text-xs text-purple-600 dark:text-purple-400">UTR: {viewBill.paymentUTR}</div>
                )}
              </div>
            );
          })()}

          {viewBill.remarks && (
            <div className="mb-4 text-gray-500 dark:text-gray-400 text-[13px]"><strong>Remarks:</strong> {viewBill.remarks}</div>
          )}

          {viewBill.documents && viewBill.documents.length > 0 && (
            <div className="mb-4 text-[13px]">
              <strong className="text-gray-500 dark:text-gray-400">Documents:</strong>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {viewBill.documents.map((d, i) => (
                  <a key={i} href={d.url} target="_blank" rel="noreferrer" download={d.name}
                    className="inline-flex items-center gap-2 text-primary hover:underline">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{d.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {viewApprovalBillRequestId && <SlaTimeline entityType="BillRequest" entityId={viewApprovalBillRequestId} />}
        </Modal>
      )}

      <NewBillDrawer
        open={newOpen || !!editBill}
        editBill={editBill as Record<string, any> | null}
        onClose={() => { setNewOpen(false); setEditBill(null); }}
        onCreated={(bill) => {
          const saved = normalizeId(bill) as unknown as Bill;
          setBills((prev) => prev.some((b) => b.id === saved.id)
            ? prev.map((b) => (b.id === saved.id ? { ...b, ...saved } : b))
            : [saved, ...prev]);
        }}
      />

      {editBRId && (
        <SiteProgress
          embeddedEditBRId={editBRId}
          onEmbeddedClose={(saved) => { setEditBRId(null); if (saved) loadBills(); }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete ${deleteTarget.billNo}?`}
          message={deleteTarget.billType === "bill_request"
            ? "This removes the bill request and gives its billed quantity and progress back to the work order. It cannot be undone."
            : "This removes the bill and gives its billed quantity back to the work order. It cannot be undone."}
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}