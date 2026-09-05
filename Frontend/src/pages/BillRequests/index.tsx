import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FileText, Eye, Printer, CheckCircle2, XCircle, Check, X, Clock,
  Trophy,
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
import { BillStageCell } from "../../components/BillDetailModal";
import { BILL_STATUS_LABEL } from "../../shared/constants/billStatus";
import { Descriptions, DescItem } from "../../ui/Descriptions";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
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

// ── Types ─────────────────────────────────────────────────────────────────────
interface BillItem {
  scopeItemId?: string; description: string; unit: string; billedQty: number;
  rate?: number; amount?: number; progressRemarks?: string; location?: string;
}
interface ApprovalHistoryEntry {
  stage: string; action: "approved" | "rejected";
  by?: { _id: string; name: string; role?: string } | string | null;
  at?: string; remarks?: string;
}
interface BillRequestRow {
  _id: string; reqNo: string; stageNo?: number;
  workOrderId?: string; workOrderNo: string;
  projectId?: string; projectName: string; projectLocation?: string;
  vendorCode?: string; vendorName: string; companyName?: string; category?: string; subCategory?: string;
  department?: string; customDepartment?: string;
  items: BillItem[]; remarks?: string;
  periodFrom?: string; periodTo?: string;
  status: "pending" | "pending-gm" | "pending-l3" | "pending-l4" | "approved" | "rejected";
  requestedBy?: { name: string; email: string };
  agmApprovedBy?: { name: string; role?: string } | string | null;
  agmApprovedAt?: string;
  gmApprovedAt?: string;
  l3ApprovedAt?: string;
  processedBy?: { name: string; role?: string } | string | null;
  processedAt?: string;
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
  updatedAt?: string;
  isArchived?: boolean;
}

// A bill created directly via Billing -> New Bill, not from DRI progress —
// carries no BillRequest of its own, so it needs this separate pre-Accounts
// AGM/GM sign-off tracked right on the bill itself (see billController's
// manualAgmApprove/manualGmApprove/manualReject).
interface ManualBillRow {
  _id: string; billNo: string; amount: number; workOrderId?: string; workOrderNo?: string;
  projectId?: string; projectName?: string; vendorCode?: string; vendorName?: string; billDate: string; createdAt: string;
  manualApprovalStatus: "pending" | "pending-gm" | "pending-l3" | "pending-l4" | "approved" | "rejected";
  department?: string; customDepartment?: string;
  retentionAmount?: number; advanceRecovery?: number; gstPercent?: number;
  updatedAt?: string;
  manualAgmApprovedAt?: string;
  manualGmApprovedAt?: string;
  manualL3ApprovedAt?: string;
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
  pending: { color: "orange", label: "Pending L1" },
  "pending-gm": { color: "blue", label: "Pending L2" },
  "pending-l3": { color: "amber", label: "Pending L3" },
  "pending-l4": { color: "teal", label: "Pending L4" },
  approved: { color: "green", label: "Approved" },
  rejected: { color: "red", label: "Rejected" },
};

const PENDING_STATUSES = ["pending", "pending-gm", "pending-l3", "pending-l4"];
const OVERDUE_MS = 24 * 60 * 60 * 1000;
// "Pending for >1 day" — deliberately NOT based on updatedAt: that field is
// bumped by any unrelated save on the document (editing a manual bill via
// updateBill while it's still pending, archiving it, etc.), which would
// silently reset this clock without the approval actually having moved.
// Each stage's own "entered this stage at" timestamp (already recorded by
// every approve handler) is stable under those unrelated edits — falls back
// to createdAt for the first stage, which is never touched post-creation.
function stageEnteredAt(row: {
  status?: string; manualApprovalStatus?: string; createdAt?: string;
  agmApprovedAt?: string; gmApprovedAt?: string; l3ApprovedAt?: string;
  manualAgmApprovedAt?: string; manualGmApprovedAt?: string; manualL3ApprovedAt?: string;
}): string | undefined {
  const status = row.status ?? row.manualApprovalStatus;
  if (status === "pending-gm") return row.agmApprovedAt ?? row.manualAgmApprovedAt ?? row.createdAt;
  if (status === "pending-l3") return row.gmApprovedAt ?? row.manualGmApprovedAt ?? row.createdAt;
  if (status === "pending-l4") return row.l3ApprovedAt ?? row.manualL3ApprovedAt ?? row.createdAt;
  return row.createdAt;
}
function isOverdue(status: string, since?: string): boolean {
  if (!PENDING_STATUSES.includes(status) || !since) return false;
  return Date.now() - new Date(since).getTime() > OVERDUE_MS;
}
function OverdueBadge({ status, since }: { status: string; since?: string }) {
  if (!isOverdue(status, since)) return null;
  return <NxBadge color="red">Overdue</NxBadge>;
}

// Same mapping Billing's own read-only bill view uses (RunningBill.status,
// not the AGM/GM BillRequest status above) — this is the Accounts Payment
// side pipeline (Verification -> L1 AGM -> L2 Director -> TMS -> Paid).
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

// The subset of RunningBill fields the read-only Manual Bill view needs —
// PrintableBill (used for the print template) is missing the Accounts
// Payment stage timestamps, so this extends it locally rather than widening
// that shared type for one screen.
interface ManualBillDetail extends PrintableBill {
  workOrderNo?: string;
  verificationBy?: { name?: string } | null;
  verificationAt?: string;
  l1ApprovedBy?: { name?: string } | null;
  l1ApprovedAt?: string;
  l2ApprovedBy?: { name?: string } | null;
  l2ApprovedAt?: string;
  tmsSentAt?: string;
  tmsCallbackReceivedAt?: string;
  _id: string;
  manualApprovalStatus: "pending" | "pending-gm" | "pending-l3" | "pending-l4" | "approved" | "rejected";
  // The pre-Accounts L1/L2 sign-off (this page's own AGM/GM-equivalent
  // chain) — role is whatever the approver's actual role/custom-role was at
  // the time, never a hardcoded "AGM"/"GM" label.
  manualAgmApprovedBy?: { name?: string; role?: string } | null;
  manualAgmApprovedAt?: string;
  manualGmApprovedBy?: { name?: string; role?: string } | null;
  manualGmApprovedAt?: string;
  department?: string;
  customDepartment?: string;
  approvalHistory?: ApprovalHistoryEntry[];
}

function actorName(by?: { name: string } | string | null): string | undefined {
  if (!by || typeof by === "string") return undefined;
  return by.name;
}
function actorRole(by?: { name: string; role?: string } | string | null): string | undefined {
  if (!by || typeof by === "string") return undefined;
  return by.role;
}

// A grant for module 'bill-requests' with the given action.
function hasPerm(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  return !!user.permissions?.find(p => p.module === "bill-requests")?.actions.includes(action);
}

