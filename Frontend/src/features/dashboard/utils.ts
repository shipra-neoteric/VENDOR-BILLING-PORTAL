export interface WORow   { _id: string; contractValue?: number; category?: string; status?: string; gstPercent?: number; }
export interface BillRow { _id: string; amount?: number; status?: string; billDate?: string; workOrderId?: string; billNo?: string; vendorName?: string; }

export function calcKPIs(workOrders: WORow[], bills: BillRow[]) {
  const totalContractValue = workOrders.reduce((s, wo) => s + (wo.contractValue ?? 0), 0);
  const totalContractValueWithGST = workOrders.reduce((s, wo) => {
    const base = wo.contractValue ?? 0;
    const gst  = wo.gstPercent  ?? 18;
    return s + Math.round(base * (1 + gst / 100));
  }, 0);
  const certifiedAmt         = bills.filter(b => b.status === "approved" || b.status === "paid").reduce((s, b) => s + (b.amount ?? 0), 0);
  const pendingAmt           = bills.filter(b => b.status === "submitted" || b.status === "verified").reduce((s, b) => s + (b.amount ?? 0), 0);
  const paidAmt              = bills.filter(b => b.status === "paid").reduce((s, b) => s + (b.amount ?? 0), 0);
  const approvedNotPaid      = bills.filter(b => b.status === "approved").reduce((s, b) => s + (b.amount ?? 0), 0);
  const approvedNotPaidCount = bills.filter(b => b.status === "approved").length;
  const pendingCount         = bills.filter(b => b.status === "submitted" || b.status === "verified").length;
  const remaining            = Math.max(0, totalContractValueWithGST - certifiedAmt - pendingAmt);
  return { totalContractValue, totalContractValueWithGST, certifiedAmt, pendingAmt, paidAmt, approvedNotPaid, approvedNotPaidCount, pendingCount, remaining };
}

export function billsByWOMap(bills: BillRow[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const b of bills) {
    if (!b.workOrderId) continue;
    map[b.workOrderId] = (map[b.workOrderId] ?? 0) + (b.amount ?? 0);
  }
  return map;
}

export function getRecentBills(bills: BillRow[], n = 8): BillRow[] {
  return [...bills]
    .sort((a, b) => new Date(b.billDate ?? 0).getTime() - new Date(a.billDate ?? 0).getTime())
    .slice(0, n);
}

export function getMonthlyBillingTrend(bills: BillRow[]): { month: string; submitted: number; approved: number; paid: number }[] {
  const months: Record<string, { month: string; submitted: number; approved: number; paid: number }> = {};
  for (const b of bills) {
    if (!b.billDate) continue;
    const d = new Date(b.billDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
    if (!months[key]) months[key] = { month: label, submitted: 0, approved: 0, paid: 0 };
    const amt = b.amount ?? 0;
    if (b.status === "submitted" || b.status === "verified") months[key].submitted += amt;
    if (b.status === "approved") months[key].approved += amt;
    if (b.status === "paid")     months[key].paid     += amt;
  }
  return Object.keys(months).sort().slice(-6).map(k => months[k]);
}

export const fmtCr = (n: number) =>
  n >= 10_000_000 ? `₹${(n / 10_000_000).toFixed(2)} Cr`
  : n >= 1_00_000 ? `₹${(n / 1_00_000).toFixed(2)} L`
  : "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

export const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
