import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";
import { pdf } from "@react-pdf/renderer";
import { translateToHindi, translateManyToHindi } from "../utils/translateToHindi";
import { getWorkOrderDocuments } from "./DocumentsUpload";
import { mergeAttachmentsIntoPdf } from "../utils/pdfMerge";

// Devanagari-capable static (non-variable) font — required because react-pdf/fontkit
// doesn't reliably render OpenType variable fonts, and Hindi text needs a font with
// proper GSUB/GPOS conjunct-shaping tables (verified present in this file).
Font.register({
  family: "Hind",
  fonts: [
    { src: "https://raw.githubusercontent.com/google/fonts/main/ofl/hind/Hind-Regular.ttf", fontWeight: "normal" },
    { src: "https://raw.githubusercontent.com/google/fonts/main/ofl/hind/Hind-Bold.ttf", fontWeight: "bold" },
  ],
});

// ── Palette ────────────────────────────────────────────────────
const ORANGE = "#FF7A00";
const DARK   = "#111827";
const MID    = "#374151";
const GRAY   = "#6B7280";
const LIGHT  = "#F9FAFB";
const BORDER = "#D1D5DB";
const HDR_BG = "#1F2937";

// ── Styles (mirrors WorkOrderPDF.tsx, with "Hind" replacing Helvetica) ──────
const S = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Hind", color: DARK, backgroundColor: "#fff" },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: ORANGE },
  logoBox:   { flexDirection: "column" },
  logoName:  { fontSize: 17, fontWeight: "bold", color: DARK, letterSpacing: 0.5 },
  logoSub:   { fontSize: 9, color: GRAY, marginTop: 2, letterSpacing: 0.3 },
  docTitle:  { textAlign: "right" },
  docMain:   { fontSize: 15, fontWeight: "bold", color: ORANGE, letterSpacing: 0.4 },
  docSub:    { fontSize: 10, fontWeight: "bold", color: MID, marginTop: 3, letterSpacing: 0.3 },
  docBadge:  { fontSize: 8.5, color: GRAY, letterSpacing: 0.5, marginTop: 2 },

  table:     { borderWidth: 1, borderColor: BORDER, borderRadius: 3, marginBottom: 10, overflow: "hidden" },
  secHeader: { backgroundColor: ORANGE, paddingVertical: 5, paddingHorizontal: 10, flexDirection: "row", alignItems: "center" },
  secTitle:  { fontWeight: "bold", color: "#fff", fontSize: 9, letterSpacing: 0.4 },
  row:       { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER },
  rowLast:   { flexDirection: "row" },
  cellLabel: { width: "38%", backgroundColor: LIGHT, padding: "5px 10px", fontWeight: "bold", fontSize: 9, color: MID },
  cellVal:   { flex: 1, padding: "5px 10px", fontSize: 9, color: DARK },
  cellValMono: { flex: 1, padding: "5px 10px", fontSize: 9, color: DARK },

  scopeHdr:  { flexDirection: "row", backgroundColor: HDR_BG, padding: "5px 8px" },
  scopeRow:  { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, padding: "4px 8px" },
  scopeAlt:  { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, padding: "4px 8px", backgroundColor: LIGHT },
  colDesc:   { flex: 2.2, fontSize: 8.5, paddingRight: 6 },
  colUnit:   { width: 40, fontSize: 8.5, textAlign: "center", paddingRight: 6 },
  colQty:    { width: 42, fontSize: 8.5, textAlign: "right", paddingRight: 8 },
  colDate:   { width: 52, fontSize: 8.5, textAlign: "center", paddingRight: 6 },
  colRate:   { width: 50, fontSize: 8.5, textAlign: "right", paddingRight: 8 },
  colGst:    { width: 32, fontSize: 8, textAlign: "center", paddingRight: 4 },
  colAmt:    { width: 62, fontSize: 8.5, textAlign: "right" },
  hdrText:   { color: "#fff", fontWeight: "bold", fontSize: 8.5 },

  sideRow:   { flexDirection: "row", gap: 10, marginBottom: 10 },
  sideCol:   { flex: 1 },

  msHdr:     { flexDirection: "row", backgroundColor: HDR_BG, padding: "5px 6px" },
  msRow:     { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, padding: "4px 6px" },
  msAlt:     { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, padding: "4px 6px", backgroundColor: LIGHT },
  msStage:   { flex: 1.6, fontSize: 8.5 },
  msDate:    { width: 56, fontSize: 8.5, textAlign: "center" },
  msMode:    { width: 66, fontSize: 8.5, textAlign: "center" },
  msAmt:     { width: 62, fontSize: 8.5, textAlign: "right" },
  msGst:     { width: 62, fontSize: 8, textAlign: "center" },
  msPay:     { width: 66, fontSize: 8.5, textAlign: "right", fontWeight: "bold" },

  warrRow:   { flexDirection: "row", marginBottom: 3.5, gap: 4 },
  warrNum:   { fontSize: 8, color: ORANGE, fontWeight: "bold", width: 13 },
  warrText:  { flex: 1, fontSize: 8.5, color: MID, lineHeight: 1.5 },

  totalRow:  { flexDirection: "row", justifyContent: "flex-end", borderTopWidth: 1.5, borderTopColor: ORANGE, padding: "5px 8px", backgroundColor: "#FFF8F3" },
  totalLabel:{ fontWeight: "bold", fontSize: 9.5, color: ORANGE, marginRight: 10, width: 94, textAlign: "right" },
  totalVal:  { fontWeight: "bold", fontSize: 9.5, color: DARK, width: 72, textAlign: "right" },
  gstRow:    { flexDirection: "row", justifyContent: "flex-end", borderTopWidth: 1, borderTopColor: BORDER, padding: "4px 8px" },
  gstLabel:  { fontSize: 8.5, color: GRAY, marginRight: 10, width: 94, textAlign: "right" },
  gstVal:    { fontSize: 8.5, color: GRAY, width: 72, textAlign: "right" },

  termsHdr:  { fontWeight: "bold", fontSize: 9, color: DARK, marginBottom: 5, borderLeftWidth: 3, borderLeftColor: ORANGE, paddingLeft: 6, letterSpacing: 0.3 },
  termRow:   { flexDirection: "row", marginBottom: 3.5, gap: 4 },
  termNum:   { fontSize: 8, color: ORANGE, fontWeight: "bold", width: 15, paddingTop: 0.5 },
  termText:  { flex: 1, fontSize: 8, color: MID, lineHeight: 1.6 },

  sigBlock:  { flexDirection: "row", marginTop: 14, borderWidth: 1, borderColor: BORDER, borderRadius: 3 },
  sigCell:   { flex: 1, padding: "10px 10px", borderRightWidth: 1, borderRightColor: BORDER },
  sigCellL:  { flex: 1, padding: "10px 10px" },
  sigRole:   { fontSize: 8.5, fontWeight: "bold", color: MID, marginBottom: 22, letterSpacing: 0.3 },
  sigLine:   { borderTopWidth: 1, borderTopColor: BORDER, width: "100%" },
  sigName:   { fontSize: 7.5, color: GRAY, marginTop: 3 },
  sigDate:   { fontSize: 7.5, color: GRAY, marginTop: 2 },

  sectionGap: { marginBottom: 10 },
});

