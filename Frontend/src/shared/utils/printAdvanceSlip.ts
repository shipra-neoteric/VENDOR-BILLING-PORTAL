import dayjs from "dayjs";
import type { Contractor } from "../../types/VendorBilling";

// Print view for an AdvanceSlip — same letterhead/FROM-TO/summary/bank-details
// conventions as printBill.ts's RunningBill template, adapted for a slip's
// own shape: no line items/GST/approval chain, so the "item table" is a
// single synthetic row for the advance itself, and the summary box shows
// Advance Given / Recovered / Balance instead of Gross/GST/Net Payable.
export interface PrintableAdvanceSlip {
  slipNo: string;
  contractorName?: string;
  contractorCode?: string;
  projectName?: string;
  companyName?: string;
  generatedBy?: string;
  amount: number;
  amountRecovered?: number;
  reference?: string;
  notes?: string;
  date?: string;
  status?: string;
}

const STATUS_LABEL: Record<string, string> = {
  outstanding: "Outstanding",
  partial: "Partially Recovered",
  recovered: "Recovered",
};

export function printAdvanceSlip(slip: PrintableAdvanceSlip, contractor: Contractor | null) {
  const money = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const companyName = slip.companyName || "Neoteric Properties";
  const contractorName = slip.contractorName || contractor?.companyName || "—";
  const contractorNameTitleCase = contractorName.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  const recovered = slip.amountRecovered ?? 0;
  const balance = (slip.amount || 0) - recovered;

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
<html><head><meta charset="UTF-8"><title>Advance Slip - ${slip.slipNo}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
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
    <div style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#333">ADVANCE SLIP</div>
    <div style="margin-top:6px;font-size:13px"><strong>Slip No:</strong> ${slip.slipNo}</div>
    <div style="font-size:13px"><strong>Date:</strong> ${slip.date ? dayjs(slip.date).format("DD/MM/YYYY") : "-"}</div>
    <div style="font-size:13px"><strong>Status:</strong> <span style="background:#f47b20;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px">${((slip.status && STATUS_LABEL[slip.status]) || slip.status || "—").toUpperCase()}</span></div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
  <div style="border:1px solid #e8e8e8;border-radius:6px;padding:14px;background:#fafafa">
    <h4 style="font-size:10px;text-transform:uppercase;color:#f47b20;letter-spacing:1px;margin:0 0 10px">From (Contractor)</h4>
    <p style="font-weight:bold;font-size:14px;margin-bottom:4px">${contractorName}</p>
    <p style="margin-bottom:3px;color:#555">Vendor Code: <strong>${slip.contractorCode || contractor?.vendorCode || "-"}</strong></p>
    ${contractor?.ownerName ? `<p style="margin-bottom:3px;color:#555">Contact: ${contractor.ownerName}</p>` : ""}
    ${contractor?.mobile ? `<p style="margin-bottom:3px;color:#555">Mobile: ${contractor.mobile}</p>` : ""}
    ${contractor?.address ? `<p style="margin-bottom:3px;color:#555">${contractor.address}</p>` : ""}
    ${contractor?.gstNumber ? `<p style="margin-bottom:3px;color:#555">GST: ${contractor.gstNumber}</p>` : ""}
    ${contractor?.panNumber ? `<p style="color:#555">PAN: ${contractor.panNumber}</p>` : ""}
  </div>
  <div style="border:1px solid #e8e8e8;border-radius:6px;padding:14px;background:#fafafa">
    <h4 style="font-size:10px;text-transform:uppercase;color:#f47b20;letter-spacing:1px;margin:0 0 10px">To</h4>
    <p style="font-weight:bold;font-size:14px;margin-bottom:4px">${companyName}</p>
    <p style="margin-bottom:3px;color:#555">Site / Project: <strong>${slip.projectName || "-"}</strong></p>
    ${slip.generatedBy ? `<p style="margin-bottom:3px;color:#555">Generated By: ${slip.generatedBy}</p>` : ""}
    ${slip.reference ? `<p style="color:#555">Reference: ${slip.reference}</p>` : ""}
  </div>
</div>

<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
  <thead>
    <tr>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:center;width:40px">Sr.</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:left">Description</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:center;width:70px">Unit</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:right;width:80px">Qty</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:right;width:110px">Rate (₹)</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:right;width:120px">Amount (₹)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">1</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${slip.notes || "Advance Payment"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">-</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">1.00</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${(slip.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${(slip.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
  </tbody>
</table>

<div style="display:flex;justify-content:flex-end;margin-bottom:24px">
  <div style="min-width:320px;border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;font-family:monospace">
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee">
      <span>Advance Given</span><span>${money(slip.amount)}</span>
    </div>
    ${recovered > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#16a34a">
      <span>Recovered</span><span>− ${money(recovered)}</span>
    </div>` : ""}
    <div style="display:flex;justify-content:space-between;padding:13px 14px;background:#fff7ed;font-weight:bold;font-size:15px;color:#f47b20;border-top:2px solid #fed7aa">
      <span>Balance</span>
      <span>${money(balance)}</span>
    </div>
  </div>
</div>

${bankSection}

${slip.notes ? `<div style="border:1px solid #e8e8e8;border-radius:6px;padding:12px;margin-bottom:24px"><strong>Remarks:</strong> ${slip.notes}</div>` : ""}

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
    let printed = false;
    const doPrint = () => { if (printed) return; printed = true; win.focus(); win.print(); };
    win.addEventListener("load", doPrint);
    if (win.document.readyState === "complete") doPrint();
  }
}
