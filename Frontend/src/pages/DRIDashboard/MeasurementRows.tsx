import { Fragment } from "react";
import { Plus, Trash2 } from "lucide-react";
import Btn from "../../ui/Btn";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";

// Quantity for a progress entry, entered as a table of rows — each with its own
// location (tower / floor / flat, or plot) and a note. A row is either a direct
// quantity, or length × width × height × nos (deduct rows — door/window cut-outs —
// subtract). The server recomputes the same total
// (Backend/src/utils/progressHelpers.js resolveEntryQty) and is the source of truth.

export type DimMode = "none" | "length" | "area" | "volume";
type DimKey = "length" | "width" | "height" | "nos";
type LocKey = "tower" | "floor" | "flatNo" | "plotNo";

export interface DimRowForm {
  label: string; tower: string; floor: string; flatNo: string; plotNo: string; note: string;
  qty: string; length: string; width: string; height: string; nos: string; deduct: boolean;
}
export interface SavedDimRow {
  label?: string; tower?: string; floor?: string; flatNo?: string; plotNo?: string; note?: string;
  qty?: number; length?: number; width?: number; height?: number; nos?: number; deduct?: boolean;
}

const MODE_KEYS: Record<DimMode, DimKey[]> = {
  none: [],
  length: ["length", "nos"],
  area: ["length", "width", "nos"],
  volume: ["length", "width", "height", "nos"],
};
const KEY_LABEL: Record<DimKey, string> = { length: "Length", width: "Width", height: "Height", nos: "Nos" };
const LOC_KEYS: LocKey[] = ["tower", "floor", "flatNo", "plotNo"];

const normUnit = (unit?: string) => (unit || "").toLowerCase().replace(/[\s.\-_]/g, "");

// Which dimensions make sense for a scope item's unit. Anything unrecognised
// (per piece, per-hr, kg, …) has no L × W × H — direct quantity only.
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

export const blankDimRow = (): DimRowForm => ({
  label: "", tower: "", floor: "", flatNo: "", plotNo: "", note: "",
  qty: "", length: "", width: "", height: "", nos: "", deduct: false,
});

const num = (s: string) => (s.trim() === "" ? null : Number(s));

