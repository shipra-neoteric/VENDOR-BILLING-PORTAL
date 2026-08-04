import { CornerLeftUp } from "lucide-react";
import dayjs from "dayjs";
import Badge from "../ui/Badge";

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

const STATUS_BADGE: Record<string, "gray" | "blue" | "amber" | "green" | "orange" | "purple" | "red"> = {
  draft: "gray", "verify-done": "blue", "l1-approved": "amber",
  approved: "green", "sent-to-tms": "orange", hold: "purple",
  rejected: "red", paid: "purple",
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
    <div className="relative">
      {/* vertical spine */}
      {sorted.length > 1 && (
        <div
          className="absolute bg-gray-200 dark:bg-gray-700/40 z-0"
          style={{ left: compact ? 16 : 20, top: 28, bottom: 28, width: 2 }}
        />
      )}

      {sorted.map((bill, idx) => {
        const typeCfg = BILL_TYPE_CFG[bill.billType || "running"] || BILL_TYPE_CFG.running;
        const isSuperseded = bill.isActive === false;
        const isLast = idx === sorted.length - 1;

        return (
          <div key={bill._id} className={`flex items-start relative z-[1] ${isLast ? "" : "mb-4"}`} style={{ gap: compact ? 10 : 14 }}>
            {/* Node dot */}
            <div
              className="rounded-full flex items-center justify-center shrink-0 font-mono font-extrabold"
              style={{
                width: compact ? 32 : 40,
                height: compact ? 32 : 40,
                background: isSuperseded ? "#f3f4f6" : `${typeCfg.color}15`,
                border: `2px solid ${isSuperseded ? "#d1d5db" : typeCfg.color}`,
                fontSize: compact ? 11 : 13,
                color: isSuperseded ? "#9ca3af" : typeCfg.color,
              }}
            >
              {bill.billingCycle ?? idx + 1}
            </div>

            {/* Card */}
            <div
              className="flex-1 rounded-[10px]"
              style={{
                border: `1px solid ${isSuperseded ? "#e5e7eb" : typeCfg.color + "40"}`,
                padding: compact ? "10px 12px" : "12px 16px",
                background: isSuperseded ? "#f9fafb" : "#fff",
                opacity: isSuperseded ? 0.7 : 1,
              }}
            >
              {/* Header row */}
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span
                  className="font-mono font-bold"
                  style={{
                    color: isSuperseded ? "#9ba3b8" : "#f37916",
                    fontSize: compact ? 13 : 14,
                    textDecoration: isSuperseded ? "line-through" : undefined,
                  }}
                >
                  {bill.billNo}
                </span>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md border"
                  style={{
                    color: isSuperseded ? "#6b7280" : typeCfg.color,
                    borderColor: isSuperseded ? "#d1d5db" : typeCfg.color,
                    background: isSuperseded ? "#f3f4f6" : `${typeCfg.color}10`,
                  }}
                >
                  {isSuperseded ? "SUPERSEDED" : typeCfg.label}
                </span>
                <Badge color={STATUS_BADGE[bill.status] || "gray"} small>{bill.status.toUpperCase()}</Badge>
                <span
                  className="font-mono font-bold ml-auto"
                  style={{ color: isSuperseded ? "#9ba3b8" : "#1a1f2e", fontSize: compact ? 12 : 13 }}
                >
                  {fmt(bill.amount)}
                </span>
              </div>

              {/* Metadata row */}
              <div className="flex gap-4 flex-wrap text-[11px] text-gray-400">
                <span>{dayjs(bill.billDate).format("DD MMM YYYY")}</span>
                {bill.paidAmount != null && bill.status === "paid" && (
                  <span className="text-emerald-600 font-semibold">
                    Actually Paid: {fmt(bill.paidAmount)}
                  </span>
                )}
                {bill.remarks && <span className="italic">{bill.remarks}</span>}
              </div>

              {/* Relationship indicators */}
              {bill.supersededBy && (
                <div className="mt-1.5 text-[11px] text-purple-600 font-semibold flex items-center gap-1">
                  <CornerLeftUp className="w-3 h-3" /> Superseded by{" "}
                  <span className="font-mono">{bill.supersededBy.billNo}</span>
                </div>
              )}
              {bill.linkedBills && bill.linkedBills.length > 0 && (
                <div className="mt-1.5 flex gap-1.5 flex-wrap items-center">
                  {bill.linkedBills.map((l, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <span className="text-[10px] text-purple-600 font-bold uppercase">
                        {REL_LABEL[l.relationshipType] || l.relationshipType}
                      </span>
                      <span className="font-mono text-[10px] text-[#f37916] border border-[#f37916] bg-orange-50 rounded-md px-1.5 py-0.5">
                        {l.billNo}
                      </span>
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
