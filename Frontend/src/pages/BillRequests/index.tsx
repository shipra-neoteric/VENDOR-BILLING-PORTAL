import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FileText, Eye, Printer, CheckCircle2, XCircle, Check, X, Clock,
  Archive as ArchiveIcon, Trophy,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import { SearchFilter, DropdownSelectFilter } from "../../ui/Filters";
import { useAuth } from "../../context/AuthContext";
import type { AuthUser } from "../../context/AuthContext";
import { selectableProjects } from "../../utils/projectOptions";
import { printBill, resolvePrintParty } from "../../shared/utils/printBill";
import type { PrintableBill } from "../../shared/utils/printBill";
import type { Contractor } from "../../types/VendorBilling";
import { billFinancials } from "../../shared/utils/billMath";
import SField from "../../ui/SField";
import UISwitch from "../../ui/Switch";
import UIBadge from "../../ui/Badge";
import Btn from "../../ui/Btn";
import Segmented from "../../ui/Segmented";
import EmptyState from "../../ui/EmptyState";
import ConfirmModal from "../../ui/ConfirmModal";
import Spinner from "../../ui/Spinner";
import PageHeader from "../../ui/PageHeader";
import Modal from "../../ui/Modal";
import Field from "../../ui/Field";
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import NxBadge from "../../ui/nexora/Badge";
import NxBtn from "../../ui/nexora/Btn";
import NxStatCard from "../../ui/nexora/StatCard";
import DropdownMenu from "../../ui/DropdownMenu";
import type { DropdownMenuItem } from "../../ui/DropdownMenu";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BillItem {
  scopeItemId?: string; description: string; unit: string; billedQty: number;
  rate?: number; amount?: number; progressRemarks?: string;
}
interface ApprovalHistoryEntry {
  stage: "agm" | "gm"; action: "approved" | "rejected";
  by?: { _id: string; name: string } | string | null;
  at?: string; remarks?: string;
}
interface BillRequestRow {
  _id: string; reqNo: string; stageNo?: number;
  workOrderId?: string; workOrderNo: string;
  projectId?: string; projectName: string; projectLocation?: string;
  vendorCode?: string; vendorName: string; companyName?: string; category?: string; subCategory?: string;
  items: BillItem[]; remarks?: string;
  periodFrom?: string; periodTo?: string;
  status: "pending" | "pending-gm" | "approved" | "rejected";
  requestedBy?: { name: string; email: string };
  agmApprovedBy?: { name: string } | string | null;
  agmApprovedAt?: string;
  retentionAmount?: number;
  advanceRecovery?: number;
  gstPercentOverride?: number | null;
  payeeVendorCode?: string;
  payeeVendorName?: string;
  rejectReason?: string;
  approvalHistory?: ApprovalHistoryEntry[];
  billId?: { _id: string; billNo: string; status: string; amount: number; paidAmount?: number; retentionPercent?: number; retentionAmount?: number; advanceRecovery?: number; gstPercent?: number; tdsAmount?: number; paymentDate?: string; paymentMode?: string; paymentUTR?: string; paymentBank?: string; paymentReleasedBy?: string };
  milestoneAchieved?: boolean;
  milestoneDate?: string;
  createdAt: string;
  isArchived?: boolean;
}

// A bill created directly via Billing -> New Bill, not from DRI progress —
// carries no BillRequest of its own, so it needs this separate pre-Accounts
// AGM/GM sign-off tracked right on the bill itself (see billController's
// manualAgmApprove/manualGmApprove/manualReject).
interface ManualBillRow {
  _id: string; billNo: string; amount: number; workOrderId?: string;
  projectName?: string; vendorName?: string; billDate: string; createdAt: string;
  manualApprovalStatus: "pending" | "pending-gm" | "approved" | "rejected";
}

interface ProjectOption { _id: string; name: string; code?: string; parentId?: string | null; }
// Just enough of a Work Order to resolve which department a bill request/
// manual bill belongs to (via its workOrderId) — not the full WO shape used
// elsewhere in the app.
interface WorkOrderDeptRow { _id: string; department?: string; customDepartment?: string; }

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Per-unit rates are fractional far more often than totals are — rounding
// them for display (as fmt() does) silently turns 130.5 into 131.
const fmtRate = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DEPARTMENT_LABEL: Record<string, string> = {
  civil: "Civil Team", marketing: "Marketing Team", planning: "Planning Team",
  maintenance: "Maintenance Team",
};
function departmentLabel(wo?: WorkOrderDeptRow): string {
  if (!wo || !wo.department) return "—";
  if (wo.department === "custom") return wo.customDepartment || "Custom Team";
  return DEPARTMENT_LABEL[wo.department] || "—";
}

const STATUS_CFG: Record<string, { color: string; label: string }> = {
  pending: { color: "orange", label: "Pending L1 (AGM)" },
  "pending-gm": { color: "blue", label: "Pending L2 (GM)" },
  approved: { color: "green", label: "Approved" },
  rejected: { color: "red", label: "Rejected" },
};

function actorName(by?: { name: string } | string | null): string | undefined {
  if (!by || typeof by === "string") return undefined;
  return by.name;
}

// A grant for module 'bill-requests' with the given action — Owner always
// bypasses; agm/gm roles get their own stage's action even without an
// explicit checklist grant, matching the backend route's hardcoded fallback.
function hasPerm(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return !!user.permissions?.find(p => p.module === "bill-requests")?.actions.includes(action);
}

