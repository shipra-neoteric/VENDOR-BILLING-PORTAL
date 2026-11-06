import { useState } from "react";
import toast from "react-hot-toast";
import { FileBarChart, FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import PageHeader from "../../ui/PageHeader";
import NxCard from "../../ui/nexora/Card";
import Spinner from "../../ui/Spinner";
import Alert from "../../ui/Alert";
import { useAuth } from "../../context/AuthContext";
import MisFilterBar from "../MisPerformance/MisFilterBar";
import { UserTable } from "../MisPerformance/BreakdownTables";
import { defaultFilters, downloadExcel, fmtGap, fmtNum, fmtPct, gapColor, useMisPerformance, type MisFilters } from "../MisPerformance/shared";
import { downloadMisReportPdf } from "./MisReportPdf";

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
  const unit = filters.groupBy === "month" ? "Month" : "Week";

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
  const k = data?.kpis;

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

      {loading && !data ? <div className="p-10"><Spinner label="Loading…" /></div> : data && k && (
        <NxCard className="mb-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Tile label="Planned" value={fmtNum(k.planned)} sub="Stages due in the period" />
            <Tile label="Work Done" value={fmtNum(k.done)} sub={`${fmtPct(k.completionPct)} completion · ${fmtNum(k.onTime)} on time, ${fmtNum(k.late)} late`} color="#16a34a" />
            <Tile label="Difference" value={fmtNum(k.difference)} sub={`Not done · ${fmtNum(k.overdue)} overdue, ${fmtNum(k.breached)} SLA breached`} />
            <Tile label="MIS (Gap)" value={fmtGap(k.gapPct)} sub={k.planned ? `Achieved ${fmtPct(k.completionPct)} of plan` : "No planned work"} color={gapColor(k.gapPct)} />
          </div>

          <h3 className="text-[11px] font-bold tracking-widest text-gray-700 dark:text-gray-200 mb-2">USER-WISE PERFORMANCE</h3>
          <div className="mb-6"><UserTable rows={data.users} average={data.userAverage} unitLabel={unit} /></div>

        </NxCard>
      )}
    </div>
  );
}
