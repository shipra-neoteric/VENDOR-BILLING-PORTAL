import { useEffect, useState } from "react";
import { Segmented, DatePicker, Select, Skeleton, Alert, notification } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import apiClient from "../../services/apiClient";
import { useDPRData } from "../../features/dashboard/hooks/useDPRData";
import { selectableProjects } from "../../utils/projectOptions";
import OperationalView from "../../features/dashboard/components/OperationalView";
import FinancialView from "./FinancialView";
import { ReportSummaryHeader, ReportToolbar } from "../../features/dashboard/components/ReportToolbar";
import type { ComparisonMode } from "../../features/dashboard/components/MiniCharts";
import { useDueReportSchedules } from "../../features/dashboard/hooks/useReportSchedules";

interface ProjectOption { _id: string; name: string; parentId?: string | null; }
type ViewType = "operational" | "financial";

export default function Dashboard() {
  const [view, setView] = useState<ViewType>("operational");
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [projectId, setProjectId] = useState<string>("all");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("yesterday");

  useEffect(() => {
    apiClient.get("/projects").then(res => setProjects(res.data.projects ?? [])).catch(() => {});
  }, []);

  const { data: dueSchedules } = useDueReportSchedules();
  useEffect(() => {
    if (!dueSchedules?.length) return;
    dueSchedules.forEach(s => {
      notification.info({
        message: "Scheduled report ready",
        description: `Your ${s.timeOfDay} ${s.viewType} report for ${s.projectName} is ready to view — switch views above and download it.`,
        placement: "topRight",
      });
    });
  }, [dueSchedules]);

  const { data, isLoading, error } = useDPRData(date.format("YYYY-MM-DD"), projectId as string);

  const projectLabel = projectId === "all" ? "All Projects" : selectableProjects(projects).find(p => p._id === projectId)?.name ?? "All Projects";

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "var(--nx-text)" }}>Project Cost Center</h1>
          <p style={{ color: "var(--nx-text-2)", marginTop: 4, marginBottom: 0 }}>
            Daily progress, billing, and payment MIS — operational and financial views.
          </p>
        </div>
        <Segmented
          value={view}
          onChange={v => setView(v as ViewType)}
          options={[
            { label: "🏗️ Operational", value: "operational" },
            { label: "💰 Financial", value: "financial" },
          ]}
          size="large"
        />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <DatePicker value={date} onChange={d => setDate(d || dayjs())} format="DD MMM YYYY" allowClear={false} />
        <Select
          value={projectId} onChange={setProjectId} style={{ width: 220 }} showSearch
          filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
          options={[{ label: "All Projects", value: "all" }, ...selectableProjects(projects).map(p => ({ label: p.name, value: p._id }))]}
        />
        <Select
          value={comparisonMode} onChange={setComparisonMode} style={{ width: 170 }}
          options={[
            { label: "No Comparison", value: "none" },
            { label: "vs Yesterday", value: "yesterday" },
            { label: "vs 7-Day Avg", value: "avg7d" },
            { label: "vs 30-Day Avg", value: "avg30d" },
          ]}
        />
      </div>

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : error || !data ? (
        <Alert type="error" showIcon message={(error as Error)?.message ?? "Failed to load MIS report"} style={{ margin: 24, borderRadius: 10 }} />
      ) : (
        <>
          {/* Report summary + export toolbar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
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
