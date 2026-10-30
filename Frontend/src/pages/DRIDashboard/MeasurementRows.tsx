import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";

// Measurement working for a progress entry: rows of length × width × height × nos,
// deduct rows (door/window cut-outs) subtract. The server recomputes the same total
// (Backend/src/utils/progressHelpers.js resolveEntryQty) and is the source of truth.

export type DimMode = "none" | "length" | "area" | "volume";
type DimKey = "length" | "width" | "height" | "nos";

export interface DimRowForm { label: string; length: string; width: string; height: string; nos: string; deduct: boolean; }
export interface SavedDimRow { label?: string; length?: number; width?: number; height?: number; nos?: number; deduct?: boolean; }

const MODE_KEYS: Record<DimMode, DimKey[]> = {
  none: [],
  length: ["length", "nos"],
  area: ["length", "width", "nos"],
  volume: ["length", "width", "height", "nos"],
};
const KEY_LABEL: Record<DimKey, string> = { length: "Length", width: "Width", height: "Height", nos: "Nos" };

const normUnit = (unit?: string) => (unit || "").toLowerCase().replace(/[\s.\-_]/g, "");

// Which dimensions make sense for a scope item's unit. Anything unrecognised
// (per piece, per-hr, kg, …) stays a plain direct quantity.
export function dimModeForUnit(unit?: string): DimMode {
  const u = normUnit(unit);
  if (/^(sq|sft)/.test(u)) return "area";
  if (/^(cu|cft)/.test(u)) return "volume";
  if (/^(rft|rmt|rm$|running|rfeet)/.test(u)) return "length";
  return "none";
}

const dimUnitLabel = (unit?: string) => {
  const u = normUnit(unit);
  return u.includes("ft") || u.includes("feet") ? "ft" : u.includes("m") ? "m" : "ft";
};

export const blankDimRow = (): DimRowForm => ({ label: "", length: "", width: "", height: "", nos: "", deduct: false });

const num = (s: string) => (s.trim() === "" ? null : Number(s));