// A row's quantity: the typed number (direct) or the product of the filled L/W/H/Nos
// fields. null when nothing is filled or a value is invalid.
function rowValue(r: DimRowForm, mode: DimMode, direct: boolean): number | null {
  if (direct) {
    const q = num(r.qty);
    return q === null || !Number.isFinite(q) || q <= 0 ? null : q;
  }
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

export function dimTotal(rows: DimRowForm[], mode: DimMode, direct: boolean): number {
  return round5(rows.reduce((s, r) => {
    const v = rowValue(r, mode, direct);
    return v === null ? s : s + (r.deduct && !direct ? -v : v);
  }, 0));
}

const touched = (r: DimRowForm, mode: DimMode, direct: boolean) =>
  direct ? r.qty.trim() !== "" : MODE_KEYS[mode].some((k) => r[k].trim() !== "");

// True when every row that has anything typed in it is valid and at least one row counts.
export function dimRowsValid(rows: DimRowForm[], mode: DimMode, direct: boolean): boolean {
  const used = rows.filter((r) => touched(r, mode, direct));
  return used.length > 0 && used.every((r) => rowValue(r, mode, direct) !== null) && dimTotal(rows, mode, direct) > 0;
}

export function dimPayload(rows: DimRowForm[], mode: DimMode, direct: boolean): SavedDimRow[] {
  return rows
    .filter((r) => rowValue(r, mode, direct) !== null)
    .map((r) => {
      const out: SavedDimRow = {
        label: r.label.trim(), note: r.note.trim(),
        tower: r.tower.trim(), floor: r.floor.trim(), flatNo: r.flatNo.trim(), plotNo: r.plotNo.trim(),
      };
      if (direct) {
        out.qty = Number(r.qty);
      } else {
        out.deduct = r.deduct;
        for (const k of MODE_KEYS[mode]) {
          const v = num(r[k]);
          if (v !== null) out[k] = v;
        }
      }
      return out;
    });
}

// The entry's own tower/floor/flat/plot, derived from its rows (unique values, comma-
// joined) — so history, bill lines and everything else that reads the entry-level
// location keep working for an entry whose rows each carry their own.
export function dimLocation(rows: DimRowForm[], mode: DimMode, direct: boolean): Record<LocKey, string> {
  const used = rows.filter((r) => rowValue(r, mode, direct) !== null);
  const out = { tower: "", floor: "", flatNo: "", plotNo: "" } as Record<LocKey, string>;
  for (const k of LOC_KEYS) out[k] = Array.from(new Set(used.map((r) => r[k].trim()).filter(Boolean))).join(", ");
  return out;
}

export function dimRowsFromSaved(saved?: SavedDimRow[]): DimRowForm[] {
  if (!saved || saved.length === 0) return [];
  return saved.map((r) => ({
    label: r.label || "", note: r.note || "",
    tower: r.tower || "", floor: r.floor || "", flatNo: r.flatNo || "", plotNo: r.plotNo || "",
    qty: r.qty != null ? String(r.qty) : "",
    length: r.length != null ? String(r.length) : "", width: r.width != null ? String(r.width) : "",
    height: r.height != null ? String(r.height) : "", nos: r.nos != null ? String(r.nos) : "",
    deduct: !!r.deduct,
  }));
}

// True when any saved row was measured (L/W/H/Nos) rather than typed as a quantity.
export const savedRowsHaveDims = (saved?: SavedDimRow[]) =>
  !!saved && saved.some((r) => (["length", "width", "height", "nos"] as const).some((k) => r[k] != null));

// "10×12×2 − 3×7" — the working behind a saved entry, for the history lists.
export function dimSummary(saved?: SavedDimRow[]): string {
  if (!saved || saved.length === 0) return "";
  return saved.map((r, i) => {
    const part = r.qty != null ? String(r.qty) : (["length", "width", "height", "nos"] as const).filter((k) => r[k] != null).map((k) => r[k]).join("×");
    return `${i === 0 ? (r.deduct ? "− " : "") : r.deduct ? " − " : " + "}${part}`;
  }).join("");
}

// "T-A F-2 #201" / "Plot 42" for one saved row, or "".
export function savedRowLocation(r: SavedDimRow): string {
  const parts = [r.tower && `T-${r.tower}`, r.floor && `F-${r.floor}`, r.flatNo && `#${r.flatNo}`, r.plotNo && `Plot ${r.plotNo}`].filter(Boolean);
  return parts.join(" ");
}

// One saved row spelled out with its result: "T-A F-2 #201 · Wall A: 10×12×2 = 240" (deduct rows negative).
export function savedRowText(r: SavedDimRow): string {
  const where = [savedRowLocation(r), r.label].filter(Boolean).join(" · ");
  const prefix = where ? `${where}: ` : "";
  if (r.qty != null) return `${prefix}${r.qty.toLocaleString("en-IN")}`;
  const vals = (["length", "width", "height", "nos"] as const).filter((k) => r[k] != null).map((k) => r[k] as number);
  const product = round5(vals.reduce((s, v) => s * v, 1));
  return `${prefix}${vals.join("×")} = ${r.deduct ? "−" : ""}${product.toLocaleString("en-IN")}`;
}

const inputCls =
  "w-full h-9 px-2.5 text-[13px] font-mono rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-primary";

export default function MeasurementInput({
  unit, useDims, onToggle, rows, onRows, projectType, error,
}: {
  unit: string;
  useDims: boolean;
  onToggle: (useDims: boolean) => void;
  rows: DimRowForm[];
  onRows: (rows: DimRowForm[]) => void;
  projectType: "apartment" | "plot";
  error?: string;
}) {
  const mode = dimModeForUnit(unit);
  const direct = mode === "none" || !useDims;
  const keys = direct ? [] : MODE_KEYS[mode];
  const total = dimTotal(rows, mode, direct);
  const setRow = (i: number, patch: Partial<DimRowForm>) => onRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const locHeads = projectType === "plot" ? ["Plot no"] : ["Tower", "Floor", "Flat"];
  const totalCols = 3 + locHeads.length + (direct ? 0 : keys.length + 1);

  return (
    <div>
      {mode !== "none" && (
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
      )}

      <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
        {direct
          ? `One row per location — enter the quantity in ${unit || "the item's unit"}.`
          : `Dimensions in ${dimUnitLabel(unit)}. Fill only what applies; tick "Deduct" for door/window cut-outs.`}
      </div>
      <Table className={direct ? "min-w-[640px]" : "min-w-[1000px]"}>
        <Thead>
          <Tr>
            <Th dense className="w-[4%]">#</Th>
            <Th dense className={direct ? "w-[30%]" : "w-[20%]"}>Scope of work</Th>
            {locHeads.map((h) => <Th key={h} dense>{h}</Th>)}
            {direct ? (
              <Th dense className="text-right w-[16%]">Quantity{unit ? ` (${unit})` : ""}</Th>
            ) : (
              <>
                {keys.map((k) => <Th key={k} dense className="text-right">{KEY_LABEL[k]}</Th>)}
                <Th dense className="w-[9%]">Deduct</Th>
                <Th dense className="text-right w-[9%]">Result</Th>
              </>
            )}
            <Th dense className="w-[5%]" />
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((r, i) => {
            const v = rowValue(r, mode, direct);
            const tint = r.deduct && !direct ? "bg-red-50/50 dark:bg-red-500/5" : "";
            return (
              <Fragment key={i}>
                <Tr className={tint}>
                  <Td dense className="text-gray-400 text-xs">{i + 1}</Td>
                  <Td dense>
                    <input className={inputCls} style={{ fontFamily: "inherit" }} placeholder="e.g. Plastering" value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} />
                  </Td>
                  {projectType === "plot" ? (
                    <Td dense><input className={inputCls} style={{ fontFamily: "inherit" }} placeholder="Plot no" value={r.plotNo} onChange={(e) => setRow(i, { plotNo: e.target.value })} /></Td>
                  ) : (
                    <>
                      <Td dense><input className={inputCls} style={{ fontFamily: "inherit" }} placeholder="Tower" value={r.tower} onChange={(e) => setRow(i, { tower: e.target.value })} /></Td>
                      <Td dense><input className={inputCls} style={{ fontFamily: "inherit" }} placeholder="Floor" value={r.floor} onChange={(e) => setRow(i, { floor: e.target.value })} /></Td>
                      <Td dense><input className={inputCls} style={{ fontFamily: "inherit" }} placeholder="Flat" value={r.flatNo} onChange={(e) => setRow(i, { flatNo: e.target.value })} /></Td>
                    </>
                  )}
                  {direct ? (
                    <Td dense>
                      <input className={`${inputCls} text-right`} type="number" min="0" step="any" placeholder="0" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} />
                    </Td>
                  ) : (
                    <>
                      {keys.map((k) => (
                        <Td dense key={k}>
                          <input className={`${inputCls} text-right`} type="number" min="0" step="any" value={r[k]} onChange={(e) => setRow(i, { [k]: e.target.value } as Partial<DimRowForm>)} />
                        </Td>
                      ))}
                      <Td dense>
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                          <input type="checkbox" checked={r.deduct} onChange={(e) => setRow(i, { deduct: e.target.checked })} /> Deduct
                        </label>
                      </Td>
                      <Td dense className={`text-right text-xs font-mono font-semibold ${r.deduct ? "text-red-500" : "text-gray-700 dark:text-gray-200"}`}>
                        {v === null ? "—" : `${r.deduct ? "−" : ""}${round5(v).toLocaleString("en-IN")}`}
                      </Td>
                    </>
                  )}
                  <Td dense className="text-center">
                    <button
                      type="button" aria-label="Remove row" disabled={rows.length === 1}
                      className="text-gray-400 hover:text-red-500 disabled:opacity-30"
                      onClick={() => onRows(rows.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </Td>
                </Tr>
                <Tr className={tint}>
                  <Td dense />
                  <Td dense colSpan={totalCols - 1} className="pt-0 pb-2">
                    <input
                      className={inputCls} style={{ fontFamily: "inherit" }}
                      placeholder="Note for this row (e.g. Wall A, bedroom)" value={r.note} onChange={(e) => setRow(i, { note: e.target.value })}
                    />
                  </Td>
                </Tr>
              </Fragment>
            );
          })}
        </Tbody>
      </Table>
      <div className="mt-2">
        <Btn outline icon={Plus} label="Add row" className="w-full" onClick={() => onRows([...rows, blankDimRow()])} />
      </div>
      <div className="flex items-center justify-end gap-1.5 mt-2 text-xs">
        <span className="text-gray-400">Total</span>
        <span className="font-mono font-bold text-emerald-600">{total.toLocaleString("en-IN")} {unit}</span>
      </div>
      {error && <span className="block text-xs text-red-500 mt-1">{error}</span>}
    </div>
  );
}
