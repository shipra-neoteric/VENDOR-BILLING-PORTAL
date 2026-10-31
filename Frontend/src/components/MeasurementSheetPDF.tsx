import { Document, Page, View, Text, StyleSheet, pdf } from "@react-pdf/renderer";

const HEAD = "#FF7A00";
const BORDER = "#F0D5B8";
const ROW_ALT = "#FFF5EA";
const DARK = "#1A1A2E";
const GREY = "#6B7280";

const S = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, fontFamily: "Helvetica", color: DARK, backgroundColor: "#fff" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 9, color: GREY, marginTop: 2, marginBottom: 10 },
  meta: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: BORDER, marginBottom: 12 },
  metaCell: { width: "25%", padding: "5px 7px" },
  metaLabel: { fontSize: 7, color: GREY, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  metaValue: { fontSize: 9, marginTop: 1 },
  entryHead: { flexDirection: "row", justifyContent: "space-between", backgroundColor: ROW_ALT, padding: "4px 6px", borderWidth: 1, borderColor: BORDER },
  table: { borderWidth: 1, borderColor: BORDER, borderTopWidth: 0, marginBottom: 10 },
  hdr: { flexDirection: "row", backgroundColor: HEAD },
  hdrCell: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8, padding: "4px 5px" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER },
  cell: { padding: "3px 5px", fontSize: 8 },
  cSr: { width: 26 },
  cScope: { flex: 1.6 },
  cLoc: { flex: 1.2 },
  cDim: { width: 38, textAlign: "right" },
  cQty: { width: 64, textAlign: "right" },
  sub: { flexDirection: "row", justifyContent: "flex-end", padding: "4px 5px", fontFamily: "Helvetica-Bold" },
  note: { fontSize: 7.5, color: GREY, padding: "0 5px 3px 31px" },
  grand: { flexDirection: "row", justifyContent: "space-between", backgroundColor: HEAD, padding: "7px 9px", marginTop: 4 },
  grandText: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 10 },
  sign: { flexDirection: "row", justifyContent: "space-between", marginTop: 46 },
  signBox: { width: "30%", borderTopWidth: 1, borderTopColor: DARK, paddingTop: 3, fontSize: 8, textAlign: "center" },
});

export interface SheetRow {
  scope?: string; location?: string;
  length?: number; width?: number; height?: number; nos?: number;
  deduct?: boolean; qty: number; note?: string;
}
export interface SheetEntry {
  date: string; by?: string; remarks?: string; documents?: string[];
  invalidated?: boolean; billed?: boolean;
  rows: SheetRow[]; total: number;
}
export interface MeasurementSheetData {
  project: string; workOrderNo: string; vendor: string; item: string; unit: string;
  planned: number; executed: number; billed?: number | null; generatedOn: string;
  entries: SheetEntry[];
}

const n = (v?: number) => (v == null ? "" : v.toLocaleString("en-IN", { maximumFractionDigits: 3 }));
const q = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 3 });

