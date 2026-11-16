import { useState } from "react";
import toast from "react-hot-toast";
import { FileBarChart, FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import PageHeader from "../../ui/PageHeader";
import NxCard from "../../ui/nexora/Card";
import Spinner from "../../ui/Spinner";
import Alert from "../../ui/Alert";
import { useAuth } from "../../context/AuthContext";
import MisFilterBar from "../MisPerformance/MisFilterBar";
import { defaultFilters, downloadExcel, fmtNum, useMisPerformance, type MisFilters } from "../MisPerformance/shared";
import { buildSlaReport, downloadMisReportPdf } from "./MisReportPdf";

function Tile({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3.5">
      <div className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1" style={color ? { color } : undefined}>{value}</div>
      <div className="text-[11px] text-gray-400 mt-1 leading-snug">{sub}</div>
    </div>
  );
}

// The downloadable weekly / monthly report: same layout as the exported PDF and Excel (summary, chart, detailed breakdown with totals
// in the last row, department and user sections, notes).
export default function MisReport() {
  const [filters, setFilters] = useState<MisFilters>(defaultFilters);
  const { data, loading, error, params } = useMisPerformance(filters);
  const { user } = useAuth();
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  const preparedBy = user?.name || "—";

  async function run(kind: "pdf" | "xlsx") {
    if (!data) return;
    setBusy(kind);
    try {
      if (kind === "pdf") await downloadMisReportPdf(data, preparedBy);
      else await downloadExcel(params);
    } catch {
      toast.error(`Could not export the ${kind === "pdf" ? "PDF" : "Excel"} report`);
    } finally { setBusy(null); }
  }
  const btn = "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px] font-medium border transition-colors disabled:opacity-50";
  const rep = data ? buildSlaReport(data) : null;

  return (
    <div>
      <PageHeader
        icon={FileBarChart}
        title="MIS Report"
        subtitle="Weekly / monthly planned vs actual report. Export the same report as PDF or Excel."
        actions={
          <div className="flex items-center gap-2">
            <button type="button" disabled={!data || !!busy} onClick={() => run("pdf")} className={`${btn} bg-primary text-white border-primary hover:bg-primary/90`}>
              {busy === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Export PDF
            </button>
            <button type="button" disabled={!data || !!busy} onClick={() => run("xlsx")} className={`${btn} bg-white dark:bg-transparent text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800`}>
              {busy === "xlsx" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Export Excel
            </button>
          </div>
        }
      />
      <MisFilterBar filters={filters} onChange={setFilters} options={data?.options} />
      {error && <Alert type="error" message={error} />}

      {loading && !data ? <div className="p-10"><Spinner label="Loading…" /></div> : data && rep && (
        <NxCard className="mb-5">
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Tile label="Total Cases" value={fmtNum(rep.total)} sub="Stages due in the period" />
            <Tile label="Completed" value={fmtNum(rep.completed)} sub="Done within the SLA" color="#16a34a" />
            <Tile label="Breached" value={fmtNum(rep.breached)} sub="Late or not done" color={rep.breached ? "#e03b3b" : undefined} />
          </div>

          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-2">SLA by User</h3>
          <div className="overflow-x-auto mb-6 border border-gray-200 dark:border-gray-700/60 rounded-lg">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 dark:bg-gray-800/60"><tr>{["User", "Total", "Work Done", "Done On Time", "Done Late", "Work Not Done", "Rate %"].map(h => <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{rep.slaRows.map((r, i) => <tr key={i} className="border-t border-gray-200 dark:border-gray-700/60">{r.map((c, j) => <td key={j} className="px-3 py-2 tabular-nums">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>

          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-2">Weekly Breakdown — On-Time vs Late/Breached (by User)</h3>
          {rep.blocks.map((blk, bi) => {
            const last = bi === rep.blocks.length - 1;
            return (
              <div key={bi} className="overflow-x-auto mb-4 border border-gray-200 dark:border-gray-700/60 rounded-lg">
                <table className="w-full text-[13px]">
                  <thead className="bg-gray-50 dark:bg-gray-800/60"><tr>
                    <th className="text-left font-semibold px-3 py-2">Executive</th>
                    {blk.flatMap(w => [`${rep.wkLabel(w)} — On-Time`, `${rep.wkLabel(w)} — Late/Breached`]).map(h => <th key={h} className="text-left font-semibold px-3 py-2 text-xs">{h}</th>)}
                    {last && <><th className="text-left font-semibold px-3 py-2">Total On-Time</th><th className="text-left font-semibold px-3 py-2">Total Late/Breached</th></>}
                  </tr></thead>
                  <tbody>{rep.byName.map(u => (
                    <tr key={u.userId} className="border-t border-gray-200 dark:border-gray-700/60">
                      <td className="px-3 py-2">{u.name}</td>
                      {blk.flatMap(w => { const x = u.weeks?.[w]; return [x?.onTime || 0, (x?.planned || 0) - (x?.onTime || 0)]; }).map((v, i) => <td key={i} className="px-3 py-2 tabular-nums">{v}</td>)}
                      {last && <><td className="px-3 py-2 tabular-nums">{u.onTime}</td><td className="px-3 py-2 tabular-nums">{u.planned - u.onTime}</td></>}
                    </tr>))}</tbody>
                </table>
              </div>
            );
          })}
        </NxCard>
      )}
    </div>
  );
}
