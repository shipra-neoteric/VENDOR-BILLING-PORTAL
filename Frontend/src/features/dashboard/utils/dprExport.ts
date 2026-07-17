import type { DPRReport } from "../../../types/DPR";
import { formatDprDateRange } from "./dprDateRange";

// "Export Excel" as CSV — opens natively in Excel with zero extra dependency,
// consistent with this app's preference for hand-rolled/dependency-light tooling.
function toCsvRow(cells: (string | number)[]): string {
  return cells.map(c => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}

function section(title: string, header: string[], rows: (string | number)[][]): string[] {
  const lines = [toCsvRow([title]), toCsvRow(header)];
  for (const r of rows) lines.push(toCsvRow(r));
  lines.push("");
  return lines;
}

const fmt = (n: number) => Math.round(n || 0);

export function downloadDPRCsv(viewType: "operational" | "financial", report: DPRReport, projectLabel: string) {
  const { operational: o, financial: f, meta } = report;
  const lines: string[] = [
    toCsvRow([`${viewType.toUpperCase()} MIS REPORT`]),
    toCsvRow(["Project", projectLabel]),
    toCsvRow([meta.isSingleDay ? "Date" : "Period", formatDprDateRange(meta)]),
    toCsvRow(["Generated", new Date(meta.generatedAt).toLocaleString("en-IN")]),
    "",
  ];

  if (viewType === "operational") {
    lines.push(...section("Today's Operational Highlights", ["Highlight"], o.briefs.map(b => [b])));
    lines.push(...section("Operational KPIs", ["Metric", "Value"], [
      ["Work Orders Created", o.kpis.woCreatedToday],
      ["Bill Requests Raised", o.kpis.billRequestsToday],
      ["Bills Approved", o.kpis.billsApprovedToday],
      ["Payments Released", o.kpis.paymentsReleasedToday],
      ["Advance Payments", o.kpis.advancePaymentsToday],
      ["Site Progress Entries", o.kpis.progressEntriesToday],
      ["Pending Approvals", o.kpis.pendingApprovals],
      ["Contractors Active", o.kpis.contractorsActiveToday],
    ]));
    lines.push(...section("Daily Workflow Funnel", ["Stage", "Count"], o.funnel.map(s => [s.label, s.count])));
    lines.push(...section("Project-wise Operational Performance", ["Project", "WO", "Bills", "Approved", "Paid", "Progress %"],
      o.projectPerformance.map(p => [p.projectName, p.woCount, p.billRequestCount, p.approvedCount, p.paidCount, p.progressPct])));
    lines.push(...section("Work Orders by Category", ["Category", "Count", "%"], o.woByCategory.map(c => [c.name, c.count, c.pct])));
    lines.push(...section("Site Progress Today", ["Project", "Work Order", "Description", "Qty Today", "Unit", "Completion %"],
      o.siteProgressToday.map(s => [s.projectName, s.workOrderNo, s.description, s.todayQty, s.unit, s.completionPct])));
  } else {
    lines.push(...section("Today's Financial Highlights", ["Highlight"], f.briefs.map(b => [b])));
    lines.push(...section("Financial KPIs", ["Metric", "Value"], [
      ["Amount Released", fmt(f.kpis.amountReleasedToday)],
      ["Bills Raised", fmt(f.kpis.billsRaisedValueToday)],
      ["Approved Value", fmt(f.kpis.approvedValueToday)],
      ["Pending Value", fmt(f.kpis.pendingValueToday)],
      ["Outstanding Liability", fmt(f.kpis.outstandingLiability)],
      ["Advance Amount", fmt(f.kpis.advanceAmountToday)],
    ]));
    lines.push(...section("Payment Breakdown", ["Item", "Amount"], [
      ["Released", fmt(f.paymentBreakdown.released)],
      ["Retention Held", fmt(f.paymentBreakdown.retentionHeld)],
      ["Advance Recovered", fmt(f.paymentBreakdown.advanceRecovered)],
      ["TDS", fmt(f.paymentBreakdown.tds)],
      ["Net Payment", fmt(f.paymentBreakdown.net)],
    ]));
    lines.push(...section("Top Projects", ["Project", "Released", "Progress %"],
      [...o.projectPerformance].sort((a, b) => b.releasedAmount - a.releasedAmount).slice(0, 5)
        .map(p => [p.projectName, fmt(p.releasedAmount), p.progressPct])));
    lines.push(...section("Aging Report", ["Contractor", "Project", "Bill No", "Amount", "Days Pending", "Status"],
      f.aging.table.map(r => [r.contractor, r.project, r.billNo, fmt(r.amount), r.daysPending, r.status])));
    lines.push(...section("Top Delayed Contractors", ["Contractor", "Pending Amount", "Days Waiting"],
      f.topDelayedContractors.map(c => [c.vendorName, fmt(c.pendingAmount), c.daysWaiting])));
    lines.push(...section("Advance Payments", ["Contractor", "Project", "Amount", "Reason", "Adjusted", "Balance"],
      f.advancePaymentsList.map(a => [a.vendorName, a.projectName, fmt(a.amount), a.reason, fmt(a.adjusted), fmt(a.balance)])));
  }

  const csv = lines.join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `MIS-Report-${viewType}-${meta.date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
