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

export interface WorkOrderExportRow {
  woNo: string;
  created: string;
  project: string;
  category: string;
  vendorCode: string;
  companyName: string;
  step: string;
  pendingDays: string;
  // Contract value; cancelled work orders are still listed but left out of the total.
  amount: number;
  cancelled: boolean;
}

function WorkOrdersExportDocument({ rows, dateRangeLabel }: { rows: WorkOrderExportRow[]; dateRangeLabel: string }) {
  const counted = rows.filter(r => !r.cancelled);
  const total = counted.reduce((s, r) => s + (r.amount || 0), 0);
  const cancelledCount = rows.length - counted.length;
  return (
    <Document title="Work Orders Report" author="Neoteric Properties">
      <Page size="A4" orientation="landscape" style={S.page}>
        <View style={S.headerRow}>
          <View>
            <Text style={S.logoName}>Neoteric Properties</Text>
            <Text style={S.logoSub}>Project Cost Center</Text>
          </View>
          <View style={S.docTitle}>
            <Text style={S.docMain}>WORK ORDERS REPORT</Text>
            <Text style={S.docSub}>Range: {dateRangeLabel}</Text>
            <Text style={S.docSub}>Generated: {new Date().toLocaleString("en-IN")}</Text>
          </View>
        </View>

        <DataTable
          title="Work Orders"
          columns={["WO No.", "Date of Creation", "Project", "Category", "Vendor Code", "Company Name", "Step", "Pending Days", "Contract Value (Rs.)"]}
          widths={[0.9, 0.9, 1.3, 1, 0.9, 1.3, 1.1, 0.8, 1.2]}
          rightCols={[8]}
          rows={rows.map(r => [r.woNo, r.created, r.project, r.category, r.vendorCode, r.companyName, r.step, r.pendingDays, inr(r.amount)])}
          footer={["TOTAL", `${counted.length} work order${counted.length === 1 ? "" : "s"}`, "", "", "", "", "", "", inr(total)]}
          emptyLabel="No work orders match the current filters."
        />
        {cancelledCount > 0 && (
          <Text style={S.note}>Total excludes {cancelledCount} cancelled work order{cancelledCount === 1 ? "" : "s"}.</Text>
        )}
      </Page>
    </Document>
  );
}

export async function downloadWorkOrdersPDF(rows: WorkOrderExportRow[], dateRangeLabel: string) {
  const blob = await pdf(<WorkOrdersExportDocument rows={rows} dateRangeLabel={dateRangeLabel} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `work-orders-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
