import { fmtGap, fmtPct, type Stats } from "./shared";

// Shows how every headline figure is worked out, with the live numbers for the current filters.
export default function CalculationsCard({ k }: { k: Stats }) {
  const rows: { metric: string; rule: string; calc: string; result: string }[] = [
    { metric: "Total Planned", rule: "Approval stages whose SLA due time falls in the period (only those already due)", calc: "count of due stages", result: String(k.planned) },
    { metric: "Completed (Work Done)", rule: "Planned stages that were completed", calc: `${k.done} of ${k.planned}`, result: String(k.done) },
    { metric: "Pending (Work Not Done)", rule: "Planned − Completed: still open", calc: `${k.planned} − ${k.done}  (${k.overdue} overdue + ${k.pending} not yet due)`, result: String(k.notDone) },
    { metric: "On-Time", rule: "Completed within the SLA time, as a share of completed work", calc: `${k.onTime} ÷ ${k.done}`, result: `${k.onTime} (${fmtPct(k.onTimePct)})` },
    { metric: "Delayed (SLA Breached)", rule: "Completed after the due time + still open past the due time", calc: `${k.late} late + ${k.overdue} overdue`, result: String(k.breached) },
    { metric: "Completion %", rule: "Completed ÷ Planned", calc: `${k.done} ÷ ${k.planned}`, result: fmtPct(k.completionPct) },
    { metric: "Performance Gap", rule: "(Completed − Planned) ÷ Planned — minus means behind plan", calc: `(${k.done} − ${k.planned}) ÷ ${k.planned}  ·  Difference ${k.difference}`, result: fmtGap(k.gapPct) },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[640px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-[#1E293B]">
            <th className="px-3 py-2 font-bold">Metric</th><th className="px-3 py-2 font-bold">Rule</th><th className="px-3 py-2 font-bold">Calculation</th><th className="px-3 py-2 font-bold text-right">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/40">
          {rows.map(r => (
            <tr key={r.metric}>
              <td className="px-3 py-2 font-semibold whitespace-nowrap">{r.metric}</td>
              <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{r.rule}</td>
              <td className="px-3 py-2 text-xs tabular-nums text-gray-600 dark:text-gray-300">{r.calc}</td>
              <td className="px-3 py-2 text-right font-bold tabular-nums text-primary">{r.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
