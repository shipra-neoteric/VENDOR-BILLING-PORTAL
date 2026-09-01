import { useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import Btn from "../ui/Btn";
import Field from "../ui/Field";
import SField from "../ui/SField";
import Segmented from "../ui/Segmented";
import MultiSelect from "../ui/MultiSelect";
import { DatePicker } from "../ui/DatePicker";
import GstSelect from "./GstSelect";

export interface MilestoneDraft {
  id: string;
  stage: string;
  date: string;
  type: string;
  mode: string;
  // `amount` is always the resolved rupee figure actually used everywhere
  // downstream (payable calc, PDF, save payload) — amountMode/amountPercent
  // just remember *how* it was entered, so re-opening the form still shows
  // "10%" instead of silently converting it to a flat rupee value.
  amount: number | null;
  amountMode: "fixed" | "percent";
  amountPercent: number | null;
  gstPercent: number;
  // Which of this Work Order's own scope items this milestone's payment
  // actually covers — lets New Bill auto-import exactly those items
  // (scope-item-linked, so they get genuinely marked billed) when this
  // milestone is picked there, instead of just a freeform lump-sum row.
  scopeItemIds: string[];
}

interface ScopeItemLike { id: string; description: string; }

const MODE_OPTIONS = [
  { label: "Bank Transfer", value: "Bank Transfer" },
  { label: "NEFT",          value: "NEFT" },
  { label: "RTGS",          value: "RTGS" },
  { label: "UPI",           value: "UPI" },
  { label: "Cheque",        value: "Cheque" },
  { label: "Cash",          value: "Cash" },
];

export function newMilestone(): MilestoneDraft {
  return {
    id: crypto.randomUUID(),
    stage: "", date: "", type: "", mode: "Bank Transfer",
    amount: null, amountMode: "fixed", amountPercent: null,
    gstPercent: 18, scopeItemIds: [],
  };
}

export function calcPayable(m: MilestoneDraft): number {
  // `amount` is always the pre-GST base figure regardless of mode — a
  // percent-mode amount is resolved as % of the pre-GST contract value (see
  // the sync effect below), same as a manually-typed fixed amount — so GST
  // is added the same way in both cases to get the payable figure.
  const amt = m.amount || 0;
  return Math.round(amt * (1 + (m.gstPercent || 0) / 100));
}

export function calcGrandTotal(items: MilestoneDraft[]): number {
  return items.reduce((s, m) => s + calcPayable(m), 0);
}

const fmt = (n: number) => "₹" + (n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PaymentMilestonesBuilder({
  items, onChange, contractValue, contractValueInclGst,
  discount = null, onDiscountChange, scopeItems = [],
}: {
  items: MilestoneDraft[];
  onChange: (items: MilestoneDraft[]) => void;
  // Pre-GST base contract value — what a percent-mode milestone's % is taken
  // of (GST is then added on top separately, same as fixed-mode milestones).
  contractValue?: number;
  // GST-inclusive contract value — only used as the ceiling the grand total
  // of all (GST-inclusive) milestone payables is checked against.
  contractValueInclGst?: number;
  // Flat rupee discount off the overall contract value — only meaningful (and
  // shown) once payment milestones exist, not a per-milestone figure.
  discount?: number | null;
  onDiscountChange?: (v: number | null) => void;
  // This Work Order's own scope items — lets each milestone say which of them
  // its payment covers (purely a reference tag here, doesn't affect this
  // builder's own amount/GST math; New Bill reads it back when the milestone
  // is picked there).
  scopeItems?: ScopeItemLike[];
}) {
  const upd = (id: string, patch: Partial<MilestoneDraft>) =>
    onChange(items.map(m => m.id === id ? { ...m, ...patch } : m));

  const scopeItemOptions = scopeItems
    .filter(si => si.description.trim())
    .map(si => ({ label: si.description, value: si.id }));

  // Keep percent-based milestones' resolved rupee amount in sync if the
  // contract value changes later (e.g. scope items edited after a % was set).
  useEffect(() => {
    if (!contractValue) return;
    const stale = items.some(m => {
      if (m.amountMode !== "percent" || m.amountPercent == null) return false;
      return m.amount !== Math.round((m.amountPercent / 100) * contractValue);
    });
    if (!stale) return;
    onChange(items.map(m => (m.amountMode === "percent" && m.amountPercent != null)
      ? { ...m, amount: Math.round((m.amountPercent / 100) * contractValue) }
      : m));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractValue]);

  const grandTotal = calcGrandTotal(items);
  // ₹1 tolerance (matches the backend's own check in validateMilestones.js) —
  // each milestone rounds its payable independently, so a 100%-split total can
  // land a few paise above an unrounded contract value without truly exceeding it.
  const exceeds = contractValueInclGst !== undefined && contractValueInclGst > 0 && grandTotal > contractValueInclGst + 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">Payment Milestones</div>
        <Btn small outline icon={Plus} label="Add Milestone" onClick={() => onChange([...items, newMilestone()])} />
      </div>

      {items.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700/40 rounded-lg py-6 px-5 text-center text-gray-400 dark:text-gray-500 mb-3">
          <div className="text-xs">No payment milestones yet — e.g. "At the time of Order", "On Dispatch", "On Delivery".</div>
        </div>
      )}

      {items.map((m, idx) => (
        <div key={m.id} className="border border-gray-200 dark:border-gray-700/40 rounded-lg mb-2.5 p-3.5">
          <div className="grid grid-cols-2 sm:grid-cols-[2fr_140px_130px_160px_90px_28px] gap-2.5 items-end">
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Stage / Type</div>
              <Field
                placeholder='e.g. "At the time of Order"'
                value={m.type}
                onChange={e => upd(m.id, { type: e.target.value, stage: m.stage || `Milestone ${idx + 1}` })}
              />
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Date</div>
              <DatePicker value={m.date} onChange={v => upd(m.id, { date: v })} />
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">Mode</div>
              <SField placeholder="Mode" value={m.mode} onChange={v => upd(m.id, { mode: v })} options={MODE_OPTIONS} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-gray-400">Amount</span>
                <Segmented
                  value={m.amountMode}
                  onChange={v => upd(m.id, { amountMode: v as "fixed" | "percent" })}
                  options={[{ label: "₹", value: "fixed" }, { label: "%", value: "percent" }]}
                />
              </div>
              {m.amountMode === "percent" ? (
                <>
                  <Field
                    type="number" min="0" max="100" step="0.1"
                    placeholder="% of contract"
                    value={m.amountPercent ?? ""}
                    onChange={e => {
                      const pct = e.target.value === "" ? 0 : Number(e.target.value);
                      const resolved = contractValue ? Math.round((pct / 100) * contractValue) : 0;
                      upd(m.id, { amountPercent: pct, amount: resolved });
                    }}
                  />
                  <div className="text-[10.5px] text-gray-400 mt-0.5">
                    {contractValue ? `= ${fmt(m.amount || 0)} + GST` : "Add scope of work items first"}
                  </div>
                </>
              ) : (
                <Field
                  type="number" min="0"
                  placeholder="Amount"
                  value={m.amount ?? ""}
                  onChange={e => upd(m.id, { amount: e.target.value === "" ? null : Number(e.target.value) })}
                />
              )}
            </div>
            <div>
              <div className="text-[11px] text-gray-400 mb-1">GST</div>
              <GstSelect value={m.gstPercent} onChange={v => upd(m.id, { gstPercent: v })} />
            </div>
            <button type="button" onClick={() => onChange(items.filter(x => x.id !== m.id))} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded p-1.5 justify-self-end">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {scopeItemOptions.length > 0 && (
            <div className="mt-2.5">
              <div className="text-[11px] text-gray-400 mb-1">Covers Work Item(s) (optional)</div>
              <MultiSelect
                placeholder="Select the work item(s) this milestone's payment covers"
                values={m.scopeItemIds}
                options={scopeItemOptions}
                onChange={v => upd(m.id, { scopeItemIds: v })}
              />
              <div className="text-[10.5px] text-gray-400 mt-1">
                Reference only — used later to auto-fill the matching Work Items when this milestone is billed.
              </div>
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Payable: <strong className="font-mono text-primary">{fmt(calcPayable(m))}</strong>
            </div>
          </div>
        </div>
      ))}

      {items.length > 0 && (
        <div className={exceeds
          ? "bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/40 rounded-lg py-2.5 px-4"
          : "bg-primary/5 border border-primary/20 rounded-lg py-2.5 px-4"}>
          <div className="flex justify-between items-center">
            <span className="font-semibold text-gray-600 dark:text-gray-300">{(discount || 0) > 0 ? "Subtotal" : "Grand Total Payable"}</span>
            <span className={`font-mono font-bold text-[15px] ${exceeds ? "text-red-600 dark:text-red-400" : "text-primary"}`}>{fmt(grandTotal)}</span>
          </div>
          {exceeds && (
            <div className="text-xs text-red-600 dark:text-red-400 mt-1.5 font-semibold">
              ⚠ Exceeds the scope of work's contract value (incl. GST) of {fmt(contractValueInclGst!)} by {fmt(grandTotal - contractValueInclGst!)}
            </div>
          )}
          <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-dashed border-primary/20">
            <span className="text-xs text-gray-500 dark:text-gray-400">Overall Discount on Contract Value (₹)</span>
            <input
              type="number" min="0" placeholder="0"
              value={discount ?? ""}
              onChange={e => onDiscountChange?.(e.target.value === "" ? null : Number(e.target.value))}
              className="w-[150px] h-8 px-2.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          {(discount || 0) > 0 && (
            <div className="flex justify-between items-center mt-2.5 pt-2.5 border-t border-primary/20">
              <span className="font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">Final Payable (after discount)</span>
              <span className="font-mono font-bold text-base text-green-600 dark:text-green-400">
                {fmt(Math.max(0, grandTotal - (discount || 0)))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
