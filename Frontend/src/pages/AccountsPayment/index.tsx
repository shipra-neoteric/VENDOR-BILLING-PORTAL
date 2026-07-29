import { useEffect, useMemo, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Steps,
  Switch,
  Table,
  Tag,
  Tooltip,
  message,
} from "antd";
import {
  ArrowRightOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleFilled,
  CloseCircleOutlined,
  DeleteOutlined,
  DollarOutlined,
  ExclamationCircleFilled,
  FileAddOutlined,
  FileTextOutlined,
  InboxOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import { selectableProjects } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";
import { useAuth } from "../../context/AuthContext";
import type { AuthUser } from "../../context/AuthContext";
import StatusTag from "../../shared/components/StatusTag";
import WorkOrderDetailView from "../../components/WorkOrderDetailView";
import ContractorDetailView from "../../components/ContractorDetailView";
import type { WorkOrder, Contractor } from "../../types/VendorBilling";
import { printBill } from "../../shared/utils/printBill";

// ── Types ────────────────────────────────────────────────────────

type BillStatus = "draft" | "submitted" | "verified" | "approved" | "payment-initiated" | "hold" | "rejected" | "paid";

interface BillUser { _id?: string; name?: string; role?: string; }

interface PhysicalVerification {
  done: boolean;
  by?: BillUser | string | null;
  at?: string;
  remark?: string;
}

interface PaymentPreparation {
  done: boolean;
  by?: BillUser | string | null;
  at?: string;
  paymentMode?: string;
  checklist?: { bankDetailsVerified?: boolean; fundsAvailable?: boolean; voucherPrepared?: boolean };
  remark?: string;
}

interface PaymentDetailsStage {
  done: boolean;
  by?: BillUser | string | null;
  at?: string;
  remark?: string;
}

interface ApprovalHistoryEntry {
  stage: "maker" | "checker" | "approver" | "hold" | "payment-maker" | "physical-verify" | "release" | "payment-details";
  action: "submitted" | "approved" | "sent-back" | "held" | "released-hold" | "done";
  by?: BillUser | string | null;
  at?: string;
  remarks?: string;
}

interface LineItem {
  key: number;
  scopeItemId?: string;
  description: string;
  remarks?: string;
  // The DRI's own notes from the day-to-day progress entries billed here —
  // distinct from `remarks`, which is the scope item's static instruction note.
  progressRemarks?: string;
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
  projectLocation?: string;
  vendorCode?: string;
  vendorName?: string;
  companyName?: string;
  billDate: string;
  billingPeriodFrom?: string;
  billingPeriodTo?: string;
  contractorRefNo?: string;
  generatedBy?: string;
  lineItems: Omit<LineItem, "key">[];
  amount: number;
  gstPercent: number;
  retentionPercent?: number;
  retentionAmount?: number;
  advanceRecovery?: number;
  tdsPercent: number;
  remarks?: string;
  status: BillStatus;
  submittedAt?: string;
  agmApprovedBy?: BillUser | null;
  agmApprovedAt?: string;
  makerBy?: BillUser | null;
  makerAt?: string;
  verifiedBy?: BillUser | null;
  verifiedAt?: string;
  checkerBy?: BillUser | null;
  checkerAt?: string;
  approvedBy?: BillUser | null;
  approvedAt?: string;
  paymentInitiatedBy?: BillUser | null;
  paymentInitiatedAt?: string;
  tdsAmount?: number;
  makerChecklist?: { tallyEntryDone?: boolean; newItemsAddedInTally?: boolean };
  physicalVerification?: PhysicalVerification;
  paymentPreparation?: PaymentPreparation;
  paymentDetails?: PaymentDetailsStage;
  approvalHistory?: ApprovalHistoryEntry[];
  holdBy?: BillUser | null;
  holdAt?: string;
  holdReason?: string;
  holdReleasedBy?: BillUser | null;
  holdReleasedAt?: string;
  rejectedBy?: BillUser | null;
  rejectReason?: string;
  paymentDate?: string;
  paymentUTR?: string;
  paymentChequeNo?: string;
  paymentMode?: string;
  paymentReleasedBy?: string;
  paymentBank?: string;
  paidAmount?: number;
  retentionReleased?: number;
  retentionReleaseRemark?: string;
  createdAt?: string;
  // Bill Relationship Engine
  billType?: string;
  relationshipType?: string;
  linkedBills?: { billId: string; billNo: string; relationshipType: string }[];
  billingCycle?: number;
  isActive?: boolean;
  supersededBy?: { _id: string; billNo: string; billType?: string } | null;
  isArchived?: boolean;
  archivedAt?: string;
}

interface ProjectOpt { id: string; name: string; code: string; parentId?: string | null; }
interface ScopeItemOpt { id: string; description: string; unit: string; plannedQty: number; completedQty: number; rate?: number; }
interface WorkOrderOpt { id: string; workOrderNo: string; projectId: string; projectName: string; vendorCode: string; vendorName: string; scopeItems: ScopeItemOpt[]; }
interface AdvanceSlipOpt { _id: string; slipNo: string; amount: number; amountRecovered: number; balance: number; date?: string; reference?: string; }

// ── Helpers ──────────────────────────────────────────────────────

const fmt = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
// Net payable after GST + hold/retention, minus advance recovery — before TDS.
const netAfterAdvance = (b: Bill) => {
  const netPay = (b.amount || 0) * (1 + (b.gstPercent ?? 0) / 100) - (b.retentionAmount ?? 0);
  return Math.round(netPay - (b.advanceRecovery ?? 0));
};
const normalizeId = (obj: Record<string, unknown>) => ({ ...obj, id: (obj._id || obj.id)?.toString() || "" });
const normalizeWO = (wo: Record<string, unknown>): WorkOrderOpt => ({
  ...normalizeId(wo),
  scopeItems: ((wo.scopeItems as Record<string, unknown>[]) || []).map(normalizeId),
} as unknown as WorkOrderOpt);

// Full-fidelity normalize (unlike the WorkOrderOpt-shaped one above, used only
// for the New Bill drawer's WO picker) — for the WO quick-view drawer, which
// needs the exact same shape WorkOrderDetailView already renders elsewhere.
const normalizeFullWO = (wo: Record<string, unknown>): WorkOrder => ({
  ...normalizeId(wo),
  scopeItems: ((wo.scopeItems as Record<string, unknown>[]) || []).map((si) => ({
    ...normalizeId(si),
    progressEntries: ((si.progressEntries as Record<string, unknown>[]) || []).map(normalizeId),
    subItems: ((si.subItems as Record<string, unknown>[]) || []).map(normalizeId),
  })),
  paymentMilestones: ((wo.paymentMilestones as Record<string, unknown>[]) || []).map(normalizeId),
} as unknown as WorkOrder);

let _key = 0;
const nextKey = () => ++_key;

const blankRow = (): LineItem => ({ key: nextKey(), description: "", unit: "", plannedQty: 0, billedQty: 0, rate: 0, amount: 0 });

// A grant for module 'accounts-payment' with the given action name — Owner always
// bypasses, matching every other permission check in this codebase.
function hasPerm(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return !!user.permissions?.find((p) => p.module === "accounts-payment")?.actions.includes(action);
}

// Segregation-of-duties guard: is `user` the same person who acted as `actor` at the
// previous stage? Owner is exempt, mirroring the backend's own bypass for owner.
function sameActor(user: AuthUser | null, actor?: BillUser | null): boolean {
  if (!user || !actor?._id || user.role === "owner") return false;
  return actor._id === user.id;
}

// physicalVerification.by only comes back populated on the mutation response that set
// it — list/detail GETs don't populate that sub-field — so this stays defensive against
// either shape (populated object or a raw id string) rather than assuming one.
function physByName(by?: BillUser | string | null): string | undefined {
  if (!by || typeof by === "string") return undefined;
  return by.name;
}

// A 'payment-initiated' bill moves through three sequential sub-panels gated
// by sub-object flags (same pattern physicalVerification already used before
// paymentPreparation existed) rather than separate status values — this is
// the single source of truth both renderActionSection and footerPrimary key
// off, so the branching logic lives in exactly one place.
function paymentSubStage(bill: Bill): "prepare" | "verify" | "release" {
  if (!bill.paymentPreparation?.done) return "prepare";
  if (!bill.physicalVerification?.done) return "verify";
  return "release";
}

const BILL_TYPE_CFG: Record<string, { label: string; color: string }> = {
  running:              { label: "Running Bill",     color: "#2563eb" },
  final:                { label: "Final Bill",       color: "#16a85a" },
  advance_mobilization: { label: "Mob. Advance",     color: "#7c3aed" },
  advance_secured:      { label: "Secured Advance",  color: "#7c3aed" },
  advance_material:     { label: "Material Advance", color: "#7c3aed" },
  recovery:             { label: "Recovery",         color: "#d97706" },
  credit_note:          { label: "Credit Note",      color: "#dc2626" },
  debit_note:           { label: "Debit Note",       color: "#d97706" },
  revision:             { label: "Revision",         color: "#0d9488" },
  correction:           { label: "Correction",       color: "#0d9488" },
  retention_release:    { label: "Retention Release",color: "#0369a1" },
};

const RELATIONSHIP_OPTIONS = [
  { value: "NONE",                label: "None — standalone bill" },
  { value: "CONTINUES",           label: "CONTINUES — next running bill in sequence" },
  { value: "SUPERSEDES",          label: "SUPERSEDES — final bill replacing running bills" },
  { value: "ADJUSTMENT",          label: "ADJUSTMENT — credit/debit note on a bill" },
  { value: "REVISION_OF",         label: "REVISION_OF — replaces an earlier bill" },
  { value: "ADVANCE_FOR",         label: "ADVANCE_FOR — advance for future billing" },
  { value: "RECOVERY_OF",         label: "RECOVERY_OF — recovering a prior advance" },
  { value: "SETTLEMENT_OF",       label: "SETTLEMENT_OF — settling outstanding balance" },
  { value: "CORRECTION_OF",       label: "CORRECTION_OF — correcting a previous bill" },
  { value: "RETENTION_RELEASE_OF",label: "RETENTION_RELEASE_OF — releasing held retention" },
];

const PAYMENT_MODE_OPTIONS = [
  { label: "NEFT", value: "neft" },
  { label: "RTGS", value: "rtgs" },
  { label: "IMPS", value: "imps" },
  { label: "Internet Banking", value: "internet_banking" },
  { label: "UPI", value: "upi" },
  { label: "Cheque", value: "cheque" },
  { label: "Demand Draft (DD)", value: "dd" },
  { label: "Cash", value: "cash" },
];

// ── Small visual building blocks ──────────────────────────────────

function StatCard({
  label, value, sub, icon, accent, onClick,
}: {
  label: string; value: ReactNode; sub?: string; icon: ReactNode; accent: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px",
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10, background: `${accent}1A`,
        display: "flex", alignItems: "center", justifyContent: "center", color: accent, fontSize: 18, marginBottom: 12,
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#1a1f2e", marginTop: 2, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

interface TabDef { key: string; label: string; count: number; }

function PillTabs({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (k: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "7px 15px", borderRadius: 20,
              border: isActive ? "1.5px solid #1a1f2e" : "1px solid transparent",
              background: isActive ? "#fff" : "transparent",
              fontWeight: isActive ? 700 : 500,
              color: isActive ? "#1a1f2e" : "#6B7280",
              fontSize: 13, cursor: "pointer", outline: "none",
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{ background: "#DCFCE7", color: "#15803D", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function InfoCard({ title, accent, children, extra }: { title: string; accent: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 16px", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 4, height: 15, borderRadius: 2, background: accent }} />
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1f2e" }}>{title}</div>
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono, bold }: { label: string; value: ReactNode; mono?: boolean; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", fontSize: 12.5 }}>
      <span style={{ color: "#9CA3AF" }}>{label}</span>
      <span style={{ fontFamily: mono ? "monospace" : undefined, fontWeight: bold ? 700 : 500, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function MutedNote({ text }: { text: string }) {
  return (
    <div style={{ marginTop: 16, padding: "10px 14px", background: "#F9FAFB", border: "1px dashed #E5E7EB", borderRadius: 8, color: "#9CA3AF", fontSize: 12.5 }}>
      {text}
    </div>
  );
}

const sectionPanelStyle: React.CSSProperties = {
  border: "1px solid #E5E7EB", borderRadius: 10, padding: "14px 16px", marginTop: 16, background: "#F9FAFB",
};

// Maker → Checker → Approver → Payment Maker → Physical Verify → Paid stepper,
// driven from the real fields on the bill rather than any separately-tracked
// UI state. A bill on Hold still shows its progress up to the point it was
// paused (see the Hold banner rendered alongside this in the drawer).
function buildSteps(bill: Bill): { title: string; content: string; icon: ReactNode; status: "wait" | "process" | "finish" | "error" }[] {
  const doneFlags = [
    !!bill.makerBy,
    !!bill.checkerBy,
    !!bill.paymentInitiatedBy,
    !!bill.paymentPreparation?.done,
    !!bill.physicalVerification?.done,
    bill.status === "paid",
    !!bill.paymentDetails?.done,
  ];
  let currentIdx = doneFlags.findIndex((d) => !d);
  if (currentIdx === -1) currentIdx = doneFlags.length;

  const meta = [
    { title: "Maker",            by: bill.makerBy?.name,                          at: bill.makerAt },
    { title: "Checker",          by: bill.checkerBy?.name,                        at: bill.checkerAt },
    { title: "Approver",         by: bill.paymentInitiatedBy?.name,               at: bill.paymentInitiatedAt },
    { title: "Payment Maker",    by: physByName(bill.paymentPreparation?.by),     at: bill.paymentPreparation?.at },
    { title: "Physical Verify",  by: physByName(bill.physicalVerification?.by),   at: bill.physicalVerification?.at },
    { title: "Paid",             by: undefined,                                   at: undefined },
    { title: "Payment Details",  by: physByName(bill.paymentDetails?.by),         at: bill.paymentDetails?.at },
  ];

  return meta.map((m, idx) => {
    const done = doneFlags[idx];
    const isCurrent = idx === currentIdx;
    let status: "wait" | "process" | "finish" | "error" = "wait";
    let icon: ReactNode = <span style={{ fontWeight: 700 }}>{idx + 1}</span>;
    if (done) {
      status = "finish";
      icon = <CheckCircleFilled style={{ color: "#16A34A" }} />;
    } else if (bill.status === "rejected" && isCurrent) {
      status = "error";
      icon = <CloseCircleFilled style={{ color: "#DC2626" }} />;
    } else if (isCurrent) {
      status = "process";
      icon = <ExclamationCircleFilled style={{ color: "#D97706" }} />;
    }
    const content = done
      ? `${m.by || "—"}${m.at ? " · " + dayjs(m.at).format("DD MMM") : ""}`
      : bill.status === "rejected" && isCurrent
        ? "Rejected here"
        : "";
    return { title: m.title, content, icon, status };
  });
}

const HISTORY_STAGE_LABEL: Record<ApprovalHistoryEntry["stage"], string> = {
  maker: "Maker", checker: "Checker", approver: "Approver", hold: "Hold",
  "payment-maker": "Payment Maker", "physical-verify": "Physical Verify",
  release: "Release", "payment-details": "Payment Details",
};

// Append-only timeline built directly from approvalHistory — mirrors
// WorkOrderApprovalWorkflow's ApprovalTimeline so a bill that cycles through
// send-back → resubmit multiple times never loses any stage's remarks (the
// single overwritable `remarks` field can't show this).
function BillHistoryTimeline({ history }: { history: ApprovalHistoryEntry[] }) {
  if (!history || history.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
        History
      </div>
      {history.map((h, i) => {
        const isSentBack = h.action === "sent-back";
        const isHeld = h.action === "held";
        const isReleased = h.action === "released-hold";
        const color = isSentBack ? "#DC2626" : isHeld ? "#9333ea" : isReleased ? "#0369a1" : "#16A34A";
        const bg    = isSentBack ? "#FEF2F2" : isHeld ? "#F5F3FF" : isReleased ? "#EFF6FF" : "#F0FDF4";
        const verb  = isSentBack ? "sent back" : isHeld ? "held" : isReleased ? "released the hold" : h.action === "submitted" ? "submitted" : "completed";
        const actorName = typeof h.by === "object" && h.by ? h.by.name : undefined;
        return (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flexShrink: 0, textAlign: "center" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: bg, border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color }}>
                {isSentBack ? "✕" : isHeld ? "⏸" : isReleased ? "▶" : "✓"}
              </div>
              {i < history.length - 1 && <div style={{ width: 2, height: 26, background: "#E5E7EB", margin: "2px auto" }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#111827" }}>
                {HISTORY_STAGE_LABEL[h.stage]} {verb}
                <span style={{ fontWeight: 400, color: "#9CA3AF", marginLeft: 8, fontSize: 11.5 }}>
                  {actorName || "—"}{h.at ? ` · ${dayjs(h.at).format("DD MMM YYYY, hh:mm A")}` : ""}
                </span>
              </div>
              {h.remarks && (
                <div style={{ fontSize: 12, color: isSentBack ? "#B91C1C" : "#6B7280", marginTop: 4, background: isSentBack ? "#FEF2F2" : "#F9FAFB", border: `1px solid ${isSentBack ? "#FCA5A5" : "#E5E7EB"}`, borderRadius: 6, padding: "5px 9px" }}>
                  {h.remarks}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Read-only "paid" summary + an owner-only inline (no popup) deductions editor.
function PaidPanel({ bill, isOwner, onUpdated }: { bill: Bill; isOwner: boolean; onUpdated: (b: Bill) => void }) {
  const [editing, setEditing] = useState(false);
  const [retention, setRetention] = useState(bill.retentionAmount ?? 0);
  const [advance, setAdvance] = useState(bill.advanceRecovery ?? 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRetention(bill.retentionAmount ?? 0);
    setAdvance(bill.advanceRecovery ?? 0);
    setEditing(false);
  }, [bill.id]);

  async function save() {
    setSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${bill.id}/deductions`, {
        advanceRecovery: advance, retentionAmount: retention,
      });
      onUpdated(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Deductions updated");
      setEditing(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to update deductions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 16, background: "#F5F0FF", border: "1px solid #C4B5FD", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#7C3AED" }}>Payment Released</div>
        {isOwner && !editing && (
          <Button size="small" onClick={() => setEditing(true)}>Edit Deductions</Button>
        )}
      </div>
      {editing ? (
        <div>
          <Row gutter={12}>
            <Col span={12}>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Hold / Retention (₹)</div>
              <InputNumber style={{ width: "100%" }} min={0} value={retention} onChange={(v) => setRetention(Number(v) || 0)} />
            </Col>
            <Col span={12}>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Advance Recovery (₹)</div>
              <InputNumber style={{ width: "100%" }} min={0} value={advance} onChange={(v) => setAdvance(Number(v) || 0)} />
            </Col>
          </Row>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Button type="primary" size="small" loading={saving} style={{ background: "#7C3AED", borderColor: "#7C3AED" }} onClick={save}>Save</Button>
            <Button size="small" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Descriptions column={2} size="small" colon={false}>
          <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Payment Date</span>}>
            {bill.paymentDate ? dayjs(bill.paymentDate).format("DD MMM YYYY") : "—"}
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Mode</span>}>
            <Tag color="purple">
              {({ neft: "NEFT", rtgs: "RTGS", imps: "IMPS", internet_banking: "Internet Banking", upi: "UPI", cheque: "Cheque", dd: "DD", cash: "Cash" } as Record<string, string>)[bill.paymentMode || ""] || bill.paymentMode?.toUpperCase() || "—"}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>UTR / Ref</span>}>
            <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{bill.paymentUTR || "—"}</span>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Bank</span>}>
            {bill.paymentBank || "—"}
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Released By</span>}>
            {bill.paymentReleasedBy || "—"}
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Amount Paid</span>}>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#16a85a" }}>{bill.paidAmount != null ? fmt(bill.paidAmount) : "—"}</span>
          </Descriptions.Item>
        </Descriptions>
      )}
    </div>
  );
}

// Mode/UTR/bank/released-by/exact amount routinely aren't known at "Mark as
// Paid" time — the bank statement arrives ~a day later. This is the stage
// that actually records that paperwork, plus any advance-slip recovery
// allocated against this payment. Shown alongside PaidPanel until submitted.
function PaymentDetailsPanel({ bill, canRelease, onUpdated }: { bill: Bill; canRelease: boolean; onUpdated: (b: Bill) => void }) {
  const [form] = Form.useForm();
  const [pendingAdvances, setPendingAdvances]   = useState<AdvanceSlipOpt[]>([]);
  const [advancesLoading, setAdvancesLoading]   = useState(false);
  const [advanceAmount, setAdvanceAmount]       = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (bill.paymentDetails?.done) return;
    form.setFieldsValue({
      paymentDate: dayjs(),
      paymentMode: bill.paymentPreparation?.paymentMode,
      paidAmount: Math.max(0, netAfterAdvance(bill) - (bill.tdsAmount || 0) + (bill.retentionReleased ?? 0)),
    });
    setAdvanceAmount(bill.advanceRecovery || null);
    setPendingAdvances([]);
    if (bill.projectId && bill.vendorCode) {
      setAdvancesLoading(true);
      apiClient.get<{ advanceSlips: AdvanceSlipOpt[] }>(`/advance-slips/pending?projectId=${bill.projectId}&vendorCode=${bill.vendorCode}`)
        .then((r) => {
          const slips = (r.data.advanceSlips || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
          setPendingAdvances(slips);
        })
        .catch(() => setPendingAdvances([]))
        .finally(() => setAdvancesLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill.id, bill.paymentDetails?.done]);

  if (bill.paymentDetails?.done) {
    return (
      <div style={{ marginTop: 16, background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#1D4ED8", marginBottom: 10 }}>Payment Details</div>
        <Descriptions column={2} size="small" colon={false}>
          <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Payment Date</span>}>
            {bill.paymentDate ? dayjs(bill.paymentDate).format("DD MMM YYYY") : "—"}
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Mode</span>}>
            {PAYMENT_MODE_OPTIONS.find((o) => o.value === bill.paymentMode)?.label || bill.paymentMode || "—"}
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>UTR / Ref</span>}>
            <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{bill.paymentUTR || "—"}</span>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Bank</span>}>{bill.paymentBank || "—"}</Descriptions.Item>
          <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Released By</span>}>{bill.paymentReleasedBy || "—"}</Descriptions.Item>
          <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Total Amount Paid</span>}>{fmt(bill.paidAmount ?? 0)}</Descriptions.Item>
        </Descriptions>
      </div>
    );
  }

  if (!canRelease) return null;

  async function save() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      // Distribute the entered recovery amount across outstanding slips oldest-first,
      // capped at each slip's own balance, so a single number the user types becomes
      // a concrete per-slip ledger update on the backend.
      const recoveries: { slipId: string; amount: number }[] = [];
      let remaining = advanceAmount || 0;
      for (const slip of pendingAdvances) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, slip.balance);
        if (take > 0) recoveries.push({ slipId: slip._id, amount: take });
        remaining -= take;
      }

      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${bill.id}/payment-details`, {
        paymentUTR:        values.paymentUTR,
        paymentMode:       values.paymentMode,
        paymentDate:       values.paymentDate ? dayjs(values.paymentDate as string).toISOString() : undefined,
        paymentBank:       values.paymentBank,
        paymentReleasedBy: values.paymentReleasedBy,
        paidAmount:        values.paidAmount,
        ...(recoveries.length ? { advanceRecoveries: recoveries } : {}),
      });
      onUpdated(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Payment details recorded");
    } catch (err: unknown) {
      const e = err as { errorFields?: unknown; response?: { data?: { message?: string } } };
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || "Failed to record payment details");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 16, background: "#F9FAFB", border: "1px dashed #BFDBFE", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#1D4ED8", marginBottom: 4 }}>Payment Details — pending</div>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>
        Once the bank statement arrives, record the mode/UTR/bank/amount here.
      </div>

      <div style={{ border: "1px solid #fde68a", borderRadius: 8, padding: "12px 14px", marginBottom: 14, background: "#fefce8" }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, color: "#92400e", marginBottom: 8 }}>Advance Recovery</div>
        {advancesLoading && <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8 }}>Checking pending advances…</div>}
        {!advancesLoading && pendingAdvances.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {pendingAdvances.map(slip => (
              <div key={slip._id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid #fde68a" }}>
                <span style={{ color: "#78350f" }}>{slip.slipNo}{slip.reference ? ` — ${slip.reference}` : ""}</span>
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#b45309" }}>Balance: ₹{Math.round(slip.balance).toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        )}
        {!advancesLoading && pendingAdvances.length === 0 && (
          <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8 }}>No outstanding advance slips for this vendor on this project.</div>
        )}
        <InputNumber<number>
          style={{ width: "100%" }}
          prefix="− ₹"
          value={advanceAmount}
          onChange={setAdvanceAmount}
          min={0}
          max={pendingAdvances.length > 0 ? pendingAdvances.reduce((s, sl) => s + sl.balance, 0) : undefined}
          precision={0}
          placeholder="0 — leave blank to skip recovery"
        />
        <div style={{ fontSize: 11, color: "#92400e", marginTop: 6 }}>
          Allocated oldest-first across the slips above, capped at each slip's balance.
        </div>
      </div>

      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Payment Date" name="paymentDate" rules={[{ required: true }]}>
              <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Payment Mode" name="paymentMode" rules={[{ required: true }]}>
              <Select options={PAYMENT_MODE_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="UTR / Transaction Reference" name="paymentUTR">
          <Input placeholder="e.g. HDFC202606270001234" style={{ fontFamily: "monospace" }} />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Bank" name="paymentBank">
              <Input placeholder="e.g. HDFC Bank" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Released By" name="paymentReleasedBy" rules={[{ required: true }]}>
              <Input placeholder="Finance officer name" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          label="Total Amount Paid (₹)"
          name="paidAmount"
          rules={[{ required: true, message: "Enter the total amount actually paid" }]}
          extra={
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.paidAmount !== cur.paidAmount}>
              {({ getFieldValue }) => {
                const paid    = getFieldValue("paidAmount") as number | undefined;
                const retRel  = bill.retentionReleased ?? 0;
                if (!paid) return null;
                const billPart = paid - retRel;
                const diff     = Math.round(netAfterAdvance(bill) - billPart);
                if (diff === 0 && retRel === 0) return null;
                return (
                  <span style={{ color: "#6b7280", fontSize: 12 }}>
                    Bill portion ₹{billPart.toLocaleString("en-IN")}
                    {retRel > 0 ? ` + Hold release ₹${retRel.toLocaleString("en-IN")}` : ""}
                    {diff !== 0 ? ` · ₹${Math.abs(diff).toLocaleString("en-IN")} ${diff > 0 ? "TDS/deduction" : "extra"} on bill` : ""}
                  </span>
                );
              }}
            </Form.Item>
          }
        >
          <InputNumber<number>
            style={{ width: "100%", fontFamily: "monospace", fontWeight: 700 }}
            min={0}
            precision={0}
            formatter={(v) => `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            parser={(v) => Number((v || "").replace(/[₹\s,]/g, ""))}
          />
        </Form.Item>
      </Form>
      <Button type="primary" size="small" style={{ marginTop: 4, background: "#1D4ED8", borderColor: "#1D4ED8" }} loading={saving} onClick={save}>
        Submit Payment Details
      </Button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function AccountsPayment() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate  = hasPerm(user, "create");
  const canMaker   = hasPerm(user, "maker");
  const canChecker = hasPerm(user, "checker");
  const canApprover = hasPerm(user, "approver");
  const canPaymentMaker = hasPerm(user, "payment-maker");
  const canPhysicalVerify = hasPerm(user, "physical-verify");
  const canRelease = hasPerm(user, "release");
  const canPaymentDetails = hasPerm(user, "payment-details");
  const canRejectAny = canMaker || canChecker || canApprover || canPaymentMaker || canPhysicalVerify || canRelease || hasPerm(user, "reject");
  const isOwner = user?.role === "owner";

  const [bills, setBills]             = useState<Bill[]>([]);
  const [loading, setLoading]         = useState(true);
  const [projects, setProjects]       = useState<ProjectOpt[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);

  const [activeTab, setActiveTab] = useState("all");

  // Filters
  const [search, setSearch]             = useState("");
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);
  const [vendorFilter, setVendorFilter]   = useState<string | undefined>(undefined);
  const [dateFrom, setDateFrom]         = useState<Dayjs | null>(null);
  const [dateTo, setDateTo]             = useState<Dayjs | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // New Bill drawer
  const [newOpen, setNewOpen]           = useState(false);
  const [newSaving, setNewSaving]       = useState(false);
  const [newForm]                       = Form.useForm();
  const [newProjectId, setNewProjectId] = useState<string>("");
  const [newContractorId, setNewContractorId] = useState<string>("");
  const [woList, setWoList]             = useState<WorkOrderOpt[]>([]);
  const [lineItems, setLineItems]       = useState<LineItem[]>([blankRow()]);
  const [newGstPercent, setNewGstPercent] = useState<number>(18);
  const [isCustomGst, setIsCustomGst]     = useState(false);
  const [newBillType, setNewBillType]         = useState<string>("running");
  const [newRelType, setNewRelType]           = useState<string>("NONE");
  const [newLinkedBillIds, setNewLinkedBillIds] = useState<string[]>([]);
  const [newSelectedWOId, setNewSelectedWOId] = useState<string>("");
  const [woExistingBills, setWoExistingBills] = useState<Bill[]>([]);

  // ── The one shared bill detail Drawer ─────────────────────────
  const [drawerBillId, setDrawerBillId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [drawerWOCategory, setDrawerWOCategory] = useState<string | undefined>(undefined);

  // Reject (inline, any stage)
  const [rejecting, setRejecting]       = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);

  // Maker confirm (Stage 1) — checklist required before Tally entry is
  // considered done; both must be checked before Confirm is enabled.
  const [makerTallyDone, setMakerTallyDone]         = useState(false);
  const [makerNewItemsDone, setMakerNewItemsDone]   = useState(false);
  const [makerRemarks, setMakerRemarks] = useState("");
  const [makerSaving, setMakerSaving]   = useState(false);

  // Checker approve (Stage 2) — now also sets TDS (moved from Approver).
  const [checkerRetention, setCheckerRetention] = useState(0);
  const [checkerAdvance, setCheckerAdvance]     = useState(0);
  const [checkerTdsPercent, setCheckerTdsPercent] = useState(1);
  const [checkerTdsAmount, setCheckerTdsAmount]   = useState(0);
  // Hold/retention release (settling a PRIOR bill's withheld retention) — moved
  // here from final release since the checker already reviews retention/advance/TDS.
  const [checkerRetentionReleased, setCheckerRetentionReleased]             = useState(0);
  const [checkerRetentionReleaseRemark, setCheckerRetentionReleaseRemark]  = useState("");
  const [checkerRemarks, setCheckerRemarks]     = useState("");
  const [checkerSaving, setCheckerSaving]       = useState(false);

  // Approver (Stage 3) — pure read-only review + Approve / Reject / Hold.
  const [approverRemarks, setApproverRemarks]       = useState("");
  const [approverSaving, setApproverSaving]         = useState(false);
  const [holding, setHolding]               = useState(false);
  const [holdReason, setHoldReason]         = useState("");
  const [holdSaving, setHoldSaving]         = useState(false);
  const [releaseHoldSaving, setReleaseHoldSaving] = useState(false);

  // Payment Maker (new stage, between Approver and Physical Verify)
  const [prepMode, setPrepMode]             = useState<string | undefined>(undefined);
  const [prepBankVerified, setPrepBankVerified]   = useState(false);
  const [prepFundsAvailable, setPrepFundsAvailable] = useState(false);
  const [prepVoucherReady, setPrepVoucherReady]   = useState(false);
  const [prepRemark, setPrepRemark]         = useState("");
  const [prepSaving, setPrepSaving]         = useState(false);

  // Physical verification
  const [physPrinted, setPhysPrinted]       = useState(false);
  const [physAttachments, setPhysAttachments] = useState(false);
  const [physSigned, setPhysSigned]         = useState(false);
  const [physRemark, setPhysRemark]         = useState("");
  const [physSaving, setPhysSaving]         = useState(false);

  // Release (Stage 4 — "Mark as Paid", a bare status flip; the full payment
  // paperwork is entered afterward via PaymentDetailsPanel once status is 'paid').
  const [releaseRemark, setReleaseRemark]   = useState("");
  const [releaseSaving, setReleaseSaving]   = useState(false);

  // Work Order / Vendor quick-view drawers — opened from a table row click,
  // independent of the main bill drawer's lifecycle.
  const [woDrawerId, setWoDrawerId]         = useState<string | null>(null);
  const [woDrawerData, setWoDrawerData]     = useState<WorkOrder | null>(null);
  const [vendorDrawerCode, setVendorDrawerCode] = useState<string | null>(null);

  // ── Load data ────────────────────────────────────────────────

  const loadBills = useCallback((archived: boolean) => {
    setLoading(true);
    apiClient
      .get<{ bills: Record<string, unknown>[] }>(`/bills${archived ? "?archived=true" : ""}`)
      .then((r) => setBills((r.data.bills || []).map((b) => normalizeId(b) as unknown as Bill)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadBills(showArchived);
  }, [loadBills, showArchived]);

  useEffect(() => {
    apiClient.get<{ projects: Record<string, unknown>[] }>("/projects")
      .then((r) => setProjects((r.data.projects || []).map((p) => normalizeId(p) as unknown as ProjectOpt)))
      .catch(() => {});
    apiClient.get<{ contractors: Record<string, unknown>[] }>("/contractors")
      .then((r) => setContractors((r.data.contractors || []).map((c) => normalizeId(c) as unknown as Contractor)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!newProjectId || !newContractorId) { setWoList([]); return; }
    const c = contractors.find((x) => x.id === newContractorId);
    if (!c) return;
    apiClient.get<{ workOrders: Record<string, unknown>[] }>(`/work-orders?projectId=${newProjectId}`)
      .then((r) => {
        const all = (r.data.workOrders || []).map(normalizeWO);
        setWoList(all.filter((wo) => wo.vendorCode === c.vendorCode));
      })
      .catch(() => setWoList([]));
  }, [newProjectId, newContractorId, contractors]);

  // ── Derived ──────────────────────────────────────────────────

  const selectedContractor = useMemo(
    () => contractors.find((c) => c.id === newContractorId) || null,
    [contractors, newContractorId]
  );

  const draftBills             = useMemo(() => bills.filter((b) => b.status === "draft"), [bills]);
  const submittedBills         = useMemo(() => bills.filter((b) => b.status === "submitted" || b.status === "verified"), [bills]);
  const approvedBills          = useMemo(() => bills.filter((b) => b.status === "approved"), [bills]);
  const paymentInitiatedBills  = useMemo(() => bills.filter((b) => b.status === "payment-initiated"), [bills]);
  const holdBills              = useMemo(() => bills.filter((b) => b.status === "hold"), [bills]);
  const paidBills              = useMemo(() => bills.filter((b) => b.status === "paid"), [bills]);
  // Paid, but the mode/UTR/bank/amount paperwork hasn't been recorded yet — easy
  // to lose track of since it only surfaces once you open a specific bill.
  const paymentDetailsPendingBills = useMemo(() => bills.filter((b) => b.status === "paid" && !b.paymentDetails?.done), [bills]);
  const rejectedBills          = useMemo(() => bills.filter((b) => b.status === "rejected"), [bills]);

  const stats = useMemo(() => {
    const now = dayjs();
    const paidThisMonth = bills.filter((b) => b.status === "paid" && b.paymentDate && dayjs(b.paymentDate).isSame(now, "month"));
    return {
      paidThisMonthCount: paidThisMonth.length,
      paidThisMonthAmt:   paidThisMonth.reduce((s, b) => s + (b.paidAmount ?? netAfterAdvance(b)), 0),
    };
  }, [bills]);

  function matchesTab(b: Bill, tab: string): boolean {
    switch (tab) {
      case "draft":          return b.status === "draft";
      case "toVerify":       return b.status === "submitted" || b.status === "verified";
      case "toApprove":      return b.status === "approved";
      case "paymentPending": return b.status === "payment-initiated";
      case "hold":           return b.status === "hold";
      case "paid":           return b.status === "paid";
      case "paymentDetailsPending": return b.status === "paid" && !b.paymentDetails?.done;
      case "rejected":       return b.status === "rejected";
      default:               return true; // "all"
    }
  }

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        (b.billNo || "").toLowerCase().includes(q) ||
        (b.vendorName || "").toLowerCase().includes(q) ||
        (b.workOrderNo || "").toLowerCase().includes(q) ||
        (b.projectName || "").toLowerCase().includes(q) ||
        (b.generatedBy || "").toLowerCase().includes(q);
      const matchTab     = matchesTab(b, activeTab);
      const matchProject = !projectFilter || b.projectId === projectFilter;
      const matchVendor  = !vendorFilter || b.vendorCode === vendorFilter;
      const matchDate    = inDateRange(b.billDate, dateFrom, dateTo);
      return matchSearch && matchTab && matchProject && matchVendor && matchDate;
    });
  }, [bills, search, activeTab, projectFilter, vendorFilter, dateFrom, dateTo]);

  const tabs: TabDef[] = [
    { key: "all",            label: "All",             count: 0 },
    { key: "draft",          label: "Draft",           count: draftBills.length },
    { key: "toVerify",       label: "To Verify",       count: submittedBills.length },
    { key: "toApprove",      label: "To Approve",      count: approvedBills.length },
    { key: "paymentPending", label: "Payment Pending", count: paymentInitiatedBills.length },
    { key: "hold",           label: "Hold",            count: holdBills.length },
    { key: "paid",           label: "Paid",            count: paidBills.length },
    { key: "paymentDetailsPending", label: "Payment Details Pending", count: paymentDetailsPendingBills.length },
    { key: "rejected",       label: "Rejected",        count: rejectedBills.length },
  ];

  const totalLineAmount = useMemo(
    () => lineItems.reduce((s, li) => s + (li.amount || 0), 0),
    [lineItems]
  );

  const drawerBill = useMemo(
    () => (drawerBillId ? bills.find((b) => b.id === drawerBillId) || null : null),
    [bills, drawerBillId]
  );

  // Reset every action section's local state whenever the drawer is opened for
  // a bill, or the open bill's own stage changes underneath it (e.g. right
  // after a maker-confirm succeeds, so the checker section is ready to go
  // without needing to close and reopen the drawer).
  useEffect(() => {
    if (!drawerOpen || !drawerBill) return;
    setRejecting(false);
    setRejectReason("");
    setHolding(false);
    setHoldReason("");
    setMakerTallyDone(!!drawerBill.makerChecklist?.tallyEntryDone);
    setMakerNewItemsDone(!!drawerBill.makerChecklist?.newItemsAddedInTally);
    setMakerRemarks("");
    setCheckerRetention(drawerBill.retentionAmount ?? 0);
    setCheckerAdvance(drawerBill.advanceRecovery ?? 0);
    setCheckerTdsPercent(drawerBill.tdsPercent ?? 1);
    setCheckerTdsAmount(drawerBill.tdsAmount ?? 0);
    setCheckerRetentionReleased(drawerBill.retentionReleased ?? 0);
    setCheckerRetentionReleaseRemark(drawerBill.retentionReleaseRemark || "");
    setCheckerRemarks("");
    setApproverRemarks("");
    setPrepMode(drawerBill.paymentPreparation?.paymentMode || undefined);
    setPrepBankVerified(!!drawerBill.paymentPreparation?.checklist?.bankDetailsVerified);
    setPrepFundsAvailable(!!drawerBill.paymentPreparation?.checklist?.fundsAvailable);
    setPrepVoucherReady(!!drawerBill.paymentPreparation?.checklist?.voucherPrepared);
    setPrepRemark("");
    setPhysPrinted(false);
    setPhysAttachments(false);
    setPhysSigned(false);
    setPhysRemark("");
    setReleaseRemark("");

    if (drawerBill.workOrderId) {
      setDrawerWOCategory(undefined);
      apiClient.get<{ workOrder: Record<string, unknown> }>(`/work-orders/${drawerBill.workOrderId}`)
        .then((r) => setDrawerWOCategory((r.data.workOrder?.category as string) || ""))
        .catch(() => setDrawerWOCategory(undefined));
    } else {
      setDrawerWOCategory(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen, drawerBillId, drawerBill?.status, drawerBill?.physicalVerification?.done, drawerBill?.paymentPreparation?.done]);

  // ── Line item helpers ────────────────────────────────────────

  function updateLineItem(key: number, field: keyof LineItem, val: unknown) {
    setLineItems((prev) =>
      prev.map((li) => {
        if (li.key !== key) return li;
        const updated = { ...li, [field]: val };
        if (field === "billedQty" || field === "rate") {
          updated.amount = Math.round((Number(updated.billedQty) || 0) * (Number(updated.rate) || 0));
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
    const imported: LineItem[] = wo.scopeItems.map((si) => ({
      key: nextKey(),
      scopeItemId: si.id,
      description: si.description,
      unit: si.unit || "",
      plannedQty: si.plannedQty || 0,
      billedQty: 0,
      rate: si.rate || 0,
      amount: 0,
    }));
    setLineItems((prev) => [...prev.filter((li) => li.description.trim()), ...imported]);
    message.success(`${imported.length} scope items imported — enter quantities`);
  }

  // ── New Bill ─────────────────────────────────────────────────

  function openNewBill() {
    newForm.resetFields();
    setNewProjectId("");
    setNewContractorId("");
    setWoList([]);
    setLineItems([blankRow()]);
    setNewGstPercent(18);
    setIsCustomGst(false);
    setNewBillType("running");
    setNewRelType("NONE");
    setNewLinkedBillIds([]);
    setNewSelectedWOId("");
    setWoExistingBills([]);
    setNewOpen(true);
  }

  async function handleWOSelectForLinking(woId: string) {
    setNewSelectedWOId(woId);
    if (!woId) { setWoExistingBills([]); return; }
    try {
      const res = await apiClient.get<{ bills: Record<string, unknown>[] }>(`/bills/chain/${woId}`);
      const existing = (res.data.bills || []).map(b => normalizeId(b) as unknown as Bill);
      setWoExistingBills(existing.filter(b => b.status !== "rejected"));
    } catch { setWoExistingBills([]); }
  }

  async function handleSubmitBill() {
    const validItems = lineItems.filter((li) => li.description.trim() && li.billedQty > 0);
    if (validItems.length === 0) {
      message.error("Add at least one work item with a description and quantity > 0");
      return;
    }
    let values: Record<string, unknown>;
    try {
      values = await newForm.validateFields();
    } catch {
      return;
    }

    const project = projects.find((p) => p.id === newProjectId);
    const contractor = selectedContractor;

    const linkedBills = newLinkedBillIds.map(id => {
      const found = woExistingBills.find(b => b.id === id);
      return { billId: id, billNo: found?.billNo ?? id, relationshipType: newRelType };
    });

    const payload = {
      billDate:          dayjs(values.billDate as string).toISOString(),
      projectId:         newProjectId || undefined,
      projectName:       project?.name ?? "",
      vendorCode:        contractor?.vendorCode ?? "",
      vendorName:        contractor?.companyName ?? "",
      generatedBy:       values.generatedBy ?? "",
      contractorRefNo:   values.contractorRefNo ?? "",
      remarks:           values.remarks ?? "",
      gstPercent:        newGstPercent,
      tdsPercent:        0,
      billType:          newBillType,
      relationshipType:  linkedBills.length > 0 ? newRelType : "NONE",
      linkedBills:       linkedBills.length > 0 ? linkedBills : [],
      workOrderId:       newSelectedWOId || undefined,
      lineItems: validItems.map(({ key: _k, ...rest }) => ({
        ...rest,
        amount: rest.billedQty * rest.rate,
      })),
    };

    setNewSaving(true);
    try {
      const res = await apiClient.post<{ bill: Record<string, unknown> }>("/bills", payload);
      setBills((prev) => [normalizeId(res.data.bill) as unknown as Bill, ...prev]);
      message.success(`Bill ${res.data.bill.billNo} created — awaiting maker confirmation`);
      setNewOpen(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to create bill");
    } finally {
      setNewSaving(false);
    }
  }

  // ── Download / Print ─────────────────────────────────────────

  const downloadBill = useCallback(
    (bill: Bill, mode: 'pre' | 'post' = 'pre') => {
      const contractor = contractors.find((c) => c.vendorCode === bill.vendorCode) ?? null;
      printBill(bill, contractor, mode);
    },
    [contractors]
  );

  // ── Drawer open/close ─────────────────────────────────────────

  function openDrawer(bill: Bill) {
    setDrawerBillId(bill.id);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDrawerBillId(null);
  }

  function updateBillInList(updated: Bill) {
    setBills((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }

  // ── Work Order / Vendor quick-view (opened from a table row, without
  // leaving this page — accounts staff routinely need to cross-check both) ──
  function openWODrawer(workOrderId: string) {
    setWoDrawerId(workOrderId);
    setWoDrawerData(null);
    apiClient.get<{ workOrder: Record<string, unknown> }>(`/work-orders/${workOrderId}`)
      .then((r) => setWoDrawerData(r.data.workOrder ? normalizeFullWO(r.data.workOrder) : null))
      .catch(() => setWoDrawerData(null));
  }
  function closeWODrawer() { setWoDrawerId(null); setWoDrawerData(null); }

  function openVendorDrawer(vendorCode: string) {
    setVendorDrawerCode(vendorCode);
  }
  function closeVendorDrawer() { setVendorDrawerCode(null); }

  const vendorDrawerContractor = useMemo(
    () => (vendorDrawerCode ? contractors.find((c) => c.vendorCode === vendorDrawerCode) || null : null),
    [contractors, vendorDrawerCode]
  );

  // Every OTHER bill already loaded for this page against the same work order —
  // feeds WorkOrderDetailView's Billing Summary bar without a separate fetch.
  const woDrawerBills = useMemo(
    () => (woDrawerId ? bills.filter((b) => b.workOrderId === woDrawerId).map((b) => ({ status: b.status, amount: b.amount })) : []),
    [bills, woDrawerId]
  );

  // ── Stage actions (all fire from the single drawer) ───────────

  async function handleMakerConfirm() {
    if (!drawerBillId) return;
    setMakerSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/maker-confirm`, {
        makerChecklist: { tallyEntryDone: makerTallyDone, newItemsAddedInTally: makerNewItemsDone },
        remarks: makerRemarks || undefined,
      });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Confirmed — forwarded to checker");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to confirm");
    } finally {
      setMakerSaving(false);
    }
  }

  async function handleCheckerApprove() {
    if (!drawerBillId) return;
    setCheckerSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/checker-approve`, {
        retentionAmount: checkerRetention,
        advanceRecovery: checkerAdvance,
        tdsPercent: checkerTdsPercent,
        tdsAmount:  checkerTdsAmount,
        retentionReleased:      checkerRetentionReleased,
        retentionReleaseRemark: checkerRetentionReleaseRemark || "",
        remarks: checkerRemarks || undefined,
      });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Checker approved — ready for final sign-off");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Check failed");
    } finally {
      setCheckerSaving(false);
    }
  }

  async function handleApproverInitiate() {
    if (!drawerBillId) return;
    setApproverSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/approver-initiate`, {
        remarks: approverRemarks || undefined,
      });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Payment initiated — pending payment preparation and physical verification");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to initiate payment");
    } finally {
      setApproverSaving(false);
    }
  }

  async function handleHoldConfirm() {
    if (!drawerBillId || !holdReason.trim()) return;
    setHoldSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/hold`, { reason: holdReason });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Payment held");
      setHolding(false);
      setHoldReason("");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to hold payment");
    } finally {
      setHoldSaving(false);
    }
  }

  async function handleReleaseHold() {
    if (!drawerBillId) return;
    setReleaseHoldSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/release-hold`, {});
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Hold released — back with the approver");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to release hold");
    } finally {
      setReleaseHoldSaving(false);
    }
  }

  async function handlePreparePayment() {
    if (!drawerBillId || !prepMode) return;
    setPrepSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/prepare-payment`, {
        paymentMode: prepMode,
        checklist: { bankDetailsVerified: prepBankVerified, fundsAvailable: prepFundsAvailable, voucherPrepared: prepVoucherReady },
        remark: prepRemark || undefined,
      });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Payment preparation recorded — ready for physical verification");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to record payment preparation");
    } finally {
      setPrepSaving(false);
    }
  }

  async function handlePhysVerifyConfirm() {
    if (!drawerBillId) return;
    setPhysSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/physical-verify`, { remark: physRemark });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Physical verification recorded — ready for release");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to record verification");
    } finally {
      setPhysSaving(false);
    }
  }

  async function handleReleaseConfirm() {
    if (!drawerBillId) return;
    setReleaseSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/release`, {
        remarks: releaseRemark || undefined,
      });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Marked as paid — add payment details once the bank statement arrives");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to mark as paid");
    } finally {
      setReleaseSaving(false);
    }
  }

  async function handleRejectConfirm() {
    if (!drawerBillId || !rejectReason.trim()) return;
    setRejectSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/reject`, { reason: rejectReason });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Bill rejected");
      setRejecting(false);
      setRejectReason("");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to reject");
    } finally {
      setRejectSaving(false);
    }
  }

  // ── Archive / Unarchive ──────────────────────────────────────────

  async function archiveOne(bill: Bill) {
    try {
      await apiClient.patch(`/bills/${bill.id}/${showArchived ? "unarchive" : "archive"}`);
      message.success(showArchived ? `${bill.billNo} unarchived` : `${bill.billNo} archived`);
      loadBills(showArchived);
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message || "Action failed");
    }
  }

  // ── Table columns ──────────────────────────────────────────────

  const columns = [
    {
      title: "Bill No.",
      dataIndex: "billNo",
      width: 120,
      render: (v: string) => <span style={{ fontFamily: "monospace", color: "#2563EB", fontWeight: 700 }}>{v}</span>,
    },
    {
      title: "Work Order",
      dataIndex: "workOrderNo",
      width: 140,
      render: (v?: string, r?: Bill) => v && r?.workOrderId
        ? (
          <Tag
            style={{ fontFamily: "monospace", background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", borderRadius: 6, cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); openWODrawer(r.workOrderId!); }}
          >
            {v}
          </Tag>
        )
        : <span style={{ color: "#C0C4CC" }}>—</span>,
    },
    {
      title: "Vendor",
      dataIndex: "vendorName",
      width: 180,
      render: (v?: string, r?: Bill) => v && r?.vendorCode
        ? (
          <span
            style={{ color: "#2563EB", cursor: "pointer", textDecoration: "underline", textDecorationColor: "transparent" }}
            onClick={(e) => { e.stopPropagation(); openVendorDrawer(r.vendorCode!); }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecorationColor = "#2563EB"; }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecorationColor = "transparent"; }}
          >
            {v}
          </span>
        )
        : (v || <span style={{ color: "#C0C4CC" }}>—</span>),
    },
    {
      title: "Project",
      dataIndex: "projectName",
      width: 170,
      render: (v?: string) => v || <span style={{ color: "#C0C4CC" }}>—</span>,
    },
    {
      title: "Amount",
      dataIndex: "amount",
      width: 130,
      align: "right" as const,
      render: (_: number, r: Bill) => <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{fmt(netAfterAdvance(r))}</span>,
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 150,
      render: (v: BillStatus) => <StatusTag status={v} />,
    },
    {
      title: "Date",
      dataIndex: "billDate",
      width: 110,
      render: (v: string) => (v ? dayjs(v).format("DD MMM YYYY") : "—"),
    },
    {
      title: "",
      key: "actions",
      width: 56,
      render: (_: unknown, r: Bill) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Popconfirm
            title={showArchived ? `Unarchive ${r.billNo}?` : `Archive ${r.billNo}?`}
            description={showArchived ? "It will reappear in the normal bill list." : "It will be hidden from the normal bill list, but not deleted."}
            onConfirm={() => archiveOne(r)}
          >
            <Button type="text" size="small" icon={<InboxOutlined />} style={{ color: "#9CA3AF" }} />
          </Popconfirm>
        </div>
      ),
    },
  ];

  // ── Drawer: contextual action section (per stage + permission) ───

  function renderActionSection(bill: Bill): ReactNode {
    if (rejecting) {
      const sendBackTo = bill.status === "approved" ? "Checker" : bill.status === "submitted" || bill.status === "verified" ? "Maker" : bill.status === "payment-initiated" ? "Approver" : null;
      return (
        <div style={{ ...sectionPanelStyle, background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#DC2626", marginBottom: 8 }}>
            {sendBackTo ? `Send Back to ${sendBackTo}` : "Reject Bill"}
          </div>
          <Input.TextArea
            rows={3}
            placeholder="Explain what needs to be corrected…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Button danger type="primary" loading={rejectSaving} disabled={!rejectReason.trim()} onClick={handleRejectConfirm}>
              {sendBackTo ? "Confirm Send Back" : "Confirm Rejection"}
            </Button>
            <Button onClick={() => { setRejecting(false); setRejectReason(""); }}>Cancel</Button>
          </div>
        </div>
      );
    }
    if (holding) {
      return (
        <div style={{ ...sectionPanelStyle, background: "#F5F3FF", border: "1px solid #DDD6FE" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#9333EA", marginBottom: 8 }}>Hold Payment</div>
          <Input.TextArea
            rows={3}
            placeholder="Explain why this payment is being held…"
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Button type="primary" style={{ background: "#9333EA", borderColor: "#9333EA" }} loading={holdSaving} disabled={!holdReason.trim()} onClick={handleHoldConfirm}>
              Confirm Hold
            </Button>
            <Button onClick={() => { setHolding(false); setHoldReason(""); }}>Cancel</Button>
          </div>
        </div>
      );
    }

    switch (bill.status) {
      case "draft": {
        if (!canMaker) return <MutedNote text="Awaiting a maker to confirm this bill." />;
        const bothChecked = makerTallyDone && makerNewItemsDone;
        return (
          <div style={sectionPanelStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#FF7A00", marginBottom: 8 }}>Confirm as Maker</div>
            <Space direction="vertical" size={8} style={{ width: "100%", marginBottom: 10 }}>
              <Checkbox checked={makerTallyDone} onChange={(e) => setMakerTallyDone(e.target.checked)}>Tally Entry Done</Checkbox>
              <Checkbox checked={makerNewItemsDone} onChange={(e) => setMakerNewItemsDone(e.target.checked)}>New Items Added in Tally</Checkbox>
            </Space>
            {!bothChecked && <div style={{ fontSize: 11.5, color: "#d97706", marginBottom: 8 }}>Both boxes must be checked before confirming.</div>}
            <Input.TextArea rows={2} placeholder="Remarks (optional)" value={makerRemarks} onChange={(e) => setMakerRemarks(e.target.value)} />
          </div>
        );
      }

      case "submitted":
      case "verified": {
        if (!canChecker) return <MutedNote text="Awaiting a checker to review this bill." />;
        const guard = sameActor(user, bill.makerBy) ? "You confirmed this bill as maker — a different user must check it." : undefined;
        return (
          <div style={sectionPanelStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#16a85a", marginBottom: 8 }}>Checker Review</div>
            {guard && <div style={{ fontSize: 12, color: "#d97706", marginBottom: 8 }}>⚠ {guard}</div>}
            <Row gutter={12}>
              <Col span={12}>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Hold / Retention (₹)</div>
                <InputNumber style={{ width: "100%" }} min={0} value={checkerRetention} onChange={(v) => setCheckerRetention(Number(v) || 0)} />
              </Col>
              <Col span={12}>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Advance Recovery (₹)</div>
                <InputNumber style={{ width: "100%" }} min={0} value={checkerAdvance} onChange={(v) => setCheckerAdvance(Number(v) || 0)} />
              </Col>
            </Row>
            <Row gutter={12} style={{ marginTop: 10 }}>
              <Col span={12}>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>TDS %</div>
                <InputNumber style={{ width: "100%" }} min={0} max={100} value={checkerTdsPercent} onChange={(v) => setCheckerTdsPercent(Number(v) || 0)} />
              </Col>
              <Col span={12}>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>TDS Amount to Deduct (₹)</div>
                <InputNumber style={{ width: "100%" }} min={0} value={checkerTdsAmount} onChange={(v) => setCheckerTdsAmount(Number(v) || 0)} />
              </Col>
            </Row>
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "12px 14px", marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", marginBottom: 10 }}>
                🔓 Hold / Retention Release (optional)
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
                If this bill also settles a previously withheld retention, enter the amount below.
              </div>
              <Row gutter={12}>
                <Col span={12}>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Hold Amount Released (₹)</div>
                  <InputNumber style={{ width: "100%" }} min={0} value={checkerRetentionReleased} onChange={(v) => setCheckerRetentionReleased(Number(v) || 0)} />
                </Col>
                <Col span={12}>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Remark (e.g. RA-0010 DLP)</div>
                  <Input placeholder="Which bill / period" value={checkerRetentionReleaseRemark} onChange={(e) => setCheckerRetentionReleaseRemark(e.target.value)} />
                </Col>
              </Row>
            </div>
            <Input.TextArea rows={2} style={{ marginTop: 8 }} placeholder="Remarks (optional)" value={checkerRemarks} onChange={(e) => setCheckerRemarks(e.target.value)} />
          </div>
        );
      }

      case "hold":
        return (
          <div style={{ marginTop: 16 }}>
            <Alert
              type="warning"
              showIcon
              message={<span><strong>Payment held:</strong> {bill.holdReason}{bill.holdBy?.name ? ` — ${bill.holdBy.name}` : ""}{bill.holdAt ? ` · ${dayjs(bill.holdAt).format("DD MMM YYYY")}` : ""}</span>}
            />
            {!canApprover && <MutedNote text="Only an approver can release this hold." />}
          </div>
        );

      case "approved": {
        if (!canApprover) return <MutedNote text="Awaiting an approver to sign off on this bill." />;
        const guard = sameActor(user, bill.checkerBy) ? "You checked this bill — a different user must give final approval." : undefined;
        return (
          <div style={sectionPanelStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#3730a3", marginBottom: 8 }}>Approver Review</div>
            {guard && <div style={{ fontSize: 12, color: "#d97706", marginBottom: 8 }}>⚠ {guard}</div>}
            <Descriptions column={2} size="small" colon={false} style={{ marginBottom: 8 }}>
              <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Hold / Retention</span>}>{fmt(bill.retentionAmount ?? 0)}</Descriptions.Item>
              <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Advance Recovery</span>}>{fmt(bill.advanceRecovery ?? 0)}</Descriptions.Item>
              <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>TDS %</span>}>{bill.tdsPercent ?? 0}%</Descriptions.Item>
              <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>TDS Amount</span>}>{fmt(bill.tdsAmount ?? 0)}</Descriptions.Item>
              {(bill.retentionReleased ?? 0) > 0 && (
                <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Hold Released</span>} span={2}>
                  {fmt(bill.retentionReleased ?? 0)}{bill.retentionReleaseRemark ? ` — ${bill.retentionReleaseRemark}` : ""}
                </Descriptions.Item>
              )}
            </Descriptions>
            <Input.TextArea rows={2} placeholder="Remarks (optional)" value={approverRemarks} onChange={(e) => setApproverRemarks(e.target.value)} />
          </div>
        );
      }

      case "payment-initiated": {
        const sub = paymentSubStage(bill);
        if (sub === "prepare") {
          if (!canPaymentMaker) return <MutedNote text="Awaiting payment preparation (mode + readiness checklist)." />;
          const allChecked = prepMode && prepBankVerified && prepFundsAvailable && prepVoucherReady;
          return (
            <div style={sectionPanelStyle}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#0d9488", marginBottom: 8 }}>Payment Maker</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Payment Mode</div>
              <Select style={{ width: "100%", marginBottom: 10 }} placeholder="Select payment mode" options={PAYMENT_MODE_OPTIONS} value={prepMode} onChange={setPrepMode} />
              <Space direction="vertical" size={8} style={{ width: "100%", marginBottom: 10 }}>
                <Checkbox checked={prepBankVerified} onChange={(e) => setPrepBankVerified(e.target.checked)}>Vendor bank details verified</Checkbox>
                <Checkbox checked={prepFundsAvailable} onChange={(e) => setPrepFundsAvailable(e.target.checked)}>Funds available confirmed</Checkbox>
                <Checkbox checked={prepVoucherReady} onChange={(e) => setPrepVoucherReady(e.target.checked)}>Payment voucher / instruction prepared</Checkbox>
              </Space>
              {!allChecked && <div style={{ fontSize: 11.5, color: "#d97706", marginBottom: 8 }}>Select a mode and check all three before proceeding.</div>}
              <Input.TextArea rows={2} placeholder="Remark (optional)" value={prepRemark} onChange={(e) => setPrepRemark(e.target.value)} />
            </div>
          );
        }
        if (sub === "verify") {
          if (!canPhysicalVerify) return <MutedNote text="Awaiting physical verification." />;
          return (
            <div style={sectionPanelStyle}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#d97706", marginBottom: 8 }}>Physical Verification</div>
              <div style={{ fontSize: 12, color: "#5a6278", marginBottom: 10 }}>
                Confirm the physical checkpoint before this payment can be released:
              </div>
              <Space direction="vertical" size={8} style={{ width: "100%", marginBottom: 10 }}>
                <Checkbox checked={physPrinted} onChange={(e) => setPhysPrinted(e.target.checked)}>Bill printed</Checkbox>
                <Checkbox checked={physAttachments} onChange={(e) => setPhysAttachments(e.target.checked)}>Work order attachments reviewed</Checkbox>
                <Checkbox checked={physSigned} onChange={(e) => setPhysSigned(e.target.checked)}>Physically (wet-signature) signed off</Checkbox>
              </Space>
              <Input.TextArea rows={2} placeholder="Remark (optional)" value={physRemark} onChange={(e) => setPhysRemark(e.target.value)} />
            </div>
          );
        }
        if (!canRelease) return <MutedNote text="Physically verified — awaiting payment release." />;
        return (
          <div style={sectionPanelStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#7c3aed", marginBottom: 8 }}>Mark as Paid</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>
              Confirms the payment has physically gone out. The mode/UTR/bank/amount paperwork gets recorded afterward, once the bank statement catches up — see Payment Details.
            </div>
            <Input.TextArea rows={2} placeholder="Remark (optional)" value={releaseRemark} onChange={(e) => setReleaseRemark(e.target.value)} />
          </div>
        );
      }

      case "paid":
        return (
          <>
            <PaidPanel bill={bill} isOwner={isOwner} onUpdated={updateBillInList} />
            <PaymentDetailsPanel bill={bill} canRelease={canPaymentDetails} onUpdated={updateBillInList} />
          </>
        );

      case "rejected":
        return bill.rejectReason ? (
          <Alert
            style={{ marginTop: 16 }}
            type="error"
            showIcon
            message={<span><strong>Rejection Reason:</strong> {bill.rejectReason}{bill.rejectedBy?.name ? ` — ${bill.rejectedBy.name}` : ""}</span>}
          />
        ) : null;

      default:
        return null;
    }
  }

  function footerPrimary(bill: Bill): { label: string; color: string; onClick: () => void; loading: boolean; disabled?: boolean; tooltip?: string } | null {
    switch (bill.status) {
      case "draft":
        return canMaker ? { label: "Confirm", color: "#FF7A00", onClick: handleMakerConfirm, loading: makerSaving, disabled: !(makerTallyDone && makerNewItemsDone) } : null;
      case "submitted":
      case "verified": {
        if (!canChecker) return null;
        const guard = sameActor(user, bill.makerBy) ? "You confirmed this bill as maker — a different user must check it." : undefined;
        return { label: "Verify & Approve", color: "#16a85a", onClick: handleCheckerApprove, loading: checkerSaving, disabled: !!guard, tooltip: guard };
      }
      case "hold":
        return canApprover ? { label: "Release Hold", color: "#9333EA", onClick: handleReleaseHold, loading: releaseHoldSaving } : null;
      case "approved": {
        if (!canApprover) return null;
        const guard = sameActor(user, bill.checkerBy) ? "You checked this bill — a different user must give final approval." : undefined;
        return { label: "Approve & Forward", color: "#3730a3", onClick: handleApproverInitiate, loading: approverSaving, disabled: !!guard, tooltip: guard };
      }
      case "payment-initiated": {
        const sub = paymentSubStage(bill);
        if (sub === "prepare") {
          if (!canPaymentMaker) return null;
          return { label: "Confirm Payment Preparation", color: "#0d9488", onClick: handlePreparePayment, loading: prepSaving, disabled: !(prepMode && prepBankVerified && prepFundsAvailable && prepVoucherReady) };
        }
        if (sub === "verify") {
          if (!canPhysicalVerify) return null;
          return { label: "Mark Physically Verified", color: "#d97706", onClick: handlePhysVerifyConfirm, loading: physSaving, disabled: !(physPrinted && physAttachments && physSigned) };
        }
        if (!canRelease) return null;
        return { label: "Mark as Paid", color: "#7c3aed", onClick: handleReleaseConfirm, loading: releaseSaving };
      }
      default:
        return null;
    }
  }

  // ── Render ───────────────────────────────────────────────────────

  const primaryAction = drawerBill ? footerPrimary(drawerBill) : null;

  return (
    <PageShell
      title="Accounts Payment"
      description="Verify bills and process vendor payments"
      cta={
        canCreate ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={openNewBill}
            style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
          >
            New Bill
          </Button>
        ) : undefined
      }
    >
      <style>{`
        .ap-table .ant-table-thead > tr > th { background: #F9FAFB !important; font-weight: 600; color: #6B7280; border-bottom: 1px solid #E5E7EB !important; }
        .ap-table .ant-table-tbody > tr > td { border-bottom: 1px solid #F1F2F4; cursor: pointer; }
        .ap-table .ant-table-tbody > tr:hover > td { background: #F9FAFB !important; }
      `}</style>

      {/* Stat cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 22 }}>
        <Col xs={12} sm={8} md={3}>
          <StatCard label="Draft" value={draftBills.length} sub="Awaiting maker" icon={<FileAddOutlined />} accent="#6B7280" />
        </Col>
        <Col xs={12} sm={8} md={3}>
          <StatCard label="To Verify" value={submittedBills.length} sub="Awaiting checker" icon={<SafetyCertificateOutlined />} accent="#2563EB" />
        </Col>
        <Col xs={12} sm={8} md={3}>
          <StatCard label="To Approve" value={approvedBills.length} sub="Awaiting approver" icon={<CheckCircleOutlined />} accent="#7C3AED" />
        </Col>
        <Col xs={12} sm={8} md={3}>
          <StatCard label="Payment Pending" value={paymentInitiatedBills.length} sub="Prep + verify + release" icon={<ClockCircleOutlined />} accent="#D97706" />
        </Col>
        <Col xs={12} sm={8} md={3}>
          <StatCard label="Hold" value={holdBills.length} sub="Paused by approver" icon={<PauseCircleOutlined />} accent="#9333EA" />
        </Col>
        <Col xs={12} sm={8} md={3}>
          <StatCard label="Paid" value={stats.paidThisMonthCount} sub={`${fmt(stats.paidThisMonthAmt)} this month`} icon={<DollarOutlined />} accent="#16A34A" />
        </Col>
        <Col xs={12} sm={8} md={3}>
          <StatCard
            label="Payment Details Pending"
            value={paymentDetailsPendingBills.length}
            sub="Paid, paperwork not logged"
            icon={<FileTextOutlined />}
            accent="#1D4ED8"
            onClick={() => setActiveTab("paymentDetailsPending")}
          />
        </Col>
        <Col xs={12} sm={8} md={3}>
          <StatCard label="Rejected" value={rejectedBills.length} sub="Bills rejected" icon={<CloseCircleOutlined />} accent="#DC2626" />
        </Col>
      </Row>

      <PillTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Filter row */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: "#9CA3AF" }} />}
          placeholder="Search by bill no, vendor, work order, project…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 300, borderRadius: 8 }}
        />
        <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
        <Select
          allowClear
          showSearch
          placeholder="All Projects"
          value={projectFilter}
          onChange={setProjectFilter}
          options={selectableProjects(projects).map((p) => ({ label: p.name, value: p.id }))}
          filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
          style={{ width: 200 }}
        />
        <Select
          allowClear
          showSearch
          placeholder="All Vendors"
          value={vendorFilter}
          onChange={setVendorFilter}
          options={contractors.map((c) => ({ label: `${vendorLabel(c.companyName, c.shortCode)} (${c.vendorCode})`, value: c.vendorCode }))}
          filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
          style={{ width: 220 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#5a6278" }}>
          <Switch size="small" checked={showArchived} onChange={setShowArchived} />
          Show Archived
        </label>
        <span style={{ marginLeft: "auto", color: "#9ba3b8", fontSize: 12 }}>
          {filteredBills.length} bill{filteredBills.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="ap-table" style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
        <Spin spinning={loading}>
          <Table
            rowKey="id"
            dataSource={filteredBills}
            columns={columns}
            onRow={(record) => ({ onClick: () => openDrawer(record) })}
            scroll={{ x: 1300 }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{
              emptyText: loading ? " " : (
                <div style={{ padding: "48px", textAlign: "center", color: "#9ba3b8" }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🧾</div>
                  <div style={{ fontWeight: 700, color: "#5a6278", fontSize: 15 }}>No bills found</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Click "New Bill" to generate the first bill.</div>
                </div>
              ),
            }}
          />
        </Spin>
      </div>

      {/* ── The one shared Bill Detail Drawer ─────────────────────── */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        placement="right"
        width={960}
        destroyOnClose
        title={
          drawerBill && (
            <div>
              <span style={{ fontFamily: "monospace", color: "#2563EB", fontWeight: 800, fontSize: 16 }}>{drawerBill.billNo}</span>
              <span style={{ marginLeft: 12 }}><StatusTag status={drawerBill.status} /></span>
              <div style={{ fontSize: 12, color: "#9ba3b8", fontWeight: 400, marginTop: 4 }}>
                {drawerBill.vendorName}
                {drawerBill.workOrderNo ? ` · ${drawerBill.workOrderNo}` : ""}
                {" · "}{dayjs(drawerBill.billDate).format("DD MMM YYYY")}
              </div>
            </div>
          )
        }
        footer={
          drawerBill && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Button icon={<PrinterOutlined />} onClick={() => downloadBill(drawerBill, drawerBill.status === "paid" ? "post" : "pre")}>
                Print
              </Button>
              <div style={{ display: "flex", gap: 8 }}>
                {!rejecting && !holding && drawerBill.status === "approved" && canApprover && (
                  <Button style={{ color: "#9333EA", borderColor: "#9333EA" }} onClick={() => setHolding(true)}>Hold Payment</Button>
                )}
                {!rejecting && !holding && canRejectAny && !["paid", "rejected", "hold"].includes(drawerBill.status) && (
                  <Button danger icon={<CloseCircleOutlined />} onClick={() => setRejecting(true)}>
                    {drawerBill.status === "draft" ? "Reject" : "Send Back"}
                  </Button>
                )}
                {!rejecting && !holding && primaryAction && (
                  <Tooltip title={primaryAction.tooltip}>
                    <Button
                      type="primary"
                      style={{ background: primaryAction.color, borderColor: primaryAction.color }}
                      loading={primaryAction.loading}
                      disabled={primaryAction.disabled}
                      onClick={primaryAction.onClick}
                    >
                      {primaryAction.label}
                    </Button>
                  </Tooltip>
                )}
              </div>
            </div>
          )
        }
      >
        {drawerBill && (
          <>
            <Row gutter={16}>
              <Col span={12}>
                <InfoCard title="Bill" accent="#FF7A00">
                  <InfoRow label="Bill No" value={drawerBill.billNo} mono />
                  <InfoRow label="Vendor" value={drawerBill.vendorName || "—"} />
                  <InfoRow label="Amount" value={fmt(netAfterAdvance(drawerBill))} mono bold />
                  <InfoRow label="Bill Date" value={dayjs(drawerBill.billDate).format("DD MMM YYYY")} />
                  <InfoRow label="Project" value={drawerBill.projectName || "—"} />
                </InfoCard>
              </Col>
              <Col span={12}>
                <InfoCard title="Work Order" accent="#2563EB">
                  <InfoRow label="WO No" value={drawerBill.workOrderNo || "—"} mono />
                  <InfoRow label="Category" value={drawerWOCategory || "—"} />
                  {drawerBill.workOrderId && (
                    <Button
                      type="link"
                      style={{ padding: 0, marginTop: 8, height: "auto" }}
                      onClick={() => navigate(`/work-items/${drawerBill.workOrderId}`)}
                    >
                      View Work Order <ArrowRightOutlined />
                    </Button>
                  )}
                </InfoCard>
              </Col>
            </Row>

            <div className="ap-stepper" style={{ marginTop: 22, marginBottom: 6 }}>
              <style>{`
                .ap-stepper .ant-steps-item-title,
                .ap-stepper .ant-steps-item-description {
                  word-break: keep-all;
                  overflow-wrap: normal;
                  white-space: normal;
                }
              `}</style>
              <Steps size="small" items={buildSteps(drawerBill)} />
            </div>

            <BillHistoryTimeline history={drawerBill.approvalHistory || []} />

            {/* Bill Relationship Chain */}
            {(drawerBill.billType || drawerBill.linkedBills?.length || drawerBill.supersededBy) && (
              <div style={{ border: "1px solid #e4e7ee", borderRadius: 8, padding: "10px 14px", marginTop: 16, background: "#fafbff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#5a6278", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Billing Chain</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  {drawerBill.billType && (
                    <div>
                      <span style={{ fontSize: 11, color: "#9ba3b8" }}>Type: </span>
                      <Tag style={{ fontSize: 11, color: BILL_TYPE_CFG[drawerBill.billType]?.color || "#2563eb", borderColor: BILL_TYPE_CFG[drawerBill.billType]?.color || "#2563eb", background: `${BILL_TYPE_CFG[drawerBill.billType]?.color || "#2563eb"}10` }}>
                        {BILL_TYPE_CFG[drawerBill.billType]?.label || drawerBill.billType}
                      </Tag>
                    </div>
                  )}
                  {drawerBill.billingCycle && (
                    <div><span style={{ fontSize: 11, color: "#9ba3b8" }}>Cycle: </span><Tag>#{drawerBill.billingCycle}</Tag></div>
                  )}
                  {drawerBill.isActive === false && drawerBill.supersededBy && (
                    <div style={{ color: "#7c3aed", fontSize: 12, fontWeight: 600 }}>
                      ↩ Superseded by <span style={{ fontFamily: "monospace" }}>{drawerBill.supersededBy.billNo}</span>
                    </div>
                  )}
                  {drawerBill.linkedBills && drawerBill.linkedBills.length > 0 && (
                    <div>
                      <span style={{ fontSize: 11, color: "#9ba3b8" }}>Links: </span>
                      {drawerBill.linkedBills.map((l, i) => (
                        <span key={i} style={{ marginLeft: 4 }}>
                          <Tag color="blue" style={{ fontFamily: "monospace", fontSize: 11 }}>{l.billNo}</Tag>
                          <span style={{ fontSize: 10, color: "#7c3aed" }}>{l.relationshipType}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action section — the only place any stage action happens */}
            {renderActionSection(drawerBill)}

            {/* Line Items */}
            <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1f2e", marginTop: 22, marginBottom: 10 }}>Line Items</div>
            <div style={{ overflowX: "auto", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f5f6f8" }}>
                    {["Description", "Unit", "Qty", "Rate (₹)", "Amount"].map((h) => (
                      <th key={h} style={{ padding: "8px 10px", fontWeight: 700, color: "#5a6278", textAlign: "right", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(drawerBill.lineItems || []).map((li, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f5f6f8" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600, color: "#1a1f2e" }}>
                        {li.description}
                        {li.remarks && <div style={{ fontSize: 11, fontWeight: 400, color: "#d97706", marginTop: 2 }}>📌 {li.remarks}</div>}
                        {li.progressRemarks && <div style={{ fontSize: 11, fontWeight: 400, color: "#2563eb", marginTop: 2 }}>👷 {li.progressRemarks}</div>}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#9ba3b8" }}>{li.unit || "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#FF7A00" }}>
                        {(li.billedQty || 0).toLocaleString("en-IN")}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace" }}>
                        {(li.rate || 0).toLocaleString("en-IN")}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#16a85a" }}>
                        {fmt(li.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: "#f5f6f8", fontWeight: 700 }}>
                    <td colSpan={4} style={{ padding: "8px 10px", textAlign: "right", color: "#5a6278" }}>Total Billed Amount</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", color: "#FF7A00", fontSize: 14 }}>
                      {fmt(drawerBill.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Financial summary */}
            {(() => {
              const bill = drawerBill;
              const gross    = bill.amount || 0;
              const gstPct   = bill.gstPercent ?? 0;
              const gstAmt   = Math.round(gross * gstPct / 100);
              const retAmt   = bill.retentionAmount ?? 0;
              const retPct   = bill.retentionPercent ?? 0;
              const advRec   = bill.advanceRecovery ?? 0;
              const netPay   = gross + gstAmt - retAmt;
              const paid     = bill.paidAmount;
              const retRel   = bill.retentionReleased ?? 0;
              const billPortion = paid != null ? Math.max(0, paid - retRel) : null;
              const tdsAmt = billPortion != null ? Math.max(0, Math.round(netPay - advRec - billPortion)) : 0;

              type SummaryRow = { label: string; value: string; color: string; bold?: boolean; borderTop?: boolean; bg?: string };
              const rows: SummaryRow[] = [
                { label: "Gross Amount", value: fmt(gross), color: "#1a1f2e" },
              ];
              if (gstAmt > 0) rows.push({ label: `GST @ ${gstPct}%`, value: `+ ${fmt(gstAmt)}`, color: "#16a85a" });
              if (retAmt > 0) rows.push({ label: `Hold / Retention${retPct > 0 ? ` @ ${retPct}%` : ""}`, value: `− ${fmt(retAmt)}`, color: "#e03b3b" });
              rows.push({ label: "NET PAYABLE", value: fmt(netPay), color: "#7c3aed", bold: true, borderTop: true });
              if (advRec > 0) rows.push({ label: "Less: Advance Recovery", value: `− ${fmt(advRec)}`, color: "#d97706" });
              if (tdsAmt > 0) rows.push({ label: `Less: TDS Deducted${bill.tdsPercent ? ` (${bill.tdsPercent}%)` : ""}`, value: `− ${fmt(tdsAmt)}`, color: "#dc2626" });
              if (retRel > 0) rows.push({ label: `Hold Released${bill.retentionReleaseRemark ? ` (${bill.retentionReleaseRemark})` : ""}`, value: `+ ${fmt(retRel)}`, color: "#0369a1", bold: false });
              if (paid != null) rows.push({ label: "ACTUALLY PAID", value: fmt(paid), color: "#16a85a", bold: true, borderTop: true, bg: "#f0fdf4" });
              return (
                <div style={{ border: "1px solid #e4e7ee", borderRadius: 8, overflow: "hidden", fontFamily: "monospace", fontSize: 13, marginBottom: 16 }}>
                  <div style={{ background: "#f5f6f8", padding: "8px 14px", fontWeight: 700, fontSize: 11, color: "#5a6278", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Financial Summary
                  </div>
                  <div style={{ padding: "8px 14px" }}>
                    {rows.map((r, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: r.borderTop ? "2px solid #e4e7ee" : undefined, marginTop: r.borderTop ? 4 : 0, background: r.bg, color: r.color, fontWeight: r.bold ? 700 : 400, fontSize: r.bold ? 14 : 13 }}>
                        <span>{r.label}</span><span>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {drawerBill.remarks && (
              <>
                <Divider />
                <div style={{ color: "#5a6278", fontSize: 13 }}><strong>Remarks:</strong> {drawerBill.remarks}</div>
              </>
            )}
          </>
        )}
      </Drawer>

      {/* ── New Bill Drawer ───────────────────────────────────────── */}
      <Drawer
        open={newOpen}
        onClose={() => setNewOpen(false)}
        placement="right"
        width={860}
        title={
          <Space>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>New Bill</div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                Select project → contractor → add work items → submit — lands in Draft, awaiting maker confirmation
              </div>
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button
              size="large"
              type="primary"
              loading={newSaving}
              onClick={handleSubmitBill}
              style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
            >
              Save as Draft
            </Button>
          </div>
        }
        destroyOnClose
      >
        {/* Step 1 — Project, Contractor, Date */}
        <div style={{ background: "#f5f6f8", borderRadius: 8, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1f2e", marginBottom: 12 }}>
            Bill Information
          </div>
          <Form form={newForm} layout="vertical">
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="Site / Project" name="projectId">
                  <Select
                    showSearch
                    allowClear
                    placeholder="Select project…"
                    style={{ width: "100%" }}
                    onChange={(v) => { setNewProjectId(v || ""); setWoList([]); }}
                    filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                    options={selectableProjects(projects).map((p) => ({ value: p.id, label: `${p.code ? p.code + " — " : ""}${p.name}` }))}
                  />
                </Form.Item>
              </Col>
              <Col span={10}>
                <Form.Item label="Contractor *" name="contractorId" rules={[{ required: true, message: "Select a contractor" }]}>
                  <Select
                    showSearch
                    placeholder="Search by name or vendor code…"
                    style={{ width: "100%" }}
                    onChange={(v) => setNewContractorId(v || "")}
                    filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                    options={contractors.map((c) => ({
                      value: c.id,
                      label: `${vendorLabel(c.companyName, c.shortCode)}  (${c.vendorCode})`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="Vendor Code">
                  <Input
                    value={selectedContractor?.vendorCode || ""}
                    disabled
                    style={{ background: "var(--nx-white)", color: "#FF7A00", fontWeight: 700, fontFamily: "monospace" }}
                    placeholder="Auto-filled"
                  />
                </Form.Item>
              </Col>
            </Row>

            {selectedContractor && (
              <div style={{ background: "var(--nx-white)", borderRadius: 6, border: "1px solid #e4e7ee", padding: "10px 12px", marginBottom: 12, fontSize: 12 }}>
                <Row gutter={16}>
                  <Col span={6}>
                    <div style={{ color: "#9ba3b8", fontWeight: 600, marginBottom: 2 }}>Owner</div>
                    <div>{selectedContractor.ownerName || "—"}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ color: "#9ba3b8", fontWeight: 600, marginBottom: 2 }}>Mobile</div>
                    <div style={{ fontFamily: "monospace" }}>{selectedContractor.mobile || "—"}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ color: "#9ba3b8", fontWeight: 600, marginBottom: 2 }}>GST</div>
                    <div style={{ fontFamily: "monospace" }}>{selectedContractor.gstNumber || "—"}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ color: "#9ba3b8", fontWeight: 600, marginBottom: 2 }}>PAN</div>
                    <div style={{ fontFamily: "monospace" }}>{selectedContractor.panNumber || "—"}</div>
                  </Col>
                </Row>
              </div>
            )}

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="Bill Date *" name="billDate" rules={[{ required: true, message: "Required" }]}>
                  <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" defaultValue={dayjs()} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="Generated By *" name="generatedBy" rules={[{ required: true, message: "Required" }]}>
                  <Input placeholder="Full name of person generating bill" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="Contractor Ref. No." name="contractorRefNo">
                  <Input placeholder="e.g. ABCI/2026/003" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={isCustomGst ? 4 : 8}>
                <Form.Item label="GST Slab" name="gstPercent" initialValue={18} tooltip="GST % applicable on this bill. TDS deduction is handled at payment time.">
                  <Select
                    onChange={(v) => {
                      if (v === -1) { setIsCustomGst(true); return; }
                      setIsCustomGst(false);
                      setNewGstPercent(Number(v));
                    }}
                    options={[
                      { label: "0% — Exempt / Nil", value: 0 },
                      { label: "5%", value: 5 },
                      { label: "12%", value: 12 },
                      { label: "18% (Standard)", value: 18 },
                      { label: "Custom…", value: -1 },
                    ]}
                  />
                </Form.Item>
              </Col>
              {isCustomGst && (
                <Col span={4}>
                  <Form.Item label="Custom %">
                    <InputNumber style={{ width: "100%" }} min={0} max={100} value={newGstPercent} onChange={(v) => setNewGstPercent(Number(v) || 0)} />
                  </Form.Item>
                </Col>
              )}
              <Col span={8}>
                <Form.Item label="Bill Type" tooltip="Categorise what kind of bill this is for the billing chain">
                  <Select
                    value={newBillType}
                    onChange={v => setNewBillType(v)}
                    options={Object.entries(BILL_TYPE_CFG).map(([k, v]) => ({ value: k, label: v.label }))}
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* Bill Relationship — link to existing bills on this WO */}
            <div style={{ background: "#f0f6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#1d4ed8", marginBottom: 10 }}>
                Bill Relationship (optional)
                <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: 8 }}>Link this bill to existing bills in a Work Order</span>
              </div>
              <Row gutter={12}>
                <Col span={10}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Select Work Order</div>
                  <Select
                    showSearch allowClear placeholder="Search work order…"
                    style={{ width: "100%" }}
                    value={newSelectedWOId || undefined}
                    onChange={(v) => { handleWOSelectForLinking(v || ""); setNewLinkedBillIds([]); }}
                    filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                    options={woList.map(wo => ({ value: wo.id, label: `${wo.workOrderNo}` }))}
                  />
                </Col>
                <Col span={14}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Relationship Type</div>
                  <Select
                    value={newRelType}
                    onChange={v => setNewRelType(v)}
                    style={{ width: "100%" }}
                    options={RELATIONSHIP_OPTIONS}
                  />
                </Col>
              </Row>
              {woExistingBills.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                    Select bills this new bill relates to:
                    {["SUPERSEDES", "REVISION_OF", "CORRECTION_OF"].includes(newRelType) && (
                      <span style={{ color: "#dc2626", marginLeft: 6, fontWeight: 600 }}>
                        ⚠ Selected bills will be marked inactive (superseded)
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {woExistingBills.map(b => {
                      const isSelected = newLinkedBillIds.includes(b.id);
                      const isSuperseded = b.isActive === false;
                      return (
                        <div
                          key={b.id}
                          onClick={() => {
                            if (isSuperseded) return;
                            setNewLinkedBillIds(prev =>
                              prev.includes(b.id) ? prev.filter(x => x !== b.id) : [...prev, b.id]
                            );
                          }}
                          style={{
                            border: `1.5px solid ${isSelected ? "#2563eb" : "#e4e7ee"}`,
                            borderRadius: 6, padding: "6px 10px", cursor: isSuperseded ? "not-allowed" : "pointer",
                            background: isSelected ? "#eff6ff" : isSuperseded ? "#f9fafb" : "#fff",
                            opacity: isSuperseded ? 0.5 : 1, fontSize: 12, userSelect: "none",
                          }}
                        >
                          <span style={{ fontFamily: "monospace", fontWeight: 700, color: isSelected ? "#2563eb" : "#FF7A00" }}>
                            {b.billNo}
                          </span>
                          <span style={{ color: "#9ba3b8", marginLeft: 6 }}>
                            ₹{Math.round(b.amount).toLocaleString("en-IN")}
                          </span>
                          <span style={{ marginLeft: 6 }}><StatusTag status={b.status} /></span>
                          {isSuperseded && <Tag color="default" style={{ fontSize: 10 }}>Superseded</Tag>}
                          {isSelected && <span style={{ color: "#2563eb", marginLeft: 4 }}>✓</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Work order import (optional) */}
            {woList.length > 0 && (
              <div style={{ background: "#fff7ed", border: "1px solid #ffd591", borderRadius: 6, padding: "10px 14px", marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#d4620c", marginBottom: 8 }}>
                  Work orders found — import scope items (optional)
                </div>
                <Row gutter={12} align="middle">
                  <Col flex="1">
                    <Select
                      placeholder="Select a work order to import its scope items…"
                      style={{ width: "100%" }}
                      onChange={(v) => { if (v) importFromWO(v as string); }}
                      options={woList.map((wo) => ({
                        value: wo.id,
                        label: wo.workOrderNo + (wo.projectName ? " — " + wo.projectName : ""),
                      }))}
                    />
                  </Col>
                </Row>
              </div>
            )}
          </Form>
        </div>

        {/* Step 2 — Work Items table */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1f2e", marginBottom: 10 }}>
            Work Items
            <span style={{ fontWeight: 400, fontSize: 11, color: "#9ba3b8", marginLeft: 8 }}>
              Enter description, quantity and rate for each item
            </span>
          </div>

          <div style={{ border: "1px solid #e4e7ee", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f6f8" }}>
                  <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "left" }}>
                    Description of Work *
                  </th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "center", width: 80 }}>
                    Unit
                  </th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "right", width: 100 }}>
                    Quantity *
                  </th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "right", width: 120 }}>
                    Rate (₹) *
                  </th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "right", width: 130 }}>
                    Amount (₹)
                  </th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={item.key} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "6px 8px" }}>
                      <Input
                        value={item.description}
                        placeholder="e.g. RCC work, Plastering, Tile fixing…"
                        onChange={(e) => updateLineItem(item.key, "description", e.target.value)}
                        bordered={false}
                        style={{ padding: "2px 4px" }}
                      />
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <Input
                        value={item.unit}
                        placeholder="sqft"
                        onChange={(e) => updateLineItem(item.key, "unit", e.target.value)}
                        bordered={false}
                        style={{ padding: "2px 4px", textAlign: "center" }}
                      />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <InputNumber
                        min={0}
                        value={item.billedQty || undefined}
                        placeholder="0"
                        onChange={(v) => updateLineItem(item.key, "billedQty", Number(v) || 0)}
                        style={{ width: "100%" }}
                        bordered={false}
                      />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <InputNumber
                        min={0}
                        value={item.rate || undefined}
                        placeholder="0.00"
                        onChange={(v) => updateLineItem(item.key, "rate", Number(v) || 0)}
                        style={{ width: "100%" }}
                        bordered={false}
                        formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                        parser={(v) => (v ?? "").replace(/,/g, "") as unknown as 0}
                      />
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: item.amount > 0 ? "#16a85a" : "#c0c4cc", whiteSpace: "nowrap" }}>
                      {item.amount > 0 ? fmt(item.amount) : "—"}
                    </td>
                    <td style={{ padding: "6px 4px", textAlign: "center" }}>
                      <Popconfirm
                        title="Remove this row?"
                        onConfirm={() => removeLineItem(item.key)}
                        disabled={lineItems.length === 1}
                      >
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          disabled={lineItems.length === 1}
                        />
                      </Popconfirm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setLineItems((prev) => [...prev, blankRow()])}
            style={{ width: "100%", marginTop: 8 }}
          >
            Add Work Item
          </Button>

          {(() => {
            const gross  = totalLineAmount;
            const gstAmt = Math.round(gross * newGstPercent / 100);
            const net    = gross + gstAmt;
            return (
              <div style={{ border: "1px solid #e4e7ee", borderRadius: 8, overflow: "hidden", marginTop: 12 }}>
                <div style={{ background: "#fff8f3", borderBottom: "1px solid #f8c9a0", padding: "8px 14px" }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: "#d4620c", textTransform: "uppercase", letterSpacing: "0.06em" }}>Financial Summary</span>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: "1px solid #f5f6f8", color: "#1a1f2e" }}>
                    <span>Gross Amount</span><span>{fmt(gross)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: "1px solid #f5f6f8", color: "#16a85a" }}>
                    <span>+ GST @ {newGstPercent}%</span><span>{fmt(gstAmt)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#fff8f3", fontWeight: 800, fontSize: 15, color: "#d4620c" }}>
                    <span>Net Payable (incl. GST)</span>
                    <span>{fmt(net)}</span>
                  </div>
                  <div style={{ padding: "6px 14px", fontSize: 11, color: "#9ba3b8", borderTop: "1px solid #f5f6f8" }}>
                    TDS deduction is recorded at payment initiation time
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        <Form form={newForm} layout="vertical">
          <Form.Item label="Remarks" name="remarks">
            <Input.TextArea rows={2} placeholder="Describe the scope of work covered in this bill…" />
          </Form.Item>
        </Form>
      </Drawer>

      {/* ── Work Order quick-view — opened from a bill row, no navigation away.
          Exact same detail as the Work Orders page's own view, minus any
          editing/approval actions — accounts staff can cross-check everything
          without leaving this page or being able to act on the work order. */}
      <Drawer
        open={!!woDrawerId}
        onClose={closeWODrawer}
        placement="right"
        width={820}
        title={
          <Space>
            <span style={{ fontSize: 20 }}>📋</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{woDrawerData?.workOrderNo || "Work Order"}</div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>{woDrawerData?.projectName || ""}</div>
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={closeWODrawer}>Close</Button>
            {woDrawerId && (
              <Button size="large" type="primary" style={{ background: "#FF7A00", borderColor: "#FF7A00" }} onClick={() => navigate(`/work-items/${woDrawerId}`)}>
                Open Full Page →
              </Button>
            )}
          </div>
        }
      >
        {!woDrawerData ? <Spin /> : (
          <WorkOrderDetailView workOrder={woDrawerData} bills={woDrawerBills} readOnly />
        )}
      </Drawer>

      {/* ── Vendor quick-view — opened from a bill row, no navigation away.
          Exact same complete profile as the Contractors page's own view. */}
      <Drawer
        open={!!vendorDrawerCode}
        onClose={closeVendorDrawer}
        placement="right"
        width={600}
        title={
          <Space>
            <span style={{ fontSize: 20 }}>👷</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{vendorDrawerContractor?.companyName || vendorDrawerCode}</div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>{vendorDrawerCode}</div>
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button size="large" onClick={closeVendorDrawer}>Close</Button>
          </div>
        }
      >
        {!vendorDrawerContractor ? <Spin /> : (
          <ContractorDetailView contractor={vendorDrawerContractor} />
        )}
      </Drawer>
    </PageShell>
  );
}
