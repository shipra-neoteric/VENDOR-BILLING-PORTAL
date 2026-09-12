import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import type { Contractor, Consultant } from "../../types/VendorBilling";
import { BILL_STATUS_LABEL } from "../constants/billStatus";
import type { BillStatus } from "../constants/billStatus";
import { billFinancials } from "./billMath";

// printBill only ever learned the Contractor shape — a Consultant (billed for
// professional-services work orders) carries the exact same bank/tax fields
// under different identity field names (firmName vs companyName, etc.), so
// it's adapted into a Contractor-shaped object here rather than teaching the
// print template a second party shape.
function consultantAsContractor(c: Consultant): Contractor {
  return {
    id: c.id,
    vendorCode: c.consultantCode,
    companyName: c.firmName,
    ownerName: c.principalName,
    address: c.address || "",
    mobile: c.mobile,
    alternateMobile: c.alternateMobile,
    email: c.email,
    accountHolderName: c.accountHolderName || "",
    bankName: c.bankName || "",
    accountNumber: c.accountNumber || "",
    ifscCode: c.ifscCode || "",
    branchName: c.branchName || "",
    gstNumber: c.gstNumber,
    panNumber: c.panNumber,
    aadhaarNumber: c.aadhaarNumber,
    workTypes: [],
    status: c.status,
  };
}

// A bill's vendor is either a Contractor or a Consultant — tries Contractor
// first (the common case), falls back to Consultant (adapted above) so a
// consultant bill's print/PDF gets real bank details too, instead of the
// blank "Bank Details" section a Contractor-only lookup silently produces.
export async function resolvePrintParty(vendorCode: string | undefined): Promise<Contractor | null> {
  if (!vendorCode) return null;
  try {
    const cRes = await apiClient.get<{ contractors: Contractor[] }>("/contractors", { params: { search: vendorCode } });
    const contractor = cRes.data.contractors.find((c) => c.vendorCode === vendorCode);
    if (contractor) return contractor;
  } catch { /* fall through to the consultant lookup below */ }
  try {
    const sRes = await apiClient.get<{ consultants: Consultant[] }>("/consultants", { params: { search: vendorCode } });
    const consultant = sRes.data.consultants.find((c) => c.consultantCode === vendorCode);
    if (consultant) return consultantAsContractor(consultant);
  } catch { /* no match in either collection */ }
  return null;
}

export interface PrintableBillUser {
  _id?: string;
  name?: string;
  role?: string;
}

export interface PrintableLineItem {
  description: string;
  remarks?: string;
  // The DRI's own notes from the day-to-day progress entries billed here —
  // distinct from `remarks`, which is the scope item's static instruction note.
  progressRemarks?: string;
  // Where on site this was logged (Tower/Floor/Plot…) — distinct from the
  // bill's own overall projectLocation, and often more specific than it.
  location?: string;
  unit?: string;
  billedQty: number;
  rate: number;
  amount: number;
}

