import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { pdf } from "@react-pdf/renderer";
import type { DPRReport } from "../types/DPR";
import { formatDprDateRange } from "../features/dashboard/utils/dprDateRange";

const ORANGE = "#FF7A00";
const DARK = "#111827";
const MID = "#374151";
const GRAY = "#6B7280";
const LIGHT = "#F9FAFB";
const BORDER = "#D1D5DB";
const HDR_BG = "#1F2937";

const S = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: DARK, backgroundColor: "#fff" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: ORANGE },
  logoName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: DARK },
  logoSub: { fontSize: 8, color: GRAY, marginTop: 2 },
  docTitle: { textAlign: "right" },
  docMain: { fontSize: 14, fontFamily: "Helvetica-Bold", color: ORANGE },
  docSub: { fontSize: 9, color: MID, marginTop: 3 },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 3, marginBottom: 12, overflow: "hidden" },
  secHeader: { backgroundColor: ORANGE, paddingVertical: 5, paddingHorizontal: 10 },
  secTitle: { fontFamily: "Helvetica-Bold", color: "#fff", fontSize: 9, textTransform: "uppercase" },
  row: { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER },
  rowAlt: { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: LIGHT },
  cellLabel: { flex: 1.4, padding: "5px 10px", fontSize: 8.5, color: MID },
  cellVal: { flex: 1, padding: "5px 10px", fontSize: 8.5, color: DARK, textAlign: "right", fontFamily: "Helvetica-Bold" },
  hdr: { flexDirection: "row", backgroundColor: HDR_BG, padding: "5px 8px" },
  hdrText: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8 },
  col: { flex: 1, fontSize: 8, padding: "2px 4px" },
});

