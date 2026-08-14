import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Trophy, Check, X, ClipboardList, TrendingUp, CheckCircle2, Clock } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import BillDetailModal, { type BillDetailRequest } from "../../components/BillDetailModal";
import WorkOrderApprovalWorkflow, {
  type ActorRef, type ApprovalStatus, type ApprovalHistoryEntry,
} from "../../components/WorkOrderApprovalWorkflow";
import { billFinancials } from "../../shared/utils/billMath";
import Spinner from "../../ui/Spinner";
import EmptyState from "../../ui/EmptyState";
import KPICard from "../../ui/KPICard";
import Segmented from "../../ui/Segmented";
import Card from "../../ui/Card";
import Btn from "../../ui/Btn";
import Badge from "../../ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProgressEntry { _id: string; date: string; qtyAdded: number; remarks?: string; }

interface ScopeItem {
  _id: string; description: string; unit: string;
  plannedQty: number; rate: number; amount: number;
  completedQty: number; lastBilledQty: number;
  status: string; progressEntries: ProgressEntry[];
  // Only meaningful for a professional-services deliverable.
  stage?: string; plannedEnd?: string;
}

interface WODetail {
  _id: string; workOrderNo: string; projectName: string; vendorName: string;
  category: string; subCategory?: string; contractValue: number;
  gstPercent?: number;
  contractType?: "execution" | "professional-services";
  issueDate: string; status: string;
  cancelReason?: string; cancelledAt?: string;
  isLocked?: boolean;
  scopeItems: ScopeItem[];
  // 4-level approval workflow
  approvalStatus?: ApprovalStatus;
  makerBy?: ActorRef; makerAt?: string;
  checkerBy?: ActorRef; checkerAt?: string; checkerRemarks?: string;
  approverBy?: ActorRef; approverAt?: string; approverRemarks?: string;
  finalApprovedBy?: ActorRef; finalApprovedAt?: string; finalRemarks?: string;
  approvalHistory?: ApprovalHistoryEntry[];
}

