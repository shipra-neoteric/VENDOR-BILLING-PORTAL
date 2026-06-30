import StatCard from "../../../shared/components/StatCard";
import { fmtCr } from "../utils";

interface Props {
  totalContractValue: number;
  certifiedAmt:       number;
  pendingAmt:         number;
  pendingCount:       number;
  paidAmt:            number;
  remaining:          number;
}

export function SummaryCards({ totalContractValue, certifiedAmt, pendingAmt, pendingCount, paidAmt, remaining }: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(178px, 1fr))", gap: 16, marginBottom: 24 }}>
      <StatCard label="Total Contract Value" value={fmtCr(totalContractValue)} icon="🏗️" color="#FF7A00" accent="#FF7A00" />
      <StatCard label="Certified Amount"     value={fmtCr(certifiedAmt)}       icon="✅" color="#16a34a" accent="#16a34a" />
      <StatCard label="Pending Approval"     value={`${pendingCount} bills`}   icon="⏳" color="#d97706" accent="#d97706" sub={fmtCr(pendingAmt)} />
      <StatCard label="Amount Paid"          value={fmtCr(paidAmt)}            icon="💳" color="#0d9488" accent="#0d9488" />
      <StatCard label="Remaining Balance"    value={fmtCr(remaining)}          icon="📊" color="#6B7280" />
    </div>
  );
}
