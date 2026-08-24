import { useEffect, useState } from "react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import toast from "react-hot-toast";
import apiClient from "../../services/apiClient";
import { useDPRData } from "../../features/dashboard/hooks/useDPRData";
import { selectableProjects } from "../../utils/projectOptions";
import OperationalView from "../../features/dashboard/components/OperationalView";
import FinancialView from "./FinancialView";
import { ReportToolbar } from "../../features/dashboard/components/ReportToolbar";
import type { ComparisonMode } from "../../features/dashboard/components/MiniCharts";
import { useDueReportSchedules } from "../../features/dashboard/hooks/useReportSchedules";
import Segmented from "../../ui/Segmented";
import DateRangeFilter from "../../components/DateRangeFilter";
import SField from "../../ui/SField";
import { Skeleton } from "../../ui/Skeleton";
import Alert from "../../ui/Alert";

interface ProjectOption { _id: string; name: string; parentId?: string | null; }
type ViewType = "operational" | "financial";

export default function Dashboard() {
  const [view, setView] = useState<ViewType>("operational");
  // Defaults to "All Time" — matches DateRangeFilter's own default preset,
  // so the dropdown's displayed label and the actually-active range agree
  // on first render.
  const [dateRange, setDateRange] = useState<{ from: Dayjs | null; to: Dayjs | null }>({ from: null, to: dayjs() });
  const [projectId, setProjectId] = useState<string>("all");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("yesterday");

  // Comparisons (vs Yesterday / 7d avg / 30d avg) only make sense when
  // looking at a single day — force it off for any multi-day range. A
  // specific single day (rather than literal "today") is reached via
  // Custom Range with the same from/to date.
  useEffect(() => {
    const singleDay = !!dateRange.from && !!dateRange.to && dateRange.from.isSame(dateRange.to, "day");
    if (!singleDay && comparisonMode !== "none") setComparisonMode("none");
  }, [dateRange]);

  const dprDateFrom = dateRange.from ? dateRange.from.format("YYYY-MM-DD") : null;
  const dprDateTo = (dateRange.to ?? dayjs()).format("YYYY-MM-DD");

  // A human label for whatever range is actually selected — the KPI cards
  // used to just always say "Today" regardless of this filter, which read as
  // flatly wrong once someone picked "All Time" and the numbers changed but
  // the words next to them didn't.
  const rangeTo = dateRange.to ?? dayjs();
  const rangeLabel = !dateRange.from
    ? "All Time"
    : dateRange.from.isSame(rangeTo, "day")
      ? (dateRange.from.isSame(dayjs(), "day") ? "Today" : dateRange.from.format("DD MMM"))
      : `${dateRange.from.format("DD MMM")} – ${rangeTo.format("DD MMM")}`;

  useEffect(() => {
    apiClient.get("/projects").then(res => setProjects(res.data.projects ?? [])).catch(() => {});
  }, []);

  const { data: dueSchedules } = useDueReportSchedules();
  useEffect(() => {
    if (!dueSchedules?.length) return;
    dueSchedules.forEach(s => {
      toast(`Your ${s.timeOfDay} ${s.viewType} report for ${s.projectName} is ready to view — switch views above and download it.`, {
        icon: "🔔",
        duration: 6000,
      });
    });
  }, [dueSchedules]);

  const { data, isLoading, error } = useDPRData(dprDateFrom, dprDateTo, projectId as string);

  const projectLabel = projectId === "all" ? "All Projects" : selectableProjects(projects).find(p => p._id === projectId)?.name ?? "All Projects";

  return (
    <div className="pb-10">
      {/* Header */}
      <div className="mb-5 flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A2E] dark:text-[#F1F5F9] m-0">
            {view === "operational" ? "Operational Dashboard" : "Financial Dashboard"}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 mb-0">
            {view === "operational"
              ? "Real-time overview of project operations and progress."
              : "Billing, payments, and outstanding-value overview."}
          </p>
        </div>
        <Segmented
          value={view}
          onChange={setView}
          variant="text"
          options={[
            { label: "Operational", value: "operational" },
            { label: "Financial", value: "financial" },
          ]}
        />
      </div>

      {/* Filters + actions */}
      <div className="flex justify-between items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="w-56">
            <SField
              value={projectId}
              onChange={setProjectId}
              options={[{ label: "All Projects", value: "all" }, ...selectableProjects(projects).map(p => ({ label: p.name, value: p._id }))]}
            />
          </div>
          <DateRangeFilter onChange={(from, to) => setDateRange({ from, to })} />
        </div>
        {data && <ReportToolbar report={data} viewType={view} projectLabel={projectLabel} projectId={projectId} />}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      ) : error || !data ? (
        <div className="m-6"><Alert type="error" message={(error as Error)?.message ?? "Failed to load MIS report"} /></div>
      ) : view === "operational" ? (
        <OperationalView data={data.operational} comparisonMode={comparisonMode} projectId={projectId} rangeLabel={rangeLabel} />
      ) : (
        <FinancialView financial={data.financial} comparisonMode={comparisonMode} projectId={projectId} rangeLabel={rangeLabel} />
      )}
    </div>
  );
}
