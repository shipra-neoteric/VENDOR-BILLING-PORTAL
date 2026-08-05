import { useEffect, useMemo, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Col,
  Descriptions,
  Divider,
  Drawer,
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
  DollarOutlined,
  ExclamationCircleFilled,
  FileAddOutlined,
  InboxOutlined,
  PauseCircleOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SendOutlined,
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
import { billFinancials } from "../../shared/utils/billMath";
import { BILL_TYPE_CFG } from "../../shared/constants/billOptions";

// ── Types ────────────────────────────────────────────────────────

type BillStatus = "draft" | "verify-done" | "l1-approved" | "approved" | "sent-to-tms" | "hold" | "rejected" | "paid";

interface BillUser { _id?: string; name?: string; role?: string; }

interface ApprovalHistoryEntry {
  stage: string;
  action: string;
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
  agmApprovedBy?: BillUser | null;
  agmApprovedAt?: string;
  verificationBy?: BillUser | null;
  verificationAt?: string;
  l1ApprovedBy?: BillUser | null;
  l1ApprovedAt?: string;
  l2ApprovedBy?: BillUser | null;
  l2ApprovedAt?: string;
  tdsAmount?: number;
  approvalHistory?: ApprovalHistoryEntry[];
  holdBy?: BillUser | null;
  holdAt?: string;
  holdReason?: string;
  holdReleasedBy?: BillUser | null;
  holdReleasedAt?: string;
  rejectedBy?: BillUser | null;
  rejectReason?: string;
  tmsSentAt?: string;
  tmsSendAttempts?: number;
  tmsLastAttemptAt?: string;
  tmsLastError?: string;
  tmsCallbackReceivedAt?: string;
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

// ── Helpers ──────────────────────────────────────────────────────

const fmt = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
// Net payable after Hold/Retention (off the gross) + GST (on what's left of
// the gross after Hold), minus advance recovery — before TDS.
const netAfterAdvance = (b: Bill) =>
  billFinancials({
    gross: b.amount || 0, gstPercent: b.gstPercent ?? 0,
    retentionAmount: b.retentionAmount ?? 0, advanceRecovery: b.advanceRecovery ?? 0,
  }).netPayable;
const normalizeId = (obj: Record<string, unknown>) => ({ ...obj, id: (obj._id || obj.id)?.toString() || "" });

// Full-fidelity normalize — for the WO quick-view drawer, which
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

// Verification → L1 AGM → L2 Director → Sent to TMS → Paid stepper, driven
// from the real fields on the bill rather than any separately-tracked UI
// state. A bill on Hold still shows its progress up to the point it was
// paused (see the Hold banner rendered alongside this in the drawer).
function buildSteps(bill: Bill): { title: string; content: string; icon: ReactNode; status: "wait" | "process" | "finish" | "error" }[] {
  const doneFlags = [
    !!bill.verificationBy,
    !!bill.l1ApprovedBy,
    !!bill.l2ApprovedBy,
    !!bill.tmsSentAt,
    bill.status === "paid",
  ];
  let currentIdx = doneFlags.findIndex((d) => !d);
  if (currentIdx === -1) currentIdx = doneFlags.length;

  const meta = [
    { title: "Verification",   by: bill.verificationBy?.name, at: bill.verificationAt },
    { title: "L1 AGM",         by: bill.l1ApprovedBy?.name,   at: bill.l1ApprovedAt },
    { title: "L2 Director",    by: bill.l2ApprovedBy?.name,   at: bill.l2ApprovedAt },
    { title: "Sent to TMS",    by: undefined,                 at: bill.tmsSentAt },
    { title: "Paid",           by: undefined,                 at: bill.tmsCallbackReceivedAt },
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

const HISTORY_STAGE_LABEL: Record<string, string> = {
  verify: "Verification", "l1-agm": "L1 AGM", "l2-director": "L2 Director", hold: "Hold",
  "tms-handoff": "Send to TMS", "tms-callback": "TMS Callback",
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
        const isSendFailed = h.action === "send-failed";
        const color = isSentBack || isSendFailed ? "#DC2626" : isHeld ? "#9333ea" : isReleased ? "#0369a1" : "#16A34A";
        const bg    = isSentBack || isSendFailed ? "#FEF2F2" : isHeld ? "#F5F3FF" : isReleased ? "#EFF6FF" : "#F0FDF4";
        const verb  = isSentBack ? "sent back" : isHeld ? "held" : isReleased ? "released the hold" : isSendFailed ? "send to TMS failed" : h.action === "sent" ? "sent to TMS" : h.action === "paid" ? "confirmed paid by TMS" : "completed";
        const actorName = typeof h.by === "object" && h.by ? h.by.name : undefined;
        return (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flexShrink: 0, textAlign: "center" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: bg, border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color }}>
                {isSentBack || isSendFailed ? "✕" : isHeld ? "⏸" : isReleased ? "▶" : "✓"}
              </div>
              {i < history.length - 1 && <div style={{ width: 2, height: 26, background: "#E5E7EB", margin: "2px auto" }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#111827" }}>
                {HISTORY_STAGE_LABEL[h.stage] || h.stage} {verb}
                <span style={{ fontWeight: 400, color: "#9CA3AF", marginLeft: 8, fontSize: 11.5 }}>
                  {actorName || (h.stage === "tms-callback" ? "TMS" : "—")}{h.at ? ` · ${dayjs(h.at).format("DD MMM YYYY, hh:mm A")}` : ""}
                </span>
              </div>
              {h.remarks && (
                <div style={{ fontSize: 12, color: isSentBack || isSendFailed ? "#B91C1C" : "#6B7280", marginTop: 4, background: isSentBack || isSendFailed ? "#FEF2F2" : "#F9FAFB", border: `1px solid ${isSentBack || isSendFailed ? "#FCA5A5" : "#E5E7EB"}`, borderRadius: 6, padding: "5px 9px" }}>
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

// Read-only "paid" summary — the payment fields (mode/UTR/bank/released-by/
// amount) are now populated entirely by TMS's callback, not entered here.
// Owner keeps an inline deductions editor for post-hoc corrections.
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
        <div style={{ fontWeight: 700, fontSize: 13, color: "#7C3AED" }}>Paid — confirmed by TMS</div>
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

// ── Main Component ───────────────────────────────────────────────

export default function AccountsPayment() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canVerify        = hasPerm(user, "verify");
  const canL1Agm          = hasPerm(user, "l1-agm-approve");
  const canL2Director     = hasPerm(user, "l2-director-approve");
  const canHold           = hasPerm(user, "hold");
  const canReleaseHold    = hasPerm(user, "release-hold");
  const canRetryTms       = hasPerm(user, "retry-tms");
  const canRejectAny = canVerify || canL1Agm || canL2Director || hasPerm(user, "reject");
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

  // ── The one shared bill detail Drawer ─────────────────────────
  const [drawerBillId, setDrawerBillId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [drawerWOCategory, setDrawerWOCategory] = useState<string | undefined>(undefined);

  // Reject (inline, any stage)
  const [rejecting, setRejecting]       = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);

  // Verification (Stage 1 — merged Maker+Checker) — checks the bill against
  // its WO/vendor details and sets TDS. Retention/advance are decided
  // upstream now (bill-creation time, or AGM/GM's own Site Progress approval).
  const [verifyTdsPercent, setVerifyTdsPercent] = useState(1);
  const [verifyTdsAmount, setVerifyTdsAmount]   = useState(0);
  const [verifyRemarks, setVerifyRemarks]       = useState("");
  const [verifySaving, setVerifySaving]         = useState(false);

  // L1 AGM / L2 Director — pure approve-and-forward.
  const [l1Remarks, setL1Remarks] = useState("");
  const [l1Saving, setL1Saving]   = useState(false);
  const [l2Remarks, setL2Remarks] = useState("");
  const [l2Saving, setL2Saving]   = useState(false);

  // Hold / release hold (only reachable from 'approved' — the last safety
  // valve before the now-irreversible TMS handoff).
  const [holding, setHolding]               = useState(false);
  const [holdReason, setHoldReason]         = useState("");
  const [holdSaving, setHoldSaving]         = useState(false);
  const [releaseHoldSaving, setReleaseHoldSaving] = useState(false);

  // Send to TMS — serves both the first send and manual retries.
  const [sendTmsSaving, setSendTmsSaving] = useState(false);

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

  // ── Derived ──────────────────────────────────────────────────

  const draftBills       = useMemo(() => bills.filter((b) => b.status === "draft"), [bills]);
  const verifyDoneBills   = useMemo(() => bills.filter((b) => b.status === "verify-done"), [bills]);
  const l1ApprovedBills   = useMemo(() => bills.filter((b) => b.status === "l1-approved"), [bills]);
  const approvedBills     = useMemo(() => bills.filter((b) => b.status === "approved"), [bills]);
  const sentToTmsBills    = useMemo(() => bills.filter((b) => b.status === "sent-to-tms"), [bills]);
  const holdBills         = useMemo(() => bills.filter((b) => b.status === "hold"), [bills]);
  const paidBills         = useMemo(() => bills.filter((b) => b.status === "paid"), [bills]);
  const rejectedBills     = useMemo(() => bills.filter((b) => b.status === "rejected"), [bills]);

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
      case "draft":       return b.status === "draft";
      case "verifyDone":  return b.status === "verify-done";
      case "l1Approved":  return b.status === "l1-approved";
      case "approved":    return b.status === "approved";
      case "sentToTms":   return b.status === "sent-to-tms";
      case "hold":        return b.status === "hold";
      case "paid":        return b.status === "paid";
      case "rejected":    return b.status === "rejected";
      default:            return true; // "all"
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
    { key: "all",         label: "All",              count: 0 },
    { key: "draft",       label: "Awaiting Verification", count: draftBills.length },
    { key: "verifyDone",  label: "Awaiting L1 AGM",   count: verifyDoneBills.length },
    { key: "l1Approved",  label: "Awaiting L2 Director", count: l1ApprovedBills.length },
    { key: "approved",    label: "Ready for TMS",      count: approvedBills.length },
    { key: "sentToTms",   label: "Sent to TMS",        count: sentToTmsBills.length },
    { key: "hold",        label: "Hold",               count: holdBills.length },
    { key: "paid",        label: "Paid",               count: paidBills.length },
    { key: "rejected",    label: "Rejected",           count: rejectedBills.length },
  ];

  const drawerBill = useMemo(
    () => (drawerBillId ? bills.find((b) => b.id === drawerBillId) || null : null),
    [bills, drawerBillId]
  );

  // Reset every action section's local state whenever the drawer is opened for
  // a bill, or the open bill's own stage changes underneath it (e.g. right
  // after verifying succeeds, so the L1 AGM section is ready to go without
  // needing to close and reopen the drawer).
  useEffect(() => {
    if (!drawerOpen || !drawerBill) return;
    setRejecting(false);
    setRejectReason("");
    setHolding(false);
    setHoldReason("");
    setVerifyTdsPercent(drawerBill.tdsPercent ?? 1);
    setVerifyTdsAmount(drawerBill.tdsAmount ?? 0);
    setVerifyRemarks("");
    setL1Remarks("");
    setL2Remarks("");

    if (drawerBill.workOrderId) {
      setDrawerWOCategory(undefined);
      apiClient.get<{ workOrder: Record<string, unknown> }>(`/work-orders/${drawerBill.workOrderId}`)
        .then((r) => setDrawerWOCategory((r.data.workOrder?.category as string) || ""))
        .catch(() => setDrawerWOCategory(undefined));
    } else {
      setDrawerWOCategory(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen, drawerBillId, drawerBill?.status]);

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

  async function handleVerify() {
    if (!drawerBillId) return;
    setVerifySaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/verify`, {
        tdsPercent: verifyTdsPercent,
        tdsAmount:  verifyTdsAmount,
        remarks: verifyRemarks || undefined,
      });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Verified — ready for L1 AGM approval");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Verification failed");
    } finally {
      setVerifySaving(false);
    }
  }

  async function handleL1AgmApprove() {
    if (!drawerBillId) return;
    setL1Saving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/l1-agm-approve`, {
        remarks: l1Remarks || undefined,
      });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("L1 AGM approved — ready for L2 Director approval");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "L1 AGM approval failed");
    } finally {
      setL1Saving(false);
    }
  }

  async function handleL2DirectorApprove() {
    if (!drawerBillId) return;
    setL2Saving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/l2-director-approve`, {
        remarks: l2Remarks || undefined,
      });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("L2 Director approved — sending to TMS…");
      // Fires right after a successful L2 approval so it still feels like one
      // click, while the two backend actions stay independently retryable.
      await handleSendToTms(drawerBillId);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "L2 Director approval failed");
    } finally {
      setL2Saving(false);
    }
  }

  async function handleSendToTms(billId?: string) {
    const id = billId || drawerBillId;
    if (!id) return;
    setSendTmsSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${id}/send-to-tms`, {});
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Sent to TMS — awaiting payment confirmation");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; data?: { bill?: Record<string, unknown> } } } };
      message.error(e?.response?.data?.message || "Failed to send to TMS — you can retry from this bill");
      // Even on failure, the bill's tmsLastError/tmsSendAttempts were updated
      // server-side — refetch it so the drawer shows the retry state.
      try {
        const r = await apiClient.get<{ bill: Record<string, unknown> }>(`/bills/${id}`);
        updateBillInList(normalizeId(r.data.bill) as unknown as Bill);
      } catch { /* ignore */ }
    } finally {
      setSendTmsSaving(false);
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
      message.success("Hold released — ready to send to TMS");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to release hold");
    } finally {
      setReleaseHoldSaving(false);
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
      const sendBackTo = bill.status === "approved" ? "L1 AGM" : bill.status === "l1-approved" ? "Verification" : bill.status === "verify-done" ? "Verification" : null;
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
        if (!canVerify) return <MutedNote text="Awaiting Verification against its work order and vendor details." />;
        return (
          <div style={sectionPanelStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#FF7A00", marginBottom: 8 }}>Verification</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>
              Confirm this bill matches its work order and vendor details, and set TDS. Hold/Retention and Advance
              Recovery are already decided (at bill creation, or by AGM/GM's own Site Progress approval) — not entered here.
            </div>
            <Row gutter={12}>
              <Col span={12}>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>TDS %</div>
                <InputNumber
                  style={{ width: "100%" }} min={0} max={100} value={verifyTdsPercent}
                  onChange={(v) => {
                    const pct = Number(v) || 0;
                    setVerifyTdsPercent(pct);
                    // TDS applies to what's actually payable now — the gross minus what's
                    // being held back, before GST (a pass-through tax, not the
                    // contractor's income). Never on the GST-inclusive figure.
                    const tdsBase = (bill.amount || 0) - (bill.retentionAmount ?? 0);
                    setVerifyTdsAmount(Math.round(tdsBase * pct / 100));
                  }}
                />
              </Col>
              <Col span={12}>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>TDS Amount to Deduct (₹)</div>
                <InputNumber
                  style={{ width: "100%" }} min={0} value={verifyTdsAmount}
                  onChange={(v) => {
                    const amt = Number(v) || 0;
                    setVerifyTdsAmount(amt);
                    const tdsBase = (bill.amount || 0) - (bill.retentionAmount ?? 0);
                    setVerifyTdsPercent(tdsBase > 0 ? Math.round((amt / tdsBase) * 10000) / 100 : 0);
                  }}
                />
              </Col>
            </Row>
            <Input.TextArea rows={2} style={{ marginTop: 8 }} placeholder="Remarks (optional)" value={verifyRemarks} onChange={(e) => setVerifyRemarks(e.target.value)} />
          </div>
        );
      }

      case "verify-done": {
        if (!canL1Agm) return <MutedNote text="Awaiting L1 AGM approval." />;
        const guard = sameActor(user, bill.verificationBy) ? "You verified this bill — a different user must give L1 AGM approval." : undefined;
        return (
          <div style={sectionPanelStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#0891b2", marginBottom: 8 }}>L1 AGM Approval</div>
            {guard && <div style={{ fontSize: 12, color: "#d97706", marginBottom: 8 }}>⚠ {guard}</div>}
            <Descriptions column={2} size="small" colon={false} style={{ marginBottom: 8 }}>
              <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Hold / Retention</span>}>{fmt(bill.retentionAmount ?? 0)}</Descriptions.Item>
              <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Advance Recovery</span>}>{fmt(bill.advanceRecovery ?? 0)}</Descriptions.Item>
              <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>TDS %</span>}>{bill.tdsPercent ?? 0}%</Descriptions.Item>
              <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>TDS Amount</span>}>{fmt(bill.tdsAmount ?? 0)}</Descriptions.Item>
            </Descriptions>
            <Input.TextArea rows={2} placeholder="Remarks (optional)" value={l1Remarks} onChange={(e) => setL1Remarks(e.target.value)} />
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
            {!canReleaseHold && <MutedNote text="Only someone with Release Hold access can resume this bill." />}
          </div>
        );

      case "l1-approved": {
        if (!canL2Director) return <MutedNote text="Awaiting L2 Director approval." />;
        const guard = sameActor(user, bill.l1ApprovedBy) ? "You gave L1 AGM approval — a different user must give L2 Director approval." : undefined;
        return (
          <div style={sectionPanelStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#3730a3", marginBottom: 8 }}>L2 Director Approval</div>
            {guard && <div style={{ fontSize: 12, color: "#d97706", marginBottom: 8 }}>⚠ {guard}</div>}
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>
              This is the last internal sign-off — approving sends this bill straight to TMS for payment.
            </div>
            <Input.TextArea rows={2} placeholder="Remarks (optional)" value={l2Remarks} onChange={(e) => setL2Remarks(e.target.value)} />
          </div>
        );
      }

      case "approved": {
        if (!canRetryTms) return <MutedNote text="L2 Director approved — awaiting handoff to TMS." />;
        return (
          <div style={sectionPanelStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#7c3aed", marginBottom: 8 }}>Ready for TMS</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>
              L2 Director approved this bill — send it to the Transaction Management System to process the payment.
            </div>
            {bill.tmsLastError && (
              <Alert
                type="error" showIcon style={{ marginBottom: 10 }}
                message={<span><strong>Last attempt failed{bill.tmsSendAttempts ? ` (attempt ${bill.tmsSendAttempts})` : ""}:</strong> {bill.tmsLastError}</span>}
              />
            )}
          </div>
        );
      }

      case "sent-to-tms":
        return (
          <div style={{ marginTop: 16 }}>
            <Alert
              type="info" showIcon
              message={<span><strong>Sent to TMS</strong>{bill.tmsSentAt ? ` on ${dayjs(bill.tmsSentAt).format("DD MMM YYYY, hh:mm A")}` : ""} — awaiting payment confirmation. TMS owns this bill from here; no action is available in this system until it reports back.</span>}
            />
          </div>
        );

      case "paid":
        return <PaidPanel bill={bill} isOwner={isOwner} onUpdated={updateBillInList} />;

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
        return canVerify ? { label: "Verify", color: "#FF7A00", onClick: handleVerify, loading: verifySaving } : null;
      case "verify-done": {
        if (!canL1Agm) return null;
        const guard = sameActor(user, bill.verificationBy) ? "You verified this bill — a different user must give L1 AGM approval." : undefined;
        return { label: "L1 AGM Approve", color: "#0891b2", onClick: handleL1AgmApprove, loading: l1Saving, disabled: !!guard, tooltip: guard };
      }
      case "hold":
        return canReleaseHold ? { label: "Release Hold", color: "#9333EA", onClick: handleReleaseHold, loading: releaseHoldSaving } : null;
      case "l1-approved": {
        if (!canL2Director) return null;
        const guard = sameActor(user, bill.l1ApprovedBy) ? "You gave L1 AGM approval — a different user must give L2 Director approval." : undefined;
        return { label: "L2 Director Approve & Send to TMS", color: "#3730a3", onClick: handleL2DirectorApprove, loading: l2Saving, disabled: !!guard, tooltip: guard };
      }
      case "approved":
        return canRetryTms ? { label: bill.tmsLastError ? "Retry Send to TMS" : "Send to TMS", color: "#7c3aed", onClick: () => handleSendToTms(), loading: sendTmsSaving } : null;
      default:
        return null;
    }
  }

  // ── Render ───────────────────────────────────────────────────────

  const primaryAction = drawerBill ? footerPrimary(drawerBill) : null;

  return (
    <PageShell
      title="Accounts Payment"
      description="Verification → L1 AGM → L2 Director — then handed off to TMS for payment"
      cta={
        <Space>
          <Button type="primary" style={{ background: "#FF7A00", borderColor: "#FF7A00" }}>Accounts Payment</Button>
          <Button onClick={() => navigate("/procurement-tracker")}>Procurement Tracker</Button>
        </Space>
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
          <StatCard label="Awaiting Verification" value={draftBills.length} sub="Draft bills" icon={<FileAddOutlined />} accent="#6B7280" />
        </Col>
        <Col xs={12} sm={8} md={3}>
          <StatCard label="Awaiting L1 AGM" value={verifyDoneBills.length} sub="Verified" icon={<SafetyCertificateOutlined />} accent="#0891b2" />
        </Col>
        <Col xs={12} sm={8} md={3}>
          <StatCard label="Awaiting L2 Director" value={l1ApprovedBills.length} sub="L1 AGM approved" icon={<CheckCircleOutlined />} accent="#7C3AED" />
        </Col>
        <Col xs={12} sm={8} md={3}>
          <StatCard label="Ready for TMS" value={approvedBills.length} sub="L2 Director approved" icon={<ClockCircleOutlined />} accent="#3730a3" />
        </Col>
        <Col xs={12} sm={8} md={3}>
          <StatCard label="Sent to TMS" value={sentToTmsBills.length} sub="Awaiting payment" icon={<SendOutlined />} accent="#1D4ED8" />
        </Col>
        <Col xs={12} sm={8} md={3}>
          <StatCard label="Hold" value={holdBills.length} sub="Paused before TMS" icon={<PauseCircleOutlined />} accent="#9333EA" />
        </Col>
        <Col xs={12} sm={8} md={3}>
          <StatCard label="Paid" value={stats.paidThisMonthCount} sub={`${fmt(stats.paidThisMonthAmt)} this month`} icon={<DollarOutlined />} accent="#16A34A" />
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
                  <div style={{ fontSize: 12, marginTop: 4 }}>New bills are created from the Billing module.</div>
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
                {!rejecting && !holding && drawerBill.status === "approved" && canHold && (
                  <Button style={{ color: "#9333EA", borderColor: "#9333EA" }} onClick={() => setHolding(true)}>Hold Payment</Button>
                )}
                {!rejecting && !holding && canRejectAny && !["paid", "rejected", "hold", "sent-to-tms"].includes(drawerBill.status) && (
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
              // While Verification is actively setting TDS (status draft),
              // preview against what's being typed above — the saved bill
              // record still has tdsAmount at 0/unset until they submit.
              const isVerifyStage = bill.status === "draft";
              const gross    = bill.amount || 0;
              const gstPct   = bill.gstPercent ?? 0;
              const retAmt   = bill.retentionAmount ?? 0;
              const retPct   = bill.retentionPercent ?? 0;
              const advRec   = bill.advanceRecovery ?? 0;
              const paid     = bill.paidAmount;
              const retRel   = bill.retentionReleased ?? 0;
              const tdsPctDisplay = isVerifyStage ? verifyTdsPercent : bill.tdsPercent;
              const tdsAmt = isVerifyStage ? verifyTdsAmount : (bill.tdsAmount ?? 0);

              // Hold comes off the gross first (it's a deposit against the
              // contractor's own basic value, not the GST); GST is then calculated
              // on what's left. Net Payable is the true bottom line — Hold,
              // Advance Recovery, and TDS all land above it now, not after it.
              const { gstAmount: gstAmt, netPayable: finalNetPayable } = billFinancials({
                gross, gstPercent: gstPct, retentionAmount: retAmt, advanceRecovery: advRec, tdsAmount: tdsAmt,
              });
              const retReleaseRemark = bill.retentionReleaseRemark;

              type SummaryRow = { label: string; value: string; color: string; bold?: boolean; borderTop?: boolean; bg?: string };
              const rows: SummaryRow[] = [
                { label: "Gross Amount", value: fmt(gross), color: "#1a1f2e" },
              ];
              if (retAmt > 0) rows.push({ label: `Hold / Retention${retPct > 0 ? ` @ ${retPct}%` : ""}`, value: `− ${fmt(retAmt)}`, color: "#e03b3b" });
              if (advRec > 0) rows.push({ label: "Less: Advance Recovery", value: `− ${fmt(advRec)}`, color: "#d97706" });
              if (gstAmt > 0) rows.push({ label: `GST @ ${gstPct}%`, value: `+ ${fmt(gstAmt)}`, color: "#16a85a" });
              if (tdsAmt > 0) rows.push({ label: `Less: TDS Deducted${tdsPctDisplay ? ` (${tdsPctDisplay}%)` : ""}`, value: `− ${fmt(tdsAmt)}`, color: "#dc2626" });
              rows.push({ label: "NET PAYABLE", value: fmt(finalNetPayable), color: "#7c3aed", bold: true, borderTop: true });
              if (retRel > 0) rows.push({ label: `Hold Released${retReleaseRemark ? ` (${retReleaseRemark})` : ""}`, value: `+ ${fmt(retRel)}`, color: "#0369a1", bold: false });
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