// The subset of RunningBill fields the print template actually reads — a real
// Bill (from GET /bills/:id) satisfies this structurally, and so does a
// not-yet-created bill request assembled purely from BillRequest fields
// (Site Progress prints both through this same function/template).
export interface PrintableBill {
  billNo: string;
  // Set only for a bill that originated from a Bill Request approval chain
  // — its own reqNo (e.g. "BR-1234"), printed above billNo so both numbers
  // are traceable on the same printout. Unset for a manually-created bill.
  billRequestNo?: string;
  workOrderNo?: string;
  projectName?: string;
  projectLocation?: string;
  vendorCode?: string;
  vendorName?: string;
  // The issuing entity this bill was raised under — this system spans
  // multiple legal companies, not just "Neoteric Properties". Falls back to
  // that name when unset (older bills predating this field).
  companyName?: string;
  generatedBy?: string;
  billDate?: string;
  lineItems: PrintableLineItem[];
  amount: number;
  gstPercent?: number;
  retentionPercent?: number;
  retentionAmount?: number;
  advanceRecovery?: number;
  supersedeDeduction?: number;
  // Which bills this one supersedes (relationshipType 'SUPERSEDES') — used
  // only to list their billNos next to the deduction row below.
  linkedBills?: { billNo: string; relationshipType?: string; amount?: number; description?: string }[];
  tdsPercent?: number;
  tdsAmount?: number;
  adjustmentAmount?: number;
  adjustmentRemark?: string;
  remarks?: string;
  status: BillStatus | string;
  agmApprovedBy?: PrintableBillUser | null;
  agmApprovedAt?: string;
  verifiedBy?: PrintableBillUser | null;
  verifiedAt?: string;
  // L2 (GM) sign-off, denormalized onto the RunningBill at creation time —
  // read as a fallback below whenever verifiedBy/verifiedAt (a legacy field
  // no current action writes) is absent, so the printout's "L2 Approval"
  // block isn't blank for a bill whose GM sign-off never touched verifiedBy.
  gmApprovedBy?: PrintableBillUser | null;
  gmApprovedAt?: string;
  // The REAL Accounts Payment chain's own L1 AGM / L2 Director sign-off —
  // set by the verify -> l1-agm-approve -> l2-director-approve actions
  // themselves (billController.js), independent of agmApprovedBy/gmApprovedBy/
  // verifiedBy above (which only ever get set for a bill that came out of a
  // BillRequest's own AGM/GM pre-chain, at bill-creation time). Every bill
  // that actually goes through Accounts Payment sets these two — they're the
  // authoritative source for the signature block below, not the legacy ones.
  l1ApprovedBy?: PrintableBillUser | null;
  l1ApprovedAt?: string;
  l2ApprovedBy?: PrintableBillUser | null;
  l2ApprovedAt?: string;
  // A department configured for 3/4 approval levels (Users -> Departments'
  // Approval Rule) carries its BillRequest pre-chain's L3/L4 sign-off onto
  // the bill too (see gmApprovedBy's own comment above) — the signature
  // block below adds an extra column for each of these only when present,
  // instead of a fixed 2-column L1/L2 layout that silently dropped them.
  l3ApprovedBy?: PrintableBillUser | null;
  l3ApprovedAt?: string;
  l4ApprovedBy?: PrintableBillUser | null;
  l4ApprovedAt?: string;
  // Same idea, but for a manually-created bill's OWN pre-chain
  // (billController.js's manualAgmApprove/manualGmApprove/manualL3Approve/
  // manualL4Approve) — a completely separate field set from l3ApprovedBy/
  // l4ApprovedBy above, which only ever get set via a BillRequest.
  manualL3ApprovedBy?: PrintableBillUser | null;
  manualL3ApprovedAt?: string;
  manualL4ApprovedBy?: PrintableBillUser | null;
  manualL4ApprovedAt?: string;
  approvedBy?: PrintableBillUser | null;
  paymentInitiatedBy?: PrintableBillUser | null;
  paymentDate?: string;
  paymentMode?: string;
  paymentUTR?: string;
  paymentBank?: string;
  paymentReleasedBy?: string;
  paidAmount?: number;
  retentionReleased?: number;
  retentionReleaseRemark?: string;
}