// ── Types (mirrors WorkOrderPDF.tsx) ────────────────────────────
interface PaymentMilestoneData {
  stage?: string;
  date?: string;
  type?: string;
  mode?: string;
  amount?: number;
  gstPercent?: number;
  gstType?: "inclusive" | "exclusive";
  payable?: number;
}

interface WOData {
  workOrderNo: string;
  issueDate: string;
  preparedByName?: string;
  preparedByContact?: string;
  projectName: string;
  projectLocation?: string;
  category?: string;
  subCategory?: string;
  scopeOfWork?: string;
  totalTenure?: string;
  description?: string;
  vendorName?: string;
  vendorCode?: string;
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
    gstPercent?: number;
    plannedStart?: string;
    plannedEnd?: string;
    subItems?: Array<{ description: string; unit?: string; plannedQty?: number; rate?: number; amount?: number }>;
  }>;
  paymentMilestones?: PaymentMilestoneData[];
  warrantyTerms?: string[];
  documents?: { name: string; url: string }[];
  documentName?: string;
  documentUrl?: string;
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
  vendorCode?: string;
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
    return new Date(d).toLocaleDateString("hi-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
};

const fmtAmt = (n?: number) =>
  n ? "₹ " + Math.round(n).toLocaleString("en-IN") : "—";