// Product of the filled fields; null when nothing is filled or a value is invalid.
function rowValue(r: DimRowForm, mode: DimMode): number | null {
  let product = 1;
  let factors = 0;
  for (const k of MODE_KEYS[mode]) {
    const v = num(r[k]);
    if (v === null) continue;
    if (!Number.isFinite(v) || v <= 0) return null;
    product *= v;
    factors++;
  }
  return factors === 0 ? null : product;
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function dimTotal(rows: DimRowForm[], mode: DimMode): number {
  return round5(rows.reduce((s, r) => {
    const v = rowValue(r, mode);
    return v === null ? s : s + (r.deduct ? -v : v);
  }, 0));
}

// True when every row that has anything typed in it is valid and at least one row counts.
export function dimRowsValid(rows: DimRowForm[], mode: DimMode): boolean {
  const touched = rows.filter((r) => MODE_KEYS[mode].some((k) => r[k].trim() !== ""));
  return touched.length > 0 && touched.every((r) => rowValue(r, mode) !== null) && dimTotal(rows, mode) > 0;
}

export function dimPayload(rows: DimRowForm[], mode: DimMode): SavedDimRow[] {
  return rows
    .filter((r) => rowValue(r, mode) !== null)
    .map((r) => {
      const out: SavedDimRow = { label: r.label.trim(), deduct: r.deduct };
      for (const k of MODE_KEYS[mode]) {
        const v = num(r[k]);
        if (v !== null) out[k] = v;
      }
      return out;
    });
}

export function dimRowsFromSaved(saved?: SavedDimRow[]): DimRowForm[] {
  if (!saved || saved.length === 0) return [];
  return saved.map((r) => ({
    label: r.label || "",
    length: r.length != null ? String(r.length) : "", width: r.width != null ? String(r.width) : "",
    height: r.height != null ? String(r.height) : "", nos: r.nos != null ? String(r.nos) : "",
    deduct: !!r.deduct,
  }));
}

// "10×12×2 − 3×7" — the working behind a saved entry, for the history lists.
export function dimSummary(saved?: SavedDimRow[]): string {
  if (!saved || saved.length === 0) return "";
  return saved.map((r, i) => {
    const part = (["length", "width", "height", "nos"] as const).filter((k) => r[k] != null).map((k) => r[k]).join("×");
    return `${i === 0 ? (r.deduct ? "− " : "") : r.deduct ? " − " : " + "}${part}`;
  }).join("");
}

// One saved row spelled out with its result: "Wall A: 10×12×2 = 240" (deduct rows negative).
export function savedRowText(r: SavedDimRow): string {
  const vals = (["length", "width", "height", "nos"] as const).filter((k) => r[k] != null).map((k) => r[k] as number);
  const product = round5(vals.reduce((s, v) => s * v, 1));
  return `${r.label ? `${r.label}: ` : ""}${vals.join("×")} = ${r.deduct ? "−" : ""}${product.toLocaleString("en-IN")}`;
}

const inputCls =
  "w-full h-8 px-2 text-xs font-mono rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary";

export default function MeasurementInput({
  unit, useDims, onToggle, rows, onRows, error, children,
}: {
  unit: string;
  useDims: boolean;
  onToggle: (useDims: boolean) => void;
  rows: DimRowForm[];
  onRows: (rows: DimRowForm[]) => void;
  error?: string;
  // The plain "Quantity Added" field, shown in direct-quantity mode.
  children: ReactNode;
}) {
  const mode = dimModeForUnit(unit);
  if (mode === "none") return <>{children}</>;

  const keys = MODE_KEYS[mode];
  const total = dimTotal(rows, mode);
  const setRow = (i: number, patch: Partial<DimRowForm>) => onRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div>
      <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 mb-2.5 text-[11px] font-semibold">
        {([[true, "Measure (L × W × H)"], [false, "Direct quantity"]] as const).map(([v, label]) => (
          <button
            key={label} type="button" onClick={() => onToggle(v)}
            className={`px-3 py-1 rounded-md ${useDims === v ? "bg-primary text-white" : "text-gray-500 dark:text-gray-400"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {!useDims ? children : (
        <div className="bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/40 rounded-lg p-3">
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">
            Dimensions in {dimUnitLabel(unit)}. Fill only what applies; tick "Deduct" for door/window cut-outs.
          </div>
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const v = rowValue(r, mode);
              return (
                <div key={i} className="grid gap-1.5 items-end" style={{ gridTemplateColumns: `minmax(0,1.3fr) repeat(${keys.length}, minmax(0,1fr)) 64px 72px 20px` }}>
                  <div>
                    {i === 0 && <div className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Label</div>}
                    <input className={inputCls} style={{ fontFamily: "inherit" }} placeholder="e.g. Wall A" value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} />
                  </div>
                  {keys.map((k) => (
                    <div key={k}>
                      {i === 0 && <div className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">{KEY_LABEL[k]}</div>}
                      <input className={inputCls} type="number" min="0" step="any" value={r[k]} onChange={(e) => setRow(i, { [k]: e.target.value } as Partial<DimRowForm>)} />
                    </div>
                  ))}
                  <label className="flex items-center gap-1 text-[11px] text-gray-500 h-8 cursor-pointer select-none">
                    <input type="checkbox" checked={r.deduct} onChange={(e) => setRow(i, { deduct: e.target.checked })} /> Deduct
                  </label>
                  <div className={`h-8 flex items-center justify-end text-xs font-mono font-semibold ${r.deduct ? "text-red-500" : "text-gray-700 dark:text-gray-200"}`}>
                    {v === null ? "—" : `${r.deduct ? "−" : ""}${round5(v).toLocaleString("en-IN")}`}
                  </div>
                  <button
                    type="button" aria-label="Remove row" disabled={rows.length === 1}
                    className="h-8 text-gray-400 hover:text-red-500 disabled:opacity-30"
                    onClick={() => onRows(rows.filter((_, j) => j !== i))}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-2.5">
            <button type="button" className="text-[11px] font-semibold text-primary inline-flex items-center gap-1" onClick={() => onRows([...rows, blankDimRow()])}>
              <Plus className="w-3 h-3" /> Add row
            </button>
            <div className="text-xs">
              <span className="text-gray-400 mr-1.5">Total</span>
              <span className="font-mono font-bold text-emerald-600">{total.toLocaleString("en-IN")} {unit}</span>
            </div>
          </div>
          {error && <span className="block text-xs text-red-500 mt-1">{error}</span>}
        </div>
      )}
    </div>
  );
}
