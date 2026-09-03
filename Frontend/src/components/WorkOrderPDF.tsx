import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";
import { pdf } from "@react-pdf/renderer";

// react-pdf hyphenates long words by default (e.g. "CONSULTANTS" -> "CON-SULTANTS"
// split across lines), which reads as garbled/broken text in narrow table cells —
// wrap whole words onto the next line instead.
Font.registerHyphenationCallback(word => [word]);

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
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: DARK, backgroundColor: "#fff" },

  // ── Header
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: ORANGE },
  logoBox:   { flexDirection: "column" },
  logoName:  { fontSize: 17, fontFamily: "Helvetica-Bold", color: DARK, letterSpacing: 0.5 },
  logoSub:   { fontSize: 9, color: GRAY, marginTop: 2, letterSpacing: 0.3 },
  docTitle:  { textAlign: "right" },
  docMain:   { fontSize: 15, fontFamily: "Helvetica-Bold", color: ORANGE, letterSpacing: 0.4 },
  docSub:    { fontSize: 10, fontFamily: "Helvetica-Bold", color: MID, marginTop: 3, letterSpacing: 0.3 },
  docBadge:  { fontSize: 8.5, color: GRAY, letterSpacing: 0.5, marginTop: 2 },

  // ── Section table
  table:     { borderWidth: 1, borderColor: BORDER, borderRadius: 3, marginBottom: 10, overflow: "hidden" },
  secHeader: { backgroundColor: ORANGE, paddingVertical: 5, paddingHorizontal: 10, flexDirection: "row", alignItems: "center" },
  secTitle:  { fontFamily: "Helvetica-Bold", color: "#fff", fontSize: 9, letterSpacing: 0.4, textTransform: "uppercase" },
  row:       { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER },
  rowLast:   { flexDirection: "row" },
  cellLabel: { width: "38%", backgroundColor: LIGHT, padding: "5px 10px", fontFamily: "Helvetica-Bold", fontSize: 9, color: MID, lineHeight: 1.35 },
  cellVal:   { flex: 1, padding: "5px 10px", fontSize: 9, color: DARK, lineHeight: 1.35 },
  cellValMono: { flex: 1, padding: "5px 10px", fontSize: 9, color: DARK, fontFamily: "Helvetica-Oblique", lineHeight: 1.35 },

  // ── Scope table
  scopeHdr:     { flexDirection: "row", backgroundColor: HDR_BG, padding: "5px 8px" },
  scopeRow:     { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, padding: "5px 8px" },
  scopeAlt:     { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, padding: "5px 8px", backgroundColor: LIGHT },
  scopeChild:   { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: BORDER, padding: "4px 8px 4px 4px", backgroundColor: "#FCFCFD" },
  scopeChildRule: { width: 2, backgroundColor: "#E5E7EB", marginRight: 6, borderRadius: 1 },
  particularsLbl: { fontSize: 7, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2, paddingLeft: 8, marginTop: 2 },
  colDesc:      { flex: 2.2, paddingRight: 6 },
  colDescText:  { fontSize: 8.5 },
  colRemarks:   { fontSize: 7.5, color: GRAY, fontFamily: "Helvetica-Oblique", lineHeight: 1.4 },
  // Rendered as its own block below the row rather than inside colDesc, so a
  // long multi-line remark can wrap/paginate freely without being confined
  // to the description column's width or dragging the row's other cells
  // along when it splits across a page.
  remarksBlock: { paddingHorizontal: 8, paddingBottom: 4, borderTopWidth: 0.5, borderTopColor: "#F1F2F4" },
  colUnit:   { width: 40, fontSize: 8.5, textAlign: "center", paddingRight: 6 },
  colQty:    { width: 42, fontSize: 8.5, textAlign: "right", paddingRight: 8 },
  colDate:   { width: 60, fontSize: 8.5, textAlign: "center", paddingRight: 4 },
  colRate:   { width: 50, fontSize: 8.5, textAlign: "right", paddingRight: 8 },
  colGst:    { width: 32, fontSize: 8, textAlign: "center", paddingRight: 4 },
  colAmt:    { width: 62, fontSize: 8.5, textAlign: "right" },
  hdrText:   { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8.5 },

  // ── Side-by-side details
  sideRow:   { flexDirection: "row", gap: 10, marginBottom: 10 },
  sideCol:   { flex: 1 },

  // ── Payment milestones table
  msHdr:     { flexDirection: "row", backgroundColor: HDR_BG, padding: "5px 6px" },
  msRow:     { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, padding: "4px 6px" },
  msAlt:     { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, padding: "4px 6px", backgroundColor: LIGHT },
  msStage:   { flex: 1.6, fontSize: 8.5 },
  msDate:    { width: 56, fontSize: 8.5, textAlign: "center" },
  msMode:    { width: 66, fontSize: 8.5, textAlign: "center" },
  msAmt:     { width: 62, fontSize: 8.5, textAlign: "right" },
  msGst:     { width: 62, fontSize: 8, textAlign: "center" },
  msPay:     { width: 66, fontSize: 8.5, textAlign: "right", fontFamily: "Helvetica-Bold" },

  // ── Warranty
  warrRow:   { flexDirection: "row", marginBottom: 3.5, gap: 4 },
  warrNum:   { fontSize: 8, color: ORANGE, fontFamily: "Helvetica-Bold", width: 13 },
  warrText:  { flex: 1, fontSize: 8.5, color: MID, lineHeight: 1.5 },

  // ── Totals
  totalRow:  { flexDirection: "row", justifyContent: "flex-end", borderTopWidth: 1.5, borderTopColor: ORANGE, padding: "5px 8px", backgroundColor: "#FFF8F3" },
  totalLabel:{ fontFamily: "Helvetica-Bold", fontSize: 9.5, color: ORANGE, marginRight: 10, width: 84, textAlign: "right" },
  totalVal:  { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: DARK, width: 72, textAlign: "right" },
  gstRow:    { flexDirection: "row", justifyContent: "flex-end", borderTopWidth: 1, borderTopColor: BORDER, padding: "4px 8px" },
  gstLabel:  { fontSize: 8.5, color: GRAY, marginRight: 10, width: 84, textAlign: "right" },
  gstVal:    { fontSize: 8.5, color: GRAY, width: 72, textAlign: "right" },

  // ── Terms
  termsHdr:  { fontFamily: "Helvetica-Bold", fontSize: 9, color: DARK, marginBottom: 5, borderLeftWidth: 3, borderLeftColor: ORANGE, paddingLeft: 6, letterSpacing: 0.3 },
  termRow:   { flexDirection: "row", marginBottom: 3.5, gap: 4 },
  termNum:   { fontSize: 8, color: ORANGE, fontFamily: "Helvetica-Bold", width: 13, paddingTop: 0.5 },
  termText:  { flex: 1, fontSize: 8, color: MID, lineHeight: 1.5 },

  // ── Signature
  sigBlock:  { flexDirection: "row", marginTop: 14, borderWidth: 1, borderColor: BORDER, borderRadius: 3 },
  sigCell:   { flex: 1, padding: "10px 10px", borderRightWidth: 1, borderRightColor: BORDER },
  sigCellL:  { flex: 1, padding: "10px 10px" },
  sigRole:   { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: MID, marginBottom: 4, letterSpacing: 0.3 },
  // Fixed-height slot so the line below always lands in the same place whether
  // this stage is already approved in-system (shows "Approved") or still needs
  // a physical wet signature (stays blank).
  // Left-aligned rather than centered — leaves the right side of the line
  // clear in case someone still wants to physically sign it too.
  sigSlot:   { height: 18, justifyContent: "flex-end", alignItems: "flex-start" },
  sigApprovedText: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#16A34A", letterSpacing: 0.5 },
  sigLine:   { borderTopWidth: 1, borderTopColor: BORDER, width: "100%" },
  sigName:   { fontSize: 7.5, color: GRAY, marginTop: 3 },
  sigDate:   { fontSize: 7.5, color: GRAY, marginTop: 2 },

  sectionGap: { marginBottom: 10 },
});

