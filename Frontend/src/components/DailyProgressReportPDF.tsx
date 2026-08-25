import { Document, Page, View, Text, StyleSheet, pdf } from "@react-pdf/renderer";
import type { DailyProgressReportSummary } from "../utils/dailyProgressReportSummary";

const ORANGE = "#FF7A00";
const DARK = "#111827";
const MID = "#374151";
const GRAY = "#6B7280";
const LIGHT = "#F9FAFB";
const BORDER = "#D1D5DB";
const HDR_BG = "#1F2937";
// Same tint as the app's --theme-primary-tint — used for the per-project
// vendor breakdown's header so it reads as "nested under" its parent
// project row instead of another top-level section.
const TINT = "#FFECDA";
const RED = "#DC2626";
const AMBER = "#D97706";
const GREEN = "#16A34A";

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
  bullet: { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, padding: "5px 10px", gap: 6 },
  subWrap: { marginHorizontal: 10, marginBottom: 8, marginTop: 2, borderWidth: 1, borderColor: BORDER, borderRadius: 3, overflow: "hidden" },
  subHeader: { backgroundColor: TINT, paddingVertical: 4, paddingHorizontal: 8, flexDirection: "row", justifyContent: "space-between" },
  subTitle: { fontFamily: "Helvetica-Bold", color: DARK, fontSize: 8 },
  subMeta: { fontFamily: "Helvetica-Bold", color: ORANGE, fontSize: 8 },
});

