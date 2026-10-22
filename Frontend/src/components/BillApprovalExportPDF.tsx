import { Document, Page, View, Text, StyleSheet, pdf } from "@react-pdf/renderer";

// Same visual language as DailyProgressReportPDF.tsx (orange section headers,
// dark column-header row, alternating row stripes) — duplicated here rather
// than imported since react-pdf StyleSheet objects are cheap to recreate and
// this keeps the two exports independent.
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
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 3, marginBottom: 9, overflow: "hidden" },
  secHeader: { backgroundColor: ORANGE, paddingVertical: 4, paddingHorizontal: 10 },
  secTitle: { fontFamily: "Helvetica-Bold", color: "#fff", fontSize: 9, textTransform: "uppercase" },
  row: { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER },
  rowAlt: { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: LIGHT },
  hdr: { flexDirection: "row", backgroundColor: HDR_BG, padding: "4px 8px" },
  hdrText: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8 },
  col: { flex: 1, fontSize: 8, padding: "2px 4px" },
  totalRow: { flexDirection: "row", borderTopWidth: 2, borderTopColor: DARK, backgroundColor: "#FFF3E6" },
  totalText: { fontFamily: "Helvetica-Bold" },
  note: { fontSize: 7.5, color: GRAY, marginTop: 2 },
});

// `rightCols` right-aligns those column indexes (the amount); `footer` is an
// optional bold total row rendered as the table's last line.
function DataTable({ title, columns, widths, rows, emptyLabel, rightCols = [], footer }: { title: string; columns: string[]; widths?: number[]; rows: string[][]; emptyLabel?: string; rightCols?: number[]; footer?: string[] }) {
  const align = (j: number) => (rightCols.includes(j) ? { textAlign: "right" as const } : {});
  return (
    <View style={S.table}>
      <View style={S.secHeader} wrap={false}><Text style={S.secTitle}>{title}</Text></View>
      <View style={S.hdr} wrap={false}>
        {columns.map((c, i) => <Text key={c} style={[S.col, S.hdrText, widths ? { flex: widths[i] } : {}, align(i)]}>{c}</Text>)}
      </View>
      {rows.length === 0 ? (
        <View style={S.row}><Text style={[S.col, { padding: "6px 10px", color: GRAY, flex: columns.length }]}>{emptyLabel || "No records."}</Text></View>
      ) : rows.map((row, i) => (
        <View key={i} style={i % 2 === 0 ? S.row : S.rowAlt} wrap={false}>
          {row.map((cell, j) => <Text key={j} style={[S.col, widths ? { flex: widths[j] } : {}, align(j)]}>{cell}</Text>)}
        </View>
      ))}
      {footer && rows.length > 0 && (
        <View style={S.totalRow} wrap={false}>
          {footer.map((cell, j) => <Text key={j} style={[S.col, S.totalText, widths ? { flex: widths[j] } : {}, align(j)]}>{cell}</Text>)}
        </View>
      )}
    </View>
  );
}

const inr = (n: number) => (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Same shape as the Daily Progress Report's own Pending Bills section
// (getPendingBillsSummary on the backend) — Bill No./Description/Project/
// Stage/Requested On/Days, with stage labels matching PENDING_STAGE_LABEL
// exactly ("AGM Approval (L1)" / "GM Approval (L2)" / "L3 Approval" / "L4 Approval").
export interface BillApprovalExportRow {
  billNo: string;
  description: string;
  project: string;
  company: string;
  stage: string;
  requestedOn: string;
  days: string;
  // Gross amount as shown on screen; rejected bills are still listed but left out of the total.
  amount: number;
  rejected: boolean;
}

function BillApprovalExportDocument({ rows, dateRangeLabel }: { rows: BillApprovalExportRow[]; dateRangeLabel: string }) {
  const counted = rows.filter(r => !r.rejected);
  const total = counted.reduce((s, r) => s + (r.amount || 0), 0);
  const rejectedCount = rows.length - counted.length;
  return (
    <Document title="Bill Approval Report" author="Neoteric Properties">
      <Page size="A4" style={S.page}>
        <View style={S.headerRow}>
          <View>
            <Text style={S.logoName}>Neoteric Properties</Text>
            <Text style={S.logoSub}>Project Cost Center</Text>
          </View>
          <View style={S.docTitle}>
            <Text style={S.docMain}>BILL APPROVAL REPORT</Text>
            <Text style={S.docSub}>Range: {dateRangeLabel}</Text>
            <Text style={S.docSub}>Generated: {new Date().toLocaleString("en-IN")}</Text>
          </View>
        </View>

        <DataTable
          title="Bill Approval — Pending Bills"
          columns={["Bill No.", "Requested On", "Description", "Project", "Company", "Stage", "Pending Days", "Amount (Rs.)"]}
          widths={[0.8, 0.9, 1.4, 1, 1, 1, 0.6, 1.1]}
          rightCols={[7]}
          rows={rows.map(r => [r.billNo, r.requestedOn, r.description, r.project, r.company, r.stage, r.days, inr(r.amount)])}
          footer={["TOTAL", `${counted.length} bill${counted.length === 1 ? "" : "s"}`, "", "", "", "", "", inr(total)]}
          emptyLabel="No pending bills match the current filters."
        />
        {rejectedCount > 0 && (
          <Text style={S.note}>Total excludes {rejectedCount} rejected bill{rejectedCount === 1 ? "" : "s"}.</Text>
        )}
      </Page>
    </Document>
  );
}

export async function downloadBillApprovalPDF(rows: BillApprovalExportRow[], dateRangeLabel: string) {
  const blob = await pdf(<BillApprovalExportDocument rows={rows} dateRangeLabel={dateRangeLabel} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bill-approval-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
