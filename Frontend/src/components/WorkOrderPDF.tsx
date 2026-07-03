import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { pdf } from "@react-pdf/renderer";

// ── Palette ────────────────────────────────────────────────────
const ORANGE = "#FF7A00";
const DARK   = "#111827";
const MID    = "#374151";
const GRAY   = "#6B7280";
const LIGHT  = "#F9FAFB";
const BORDER = "#D1D5DB";
const HDR_BG = "#1F2937";

// ── Styles ─────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: { padding: 36, fontSize: 8.5, fontFamily: "Helvetica", color: DARK, backgroundColor: "#fff" },

  // ── Header
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: ORANGE },
  logoBox:   { flexDirection: "column" },
  logoName:  { fontSize: 16, fontFamily: "Helvetica-Bold", color: DARK, letterSpacing: 0.5 },
  logoSub:   { fontSize: 8, color: GRAY, marginTop: 2, letterSpacing: 0.3 },
  docTitle:  { textAlign: "right" },
  docMain:   { fontSize: 14, fontFamily: "Helvetica-Bold", color: ORANGE, letterSpacing: 0.4 },
  docSub:    { fontSize: 7.5, color: GRAY, marginTop: 3, letterSpacing: 0.3 },
  docBadge:  { marginTop: 4, fontSize: 7.5, color: GRAY, letterSpacing: 0.5, alignSelf: "flex-end" },

  // ── Section table
  table:     { borderWidth: 1, borderColor: BORDER, borderRadius: 3, marginBottom: 10, overflow: "hidden" },
  secHeader: { backgroundColor: ORANGE, paddingVertical: 5, paddingHorizontal: 10, flexDirection: "row", alignItems: "center" },
  secTitle:  { fontFamily: "Helvetica-Bold", color: "#fff", fontSize: 8, letterSpacing: 0.4, textTransform: "uppercase" },
  row:       { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER },
  rowLast:   { flexDirection: "row" },
  cellLabel: { width: "38%", backgroundColor: LIGHT, padding: "5px 10px", fontFamily: "Helvetica-Bold", fontSize: 8, color: MID },
  cellVal:   { flex: 1, padding: "5px 10px", fontSize: 8, color: DARK },
  cellValMono: { flex: 1, padding: "5px 10px", fontSize: 8, color: DARK, fontFamily: "Helvetica-Oblique" },

  // ── Scope table
  scopeHdr:  { flexDirection: "row", backgroundColor: HDR_BG, padding: "5px 8px" },
  scopeRow:  { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, padding: "4px 8px" },
  scopeAlt:  { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, padding: "4px 8px", backgroundColor: LIGHT },
  colDesc:   { flex: 2.5, fontSize: 7.5 },
  colUnit:   { width: 52, fontSize: 7.5, textAlign: "center" },
  colQty:    { width: 52, fontSize: 7.5, textAlign: "right" },
  colDate:   { width: 62, fontSize: 7.5, textAlign: "center" },
  colRate:   { width: 60, fontSize: 7.5, textAlign: "right" },
  colAmt:    { width: 68, fontSize: 7.5, textAlign: "right" },
  hdrText:   { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 7.5 },

  // ── Totals
  totalRow:  { flexDirection: "row", justifyContent: "flex-end", borderTopWidth: 1.5, borderTopColor: ORANGE, padding: "5px 8px", backgroundColor: "#FFF8F3" },
  totalLabel:{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: ORANGE, marginRight: 10, width: 80, textAlign: "right" },
  totalVal:  { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: DARK, width: 68, textAlign: "right" },
  gstRow:    { flexDirection: "row", justifyContent: "flex-end", borderTopWidth: 1, borderTopColor: BORDER, padding: "4px 8px" },
  gstLabel:  { fontSize: 7.5, color: GRAY, marginRight: 10, width: 80, textAlign: "right" },
  gstVal:    { fontSize: 7.5, color: GRAY, width: 68, textAlign: "right" },

  // ── Terms
  termsHdr:  { fontFamily: "Helvetica-Bold", fontSize: 8, color: DARK, marginBottom: 5, borderLeftWidth: 3, borderLeftColor: ORANGE, paddingLeft: 6, letterSpacing: 0.3 },
  termRow:   { flexDirection: "row", marginBottom: 3.5, gap: 4 },
  termNum:   { fontSize: 7, color: ORANGE, fontFamily: "Helvetica-Bold", width: 12, paddingTop: 0.5 },
  termText:  { flex: 1, fontSize: 7, color: MID, lineHeight: 1.5 },

  // ── Signature
  sigBlock:  { flexDirection: "row", marginTop: 14, borderWidth: 1, borderColor: BORDER, borderRadius: 3 },
  sigCell:   { flex: 1, padding: "10px 10px", borderRightWidth: 1, borderRightColor: BORDER },
  sigCellL:  { flex: 1, padding: "10px 10px" },
  sigRole:   { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: MID, marginBottom: 22, letterSpacing: 0.3 },
  sigLine:   { borderTopWidth: 1, borderTopColor: BORDER, width: "100%" },
  sigName:   { fontSize: 6.5, color: GRAY, marginTop: 3 },
  sigDate:   { fontSize: 6.5, color: GRAY, marginTop: 2 },

  sectionGap: { marginBottom: 10 },
});