// ── Types passed in ────────────────────────────────────────────
interface PaymentMilestoneData {
  stage?: string;
  date?: string;
  type?: string;
  mode?: string;
  amount?: number;
  gstPercent?: number;
  payable?: number;
}

interface WOData {
  workOrderNo: string;
  issueDate: string;
  createdAt?: string;
  updatedAt?: string;
  preparedByName?: string;
  preparedByContact?: string;
  projectName: string;
  projectLocation?: string;
  category?: string;
  subCategory?: string;
  department?: string;
  customDepartment?: string;
  scopeOfWork?: string;
  totalTenure?: string;
  internalRemark?: string;
  description?: string;
  vendorName?: string;
  vendorCode?: string;
  ownerName?: string;
  mobile?: string;
  issuedUnder?: "company" | "owner";
  contractType?: "execution" | "professional-services";
  assignedDRI?: ({ name: string; email?: string; mobile?: string } | string)[];
  contractValue?: number;
  discount?: number;
  gstPercent?: number;
  tdsPercent?: number;
  scopeItems?: Array<{
    description: string;
    remarks?: string;
    unit?: string;
    plannedQty?: number;
    rate?: number;
    amount?: number;
    gstPercent?: number;
    plannedStart?: string;
    plannedEnd?: string;
    stage?: string;
    subItems?: Array<{ description: string; remarks?: string; unit?: string; plannedQty?: number; rate?: number; amount?: number; plannedStart?: string; plannedEnd?: string }>;
  }>;
  paymentMilestones?: PaymentMilestoneData[];
  warrantyTerms?: string[];
  documents?: { name: string; url: string }[];
  documentName?: string;
  documentUrl?: string;
  // Real in-system approval state — resolved (id -> name) by the caller before
  // handing this off to the PDF, since this component does no fetching of its
  // own. A stage stays undefined/null until it's actually been done; the
  // signature block below falls back to a blank physical-signature line for
  // it. No "maker" here — that's Neoteric staff acting for the contractor,
  // never bound to the Contractor signature slot (see the signature block).
  approvals?: {
    checker?: { name?: string; at?: string } | null;
    approver?: { name?: string; at?: string } | null;
    final?: { name?: string; at?: string } | null;
  };
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
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
};