function KpiTable({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <View style={S.table} wrap={false}>
      <View style={S.secHeader}><Text style={S.secTitle}>{title}</Text></View>
      {rows.map((r, i) => (
        <View key={r.label} style={i === 0 ? S.row : S.row}>
          <Text style={S.cellLabel}>{r.label}</Text>
          <Text style={S.cellVal}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

function DataTable({ title, columns, rows }: { title: string; columns: string[]; rows: string[][] }) {
  return (
    <View style={S.table} wrap={false}>
      <View style={S.secHeader}><Text style={S.secTitle}>{title}</Text></View>
      <View style={S.hdr}>
        {columns.map(c => <Text key={c} style={[S.col, S.hdrText]}>{c}</Text>)}
      </View>
      {rows.length === 0 ? (
        <View style={S.row}><Text style={[S.col, { padding: "6px 10px", color: GRAY }]}>No records.</Text></View>
      ) : rows.map((row, i) => (
        <View key={i} style={i % 2 === 0 ? S.row : S.rowAlt}>
          {row.map((cell, j) => <Text key={j} style={S.col}>{cell}</Text>)}
        </View>
      ))}
    </View>
  );
}

const fmt = (n: number) => n ? "Rs " + Math.round(n).toLocaleString("en-IN") : "Rs 0";

export function DPRDocument({ viewType, report, projectLabel }: { viewType: "operational" | "financial"; report: DPRReport; projectLabel: string }) {
  const { operational: o, financial: f, meta } = report;
  const title = viewType === "operational" ? "Operational Report" : "Financial Report";

  return (
    <Document title={`${title} - ${meta.date}`} author="Neoteric Group">
      <Page size="A4" style={S.page}>
        <View style={S.headerRow}>
          <View>
            <Text style={S.logoName}>Neoteric Properties</Text>
            <Text style={S.logoSub}>Project Cost Center</Text>
          </View>
          <View style={S.docTitle}>
            <Text style={S.docMain}>{title.toUpperCase()}</Text>
            <Text style={S.docSub}>Project: {projectLabel}</Text>
            <Text style={S.docSub}>{meta.isSingleDay ? "Date" : "Period"}: {formatDprDateRange(meta)}</Text>
            <Text style={S.docSub}>Generated: {new Date(meta.generatedAt).toLocaleString("en-IN")}</Text>
          </View>
        </View>

        {viewType === "operational" && (
          <>
            <View style={S.table} wrap={false}>
              <View style={S.secHeader}><Text style={S.secTitle}>Today's Operational Highlights</Text></View>
              {o.briefs.map((b, i) => (
                <View key={i} style={i === 0 ? S.row : S.row}><Text style={[S.cellLabel, { flex: 1 }]}>• {b}</Text></View>
              ))}
            </View>
            <KpiTable title="Operational KPIs" rows={[
              { label: "Work Orders Created", value: String(o.kpis.woCreatedToday) },
              { label: "Bill Requests Raised", value: String(o.kpis.billRequestsToday) },
              { label: "Bills Approved", value: String(o.kpis.billsApprovedToday) },
              { label: "Payments Released", value: String(o.kpis.paymentsReleasedToday) },
              { label: "Advance Payments", value: String(o.kpis.advancePaymentsToday) },
              { label: "Site Progress Entries", value: String(o.kpis.progressEntriesToday) },
              { label: "Pending Approvals", value: String(o.kpis.pendingApprovals) },
              { label: "Contractors Active", value: String(o.kpis.contractorsActiveToday) },
            ]} />
            <DataTable title="Daily Workflow Funnel" columns={["Stage", "Count"]}
              rows={o.funnel.map(s => [s.label, String(s.count)])} />
            <DataTable title="Project-wise Operational Performance" columns={["Project", "WO", "Bills", "Approved", "Paid", "Progress"]}
              rows={o.projectPerformance.map(p => [p.projectName, String(p.woCount), String(p.billRequestCount), String(p.approvedCount), String(p.paidCount), `${p.progressPct}%`])} />
            <DataTable title="Work Orders by Category" columns={["Category", "Count", "%"]}
              rows={o.woByCategory.map(c => [c.name, String(c.count), `${c.pct}%`])} />
          </>
        )}

        {viewType === "financial" && (
          <>
            <View style={S.table} wrap={false}>
              <View style={S.secHeader}><Text style={S.secTitle}>Today's Financial Highlights</Text></View>
              {f.briefs.map((b, i) => (
                <View key={i} style={i === 0 ? S.row : S.row}><Text style={[S.cellLabel, { flex: 1 }]}>• {b}</Text></View>
              ))}
            </View>
            <KpiTable title="Financial KPIs" rows={[
              { label: "Amount Released", value: fmt(f.kpis.amountReleasedToday) },
              { label: "Bills Raised", value: fmt(f.kpis.billsRaisedValueToday) },
              { label: "Approved Value", value: fmt(f.kpis.approvedValueToday) },
              { label: "Pending Value", value: fmt(f.kpis.pendingValueToday) },
              { label: "Outstanding Liability", value: fmt(f.kpis.outstandingLiability) },
              { label: "Advance Amount", value: fmt(f.kpis.advanceAmountToday) },
            ]} />
            <KpiTable title="Payment Breakdown" rows={[
              { label: "Released", value: fmt(f.paymentBreakdown.released) },
              { label: "Retention Held", value: fmt(f.paymentBreakdown.retentionHeld) },
              { label: "Advance Recovered", value: fmt(f.paymentBreakdown.advanceRecovered) },
              { label: "TDS", value: fmt(f.paymentBreakdown.tds) },
              { label: "Net Payment", value: fmt(f.paymentBreakdown.net) },
            ]} />
            <DataTable title="Top Projects (by Released Amount)" columns={["Project", "Released", "Progress"]}
              rows={[...o.projectPerformance].sort((a, b) => b.releasedAmount - a.releasedAmount).slice(0, 5)
                .map(p => [p.projectName, fmt(p.releasedAmount), `${p.progressPct}%`])} />
            <DataTable title="Aging Report" columns={["Contractor", "Project", "Bill No", "Amount", "Days", "Status"]}
              rows={f.aging.table.slice(0, 20).map(r => [r.contractor, r.project, r.billNo, fmt(r.amount), String(r.daysPending), r.status])} />
            <DataTable title="Top Delayed Contractors" columns={["Contractor", "Pending", "Days Waiting"]}
              rows={f.topDelayedContractors.map(c => [c.vendorName, fmt(c.pendingAmount), String(c.daysWaiting)])} />
            <DataTable title="Advance Payments" columns={["Contractor", "Project", "Amount", "Balance"]}
              rows={f.advancePaymentsList.slice(0, 15).map(a => [a.vendorName, a.projectName, fmt(a.amount), fmt(a.balance)])} />
          </>
        )}
      </Page>
    </Document>
  );
}

export async function downloadDPRPDF(viewType: "operational" | "financial", report: DPRReport, projectLabel: string) {
  const blob = await pdf(<DPRDocument viewType={viewType} report={report} projectLabel={projectLabel} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `MIS-Report-${viewType}-${report.meta.date}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