// ── Types passed in ────────────────────────────────────────────
interface WOData {
  workOrderNo: string;
  issueDate: string;
  projectName: string;
  category?: string;
  subCategory?: string;
  scopeOfWork?: string;
  vendorName?: string;
  ownerName?: string;
  mobile?: string;
  contractValue?: number;
  gstPercent?: number;
  tdsPercent?: number;
  scopeItems?: Array<{
    description: string;
    unit?: string;
    plannedQty?: number;
    rate?: number;
    amount?: number;
    plannedStart?: string;
    plannedEnd?: string;
    subItems?: Array<{ description: string; unit?: string; plannedQty?: number; rate?: number; amount?: number }>;
  }>;
}

interface CompanyData {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  gstNumber?: string;
}

interface ContractorData {
  companyName?: string;
  address?: string;
  panNumber?: string;
  gstNumber?: string;
  mobile?: string;
}

interface Props {
  wo: WOData;
  company?: CompanyData | null;
  contractor?: ContractorData | null;
}

// ── Helpers ────────────────────────────────────────────────────
const fmtDate = (d?: string) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
};

const fmtAmt = (n?: number) =>
  n ? "₹ " + Math.round(n).toLocaleString("en-IN") : "—";

const TERMS = [
  "All work shall be executed strictly as per approved drawings, specifications, and IS standards. No deviation is allowed without written approval.",
  "Contractor shall maintain full workmanship quality. Any defective or poor-quality work must be rectified at the contractor's own cost.",
  "All measurements will be taken jointly with the Site Engineer. Only certified joint measurements will be considered for billing.",
  "Payment will be released within 15–30 days after verification and approval of the bill. Verbal claims will not be accepted.",
  "5% retention will be deducted from every bill and released after the 6-month Defect Liability Period (DLP).",
  "Contractor is fully responsible for worker safety. PPE is mandatory. Any accident or injury will be the contractor's liability.",
  "Contractor must deploy adequate manpower and increase labour strength whenever instructed.",
  "Delay in work may attract penalty up to 1% per week (maximum 5%). Pending work may be completed through another agency at contractor's risk.",
  "No extra work or variation will be paid without written approval before execution.",
  "Workers must maintain discipline, follow site timings, and keep the site clean. Alcohol, smoking, or misbehavior is strictly prohibited.",
];

// ── Row helpers ────────────────────────────────────────────────
function InfoRow({ label, value, mono = false, last = false }: { label: string; value?: string; mono?: boolean; last?: boolean }) {
  return (
    <View style={last ? S.rowLast : S.row}>
      <Text style={S.cellLabel}>{label}</Text>
      <Text style={mono ? S.cellValMono : S.cellVal}>{value || "—"}</Text>
    </View>
  );
}

function SectionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={S.table}>
      <View style={S.secHeader}>
        <Text style={S.secTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// ── The Document ───────────────────────────────────────────────
export function WorkOrderDocument({ wo, company, contractor }: Props) {
  const companyAddr = [company?.address, company?.city, company?.state].filter(Boolean).join(", ");
  const contractorAddr = contractor?.address || "—";

  // Flatten scope items (include sub-items as child rows)
  const lineItems: Array<{ desc: string; unit?: string; qty?: number; rate?: number; amount?: number; start?: string; end?: string; isChild?: boolean }> = [];
  for (const item of wo.scopeItems || []) {
    if ((item.subItems?.length ?? 0) > 0) {
      lineItems.push({ desc: item.description, unit: "", qty: undefined, rate: undefined, amount: undefined, start: item.plannedStart, end: item.plannedEnd });
      for (const sub of item.subItems ?? []) {
        lineItems.push({ desc: "  " + sub.description, unit: sub.unit, qty: sub.plannedQty, rate: sub.rate, amount: sub.amount ?? (sub.plannedQty ?? 0) * (sub.rate ?? 0), isChild: true });
      }
    } else {
      lineItems.push({ desc: item.description, unit: item.unit, qty: item.plannedQty, rate: item.rate, amount: item.amount ?? (item.plannedQty ?? 0) * (item.rate ?? 0), start: item.plannedStart, end: item.plannedEnd });
    }
  }

  const totalAmt = lineItems.filter(l => !l.isChild || true).reduce((s, l) => {
    if (!l.isChild && (wo.scopeItems?.find(i => i.description === l.desc)?.subItems?.length ?? 0) > 0) return s;
    return s + (l.amount ?? 0);
  }, 0) || wo.contractValue || 0;

  return (
    <Document title={`Work Order ${wo.workOrderNo}`} author="Neoteric Group">
      <Page size="A4" style={S.page}>

        {/* ── Header ── */}
        <View style={S.headerRow}>
          <View style={S.logoBox}>
            <Text style={S.logoName}>Neoteric Group</Text>
            <Text style={S.logoSub}>{company?.name || "—"}</Text>
          </View>
          <View style={S.docTitle}>
            <Text style={S.docMain}>WORK ORDER</Text>
            <Text style={S.docSub}>INTERNAL DOCUMENT</Text>
            <Text style={S.docBadge}>CONFIDENTIAL</Text>
          </View>
        </View>

        {/* ── Work Order Details ── */}
        <SectionBox title="Work Order Details">
          <InfoRow label="Work Order No." value={wo.workOrderNo} mono />
          <InfoRow label="Issue Date"     value={fmtDate(wo.issueDate)} last />
        </SectionBox>

        {/* ── Company Details ── */}
        <SectionBox title="Company Details (Issuing Party)">
          <InfoRow label="Company Name"   value={company?.name} />
          <InfoRow label="Address"        value={companyAddr || company?.address} />
          <InfoRow label="Contact Person" value={company?.contactPerson} />
          <InfoRow label="Email"          value={company?.email} />
          <InfoRow label="Phone"          value={company?.phone} last />
        </SectionBox>

        {/* ── Contractor Details ── */}
        <SectionBox title="Contractor Details">
          <InfoRow label="Contractor Name"  value={wo.vendorName} />
          <InfoRow label="Contact Person"   value={wo.ownerName} />
          <InfoRow label="Address"          value={contractorAddr} />
          <InfoRow label="PAN No."          value={contractor?.panNumber} mono />
          <InfoRow label="GST No."          value={contractor?.gstNumber} mono />
          <InfoRow label="Contact / Mobile" value={wo.mobile || contractor?.mobile} last />
        </SectionBox>

        {/* ── Project Details ── */}
        <SectionBox title="Project Details">
          <InfoRow label="Project Name"      value={wo.projectName} />
          <InfoRow label="Category"          value={wo.category} />
          {wo.subCategory ? <InfoRow label="Sub-category" value={wo.subCategory} /> : null}
          <InfoRow label="Work Title / Scope" value={wo.scopeOfWork} last />
        </SectionBox>

        {/* ── Scope of Work table ── */}
        {lineItems.length > 0 && (
          <View style={[S.table, S.sectionGap]}>
            <View style={S.secHeader}>
              <Text style={S.secTitle}>Scope of Work</Text>
            </View>
            {/* Column headers */}
            <View style={S.scopeHdr}>
              <Text style={[S.colDesc, S.hdrText]}>Description</Text>
              <Text style={[S.colUnit, S.hdrText]}>Unit</Text>
              <Text style={[S.colQty, S.hdrText]}>Qty</Text>
              <Text style={[S.colDate, S.hdrText]}>Start</Text>
              <Text style={[S.colDate, S.hdrText]}>End</Text>
            </View>
            {lineItems.map((item, i) => (
              <View key={i} style={i % 2 === 0 ? S.scopeRow : S.scopeAlt} wrap={false}>
                <Text style={[S.colDesc, item.isChild ? { color: GRAY, paddingLeft: 8 } : { fontFamily: "Helvetica-Bold", color: MID }]}>
                  {item.desc}
                </Text>
                <Text style={S.colUnit}>{item.unit || "—"}</Text>
                <Text style={S.colQty}>{item.qty != null ? item.qty.toLocaleString("en-IN") : "—"}</Text>
                <Text style={S.colDate}>{item.start ? fmtDate(item.start) : "—"}</Text>
                <Text style={S.colDate}>{item.end ? fmtDate(item.end) : "—"}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Financials table ── */}
        <View style={S.table} wrap={false}>
          <View style={S.secHeader}>
            <Text style={S.secTitle}>Financials</Text>
          </View>
          <View style={S.scopeHdr}>
            <Text style={[S.colDesc, S.hdrText]}>Description</Text>
            <Text style={[S.colUnit, S.hdrText]}>Unit</Text>
            <Text style={[S.colQty, S.hdrText]}>Qty</Text>
            <Text style={[S.colRate, S.hdrText]}>Rate (₹)</Text>
            <Text style={[S.colAmt, S.hdrText]}>Amount (₹)</Text>
          </View>
          {lineItems.filter(l => l.qty != null || l.amount).map((item, i) => (
            <View key={i} style={i % 2 === 0 ? S.scopeRow : S.scopeAlt} wrap={false}>
              <Text style={[S.colDesc, { color: item.isChild ? GRAY : MID }]}>{item.desc}</Text>
              <Text style={S.colUnit}>{item.unit || "—"}</Text>
              <Text style={S.colQty}>{item.qty != null ? item.qty.toLocaleString("en-IN") : "—"}</Text>
              <Text style={S.colRate}>{item.rate != null && item.rate > 0 ? item.rate.toLocaleString("en-IN") : "—"}</Text>
              <Text style={[S.colAmt, { fontFamily: item.amount ? "Helvetica-Bold" : "Helvetica" }]}>
                {item.amount ? fmtAmt(item.amount) : "—"}
              </Text>
            </View>
          ))}
          {/* Total */}
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>Total:</Text>
            <Text style={S.totalVal}>{fmtAmt(totalAmt)}</Text>
          </View>
          <View style={S.gstRow}>
            <Text style={S.gstLabel}>GST Slab:</Text>
            <Text style={S.gstVal}>
              {wo.gstPercent != null ? `${wo.gstPercent}%` : "As applicable"}
            </Text>
          </View>
          <View style={S.gstRow}>
            <Text style={S.gstLabel}>TDS Slab:</Text>
            <Text style={S.gstVal}>
              {wo.tdsPercent != null ? `${wo.tdsPercent}%` : "As applicable"}
            </Text>
          </View>
        </View>

        {/* ── Terms ── */}
        <View style={{ marginBottom: 10 }} wrap={false}>
          <Text style={S.termsHdr}>Terms & Conditions</Text>
          {TERMS.map((t, i) => (
            <View key={i} style={S.termRow}>
              <Text style={S.termNum}>{i + 1}.</Text>
              <Text style={S.termText}>{t}</Text>
            </View>
          ))}
        </View>

        {/* ── Signature block ── */}
        <View style={S.sigBlock} wrap={false}>
          {(["AGM – Project", "GM – Project", "CEO – Desk"] as const).map((role, i, arr) => (
            <View key={role} style={i === arr.length - 1 ? S.sigCellL : S.sigCell}>
              <Text style={S.sigRole}>{role}</Text>
              <View style={S.sigLine} />
              <Text style={S.sigName}>Name:</Text>
              <Text style={S.sigDate}>Date:</Text>
            </View>
          ))}
        </View>

      </Page>
    </Document>
  );
}

// ── Download helper ────────────────────────────────────────────
export async function downloadWorkOrderPDF(
  wo: WOData,
  company?: CompanyData | null,
  contractor?: ContractorData | null,
) {
  const blob = await pdf(
    <WorkOrderDocument wo={wo} company={company} contractor={contractor} />
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = `${wo.workOrderNo}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
