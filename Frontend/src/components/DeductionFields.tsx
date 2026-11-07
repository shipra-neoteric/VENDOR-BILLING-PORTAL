const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export interface DeductionValue { amount: string; remark: string }

// "Deduct from gross total (optional)" — the approver may cut the bill's gross total by an amount, with an optional remark; GST and the net
// payable are worked out on what is left. Any approval level (L1 … L4) can use it and the cuts add up: `already` is what earlier levels cut,
// `gross` is the gross total as it stands now (after those cuts).
export default function DeductionFields({
  value, onChange, gross, already = 0,
}: { value: DeductionValue; onChange: (v: DeductionValue) => void; gross: number; already?: number }) {
  const cut = Number(value.amount);
  const hasCut = Number.isFinite(cut) && cut > 0;
  const tooBig = hasCut && cut >= gross;
  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 mt-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-2">Deduct from gross total (optional)</div>
      {already > 0 && (
        <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">Already deducted at earlier levels: <b>{fmt(already)}</b> — what you cut here is added to it.</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2">
        <input
          type="number" min="0" step="any" inputMode="decimal" placeholder="Amount to deduct (₹)" value={value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
          className="h-9 px-2.5 text-[13px] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 font-mono"
        />
        <input
          type="text" maxLength={500} placeholder="Remark — why this amount is being deducted (optional)" value={value.remark}
          onChange={(e) => onChange({ ...value, remark: e.target.value })}
          className="h-9 px-2.5 text-[13px] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        />
      </div>
      {hasCut && (
        <div className={`mt-2 text-xs ${tooBig ? "text-red-600" : "text-gray-600 dark:text-gray-300"}`}>
          {tooBig
            ? "The deduction must be less than the gross total."
            : `Gross total ${fmt(gross)} → ${fmt(gross - cut)} (GST and net payable are worked out on this).`}
        </div>
      )}
    </div>
  );
}