// Same as fmtDate but with the time of day too — used on approval signatures,
// where knowing exactly when someone signed off (not just the date) matters.
const fmtDateTime = (d?: string) => {
  if (!d) return "—";
  try {
    const date = new Date(d);
    const day = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const time = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    return `${day}, ${time}`;
  } catch { return d; }
};

const fmtAmt = (n?: number) =>
  n ? "₹ " + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

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

const DEPARTMENT_LABEL: Record<string, string> = {
  civil: "Civil Team", marketing: "Marketing Team", planning: "Planning Team",
  maintenance: "Maintenance Team",
};
function departmentLabel(department?: string, customDepartment?: string): string | undefined {
  if (!department) return undefined;
  if (department === "custom") return customDepartment || "Custom Team";
  return DEPARTMENT_LABEL[department];
}

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

  // Which contractor identity this WO is drawn up in — a consultant billed
  // personally rather than through their firm, for instance. Purely which
  // name leads the "Contractor Details" box; the other stays visible as the
  // secondary line.
  const isProfessionalServices = wo.contractType === "professional-services";
  const issuedUnderOwner   = wo.issuedUnder === "owner";
  const primaryContractorName = issuedUnderOwner ? wo.ownerName : wo.vendorName;
  const secondaryLabel        = issuedUnderOwner ? "Company / Firm" : "Contact Person";
  const secondaryValue        = issuedUnderOwner ? wo.vendorName : wo.ownerName;

  // Flatten scope items. Each main item's own qty/rate/amount is what drives the
  // contract value (totalAmt/totalInclGst below are computed straight from
  // wo.scopeItems, never from this flattened list) — sub-items ("Particulars")
  // show their own qty/rate/amount too, but purely for reference; they're never
  // summed into any total, so there's no double-counting between an item and
  // its own particulars.
  const lineItems: Array<{ desc: string; remarks?: string; unit?: string; qty?: number; rate?: number; amount?: number; gstPercent?: number; start?: string; end?: string; stage?: string; isChild?: boolean; isParent?: boolean }> = [];
  for (const item of wo.scopeItems || []) {
    const amount = item.amount ?? (item.plannedQty ?? 0) * (item.rate ?? 0);
    lineItems.push({ desc: item.description, remarks: item.remarks, unit: item.unit, qty: item.plannedQty, rate: item.rate, amount, gstPercent: item.gstPercent, start: item.plannedStart, end: item.plannedEnd, stage: item.stage, isParent: (item.subItems?.length ?? 0) > 0 });
    for (const sub of item.subItems ?? []) {
      lineItems.push({ desc: sub.description, remarks: sub.remarks, unit: sub.unit, qty: sub.plannedQty, rate: sub.rate, amount: sub.amount ?? (sub.plannedQty ?? 0) * (sub.rate ?? 0), start: sub.plannedStart, end: sub.plannedEnd, isChild: true });
    }
  }

  const totalAmt = (wo.scopeItems || []).reduce((s, item) => s + (item.amount ?? (item.plannedQty ?? 0) * (item.rate ?? 0)), 0) || wo.contractValue || 0;

  // Per-item GST — each work item can carry its own rate, so the incl.-GST
  // total is a sum of item-level amounts, not one blended work-order rate.
  const totalInclGst = (wo.scopeItems || []).reduce((s, item) => {
    const base = item.amount ?? (item.plannedQty ?? 0) * (item.rate ?? 0);
    return s + base * (1 + (item.gstPercent ?? 0) / 100);
  }, 0);

  const milestones = wo.paymentMilestones ?? [];
  const grandPayable = milestones.reduce((s, m) => s + (m.payable ?? 0), 0);
  const warrantyTerms = (wo.warrantyTerms ?? []).filter(Boolean);

  return (
    <Document title={`Work Order ${wo.workOrderNo}`} author="Neoteric Group">
      <Page size="A4" style={S.page}>

        {/* ── Header ── */}
        <View style={S.headerRow}>
          <View style={S.logoBox}>
            <Text style={S.logoName}>Neoteric Group</Text>
            <Text style={S.logoSub}>{company?.name || "—"}</Text>
            <Text style={S.logoSub}>Prepared By: {wo.preparedByName || "—"}</Text>
            <Text style={S.logoSub}>Contact: {wo.preparedByContact || "—"}</Text>
          </View>
          <View style={S.docTitle}>
            <Text style={S.docMain}>WORK ORDER</Text>
            <Text style={S.docSub}>{wo.workOrderNo}</Text>
            <Text style={S.docBadge}>Created: {(wo.createdAt ? new Date(wo.createdAt) : new Date(wo.issueDate)).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
            {wo.updatedAt && wo.createdAt && new Date(wo.updatedAt).getTime() - new Date(wo.createdAt).getTime() > 60000 && (
              <Text style={S.docBadge}>Last Edited: {new Date(wo.updatedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
            )}
          </View>
        </View>

        {/* ── Contractor + Company Details (side by side) ── */}
        <View style={S.sideRow}>
          <View style={S.sideCol}>
            <SectionBox title={isProfessionalServices ? "Consultant Details" : "Contractor Details"}>
              <InfoRow label="Contractor Name"  value={primaryContractorName} />
              <InfoRow label="Vendor Code"      value={wo.vendorCode || contractor?.vendorCode} mono />
              <InfoRow label={secondaryLabel}   value={secondaryValue} />
              <InfoRow label="Address"          value={contractorAddr} />
              <InfoRow label="PAN No."          value={contractor?.panNumber} mono />
              <InfoRow label="GST No."          value={contractor?.gstNumber} mono />
              <InfoRow label="Contact / Mobile" value={wo.mobile || contractor?.mobile} last />
            </SectionBox>
          </View>
          <View style={S.sideCol}>
            <SectionBox title="Company Details (Issuing Party)">
              <InfoRow label="Company Name"   value={company?.name} />
              <InfoRow label="Address"        value={companyAddr || company?.address} />
              <InfoRow label="Contact Person" value={company?.contactPerson} />
              <InfoRow label="Email"          value={company?.email} />
              <InfoRow label="Phone"          value={company?.phone} last />
            </SectionBox>
          </View>
        </View>

        {/* ── Project Details ── */}
        <SectionBox title="Project Details">
          <InfoRow label="Project Name"      value={wo.projectName} />
          {wo.projectLocation ? <InfoRow label="Location" value={wo.projectLocation} /> : null}
          <InfoRow label="Category"          value={wo.category} />
          {wo.subCategory ? <InfoRow label="Sub-category" value={wo.subCategory} /> : null}
          {departmentLabel(wo.department, wo.customDepartment) ? <InfoRow label="Department" value={departmentLabel(wo.department, wo.customDepartment)} /> : null}
          <InfoRow label="Work Title / Scope" value={wo.description || wo.scopeOfWork} />
          <InfoRow label="Total Tenure of Entire Work" value={wo.totalTenure} />
          <InfoRow label="Remarks" value={wo.internalRemark} last />
        </SectionBox>

        {/* ── Scope of Work (with pricing) ── */}
        {/* Not wrap={false}: with many items this table is often taller than one A4
            page, and forcing an over-height block to stay unbroken corrupts the
            layout — let it paginate naturally (individual rows below still don't
            split mid-row via their own wrap={false}). */}
        {lineItems.length > 0 && (
          <View style={[S.table, S.sectionGap]}>
            <View style={S.secHeader}>
              <Text style={S.secTitle}>{isProfessionalServices ? "Deliverables" : "Scope of Work"}</Text>
            </View>
            <View style={S.scopeHdr}>
              <Text style={[S.colDesc, S.hdrText]}>{isProfessionalServices ? "Deliverable" : "Description"}</Text>
              <Text style={[S.colUnit, S.hdrText]}>{isProfessionalServices ? "Stage" : "Unit"}</Text>
              <Text style={[S.colQty, S.hdrText]}>{isProfessionalServices ? "" : "Qty"}</Text>
              <Text style={[S.colRate, S.hdrText]}>{isProfessionalServices ? "" : "Rate"}</Text>
              <Text style={[S.colGst, S.hdrText]}>GST</Text>
              <Text style={[S.colDate, S.hdrText]}>{isProfessionalServices ? "" : "Start"}</Text>
              <Text style={[S.colDate, S.hdrText]}>{isProfessionalServices ? "Due Date" : "End"}</Text>
              <Text style={[S.colAmt, S.hdrText]}>Amount</Text>
            </View>
            {(() => { let groupIdx = -1; return lineItems.map((item, i) => {
              if (!item.isChild) groupIdx += 1;
              const rowStyle = item.isChild ? S.scopeChild : (groupIdx % 2 === 0 ? S.scopeRow : S.scopeAlt);
              return (
                <View key={i}>
                  {/* The row itself stays wrap={false} — it's a short,
                      single/two-line strip of aligned columns, and letting a
                      *row* split mid-page scatters its cells (react-pdf
                      doesn't keep a flex-row's siblings aligned across a
                      page break). Long remarks are rendered as their own
                      block below instead, outside this row, free to wrap and
                      paginate on their own without dragging the row's other
                      columns along with them. */}
                  <View style={rowStyle} wrap={false}>
                    {item.isChild && <View style={S.scopeChildRule} />}
                    <View style={S.colDesc}>
                      <Text style={[S.colDescText, item.isChild ? { color: GRAY } : { fontFamily: "Helvetica-Bold", color: MID }]}>
                        {item.desc}
                      </Text>
                    </View>
                    <Text style={[S.colUnit, item.isChild ? { color: GRAY } : {}]}>
                      {isProfessionalServices ? (item.stage || "—") : (item.unit || "—")}
                    </Text>
                    <Text style={[S.colQty, item.isChild ? { color: GRAY } : {}]}>
                      {isProfessionalServices ? "" : (item.qty != null ? item.qty.toLocaleString("en-IN") : "—")}
                    </Text>
                    <Text style={[S.colRate, item.isChild ? { color: GRAY } : {}]}>
                      {isProfessionalServices ? "" : (item.rate != null && item.rate > 0 ? item.rate.toLocaleString("en-IN") : "—")}
                    </Text>
                    <Text style={S.colGst}>{item.gstPercent != null ? `${item.gstPercent}%` : "—"}</Text>
                    <Text style={S.colDate}>{isProfessionalServices ? "" : (item.start ? fmtDate(item.start) : "—")}</Text>
                    <Text style={S.colDate}>{item.end ? fmtDate(item.end) : "—"}</Text>
                    <Text style={[S.colAmt, item.isChild ? { color: GRAY, fontFamily: "Helvetica-Oblique" } : { fontFamily: item.amount ? "Helvetica-Bold" : "Helvetica" }]}>
                      {item.amount ? fmtAmt(item.amount) : "—"}
                    </Text>
                  </View>
                  {item.remarks ? (
                    <View style={[S.remarksBlock, item.isChild ? { paddingLeft: 24 } : {}]}>
                      <Text style={S.colRemarks}>{item.remarks}</Text>
                    </View>
                  ) : null}
                </View>
              );
            }); })()}
            {/* Total */}
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>Total:</Text>
              <Text style={S.totalVal}>{fmtAmt(totalAmt)}</Text>
            </View>
            <View style={S.gstRow}>
              <Text style={S.gstLabel}>GST (per item):</Text>
              <Text style={S.gstVal}>{fmtAmt(Math.round(totalInclGst - totalAmt))}</Text>
            </View>
            <View style={[S.gstRow, { borderTopWidth: 1.5, borderTopColor: BORDER }]}>
              <Text style={[S.gstLabel, { color: MID, fontFamily: "Helvetica-Bold" }]}>Total incl. GST:</Text>
              <Text style={[S.gstVal, { color: MID, fontFamily: "Helvetica-Bold" }]}>
                {fmtAmt(Math.round(totalInclGst))}
              </Text>
            </View>
          </View>
        )}

        {/* ── Payment Milestones ── */}
        {milestones.length > 0 && (
          <View style={[S.table, S.sectionGap]}>
            <View style={S.secHeader}>
              <Text style={S.secTitle}>Payment Milestones</Text>
            </View>
            <View style={S.msHdr}>
              <Text style={[S.msStage, S.hdrText]}>Type</Text>
              <Text style={[S.msDate, S.hdrText]}>Date</Text>
              <Text style={[S.msMode, S.hdrText]}>Mode</Text>
              <Text style={[S.msAmt, S.hdrText]}>Amount</Text>
              <Text style={[S.msGst, S.hdrText]}>GST</Text>
              <Text style={[S.msPay, S.hdrText]}>Payable</Text>
            </View>
            {milestones.map((m, i) => (
              <View key={i} style={i % 2 === 0 ? S.msRow : S.msAlt} wrap={false}>
                <Text style={S.msStage}>{m.type || m.stage || "—"}</Text>
                <Text style={S.msDate}>{m.date ? fmtDate(m.date) : "—"}</Text>
                <Text style={S.msMode}>{m.mode || "—"}</Text>
                <Text style={S.msAmt}>{m.amount ? fmtAmt(m.amount) : "—"}</Text>
                <Text style={S.msGst}>{m.gstPercent ?? 0}%</Text>
                <Text style={S.msPay}>{m.payable ? fmtAmt(m.payable) : "—"}</Text>
              </View>
            ))}
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>{wo.discount ? "Subtotal:" : "Grand Total:"}</Text>
              <Text style={S.totalVal}>{fmtAmt(grandPayable)}</Text>
            </View>
            {!!wo.discount && (
              <>
                <View style={S.gstRow}>
                  <Text style={[S.gstLabel, { color: "#B91C1C" }]}>Less: Discount</Text>
                  <Text style={[S.gstVal, { color: "#B91C1C" }]}>-{fmtAmt(wo.discount)}</Text>
                </View>
                <View style={[S.gstRow, { borderTopWidth: 1.5, borderTopColor: BORDER }]}>
                  <Text style={[S.gstLabel, { color: MID, fontFamily: "Helvetica-Bold" }]}>Final Payable:</Text>
                  <Text style={[S.gstVal, { color: MID, fontFamily: "Helvetica-Bold" }]}>
                    {fmtAmt(Math.max(0, grandPayable - wo.discount))}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* ── Warranty / Guarantee Terms ── */}
        {warrantyTerms.length > 0 && (
          <View style={[S.table, S.sectionGap]}>
            <View style={S.secHeader}>
              <Text style={S.secTitle}>Special Terms and Conditions</Text>
            </View>
            <View style={{ padding: "8px 10px" }}>
              {warrantyTerms.map((t, i) => (
                <View key={i} style={S.warrRow}>
                  <Text style={S.warrNum}>{i + 1}.</Text>
                  <Text style={S.warrText}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── General Terms & Conditions ── */}
        <View style={{ marginBottom: 10 }}>
          <Text style={S.termsHdr}>General Terms & Conditions</Text>
          {TERMS.map((t, i) => (
            <View key={i} style={S.termRow}>
              <Text style={S.termNum}>{i + 1}.</Text>
              <Text style={S.termText}>{t}</Text>
            </View>
          ))}
        </View>

        {/* ── Signature block — "AGM"/"GM" map to the in-system Checker/Approver
            stages, each showing "Approved" + the real name/date of whoever
            actually did it once that stage is done. "Contractor" is
            deliberately never linked to any in-system stage — the Maker who
            enters the work order is Neoteric staff acting on the contractor's
            behalf, not the contractor themselves, so this stays a blank line
            for their own physical signature. ── */}
        <View style={S.sigBlock} wrap={false}>
          {([
            ["Contractor", null],
            ["AGM – Project", wo.approvals?.checker],
            ["GM – Project", wo.approvals?.approver],
          ] as const).map(([role, approval], i, arr) => (
            <View key={role} style={i === arr.length - 1 ? S.sigCellL : S.sigCell}>
              <Text style={S.sigRole}>{role}</Text>
              <View style={S.sigSlot}>
                {approval?.name ? <Text style={S.sigApprovedText}>Approved</Text> : null}
              </View>
              <View style={S.sigLine} />
              <Text style={S.sigName}>Name: {approval?.name || ""}</Text>
              <Text style={S.sigDate}>Date: {approval?.at ? fmtDateTime(approval.at) : ""}</Text>
            </View>
          ))}
        </View>

        {/* ── Final Approval — last signature, on its own line below, same width as one column ── */}
        <View style={[S.sigBlock, { marginTop: 8, width: "33%" }]} wrap={false}>
          <View style={S.sigCellL}>
            <Text style={S.sigRole}>Final Approval</Text>
            <View style={S.sigSlot}>
              {wo.approvals?.final?.name ? <Text style={S.sigApprovedText}>Approved</Text> : null}
            </View>
            <View style={S.sigLine} />
            <Text style={S.sigName}>Name: {wo.approvals?.final?.name || ""}</Text>
            <Text style={S.sigDate}>Date: {wo.approvals?.final?.at ? fmtDateTime(wo.approvals.final.at) : ""}</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}

// ── Download helper ────────────────────────────────────────────
// Deliberately does not merge in the uploaded work order documents (quotations,
// scanned attachments, etc.) — the download is just the generated Work Order
// itself; attachments are viewed separately via the Documents modal.
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
