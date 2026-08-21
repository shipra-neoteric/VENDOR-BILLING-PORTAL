import { Plus, Trash2 } from "lucide-react";
import Btn from "../ui/Btn";
import Field from "../ui/Field";
import Segmented from "../ui/Segmented";
import MultiSelect from "../ui/MultiSelect";

// A security deposit deliberately baked into a group of scope items' own
// rates — e.g. the true agreed rate is ₹290/sqft, but each particular is
// written up at a lower rate (summing to ₹275.5/sqft), holding back the
// ₹14.5/sqft gap as security until the work is verified. This builder exists
// so that gap can be verified arithmetically (selected items' own value +
// this deposit = the true full value you actually agreed) rather than
// trusting manual subtraction across several particulars to not have a
// mistake in it. Reference/tracking only — never drives contractValue.
export interface SecurityDepositDraft {
  id: string;
  scopeItemIds: string[];
  mode: "perUnit" | "percent";
  rate: number | null;
  notes: string;
}

export function newSecurityDeposit(): SecurityDepositDraft {
  return { id: crypto.randomUUID(), scopeItemIds: [], mode: "perUnit", rate: null, notes: "" };
}

interface ScopeItemLike { id: string; description: string; plannedQty: number | null; amount?: number }

// Sum of the selected items' own plannedQty (for perUnit mode) — assumes the
// same per-unit rate applies uniformly across every selected item, matching
// how a single deposit row is meant to cover one group (e.g. one floor).
export function calcDepositAmount(d: SecurityDepositDraft, scopeItems: ScopeItemLike[]): number {
  const selected = scopeItems.filter(si => d.scopeItemIds.includes(si.id));
  const rate = d.rate || 0;
  if (d.mode === "percent") {
    const base = selected.reduce((s, si) => s + (si.amount || 0), 0);
    return Math.round(base * rate) / 100;
  }
  const qty = selected.reduce((s, si) => s + (si.plannedQty || 0), 0);
  return Math.round(qty * rate * 100) / 100;
}

const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SecurityDepositBuilder({
  items, onChange, scopeItems,
}: {
  items: SecurityDepositDraft[];
  onChange: (items: SecurityDepositDraft[]) => void;
  scopeItems: ScopeItemLike[];
}) {
  const upd = (id: string, patch: Partial<SecurityDepositDraft>) =>
    onChange(items.map(d => d.id === id ? { ...d, ...patch } : d));

  const itemOptions = scopeItems
    .filter(si => si.description.trim())
    .map(si => ({ label: si.description, value: si.id }));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">Security Deposit</div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            Reference only — doesn't change the contract value. Use it to verify that a deliberately-reduced rate on the items above, plus this deposit, adds back up to the rate you actually agreed.
          </div>
        </div>
        <Btn small outline icon={Plus} label="Add Deposit" onClick={() => onChange([...items, newSecurityDeposit()])} />
      </div>

      {items.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700/40 rounded-lg py-5 px-5 text-center text-gray-400 dark:text-gray-500">
          <div className="text-xs">No security deposits tracked — only needed if some work items' rates were deliberately reduced, holding back the gap as security.</div>
        </div>
      )}

      {items.map((d) => {
        const selected = scopeItems.filter(si => d.scopeItemIds.includes(si.id));
        const selectedValue = selected.reduce((s, si) => s + (si.amount || 0), 0);
        const depositAmount = calcDepositAmount(d, scopeItems);
        return (
          <div key={d.id} className="border border-gray-200 dark:border-gray-700/40 rounded-lg mb-2.5 p-3.5">
            <div className="grid grid-cols-2 sm:grid-cols-[2fr_1fr_1fr] gap-2.5 items-end">
              <div>
                <div className="text-[11px] text-gray-400 mb-1">Held Against Work Item(s)</div>
                <MultiSelect
                  placeholder="Select the work item(s) this deposit is held against"
                  values={d.scopeItemIds}
                  options={itemOptions}
                  onChange={v => upd(d.id, { scopeItemIds: v })}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-gray-400">Held As</span>
                  <Segmented
                    value={d.mode}
                    onChange={v => upd(d.id, { mode: v as "perUnit" | "percent" })}
                    options={[{ label: "Per Unit", value: "perUnit" }, { label: "%", value: "percent" }]}
                  />
                </div>
                <Field
                  type="number" min="0" step={d.mode === "percent" ? "1" : "0.1"}
                  placeholder={d.mode === "percent" ? "% of selected items' value" : "e.g. 14.5 per unit"}
                  value={d.rate ?? ""}
                  onChange={e => upd(d.id, { rate: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
              <div>
                <div className="text-[11px] text-gray-400 mb-1">Deposit Amount</div>
                <div className="font-mono font-bold text-primary text-sm pt-1.5">
                  {fmt(depositAmount)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1">
                <Field
                  placeholder="Notes (optional) — e.g. why this rate was reduced"
                  value={d.notes}
                  onChange={e => upd(d.id, { notes: e.target.value })}
                />
              </div>
              <button type="button" onClick={() => onChange(items.filter(x => x.id !== d.id))} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded p-1.5 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {selected.length > 0 && (
              <div className="mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-gray-700/40 text-xs text-gray-500 dark:text-gray-400">
                Selected items' value <strong className="font-mono text-[#1A1A2E] dark:text-[#F1F5F9]">{fmt(selectedValue)}</strong>
                {" + "}Deposit <strong className="font-mono text-primary">{fmt(depositAmount)}</strong>
                {" = "}
                <strong className="font-mono text-green-600 dark:text-green-400">{fmt(selectedValue + depositAmount)}</strong>
                <span className="text-gray-400"> true full value — check this matches what you actually agreed</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
