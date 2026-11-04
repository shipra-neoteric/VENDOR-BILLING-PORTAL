// Mirror of Backend/src/utils/duplicateBills.js — drops the duplicate copies made by the legacy reconciliation script
// (remark "Legacy reconciliation - …") when a bill with the same work order, amount and items also exists outside it.
// Nothing is changed in the data; these copies are just not counted. Copies that stand alone are kept.
interface DupBill {
  _id: string; workOrderId?: string; amount?: number; status?: string; remarks?: string;
  lineItems?: { description?: string; billedQty?: number }[];
}

const LEGACY_NOTE = /^Legacy reconciliation/i;

const sigOf = (b: DupBill) => `${b.workOrderId}|${Math.round(b.amount || 0)}|` +
  (b.lineItems || []).map((l) => `${String(l.description || "").trim().toLowerCase()}:${Math.round((Number(l.billedQty) || 0) * 1000)}`).sort().join(",");

export function excludeDuplicateBills<T extends DupBill>(bills: T[]): T[] {
  const copies = bills.filter((b) => LEGACY_NOTE.test(b.remarks || ""));
  if (!copies.length) return bills;
  const have = new Set(bills.filter((b) => !LEGACY_NOTE.test(b.remarks || "") && b.status !== "rejected").map(sigOf));
  const dupIds = new Set(copies.filter((c) => have.has(sigOf(c))).map((c) => c._id));
  return dupIds.size ? bills.filter((b) => !dupIds.has(b._id)) : bills;
}