// General Terms & Conditions — Hindi translation of the same 10 standard terms
const TERMS = [
  "सभी कार्य स्वीकृत ड्रॉइंग, विनिर्देशों और IS मानकों के अनुसार ही किए जाएंगे। लिखित अनुमति के बिना कोई भी विचलन मान्य नहीं होगा।",
  "ठेकेदार को कार्य की पूर्ण गुणवत्ता बनाए रखनी होगी। किसी भी दोषपूर्ण या घटिया गुणवत्ता के कार्य को ठेकेदार को अपने खर्च पर सुधारना होगा।",
  "सभी माप साइट इंजीनियर के साथ संयुक्त रूप से लिए जाएंगे। बिलिंग के लिए केवल प्रमाणित संयुक्त माप ही मान्य होंगे।",
  "बिल के सत्यापन और स्वीकृति के बाद 15–30 दिनों के भीतर भुगतान जारी किया जाएगा। मौखिक दावे स्वीकार नहीं किए जाएंगे।",
  "प्रत्येक बिल से 5% राशि प्रतिधारित की जाएगी, जो 6 महीने की दोष दायित्व अवधि (DLP) के बाद जारी की जाएगी।",
  "श्रमिकों की सुरक्षा के लिए ठेकेदार पूर्ण रूप से जिम्मेदार होगा। सुरक्षा उपकरण (PPE) पहनना अनिवार्य है। किसी भी दुर्घटना या चोट की जिम्मेदारी ठेकेदार की होगी।",
  "ठेकेदार को पर्याप्त जनशक्ति तैनात करनी होगी और निर्देश मिलने पर श्रमिकों की संख्या बढ़ानी होगी।",
  "कार्य में देरी होने पर प्रति सप्ताह 1% तक (अधिकतम 5%) जुर्माना लगाया जा सकता है। लंबित कार्य को ठेकेदार के जोखिम पर किसी अन्य एजेंसी से पूरा कराया जा सकता है।",
  "बिना लिखित पूर्व स्वीकृति के किसी भी अतिरिक्त कार्य या परिवर्तन का भुगतान नहीं किया जाएगा।",
  "श्रमिकों को अनुशासन बनाए रखना होगा, साइट के निर्धारित समय का पालन करना होगा और साइट को साफ-सुथरा रखना होगा। शराब, धूम्रपान या दुर्व्यवहार सख्त वर्जित है।",
];