// Append-only approvalHistory timeline — mirrors the pattern already used for
// WorkOrder/RunningBill approval chains elsewhere in this app.
function ApprovalHistoryTimeline({ history }: { history?: ApprovalHistoryEntry[] }) {
  if (!history || history.length === 0) return null;
  const stageLabel = (s: string) => (s === "agm" ? "AGM" : "GM");
  return (
    <div className="mt-1">
      {history.map((h, i) => {
        const isReject = h.action === "rejected";
        return (
          <div key={i} className="flex gap-2 items-start py-1">
            <span className={`w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center text-[10px] font-bold shrink-0 ${isReject ? "bg-red-50 dark:bg-red-500/10 border-red-600 text-red-600" : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-600 text-emerald-600"}`}>
              {isReject ? "✕" : "✓"}
            </span>
            <div className="text-[12.5px]">
              <strong>{stageLabel(h.stage)} {isReject ? "rejected" : "approved"}</strong>
              <span className="text-gray-400 ml-1.5">
                {actorName(h.by) || ""}{h.at ? ` · ${dayjs(h.at).format("DD MMM YYYY, hh:mm a")}` : ""}
              </span>
              {h.remarks && <div className="text-gray-500 dark:text-gray-400 mt-0.5">{h.remarks}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Prints a bill request through the exact same template Accounts Payment uses
// for a real RunningBill (printBill), so the two look identical. Once a
// RunningBill exists (br.billId) we fetch and print that directly — its own
// AGM/GM/Accounts/Initiated/Paid ticks are already point-in-time accurate.
// Before that (still pending/pending-gm/rejected pre-GM), there's no
// RunningBill yet, so we build an equivalent pseudo-bill from the request
// itself — only the AGM tick can ever be true at that point, which is what
// br.agmApprovedBy already, correctly, reflects.
async function printBillRequest(br: BillRequestRow) {
  try {
    const contractor = await resolvePrintParty(br.vendorCode);

    if (br.billId?._id) {
      const bRes = await apiClient.get<{ bill: PrintableBill }>(`/bills/${br.billId._id}`);
      const bill = bRes.data.bill;
      printBill(bill, contractor, bill.status === "paid" ? "post" : "pre");
      return;
    }

    const agmDone = !!br.agmApprovedBy;
    const pseudoBill: PrintableBill = {
      billNo: br.reqNo,
      workOrderNo: br.workOrderNo,
      projectName: br.projectName,
      projectLocation: br.projectLocation,
      vendorCode: br.vendorCode,
      vendorName: br.vendorName,
      companyName: br.companyName,
      generatedBy: br.requestedBy?.name,
      billDate: br.createdAt,
      lineItems: br.items.map(it => ({ description: it.description, progressRemarks: it.progressRemarks, unit: it.unit, billedQty: it.billedQty, rate: it.rate ?? 0, amount: (it.rate ?? 0) * it.billedQty })),
      amount: br.items.reduce((s, it) => s + (it.rate ?? 0) * it.billedQty, 0),
      retentionAmount: br.retentionAmount ?? 0,
      advanceRecovery: br.advanceRecovery ?? 0,
      gstPercent: br.gstPercentOverride ?? undefined,
      remarks: br.rejectReason ? `${br.remarks ? br.remarks + " — " : ""}Rejected: ${br.rejectReason}` : br.remarks,
      status: br.status,
      agmApprovedBy: agmDone ? { name: actorName(br.agmApprovedBy) || "AGM" } : null,
      agmApprovedAt: br.agmApprovedAt,
      verifiedBy: null,
      approvedBy: null,
      paymentInitiatedBy: null,
    };
    const statusLabel = br.status === "rejected" ? "Rejected" : br.status === "pending-gm" ? "Awaiting GM Approval" : "Awaiting AGM Approval";
    printBill(pseudoBill, contractor, "pre", statusLabel);
  } catch {
    toast.error("Failed to prepare print view");
  }
}

// A "Manual Bill" row is already a real RunningBill (created via Billing →
// New Bill, just still pending its own AGM/GM sign-off) — no pseudo-bill
// needed here, just fetch the full record (ManualBillRow is a summary row,
// missing lineItems/vendorCode/etc.) and print it through the same template.
async function printManualBill(b: ManualBillRow) {
  try {
    const bRes = await apiClient.get<{ bill: PrintableBill }>(`/bills/${b._id}`);
    const bill = bRes.data.bill;
    const contractor = await resolvePrintParty(bill.vendorCode);
    printBill(bill, contractor, bill.status === "paid" ? "post" : "pre");
  } catch {
    toast.error("Failed to prepare print view");
  }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function BillApproval() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const openReqId = searchParams.get("open");

  const canAgmApprove = user?.role === "agm" || hasPerm(user, "agm-approve");
  const canGmApprove = user?.role === "gm" || hasPerm(user, "gm-approve");
  const canRejectAny = canAgmApprove || canGmApprove || user?.role === "accounts" || hasPerm(user, "reject");

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [billReqs, setBillReqs] = useState<BillRequestRow[]>([]);
  const [manualBills, setManualBills] = useState<ManualBillRow[]>([]);
  const [woDeptMap, setWoDeptMap] = useState<Map<string, WorkOrderDeptRow>>(new Map());

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get("/projects"),
      apiClient.get("/bill-requests"),
      apiClient.get("/bills", { params: { manualApprovalStatus: "pending" } }),
      apiClient.get("/bills", { params: { manualApprovalStatus: "pending-gm" } }),
      apiClient.get("/work-orders"),
    ])
      .then(([projR, brR, manualPendingR, manualGmR, woR]) => {
        setProjects(projR.data.projects ?? []);
        setBillReqs(brR.data.billRequests ?? []);
        setManualBills([...(manualPendingR.data.bills ?? []), ...(manualGmR.data.bills ?? [])]);
        const wos = (woR.data.workOrders ?? []) as WorkOrderDeptRow[];
        setWoDeptMap(new Map(wos.map(wo => [wo._id, wo])));
      })
      .catch(() => toast.error("Failed to load bill approvals"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const pendingAgmReqs = useMemo(() => billReqs.filter(r => r.status === "pending" && !r.isArchived), [billReqs]);
  const pendingGmReqs = useMemo(() => billReqs.filter(r => r.status === "pending-gm" && !r.isArchived), [billReqs]);
  const pendingManualAgm = useMemo(() => manualBills.filter(b => b.manualApprovalStatus === "pending"), [manualBills]);
  const pendingManualGm = useMemo(() => manualBills.filter(b => b.manualApprovalStatus === "pending-gm"), [manualBills]);

  // ── Dashboard flashcards (Pending / Approved / Rejected) — counts across
  // both bill requests and manual bills, both approval stages combined for
  // Pending. Archived requests are excluded, matching the default list view.
  const totalPendingCount = pendingAgmReqs.length + pendingGmReqs.length + pendingManualAgm.length + pendingManualGm.length;
  const totalApprovedCount = useMemo(
    () => billReqs.filter(r => r.status === "approved" && !r.isArchived).length + manualBills.filter(b => b.manualApprovalStatus === "approved").length,
    [billReqs, manualBills]
  );
  const totalRejectedCount = useMemo(
    () => billReqs.filter(r => r.status === "rejected" && !r.isArchived).length + manualBills.filter(b => b.manualApprovalStatus === "rejected").length,
    [billReqs, manualBills]
  );
  const totalCount = useMemo(
    () => billReqs.filter(r => !r.isArchived).length + manualBills.length,
    [billReqs, manualBills]
  );

  // ── Bill request view / approve / reject ────────────────────────────────────
  const [viewReq, setViewReq] = useState<BillRequestRow | null>(null);
  const [printingReqId, setPrintingReqId] = useState<string | null>(null);

  // Deep link from other pages (e.g. the SLA Report's Ongoing Workflows
  // table) — ?open=<billRequestId> opens that request's view modal once the
  // list has loaded.
  useEffect(() => {
    if (!openReqId || billReqs.length === 0) return;
    const match = billReqs.find(r => r._id === openReqId);
    if (match) setViewReq(match);
  }, [openReqId, billReqs]);

  async function handlePrintReq(r: BillRequestRow) {
    setPrintingReqId(r._id);
    try { await printBillRequest(r); } finally { setPrintingReqId(null); }
  }
  // Manual Bills' Print — reuses printingReqId for the loading spinner since
  // a Manual Bill's _id is a different collection's id and never collides
  // with a BillRequestRow's.
  async function handlePrintManualBill(b: ManualBillRow) {
    setPrintingReqId(b._id);
    try { await printManualBill(b); } finally { setPrintingReqId(null); }
  }
  // View — same fix as printBillRequest already applies to Print: once a
  // RunningBill exists (r.billId), its own lineItems/retention/advance/GST
  // are the authoritative "as billed" record, not the request's own items
  // snapshot. Fetches it and merges those fields onto the row before opening
  // the existing, unchanged viewReq Modal — no new modal, same JSX.
  async function openViewReq(r: BillRequestRow) {
    if (!r.billId?._id) return setViewReq(r);
    try {
      const bRes = await apiClient.get<{ bill: PrintableBill }>(`/bills/${r.billId._id}`);
      const bill = bRes.data.bill;
      setViewReq({
        ...r,
        items: bill.lineItems.map(li => ({
          description: li.description, unit: li.unit || "", billedQty: li.billedQty,
          rate: li.rate, amount: li.amount, progressRemarks: li.progressRemarks,
        })),
        retentionAmount: bill.retentionAmount ?? r.retentionAmount,
        advanceRecovery: bill.advanceRecovery ?? r.advanceRecovery,
        gstPercentOverride: bill.gstPercent ?? r.gstPercentOverride,
      });
    } catch {
      setViewReq(r);
    }
  }
  const [approveModal, setApproveModal] = useState(false); // AGM (L1)
  const [approveTarget, setApproveTarget] = useState<string | null>(null);
  const [approveRetention, setApproveRetention] = useState<number | null>(null);
  const [approveAdvance, setApproveAdvance] = useState<number | null>(null);
  // Lets AGM set/override GST% on this bill — mainly for a work order that
  // has no GST% configured at all. Blank means "use the work order's own".
  const [approveGst, setApproveGst] = useState<number | null>(null);
  // Who this bill's payment actually goes to — normally the work order's own
  // vendor, but a fellow Vendor Group member can be picked instead.
  const [approvePayeeCode, setApprovePayeeCode] = useState<string>("");
  const [approveGroupSiblings, setApproveGroupSiblings] = useState<{ vendorCode: string; companyName: string }[]>([]);
  // Outstanding advance slips for whoever is CURRENTLY selected as payee — so
  // AGM's "Advance Recovery Amount" actually links back to a real slip
  // instead of being a bare number no AdvanceSlip ever finds out about.
  const [approvePendingAdvances, setApprovePendingAdvances] = useState<{ _id: string; slipNo: string; balance: number }[]>([]);
  const [approveProjectId, setApproveProjectId] = useState<string>("");
  const [gmModal, setGmModal] = useState(false); // GM (L2)
  const [gmTarget, setGmTarget] = useState<string | null>(null);
  const [gmRemarks, setGmRemarks] = useState("");
  // GM has final say on who gets paid — can confirm AGM's Stage 1 choice (or
  // the work order's own vendor, if neither ever set one) or override it.
  const [gmPayeeCode, setGmPayeeCode] = useState<string>("");
  const [gmGroupSiblings, setGmGroupSiblings] = useState<{ vendorCode: string; companyName: string }[]>([]);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchPendingAdvances = async (projectId: string, vendorCode: string) => {
    if (!projectId || !vendorCode) { setApprovePendingAdvances([]); return; }
    try {
      const res = await apiClient.get<{ advanceSlips: { _id: string; slipNo: string; balance: number }[] }>(
        "/advance-slips/pending", { params: { projectId, vendorCode } }
      );
      setApprovePendingAdvances(res.data.advanceSlips || []);
    } catch { setApprovePendingAdvances([]); }
  };

  const selectApprovePayee = (vendorCode: string) => {
    setApprovePayeeCode(vendorCode);
    fetchPendingAdvances(approveProjectId, vendorCode);
  };

  const openApprove = async (id: string) => {
    setApproveTarget(id); setApproveRetention(null); setApproveAdvance(null); setApproveGst(null); setApproveModal(true);
    setApprovePayeeCode(""); setApproveGroupSiblings([]); setApprovePendingAdvances([]);
    const br = billReqs.find(r => r._id === id);
    if (!br?.vendorCode) return;
    setApprovePayeeCode(br.vendorCode);
    const projectId = br.projectId ?? "";
    setApproveProjectId(projectId);
    fetchPendingAdvances(projectId, br.vendorCode);
    try {
      const cRes = await apiClient.get<{ contractors: Contractor[] }>("/contractors", { params: { search: br.vendorCode } });
      const contractor = cRes.data.contractors.find(c => c.vendorCode === br.vendorCode);
      if (!contractor?.groupId) return;
      const gRes = await apiClient.get<{ members: { vendorCode: string; companyName: string }[] }>(`/vendor-groups/${contractor.groupId}`);
      setApproveGroupSiblings(gRes.data.members || []);
    } catch { /* group lookup is best-effort — approval still works without it */ }
  };
  const handleAgmApprove = async () => {
    if (!approveTarget) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (approveRetention != null) body.retentionAmount = approveRetention;
      if (approveGst != null) body.gstPercent = approveGst;
      if (approvePayeeCode) body.payeeVendorCode = approvePayeeCode;
      if (approveAdvance != null) {
        body.advanceRecovery = approveAdvance;
        // Distribute the entered recovery across outstanding slips
        // oldest-first, capped at each slip's own balance — same allocation
        // the manual New Bill drawer already uses.
        const recoveries: { slipId: string; amount: number }[] = [];
        let remaining = approveAdvance;
        for (const slip of approvePendingAdvances) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, slip.balance);
          if (take > 0) recoveries.push({ slipId: slip._id, amount: take });
          remaining -= take;
        }
        if (recoveries.length) body.advanceRecoveries = recoveries;
      }
      const res = await apiClient.put(`/bill-requests/${approveTarget}/agm-approve`, body);
      toast.success(res.data.message || "AGM approved — forwarded to GM");
      setApproveModal(false); setApproveTarget(null); setViewReq(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to approve");
    } finally { setSaving(false); }
  };
  const openGmApprove = async (id: string) => {
    setGmTarget(id); setGmRemarks(""); setGmModal(true);
    setGmPayeeCode(""); setGmGroupSiblings([]);
    const br = billReqs.find(r => r._id === id);
    if (!br?.vendorCode) return;
    setGmPayeeCode(br.payeeVendorCode || br.vendorCode);
    try {
      const cRes = await apiClient.get<{ contractors: Contractor[] }>("/contractors", { params: { search: br.vendorCode } });
      const contractor = cRes.data.contractors.find(c => c.vendorCode === br.vendorCode);
      if (!contractor?.groupId) return;
      const gRes = await apiClient.get<{ members: { vendorCode: string; companyName: string }[] }>(`/vendor-groups/${contractor.groupId}`);
      setGmGroupSiblings(gRes.data.members || []);
    } catch { /* group lookup is best-effort — approval still works without it */ }
  };
  const handleGmApprove = async () => {
    if (!gmTarget) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { remarks: gmRemarks };
      if (gmPayeeCode) body.payeeVendorCode = gmPayeeCode;
      const res = await apiClient.put(`/bill-requests/${gmTarget}/gm-approve`, body);
      toast.success(res.data.message || "Approved & bill generated");
      setGmModal(false); setGmTarget(null); setViewReq(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to approve");
    } finally { setSaving(false); }
  };
  const handleReject = async () => {
    if (!rejectTarget) return;
    setSaving(true);
    try {
      await apiClient.put(`/bill-requests/${rejectTarget}/reject`, { rejectReason });
      toast.success("Request rejected");
      setRejectModal(false); setRejectReason(""); setRejectTarget(null); setViewReq(null);
      load();
    } catch { toast.error("Failed to reject"); }
    finally { setSaving(false); }
  };

  // ── Manual bills (Billing -> New Bill) awaiting their own AGM/GM sign-off —
  // same reviewers, same permissions, just a plain approve (no retention/GST/
  // advance to decide — those were already set when the bill was created).
  const [manualApproveTarget, setManualApproveTarget] = useState<ManualBillRow | null>(null);
  const [manualRejectTarget, setManualRejectTarget] = useState<ManualBillRow | null>(null);
  const [manualRejectReason, setManualRejectReason] = useState("");

  const handleManualApprove = async (bill: ManualBillRow) => {
    setSaving(true);
    try {
      const endpoint = bill.manualApprovalStatus === "pending" ? "manual-agm-approve" : "manual-gm-approve";
      const res = await apiClient.patch(`/bills/${bill._id}/${endpoint}`);
      toast.success(res.data.message || "Approved");
      setManualApproveTarget(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to approve");
    } finally { setSaving(false); }
  };
  const handleManualReject = async () => {
    if (!manualRejectTarget) return;
    setSaving(true);
    try {
      await apiClient.patch(`/bills/${manualRejectTarget._id}/manual-reject`, { reason: manualRejectReason });
      toast.success("Bill rejected");
      setManualRejectTarget(null); setManualRejectReason("");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to reject");
    } finally { setSaving(false); }
  };

  const [archiveTarget, setArchiveTarget] = useState<BillRequestRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  async function archiveOne(r: BillRequestRow) {
    setArchiving(true);
    try {
      await apiClient.patch(`/bill-requests/${r._id}/${r.isArchived ? "unarchive" : "archive"}`);
      toast.success(r.isArchived ? `${r.reqNo} unarchived` : `${r.reqNo} archived`);
      setArchiveTarget(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Action failed");
    } finally {
      setArchiving(false);
    }
  }

  const viewTotal = viewReq ? viewReq.items.reduce((s, it) => s + (it.rate ?? 0) * it.billedQty, 0) : 0;

  // ── Requests list (filters + pagination) ────────────────────────────────────
  const [reqTab, setReqTab] = useState("pending");
  const [reqSearch, setReqSearch] = useState("");
  const [reqProjectFilter, setReqProjectFilter] = useState<string | undefined>(undefined);
  const [reqDeptFilter, setReqDeptFilter] = useState<string | undefined>(undefined);
  const [showArchived, setShowArchived] = useState(false);
  const projectOptions = useMemo(
    () => selectableProjects(projects).map(p => ({ label: `${p.name} (${p.code ?? ""})`, value: p._id })),
    [projects]
  );
  const departmentOptions = [
    { value: "civil", label: "Civil Team" },
    { value: "marketing", label: "Marketing Team" },
    { value: "planning", label: "Planning Team" },
    { value: "maintenance", label: "Maintenance Team" },
    { value: "custom", label: "Custom Team" },
  ];
  const matchesDept = (workOrderId?: string) => {
    if (!reqDeptFilter) return true;
    if (!workOrderId) return false;
    return woDeptMap.get(workOrderId)?.department === reqDeptFilter;
  };

  const filteredReqs = useMemo(() => {
    let list = billReqs.filter(r => showArchived ? r.isArchived : !r.isArchived);
    list = reqTab === "all" ? list : list.filter(r => r.status === reqTab);
    if (reqProjectFilter) list = list.filter(r => r.projectId === reqProjectFilter);
    if (reqDeptFilter) list = list.filter(r => matchesDept(r.workOrderId));
    const q = reqSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        r.reqNo.toLowerCase().includes(q) ||
        r.workOrderNo.toLowerCase().includes(q) ||
        r.vendorName.toLowerCase().includes(q) ||
        (r.vendorCode || "").toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => parseInt(b.reqNo.replace(/\D/g, ""), 10) - parseInt(a.reqNo.replace(/\D/g, ""), 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billReqs, reqTab, reqProjectFilter, reqDeptFilter, reqSearch, showArchived, woDeptMap]);

  const reqPager = usePagination(filteredReqs, 20);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="large" /></div>;
  }

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Bill Approval"
        subtitle="Review bill requests raised from DRI progress and manual bills, and carry them through AGM (L1) and GM (L2) approval."
      />

      {/* ── KPI flashcards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <NxStatCard
          label="Total" value={totalCount} icon={FileText}
          active={reqTab === "all"}
          onClick={() => setReqTab("all")}
        />
        <NxStatCard
          label="Pending" value={totalPendingCount} icon={Clock}
          active={reqTab === "pending" || reqTab === "pending-gm"}
          onClick={() => setReqTab("pending")}
        />
        <NxStatCard
          label="Approved" value={totalApprovedCount} icon={CheckCircle2}
          active={reqTab === "approved"}
          onClick={() => setReqTab("approved")}
        />
        <NxStatCard
          label="Rejected" value={totalRejectedCount} icon={XCircle}
          active={reqTab === "rejected"}
          onClick={() => setReqTab("rejected")}
        />
      </div>

      <div className="mb-4">
        <Segmented
          value={reqTab}
          onChange={setReqTab}
          options={[
            { value: "pending", label: <span className="inline-flex items-center gap-1.5">Pending L1 {pendingAgmReqs.length + pendingManualAgm.length > 0 && <NxBadge color="amber">{pendingAgmReqs.length + pendingManualAgm.length}</NxBadge>}</span> },
            { value: "pending-gm", label: <span className="inline-flex items-center gap-1.5">Pending L2 {pendingGmReqs.length + pendingManualGm.length > 0 && <NxBadge color="blue">{pendingGmReqs.length + pendingManualGm.length}</NxBadge>}</span> },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
        <div className="flex gap-2.5 flex-wrap items-center">
          <SearchFilter
            placeholder="Search by request no, work order, contractor, or project…"
            value={reqSearch} onChange={setReqSearch}
          />
          <DropdownSelectFilter
            value={reqProjectFilter ?? ""} onChange={v => setReqProjectFilter(v || undefined)}
            placeholder="All projects" resetValue=""
            options={projectOptions}
          />
          <DropdownSelectFilter
            value={reqDeptFilter ?? ""} onChange={v => setReqDeptFilter(v || undefined)}
            placeholder="All departments" resetValue=""
            options={departmentOptions}
          />
          <UISwitch checked={showArchived} onChange={setShowArchived} onLabel="Archived" offLabel="Show Archived" />
        </div>
      </div>

      {/* Manual bills (Billing -> New Bill) — no BillRequest of their own, so
          they're never in billReqs above; this is their own AGM/GM sign-off,
          tracked directly on the bill. */}
      {(reqTab === "pending" ? pendingManualAgm : reqTab === "pending-gm" ? pendingManualGm : reqTab === "all" ? manualBills : []).filter(b => matchesDept(b.workOrderId)).length > 0 && (
        <div className="mb-5">
          <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Manual Bills — Billing → New Bill
          </div>
          <Table>
            <Thead>
              <Tr>
                <Th>Bill No</Th>
                <Th>Project</Th>
                <Th>Department</Th>
                <Th>Vendor</Th>
                <Th>Amount</Th>
                <Th>Date</Th>
                <Th>Stage</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {(reqTab === "pending" ? pendingManualAgm : reqTab === "pending-gm" ? pendingManualGm : manualBills).filter(b => matchesDept(b.workOrderId)).map(b => (
                <Tr key={b._id}>
                  <Td><span className="text-primary font-bold text-[13px]">{b.billNo}</span></Td>
                  <Td>{b.projectName || "—"}</Td>
                  <Td>{departmentLabel(b.workOrderId ? woDeptMap.get(b.workOrderId) : undefined)}</Td>
                  <Td>{b.vendorName || "—"}</Td>
                  <Td className="font-mono">{fmt(b.amount)}</Td>
                  <Td>{dayjs(b.billDate || b.createdAt).format("DD MMM YYYY")}</Td>
                  <Td><NxBadge color={b.manualApprovalStatus === "pending-gm" ? "blue" : "orange"}>{b.manualApprovalStatus === "pending-gm" ? "Pending L2" : "Pending L1"}</NxBadge></Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <NxBtn color="icon-blue" title="View" icon={Eye} loading={printingReqId === b._id} onClick={() => handlePrintManualBill(b)} />
                      <NxBtn color="icon" title="Print" icon={Printer} loading={printingReqId === b._id} onClick={() => handlePrintManualBill(b)} />
                      {b.manualApprovalStatus === "pending" && canAgmApprove && (
                        <NxBtn color="icon-green" title="AGM Approve" icon={Check} onClick={() => setManualApproveTarget(b)} />
                      )}
                      {b.manualApprovalStatus === "pending-gm" && canGmApprove && (
                        <NxBtn color="icon-green" title="GM Approve" icon={Check} onClick={() => setManualApproveTarget(b)} />
                      )}
                      {canRejectAny && (
                        <NxBtn color="icon-red" title="Reject" icon={X} onClick={() => setManualRejectTarget(b)} />
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {filteredReqs.length === 0 ? (
        <EmptyState title={`No ${reqTab === "all" ? "" : STATUS_CFG[reqTab]?.label.toLowerCase() || reqTab} bill requests`} />
      ) : (
        <>
          <Table>
            <Thead>
              <Tr>
                <Th>Stage / Request</Th>
                <Th>Work Order</Th>
                <Th>Project</Th>
                <Th>Department</Th>
                <Th>Contractor</Th>
                <Th>Items</Th>
                <Th>Date</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {reqPager.pageItems.map(r => {
                const cfg = STATUS_CFG[r.status] ?? { color: "gray", label: r.status };
                const menuItems: DropdownMenuItem[] = [
                  { key: "archive", label: r.isArchived ? "Unarchive" : "Archive", icon: ArchiveIcon, onClick: () => setArchiveTarget(r) },
                ];
                return (
                  <Tr key={r._id} className="cursor-pointer" onClick={() => openViewReq(r)}>
                    <Td>
                      <div className="flex gap-1.5 items-center">
                        {r.stageNo && <NxBadge color="orange">S{r.stageNo}</NxBadge>}
                        <span className="text-primary font-bold text-[13px]">{r.reqNo}</span>
                      </div>
                      {r.milestoneAchieved && (
                        <span className="text-[10px] text-primary inline-flex items-center gap-0.5"><Trophy className="w-2.5 h-2.5" /> Milestone</span>
                      )}
                    </Td>
                    <Td>
                      <code
                        className="cursor-pointer text-blue-600 dark:text-blue-400"
                        onClick={e => { e.stopPropagation(); if (r.workOrderId) navigate(`/work-items/${r.workOrderId}`); }}
                      >
                        {r.workOrderNo}
                      </code>
                    </Td>
                    <Td>{r.projectName}</Td>
                    <Td>{departmentLabel(r.workOrderId ? woDeptMap.get(r.workOrderId) : undefined)}</Td>
                    <Td>{r.vendorName}</Td>
                    <Td>{r.items.length} item{r.items.length !== 1 ? "s" : ""}</Td>
                    <Td>{dayjs(r.createdAt).format("DD MMM YYYY")}</Td>
                    <Td><UIBadge color={cfg.color as any}>{cfg.label}</UIBadge></Td>
                    <Td>
                      <div onClick={e => e.stopPropagation()} className="flex items-center gap-1">
                        <NxBtn color="icon-blue" title="View" icon={Eye} onClick={() => openViewReq(r)} />
                        <NxBtn color="icon" title="Print" icon={Printer} loading={printingReqId === r._id} onClick={() => handlePrintReq(r)} />
                        {r.status === "pending" && canAgmApprove && (
                          <NxBtn color="icon-green" title="AGM Approve" icon={Check} onClick={() => openApprove(r._id)} />
                        )}
                        {r.status === "pending-gm" && canGmApprove && (
                          <NxBtn color="icon-green" title="GM Approve" icon={Check} onClick={() => openGmApprove(r._id)} />
                        )}
                        {["pending", "pending-gm"].includes(r.status) && canRejectAny && (
                          <NxBtn color="icon-red" title="Reject" icon={X} onClick={() => { setRejectTarget(r._id); setRejectModal(true); }} />
                        )}
                        <DropdownMenu items={menuItems} />
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          {reqPager.totalPages > 1 && (
            <div className="mt-3"><Pagination page={reqPager.page} totalPages={reqPager.totalPages} onChange={reqPager.setPage} /></div>
          )}
        </>
      )}

      {archiveTarget && (
        <ConfirmModal
          title={archiveTarget.isArchived ? `Unarchive ${archiveTarget.reqNo}?` : `Archive ${archiveTarget.reqNo}?`}
          message={archiveTarget.isArchived ? "This will move it back into the active list." : "This will move it out of the active list — you can unarchive it later."}
          confirmLabel={archiveTarget.isArchived ? "Unarchive" : "Archive"}
          loading={archiving}
          onConfirm={() => archiveOne(archiveTarget)}
          onCancel={() => setArchiveTarget(null)}
        />
      )}

      {/* ── Bill request view modal ── */}
      {viewReq && (
        <Modal
          icon={FileText}
          title={
            <span className="inline-flex items-center gap-2">
              <span>Bill Request — {viewReq.reqNo}</span>
              <UIBadge color={STATUS_CFG[viewReq.status]?.color as any}>{STATUS_CFG[viewReq.status]?.label}</UIBadge>
              {viewReq.milestoneAchieved && <UIBadge color="orange" small>🏆 Milestone</UIBadge>}
            </span>
          }
          extraWide
          onClose={() => setViewReq(null)}
          footer={
            <div className="flex gap-2 justify-end flex-wrap">
              <Btn outline label="Close" onClick={() => setViewReq(null)} />
              <Btn outline icon={Printer} label="Print" loading={printingReqId === viewReq._id} onClick={() => handlePrintReq(viewReq)} />
              {viewReq.status === "pending" && (
                <>
                  {canRejectAny && <Btn color="red" label="Reject" onClick={() => { setRejectTarget(viewReq._id); setRejectModal(true); setViewReq(null); }} />}
                  {canAgmApprove && <Btn color="primary" label="AGM Approve →" onClick={() => { openApprove(viewReq._id); setViewReq(null); }} />}
                </>
              )}
              {viewReq.status === "pending-gm" && (
                <>
                  {canRejectAny && <Btn color="red" label="Reject" onClick={() => { setRejectTarget(viewReq._id); setRejectModal(true); setViewReq(null); }} />}
                  {canGmApprove && <Btn color="blue" label="GM Approve →" onClick={() => { openGmApprove(viewReq._id); setViewReq(null); }} />}
                </>
              )}
            </div>
          }
        >
          <div className="flex flex-col gap-3.5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              <div><span className="text-gray-500 dark:text-gray-400">Work Order: </span>{viewReq.workOrderNo}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Project: </span>{viewReq.projectLocation ? `${viewReq.projectName} — ${viewReq.projectLocation}` : viewReq.projectName}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Contractor: </span>{viewReq.vendorName}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Requested By: </span>{viewReq.requestedBy?.name || "—"}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Date: </span>{dayjs(viewReq.createdAt).format("DD MMM YYYY")}</div>
              {viewReq.periodFrom && (
                <div><span className="text-gray-500 dark:text-gray-400">Period: </span>{`${dayjs(viewReq.periodFrom).format("DD MMM YYYY")} → ${dayjs(viewReq.periodTo ?? viewReq.createdAt).format("DD MMM YYYY")}`}</div>
              )}
              {viewReq.billId && (
                <div><span className="text-gray-500 dark:text-gray-400">Bill No.: </span>{viewReq.billId.billNo + " — " + fmt(viewReq.billId.amount)}</div>
              )}
            </div>

            {viewReq.status === "pending-gm" && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-3">
                <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300 mb-2 uppercase">AGM already set (read-only)</div>
                <div className="grid grid-cols-3 gap-2 text-[13px]">
                  <div><span className="text-gray-500 dark:text-gray-400">Hold / Retention: </span><span className="font-bold">{fmt(viewReq.retentionAmount ?? 0)}</span></div>
                  <div><span className="text-gray-500 dark:text-gray-400">Advance Recovery: </span><span className="font-bold">{fmt(viewReq.advanceRecovery ?? 0)}</span></div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">GST %: </span>
                    {viewReq.gstPercentOverride != null ? <span className="font-bold">{viewReq.gstPercentOverride}%</span> : <span className="text-gray-400">Work order default</span>}
                  </div>
                </div>
                {viewReq.payeeVendorCode && (
                  <div className="mt-2 text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Pay To: </span>
                    <span className="font-bold">{viewReq.payeeVendorName} ({viewReq.payeeVendorCode})</span>
                  </div>
                )}
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
                  {actorName(viewReq.agmApprovedBy) || "AGM"}{viewReq.agmApprovedAt ? ` · ${dayjs(viewReq.agmApprovedAt).format("DD MMM YYYY")}` : ""}
                </div>
              </div>
            )}

            <Table>
              <Thead>
                <Tr>
                  <Th>Description</Th><Th>Unit</Th><Th className="text-right">Qty Billed</Th><Th className="text-right">Rate</Th><Th className="text-right">Amount</Th>
                </Tr>
              </Thead>
              <Tbody>
                {viewReq.items.map((it, i) => {
                  const amt = (it.rate ?? 0) * it.billedQty;
                  return (
                    <Tr key={i}>
                      <Td>
                        {it.description}
                        {it.progressRemarks && <div className="text-[11px] text-blue-600 mt-0.5">👷 {it.progressRemarks}</div>}
                      </Td>
                      <Td>{it.unit}</Td>
                      <Td className="text-right font-mono">{it.billedQty.toLocaleString("en-IN")}</Td>
                      <Td className="text-right">{it.rate ? fmtRate(it.rate) : <span className="text-gray-400">pending</span>}</Td>
                      <Td className="text-right font-semibold">{it.rate ? fmt(amt) : <span className="text-gray-400">—</span>}</Td>
                    </Tr>
                  );
                })}
              </Tbody>
              {viewTotal > 0 && (
                <Tfoot>
                  <Tr className="!bg-primary/5">
                    <Td colSpan={4} className="font-bold text-right text-primary">Gross Total</Td>
                    <Td className="font-bold text-right">{fmt(viewTotal)}</Td>
                  </Tr>
                </Tfoot>
              )}
            </Table>

            {viewTotal > 0 && (() => {
              const retAmt = viewReq.retentionAmount ?? 0;
              const advRec = viewReq.advanceRecovery ?? 0;
              const gstPct = viewReq.gstPercentOverride ?? 0;
              const { gstAmount, netAfterHold } = billFinancials({ gross: viewTotal, gstPercent: gstPct, retentionAmount: retAmt, advanceRecovery: advRec });
              return (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 font-mono text-[13px]">
                  <div className="flex justify-between text-gray-500 dark:text-gray-400">
                    <span>Gross Total</span><span>{fmt(viewTotal)}</span>
                  </div>
                  {retAmt > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Hold / Retention</span><span>− {fmt(retAmt)}</span>
                    </div>
                  )}
                  {advRec > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>Less: Advance Recovery</span><span>− {fmt(advRec)}</span>
                    </div>
                  )}
                  {gstAmount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>GST @ {gstPct}%</span><span>+ {fmt(gstAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-primary border-t border-primary/20 pt-1 mt-1">
                    <span>Final Amount</span><span>{fmt(netAfterHold)}</span>
                  </div>
                </div>
              );
            })()}

            {viewReq.remarks && (
              <div className="rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-2.5 text-[13px]">
                <strong>Remarks:</strong> {viewReq.remarks}
              </div>
            )}

            {viewReq.rejectReason && (
              <div className="rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-2.5 text-[13px]">
                <strong>Reject Reason:</strong> {viewReq.rejectReason}
              </div>
            )}

            {(viewReq.approvalHistory?.length ?? 0) > 0 && (
              <div>
                <div className="font-bold text-[11px] text-gray-500 dark:text-gray-400 uppercase mb-1.5">History</div>
                <ApprovalHistoryTimeline history={viewReq.approvalHistory} />
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── AGM approve modal (L1) — hold/retention + advance, both optional ── */}
      {approveModal && (
        <Modal
          icon={CheckCircle2}
          title="AGM Approve — Stage 1"
          onClose={() => { setApproveModal(false); setApproveTarget(null); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setApproveModal(false); setApproveTarget(null); }} />
              <Btn color="primary" label="Approve & Forward to GM" loading={saving} onClick={handleAgmApprove} />
            </div>
          }
        >
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3.5">
            Sets the hold/advance figures GM will see at Stage 2. Leave a field blank to use the work order's automatic retention calculation.
          </div>
          {approveGroupSiblings.length > 1 && (
            <div className="mb-3">
              <SField
                label="Pay To (Vendor Group)"
                value={approvePayeeCode}
                onChange={selectApprovePayee}
                options={approveGroupSiblings.map(c => ({ value: c.vendorCode, label: `${c.companyName} (${c.vendorCode})` }))}
              />
            </div>
          )}
          <div className="mb-3">
            <Field
              label="Hold / Retention Amount (₹, optional)"
              type="number" min="0"
              placeholder="Auto-calculated from work order retention %"
              value={approveRetention ?? ""}
              onChange={(e) => setApproveRetention(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="mb-3">
            <Field
              label="Advance Recovery Amount (₹, optional)"
              type="number" min="0"
              max={approvePendingAdvances.length ? approvePendingAdvances.reduce((s, sl) => s + sl.balance, 0) : undefined}
              placeholder="0"
              value={approveAdvance ?? ""}
              onChange={(e) => setApproveAdvance(e.target.value ? Number(e.target.value) : null)}
              hint={approvePendingAdvances.length > 0
                ? `Outstanding for this payee: ${approvePendingAdvances.map(sl => `${sl.slipNo} (${fmt(sl.balance)})`).join(", ")} — settled oldest-first.`
                : "No outstanding advance slips for this payee on this project."}
            />
          </div>
          <Field
            label="GST % (optional)"
            type="number" min="0" max="100"
            placeholder="Leave blank to use the work order's GST%"
            value={approveGst ?? ""}
            onChange={(e) => setApproveGst(e.target.value ? Number(e.target.value) : null)}
          />
        </Modal>
      )}

      {/* ── GM approve modal (L2) — final, creates the RunningBill ── */}
      {gmModal && (
        <Modal
          icon={CheckCircle2}
          title="GM Approve — Stage 2 (Final)"
          onClose={() => { setGmModal(false); setGmTarget(null); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setGmModal(false); setGmTarget(null); }} />
              <Btn color="blue" label="Approve & Generate Bill" loading={saving} onClick={handleGmApprove} />
            </div>
          }
        >
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3.5">
            This creates the running bill using the retention/advance/GST AGM already set. It then moves to Accounts Payment.
          </div>
          {gmGroupSiblings.length > 1 && (
            <div className="mb-3">
              <SField
                label="Pay To (Vendor Group) — final confirmation"
                value={gmPayeeCode}
                onChange={setGmPayeeCode}
                options={gmGroupSiblings.map(c => ({ value: c.vendorCode, label: `${c.companyName} (${c.vendorCode})` }))}
              />
            </div>
          )}
          <Field textarea label="Remarks (optional)" placeholder="Remarks (optional)" value={gmRemarks} onChange={(e) => setGmRemarks(e.target.value)} />
        </Modal>
      )}

      {rejectModal && (
        <Modal
          icon={XCircle}
          title="Reject Bill Request"
          onClose={() => { setRejectModal(false); setRejectReason(""); setRejectTarget(null); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setRejectModal(false); setRejectReason(""); setRejectTarget(null); }} />
              <Btn color="red" label="Confirm Rejection" loading={saving} onClick={handleReject} />
            </div>
          }
        >
          <Field textarea label="Reason for rejection (optional)" placeholder="Reason for rejection (optional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
        </Modal>
      )}

      {manualApproveTarget && (
        <ConfirmModal
          title={manualApproveTarget.manualApprovalStatus === "pending" ? "AGM Approve this bill?" : "GM Approve this bill?"}
          message={`${manualApproveTarget.billNo} (${fmt(manualApproveTarget.amount)}) will move ${manualApproveTarget.manualApprovalStatus === "pending" ? "to GM for final sign-off" : "to Accounts for verification"}.`}
          confirmLabel="Approve"
          loading={saving}
          onConfirm={() => handleManualApprove(manualApproveTarget)}
          onCancel={() => setManualApproveTarget(null)}
        />
      )}

      {manualRejectTarget && (
        <Modal
          icon={XCircle}
          title={`Reject ${manualRejectTarget.billNo}`}
          onClose={() => { setManualRejectTarget(null); setManualRejectReason(""); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setManualRejectTarget(null); setManualRejectReason(""); }} />
              <Btn color="red" label="Confirm Rejection" loading={saving} onClick={handleManualReject} />
            </div>
          }
        >
          <Field textarea label="Reason for rejection" placeholder="Why is this bill being rejected?" value={manualRejectReason} onChange={(e) => setManualRejectReason(e.target.value)} />
        </Modal>
      )}
    </div>
  );
}
