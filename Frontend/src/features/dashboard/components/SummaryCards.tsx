import StatCard from "../../../shared/components/StatCard";
import { fmtCr } from "../utils";

interface Props {
  totalContractValue:        number;
  totalContractValueWithGST: number;
  certifiedAmt:              number;
  pendingAmt:                number;
  pendingCount:              number;
  paidAmt:                   number;
  actuallyPaid:              number;
  approvedNotPaid:           number;
  approvedNotPaidCount:      number;
  remaining:                 number;
}

export function SummaryCards({
  totalContractValue,
  totalContractValueWithGST,
  certifiedAmt,
  pendingAmt,
  pendingCount,
  paidAmt,
  actuallyPaid,
  approvedNotPaid,
  approvedNotPaidCount,
  remaining,
}: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(178px, 1fr))", gap: 16, marginBottom: 24 }}>
      <StatCard
        label="Total Contract Value"
        value={fmtCr(totalContractValueWithGST)}
        icon="🏗️"
        color="#FF7A00"
        accent="#FF7A00"
        sub={`Excl. GST: ${fmtCr(totalContractValue)}`}
      />
      <StatCard
        label="Certified Amount"
        value={fmtCr(certifiedAmt)}
        icon="✅"
        color="#16a34a"
        accent="#16a34a"
      />
      <StatCard
        label="Certified · Unpaid"
        value={approvedNotPaidCount > 0 ? fmtCr(approvedNotPaid) : "—"}
        icon="🔔"
        color="#7c3aed"
        accent="#7c3aed"
        sub={
          approvedNotPaidCount > 0
            ? `${approvedNotPaidCount} bill${approvedNotPaidCount !== 1 ? "s" : ""} awaiting payment`
            : "All certified bills paid"
        }
      />
      <StatCard
        label="Pending Approval"
        value={`${pendingCount} bills`}
        icon="⏳"
        color="#d97706"
        accent="#d97706"
        sub={fmtCr(pendingAmt)}
      />
      <StatCard
        label="Total Bill Amount"
        value={fmtCr(paidAmt)}
        icon="🧾"
        color="#0d9488"
        accent="#0d9488"
        sub="gross billed (paid bills)"
      />
      <StatCard
        label="Cash Released (Net TDS)"
        value={fmtCr(actuallyPaid)}
        icon="🏦"
        color="#1d4ed8"
        accent="#1d4ed8"
        sub="actual bank transfer"
      />
      <StatCard
        label="Remaining Balance"
        value={fmtCr(remaining)}
        icon="📊"
        color="#6B7280"
        sub="vs total incl. GST"
      />
    </div>
  );
}