// Opens a print-ready HTML view of a bill in a new window and triggers
// window.print() — the single template shared by Accounts Payment (real,
// fully-formed RunningBills) and Site Progress (bill requests, including
// ones that haven't reached a RunningBill yet — statusLabel overrides the
// status pill's text for that case since there's no BillStatus to look up).
export function printBill(
  bill: PrintableBill,
  contractor: Contractor | null,
  mode: "pre" | "post" = "pre",
  statusLabel?: string
) {
  const companyName = bill.companyName || "Neoteric Properties";
  const contractorName = bill.vendorName || contractor?.companyName || "—";
  // Contractor names often come in as ALL CAPS from older records — Title Case
  // reads better for the masthead than shouting the whole thing.
  const contractorNameTitleCase = contractorName.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const rows = (bill.lineItems || [])
    .map(
      (li, i) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${i + 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${li.description}${li.remarks ? `<div style="font-size:10px;color:#d97706;margin-top:3px">📌 ${li.remarks}</div>` : ""}${li.location ? `<div style="font-size:10px;color:#555;margin-top:3px"><strong>Location:</strong> ${li.location}</div>` : ""}${li.progressRemarks ? `<ul style="font-size:10px;color:#2563eb;margin:3px 0 0;padding-left:14px">${li.progressRemarks.split("\n").filter(Boolean).map(note => `<li>${note}</li>`).join("")}</ul>` : ""}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${li.unit || "-"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${(li.billedQty || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${(li.rate || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${(li.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>`
    )
    .join("");

  // The specific site location (Tower/Floor/Plot…) the DRI actually logged
  // this progress against is more useful here than the work order's own
  // generic overall location — same fallback the Bill Approval view modal
  // uses, so print and view show the same thing.
  const itemLocations = [...new Set((bill.lineItems || []).map(li => li.location).filter(Boolean))];
  const headerLocation = itemLocations.length > 0 ? itemLocations.join(" · ") : bill.projectLocation;

  const bankSection =
    contractor?.bankName
      ? `<div style="border:1px solid #e8e8e8;border-radius:6px;padding:14px;margin-bottom:24px">
          <h4 style="font-size:10px;text-transform:uppercase;color:#f47b20;letter-spacing:1px;margin:0 0 10px">Bank Details</h4>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            <div><span style="font-size:10px;color:#999;display:block">Account Holder Name</span><strong>${contractor.accountHolderName || "-"}</strong></div>
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
<style>
*{box-sizing:border-box;margin:0;padding:0}
/* Without this, Windows "High Contrast" mode (which some browsers, notably
   Edge, honor via the forced-colors media feature) strips every author
   color here — orange headings, colored borders, the status pill — down to
   a plain grayscale palette. This tells the browser to keep our colors as
   authored, on screen and when printed/saved as PDF. */
html{forced-color-adjust:none;-ms-high-contrast-adjust:none}
*{forced-color-adjust:none;-ms-high-contrast-adjust:none}
body{font-family:Arial,sans-serif;padding:30px;color:#333;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
@media print{body{padding:15px}button{display:none!important}}
</style>
</head><body>

<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #f47b20;padding-bottom:16px;margin-bottom:20px">
  <div>
    <div style="font-size:20px;font-weight:bold;color:#f47b20">${contractorNameTitleCase}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#333">${mode === 'pre' ? 'RUNNING BILL' : 'PAYMENT RECEIPT'}</div>
    ${bill.billRequestNo ? `<div style="margin-top:6px;font-size:13px"><strong>Bill Request No:</strong> ${bill.billRequestNo}</div>` : ""}
    <div style="${bill.billRequestNo ? "" : "margin-top:6px;"}font-size:13px"><strong>Bill No:</strong> ${bill.billNo}</div>
    <div style="font-size:13px"><strong>Date:</strong> ${bill.billDate ? dayjs(bill.billDate).format("DD/MM/YYYY") : "-"}</div>
    <div style="font-size:13px"><strong>Status:</strong> <span style="background:${mode === 'pre' ? '#f47b20' : '#16a34a'};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px">${mode === 'pre' ? (statusLabel ? statusLabel.toUpperCase() : (BILL_STATUS_LABEL[bill.status] || 'ON HOLD').toUpperCase()) : 'PAID'}</span></div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
  ${mode === 'post' ? `
  <div style="border:1px solid #e8e8e8;border-radius:6px;padding:14px;background:#fafafa">
    <h4 style="font-size:10px;text-transform:uppercase;color:#f47b20;letter-spacing:1px;margin:0 0 10px">From (Payer)</h4>
    <p style="font-weight:bold;font-size:14px;margin-bottom:4px">${companyName}</p>
    <p style="margin-bottom:3px;color:#555">Project Cost Center</p>
    <p style="margin-bottom:3px;color:#555">Site / Project: <strong>${bill.projectName || "-"}</strong></p>
    ${bill.workOrderNo ? `<p style="margin-bottom:3px;color:#555">Work Order: ${bill.workOrderNo}</p>` : ""}
    ${bill.generatedBy ? `<p style="margin-bottom:3px;color:#555">Generated By: ${bill.generatedBy}</p>` : ""}
    ${headerLocation ? `<p style="color:#555">Location: ${headerLocation}</p>` : ""}
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
    <p style="font-weight:bold;font-size:14px;margin-bottom:4px">${companyName}</p>
    <p style="margin-bottom:3px;color:#555">Site / Project: <strong>${bill.projectName || "-"}</strong></p>
    ${bill.workOrderNo ? `<p style="margin-bottom:3px;color:#555">Work Order: ${bill.workOrderNo}</p>` : ""}
    ${bill.generatedBy ? `<p style="margin-bottom:3px;color:#555">Generated By: ${bill.generatedBy}</p>` : ""}
    ${headerLocation ? `<p style="color:#555">Location: ${headerLocation}</p>` : ""}
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
  <div style="min-width:${(bill.linkedBills ?? []).some(l => l.relationshipType === 'SUPERSEDES' && l.description) ? 480 : 320}px;border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;font-family:monospace">
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee">
      <span>Gross Amount</span><span>₹${(bill.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
    ${(bill.retentionAmount ?? 0) > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#dc2626">
      <span>Hold / Retention${(bill.retentionPercent ?? 0) > 0 ? ` @ ${bill.retentionPercent}%` : ""}</span>
      <span>− ₹${(bill.retentionAmount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>` : ""}
    ${(bill.advanceRecovery ?? 0) > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#d97706">
      <span>Less: Advance Recovery</span><span>− ₹${(bill.advanceRecovery ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>` : ""}
    ${(() => {
      const { gstAmount } = billFinancials({ gross: bill.amount || 0, gstPercent: bill.gstPercent ?? 0, retentionAmount: bill.retentionAmount ?? 0, advanceRecovery: bill.advanceRecovery ?? 0, supersedeDeduction: bill.supersedeDeduction ?? 0 });
      return gstAmount > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#16a34a">
      <span>GST @ ${bill.gstPercent}%</span><span>+ ₹${gstAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>` : "";
    })()}
    ${(() => {
      if ((bill.supersedeDeduction ?? 0) <= 0) return "";
      const superseded = (bill.linkedBills ?? []).filter(l => l.relationshipType === 'SUPERSEDES');
      const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      return `
    <div style="padding:9px 14px 4px;border-bottom:1px solid #eee">
      <div style="color:#dc2626;font-weight:bold;font-size:12px;margin-bottom:4px">Less: Superseded Bills</div>
      ${superseded.map(l => `
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:2px 0;color:#dc2626">
        <span style="white-space:nowrap">${l.billNo}${l.description ? ` <span style="font-weight:normal;color:#b91c1c;opacity:.75">— ${l.description}</span>` : ""}</span>
        <span style="white-space:nowrap">− ${money(l.amount ?? 0)}</span>
      </div>`).join("")}
      <div style="display:flex;justify-content:space-between;padding:4px 0 2px;border-top:1px solid #fecaca;margin-top:2px;color:#991b1b;font-weight:bold">
        <span>Total</span><span>− ${money(bill.supersedeDeduction ?? 0)}</span>
      </div>
    </div>`;
    })()}
    ${(() => {
      const netPay = billFinancials({ gross: bill.amount || 0, gstPercent: bill.gstPercent ?? 0, retentionAmount: bill.retentionAmount ?? 0, advanceRecovery: bill.advanceRecovery ?? 0, supersedeDeduction: bill.supersedeDeduction ?? 0 }).netAfterHold;
      if (mode === 'pre') {
        // PRE-PAYMENT: end at net payable (Hold/Advance already deducted above)
        return `
    <div style="display:flex;justify-content:space-between;padding:13px 14px;background:#fff7ed;font-weight:bold;font-size:15px;color:#f47b20;border-top:2px solid #fed7aa">
      <span>NET PAYABLE</span>
      <span>₹${netPay.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>`;
      } else {
        // POST-PAYMENT: show net payable, TDS, hold release, actually paid —
        // rounded to paise (2 decimals), not the nearest whole rupee.
        const retRel = Math.round((bill.retentionReleased ?? 0) * 100) / 100;
        const billPortion = bill.paidAmount != null ? Math.max(0, Math.round((bill.paidAmount - retRel) * 100) / 100) : null;
        const tds = billPortion != null ? Math.max(0, Math.round((netPay - billPortion) * 100) / 100) : 0;
        return `
    <div style="display:flex;justify-content:space-between;padding:11px 14px;background:#fff7ed;font-weight:bold;font-size:14px;color:#f47b20;border-top:2px solid #fed7aa">
      <span>Net Payable</span><span>₹${netPay.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>${tds > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#dc2626">
      <span>Less: TDS Deducted${bill.tdsPercent ? ` (${bill.tdsPercent}%)` : ""}</span><span>− ₹${tds.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>` : ""}${(bill.adjustmentAmount ?? 0) !== 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:${(bill.adjustmentAmount ?? 0) > 0 ? "#16a34a" : "#dc2626"}">
      <span>Adjustment${bill.adjustmentRemark ? ` (${bill.adjustmentRemark})` : ""}</span><span>${(bill.adjustmentAmount ?? 0) > 0 ? "+" : "−"} ₹${Math.abs(bill.adjustmentAmount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>` : ""}${retRel > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#0369a1;font-weight:600">
      <span>Hold / Retention Released${bill.retentionReleaseRemark ? ` (${bill.retentionReleaseRemark})` : ""}</span><span>+ ₹${retRel.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>` : ""}${bill.paidAmount != null ? `
    <div style="display:flex;justify-content:space-between;padding:13px 14px;background:#f0fdf4;font-weight:bold;font-size:15px;color:#16a34a;border-top:2px solid #bbf7d0">
      <span>Actually Paid</span><span>₹${bill.paidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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

${mode === 'pre' ? (() => {
  // Renders one signature column — used for the fixed "Contractor" slot and
  // for every approval level actually present on this bill, so a 3/4-level
  // department's L3/L4 sign-off gets its own column instead of being
  // silently dropped by what used to be a fixed 2-column (L1/L2) layout.
  const signatureCol = (title: string, person: PrintableBillUser | null | undefined, at: string | undefined) => `
  <div style="text-align:center">
    <div style="border-top:1px solid #333;width:85%;margin:0 auto 6px"></div>
    <p style="font-size:12px;color:#333;font-weight:700">${title}</p>
    <p style="font-size:11px;color:#666">${person ? `${person.name}${person.role ? ` (${person.role})` : ""}` : "—"}</p>
    <p style="font-size:11px;color:${at ? "#16a34a" : "#999"}">${at ? `Approved ${dayjs(at).format("DD/MM/YYYY, hh:mm A")}` : "&nbsp;"}</p>
  </div>`;

  const l1 = bill.l1ApprovedBy || bill.agmApprovedBy;
  const l1At = bill.l1ApprovedAt || bill.agmApprovedAt;
  const l2 = bill.l2ApprovedBy || bill.verifiedBy || bill.gmApprovedBy;
  const l2At = bill.l2ApprovedAt || bill.verifiedAt || bill.gmApprovedAt;

  const cols = [
    signatureCol("Contractor", { name: bill.vendorName || "—" }, undefined),
    signatureCol("L1 Approval", l1, l1At),
    signatureCol("L2 Approval", l2, l2At),
  ];
  const l3 = bill.l3ApprovedBy || bill.manualL3ApprovedBy;
  const l3At = bill.l3ApprovedAt || bill.manualL3ApprovedAt;
  const l4 = bill.l4ApprovedBy || bill.manualL4ApprovedBy;
  const l4At = bill.l4ApprovedAt || bill.manualL4ApprovedAt;
  if (l3) cols.push(signatureCol("L3 Approval", l3, l3At));
  if (l4) cols.push(signatureCol("L4 Approval", l4, l4At));

  // A grid with exactly cols.length equal-width tracks keeps every signature
  // in one single row regardless of count (2 through 5) — flex-wrap here
  // would wrap the LAST column(s) onto a second line instead of shrinking
  // all of them evenly, misaligning "L3" under "Contractor" and "L4" under
  // "L1" once a 3rd/4th approval level pushed the row past its width.
  return `<div style="display:grid;grid-template-columns:repeat(${cols.length},1fr);gap:12px;margin-top:40px;padding-top:48px;border-top:1px solid #eee">${cols.join("")}</div>`;
})() : ""}

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
    // Exactly one of these two triggers actually fires the print in any
    // given browser — but which one varies (some never fire 'load' after
    // document.write; others do, even when readyState already reads
    // "complete" at this point) — so both are wired, guarded to run only
    // once between them. Without the guard, a browser where both trigger
    // opened the print dialog two or three times over.
    let printed = false;
    const doPrint = () => { if (printed) return; printed = true; win.focus(); win.print(); };
    win.addEventListener("load", doPrint);
    if (win.document.readyState === "complete") doPrint();
  }
}