interface BillItem { description: string; progressRemarks?: string; unit: string; billedQty: number; rate?: number; amount?: number; }
interface BillRequestStage {
  _id: string; reqNo: string; stageNo: number;
  status: "pending" | "approved" | "rejected";
  periodFrom?: string; periodTo?: string; createdAt: string;
  items: BillItem[]; remarks?: string; rejectReason?: string;
  billId?: {
    billNo: string; status: string; amount: number; paymentDate?: string;
    paidAmount?: number; retentionPercent?: number; retentionAmount?: number;
    advanceRecovery?: number; gstPercent?: number; tdsAmount?: number; paymentUTR?: string;
    verificationBy?: { name: string } | null; verificationAt?: string;
    l1ApprovedBy?: { name: string } | null; l1ApprovedAt?: string;
    l2ApprovedBy?: { name: string } | null; l2ApprovedAt?: string;
    tmsSentAt?: string; tmsCallbackReceivedAt?: string;
  } | null;
  milestoneAchieved: boolean; milestoneDate?: string;
  requestedBy?: { name: string; email: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtMoney = (n: number) => "₹" + (n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Per-unit rates are fractional far more often than totals are — rounding
// them for display (as fmtMoney() does) silently turns 130.5 into 131.
const fmtRate  = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Net of GST, hold/retention and advance recovery — the amount actually due to the
// contractor before TDS, not the raw gross bill figure. Matches Bills/Ledger/Approvals.
const netPayable = (b: NonNullable<BillRequestStage["billId"]>) =>
  billFinancials({
    gross: b.amount, gstPercent: b.gstPercent ?? 0,
    retentionAmount: b.retentionAmount ?? 0, advanceRecovery: b.advanceRecovery ?? 0,
  }).netPayable;

// Same "Hold — <stage>" convention used across Bills/Approvals/Ledger so a bill's
// status reads the same way everywhere in the system.
const RB_STATUS_CFG: Record<string, { label: string; color: string }> = {
  draft:         { label: "Awaiting Verification",  color: "#6B7280" },
  "verify-done": { label: "Awaiting L1 AGM",         color: "#2563eb" },
  "l1-approved": { label: "Awaiting L2 Director",    color: "#d97706" },
  approved:      { label: "Ready for TMS",           color: "#d97706" },
  "sent-to-tms": { label: "Sent to TMS",             color: "#7c3aed" },
  hold:          { label: "On Hold",                 color: "#9333ea" },
  rejected:      { label: "Rejected",                color: "#dc2626" },
  paid:          { label: "Paid",                    color: "#16a34a" },
};

// ── Stage Lifecycle Stepper ───────────────────────────────────────────────────
type StepStatus = "completed" | "current" | "pending" | "rejected";

const STEP_COLORS: Record<StepStatus, { ring: string; bg: string; text: string }> = {
  completed: { ring: "#16a34a", bg: "#f0fdf4",  text: "#16a34a" },
  current:   { ring: "#FF7A00", bg: "#FFF4E8",  text: "#FF7A00" },
  rejected:  { ring: "#ef4444", bg: "#fef2f2",  text: "#ef4444" },
  pending:   { ring: "#D1D5DB", bg: "#F9FAFB",  text: "#9CA3AF" },
};

function StageStepper({ stage }: { stage: BillRequestStage }) {
  const billStatus = stage.billId?.status ?? "";
  const billExists = !!stage.billId;
  const billPaid   = ["l1-approved", "approved", "sent-to-tms", "hold", "paid"].includes(billStatus);

  const steps: { label: string; sub: string; status: StepStatus }[] = [
    {
      label: "Bill",
      sub:   "Requested",
      status: "completed",
    },
    {
      label: "Request",
      sub:   "Reviewed",
      status: stage.status === "approved" ? "completed"
            : stage.status === "rejected" ? "rejected"
            : "current",
    },
    {
      label: "Running Bill",
      sub:   "Raised",
      status: billExists ? "completed"
            : stage.status === "approved" ? "current"
            : "pending",
    },
    {
      label: "Bill",
      sub:   "Verified",
      status: billPaid ? "completed"
            : billExists ? "current"
            : "pending",
    },
    {
      label: "Payment",
      sub:   "Released",
      status: stage.milestoneAchieved ? "completed"
            : billPaid ? "current"
            : "pending",
    },
  ];

  return (
    <div className="my-3.5 px-3.5 py-3 rounded-lg border border-gray-200 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-800/40">
      <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
        Stage Lifecycle
      </div>

      {/* Circles + connectors row */}
      <div className="flex items-center">
        {steps.map((step, i) => {
          const c = STEP_COLORS[step.status];
          return (
            <div key={i} className={`flex items-center ${i < steps.length - 1 ? "flex-1" : ""}`}>
              <div
                className="w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 text-[13px] font-extrabold transition-all"
                style={{ background: c.bg, border: `2.5px solid ${c.ring}`, color: c.ring }}
              >
                {step.status === "completed" ? <Check className="w-3.5 h-3.5" />
                 : step.status === "rejected" ? <X className="w-3.5 h-3.5" />
                 : <span className="text-[11px]">{i + 1}</span>}
              </div>
              {i < steps.length - 1 && (
                <div
                  className="flex-1 h-[2.5px] rounded mx-0.5"
                  style={{ background: steps[i + 1].status !== "pending" ? "#16a34a" : undefined }}
                >
                  {steps[i + 1].status === "pending" && <div className="h-full rounded bg-gray-200 dark:bg-gray-700" />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Labels row — one cell per step, same width allocation as above */}
      <div className="flex mt-1.5">
        {steps.map((step, i) => (
          <div key={i} className={`text-center min-w-[30px] ${i < steps.length - 1 ? "flex-1" : ""}`}>
            <div className="text-[10px] font-bold leading-tight" style={{ color: STEP_COLORS[step.status].text }}>{step.label}</div>
            <div className="text-[9px] leading-tight opacity-80" style={{ color: STEP_COLORS[step.status].text }}>{step.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
const fmtQty   = (n: number) => (n ?? 0).toLocaleString("en-IN");
const pctOf    = (c: number, p: number) => p > 0 ? Math.min(100, Math.round(((c ?? 0) / p) * 100)) : 0;
const fmtDate  = (d?: string | null) => d ? dayjs(d).format("DD MMM YYYY") : "—";

const STAGE_STATUS: Record<string, { icon: string; color: string; label: string; bg: string }> = {
  pending:  { icon: "⏳", color: "#f59e0b", label: "Pending Review",     bg: "#fffbeb" },
  approved: { icon: "✅", color: "#16a34a", label: "Approved",            bg: "#f0fdf4" },
  rejected: { icon: "❌", color: "#ef4444", label: "Rejected",            bg: "#fef2f2" },
};

type TabKey = "items" | "milestones" | "bills" | "progress";

// ── Component ─────────────────────────────────────────────────────────────────
export default function WorkOrderDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === "owner" || user?.role === "gm" || user?.role === "accounts";

  const [wo,      setWO]      = useState<WODetail | null>(null);
  const [stages,  setStages]  = useState<BillRequestStage[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab,       setActiveTab]       = useState<TabKey>("items");
  const [viewBill,        setViewBill]        = useState<BillDetailRequest | null>(null);

  const load = async () => {
    if (!id) return;
    try {
      const [woRes, brRes] = await Promise.all([
        apiClient.get(`/work-orders/${id}`),
        apiClient.get(`/bill-requests?workOrderId=${id}`),
      ]);
      setWO(woRes.data.workOrder);
      setStages(brRes.data.billRequests ?? []);
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="flex justify-center py-20"><Spinner size="large" /></div>;
  if (!wo) return <div className="py-20"><EmptyState title="Work order not found." /></div>;

  const isProfessionalServices = wo.contractType === "professional-services";

  // Compute stats
  const totalContract = wo.contractValue || 0;
  const avgPct = wo.scopeItems.length
    ? Math.round(wo.scopeItems.reduce((s, si) => s + pctOf(si.completedQty, si.plannedQty), 0) / wo.scopeItems.length)
    : 0;
  const billedAmount = stages
    .filter(s => s.status === "approved")
    .reduce((sum, s) => sum + s.items.reduce((si, it) => si + (it.amount || 0), 0), 0);
  const unbilledValue = wo.scopeItems.reduce((sum, si) => {
    const pending = Math.max(0, si.completedQty - (si.lastBilledQty || 0));
    return sum + pending * (si.rate || 0);
  }, 0);
  // Flatten recent entries
  const allEntries = wo.scopeItems.flatMap(si =>
    si.progressEntries.map(pe => ({
      ...pe,
      description: si.description,
      unit: si.unit,
    }))
  ).sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

  const woStatus = wo.status === "cancelled" ? "Cancelled" : wo.status === "in-progress" ? "In Progress" : wo.status === "completed" ? "Completed" : wo.status === "issued" ? "Issued" : "Draft";
  const woStatusColor: "red" | "amber" | "green" | "gray" = wo.status === "cancelled" ? "red" : wo.status === "in-progress" ? "amber" : wo.status === "completed" ? "green" : "gray";
  const progressTint: "green" | "amber" | "blue" = avgPct >= 100 ? "green" : avgPct > 50 ? "amber" : "blue";

  return (
    <div className="max-w-[1100px] mx-auto p-6">
      <Card padded={false} className="overflow-hidden flex flex-col">
        {/* Back + Header */}
        <div className="p-6 pb-0">
          <button
            type="button"
            onClick={() => navigate("/work-items")}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-2.5"
          >
            <ArrowLeft className="w-4 h-4" /> Work Orders
          </button>
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <div className="text-2xl font-extrabold text-[#1A1A2E] dark:text-[#F1F5F9] flex items-center gap-3 flex-wrap">
                {wo.workOrderNo}
                <Badge color={woStatusColor}>{woStatus}</Badge>
                {wo.isLocked && <Badge color="amber">🔒 Locked</Badge>}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {wo.projectName} · {wo.category}{wo.subCategory ? ` › ${wo.subCategory}` : ""}
              </div>
              <div className="text-[13px] text-gray-400 dark:text-gray-500 mt-0.5">
                Contractor: {wo.vendorName} · Issued: {fmtDate(wo.issueDate)}
              </div>
            </div>
          </div>
          {wo.status === "cancelled" && (
            <div className="mt-3.5 rounded-lg border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3.5 py-2.5">
              <div className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wide">Work Order Cancelled</div>
              <div className="text-sm text-red-800 dark:text-red-300 mt-0.5">
                {wo.cancelReason || "No remark provided"}
                {wo.cancelledAt && <span className="text-red-700 dark:text-red-400 ml-2">({fmtDate(wo.cancelledAt)})</span>}
              </div>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 pt-5">
          <KPICard
            label="Contract Value"
            value={fmtMoney(totalContract)}
            icon={ClipboardList}
            tint="gray"
            sub={(wo.gstPercent ?? 0) > 0 ? (
              <div className="pt-1.5 mt-1 border-t border-dashed border-gray-200 dark:border-gray-700/40">
                <div className="text-[10px] text-gray-400 dark:text-gray-500">+ GST @{wo.gstPercent}%</div>
                <div className="text-[13px] font-bold text-primary mt-0.5">
                  {fmtMoney(Math.round(totalContract * (1 + (wo.gstPercent ?? 0) / 100)))} incl. GST
                </div>
              </div>
            ) : undefined}
          />
          <KPICard label="Overall Progress" value={`${avgPct}%`} icon={TrendingUp} tint={progressTint} />
          <KPICard label="Billed to Date" value={fmtMoney(billedAmount)} icon={CheckCircle2} tint="green" />
          <KPICard
            label="Unbilled Work" value={fmtMoney(unbilledValue)} icon={Clock}
            tint={unbilledValue > 0 ? "orange" : "green"}
          />
        </div>

        {/* Live Workflow Screen — always-visible approval status, timeline & inline actions */}
        <div className="px-6 pt-5">
          <WorkOrderApprovalWorkflow workOrder={wo} onUpdated={setWO} />
        </div>

        {/* Tab switcher */}
        <div className="px-6 pt-5 pb-4">
          <Segmented
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { label: "Items", value: "items" },
              { label: "Milestones", value: "milestones" },
              { label: "Bills", value: "bills" },
              { label: "Progress", value: "progress" },
            ]}
          />
        </div>

        {/* Tab content — the ONLY part of this page that scrolls; everything above stays put. */}
        <div className="border-t border-gray-100 dark:border-gray-700/40 max-h-[55vh] overflow-y-auto">
          {/* Items tab — scope of work definition */}
          {activeTab === "items" && (
            <>
              <div className="px-6 py-4 font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">
                {isProfessionalServices ? "Deliverables" : "Scope of Work"}
              </div>
              {wo.scopeItems.length === 0 ? (
                <EmptyState title={isProfessionalServices ? "No deliverables defined" : "No scope items defined"} />
              ) : (
                <div className="px-6 pb-5">
                  <Table>
                    <Thead>
                      <Tr>
                        {(isProfessionalServices
                          ? ["Deliverable", "Stage", "Due Date", "Amount", "Status"]
                          : ["Description", "Unit", "Planned Qty", "Rate", "Amount", "Status"]
                        ).map(h => <Th key={h}>{h}</Th>)}
                      </Tr>
                    </Thead>
                    <Tbody>
                      {wo.scopeItems.map(si => (
                        <Tr key={si._id}>
                          <Td><span className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{si.description}</span></Td>
                          {isProfessionalServices ? (
                            <>
                              <Td><TdText>{si.stage || "—"}</TdText></Td>
                              <Td><TdText>{fmtDate(si.plannedEnd)}</TdText></Td>
                            </>
                          ) : (
                            <>
                              <Td><TdText>{si.unit}</TdText></Td>
                              <Td><span className="font-mono"><TdText>{fmtQty(si.plannedQty)}</TdText></span></Td>
                              <Td><span className="font-mono"><TdText>{fmtMoney(si.rate || 0)}</TdText></span></Td>
                            </>
                          )}
                          <Td><span className="font-mono font-bold text-primary">{fmtMoney(si.amount || 0)}</span></Td>
                          <Td><span className="capitalize"><TdText>{si.status}</TdText></span></Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </>
          )}

          {/* Bills tab — every bill generated for this work order */}
          {activeTab === "bills" && (() => {
            const bills = stages.filter(s => s.billId).map(s => ({ stage: s, bill: s.billId! }));
            const openBill = (stage: BillRequestStage) => setViewBill({
              _id: stage._id, reqNo: stage.reqNo, stageNo: stage.stageNo,
              workOrderNo: wo.workOrderNo, projectName: wo.projectName, vendorName: wo.vendorName,
              category: wo.category, subCategory: wo.subCategory ?? "",
              items: stage.items, remarks: stage.remarks ?? "",
              periodFrom: stage.periodFrom, periodTo: stage.periodTo,
              status: stage.status, rejectReason: stage.rejectReason,
              requestedBy: stage.requestedBy, billId: stage.billId ?? undefined,
              milestoneAchieved: stage.milestoneAchieved, milestoneDate: stage.milestoneDate,
              createdAt: stage.createdAt,
            });
            return (
              <>
                <div className="px-6 py-4 flex justify-between items-center">
                  <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Bills</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">{bills.length} total</div>
                </div>
                {bills.length === 0 ? (
                  <EmptyState title="No bills generated yet." />
                ) : (
                  <div className="px-6 pb-5">
                    <Table>
                      <Thead>
                        <Tr>
                          {["Bill No", "Stage", "Bill Amount", "Status", "Amount Paid", "Payment Date", ""].map(h => <Th key={h}>{h}</Th>)}
                        </Tr>
                      </Thead>
                      <Tbody>
                        {bills.map(({ stage, bill }) => {
                          const cfg = RB_STATUS_CFG[bill.status] ?? { label: bill.status, color: "#6B7280" };
                          const isPaid = bill.status === "paid";
                          const actuallyPaid = bill.paidAmount ?? Math.max(0, netPayable(bill) - (bill.tdsAmount ?? 0));
                          return (
                            <Tr key={bill.billNo}>
                              <Td><span className="font-mono font-bold text-primary">{bill.billNo}</span></Td>
                              <Td><TdText>Stage {stage.stageNo}</TdText></Td>
                              <Td><span className="font-mono font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{fmtMoney(bill.amount)}</span></Td>
                              <Td><span className="text-[12px] font-semibold" style={{ color: cfg.color }}>{cfg.label}</span></Td>
                              <Td>
                                <span className={`font-mono font-bold ${isPaid ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"}`}>
                                  {isPaid ? fmtMoney(actuallyPaid) : `${fmtMoney(netPayable(bill))} pending`}
                                </span>
                              </Td>
                              <Td><TdText>{fmtDate(bill.paymentDate)}</TdText></Td>
                              <Td><Btn small outline label="View" onClick={() => openBill(stage)} /></Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    </Table>
                  </div>
                )}
              </>
            );
          })()}

          {/* Progress tab — per scope item progress breakdown */}
          {activeTab === "progress" && isProfessionalServices && (
            <>
              <div className="px-6 py-4 font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">
                Deliverable Status
              </div>
              {wo.scopeItems.length === 0 ? (
                <EmptyState title="No deliverables defined" />
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
                  {wo.scopeItems.map(si => {
                    const STATUS_CFG = {
                      completed: { icon: "✔", label: "Completed",  color: "#16a34a", bg: "#F0FDF4" },
                      running:   { icon: "⏳", label: "In Progress", color: "#d97706", bg: "#FFFBEB" },
                      pending:   { icon: "○", label: "Pending",     color: "#9CA3AF", bg: "#F9FAFB" },
                    } as const;
                    const cfg = STATUS_CFG[si.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending;
                    return (
                      <div key={si._id} className="px-6 py-4 flex items-center gap-3.5">
                        <div
                          className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[15px] shrink-0"
                          style={{ background: cfg.bg, border: `2px solid ${cfg.color}`, color: cfg.color }}
                        >
                          {cfg.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{si.description}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {si.stage ? `${si.stage} · ` : ""}{fmtMoney(si.amount || 0)}
                            {si.plannedEnd && ` · Due ${fmtDate(si.plannedEnd)}`}
                          </div>
                        </div>
                        <div className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {activeTab === "progress" && !isProfessionalServices && (
            <>
              <div className="px-6 py-4 font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">
                Scope Items Progress
              </div>
              {wo.scopeItems.length === 0 ? (
                <EmptyState title="No scope items defined" />
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
                  {wo.scopeItems.map(si => {
                    const pct      = pctOf(si.completedQty, si.plannedQty);
                    const billedPct= si.plannedQty > 0 ? Math.min(100, Math.round(((si.lastBilledQty || 0) / si.plannedQty) * 100)) : 0;
                    const pending  = Math.max(0, si.completedQty - (si.lastBilledQty || 0));
                    const remaining= Math.max(0, si.plannedQty - si.completedQty);
                    return (
                      <div key={si._id} className="px-6 py-4.5">
                        <div className="flex justify-between items-baseline mb-2">
                          <div className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{si.description}</div>
                          <div className={`text-[13px] font-extrabold ${pct >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-primary"}`}>{pct}%</div>
                        </div>

                        {/* Multi-layer progress bar */}
                        <div className="h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden relative mb-2.5">
                          <div className="absolute left-0 top-0 h-full rounded-full bg-emerald-600" style={{ width: `${billedPct}%` }} />
                          <div className="absolute top-0 h-full rounded-full bg-primary" style={{ left: `${billedPct}%`, width: `${Math.max(0, pct - billedPct)}%` }} />
                        </div>
                        <div className="flex gap-3 mb-2.5">
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">█ Billed</span>
                          <span className="text-[10px] text-primary">█ Unbilled</span>
                          <span className="text-[10px] text-gray-300 dark:text-gray-600">█ Not done</span>
                        </div>

                        {/* Numbers row */}
                        <div className="flex gap-6 flex-wrap">
                          {[
                            { label: "Planned",   value: `${fmtQty(si.plannedQty)} ${si.unit}`,                        cls: "text-gray-700 dark:text-gray-300" },
                            { label: "Done",      value: `${fmtQty(si.completedQty)} ${si.unit}`,                       cls: pct >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-700 dark:text-gray-300" },
                            { label: "Billed",    value: `${fmtQty(si.lastBilledQty || 0)} ${si.unit}`,                 cls: "text-emerald-600 dark:text-emerald-400" },
                            { label: "Unbilled",  value: pending > 0 ? `${fmtQty(pending)} ${si.unit}` : "—",           cls: pending > 0 ? "text-primary" : "text-gray-400 dark:text-gray-500" },
                            { label: "Remaining", value: remaining > 0 ? `${fmtQty(remaining)} ${si.unit}` : "Done ✓",  cls: remaining > 0 ? "text-gray-700 dark:text-gray-300" : "text-emerald-600 dark:text-emerald-400" },
                            { label: "Rate",      value: fmtRate(si.rate || 0),                                          cls: "text-gray-700 dark:text-gray-300" },
                          ].map(({ label, value, cls }) => (
                            <div key={label}>
                              <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</div>
                              <div className={`text-[13px] font-semibold mt-0.5 ${cls}`}>{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Milestones tab */}
          {activeTab === "milestones" && (
            <>
              {/* Stage Timeline */}
              <div className="px-6 py-4 font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">
                Stage Timeline
                <span className="ml-2.5 text-xs text-gray-400 dark:text-gray-500 font-normal">
                  {stages.length} stage{stages.length !== 1 ? "s" : ""}
                </span>
              </div>

              {stages.length === 0 ? (
                <EmptyState title="No bill requests submitted yet." />
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
                  {stages.map((stage, idx) => {
                    const cfg = STAGE_STATUS[stage.status] ?? STAGE_STATUS.pending;
                    const stageTotal = stage.items.reduce((s, it) => s + (it.amount || 0), 0);
                    return (
                      <div key={stage._id} className="px-6 py-5 flex gap-4 items-start">
                        {/* Stage number + status icon */}
                        <div className="shrink-0 text-center">
                          <div
                            className="w-[52px] h-[52px] rounded-full flex flex-col items-center justify-center"
                            style={{
                              background: stage.milestoneAchieved ? "#FFF4E8" : cfg.bg,
                              border: `2px solid ${stage.milestoneAchieved ? "var(--nx-orange)" : cfg.color}`,
                            }}
                          >
                            <div className="text-lg">{stage.milestoneAchieved ? "🏆" : cfg.icon}</div>
                          </div>
                          {idx < stages.length - 1 && (
                            <div className="w-0.5 h-8 bg-gray-200 dark:bg-gray-700 mx-auto mt-1" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="font-extrabold text-base text-[#1A1A2E] dark:text-[#F1F5F9]">Stage {stage.stageNo}</span>
                            <code className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{stage.reqNo}</code>
                            <span className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}` }}>
                              {cfg.label}
                            </span>
                            {stage.milestoneAchieved && (
                              <Badge color="orange">🏆 Milestone Achieved</Badge>
                            )}
                          </div>

                          {/* Period */}
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            📅 Period: {fmtDate(stage.periodFrom)} → {fmtDate(stage.periodTo ?? stage.createdAt)}
                            {stage.requestedBy?.name && <span> · Submitted by {stage.requestedBy.name}</span>}
                          </div>

                          {/* Items */}
                          <div className="flex gap-2 flex-wrap">
                            {stage.items.map((it, i) => (
                              <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-md px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300">
                                <span className="font-semibold">{it.description}</span>: {fmtQty(it.billedQty)} {it.unit}
                                {it.amount ? <span className="text-emerald-600 dark:text-emerald-400 ml-1.5">({fmtMoney(it.amount)})</span> : null}
                              </div>
                            ))}
                          </div>

                          {/* Stage lifecycle stepper */}
                          <StageStepper stage={stage} />

                          {/* Bill info */}
                          {stage.status === "approved" && stage.billId && (
                            <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 rounded-lg px-3 py-2 text-sm mb-2 flex gap-4 flex-wrap text-emerald-800 dark:text-emerald-300">
                              <span><strong>Bill:</strong> {stage.billId.billNo}</span>
                              {stageTotal > 0 && <span><strong>Amount:</strong> {fmtMoney(stageTotal)}</span>}
                              <span><strong>Status:</strong> {stage.billId.status?.toUpperCase()}</span>
                              {stage.milestoneAchieved && stage.milestoneDate && (
                                <span className="text-primary"><strong>Payment Released:</strong> {fmtDate(stage.milestoneDate)}</span>
                              )}
                            </div>
                          )}

                          {/* Reject reason */}
                          {stage.status === "rejected" && stage.rejectReason && (
                            <div className="bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-lg px-2.5 py-1.5 text-xs text-red-700 dark:text-red-300 mb-2">
                              <strong>Reason:</strong> {stage.rejectReason}
                            </div>
                          )}

                          {/* Remarks */}
                          {stage.remarks && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Remarks: {stage.remarks}</div>
                          )}

                          {/* Payment release now happens entirely from the Accounts Payment page. */}
                          {canManage && stage.status === "approved" && !stage.milestoneAchieved && (
                            <Btn small outline icon={Trophy} label="Manage in Accounts Payment →" onClick={() => navigate("/accounts-payment")} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Recent Daily Entries */}
              {allEntries.length > 0 && (
                <>
                  <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700/40 font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">
                    Recent Daily Progress
                  </div>
                  <div className="px-6 pb-5">
                    <Table>
                      <Thead>
                        <Tr>
                          {["Date", "Scope Item", "Qty Added", "Remarks"].map(h => <Th key={h}>{h}</Th>)}
                        </Tr>
                      </Thead>
                      <Tbody>
                        {allEntries.slice(0, 20).map((e, i) => (
                          <Tr key={e._id + i}>
                            <Td className="whitespace-nowrap"><TdText>{fmtDate(e.date)}</TdText></Td>
                            <Td><span className="font-medium text-[#1A1A2E] dark:text-[#F1F5F9]">{e.description}</span></Td>
                            <Td><span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">+{fmtQty(e.qtyAdded)} {e.unit}</span></Td>
                            <Td><TdText>{e.remarks || "—"}</TdText></Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                    {allEntries.length > 20 && (
                      <div className="pt-2.5 text-xs text-gray-400 dark:text-gray-500">
                        Showing last 20 of {allEntries.length} entries.
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </Card>

      <BillDetailModal billRequest={viewBill} open={!!viewBill} onClose={() => setViewBill(null)} />
    </div>
  );
}
