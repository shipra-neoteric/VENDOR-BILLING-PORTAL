import { Tag } from "antd";
import dayjs from "dayjs";

// ── Types ────────────────────────────────────────────────────────

interface BillNode {
  _id: string;
  billNo: string;
  billType?: string;
  relationshipType?: string;
  linkedBills?: { billId: string; billNo: string; relationshipType: string }[];
  billingCycle?: number;
  isActive?: boolean;
  supersededBy?: { _id: string; billNo: string } | null;
  amount: number;
  paidAmount?: number;
  status: string;
  billDate: string;
  remarks?: string;
  vendorName?: string;
  workOrderNo?: string;
}

const BILL_TYPE_CFG: Record<string, { label: string; color: string }> = {
  running:              { label: "Running Bill",     color: "#2563eb" },
  final:                { label: "Final Bill",       color: "#16a85a" },
  advance_mobilization: { label: "Mob. Advance",     color: "#7c3aed" },
  advance_secured:      { label: "Secured Advance",  color: "#7c3aed" },
  advance_material:     { label: "Material Advance", color: "#7c3aed" },
  recovery:             { label: "Recovery",         color: "#d97706" },
  credit_note:          { label: "Credit Note",      color: "#dc2626" },
  debit_note:           { label: "Debit Note",       color: "#d97706" },
  revision:             { label: "Revision",         color: "#0d9488" },
  correction:           { label: "Correction",       color: "#0d9488" },
  retention_release:    { label: "Retention Release",color: "#0369a1" },
};

const STATUS_COLORS: Record<string, string> = {
  draft: "default", submitted: "processing", verified: "warning",
  approved: "success", rejected: "error", paid: "purple",
};

const REL_LABEL: Record<string, string> = {
  CONTINUES:            "CONTINUES",
  SUPERSEDES:           "SUPERSEDES",
  ADJUSTMENT:           "ADJUSTMENT",
  REVISION_OF:          "REVISION OF",
  ADVANCE_FOR:          "ADVANCE FOR",
  RECOVERY_OF:          "RECOVERY OF",
  SETTLEMENT_OF:        "SETTLEMENT OF",
  CORRECTION_OF:        "CORRECTION OF",
  RETENTION_RELEASE_OF: "RETENTION RELEASE OF",
};

const fmt = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");

// ── Component ────────────────────────────────────────────────────

interface Props {
  bills: BillNode[];
  compact?: boolean;
}

export function BillingChain({ bills, compact = false }: Props) {
  if (!bills.length) return null;

  // Sort by billingCycle then date
  const sorted = [...bills].sort(
    (a, b) => (a.billingCycle ?? 0) - (b.billingCycle ?? 0) || a.billDate.localeCompare(b.billDate)
  );

  return (
    <div style={{ position: "relative" }}>
      {/* vertical spine */}
      {sorted.length > 1 && (
        <div style={{
          position: "absolute", left: compact ? 16 : 20, top: 28,
          bottom: 28, width: 2, background: "#e4e7ee", zIndex: 0,
        }} />
      )}

      {sorted.map((bill, idx) => {
        const typeCfg = BILL_TYPE_CFG[bill.billType || "running"] || BILL_TYPE_CFG.running;
        const isSuperseded = bill.isActive === false;
        const isLast = idx === sorted.length - 1;

        return (
          <div key={bill._id} style={{ display: "flex", alignItems: "flex-start", gap: compact ? 10 : 14, marginBottom: isLast ? 0 : 16, position: "relative", zIndex: 1 }}>
            {/* Node dot */}
            <div style={{
              width: compact ? 32 : 40,
              height: compact ? 32 : 40,
              borderRadius: "50%",
              background: isSuperseded ? "#f3f4f6" : `${typeCfg.color}15`,
              border: `2px solid ${isSuperseded ? "#d1d5db" : typeCfg.color}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              fontSize: compact ? 11 : 13, fontWeight: 800,
              color: isSuperseded ? "#9ca3af" : typeCfg.color,
              fontFamily: "monospace",
            }}>
              {bill.billingCycle ?? idx + 1}
            </div>

            {/* Card */}
            <div style={{
              flex: 1,
              border: `1px solid ${isSuperseded ? "#e5e7eb" : typeCfg.color + "40"}`,
              borderRadius: 10,
              padding: compact ? "10px 12px" : "12px 16px",
              background: isSuperseded ? "#f9fafb" : "#fff",
              opacity: isSuperseded ? 0.7 : 1,
            }}>
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{
                  fontFamily: "monospace", fontWeight: 700,
                  color: isSuperseded ? "#9ba3b8" : "#f37916",
                  fontSize: compact ? 13 : 14,
                  textDecoration: isSuperseded ? "line-through" : undefined,
                }}>
                  {bill.billNo}
                </span>
                <Tag
                  style={{
                    fontSize: 10, fontWeight: 600,
                    color: isSuperseded ? "#6b7280" : typeCfg.color,
                    borderColor: isSuperseded ? "#d1d5db" : typeCfg.color,
                    background: isSuperseded ? "#f3f4f6" : `${typeCfg.color}10`,
                  }}
                >
                  {isSuperseded ? "SUPERSEDED" : typeCfg.label}
                </Tag>
                <Tag color={STATUS_COLORS[bill.status] || "default"} style={{ fontSize: 10 }}>
                  {bill.status.toUpperCase()}
                </Tag>
                <span style={{ marginLeft: "auto", fontFamily: "monospace", fontWeight: 700, color: isSuperseded ? "#9ba3b8" : "#1a1f2e", fontSize: compact ? 12 : 13 }}>
                  {fmt(bill.amount)}
                </span>
              </div>

              {/* Metadata row */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "#9ba3b8" }}>
                <span>{dayjs(bill.billDate).format("DD MMM YYYY")}</span>
                {bill.paidAmount != null && bill.status === "paid" && (
                  <span style={{ color: "#16a85a", fontWeight: 600 }}>
                    Actually Paid: {fmt(bill.paidAmount)}
                  </span>
                )}
                {bill.remarks && <span style={{ fontStyle: "italic" }}>{bill.remarks}</span>}
              </div>

              {/* Relationship indicators */}
              {bill.supersededBy && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>
                  ↩ Superseded by{" "}
                  <span style={{ fontFamily: "monospace" }}>{bill.supersededBy.billNo}</span>
                </div>
              )}
              {bill.linkedBills && bill.linkedBills.length > 0 && (
                <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {bill.linkedBills.map((l, i) => (
                    <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10, color: "#7c3aed", fontWeight: 700, textTransform: "uppercase" }}>
                        {REL_LABEL[l.relationshipType] || l.relationshipType}
                      </span>
                      <Tag style={{ fontFamily: "monospace", fontSize: 10, color: "#f37916", borderColor: "#f37916", background: "#fff7ed" }}>
                        {l.billNo}
                      </Tag>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
