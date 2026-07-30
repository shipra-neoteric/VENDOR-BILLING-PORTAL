import dayjs from "dayjs";
import type { Contractor } from "../../types/VendorBilling";
import { BILL_STATUS_LABEL } from "../constants/billStatus";
import type { BillStatus } from "../constants/billStatus";

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
  tdsPercent?: number;
  tdsAmount?: number;
  remarks?: string;
  status: BillStatus | string;
  agmApprovedBy?: PrintableBillUser | null;
  agmApprovedAt?: string;
  verifiedBy?: PrintableBillUser | null;
  verifiedAt?: string;
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
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${li.description}${li.remarks ? `<div style="font-size:10px;color:#d97706;margin-top:3px">📌 ${li.remarks}</div>` : ""}${li.progressRemarks ? `<div style="font-size:10px;color:#2563eb;margin-top:3px">👷 ${li.progressRemarks}</div>` : ""}</td>
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
    <div style="font-size:20px;font-weight:bold;color:#f47b20">${contractorNameTitleCase}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#333">${mode === 'pre' ? 'RUNNING BILL' : 'PAYMENT RECEIPT'}</div>
    <div style="margin-top:6px;font-size:13px"><strong>Bill No:</strong> ${bill.billNo}</div>
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
    <p style="font-weight:bold;font-size:14px;margin-bottom:4px">${companyName}</p>
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

${mode === 'pre' ? `<div style="display:flex;justify-content:space-around;margin-top:40px;padding-top:48px;border-top:1px solid #eee">
  <div style="text-align:center">
    <div style="border-top:1px solid #333;width:180px;margin:0 auto 6px"></div>
    <p style="font-size:12px;color:#666;font-weight:600">Contractor</p>
    <p style="font-size:12px;color:#999">&nbsp;</p>
  </div>
  <div style="text-align:center">
    <div style="border-top:1px solid #333;width:180px;margin:0 auto 6px"></div>
    <p style="font-size:12px;color:#666;font-weight:600">AGM${bill.agmApprovedBy ? ` — ${bill.agmApprovedBy.name}` : ""}</p>
    <p style="font-size:12px;color:#999">${bill.agmApprovedAt ? `Approved ${dayjs(bill.agmApprovedAt).format("DD/MM/YYYY")}` : companyName}</p>
  </div>
  <div style="text-align:center">
    <div style="border-top:1px solid #333;width:180px;margin:0 auto 6px"></div>
    <p style="font-size:12px;color:#666;font-weight:600">GM${bill.verifiedBy ? ` — ${bill.verifiedBy.name}` : ""}</p>
    <p style="font-size:12px;color:#999">${bill.verifiedAt ? `Approved ${dayjs(bill.verifiedAt).format("DD/MM/YYYY")}` : companyName}</p>
  </div>
</div>` : ""}

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
