import { useState } from "react";
import { Progress, Tag, Modal, Button } from "antd";
import { useCategories } from "../../../hooks/useCategories";
import { useDashboardData } from "../hooks/useDashboardData";
import { CategoryProgress } from "./CategoryProgress";
import type { DPROperational, DPRProjectPerformance } from "../../../types/DPR";
import { Panel, Grid2, KpiCard, KpiRow, Funnel, TrendLine, Donut, DrillDownDrawer, BriefBanner, statusColor } from "./MiniCharts";
import type { ComparisonMode } from "./MiniCharts";

const LIST_PREVIEW_LIMIT = 5;

function ProjectPerfTable({ rows }: { rows: DPRProjectPerformance[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr>
            {["Project", "WO", "Bills", "Approved", "Paid", "Progress"].map((h, i) => (
              <th key={h} style={{ padding: "6px 10px", textAlign: i === 0 ? "left" : "right", fontSize: 10.5, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.projectId} style={{ borderBottom: "1px solid #F3F4F6" }}>
              <td style={{ padding: "8px 10px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{p.projectName}</td>
              <td style={{ padding: "8px 10px", textAlign: "right" }}>{p.woCount}</td>
              <td style={{ padding: "8px 10px", textAlign: "right" }}>{p.billRequestCount}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: "#16a34a" }}>{p.approvedCount}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", color: "#2563eb" }}>{p.paidCount}</td>
              <td style={{ padding: "8px 10px", textAlign: "right", minWidth: 90 }}>
                <Tag color={p.progressPct >= 90 ? "green" : p.progressPct >= 60 ? "gold" : "red"}>{p.progressPct}%</Tag>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OperationalView({ data, comparisonMode }: { data: DPROperational; comparisonMode: ComparisonMode }) {
  const { kpis, comparisons, details, funnel, siteProgressToday, woTrend, woByCategory, projectPerformance, briefs } = data;
  const [drill, setDrill] = useState<{ title: string; key: keyof typeof details } | null>(null);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);

  const open = (title: string, key: keyof typeof details) => setDrill({ title, key });

  const { categories } = useCategories();
  const { data: legacyData } = useDashboardData(false);
  const workOrders = legacyData?.workOrders ?? [];
  const bills = legacyData?.bills ?? [];
  const categoriesWithWOs = categories.filter(cat => workOrders.some(wo => wo.category === cat.name));

  return (
    <div>
      <BriefBanner icon="🏗️" title="Today's Operational Highlights" briefs={briefs} />

      {/* ── KPI cards ── */}
      <KpiRow>
        <KpiCard icon="📋" label="Work Orders Created" value={kpis.woCreatedToday} color="#2563eb"
          change={comparisons.woCreated[comparisonMode === "none" ? "yesterday" : comparisonMode]} comparisonMode={comparisonMode}
          onClick={() => open("Work Orders Created", "woCreatedToday")} />
        <KpiCard icon="📝" label="Bill Requests Raised" value={kpis.billRequestsToday} color="#f37916"
          change={comparisons.billRequestsRaised[comparisonMode === "none" ? "yesterday" : comparisonMode]} comparisonMode={comparisonMode}
          onClick={() => open("Bill Requests Raised", "billRequestsToday")} />
        <KpiCard icon="✅" label="Bills Approved" value={kpis.billsApprovedToday} color="#7c3aed"
          change={comparisons.billsApproved[comparisonMode === "none" ? "yesterday" : comparisonMode]} comparisonMode={comparisonMode}
          onClick={() => open("Bills Approved", "billsApprovedToday")} />
        <KpiCard icon="💳" label="Payments Released" value={kpis.paymentsReleasedToday} color="#16a34a"
          change={comparisons.paymentsReleased[comparisonMode === "none" ? "yesterday" : comparisonMode]} comparisonMode={comparisonMode}
          onClick={() => open("Payments Released", "paymentsReleasedToday")} />
        <KpiCard icon="💵" label="Advance Payments" value={kpis.advancePaymentsToday} color="#d97706"
          change={comparisons.advancePayments[comparisonMode === "none" ? "yesterday" : comparisonMode]} comparisonMode={comparisonMode}
          onClick={() => open("Advance Payments", "advancePaymentsToday")} />
        <KpiCard icon="🏗️" label="Site Progress Entries" value={kpis.progressEntriesToday} color="#0891b2"
          change={comparisons.progressEntries[comparisonMode === "none" ? "yesterday" : comparisonMode]} comparisonMode={comparisonMode} />
        <KpiCard icon="⏳" label="Pending Approvals" value={kpis.pendingApprovals} color="#e03b3b"
          onClick={() => open("Pending Approvals", "pendingApprovals")} />
        <KpiCard icon="👷" label="Contractors Active" value={kpis.contractorsActiveToday} color="#374151" />
      </KpiRow>

      {/* ── Daily Workflow Funnel ── */}
      <Panel title="Daily Workflow Funnel" sub="How many items moved through each stage on the selected date">
        <Funnel stages={funnel.map(f => ({ label: f.label, count: f.count }))} colorFor={(i) => ["#2563eb", "#f37916", "#7c3aed", "#0891b2", "#16a34a"][i] || "#374151"} />
      </Panel>

      <div style={{ height: 4 }} />

      <Grid2>
        <Panel title="Site Progress Today" sub="Scope items with progress logged on the selected date" tall>
          {siteProgressToday.length === 0 ? (
            <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No site progress logged for this date.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 320, overflowY: "auto" }}>
              {siteProgressToday.map((s, i) => (
                <div key={i} style={{ border: "1px solid #F3F4F6", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600, fontSize: 12.5, color: "#374151" }}>{s.description}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a" }}>+{s.todayQty.toLocaleString("en-IN")} {s.unit}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{s.projectName} · {s.workOrderNo}</div>
                  <Progress percent={s.completionPct} size="small" strokeColor={statusColor(s.completionPct)} style={{ marginTop: 4 }} />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Project-wise Operational Performance" tall>
          {projectPerformance.length === 0 ? (
            <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No project-linked work orders yet.</div>
          ) : (
            <>
              <ProjectPerfTable rows={projectPerformance.slice(0, LIST_PREVIEW_LIMIT)} />
              {projectPerformance.length > LIST_PREVIEW_LIMIT && (
                <Button type="link" size="small" style={{ padding: "8px 0 0" }} onClick={() => setShowAllProjects(true)}>
                  View All ({projectPerformance.length})
                </Button>
              )}
            </>
          )}
        </Panel>
      </Grid2>

      <Grid2>
        <Panel title="Work Order Creation Trend" sub="Last 30 days">
          <TrendLine points={woTrend.map(t => ({ date: t.date, value: t.count }))} color="#2563eb" />
        </Panel>
        <Panel title="Work Orders by Category">
          {woByCategory.length === 0 ? (
            <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No work orders yet.</div>
          ) : (
            <Donut segments={woByCategory.slice(0, 6).map(c => ({ label: c.name, value: c.count, color: c.color }))} />
          )}
        </Panel>
      </Grid2>

      {/* ── Progress by Category ── */}
      <Panel title="Progress by Category" sub="Billed vs. contract value per work-order category">
        <CategoryProgress categories={categories} workOrders={workOrders} bills={bills} limit={LIST_PREVIEW_LIMIT} />
        {categoriesWithWOs.length > LIST_PREVIEW_LIMIT && (
          <Button type="link" size="small" style={{ padding: "8px 0 0" }} onClick={() => setShowAllCategories(true)}>
            View All ({categoriesWithWOs.length})
          </Button>
        )}
      </Panel>

      <Modal open={showAllProjects} onCancel={() => setShowAllProjects(false)} footer={null} title="Project-wise Operational Performance" width={720}>
        <div style={{ maxHeight: 500, overflowY: "auto" }}>
          <ProjectPerfTable rows={projectPerformance} />
        </div>
      </Modal>

      <Modal open={showAllCategories} onCancel={() => setShowAllCategories(false)} footer={null} title="Progress by Category" width={600}>
        <div style={{ maxHeight: 500, overflowY: "auto" }}>
          <CategoryProgress categories={categories} workOrders={workOrders} bills={bills} />
        </div>
      </Modal>

      <DrillDownDrawer
        open={!!drill} onClose={() => setDrill(null)}
        title={drill?.title ?? ""} rows={drill ? details[drill.key] : []}
      />
    </div>
  );
}
