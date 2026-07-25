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
  InboxOutlined,
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
import { BILL_STATUS_LABEL } from "../../shared/constants/billStatus";

// ── Types ────────────────────────────────────────────────────────

type BillStatus = "draft" | "submitted" | "verified" | "approved" | "payment-initiated" | "rejected" | "paid";

interface BillUser { _id?: string; name?: string; role?: string; }

interface PhysicalVerification {
  done: boolean;
  by?: BillUser | string | null;
  at?: string;
  remark?: string;
}

interface LineItem {
  key: number;
  scopeItemId?: string;
  description: string;
  remarks?: string;
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
  physicalVerification?: PhysicalVerification;
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
interface ContractorOpt {
  id: string; vendorCode: string; companyName: string; shortCode?: string; ownerName?: string;
  mobile?: string; address?: string; bankName?: string; accountNumber?: string;
  ifscCode?: string; branchName?: string; gstNumber?: string; panNumber?: string;
  aadhaarNumber?: string;
}
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

// ── Print / Download ─────────────────────────────────────────────

function printBill(bill: Bill, contractor: ContractorOpt | null, mode: 'pre' | 'post' = 'pre') {
  const rows = (bill.lineItems || [])
    .map(
      (li, i) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${i + 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${li.description}${li.remarks ? `<div style="font-size:10px;color:#d97706;margin-top:3px">📌 ${li.remarks}</div>` : ""}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${li.unit || "-"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${(li.billedQty || 0).toLocaleString("en-IN")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${(li.rate || 0).toLocaleString("en-IN")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${(li.amount || 0).toLocaleString("en-IN")}</td>
      </tr>`
    )
    .join("");

  const bankSection =
    contractor?.bankName
      ? `<div style="border:1px solid #e8e8e8;border-radius:6px;padding:14px;margin-bottom:24px">
          <h4 style="font-size:10px;text-transform:uppercase;color:#f47b20;letter-spacing:1px;margin:0 0 10px">Bank Details</h4>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            <div><span style="font-size:10px;color:#999;display:block">Bank Name</span><strong>${contractor.bankName}</strong></div>
            <div><span style="font-size:10px;color:#999;display:block">Account No.</span><strong>${contractor.accountNumber || "-"}</strong></div>
            <div><span style="font-size:10px;color:#999;display:block">IFSC Code</span><strong>${contractor.ifscCode || "-"}</strong></div>
            <div><span style="font-size:10px;color:#999;display:block">Branch</span><strong>${contractor.branchName || "-"}</strong></div>
            <div><span style="font-size:10px;color:#999;display:block">PAN No.</span><strong>${contractor.panNumber || "-"}</strong></div>
            <div><span style="font-size:10px;color:#999;display:block">Aadhaar No.</span><strong>${contractor.aadhaarNumber || "-"}</strong></div>
          </div>
        </div>`
      : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Bill - ${bill.billNo}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:30px;color:#333;font-size:13px}@media print{body{padding:15px}button{display:none!important}}</style>
</head><body>

<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #f47b20;padding-bottom:16px;margin-bottom:20px">
  <div>
    <div style="font-size:24px;font-weight:bold;color:#f47b20">Neoteric Properties</div>
    <div style="color:#666;font-size:12px;margin-top:4px">Project Cost Center</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#333">${mode === 'pre' ? 'RUNNING BILL' : 'PAYMENT RECEIPT'}</div>
    <div style="margin-top:6px;font-size:13px"><strong>Bill No:</strong> ${bill.billNo}</div>
    <div style="font-size:13px"><strong>Date:</strong> ${bill.billDate ? dayjs(bill.billDate).format("DD/MM/YYYY") : "-"}</div>
    <div style="font-size:13px"><strong>Status:</strong> <span style="background:${mode === 'pre' ? '#f47b20' : '#16a34a'};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px">${mode === 'pre' ? ((BILL_STATUS_LABEL[bill.status] || 'ON HOLD').toUpperCase()) : 'PAID'}</span></div>
  </div>
</div>

<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px">
  ${[
    { label: "AGM",       done: !!bill.agmApprovedBy },
    { label: "GM",        done: !!bill.verifiedBy },
    { label: "Accounts",  done: !!bill.approvedBy },
    { label: "Initiated", done: !!bill.paymentInitiatedBy },
    { label: "Paid",      done: bill.status === "paid" },
  ].map(s => `<span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:10px;background:${s.done ? '#f0fdf4' : '#f5f6f8'};color:${s.done ? '#16a34a' : '#9ba3b8'};border:1px solid ${s.done ? '#bbf7d0' : '#e5e7eb'}">${s.done ? '✓ ' : ''}${s.label}</span>`).join("")}
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
  ${mode === 'post' ? `
  <div style="border:1px solid #e8e8e8;border-radius:6px;padding:14px;background:#fafafa">
    <h4 style="font-size:10px;text-transform:uppercase;color:#f47b20;letter-spacing:1px;margin:0 0 10px">From (Payer)</h4>
    <p style="font-weight:bold;font-size:14px;margin-bottom:4px">Neoteric Properties</p>
    <p style="margin-bottom:3px;color:#555">Project Cost Center</p>
    <p style="margin-bottom:3px;color:#555">Site / Project: <strong>${bill.projectName || "-"}</strong></p>
    ${bill.projectLocation ? `<p style="margin-bottom:3px;color:#555">Location: ${bill.projectLocation}</p>` : ""}
    ${bill.workOrderNo ? `<p style="margin-bottom:3px;color:#555">Work Order: ${bill.workOrderNo}</p>` : ""}
    ${bill.generatedBy ? `<p style="color:#555">Generated By: ${bill.generatedBy}</p>` : ""}
  </div>
  <div style="border:1px solid #e8e8e8;border-radius:6px;padding:14px;background:#fafafa">
    <h4 style="font-size:10px;text-transform:uppercase;color:#f47b20;letter-spacing:1px;margin:0 0 10px">To (Contractor)</h4>
    <p style="font-weight:bold;font-size:14px;margin-bottom:4px">${bill.vendorName || contractor?.companyName || "-"}</p>
    <p style="margin-bottom:3px;color:#555">Vendor Code: <strong>${bill.vendorCode || contractor?.vendorCode || "-"}</strong></p>
    ${contractor?.ownerName ? `<p style="margin-bottom:3px;color:#555">Contact: ${contractor.ownerName}</p>` : ""}
    ${contractor?.mobile ? `<p style="margin-bottom:3px;color:#555">Mobile: ${contractor.mobile}</p>` : ""}
    ${contractor?.address ? `<p style="margin-bottom:3px;color:#555">${contractor.address}</p>` : ""}
    ${contractor?.gstNumber ? `<p style="margin-bottom:3px;color:#555">GST: ${contractor.gstNumber}</p>` : ""}
    ${contractor?.panNumber ? `<p style="color:#555">PAN: ${contractor.panNumber}</p>` : ""}
  </div>` : `
  <div style="border:1px solid #e8e8e8;border-radius:6px;padding:14px;background:#fafafa">
    <h4 style="font-size:10px;text-transform:uppercase;color:#f47b20;letter-spacing:1px;margin:0 0 10px">From (Contractor)</h4>
    <p style="font-weight:bold;font-size:14px;margin-bottom:4px">${bill.vendorName || contractor?.companyName || "-"}</p>
    <p style="margin-bottom:3px;color:#555">Vendor Code: <strong>${bill.vendorCode || contractor?.vendorCode || "-"}</strong></p>
    ${contractor?.ownerName ? `<p style="margin-bottom:3px;color:#555">Contact: ${contractor.ownerName}</p>` : ""}
    ${contractor?.mobile ? `<p style="margin-bottom:3px;color:#555">Mobile: ${contractor.mobile}</p>` : ""}
    ${contractor?.address ? `<p style="margin-bottom:3px;color:#555">${contractor.address}</p>` : ""}
    ${contractor?.gstNumber ? `<p style="margin-bottom:3px;color:#555">GST: ${contractor.gstNumber}</p>` : ""}
    ${contractor?.panNumber ? `<p style="color:#555">PAN: ${contractor.panNumber}</p>` : ""}
  </div>
  <div style="border:1px solid #e8e8e8;border-radius:6px;padding:14px;background:#fafafa">
    <h4 style="font-size:10px;text-transform:uppercase;color:#f47b20;letter-spacing:1px;margin:0 0 10px">To</h4>
    <p style="font-weight:bold;font-size:14px;margin-bottom:4px">Neoteric Properties</p>
    <p style="margin-bottom:3px;color:#555">Site / Project: <strong>${bill.projectName || "-"}</strong></p>
    ${bill.projectLocation ? `<p style="margin-bottom:3px;color:#555">Location: ${bill.projectLocation}</p>` : ""}
    ${bill.workOrderNo ? `<p style="margin-bottom:3px;color:#555">Work Order: ${bill.workOrderNo}</p>` : ""}
    ${bill.generatedBy ? `<p style="color:#555">Generated By: ${bill.generatedBy}</p>` : ""}
  </div>`}
</div>

<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
  <thead>
    <tr>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:center;width:40px">Sr.</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:left">Description of Work</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:center;width:70px">Unit</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:right;width:80px">Qty</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:right;width:110px">Rate (₹)</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:right;width:120px">Amount (₹)</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div style="display:flex;justify-content:flex-end;margin-bottom:24px">
  <div style="min-width:320px;border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;font-family:monospace">
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee">
      <span>Gross Amount</span><span>₹${(bill.amount || 0).toLocaleString("en-IN")}</span>
    </div>
    ${(bill.gstPercent ?? 0) > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#16a34a">
      <span>GST @ ${bill.gstPercent}%</span><span>+ ₹${Math.round((bill.amount || 0) * (bill.gstPercent ?? 0) / 100).toLocaleString("en-IN")}</span>
    </div>` : ""}
    ${(bill.retentionAmount ?? 0) > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#dc2626">
      <span>Hold / Retention${(bill.retentionPercent ?? 0) > 0 ? ` @ ${bill.retentionPercent}%` : ""}</span>
      <span>− ₹${Math.round(bill.retentionAmount ?? 0).toLocaleString("en-IN")}</span>
    </div>` : ""}
    ${(() => {
      const advRec = Math.round(bill.advanceRecovery ?? 0);
      const netPay = Math.round((bill.amount || 0) * (1 + (bill.gstPercent ?? 0) / 100) - (bill.retentionAmount ?? 0));
      if (mode === 'pre') {
        // PRE-PAYMENT: show advance recovery, end at net payable (no TDS/payment)
        return `${advRec > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#d97706">
      <span>Less: Advance Recovery</span><span>− ₹${advRec.toLocaleString("en-IN")}</span>
    </div>` : ""}
    <div style="display:flex;justify-content:space-between;padding:13px 14px;background:#fff7ed;font-weight:bold;font-size:15px;color:#f47b20;border-top:2px solid #fed7aa">
      <span>NET PAYABLE</span>
      <span>₹${(netPay - advRec).toLocaleString("en-IN")}</span>
    </div>`;
      } else {
        // POST-PAYMENT: show net payable, advance, TDS, hold release, actually paid
        const retRel = Math.round(bill.retentionReleased ?? 0);
        const billPortion = bill.paidAmount != null ? Math.max(0, Math.round(bill.paidAmount) - retRel) : null;
        const tds = billPortion != null ? Math.max(0, netPay - advRec - billPortion) : 0;
        return `
    <div style="display:flex;justify-content:space-between;padding:11px 14px;background:#fff7ed;font-weight:bold;font-size:14px;color:#f47b20;border-top:2px solid #fed7aa">
      <span>Net Payable</span><span>₹${netPay.toLocaleString("en-IN")}</span>
    </div>${advRec > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#d97706">
      <span>Less: Advance Recovery</span><span>− ₹${advRec.toLocaleString("en-IN")}</span>
    </div>` : ""}${tds > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#dc2626">
      <span>Less: TDS Deducted${bill.tdsPercent ? ` (${bill.tdsPercent}%)` : ""}</span><span>− ₹${tds.toLocaleString("en-IN")}</span>
    </div>` : ""}${retRel > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#0369a1;font-weight:600">
      <span>Hold / Retention Released${bill.retentionReleaseRemark ? ` (${bill.retentionReleaseRemark})` : ""}</span><span>+ ₹${retRel.toLocaleString("en-IN")}</span>
    </div>` : ""}${bill.paidAmount != null ? `
    <div style="display:flex;justify-content:space-between;padding:13px 14px;background:#f0fdf4;font-weight:bold;font-size:15px;color:#16a34a;border-top:2px solid #bbf7d0">
      <span>Actually Paid</span><span>₹${Math.round(bill.paidAmount).toLocaleString("en-IN")}</span>
    </div>` : ""}`;
      }
    })()}
  </div>
</div>

${bankSection}

${mode === 'post' && bill.paymentDate ? `
<div style="border:1px solid #c4b5fd;border-radius:6px;padding:14px;margin-bottom:24px;background:#faf5ff">
  <h4 style="font-size:10px;text-transform:uppercase;color:#7c3aed;letter-spacing:1px;margin:0 0 10px">Payment Details</h4>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;font-size:12px">
    <div><span style="font-size:10px;color:#999;display:block">Payment Date</span><strong>${dayjs(bill.paymentDate).format("DD/MM/YYYY")}</strong></div>
    <div><span style="font-size:10px;color:#999;display:block">Mode</span><strong>${({ neft: "NEFT", rtgs: "RTGS", imps: "IMPS", internet_banking: "Internet Banking", upi: "UPI", cheque: "Cheque", dd: "Demand Draft", cash: "Cash" } as Record<string,string>)[bill.paymentMode || ""] || bill.paymentMode?.toUpperCase() || "—"}</strong></div>
    <div><span style="font-size:10px;color:#999;display:block">UTR / Reference</span><strong style="font-family:monospace">${bill.paymentUTR || "—"}</strong></div>
    ${bill.paymentBank ? `<div><span style="font-size:10px;color:#999;display:block">Bank</span><strong>${bill.paymentBank}</strong></div>` : ""}
    ${bill.paymentReleasedBy ? `<div><span style="font-size:10px;color:#999;display:block">Released By</span><strong>${bill.paymentReleasedBy}</strong></div>` : ""}
  </div>
</div>` : ""}

${bill.remarks ? `<div style="border:1px solid #e8e8e8;border-radius:6px;padding:12px;margin-bottom:24px"><strong>Remarks:</strong> ${bill.remarks}</div>` : ""}

${mode === 'pre' ? `<div style="display:flex;justify-content:space-around;margin-top:50px;padding-top:16px;border-top:1px solid #eee">
  <div style="text-align:center">
    <div style="border-top:1px solid #333;width:180px;margin:0 auto 6px"></div>
    <p style="font-size:12px;color:#666;font-weight:600">AGM${bill.agmApprovedBy ? ` — ${bill.agmApprovedBy.name}` : ""}</p>
    <p style="font-size:12px;color:#999">${bill.agmApprovedAt ? `Approved ${dayjs(bill.agmApprovedAt).format("DD/MM/YYYY")}` : "Neoteric Properties"}</p>
  </div>
  <div style="text-align:center">
    <div style="border-top:1px solid #333;width:180px;margin:0 auto 6px"></div>
    <p style="font-size:12px;color:#666;font-weight:600">GM${bill.verifiedBy ? ` — ${bill.verifiedBy.name}` : ""}</p>
    <p style="font-size:12px;color:#999">${bill.verifiedAt ? `Approved ${dayjs(bill.verifiedAt).format("DD/MM/YYYY")}` : "Neoteric Properties"}</p>
  </div>
</div>` : ""}

<div style="text-align:center;margin-top:24px;font-size:11px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:10px">
  Computer-generated bill · Neoteric Properties — Project Cost Center
</div>
<div style="text-align:center;margin-top:14px">
  <button onclick="window.print()" style="background:#f47b20;color:#fff;border:none;padding:8px 24px;border-radius:4px;cursor:pointer;font-size:13px">
    Print / Save as PDF
  </button>
</div>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=950");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.addEventListener("load", () => { win.focus(); win.print(); });
    // fallback if load already fired (cached)
    if (win.document.readyState === "complete") { win.focus(); win.print(); }
  }
}

// ── Small visual building blocks ──────────────────────────────────

function StatCard({
  label, value, sub, icon, accent,
}: {
  label: string; value: ReactNode; sub?: string; icon: ReactNode; accent: string;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px" }}>
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

// Maker → Checker → Approver → Physical Verify → Paid stepper, driven from the
// real fields on the bill rather than any separately-tracked UI state.
function buildSteps(bill: Bill): { title: string; content: string; icon: ReactNode; status: "wait" | "process" | "finish" | "error" }[] {
  const doneFlags = [
    !!bill.makerBy,
    !!bill.checkerBy,
    !!bill.paymentInitiatedBy,
    !!bill.physicalVerification?.done,
    bill.status === "paid",
  ];
  let currentIdx = doneFlags.findIndex((d) => !d);
  if (currentIdx === -1) currentIdx = doneFlags.length;

  const meta = [
    { title: "Maker",            by: bill.makerBy?.name,                          at: bill.makerAt },
    { title: "Checker",          by: bill.checkerBy?.name,                        at: bill.checkerAt },
    { title: "Approver",         by: bill.paymentInitiatedBy?.name,               at: bill.paymentInitiatedAt },
    { title: "Physical Verify",  by: physByName(bill.physicalVerification?.by),   at: bill.physicalVerification?.at },
    { title: "Paid",             by: bill.paymentReleasedBy,                      at: bill.paymentDate },
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

// ── Main Component ───────────────────────────────────────────────

export default function AccountsPayment() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate  = hasPerm(user, "create");
  const canMaker   = hasPerm(user, "maker");
  const canChecker = hasPerm(user, "checker");
  const canApprover = hasPerm(user, "approver");
  const canRelease = hasPerm(user, "release");
  const canRejectAny = canMaker || canChecker || canApprover || canRelease || hasPerm(user, "reject");
  const isOwner = user?.role === "owner";

  const [bills, setBills]             = useState<Bill[]>([]);
  const [loading, setLoading]         = useState(true);
  const [projects, setProjects]       = useState<ProjectOpt[]>([]);
  const [contractors, setContractors] = useState<ContractorOpt[]>([]);

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

  // Maker confirm (Stage 1)
  const [makerRemarks, setMakerRemarks] = useState("");
  const [makerSaving, setMakerSaving]   = useState(false);

  // Checker approve (Stage 2)
  const [checkerRetention, setCheckerRetention] = useState(0);
  const [checkerAdvance, setCheckerAdvance]     = useState(0);
  const [checkerRemarks, setCheckerRemarks]     = useState("");
  const [checkerSaving, setCheckerSaving]       = useState(false);

  // Approver initiate (Stage 3)
  const [approverTdsPercent, setApproverTdsPercent] = useState(1);
  const [approverTdsAmount, setApproverTdsAmount]   = useState(0);
  const [approverRemarks, setApproverRemarks]       = useState("");
  const [approverSaving, setApproverSaving]         = useState(false);

  // Physical verification
  const [physPrinted, setPhysPrinted]       = useState(false);
  const [physAttachments, setPhysAttachments] = useState(false);
  const [physSigned, setPhysSigned]         = useState(false);
  const [physRemark, setPhysRemark]         = useState("");
  const [physSaving, setPhysSaving]         = useState(false);

  // Release (Stage 4)
  const [releaseForm]                       = Form.useForm();
  const [releaseSaving, setReleaseSaving]   = useState(false);
  const [releasePendingAdvances, setReleasePendingAdvances] = useState<AdvanceSlipOpt[]>([]);
  const [releaseAdvancesLoading, setReleaseAdvancesLoading] = useState(false);
  const [releaseAdvanceAmount, setReleaseAdvanceAmount]     = useState<number | null>(null);

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
      .then((r) => setContractors((r.data.contractors || []).map((c) => normalizeId(c) as unknown as ContractorOpt)))
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
  const paidBills              = useMemo(() => bills.filter((b) => b.status === "paid"), [bills]);
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
      case "paid":           return b.status === "paid";
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
    { key: "paid",           label: "Paid",            count: paidBills.length },
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
    setMakerRemarks("");
    setCheckerRetention(drawerBill.retentionAmount ?? 0);
    setCheckerAdvance(drawerBill.advanceRecovery ?? 0);
    setCheckerRemarks("");
    setApproverTdsPercent(drawerBill.tdsPercent ?? 1);
    setApproverTdsAmount(drawerBill.tdsAmount ?? 0);
    setApproverRemarks("");
    setPhysPrinted(false);
    setPhysAttachments(false);
    setPhysSigned(false);
    setPhysRemark("");

    if (drawerBill.status === "payment-initiated" && drawerBill.physicalVerification?.done) {
      releaseForm.resetFields();
      const defaultPaid = Math.max(0, netAfterAdvance(drawerBill) - (drawerBill.tdsAmount || 0));
      releaseForm.setFieldsValue({ paymentDate: dayjs(), paymentMode: "neft", paidAmount: defaultPaid });
      setReleaseAdvanceAmount(drawerBill.advanceRecovery || null);
      setReleasePendingAdvances([]);
      if (drawerBill.projectId && drawerBill.vendorCode) {
        setReleaseAdvancesLoading(true);
        apiClient.get<{ advanceSlips: AdvanceSlipOpt[] }>(`/advance-slips/pending?projectId=${drawerBill.projectId}&vendorCode=${drawerBill.vendorCode}`)
          .then((r) => {
            const slips = (r.data.advanceSlips || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
            setReleasePendingAdvances(slips);
          })
          .catch(() => setReleasePendingAdvances([]))
          .finally(() => setReleaseAdvancesLoading(false));
      }
    }

    if (drawerBill.workOrderId) {
      setDrawerWOCategory(undefined);
      apiClient.get<{ workOrder: Record<string, unknown> }>(`/work-orders/${drawerBill.workOrderId}`)
        .then((r) => setDrawerWOCategory((r.data.workOrder?.category as string) || ""))
        .catch(() => setDrawerWOCategory(undefined));
    } else {
      setDrawerWOCategory(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen, drawerBillId, drawerBill?.status, drawerBill?.physicalVerification?.done]);

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

  // ── Stage actions (all fire from the single drawer) ───────────

  async function handleMakerConfirm() {
    if (!drawerBillId) return;
    setMakerSaving(true);
    try {
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/maker-confirm`, { remarks: makerRemarks || undefined });
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
        tdsPercent: approverTdsPercent,
        tdsAmount:  approverTdsAmount,
        remarks:    approverRemarks || undefined,
      });
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Payment initiated — pending physical verification and release");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to initiate payment");
    } finally {
      setApproverSaving(false);
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
    if (!drawerBillId || !drawerBill) return;
    try {
      const values = await releaseForm.validateFields();
      setReleaseSaving(true);

      // Distribute the entered recovery amount across outstanding slips oldest-first,
      // capped at each slip's own balance, so a single number the user types becomes
      // a concrete per-slip ledger update on the backend.
      const recoveries: { slipId: string; amount: number }[] = [];
      let remaining = releaseAdvanceAmount || 0;
      for (const slip of releasePendingAdvances) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, slip.balance);
        if (take > 0) recoveries.push({ slipId: slip._id, amount: take });
        remaining -= take;
      }

      const body = {
        paymentUTR:             values.paymentUTR,
        paymentMode:            values.paymentMode,
        paymentDate:            values.paymentDate ? dayjs(values.paymentDate as string).toISOString() : undefined,
        paymentBank:            values.paymentBank,
        paymentReleasedBy:      values.paymentReleasedBy,
        paidAmount:             values.paidAmount,
        retentionReleased:      values.retentionReleased || 0,
        retentionReleaseRemark: values.retentionReleaseRemark || "",
        ...(recoveries.length ? { advanceRecoveries: recoveries } : {}),
      };
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${drawerBillId}/release`, body);
      updateBillInList(normalizeId(res.data.bill) as unknown as Bill);
      message.success("Payment released");
    } catch (err: unknown) {
      const e = err as { errorFields?: unknown; response?: { data?: { message?: string } } };
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || "Failed to release payment");
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
      render: (v?: string) => v
        ? <Tag style={{ fontFamily: "monospace", background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", borderRadius: 6 }}>{v}</Tag>
        : <span style={{ color: "#C0C4CC" }}>—</span>,
    },
    {
      title: "Vendor",
      dataIndex: "vendorName",
      width: 180,
      render: (v?: string) => v || <span style={{ color: "#C0C4CC" }}>—</span>,
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
      return (
        <div style={{ ...sectionPanelStyle, background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#DC2626", marginBottom: 8 }}>Reject Bill</div>
          <Input.TextArea
            rows={3}
            placeholder="Explain why this bill is being rejected…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Button danger type="primary" loading={rejectSaving} disabled={!rejectReason.trim()} onClick={handleRejectConfirm}>
              Confirm Rejection
            </Button>
            <Button onClick={() => { setRejecting(false); setRejectReason(""); }}>Cancel</Button>
          </div>
        </div>
      );
    }

    switch (bill.status) {
      case "draft":
        if (!canMaker) return <MutedNote text="Awaiting a maker to confirm this bill." />;
        return (
          <div style={sectionPanelStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#FF7A00", marginBottom: 8 }}>Confirm as Maker</div>
            <Input.TextArea rows={2} placeholder="Remarks (optional)" value={makerRemarks} onChange={(e) => setMakerRemarks(e.target.value)} />
          </div>
        );

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
            <Input.TextArea rows={2} style={{ marginTop: 8 }} placeholder="Remarks (optional)" value={checkerRemarks} onChange={(e) => setCheckerRemarks(e.target.value)} />
          </div>
        );
      }

      case "approved": {
        if (!canApprover) return <MutedNote text="Awaiting an approver to sign off on this bill." />;
        const guard = sameActor(user, bill.checkerBy) ? "You checked this bill — a different user must give final approval." : undefined;
        return (
          <div style={sectionPanelStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#3730a3", marginBottom: 8 }}>Approver Sign-off</div>
            {guard && <div style={{ fontSize: 12, color: "#d97706", marginBottom: 8 }}>⚠ {guard}</div>}
            <Row gutter={12}>
              <Col span={12}>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>TDS %</div>
                <InputNumber style={{ width: "100%" }} min={0} max={100} value={approverTdsPercent} onChange={(v) => setApproverTdsPercent(Number(v) || 0)} />
              </Col>
              <Col span={12}>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>TDS Amount to Deduct (₹)</div>
                <InputNumber style={{ width: "100%" }} min={0} value={approverTdsAmount} onChange={(v) => setApproverTdsAmount(Number(v) || 0)} />
              </Col>
            </Row>
            <Input.TextArea rows={2} style={{ marginTop: 8 }} placeholder="Remarks (optional)" value={approverRemarks} onChange={(e) => setApproverRemarks(e.target.value)} />
            <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 8 }}>
              The bill will show as "Payment Initiated" until physical verification and release.
            </div>
          </div>
        );
      }

      case "payment-initiated": {
        if (!bill.physicalVerification?.done) {
          if (!canRelease) return <MutedNote text="Awaiting physical verification." />;
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
            <div style={{ fontWeight: 700, fontSize: 13, color: "#7c3aed", marginBottom: 8 }}>Release Payment</div>

            <div style={{ border: "1px solid #fde68a", borderRadius: 8, padding: "12px 14px", marginBottom: 14, background: "#fefce8" }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: "#92400e", marginBottom: 8 }}>Advance Recovery</div>
              {releaseAdvancesLoading && <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8 }}>Checking pending advances…</div>}
              {!releaseAdvancesLoading && releasePendingAdvances.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {releasePendingAdvances.map(slip => (
                    <div key={slip._id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid #fde68a" }}>
                      <span style={{ color: "#78350f" }}>{slip.slipNo}{slip.reference ? ` — ${slip.reference}` : ""}</span>
                      <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#b45309" }}>Balance: ₹{Math.round(slip.balance).toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              )}
              {!releaseAdvancesLoading && releasePendingAdvances.length === 0 && (
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8 }}>No outstanding advance slips for this vendor on this project.</div>
              )}
              <InputNumber<number>
                style={{ width: "100%" }}
                prefix="− ₹"
                value={releaseAdvanceAmount}
                onChange={(v) => setReleaseAdvanceAmount(v)}
                min={0}
                max={releasePendingAdvances.length > 0 ? releasePendingAdvances.reduce((s, sl) => s + sl.balance, 0) : undefined}
                precision={0}
                placeholder="0 — leave blank to skip recovery"
              />
              <div style={{ fontSize: 11, color: "#92400e", marginTop: 6 }}>
                Allocated oldest-first across the slips above, capped at each slip's balance.
              </div>
            </div>

            <Form form={releaseForm} layout="vertical">
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
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", marginBottom: 10 }}>
                  🔓 Hold / Retention Release (optional)
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
                  If this payment also includes releasing previously withheld retention, enter the hold amount below. It will appear as a separate line in the receipt with no TDS.
                </div>
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item label="Hold Amount Released (₹)" name="retentionReleased" initialValue={0} style={{ marginBottom: 0 }}>
                      <InputNumber<number>
                        style={{ width: "100%", fontFamily: "monospace" }}
                        min={0} precision={0}
                        formatter={(v) => `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                        parser={(v) => Number((v || "").replace(/[₹\s,]/g, ""))}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="Remark (e.g. RA-0010 DLP)" name="retentionReleaseRemark" style={{ marginBottom: 0 }}>
                      <Input placeholder="Which bill / period" />
                    </Form.Item>
                  </Col>
                </Row>
              </div>

              <Form.Item
                label="Total Amount Paid (₹)"
                name="paidAmount"
                rules={[{ required: true, message: "Enter the total amount actually paid" }]}
                extra={
                  <Form.Item noStyle shouldUpdate={(prev, cur) => prev.paidAmount !== cur.paidAmount || prev.retentionReleased !== cur.retentionReleased}>
                    {({ getFieldValue }) => {
                      const paid    = getFieldValue("paidAmount") as number | undefined;
                      const retRel  = (getFieldValue("retentionReleased") as number) || 0;
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
          </div>
        );
      }

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
        return canMaker ? { label: "Confirm", color: "#FF7A00", onClick: handleMakerConfirm, loading: makerSaving } : null;
      case "submitted":
      case "verified": {
        if (!canChecker) return null;
        const guard = sameActor(user, bill.makerBy) ? "You confirmed this bill as maker — a different user must check it." : undefined;
        return { label: "Verify & Approve", color: "#16a85a", onClick: handleCheckerApprove, loading: checkerSaving, disabled: !!guard, tooltip: guard };
      }
      case "approved": {
        if (!canApprover) return null;
        const guard = sameActor(user, bill.checkerBy) ? "You checked this bill — a different user must give final approval." : undefined;
        return { label: "Approve & Initiate Payment", color: "#3730a3", onClick: handleApproverInitiate, loading: approverSaving, disabled: !!guard, tooltip: guard };
      }
      case "payment-initiated":
        if (!canRelease) return null;
        if (!bill.physicalVerification?.done) {
          return { label: "Mark Physically Verified", color: "#d97706", onClick: handlePhysVerifyConfirm, loading: physSaving, disabled: !(physPrinted && physAttachments && physSigned) };
        }
        return { label: "Release Payment", color: "#7c3aed", onClick: handleReleaseConfirm, loading: releaseSaving };
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
        <Col xs={12} sm={8} md={4}>
          <StatCard label="Draft" value={draftBills.length} sub="Awaiting maker" icon={<FileAddOutlined />} accent="#6B7280" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <StatCard label="To Verify" value={submittedBills.length} sub="Awaiting checker" icon={<SafetyCertificateOutlined />} accent="#2563EB" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <StatCard label="To Approve" value={approvedBills.length} sub="Awaiting approver" icon={<CheckCircleOutlined />} accent="#7C3AED" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <StatCard label="Payment Pending" value={paymentInitiatedBills.length} sub="Verify + release" icon={<ClockCircleOutlined />} accent="#D97706" />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <StatCard label="Paid" value={stats.paidThisMonthCount} sub={`${fmt(stats.paidThisMonthAmt)} this month`} icon={<DollarOutlined />} accent="#16A34A" />
        </Col>
        <Col xs={12} sm={8} md={4}>
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
                {!rejecting && canRejectAny && !["paid", "rejected"].includes(drawerBill.status) && (
                  <Button danger icon={<CloseCircleOutlined />} onClick={() => setRejecting(true)}>Reject</Button>
                )}
                {!rejecting && primaryAction && (
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
              <Col span={8}>
                <Form.Item label="GST Slab" name="gstPercent" initialValue={18} tooltip="GST % applicable on this bill. TDS deduction is handled at payment time.">
                  <Select
                    onChange={(v) => setNewGstPercent(Number(v))}
                    options={[
                      { label: "0% — Exempt / Nil", value: 0 },
                      { label: "5%", value: 5 },
                      { label: "12%", value: 12 },
                      { label: "18% (Standard)", value: 18 },
                    ]}
                  />
                </Form.Item>
              </Col>
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
    </PageShell>
  );
}