function MeasurementSheetPage({ d }: { d: MeasurementSheetData }) {
  const active = d.entries.filter(e => !e.invalidated);
  const total = active.reduce((s, e) => s + e.total, 0);
  const meta: [string, string][] = [
    ["Project", d.project || "—"],
    ["Work order", d.workOrderNo],
    ["Vendor", d.vendor || "—"],
    ["Unit", d.unit],
    ["Planned", d.planned > 0 ? `${q(d.planned)} ${d.unit}` : "Not set"],
    ["Actual (measured)", `${q(d.executed)} ${d.unit}`],
    ["Billed so far", d.billed == null ? "—" : `${q(d.billed)} ${d.unit}`],
    ["Generated on", d.generatedOn],
  ];
  return (
      <Page size="A4" style={S.page}>
        <Text style={S.title}>Measurement Sheet</Text>
        <Text style={S.subtitle}>{d.item}</Text>
        <View style={S.meta}>
          {meta.map(([k, v]) => (
            <View key={k} style={S.metaCell}>
              <Text style={S.metaLabel}>{k}</Text>
              <Text style={S.metaValue}>{v}</Text>
            </View>
          ))}
        </View>

        {d.entries.length === 0 && <Text>No measurement logged yet.</Text>}
        {d.entries.map((e, i) => (
          <View key={i}>
            <View style={S.entryHead}>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
                Entry {d.entries.length - i} · {e.date}{e.by ? ` · ${e.by}` : ""}{e.billed ? " · Billed" : ""}{e.invalidated ? " · INVALIDATED (not counted)" : ""}
              </Text>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>{q(e.total)} {d.unit}</Text>
            </View>
            <View style={S.table}>
              <View style={S.hdr}>
                <Text style={[S.hdrCell, S.cSr]}>Sr</Text>
                <Text style={[S.hdrCell, S.cScope]}>Scope of work</Text>
                <Text style={[S.hdrCell, S.cLoc]}>Location</Text>
                <Text style={[S.hdrCell, S.cDim]}>Length</Text>
                <Text style={[S.hdrCell, S.cDim]}>Width</Text>
                <Text style={[S.hdrCell, S.cDim]}>Height</Text>
                <Text style={[S.hdrCell, S.cDim]}>Nos</Text>
                <Text style={[S.hdrCell, S.cQty]}>Quantity ({d.unit})</Text>
              </View>
              {e.rows.map((r, ri) => (
                <View key={ri} wrap={false}>
                  <View style={[S.row, ri % 2 === 1 ? { backgroundColor: ROW_ALT } : {}]}>
                    <Text style={[S.cell, S.cSr]}>{ri + 1}</Text>
                    <Text style={[S.cell, S.cScope]}>{r.scope || "—"}{r.deduct ? " (deduction)" : ""}</Text>
                    <Text style={[S.cell, S.cLoc]}>{r.location || "—"}</Text>
                    <Text style={[S.cell, S.cDim]}>{n(r.length)}</Text>
                    <Text style={[S.cell, S.cDim]}>{n(r.width)}</Text>
                    <Text style={[S.cell, S.cDim]}>{n(r.height)}</Text>
                    <Text style={[S.cell, S.cDim]}>{n(r.nos)}</Text>
                    <Text style={[S.cell, S.cQty, r.deduct ? { color: "#DC2626" } : {}]}>{r.deduct ? "−" : ""}{q(r.qty)}</Text>
                  </View>
                  {r.note ? <Text style={S.note}>Note: {r.note}</Text> : null}
                </View>
              ))}
              <View style={S.sub}><Text>Entry total: {q(e.total)} {d.unit}</Text></View>
              {e.remarks ? <Text style={S.note}>Remarks: {e.remarks}</Text> : null}
              {e.documents && e.documents.length > 0 ? <Text style={S.note}>Documents: {e.documents.join(", ")}</Text> : null}
            </View>
          </View>
        ))}

        <View style={S.grand} wrap={false}>
          <Text style={S.grandText}>Total actual quantity</Text>
          <Text style={S.grandText}>{q(total)} {d.unit}</Text>
        </View>

        <View style={S.sign} wrap={false}>
          <Text style={S.signBox}>Measured by</Text>
          <Text style={S.signBox}>Vendor signature</Text>
          <Text style={S.signBox}>Approved by</Text>
        </View>
      </Page>
  );
}

function MeasurementSheetDocument({ sheets }: { sheets: MeasurementSheetData[] }) {
  return <Document>{sheets.map((d, i) => <MeasurementSheetPage key={i} d={d} />)}</Document>;
}

// One page-set per sheet; a single sheet is named after its item, several after the work orders / project.
export async function downloadMeasurementSheetPDF(input: MeasurementSheetData | MeasurementSheetData[], fileLabel?: string) {
  const sheets = Array.isArray(input) ? input : [input];
  const blob = await pdf(<MeasurementSheetDocument sheets={sheets} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const label = fileLabel || (sheets.length === 1 ? `${sheets[0].workOrderNo}_${sheets[0].item}` : "project");
  a.download = `measurement_${label.replace(/[^a-z0-9]+/gi, "_").slice(0, 50)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
