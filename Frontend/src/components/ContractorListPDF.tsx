import { Document, Page, View, Text, StyleSheet, pdf } from "@react-pdf/renderer";
import type { Contractor, VendorGroup } from "../types/VendorBilling";
import { vendorLabel } from "../utils/vendorLabel";

const GREEN = "#1F5C3C";
const GREEN_TEXT = "#FFFFFF";
const ROW_ALT = "#DCE6F1";
const BORDER = "#B7C6D9";
const DARK = "#1A1A2E";

const S = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, fontFamily: "Helvetica", color: DARK, backgroundColor: "#fff" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 8.5, color: "#6B7280", marginBottom: 12 },
  table: { borderWidth: 1, borderColor: BORDER },
  hdr: { flexDirection: "row", backgroundColor: GREEN, borderBottomWidth: 1, borderBottomColor: BORDER },
  hdrCell: { color: GREEN_TEXT, fontFamily: "Helvetica-Bold", fontSize: 8.5, padding: "5px 6px" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER },
  cell: { padding: "4px 6px", fontSize: 8 },
  colCode: { width: 60 },
  colCompany: { flex: 1.6 },
  colOwner: { flex: 1.3 },
  colMobile: { width: 75 },
  colGroup: { flex: 1.2 },
  colWork: { flex: 1.4 },
});

function ContractorListDocument({ contractors, vendorGroups }: { contractors: Contractor[]; vendorGroups: VendorGroup[] }) {
  const groupById = (id?: string | null) => vendorGroups.find(g => g.id === id);
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={S.page}>
        <Text style={S.title}>Contractors</Text>
        <Text style={S.subtitle}>{contractors.length} registered vendor{contractors.length !== 1 ? "s" : ""}</Text>
        <View style={S.table}>
          <View style={S.hdr} wrap={false}>
            <Text style={[S.hdrCell, S.colCode]}>Vendor Code</Text>
            <Text style={[S.hdrCell, S.colCompany]}>Company</Text>
            <Text style={[S.hdrCell, S.colOwner]}>Owner</Text>
            <Text style={[S.hdrCell, S.colMobile]}>Mobile</Text>
            <Text style={[S.hdrCell, S.colGroup]}>Vendor Group</Text>
            <Text style={[S.hdrCell, S.colWork]}>Work Types</Text>
          </View>
          {contractors.map((c, i) => {
            const group = groupById(c.groupId);
            return (
              <View key={c.id} style={[S.row, i % 2 === 1 ? { backgroundColor: ROW_ALT } : {}]} wrap={false}>
                <Text style={[S.cell, S.colCode, { fontFamily: "Helvetica-Bold" }]}>{c.vendorCode}</Text>
                <Text style={[S.cell, S.colCompany]}>{vendorLabel(c.companyName, c.shortCode)}</Text>
                <Text style={[S.cell, S.colOwner]}>{c.ownerName || "—"}</Text>
                <Text style={[S.cell, S.colMobile]}>{c.mobile || "—"}</Text>
                <Text style={[S.cell, S.colGroup]}>{group ? group.name : "—"}</Text>
                <Text style={[S.cell, S.colWork]}>{(c.workTypes || []).join(", ") || "—"}</Text>
              </View>
            );
          })}
        </View>
      </Page>
    </Document>
  );
}

export async function downloadContractorListPDF(contractors: Contractor[], vendorGroups: VendorGroup[]) {
  const blob = await pdf(<ContractorListDocument contractors={contractors} vendorGroups={vendorGroups} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contractors_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