// ── Row helpers ────────────────────────────────────────────────
function InfoRow({ label, value, last = false }: { label: string; value?: string; last?: boolean }) {
  return (
    <View style={last ? S.rowLast : S.row}>
      <Text style={S.cellLabel}>{label}</Text>
      <Text style={S.cellVal}>{value || "—"}</Text>
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

// ── The Document (Hindi) ────────────────────────────────────────
export function WorkOrderDocumentHindi({ wo, company, contractor }: Props) {
  const companyAddr = [company?.address, company?.city, company?.state].filter(Boolean).join(", ");
  const contractorAddr = contractor?.address || "—";

  // Sub-items ("Particulars") are a read-only descriptive breakdown — the main
  // item's own qty/rate/amount always drives the contract value.
  const lineItems: Array<{ desc: string; unit?: string; qty?: number; rate?: number; amount?: number; gstPercent?: number; start?: string; end?: string; isChild?: boolean }> = [];
  for (const item of wo.scopeItems || []) {
    const amount = item.amount ?? (item.plannedQty ?? 0) * (item.rate ?? 0);
    lineItems.push({ desc: item.description, unit: item.unit, qty: item.plannedQty, rate: item.rate, amount, gstPercent: item.gstPercent, start: item.plannedStart, end: item.plannedEnd });
    for (const sub of item.subItems ?? []) {
      lineItems.push({ desc: "  " + sub.description, unit: sub.unit, qty: sub.plannedQty, rate: sub.rate, amount: sub.amount ?? (sub.plannedQty ?? 0) * (sub.rate ?? 0), isChild: true });
    }
  }

  const totalAmt = (wo.scopeItems || []).reduce((s, item) => s + (item.amount ?? (item.plannedQty ?? 0) * (item.rate ?? 0)), 0) || wo.contractValue || 0;

  const totalInclGst = (wo.scopeItems || []).reduce((s, item) => {
    const base = item.amount ?? (item.plannedQty ?? 0) * (item.rate ?? 0);
    return s + base * (1 + (item.gstPercent ?? 0) / 100);
  }, 0);

  const milestones = wo.paymentMilestones ?? [];
  const grandPayable = milestones.reduce((s, m) => s + (m.payable ?? 0), 0);
  const specialTerms = (wo.warrantyTerms ?? []).filter(Boolean);

  return (
    <Document title={`कार्य आदेश ${wo.workOrderNo}`} author="Neoteric Group">
      <Page size="A4" style={S.page}>

        {/* ── Header ── */}
        <View style={S.headerRow}>
          <View style={S.logoBox}>
            <Text style={S.logoName}>Neoteric Group</Text>
            <Text style={S.logoSub}>{company?.name || "—"}</Text>
            <Text style={S.logoSub}>तैयारकर्ता: {wo.preparedByName || "—"}</Text>
            <Text style={S.logoSub}>संपर्क: {wo.preparedByContact || "—"}</Text>
          </View>
          <View style={S.docTitle}>
            <Text style={S.docMain}>कार्य आदेश</Text>
            <Text style={S.docSub}>{wo.workOrderNo}</Text>
            <Text style={S.docBadge}>जनरेट किया गया: {new Date().toLocaleString("hi-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
          </View>
        </View>

        {/* ── Contractor + Company Details (side by side) ── */}
        <View style={S.sideRow}>
          <View style={S.sideCol}>
            <SectionBox title="ठेकेदार विवरण">
              <InfoRow label="ठेकेदार का नाम"    value={wo.vendorName} />
              <InfoRow label="वेंडर कोड"         value={wo.vendorCode || contractor?.vendorCode} />
              <InfoRow label="संपर्क व्यक्ति"     value={wo.ownerName} />
              <InfoRow label="पता"               value={contractorAddr} />
              <InfoRow label="पैन नंबर"          value={contractor?.panNumber} />
              <InfoRow label="जीएसटी नंबर"       value={contractor?.gstNumber} />
              <InfoRow label="संपर्क / मोबाइल"    value={wo.mobile || contractor?.mobile} last />
            </SectionBox>
          </View>
          <View style={S.sideCol}>
            <SectionBox title="कंपनी विवरण (जारीकर्ता पक्ष)">
              <InfoRow label="कंपनी का नाम"  value={company?.name} />
              <InfoRow label="पता"           value={companyAddr || company?.address} />
              <InfoRow label="संपर्क व्यक्ति" value={company?.contactPerson} />
              <InfoRow label="ईमेल"          value={company?.email} />
              <InfoRow label="फ़ोन"          value={company?.phone} last />
            </SectionBox>
          </View>
        </View>

        {/* ── Project Details ── */}
        <SectionBox title="प्रोजेक्ट विवरण">
          <InfoRow label="प्रोजेक्ट का नाम"     value={wo.projectName} />
          {wo.projectLocation ? <InfoRow label="स्थान" value={wo.projectLocation} /> : null}
          <InfoRow label="श्रेणी"               value={wo.category} />
          {wo.subCategory ? <InfoRow label="उप-श्रेणी" value={wo.subCategory} /> : null}
          <InfoRow label="कार्य शीर्षक / विवरण" value={wo.description || wo.scopeOfWork} />
          <InfoRow label="संपूर्ण कार्य की कुल अवधि" value={wo.totalTenure} last />
        </SectionBox>

        {/* ── Scope of Work ── */}
        {lineItems.length > 0 && (
          <View style={[S.table, S.sectionGap]} wrap={false}>
            <View style={S.secHeader}>
              <Text style={S.secTitle}>कार्य का विवरण</Text>
            </View>
            <View style={S.scopeHdr}>
              <Text style={[S.colDesc, S.hdrText]}>विवरण</Text>
              <Text style={[S.colUnit, S.hdrText]}>इकाई</Text>
              <Text style={[S.colQty, S.hdrText]}>मात्रा</Text>
              <Text style={[S.colRate, S.hdrText]}>दर</Text>
              <Text style={[S.colGst, S.hdrText]}>जीएसटी</Text>
              <Text style={[S.colDate, S.hdrText]}>प्रारंभ</Text>
              <Text style={[S.colDate, S.hdrText]}>समाप्ति</Text>
              <Text style={[S.colAmt, S.hdrText]}>राशि</Text>
            </View>
            {lineItems.map((item, i) => (
              <View key={i} style={i % 2 === 0 ? S.scopeRow : S.scopeAlt} wrap={false}>
                <Text style={[S.colDesc, item.isChild ? { color: GRAY, paddingLeft: 8 } : { fontWeight: "bold", color: MID }]}>
                  {item.desc}
                </Text>
                <Text style={S.colUnit}>{item.unit || "—"}</Text>
                <Text style={S.colQty}>{item.qty != null ? item.qty.toLocaleString("en-IN") : "—"}</Text>
                <Text style={S.colRate}>{item.rate != null && item.rate > 0 ? item.rate.toLocaleString("en-IN") : "—"}</Text>
                <Text style={S.colGst}>{item.gstPercent != null ? `${item.gstPercent}%` : "—"}</Text>
                <Text style={S.colDate}>{item.start ? fmtDate(item.start) : "—"}</Text>
                <Text style={S.colDate}>{item.end ? fmtDate(item.end) : "—"}</Text>
                <Text style={[S.colAmt, { fontWeight: item.amount ? "bold" : "normal" }]}>
                  {item.amount ? fmtAmt(item.amount) : "—"}
                </Text>
              </View>
            ))}
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>कुल:</Text>
              <Text style={S.totalVal}>{fmtAmt(totalAmt)}</Text>
            </View>
            <View style={S.gstRow}>
              <Text style={S.gstLabel}>जीएसटी (प्रति मद):</Text>
              <Text style={S.gstVal}>{fmtAmt(Math.round(totalInclGst - totalAmt))}</Text>
            </View>
            <View style={[S.gstRow, { borderTopWidth: 1.5, borderTopColor: BORDER }]}>
              <Text style={[S.gstLabel, { color: MID, fontWeight: "bold" }]}>जीएसटी सहित कुल:</Text>
              <Text style={[S.gstVal, { color: MID, fontWeight: "bold" }]}>
                {fmtAmt(Math.round(totalInclGst))}
              </Text>
            </View>
          </View>
        )}

        {/* ── Payment Milestones ── */}
        {milestones.length > 0 && (
          <View style={[S.table, S.sectionGap]} wrap={false}>
            <View style={S.secHeader}>
              <Text style={S.secTitle}>भुगतान चरण</Text>
            </View>
            <View style={S.msHdr}>
              <Text style={[S.msStage, S.hdrText]}>प्रकार</Text>
              <Text style={[S.msDate, S.hdrText]}>तिथि</Text>
              <Text style={[S.msMode, S.hdrText]}>माध्यम</Text>
              <Text style={[S.msAmt, S.hdrText]}>राशि</Text>
              <Text style={[S.msGst, S.hdrText]}>जीएसटी</Text>
              <Text style={[S.msPay, S.hdrText]}>देय राशि</Text>
            </View>
            {milestones.map((m, i) => (
              <View key={i} style={i % 2 === 0 ? S.msRow : S.msAlt} wrap={false}>
                <Text style={S.msStage}>{m.type || m.stage || "—"}</Text>
                <Text style={S.msDate}>{m.date ? fmtDate(m.date) : "—"}</Text>
                <Text style={S.msMode}>{m.mode || "—"}</Text>
                <Text style={S.msAmt}>{m.amount ? fmtAmt(m.amount) : "—"}</Text>
                <Text style={S.msGst}>{m.gstPercent ?? 0}% {m.gstType === "inclusive" ? "सहित" : "अतिरिक्त"}</Text>
                <Text style={S.msPay}>{m.payable ? fmtAmt(m.payable) : "—"}</Text>
              </View>
            ))}
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>कुल योग:</Text>
              <Text style={S.totalVal}>{fmtAmt(grandPayable)}</Text>
            </View>
          </View>
        )}

        {/* ── Special Terms and Conditions ── */}
        {specialTerms.length > 0 && (
          <View style={[S.table, S.sectionGap]} wrap={false}>
            <View style={S.secHeader}>
              <Text style={S.secTitle}>विशेष नियम एवं शर्तें</Text>
            </View>
            <View style={{ padding: "8px 10px" }}>
              {specialTerms.map((t, i) => (
                <View key={i} style={S.warrRow}>
                  <Text style={S.warrNum}>{i + 1}.</Text>
                  <Text style={S.warrText}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── General Terms & Conditions ── */}
        <View style={{ marginBottom: 10 }} wrap={false}>
          <Text style={S.termsHdr}>सामान्य नियम एवं शर्तें</Text>
          {TERMS.map((t, i) => (
            <View key={i} style={S.termRow}>
              <Text style={S.termNum}>{i + 1}.</Text>
              <Text style={S.termText}>{t}</Text>
            </View>
          ))}
        </View>

        {/* ── Signature block ── */}
        <View style={S.sigBlock} wrap={false}>
          {(["ठेकेदार", "एजीएम – प्रोजेक्ट", "जीएम – प्रोजेक्ट"] as const).map((role, i, arr) => (
            <View key={role} style={i === arr.length - 1 ? S.sigCellL : S.sigCell}>
              <Text style={S.sigRole}>{role}</Text>
              <View style={S.sigLine} />
              <Text style={S.sigName}>नाम:</Text>
              <Text style={S.sigDate}>दिनांक:</Text>
            </View>
          ))}
        </View>

        {/* ── Final Approval — last signature, on its own line below ── */}
        <View style={[S.sigBlock, { marginTop: 8, width: "33%" }]} wrap={false}>
          <View style={S.sigCellL}>
            <Text style={S.sigRole}>अंतिम स्वीकृति</Text>
            <View style={S.sigLine} />
            <Text style={S.sigName}>नाम:</Text>
            <Text style={S.sigDate}>दिनांक:</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}

// ── Auto-translate free-text fields (never names/addresses/codes/numbers) ──
async function buildHindiWO(wo: WOData): Promise<WOData> {
  const scopeItems  = wo.scopeItems ?? [];
  const milestones  = wo.paymentMilestones ?? [];
  const terms       = wo.warrantyTerms ?? [];
  const overallDesc = wo.description || wo.scopeOfWork || "";

  const descTexts      = scopeItems.map(i => i.description);
  const subDescTexts   = scopeItems.flatMap(i => (i.subItems ?? []).map(s => s.description));
  const milestoneTexts = milestones.map(m => m.type || m.stage || "");

  const [
    translatedDescs, translatedSubDescs, translatedMilestoneTexts, translatedTerms,
    translatedOverall, translatedCategory, translatedSubCategory, translatedTenure,
  ] = await Promise.all([
    translateManyToHindi(descTexts),
    translateManyToHindi(subDescTexts),
    translateManyToHindi(milestoneTexts),
    translateManyToHindi(terms),
    translateToHindi(overallDesc),
    translateToHindi(wo.category),
    translateToHindi(wo.subCategory),
    translateToHindi(wo.totalTenure || ""),
  ]);

  let subIdx = 0;
  const newScopeItems = scopeItems.map((item, i) => ({
    ...item,
    description: translatedDescs[i] || item.description,
    subItems: (item.subItems ?? []).map(sub => ({
      ...sub,
      description: translatedSubDescs[subIdx++] || sub.description,
    })),
  }));

  const newMilestones = milestones.map((m, i) => ({
    ...m,
    type: translatedMilestoneTexts[i] || m.type,
  }));

  return {
    ...wo,
    description: translatedOverall || overallDesc,
    category: translatedCategory || wo.category,
    subCategory: translatedSubCategory || wo.subCategory,
    totalTenure: translatedTenure || wo.totalTenure,
    scopeItems: newScopeItems,
    paymentMilestones: newMilestones,
    warrantyTerms: translatedTerms,
  };
}

// ── Download helper ────────────────────────────────────────────
export async function downloadWorkOrderPDFHindi(
  wo: WOData,
  company?: CompanyData | null,
  contractor?: ContractorData | null,
) {
  const translatedWo = await buildHindiWO(wo);
  const blob = await pdf(
    <WorkOrderDocumentHindi wo={translatedWo} company={company} contractor={contractor} />
  ).toBlob();
  const mainBytes = new Uint8Array(await blob.arrayBuffer());
  const documents = getWorkOrderDocuments(wo);
  const finalBytes = documents.length > 0
    ? await mergeAttachmentsIntoPdf(mainBytes, documents)
    : mainBytes;
  const finalBlob = new Blob([finalBytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(finalBlob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = `${wo.workOrderNo}-hindi.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