function KpiTable({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <View style={S.table} wrap={false}>
      <View style={S.secHeader}><Text style={S.secTitle}>{title}</Text></View>
      {rows.map(r => (
        <View key={r.label} style={S.row}>
          <Text style={S.cellLabel}>{r.label}</Text>
          <Text style={S.cellVal}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

function DataTable({ title, columns, widths, rows, emptyLabel }: { title: string; columns: string[]; widths?: number[]; rows: string[][]; emptyLabel?: string }) {
  return (
    <View style={S.table} wrap={false}>
      <View style={S.secHeader}><Text style={S.secTitle}>{title}</Text></View>
      <View style={S.hdr}>
        {columns.map((c, i) => <Text key={c} style={[S.col, S.hdrText, widths ? { flex: widths[i] } : {}]}>{c}</Text>)}
      </View>
      {rows.length === 0 ? (
        <View style={S.row}><Text style={[S.col, { padding: "6px 10px", color: GRAY, flex: columns.length }]}>{emptyLabel || "No records."}</Text></View>
      ) : rows.map((row, i) => (
        <View key={i} style={i % 2 === 0 ? S.row : S.rowAlt}>
          {row.map((cell, j) => <Text key={j} style={[S.col, widths ? { flex: widths[j] } : {}]}>{cell}</Text>)}
        </View>
      ))}
    </View>
  );
}

const ACTION_COLOR: Record<string, string> = { critical: RED, warning: AMBER, good: GREEN };

// The per-project contractor/work-type/labour breakdown nested under Project-
// wise Labour Summary — same four columns as the in-app labour flashcards
// (Vendor Code, Contractor Name, Work Type, Labour Count).
function VendorBreakdownTable({ projectName, totalLabour, rows }: {
  projectName: string; totalLabour: number;
  rows: { vendorCode: string; vendorName: string; workType: string; labourCount: number }[];
}) {
  return (
    <View style={S.subWrap} wrap={false}>
      <View style={S.subHeader}>
        <Text style={S.subTitle}>{projectName}</Text>
        <Text style={S.subMeta}>Labour Count: {totalLabour.toLocaleString("en-IN")}</Text>
      </View>
      <View style={S.hdr}>
        <Text style={[S.col, S.hdrText]}>Vendor Code</Text>
        <Text style={[S.col, S.hdrText]}>Contractor Name</Text>
        <Text style={[S.col, S.hdrText]}>Work Type</Text>
        <Text style={[S.col, S.hdrText, { textAlign: "right" }]}>Labour Count</Text>
      </View>
      {rows.length === 0 ? (
        <View style={S.row}><Text style={[S.col, { padding: "6px 10px", color: GRAY, flex: 4 }]}>No contractor entries.</Text></View>
      ) : rows.map((r, i) => (
        <View key={r.vendorCode} style={i % 2 === 0 ? S.row : S.rowAlt}>
          <Text style={S.col}>{r.vendorCode}</Text>
          <Text style={S.col}>{r.vendorName}</Text>
          <Text style={S.col}>{r.workType}</Text>
          <Text style={[S.col, { textAlign: "right" }]}>{r.labourCount}</Text>
        </View>
      ))}
    </View>
  );
}

export function DailyProgressReportDocument({ summary }: { summary: DailyProgressReportSummary }) {
  const s = summary;
  return (
    <Document title={`Daily Progress Report - ${s.periodLabel}`} author="Neoteric Properties">
      <Page size="A4" style={S.page}>
        <View style={S.headerRow}>
          <View>
            <Text style={S.logoName}>Neoteric Properties</Text>
            <Text style={S.logoSub}>Project Cost Center</Text>
          </View>
          <View style={S.docTitle}>
            <Text style={S.docMain}>DAILY PROGRESS REPORT</Text>
            <Text style={S.docSub}>Scope: {s.scopeLabel}</Text>
            <Text style={S.docSub}>Period: {s.periodLabel}</Text>
            <Text style={S.docSub}>Generated: {new Date(s.generatedAt).toLocaleString("en-IN")} by {s.preparedBy}</Text>
          </View>
        </View>

        <KpiTable title="Executive Summary" rows={[
          { label: "Total Labour", value: s.kpis.totalLabour.toLocaleString("en-IN") },
          { label: "Projects Covered", value: String(s.kpis.projectsCovered) },
          { label: "Contractors Active", value: String(s.kpis.totalContractors) },
          { label: "Work Types Logged", value: String(s.kpis.workTypes) },
          { label: "Reporting Days", value: String(s.kpis.reportingDays) },
          { label: "Reports Submitted", value: String(s.kpis.reportsSubmitted) },
          { label: "Drawing Requests (in scope)", value: String(s.kpis.drawingRequests) },
        ]} />

        <DataTable
          title="Project-wise Labour Summary"
          columns={["Project", "Labour", "Contractors", "Reports", "Major Work Type", "vs Previous Period"]}
          widths={[1.6, 0.7, 0.9, 0.7, 1.2, 1]}
          rows={s.projectSummary.map(p => [
            p.projectName, p.labour.toLocaleString("en-IN"), String(p.contractors), String(p.reportsCount), p.majorWorkType,
            p.changePct === null ? "—" : `${p.changePct >= 0 ? "Up" : "Down"} ${Math.abs(p.changePct)}%`,
          ])}
          emptyLabel="No progress reports in this period."
        />

        {s.projectSummary.map(p => (
          <VendorBreakdownTable key={p.projectName} projectName={p.projectName} totalLabour={p.labour} rows={p.vendorBreakdown} />
        ))}

        <DataTable
          title="Work Categories Logged (by report entries)"
          columns={["Work Type", "Entries", "% Share"]}
          rows={s.workTypeSummary.map(w => [w.workType, String(w.entries), `${w.pct}%`])}
          emptyLabel="No work categories logged in this period."
        />

        <DataTable
          title="Work Progress — Planned vs Completed"
          columns={["Work Item", "Unit", "Planned", "Completed", "Progress"]}
          widths={[1.8, 0.6, 0.9, 0.9, 0.8]}
          rows={s.workProgress.map(w => [w.description, w.unit || "—", w.planned.toLocaleString("en-IN"), w.completed.toLocaleString("en-IN"), `${w.pct}%`])}
          emptyLabel="No scope items recorded."
        />

        <DataTable
          title="Drawing Request Status"
          columns={["Ticket", "Description", "Project", "Requested By", "Stage", "Requested On", "Days"]}
          widths={[0.7, 1.6, 1, 0.9, 1.1, 0.9, 0.5]}
          rows={s.drawingRequests.map(d => [d.ticketNo, d.description, d.projectName, d.driName, d.stageLabel, d.requestedOn, String(d.daysSince)])}
          emptyLabel="No drawing requests in scope."
        />

        <View style={S.table} wrap={false}>
          <View style={S.secHeader}><Text style={S.secTitle}>Action Required</Text></View>
          {s.actionItems.map((a, i) => (
            <View key={i} style={S.bullet}>
              <Text style={{ color: ACTION_COLOR[a.level], fontSize: 8 }}>•</Text>
              <Text style={{ fontSize: 8.5, color: MID, flex: 1 }}>{a.text}</Text>
            </View>
          ))}
        </View>

        <View style={S.table} wrap={false}>
          <View style={S.secHeader}><Text style={S.secTitle}>Coordinator Remarks</Text></View>
          <View style={{ padding: 12, height: 60 }} />
        </View>
      </Page>
    </Document>
  );
}

export async function downloadDailyProgressReportPDF(summary: DailyProgressReportSummary) {
  const blob = await pdf(<DailyProgressReportDocument summary={summary} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = summary.periodLabel.replace(/[^\w]+/g, "-");
  a.download = `Daily-Progress-Report-${slug}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
