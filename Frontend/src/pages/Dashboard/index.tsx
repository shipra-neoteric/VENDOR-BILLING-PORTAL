import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import toast from "react-hot-toast";
import apiClient from "../../services/apiClient";
import { useDPRData } from "../../features/dashboard/hooks/useDPRData";
import { selectableProjects } from "../../utils/projectOptions";
import OperationalView from "../../features/dashboard/components/OperationalView";
import FinancialView from "./FinancialView";
import { ReportSummaryHeader, ReportToolbar } from "../../features/dashboard/components/ReportToolbar";
import type { ComparisonMode } from "../../features/dashboard/components/MiniCharts";
import { useDueReportSchedules } from "../../features/dashboard/hooks/useReportSchedules";
import Segmented from "../../ui/Segmented";
import { DatePicker, DateRangePicker } from "../../ui/DatePicker";
import { SelectFilter } from "../../ui/Filters";
import SField from "../../ui/SField";
import { Skeleton } from "../../ui/Skeleton";
import Alert from "../../ui/Alert";

interface ProjectOption { _id: string; name: string; parentId?: string | null; }
type ViewType = "operational" | "financial" | "both";
type RangePreset = "all" | "today" | "week" | "lastWeek" | "custom";

// Monday-start week, independent of dayjs locale config.
function startOfWeek(d: Dayjs): Dayjs {
  return d.subtract((d.day() + 6) % 7, "day").startOf("day");
}

export default function Dashboard() {
  const [view, setView] = useState<ViewType>("both");
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [rangePreset, setRangePreset] = useState<RangePreset>("today");
  const [customRange, setCustomRange] = useState<[string, string]>([dayjs().subtract(6, "day").format("YYYY-MM-DD"), dayjs().format("YYYY-MM-DD")]);
  const [projectId, setProjectId] = useState<string>("all");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("yesterday");

  // Comparisons (vs Yesterday / 7d avg / 30d avg) only make sense when
  // looking at a single day — force it off for any multi-day range.
  useEffect(() => {
    if (rangePreset !== "today" && comparisonMode !== "none") setComparisonMode("none");
  }, [rangePreset]);

  const { dprDateFrom, dprDateTo } = useMemo(() => {
    const now = dayjs();
    if (rangePreset === "today") {
      const d = date.format("YYYY-MM-DD");
      return { dprDateFrom: d, dprDateTo: d };
    }
    if (rangePreset === "week") {
      return { dprDateFrom: startOfWeek(now).format("YYYY-MM-DD"), dprDateTo: now.format("YYYY-MM-DD") };
    }
    if (rangePreset === "lastWeek") {
      const s = startOfWeek(now).subtract(7, "day");
      return { dprDateFrom: s.format("YYYY-MM-DD"), dprDateTo: s.add(6, "day").format("YYYY-MM-DD") };
    }
    if (rangePreset === "all") {
      return { dprDateFrom: null as string | null, dprDateTo: now.format("YYYY-MM-DD") };
    }
    // custom
    return { dprDateFrom: customRange[0], dprDateTo: customRange[1] };
  }, [rangePreset, date, customRange]);

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
          <h1 className="text-2xl font-bold text-[#1A1A2E] dark:text-[#F1F5F9] m-0">Project Cost Center</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 mb-0">
            Daily progress, billing, and payment MIS — operational and financial views.
          </p>
        </div>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { label: "🏗️ Operational", value: "operational" },
            { label: "💰 Financial", value: "financial" },
            { label: "🔎 Both", value: "both" },
          ]}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <DatePicker
          value={date.format("YYYY-MM-DD")}
          onChange={d => setDate(d ? dayjs(d) : dayjs())}
          disabled={rangePreset !== "today"}
        />
        <SelectFilter
          value={rangePreset}
          onChange={v => setRangePreset(v as RangePreset)}
          options={[
            { label: "All Time", value: "all" },
            { label: "Today", value: "today" },
            { label: "Current Week", value: "week" },
            { label: "Last Week", value: "lastWeek" },
            { label: "Custom Range", value: "custom" },
          ]}
        />
        {rangePreset === "custom" && (
          <DateRangePicker
            from={customRange[0]}
            to={customRange[1]}
            onChange={(from, to) => setCustomRange([from, to])}
          />
        )}
        <div className="w-56">
          <SField
            value={projectId}
            onChange={setProjectId}
            options={[{ label: "All Projects", value: "all" }, ...selectableProjects(projects).map(p => ({ label: p.name, value: p._id }))]}
          />
        </div>
        <SelectFilter
          value={comparisonMode}
          onChange={v => setComparisonMode(v as ComparisonMode)}
          disabled={rangePreset !== "today"}
          options={[
            { label: "No Comparison", value: "none" },
            { label: "vs Yesterday", value: "yesterday" },
            { label: "vs 7-Day Avg", value: "avg7d" },
            { label: "vs 30-Day Avg", value: "avg30d" },
          ]}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      ) : error || !data ? (
        <div className="m-6"><Alert type="error" message={(error as Error)?.message ?? "Failed to load MIS report"} /></div>
      ) : view === "both" ? (
        <>
          {/* Operational section */}
          <div className="text-[15px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9] mb-2.5">🏗️ Operational</div>
          <div className="flex justify-between items-center flex-wrap gap-2.5 bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-xl px-4 py-3 mb-5">
            <ReportSummaryHeader report={data} viewType="operational" projectLabel={projectLabel} />
            <ReportToolbar report={data} viewType="operational" projectLabel={projectLabel} projectId={projectId} />
          </div>
          <OperationalView data={data.operational} comparisonMode={comparisonMode} />

          {/* Financial section */}
          <div className="text-[15px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9] mt-8 mb-2.5 pt-6 border-t border-gray-200 dark:border-gray-700/40">💰 Financial</div>
          <div className="flex justify-between items-center flex-wrap gap-2.5 bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-xl px-4 py-3 mb-5">
            <ReportSummaryHeader report={data} viewType="financial" projectLabel={projectLabel} />
            <ReportToolbar report={data} viewType="financial" projectLabel={projectLabel} projectId={projectId} />
          </div>
          <FinancialView financial={data.financial} comparisonMode={comparisonMode} projectPerformance={data.operational.projectPerformance} />
        </>
      ) : (
        <>
          {/* Report summary + export toolbar */}
          <div className="flex justify-between items-center flex-wrap gap-2.5 bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-xl px-4 py-3 mb-5">
            <ReportSummaryHeader report={data} viewType={view} projectLabel={projectLabel} />
            <ReportToolbar report={data} viewType={view} projectLabel={projectLabel} projectId={projectId} />
          </div>

          {view === "operational" ? (
            <OperationalView data={data.operational} comparisonMode={comparisonMode} />
          ) : (
            <FinancialView financial={data.financial} comparisonMode={comparisonMode} projectPerformance={data.operational.projectPerformance} />
          )}
        </>
      )}
    </div>
  );
}