// Append-only approvalHistory timeline — mirrors the pattern already used for
// WorkOrder/RunningBill approval chains elsewhere in this app.
function ApprovalHistoryTimeline({ history }: { history?: ApprovalHistoryEntry[] }) {
  if (!history || history.length === 0) return null;
  // Exact stage matches only (not endsWith) — 'l1-agm'/'l2-director' are the
  // separate Accounts Payment pipeline's own stages and must never be
  // mislabeled as this app's L1/L2 sign-off just because they share a suffix.
  const L1_STAGES = new Set(["agm", "manual-agm"]);
  const L2_STAGES = new Set(["gm", "manual-gm"]);
  const stageLabel = (s: string) => (L1_STAGES.has(s) ? "L1" : L2_STAGES.has(s) ? "L2" : s);
  return (
    <div className="mt-1">
      {history.map((h, i) => {
        const isReject = h.action === "rejected";
        const role = actorRole(h.by);
        return (
          <div key={i} className="flex gap-2 items-start py-1">
            <span className={`w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center text-[10px] font-bold shrink-0 ${isReject ? "bg-red-50 dark:bg-red-500/10 border-red-600 text-red-600" : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-600 text-emerald-600"}`}>
              {isReject ? "✕" : "✓"}
            </span>
            <div className="text-[12.5px]">
              <strong>{stageLabel(h.stage)} {isReject ? "rejected" : "approved"}</strong>
              <span className="text-gray-400 ml-1.5">
                {actorName(h.by) || ""}{role ? ` (${role})` : ""}{h.at ? ` · ${dayjs(h.at).format("DD MMM YYYY, hh:mm a")}` : ""}
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
      // The RunningBill's own verifiedBy/verifiedAt are legacy fields no
      // current action writes — a progress-driven bill's real L2 (GM)
      // sign-off lives on the BillRequest itself (processedBy/processedAt,
      // set by gmApprove), so that's what the signature block needs here.
      const printableBill: PrintableBill = {
        ...bill,
        verifiedBy: bill.verifiedBy ?? (actorName(br.processedBy) ? { name: actorName(br.processedBy), role: actorRole(br.processedBy) } : null),
        verifiedAt: bill.verifiedAt ?? br.processedAt,
      };
      printBill(printableBill, contractor, bill.status === "paid" ? "post" : "pre");
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
      lineItems: br.items.map(it => ({ description: it.description, progressRemarks: it.progressRemarks, location: it.location, unit: it.unit, billedQty: it.billedQty, rate: it.rate ?? 0, amount: (it.rate ?? 0) * it.billedQty })),
      amount: br.items.reduce((s, it) => s + (it.rate ?? 0) * it.billedQty, 0),
      retentionAmount: br.retentionAmount ?? 0,
      advanceRecovery: br.advanceRecovery ?? 0,
      gstPercent: br.gstPercentOverride ?? undefined,
      remarks: br.rejectReason ? `${br.remarks ? br.remarks + " — " : ""}Rejected: ${br.rejectReason}` : br.remarks,
      status: br.status,
      agmApprovedBy: agmDone ? { name: actorName(br.agmApprovedBy) || "—", role: actorRole(br.agmApprovedBy) } : null,
      agmApprovedAt: br.agmApprovedAt,
      verifiedBy: null,
      approvedBy: null,
      paymentInitiatedBy: null,
    };
    const statusLabel = br.status === "rejected" ? "Rejected" : `Awaiting ${STATUS_CFG[br.status]?.label ?? "L1 Approval"}`;
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
    const bRes = await apiClient.get<{ bill: ManualBillDetail }>(`/bills/${b._id}`);
    const bill = bRes.data.bill;
    // A manual bill's own L1/L2 sign-off lives in manualAgmApprovedBy/
    // manualGmApprovedBy — printBill's signature block only ever reads the
    // agmApprovedBy/verifiedBy fields a progress-driven bill uses, so without
    // this the name/role never shows on a manual bill's print, even once
    // fully approved.
    const printableBill: PrintableBill = {
      ...bill,
      agmApprovedBy: bill.agmApprovedBy ?? (bill.manualAgmApprovedBy ? { name: bill.manualAgmApprovedBy.name, role: bill.manualAgmApprovedBy.role } : null),
      agmApprovedAt: bill.agmApprovedAt ?? bill.manualAgmApprovedAt,
      verifiedBy: bill.verifiedBy ?? (bill.manualGmApprovedBy ? { name: bill.manualGmApprovedBy.name, role: bill.manualGmApprovedBy.role } : null),
      verifiedAt: bill.verifiedAt ?? bill.manualGmApprovedAt,
    };
    const contractor = await resolvePrintParty(bill.vendorCode);
    printBill(printableBill, contractor, bill.status === "paid" ? "post" : "pre");
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

  const canAgmApprove = hasPerm(user, "agm-approve");
  const canGmApprove = hasPerm(user, "gm-approve");
  // L3/L4 have no hardcoded role the way agm/gm do — only ever reachable via
  // an explicit permission grant, same as approverAllowed's own
  // no-hardcoded-default on the backend.
  const canL3Approve = hasPerm(user, "l3-approve");
  const canL4Approve = hasPerm(user, "l4-approve");
  const canRejectAny = canAgmApprove || canGmApprove || canL3Approve || canL4Approve || user?.role === "accounts" || hasPerm(user, "reject");

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [billReqs, setBillReqs] = useState<BillRequestRow[]>([]);
  const [manualBills, setManualBills] = useState<ManualBillRow[]>([]);
  const [woDeptMap, setWoDeptMap] = useState<Map<string, WorkOrderDeptRow>>(new Map());
  const [allUsers, setAllUsers] = useState<{ _id: string; name: string; role: string; department?: string; customDepartment?: string; permissions?: { module: string; actions: string[] }[] }[]>([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get("/projects"),
      apiClient.get("/bill-requests", { params: { scope: "approval" } }),
      apiClient.get("/bills", { params: { manualApprovalStatus: "pending" } }),
      apiClient.get("/bills", { params: { manualApprovalStatus: "pending-gm" } }),
      apiClient.get("/bills", { params: { manualApprovalStatus: "pending-l3" } }),
      apiClient.get("/bills", { params: { manualApprovalStatus: "pending-l4" } }),
      apiClient.get("/bills", { params: { manualApprovalStatus: "approved" } }),
      apiClient.get("/bills", { params: { manualApprovalStatus: "rejected" } }),
      apiClient.get("/work-orders"),
      apiClient.get("/auth/users"),
    ])
      .then(([projR, brR, manualPendingR, manualGmR, manualL3R, manualL4R, manualApprovedR, manualRejectedR, woR, usersR]) => {
        setProjects(projR.data.projects ?? []);
        setBillReqs(brR.data.billRequests ?? []);
        setManualBills([
          ...(manualPendingR.data.bills ?? []),
          ...(manualGmR.data.bills ?? []),
          ...(manualL3R.data.bills ?? []),
          ...(manualL4R.data.bills ?? []),
          ...(manualApprovedR.data.bills ?? []),
          ...(manualRejectedR.data.bills ?? []),
        ]);
        const wos = (woR.data.workOrders ?? []) as WorkOrderDeptRow[];
        setWoDeptMap(new Map(wos.map(wo => [wo._id, wo])));
        setAllUsers((usersR.data.users ?? []) as any);
      })
      .catch(() => toast.error("Failed to load bill approvals"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Every user is a candidate L2 approver — this is purely informational
  // routing (whoever actually has L2 authority can still approve it
  // regardless of who it's addressed to), so narrowing the list by role,
  // permission, or department just hid people who should've been pickable.
  function l2ApproverOptions(_department?: string, _customDepartment?: string) {
    return allUsers;
  }

  const pendingAgmReqs = useMemo(() => billReqs.filter(r => r.status === "pending" && !r.isArchived), [billReqs]);
  const pendingGmReqs = useMemo(() => billReqs.filter(r => r.status === "pending-gm" && !r.isArchived), [billReqs]);
  const pendingL3Reqs = useMemo(() => billReqs.filter(r => r.status === "pending-l3" && !r.isArchived), [billReqs]);
  const pendingL4Reqs = useMemo(() => billReqs.filter(r => r.status === "pending-l4" && !r.isArchived), [billReqs]);
  const pendingManualAgm = useMemo(() => manualBills.filter(b => b.manualApprovalStatus === "pending"), [manualBills]);
  const pendingManualGm = useMemo(() => manualBills.filter(b => b.manualApprovalStatus === "pending-gm"), [manualBills]);
  const pendingManualL3 = useMemo(() => manualBills.filter(b => b.manualApprovalStatus === "pending-l3"), [manualBills]);
  const pendingManualL4 = useMemo(() => manualBills.filter(b => b.manualApprovalStatus === "pending-l4"), [manualBills]);
  // Which manual bills belong under a given reqTab — mirrors the BillRequest
  // status tabs above (pending/pending-gm/approved/rejected/all).
  function manualBillsForTab(tab: string): ManualBillRow[] {
    if (tab === "all") return manualBills;
    return manualBills.filter(b => b.manualApprovalStatus === tab);
  }

  // ── Dashboard flashcards (Pending / Approved / Rejected) — counts across
  // both bill requests and manual bills, both approval stages combined for
  // Pending. Archived requests are excluded, matching the default list view.
  const totalPendingCount = pendingAgmReqs.length + pendingGmReqs.length + pendingL3Reqs.length + pendingL4Reqs.length
    + pendingManualAgm.length + pendingManualGm.length + pendingManualL3.length + pendingManualL4.length;
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
  // View — a Manual Bill has no BillRequest, so "View" here means the same
  // read-only RunningBill summary Billing's own list shows (status, dates,
  // Accounts Payment's Verification/L1 AGM/L2 Director/TMS/Paid stages,
  // scope items, financial breakdown) — not a print/download action.
  const [viewManualBill, setViewManualBill] = useState<ManualBillDetail | null>(null);
  const [viewManualBillLoadingId, setViewManualBillLoadingId] = useState<string | null>(null);
  async function openManualBillView(b: ManualBillRow) {
    setViewManualBillLoadingId(b._id);
    try {
      const res = await apiClient.get<{ bill: ManualBillDetail }>(`/bills/${b._id}`);
      setViewManualBill(res.data.bill);
    } catch {
      toast.error("Failed to load bill details");
    } finally {
      setViewManualBillLoadingId(null);
    }
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
          location: li.location,
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
  // Who to route this request to for L2 sign-off once L1 approves — see
  // l2ApproverOptions. Purely informational routing, not an exclusivity lock.
  const [approveSentForL2To, setApproveSentForL2To] = useState<string>("");
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
  // Same hold/advance/GST fields as L1 — pre-filled with whatever AGM already
  // set, so GM can either leave them as-is, fill in what AGM left blank, or
  // re-edit them outright; nothing is locked in until the bill is actually
  // created (see gmApproveHandler on the backend).
  const [gmRetention, setGmRetention] = useState<number | null>(null);
  const [gmAdvance, setGmAdvance] = useState<number | null>(null);
  const [gmGst, setGmGst] = useState<number | null>(null);
  const [gmPendingAdvances, setGmPendingAdvances] = useState<{ _id: string; slipNo: string; balance: number }[]>([]);
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
    setApprovePayeeCode(""); setApproveGroupSiblings([]); setApprovePendingAdvances([]); setApproveSentForL2To("");
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
      if (approveSentForL2To) body.sentForL2ApprovalTo = approveSentForL2To;
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
      toast.success(res.data.message || "L1 approved — moved to L2 approval");
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
    // Pre-fill with whatever AGM already set (0/blank shows as blank, not
    // "0", so GM can tell "never set" apart from "AGM deliberately set 0").
    setGmRetention(br?.retentionAmount || null);
    setGmAdvance(br?.advanceRecovery || null);
    setGmGst(br?.gstPercentOverride ?? null);
    setGmPendingAdvances([]);
    if (!br?.vendorCode) return;
    const payee = br.payeeVendorCode || br.vendorCode;
    setGmPayeeCode(payee);
    if (br.projectId) {
      apiClient.get<{ advanceSlips: { _id: string; slipNo: string; balance: number }[] }>(
        "/advance-slips/pending", { params: { projectId: br.projectId, vendorCode: payee } }
      ).then(res => setGmPendingAdvances(res.data.advanceSlips || [])).catch(() => setGmPendingAdvances([]));
    }
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
      if (gmRetention != null) body.retentionAmount = gmRetention;
      if (gmGst != null) body.gstPercent = gmGst;
      if (gmAdvance != null) {
        body.advanceRecovery = gmAdvance;
        const recoveries: { slipId: string; amount: number }[] = [];
        let remaining = gmAdvance;
        for (const slip of gmPendingAdvances) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, slip.balance);
          if (take > 0) recoveries.push({ slipId: slip._id, amount: take });
          remaining -= take;
        }
        if (recoveries.length) body.advanceRecoveries = recoveries;
      }
      const res = await apiClient.put(`/bill-requests/${gmTarget}/gm-approve`, body);
      toast.success(res.data.message || "Approved & bill generated");
      setGmModal(false); setGmTarget(null); setViewReq(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to approve");
    } finally { setSaving(false); }
  };
  // ── L3/L4 approve — only ever reachable for a department configured for
  // 3/4 approval levels (Users → Departments); simpler than L1/L2 since
  // retention/advance/GST were already decided there — just a sign-off.
  const [l3Modal, setL3Modal] = useState(false);
  const [l3Target, setL3Target] = useState<string | null>(null);
  const [l3Remarks, setL3Remarks] = useState("");
  const [l3Retention, setL3Retention] = useState<number | null>(null);
  const [l3Advance, setL3Advance] = useState<number | null>(null);
  const [l3Gst, setL3Gst] = useState<number | null>(null);
  useEffect(() => {
    const br = billReqs.find(r => r._id === l3Target);
    setL3Retention(br?.retentionAmount ?? null);
    setL3Advance(br?.advanceRecovery ?? null);
    setL3Gst(br?.gstPercentOverride ?? null);
  }, [l3Target]);
  const handleL3Approve = async () => {
    if (!l3Target) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { remarks: l3Remarks };
      if (l3Retention != null) body.retentionAmount = l3Retention;
      if (l3Advance != null) body.advanceRecovery = l3Advance;
      if (l3Gst != null) body.gstPercent = l3Gst;
      const res = await apiClient.put(`/bill-requests/${l3Target}/l3-approve`, body);
      toast.success(res.data.message || "L3 approved");
      setL3Modal(false); setL3Target(null); setViewReq(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to approve");
    } finally { setSaving(false); }
  };
  const [l4Modal, setL4Modal] = useState(false);
  const [l4Target, setL4Target] = useState<string | null>(null);
  const [l4Remarks, setL4Remarks] = useState("");
  const [l4Retention, setL4Retention] = useState<number | null>(null);
  const [l4Advance, setL4Advance] = useState<number | null>(null);
  const [l4Gst, setL4Gst] = useState<number | null>(null);
  useEffect(() => {
    const br = billReqs.find(r => r._id === l4Target);
    setL4Retention(br?.retentionAmount ?? null);
    setL4Advance(br?.advanceRecovery ?? null);
    setL4Gst(br?.gstPercentOverride ?? null);
  }, [l4Target]);
  const handleL4Approve = async () => {
    if (!l4Target) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { remarks: l4Remarks };
      if (l4Retention != null) body.retentionAmount = l4Retention;
      if (l4Advance != null) body.advanceRecovery = l4Advance;
      if (l4Gst != null) body.gstPercent = l4Gst;
      const res = await apiClient.put(`/bill-requests/${l4Target}/l4-approve`, body);
      toast.success(res.data.message || "L4 approved & bill generated");
      setL4Modal(false); setL4Target(null); setViewReq(null);
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
  // Who to route this manual bill to for L2 sign-off once L1 approves it —
  // same informational-only routing as the BillRequest AGM modal's own field.
  const [manualSentForL2To, setManualSentForL2To] = useState("");
  // Same hold/advance/GST fields as the BillRequest flow's own approve
  // modals — pre-filled with whatever this bill already has (set at
  // creation, or by an earlier stage), editable at every stage.
  const [manualRetention, setManualRetention] = useState<number | null>(null);
  const [manualAdvance, setManualAdvance] = useState<number | null>(null);
  const [manualGst, setManualGst] = useState<number | null>(null);
  useEffect(() => {
    setManualSentForL2To("");
    setManualRetention(manualApproveTarget?.retentionAmount || null);
    setManualAdvance(manualApproveTarget?.advanceRecovery || null);
    setManualGst(manualApproveTarget?.gstPercent ?? null);
  }, [manualApproveTarget]);

  const handleManualApprove = async (bill: ManualBillRow) => {
    setSaving(true);
    try {
      const MANUAL_APPROVE_ENDPOINT: Record<string, string> = {
        pending: "manual-agm-approve", "pending-gm": "manual-gm-approve",
        "pending-l3": "manual-l3-approve", "pending-l4": "manual-l4-approve",
      };
      const endpoint = MANUAL_APPROVE_ENDPOINT[bill.manualApprovalStatus] || "manual-agm-approve";
      const body: Record<string, unknown> = bill.manualApprovalStatus === "pending" && manualSentForL2To ? { sentForL2ApprovalTo: manualSentForL2To } : {};
      if (manualRetention != null) body.retentionAmount = manualRetention;
      if (manualAdvance != null) body.advanceRecovery = manualAdvance;
      if (manualGst != null) body.gstPercent = manualGst;
      const res = await apiClient.patch(`/bills/${bill._id}/${endpoint}`, body);
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
  const [reqTab, setReqTab] = useState("all");
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
  // A request/bill's OWN department field (set directly on standalone bills,
  // or copied from its Work Order at creation time) is the source of truth —
  // matches what the backend's own visibility filter uses. Falls back to the
  // linked Work Order's current department only for older records that
  // predate this field ever being denormalized onto the bill itself.
  const resolveDeptRow = (row: { department?: string; customDepartment?: string; workOrderId?: string }): WorkOrderDeptRow | undefined => {
    if (row.department) return { _id: "", department: row.department, customDepartment: row.customDepartment };
    return row.workOrderId ? woDeptMap.get(row.workOrderId) : undefined;
  };
  const matchesDept = (row: { department?: string; customDepartment?: string; workOrderId?: string }) => {
    if (!reqDeptFilter) return true;
    return resolveDeptRow(row)?.department === reqDeptFilter;
  };

  const filteredReqs = useMemo(() => {
    let list = billReqs.filter(r => showArchived ? r.isArchived : !r.isArchived);
    list = reqTab === "all" ? list : list.filter(r => r.status === reqTab);
    if (reqProjectFilter) list = list.filter(r => r.projectId === reqProjectFilter);
    if (reqDeptFilter) list = list.filter(r => matchesDept(r));
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
          active={["pending", "pending-gm", "pending-l3", "pending-l4"].includes(reqTab)}
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

      <div className="mb-4 flex gap-2.5 flex-wrap items-center justify-between">
        <Segmented
          value={reqTab}
          onChange={setReqTab}
          options={[
            { value: "pending", label: <span className="inline-flex items-center gap-1.5">Pending L1 {pendingAgmReqs.length + pendingManualAgm.length > 0 && <NxBadge color="amber">{pendingAgmReqs.length + pendingManualAgm.length}</NxBadge>}</span> },
            { value: "pending-gm", label: <span className="inline-flex items-center gap-1.5">Pending L2 {pendingGmReqs.length + pendingManualGm.length > 0 && <NxBadge color="blue">{pendingGmReqs.length + pendingManualGm.length}</NxBadge>}</span> },
            // Only shown when there's actually a request sitting at that
            // stage — most departments never reach L3/L4 (2 is the
            // default), so these tabs would otherwise just be dead weight.
            ...(pendingL3Reqs.length + pendingManualL3.length > 0 ? [{ value: "pending-l3", label: <span className="inline-flex items-center gap-1.5">Pending L3 <NxBadge color="amber">{pendingL3Reqs.length + pendingManualL3.length}</NxBadge></span> }] : []),
            ...(pendingL4Reqs.length + pendingManualL4.length > 0 ? [{ value: "pending-l4", label: <span className="inline-flex items-center gap-1.5">Pending L4 <NxBadge color="teal">{pendingL4Reqs.length + pendingManualL4.length}</NxBadge></span> }] : []),
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
      {manualBillsForTab(reqTab).filter(b => matchesDept(b)).length > 0 && (
        <div className="mb-5">
          <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Manual Bills — Billing → New Bill
          </div>
          <Table className="min-w-[960px]">
            <Thead>
              <Tr>
                <Th className="w-[10%]">Bill No</Th>
                <Th className="w-[9%]">Work Order</Th>
                <Th className="w-[13%]">Project</Th>
                <Th className="w-[11%]">Department</Th>
                <Th className="w-[14%]">Vendor</Th>
                <Th className="w-[11%]">Amount</Th>
                <Th className="w-[10%]">Date</Th>
                <Th className="w-[10%]">Status</Th>
                <Th className="w-[12%]">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {manualBillsForTab(reqTab).filter(b => matchesDept(b)).map(b => (
                <Tr key={b._id} className="cursor-pointer" onClick={() => openManualBillView(b)}>
                  <Td><span className="text-primary font-bold text-[13px]">{b.billNo}</span></Td>
                  <Td>{b.workOrderNo || <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                  <Td>{b.projectName || "—"}</Td>
                  <Td>{departmentLabel(resolveDeptRow(b))}</Td>
                  <Td>{b.vendorName || "—"}</Td>
                  <Td className="font-mono">{fmt(b.amount)}</Td>
                  <Td>{dayjs(b.billDate || b.createdAt).format("DD MMM YYYY")}</Td>
                  <Td className="whitespace-nowrap">
                    <div className="flex flex-wrap items-center gap-1">
                      <NxBadge color={STATUS_CFG[b.manualApprovalStatus]?.color as any ?? "gray"}>{STATUS_CFG[b.manualApprovalStatus]?.label ?? b.manualApprovalStatus}</NxBadge>
                      <OverdueBadge status={b.manualApprovalStatus} since={stageEnteredAt(b)} />
                    </div>
                  </Td>
                  <Td onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <NxBtn color="icon-blue" title="View" icon={Eye} loading={viewManualBillLoadingId === b._id} onClick={() => openManualBillView(b)} />
                      <NxBtn color="icon" title="Print" icon={Printer} loading={printingReqId === b._id} onClick={() => handlePrintManualBill(b)} />
                      {b.manualApprovalStatus === "pending" && canAgmApprove && (
                        <NxBtn color="icon-green" title="L1 Approve" icon={Check} onClick={() => setManualApproveTarget(b)} />
                      )}
                      {b.manualApprovalStatus === "pending-gm" && canGmApprove && (
                        <NxBtn color="icon-green" title="L2 Approve" icon={Check} onClick={() => setManualApproveTarget(b)} />
                      )}
                      {b.manualApprovalStatus === "pending-l3" && canL3Approve && (
                        <NxBtn color="icon-green" title="L3 Approve" icon={Check} onClick={() => setManualApproveTarget(b)} />
                      )}
                      {b.manualApprovalStatus === "pending-l4" && canL4Approve && (
                        <NxBtn color="icon-green" title="L4 Approve" icon={Check} onClick={() => setManualApproveTarget(b)} />
                      )}
                      {["pending", "pending-gm", "pending-l3", "pending-l4"].includes(b.manualApprovalStatus) && canRejectAny && (
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
          <Table className="min-w-[960px]">
            <Thead>
              <Tr>
                <Th className="w-[10%]">Stage / Request</Th>
                <Th className="w-[9%]">Work Order</Th>
                <Th className="w-[13%]">Project</Th>
                <Th className="w-[11%]">Department</Th>
                <Th className="w-[14%]">Vendor</Th>
                <Th className="w-[11%]">Amount</Th>
                <Th className="w-[10%]">Date</Th>
                <Th className="w-[10%]">Status</Th>
                <Th className="w-[12%]">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {reqPager.pageItems.map(r => {
                const cfg = STATUS_CFG[r.status] ?? { color: "gray", label: r.status };
                const reqAmount = r.items.reduce((s, it) => s + (it.amount ?? (it.rate ?? 0) * it.billedQty), 0);
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
                    <Td>{departmentLabel(resolveDeptRow(r))}</Td>
                    <Td>{r.vendorName}</Td>
                    <Td className="font-mono">{fmt(reqAmount)}</Td>
                    <Td>{dayjs(r.createdAt).format("DD MMM YYYY")}</Td>
                    <Td className="whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1">
                        <UIBadge color={cfg.color as any}>{cfg.label}</UIBadge>
                        <OverdueBadge status={r.status} since={stageEnteredAt(r)} />
                      </div>
                    </Td>
                    <Td>
                      <div onClick={e => e.stopPropagation()} className="flex items-center gap-1">
                        <NxBtn color="icon-blue" title="View" icon={Eye} onClick={() => openViewReq(r)} />
                        <NxBtn color="icon" title="Print" icon={Printer} loading={printingReqId === r._id} onClick={() => handlePrintReq(r)} />
                        {r.status === "pending" && canAgmApprove && (
                          <NxBtn color="icon-green" title="L1 Approve" icon={Check} onClick={() => openApprove(r._id)} />
                        )}
                        {r.status === "pending-gm" && canGmApprove && (
                          <NxBtn color="icon-green" title="L2 Approve" icon={Check} onClick={() => openGmApprove(r._id)} />
                        )}
                        {r.status === "pending-l3" && canL3Approve && (
                          <NxBtn color="icon-green" title="L3 Approve" icon={Check} onClick={() => { setL3Target(r._id); setL3Remarks(""); setL3Modal(true); }} />
                        )}
                        {r.status === "pending-l4" && canL4Approve && (
                          <NxBtn color="icon-green" title="L4 Approve" icon={Check} onClick={() => { setL4Target(r._id); setL4Remarks(""); setL4Modal(true); }} />
                        )}
                        {["pending", "pending-gm", "pending-l3", "pending-l4"].includes(r.status) && canRejectAny && (
                          <NxBtn color="icon-red" title="Reject" icon={X} onClick={() => { setRejectTarget(r._id); setRejectModal(true); }} />
                        )}
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
              <OverdueBadge status={viewReq.status} since={stageEnteredAt(viewReq)} />
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
                  {canAgmApprove && <Btn color="primary" label="L1 Approve →" onClick={() => { openApprove(viewReq._id); setViewReq(null); }} />}
                </>
              )}
              {viewReq.status === "pending-gm" && (
                <>
                  {canRejectAny && <Btn color="red" label="Reject" onClick={() => { setRejectTarget(viewReq._id); setRejectModal(true); setViewReq(null); }} />}
                  {canGmApprove && <Btn color="blue" label="L2 Approve →" onClick={() => { openGmApprove(viewReq._id); setViewReq(null); }} />}
                </>
              )}
              {viewReq.status === "pending-l3" && (
                <>
                  {canRejectAny && <Btn color="red" label="Reject" onClick={() => { setRejectTarget(viewReq._id); setRejectModal(true); setViewReq(null); }} />}
                  {canL3Approve && <Btn color="blue" label="L3 Approve →" onClick={() => { setL3Target(viewReq._id); setL3Remarks(""); setL3Modal(true); setViewReq(null); }} />}
                </>
              )}
              {viewReq.status === "pending-l4" && (
                <>
                  {canRejectAny && <Btn color="red" label="Reject" onClick={() => { setRejectTarget(viewReq._id); setRejectModal(true); setViewReq(null); }} />}
                  {canL4Approve && <Btn color="blue" label="L4 Approve →" onClick={() => { setL4Target(viewReq._id); setL4Remarks(""); setL4Modal(true); setViewReq(null); }} />}
                </>
              )}
            </div>
          }
        >
          <div className="flex flex-col gap-3.5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              <div><span className="text-gray-500 dark:text-gray-400">Work Order: </span>{viewReq.workOrderNo}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Project: </span>{viewReq.projectName}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Contractor: </span>{viewReq.vendorName}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Requested By: </span>{viewReq.requestedBy?.name || "—"}</div>
              <div><span className="text-gray-500 dark:text-gray-400">Date: </span>{dayjs(viewReq.createdAt).format("DD MMM YYYY")}</div>
              {(() => {
                // The specific site location (Tower/Floor/Plot…) the DRI
                // actually logged this progress against is more useful here
                // than the work order's own generic overall location — fall
                // back to that only when none of the billed items have one.
                const itemLocations = [...new Set(viewReq.items.map(it => it.location).filter(Boolean))];
                const location = itemLocations.length > 0 ? itemLocations.join(" · ") : viewReq.projectLocation;
                return location ? (
                  <div><span className="text-gray-500 dark:text-gray-400">Location: </span>{location}</div>
                ) : null;
              })()}
              {viewReq.periodFrom && (
                <div><span className="text-gray-500 dark:text-gray-400">Period: </span>{`${dayjs(viewReq.periodFrom).format("DD MMM YYYY")} → ${dayjs(viewReq.periodTo ?? viewReq.createdAt).format("DD MMM YYYY")}`}</div>
              )}
              {viewReq.billId && (
                <div><span className="text-gray-500 dark:text-gray-400">Bill No.: </span>{viewReq.billId.billNo + " — " + fmt(viewReq.billId.amount)}</div>
              )}
            </div>

            {viewReq.status === "pending-gm" && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-3">
                <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300 mb-2 uppercase">L1 already set (read-only)</div>
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
                  {actorName(viewReq.agmApprovedBy) || "L1 Approval"}{actorRole(viewReq.agmApprovedBy) ? ` (${actorRole(viewReq.agmApprovedBy)})` : ""}{viewReq.agmApprovedAt ? ` · ${dayjs(viewReq.agmApprovedAt).format("DD MMM YYYY")}` : ""}
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
                        {it.progressRemarks && (
                          <ul className="text-[11px] text-blue-600 mt-0.5 pl-3.5 list-disc">
                            {it.progressRemarks.split("\n").filter(Boolean).map((note, ni) => <li key={ni}>{note}</li>)}
                          </ul>
                        )}
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
              <div className="rounded-md border border-gray-200 dark:border-gray-700/40 p-3">
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
          title="L1 Approve — Stage 1"
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
          {(() => {
            const br = billReqs.find(r => r._id === approveTarget);
            const candidates = l2ApproverOptions(br?.department, br?.customDepartment);
            return (
              <div className="mt-3">
                <SField
                  label="Send for L2 Approval to (optional)"
                  placeholder={candidates.length === 0 ? "No one with L2 authority yet" : "Select a person…"}
                  value={approveSentForL2To}
                  onChange={setApproveSentForL2To}
                  disabled={candidates.length === 0}
                  options={[{ value: "", label: "— Any L2 approver —" }, ...candidates.map((u) => ({ value: u._id, label: `${u.name} (${u.role})` }))]}
                  hint="Anyone with L2 authority can still approve it — this just flags who it's meant for."
                />
              </div>
            );
          })()}
        </Modal>
      )}

      {/* ── GM approve modal (L2) — final, creates the RunningBill ── */}
      {gmModal && (
        <Modal
          icon={CheckCircle2}
          title="L2 Approve — Stage 2 (Final)"
          onClose={() => { setGmModal(false); setGmTarget(null); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setGmModal(false); setGmTarget(null); }} />
              <Btn color="blue" label="Approve & Generate Bill" loading={saving} onClick={handleGmApprove} />
            </div>
          }
        >
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3.5">
            This creates the running bill. Whatever L1 already set below carries over as-is — fill in anything L1 left blank, or edit it outright.
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
          <div className="mb-3">
            <Field
              label="Hold / Retention Amount (₹, optional)"
              type="number" min="0"
              placeholder="Auto-calculated from work order retention %"
              value={gmRetention ?? ""}
              onChange={(e) => setGmRetention(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="mb-3">
            <Field
              label="Advance Recovery Amount (₹, optional)"
              type="number" min="0"
              max={gmPendingAdvances.length ? gmPendingAdvances.reduce((s, sl) => s + sl.balance, 0) : undefined}
              placeholder="0"
              value={gmAdvance ?? ""}
              onChange={(e) => setGmAdvance(e.target.value ? Number(e.target.value) : null)}
              hint={gmPendingAdvances.length > 0
                ? `Outstanding for this payee: ${gmPendingAdvances.map(sl => `${sl.slipNo} (${fmt(sl.balance)})`).join(", ")} — settled oldest-first.`
                : "No outstanding advance slips for this payee on this project."}
            />
          </div>
          <div className="mb-3">
            <Field
              label="GST % (optional)"
              type="number" min="0" max="100"
              placeholder="Leave blank to use the work order's GST%"
              value={gmGst ?? ""}
              onChange={(e) => setGmGst(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <Field textarea label="Remarks (optional)" placeholder="Remarks (optional)" value={gmRemarks} onChange={(e) => setGmRemarks(e.target.value)} />
        </Modal>
      )}

      {/* ── L3 approve modal — only reachable for a department configured
          for 3/4 approval levels; a plain sign-off, retention/advance/GST
          were already locked in at L1/L2. ── */}
      {l3Modal && (
        <Modal
          icon={CheckCircle2}
          title="L3 Approve"
          onClose={() => { setL3Modal(false); setL3Target(null); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setL3Modal(false); setL3Target(null); }} />
              <Btn color="blue" label="Approve" loading={saving} onClick={handleL3Approve} />
            </div>
          }
        >
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3.5">
            Moves this request on — to L4 if this department needs it, otherwise this creates the running bill. Whatever's already set below carries over as-is — fill in anything left blank, or edit it outright.
          </div>
          <div className="mb-3">
            <Field
              label="Hold / Retention Amount (₹, optional)"
              type="number" min="0"
              placeholder="Auto-calculated from work order retention %"
              value={l3Retention ?? ""}
              onChange={(e) => setL3Retention(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="mb-3">
            <Field
              label="Advance Recovery Amount (₹, optional)"
              type="number" min="0"
              placeholder="0"
              value={l3Advance ?? ""}
              onChange={(e) => setL3Advance(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="mb-3">
            <Field
              label="GST % (optional)"
              type="number" min="0" max="100"
              placeholder="Leave blank to use the work order's GST%"
              value={l3Gst ?? ""}
              onChange={(e) => setL3Gst(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <Field textarea label="Remarks (optional)" placeholder="Remarks (optional)" value={l3Remarks} onChange={(e) => setL3Remarks(e.target.value)} />
        </Modal>
      )}

      {/* ── L4 approve modal — always the final stage (4 is the max
          configurable level today), so this always creates the bill. ── */}
      {l4Modal && (
        <Modal
          icon={CheckCircle2}
          title="L4 Approve — Final"
          onClose={() => { setL4Modal(false); setL4Target(null); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setL4Modal(false); setL4Target(null); }} />
              <Btn color="blue" label="Approve & Generate Bill" loading={saving} onClick={handleL4Approve} />
            </div>
          }
        >
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3.5">
            This creates the running bill. It then moves to Accounts Payment. Whatever's already set below carries over as-is — fill in anything left blank, or edit it outright.
          </div>
          <div className="mb-3">
            <Field
              label="Hold / Retention Amount (₹, optional)"
              type="number" min="0"
              placeholder="Auto-calculated from work order retention %"
              value={l4Retention ?? ""}
              onChange={(e) => setL4Retention(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="mb-3">
            <Field
              label="Advance Recovery Amount (₹, optional)"
              type="number" min="0"
              placeholder="0"
              value={l4Advance ?? ""}
              onChange={(e) => setL4Advance(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="mb-3">
            <Field
              label="GST % (optional)"
              type="number" min="0" max="100"
              placeholder="Leave blank to use the work order's GST%"
              value={l4Gst ?? ""}
              onChange={(e) => setL4Gst(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <Field textarea label="Remarks (optional)" placeholder="Remarks (optional)" value={l4Remarks} onChange={(e) => setL4Remarks(e.target.value)} />
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
        <Modal
          icon={CheckCircle2}
          title={`${STATUS_CFG[manualApproveTarget.manualApprovalStatus]?.label ?? "Approve"} this bill?`}
          onClose={() => setManualApproveTarget(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => setManualApproveTarget(null)} />
              <Btn color="primary" label="Approve" loading={saving} onClick={() => handleManualApprove(manualApproveTarget)} />
            </div>
          }
        >
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3.5">
            {manualApproveTarget.billNo} ({fmt(manualApproveTarget.amount)}) will move to the next stage — or to Accounts for verification if this is the last one.
          </div>
          <div className="mb-3">
            <Field
              label="Hold / Retention Amount (₹, optional)"
              type="number" min="0"
              placeholder="0"
              value={manualRetention ?? ""}
              onChange={(e) => setManualRetention(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="mb-3">
            <Field
              label="Advance Recovery Amount (₹, optional)"
              type="number" min="0"
              placeholder="0"
              value={manualAdvance ?? ""}
              onChange={(e) => setManualAdvance(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="mb-3">
            <Field
              label="GST % (optional)"
              type="number" min="0" max="100"
              placeholder="Leave blank to keep current GST%"
              value={manualGst ?? ""}
              onChange={(e) => setManualGst(e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          {manualApproveTarget.manualApprovalStatus === "pending" && (() => {
            const candidates = l2ApproverOptions(manualApproveTarget.department, manualApproveTarget.customDepartment);
            return (
              <SField
                label="Send for L2 Approval to (optional)"
                placeholder={candidates.length === 0 ? "No one with L2 authority yet" : "Select a person…"}
                value={manualSentForL2To}
                onChange={setManualSentForL2To}
                disabled={candidates.length === 0}
                options={[{ value: "", label: "— Any L2 approver —" }, ...candidates.map((u) => ({ value: u._id, label: `${u.name} (${u.role})` }))]}
                hint="Anyone with L2 authority can still approve it — this just flags who it's meant for."
              />
            );
          })()}
        </Modal>
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

      {/* ── Manual Bill view — read-only RunningBill summary, same layout as
          Billing's own view (status/dates, Accounts Payment's stage chain,
          scope items, financial breakdown). Not a print/download action. ── */}
      {viewManualBill && (
        <Modal
          extraWide
          icon={FileText}
          title={viewManualBill.billNo}
          subtitle="Read-only — process this bill in Accounts Payment"
          onClose={() => setViewManualBill(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Close" onClick={() => setViewManualBill(null)} />
              {["pending", "pending-gm", "pending-l3", "pending-l4"].includes(viewManualBill.manualApprovalStatus) && canRejectAny && (
                <Btn color="red" label="Reject" onClick={() => {
                  setManualRejectTarget({ _id: viewManualBill._id, billNo: viewManualBill.billNo, amount: viewManualBill.amount, billDate: viewManualBill.billDate || "", createdAt: viewManualBill.billDate || "", manualApprovalStatus: viewManualBill.manualApprovalStatus });
                  setViewManualBill(null);
                }} />
              )}
              {viewManualBill.manualApprovalStatus === "pending" && canAgmApprove && (
                <Btn color="primary" label="L1 Approve" onClick={() => {
                  setManualApproveTarget({ _id: viewManualBill._id, billNo: viewManualBill.billNo, amount: viewManualBill.amount, billDate: viewManualBill.billDate || "", createdAt: viewManualBill.billDate || "", manualApprovalStatus: viewManualBill.manualApprovalStatus, department: viewManualBill.department, customDepartment: viewManualBill.customDepartment });
                  setViewManualBill(null);
                }} />
              )}
              {viewManualBill.manualApprovalStatus === "pending-gm" && canGmApprove && (
                <Btn color="blue" label="L2 Approve" onClick={() => {
                  setManualApproveTarget({ _id: viewManualBill._id, billNo: viewManualBill.billNo, amount: viewManualBill.amount, billDate: viewManualBill.billDate || "", createdAt: viewManualBill.billDate || "", manualApprovalStatus: viewManualBill.manualApprovalStatus, department: viewManualBill.department, customDepartment: viewManualBill.customDepartment });
                  setViewManualBill(null);
                }} />
              )}
              {viewManualBill.manualApprovalStatus === "pending-l3" && canL3Approve && (
                <Btn color="blue" label="L3 Approve" onClick={() => {
                  setManualApproveTarget({ _id: viewManualBill._id, billNo: viewManualBill.billNo, amount: viewManualBill.amount, billDate: viewManualBill.billDate || "", createdAt: viewManualBill.billDate || "", manualApprovalStatus: viewManualBill.manualApprovalStatus, department: viewManualBill.department, customDepartment: viewManualBill.customDepartment });
                  setViewManualBill(null);
                }} />
              )}
              {viewManualBill.manualApprovalStatus === "pending-l4" && canL4Approve && (
                <Btn color="blue" label="L4 Approve" onClick={() => {
                  setManualApproveTarget({ _id: viewManualBill._id, billNo: viewManualBill.billNo, amount: viewManualBill.amount, billDate: viewManualBill.billDate || "", createdAt: viewManualBill.billDate || "", manualApprovalStatus: viewManualBill.manualApprovalStatus, department: viewManualBill.department, customDepartment: viewManualBill.customDepartment });
                  setViewManualBill(null);
                }} />
              )}
            </div>
          }
        >
          <Descriptions columns={2}>
            <DescItem label="Status"><NxBadge color={BILL_STATUS_BADGE_COLOR[viewManualBill.status] ?? "gray"}>{BILL_STATUS_LABEL[viewManualBill.status] || viewManualBill.status}</NxBadge></DescItem>
            <DescItem label="Bill Date">{viewManualBill.billDate ? dayjs(viewManualBill.billDate).format("DD MMM YYYY") : "—"}</DescItem>
            <DescItem label="Project">{viewManualBill.projectName || "—"}</DescItem>
            <DescItem label="Work Order">{viewManualBill.workOrderNo || "—"}</DescItem>
            <DescItem label="Vendor">{viewManualBill.vendorName || "—"}</DescItem>
            <DescItem label="Generated By">{viewManualBill.generatedBy || "—"}</DescItem>
            {viewManualBill.projectLocation && <DescItem label="Location">{viewManualBill.projectLocation}</DescItem>}
          </Descriptions>


          <div className="border-t border-gray-200 dark:border-gray-700/40 my-4" />

          <div className="mb-4">
            <div className="font-bold text-xs text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
              Bill Approvals
            </div>
            <Table>
              <Thead>
                <Tr>
                  <Th>Verification</Th>
                  <Th>L1 AGM</Th>
                  <Th>L2 Director</Th>
                  <Th>Sent to TMS</Th>
                  <Th>Paid</Th>
                </Tr>
              </Thead>
              <Tbody>
                <Tr>
                  <Td className="align-top"><BillStageCell by={viewManualBill.verificationBy?.name} at={viewManualBill.verificationAt} /></Td>
                  <Td className="align-top"><BillStageCell by={viewManualBill.l1ApprovedBy?.name} at={viewManualBill.l1ApprovedAt} /></Td>
                  <Td className="align-top"><BillStageCell by={viewManualBill.l2ApprovedBy?.name} at={viewManualBill.l2ApprovedAt} /></Td>
                  <Td className="align-top"><BillStageCell at={viewManualBill.tmsSentAt} /></Td>
                  <Td className="align-top"><BillStageCell at={viewManualBill.tmsCallbackReceivedAt} /></Td>
                </Tr>
              </Tbody>
            </Table>
          </div>

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
                {(viewManualBill.lineItems || []).map((li, i) => (
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
                <Tr className="!bg-primary/5">
                  <Td colSpan={4} className="font-bold text-right text-primary">Gross Total</Td>
                  <Td className="font-bold text-right">{fmt(viewManualBill.amount)}</Td>
                </Tr>
              </Tfoot>
            </Table>
          </div>

          {(() => {
            const gross = viewManualBill.amount || 0;
            const retAmt = viewManualBill.retentionAmount ?? 0;
            const advRec = viewManualBill.advanceRecovery ?? 0;
            const { gstAmount, netAfterHold } = billFinancials({ gross, gstPercent: viewManualBill.gstPercent ?? 0, retentionAmount: retAmt, advanceRecovery: advRec });
            return (
              <div className="rounded-lg border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3 font-mono text-[13px]">
                <div className="font-bold mb-2 text-emerald-800 dark:text-emerald-300">
                  Running Bill: {viewManualBill.billNo}
                </div>
                <div className="flex justify-between text-gray-500 dark:text-gray-400">
                  <span>Gross Billed</span><span>{fmt(gross)}</span>
                </div>
                {retAmt > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Hold / Retention{(viewManualBill.retentionPercent ?? 0) > 0 ? ` @ ${viewManualBill.retentionPercent}%` : ""}</span><span>− {fmt(retAmt)}</span>
                  </div>
                )}
                {advRec > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Less: Advance Recovery</span><span>− {fmt(advRec)}</span>
                  </div>
                )}
                {gstAmount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>GST @ {viewManualBill.gstPercent ?? 0}%</span><span>+ {fmt(gstAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-primary border-t border-emerald-200 dark:border-emerald-500/30 pt-1 mt-1">
                  <span>Net Payable</span><span>{fmt(netAfterHold)}</span>
                </div>
              </div>
            );
          })()}

          {(() => {
            // Just this bill's own pre-Accounts L1/L2 sign-off — the same
            // approvalHistory array also carries the later Accounts Payment
            // stages (verify/l1-agm/l2-director/hold/tms) shown separately
            // above in the "Bill Approvals" table, so only 'manual-*' entries
            // belong in this history.
            const manualHistory = (viewManualBill.approvalHistory ?? []).filter(h => h.stage.startsWith("manual-"));
            if (manualHistory.length === 0) return null;
            return (
              <div className="mt-4 rounded-md border border-gray-200 dark:border-gray-700/40 p-3">
                <div className="font-bold text-[11px] text-gray-500 dark:text-gray-400 uppercase mb-1.5">History</div>
                <ApprovalHistoryTimeline history={manualHistory} />
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
