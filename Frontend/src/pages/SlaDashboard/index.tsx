import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { Info } from "lucide-react";
import apiClient from "../../services/apiClient";
import type { WorkflowMISReport, WorkflowEntityType, MISPipeline } from "../../types/Workflow";
import PageHeader from "../../ui/PageHeader";
import { SelectFilter } from "../../ui/Filters";
import NxBadge from "../../ui/nexora/Badge";
import Spinner from "../../ui/Spinner";
import Alert from "../../ui/Alert";
import NxCard from "../../ui/nexora/Card";
import Donut from "../../ui/charts/Donut";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { useAuth } from "../../context/AuthContext";

// ── Helpers ──────────────────────────────────────────────────────
function fmtMinutes(min: number): string {
  if (min <= 0) return "—";
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
const fmtMoney = (n: number) => n ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "₹0";
const statusColor = (pct: number) => pct >= 90 ? "#16a34a" : pct >= 60 ? "#f59e0b" : "#e03b3b";

// ── Section heading used inside a Card ──────────────────────────
function PanelHead({ title, sub, info }: { title: string; sub?: string; info?: boolean }) {
  return (
    <div className="mb-4 flex items-start gap-1.5">
      <div>
        <div className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{title}</div>
        {sub && <div className="text-[11.5px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
      </div>
      {info && <Info className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 mt-0.5 shrink-0" />}
    </div>
  );
}

function ViewAllLink({ label, onClick }: { label: string; onClick?: () => void }) {
  if (!onClick) return null;
  return (
    <button onClick={onClick} className="text-xs font-semibold text-primary hover:underline mt-3 flex items-center gap-1">
      {label} <span aria-hidden>→</span>
    </button>
  );
}

function BarRow({ label, value, max, count, color = "var(--theme-primary)" }: { label: string; value: number; max: number; count?: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <span className="w-[150px] text-[12.5px] text-gray-600 dark:text-gray-300 shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 bg-gray-100 dark:bg-gray-700/40 rounded h-4 relative overflow-hidden">
        <div className="h-full rounded transition-[width] duration-400" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color, minWidth: value > 0 ? 4 : 0 }} />
      </div>
      <span className="w-[90px] text-[12.5px] font-bold text-gray-700 dark:text-gray-300 text-right shrink-0">
        {count !== undefined ? count : value}
      </span>
    </div>
  );
}

function PipelineFunnel({ p }: { p: MISPipeline }) {
  return (
    <div className="flex gap-0 overflow-x-auto">
      {p.stages.map((s, i) => {
        const color = statusColor(s.withinSlaPct);
        return (
          <div key={s.name} className="flex items-center shrink-0">
            <div className="min-w-[118px] text-center px-1.5">
              <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1 truncate" title={s.name}>{s.name}</div>
              <div className="text-[22px] font-extrabold" style={{ color }}>{s.reached}</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                Avg {s.avgHours}h · <span style={{ color }}>{s.withinSlaPct}%</span>
                {s.pending > 0 && <><br /><span className="text-red-500 dark:text-red-400">{s.pending} waiting</span></>}
              </div>
            </div>
            {i < p.stages.length - 1 && <div className="w-5 h-0.5 bg-gray-300 dark:bg-gray-600 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

// Tiny inline sparkline — deliberately not the shared TrendLine (that
// component's fixed 20px padding assumes a full-size card chart, not an
// 80×28 tile; forcing it down to tile size would break its own proportions).
function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const W = 84, H = 28;
  const max = Math.max(...points), min = Math.min(...points);
  const range = max - min || 1;
  const step = W / (points.length - 1);
  const toY = (v: number) => H - ((v - min) / range) * (H - 4) - 2;
  const pts = points.map((v, i) => `${i * step},${toY(v)}`).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type DeltaTone = "good" | "bad" | "neutral";
const DELTA_TONE_CLASS: Record<DeltaTone, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  bad: "text-red-500 dark:text-red-400",
  neutral: "text-blue-500 dark:text-blue-400",
};

function KpiTile({
  label, value, valueStyle, badge, deltaText, deltaTone = "neutral", sparkline, sparklineColor,
}: {
  label: string; value: React.ReactNode; valueStyle?: React.CSSProperties;
  badge?: { label: string; color: "green" | "amber" | "red" | "blue" };
  deltaText?: string | null; deltaTone?: DeltaTone; sparkline?: number[]; sparklineColor?: string;
}) {
  return (
    <NxCard>
      <div className="flex items-start justify-between gap-1.5 mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 leading-snug">{label}</span>
        {badge && <span className="shrink-0"><NxBadge color={badge.color}>{badge.label}</NxBadge></span>}
      </div>
      <div className="text-xl font-bold text-[#1A1A2E] dark:text-[#F1F5F9] mb-2 break-words leading-tight" style={valueStyle}>{value}</div>
      {deltaText && (
        <div className="flex items-end justify-between gap-2">
          <span className={`text-xs font-semibold leading-tight ${DELTA_TONE_CLASS[deltaTone]}`}>{deltaText}</span>
          {sparkline && sparkline.length >= 2 && sparklineColor && <MiniSparkline points={sparkline} color={sparklineColor} />}
        </div>
      )}
    </NxCard>
  );
}

export default function SlaDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Bill Requests live on a different page depending on role — /bill-requests
  // is only reachable for site-dri; every other role manages them from the
  // Requests tab inside Site Progress.
  const billRequestPath = (id: string) => user?.role === "site-dri" ? `/bill-requests?open=${id}` : `/site-progress?open=${id}`;
  const [report, setReport] = useState<WorkflowMISReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entityFilter, setEntityFilter] = useState<WorkflowEntityType | "all">("all");
  const [rangeFilter, setRangeFilter] = useState<"all" | "7" | "30" | "90">("all");
  const [wfTypeFilter, setWfTypeFilter] = useState<WorkflowEntityType | "all">("all");
  const [wfStatusFilter, setWfStatusFilter] = useState<"all" | "overdue" | "ontrack">("all");
  const [wfAssigneeFilter, setWfAssigneeFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params: Record<string, string> = {};
      if (entityFilter !== "all") params.entityType = entityFilter;
      if (rangeFilter !== "all") params.days = rangeFilter;
      const res = await apiClient.get("/workflows/mis-report", { params });
      setReport(res.data);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to load SLA MIS report");
    } finally { setLoading(false); }
  }, [entityFilter, rangeFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading && !report) return <Spinner label="Loading SLA MIS report…" />;

  if (error) return <div className="m-6"><Alert type="error" message={error} /></div>;
  if (!report) return null;

  const { health, pipeline, byAssignee, projectHealth, financial, drilldown, recentActivity, trend } = report;

  const maxFinStage = Math.max(1, ...financial.byStage.map(s => s.amount));

  const woPipeline = pipeline.filter(p => p.entityType === "WorkOrder");
  const brPipeline = pipeline.filter(p => p.entityType === "BillRequest");
  const otherPipeline = pipeline.filter(p => p.entityType !== "WorkOrder" && p.entityType !== "BillRequest");

  // ── KPI tile deltas — every series here is a real daily snapshot field
  // from the backend (trend[].netSla/ongoing/slaBreach/breachedAmount).
  // "Total Projects" has no historical snapshot field at all, so it
  // intentionally gets no delta/sparkline below rather than a fabricated one.
  const hasTrend = trend.length >= 2;
  const first = trend[0], last = trend[trend.length - 1];
  const healthDelta = hasTrend ? last.netSla - first.netSla : null;
  const openDelta = hasTrend ? last.ongoing - first.ongoing : null;
  const criticalDelta = hasTrend ? last.slaBreach - first.slaBreach : null;
  const rangeLabel = rangeFilter === "all" ? "start" : `${rangeFilter}d ago`;

  // A % change off a small baseline can read as a huge, hard-to-parse number
  // (e.g. "1564%") even though it's mathematically correct — show the real ₹
  // delta instead once the percentage swings past a legible range.
  const finDeltaAbs = hasTrend ? last.breachedAmount - first.breachedAmount : null;
  const finDeltaPctRaw = hasTrend && first.breachedAmount > 0
    ? Math.round((finDeltaAbs! / first.breachedAmount) * 100)
    : null;
  const finDeltaPct = finDeltaPctRaw !== null && Math.abs(finDeltaPctRaw) <= 300 ? finDeltaPctRaw : null;
  const finDeltaText = hasTrend
    ? (finDeltaPct !== null
      ? `${finDeltaPct >= 0 ? "↑" : "↓"} ${Math.abs(finDeltaPct)}% vs ${rangeLabel}`
      : (finDeltaAbs !== 0 ? `${finDeltaAbs! >= 0 ? "↑" : "↓"} ${fmtMoney(Math.abs(finDeltaAbs!))} vs ${rangeLabel}` : null))
    : null;
  const finDeltaGood = finDeltaPct !== null ? finDeltaPct <= 0 : (finDeltaAbs !== null ? finDeltaAbs <= 0 : true);

  const finRiskRatio = financial.pendingAmount > 0 ? financial.breachedAmount / financial.pendingAmount : 0;
  const finBadge = finRiskRatio >= 0.3
    ? { label: "High Risk", color: "red" as const }
    : finRiskRatio > 0
      ? { label: "Moderate Risk", color: "amber" as const }
      : { label: "Low Risk", color: "green" as const };

  // ── SLA Compliance: real 3-way split derived from every open workflow in `drilldown`
  const RISK_WINDOW_MS = 24 * 60 * 60 * 1000;
  let onTimeCount = 0, atRiskCount = 0, overdueCount = 0;
  drilldown.forEach(d => {
    if (d.breached) { overdueCount++; return; }
    if (d.dueAt && new Date(d.dueAt).getTime() - Date.now() < RISK_WINDOW_MS) atRiskCount++;
    else onTimeCount++;
  });
  const complianceTotal = drilldown.length || 1;
  const compliancePct = {
    onTime: Math.round((onTimeCount / complianceTotal) * 100),
    atRisk: Math.round((atRiskCount / complianceTotal) * 100),
    overdue: Math.round((overdueCount / complianceTotal) * 100),
  };

  // ── Pipeline tiles — real per-stage backlog + historical on-time %
  const pipelineTiles = woPipeline.flatMap(p => p.stages).slice(0, 6);
  const brPipelineTiles = brPipeline.flatMap(p => p.stages).slice(0, 6);
  const billRequestListPath = user?.role === "site-dri" ? "/bill-requests" : "/site-progress";

  // ── SLA by User — every user, backend already sorts by slaBreach desc
  const byAssigneeRows = byAssignee.map(a => ({
    ...a,
    slaScore: a.totalSla ? Math.round((a.slaComplete / a.totalSla) * 100) : 0,
  }));

  // ── Ongoing Workflows — local (client-side) filters, independent of the
  // page-level entity/range filters, since they only narrow this one table.
  const wfAssigneeOptions = [...new Set(drilldown.map(d => d.assignedTo))].sort((a, b) => a.localeCompare(b));
  const filteredDrilldown = drilldown.filter(d => {
    if (wfTypeFilter !== "all" && d.entityType !== wfTypeFilter) return false;
    if (wfStatusFilter === "overdue" && !d.breached) return false;
    if (wfStatusFilter === "ontrack" && d.breached) return false;
    if (wfAssigneeFilter !== "all" && d.assignedTo !== wfAssigneeFilter) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="MIS Dashboard"
        subtitle="Real-time overview of project performance, SLA health, and financial impact."
        actions={
          <>
            <SelectFilter value={entityFilter} onChange={v => setEntityFilter(v as WorkflowEntityType | "all")}
              options={[{ label: "All Types", value: "all" }, { label: "Work Order", value: "WorkOrder" }, { label: "Bill Request", value: "BillRequest" }, { label: "Custom", value: "Custom" }]} />
            <SelectFilter value={rangeFilter} onChange={v => setRangeFilter(v as "all" | "7" | "30" | "90")}
              options={[{ label: "All Time", value: "all" }, { label: "7 Days", value: "7" }, { label: "30 Days", value: "30" }, { label: "90 Days", value: "90" }]} />
          </>
        }
      />

      {/* ══════════════ Row 1: KPI tiles ══════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <KpiTile
          label="Health Score" value={`${health.score}%`} valueStyle={{ color: statusColor(health.score) }}
          badge={{ label: health.status === "good" ? "Good" : health.status === "warning" ? "Warning" : "Critical", color: health.status === "good" ? "green" : health.status === "warning" ? "amber" : "red" }}
          deltaText={healthDelta !== null ? `${healthDelta >= 0 ? "↑" : "↓"} ${Math.abs(healthDelta)}pt vs ${rangeLabel}` : undefined}
          deltaTone={healthDelta !== null ? (healthDelta >= 0 ? "good" : "bad") : "neutral"}
          sparkline={trend.map(p => p.netSla)} sparklineColor="#16a34a"
        />
        <KpiTile
          label="Open Items" value={health.openWorkflows}
          deltaText={openDelta !== null ? `${openDelta >= 0 ? "↑" : "↓"} ${Math.abs(openDelta)} vs ${rangeLabel}` : undefined}
          deltaTone="neutral"
          sparkline={trend.map(p => p.ongoing)} sparklineColor="#2a78d6"
        />
        <KpiTile
          label="Critical Items" value={health.critical} valueStyle={{ color: "#e03b3b" }}
          deltaText={criticalDelta !== null ? `${criticalDelta >= 0 ? "↑" : "↓"} ${Math.abs(criticalDelta)} vs ${rangeLabel}` : undefined}
          deltaTone={criticalDelta !== null ? (criticalDelta <= 0 ? "good" : "bad") : "neutral"}
          sparkline={trend.map(p => p.slaBreach)} sparklineColor="#eb6834"
        />
        <KpiTile
          label="Financial Risk" value={fmtMoney(financial.breachedAmount)} badge={finBadge}
          deltaText={finDeltaText ?? undefined}
          deltaTone={finDeltaText !== null ? (finDeltaGood ? "good" : "bad") : "neutral"}
          sparkline={trend.map(p => p.breachedAmount)} sparklineColor="#e03b3b"
        />
        <KpiTile label="Total Projects" value={projectHealth.length} badge={{ label: "Active", color: "blue" }} />
      </div>

      {/* ══════════════ Row 2: Financial | Compliance ══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <NxCard className="h-full">
          <PanelHead title="Financial Impact" info />
          <div className="flex gap-3.5 mb-4">
            <div className="flex-1">
              <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">Pending</div>
              <div className="text-base font-extrabold text-gray-700 dark:text-gray-300">{fmtMoney(financial.pendingAmount)}</div>
            </div>
            <div className="flex-1">
              <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">Breached</div>
              <div className="text-base font-extrabold text-red-500 dark:text-red-400">{fmtMoney(financial.breachedAmount)}</div>
            </div>
          </div>
          {financial.byStage.map(s => (
            <BarRow key={s.stageName} label={s.stageName} value={s.amount} max={maxFinStage} count={fmtMoney(s.amount)} color="#2563eb" />
          ))}
        </NxCard>

        <NxCard className="h-full">
          <PanelHead title="SLA Compliance" info />
          <Donut
            segments={[
              { label: "On Time", value: onTimeCount, color: "#16a34a" },
              { label: "At Risk", value: atRiskCount, color: "#f59e0b" },
              { label: "Overdue", value: overdueCount, color: "#e03b3b" },
            ]}
            size={112} centerValue={`${compliancePct.onTime}%`} centerSub="On Time" legendMode="percent"
          />
        </NxCard>
      </div>

      {/* ══════════════ Row 3: Live Activity ══════════════ */}
      <NxCard className="mb-5">
        <PanelHead title="Live Activity" sub="Most recent activities and updates" info />
        {recentActivity.length === 0 ? (
          <div className="text-gray-400 dark:text-gray-500 text-[13px] text-center py-2.5">No activity yet.</div>
        ) : (
          <div className="flex flex-col max-h-[220px] overflow-y-auto">
            {recentActivity.map((e, i) => (
              <div key={i} className={`flex gap-2.5 py-2 ${i < recentActivity.length - 1 ? "border-b border-gray-100 dark:border-gray-700/40" : ""}`}>
                <span className="text-[11px] text-gray-400 dark:text-gray-500 w-[70px] shrink-0">{dayjs(e.time).format("h:mm A")}</span>
                <span className="text-[12.5px] text-gray-700 dark:text-gray-300 flex-1">{e.text}</span>
                <span>{e.type === "breach" ? "🔴" : e.type === "late" ? "🟡" : "✔️"}</span>
              </div>
            ))}
          </div>
        )}
      </NxCard>

      {/* ══════════════ Row 4: Work Order Pipeline | Bill Request Pipeline ══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <NxCard className="h-full">
          <PanelHead title="Work Order Pipeline" sub="Work orders status across all stages" info />
          {pipelineTiles.length === 0 ? (
            <div className="text-gray-400 dark:text-gray-500 text-[13px] text-center py-2.5">No Work Order workflows yet.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {pipelineTiles.map(s => {
                const onTime = s.withinSlaPct >= 50;
                return (
                  <div key={s.name} className={`rounded-lg px-2.5 py-2.5 border ${onTime ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20" : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20"}`}>
                    <div className="text-[10.5px] font-semibold text-gray-500 dark:text-gray-400 truncate mb-1" title={s.name}>{s.name}</div>
                    <div className="text-xl font-extrabold text-[#1A1A2E] dark:text-[#F1F5F9]">{s.pending}</div>
                    <div className={`text-[10.5px] font-semibold mt-0.5 ${onTime ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                      {onTime ? `On Time ${s.withinSlaPct}%` : `Overdue ${100 - s.withinSlaPct}%`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <ViewAllLink label="View all work orders" onClick={() => navigate("/work-items")} />
        </NxCard>

        <NxCard className="h-full">
          <PanelHead title="Bill Request Pipeline" sub="Bill requests status across all stages" info />
          {brPipelineTiles.length === 0 ? (
            <div className="text-gray-400 dark:text-gray-500 text-[13px] text-center py-2.5">No Bill Request workflows yet.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {brPipelineTiles.map(s => {
                const onTime = s.withinSlaPct >= 50;
                return (
                  <div key={s.name} className={`rounded-lg px-2.5 py-2.5 border ${onTime ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20" : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20"}`}>
                    <div className="text-[10.5px] font-semibold text-gray-500 dark:text-gray-400 truncate mb-1" title={s.name}>{s.name}</div>
                    <div className="text-xl font-extrabold text-[#1A1A2E] dark:text-[#F1F5F9]">{s.pending}</div>
                    <div className={`text-[10.5px] font-semibold mt-0.5 ${onTime ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                      {onTime ? `On Time ${s.withinSlaPct}%` : `Overdue ${100 - s.withinSlaPct}%`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <ViewAllLink label="View all bill requests" onClick={() => navigate(billRequestListPath)} />
        </NxCard>
      </div>

      {/* ══════════════ SLA by User — full width, every user ══════════════ */}
      <NxCard className="mb-5">
        <PanelHead title="SLA by User" sub="SLA compliance by individual users" info />
        {byAssigneeRows.length === 0 ? (
          <div className="text-gray-400 dark:text-gray-500 text-[13px]">No stages have started yet.</div>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>User</Th>
                <Th className="text-right">Total SLA</Th>
                <Th className="text-right">SLA Done</Th>
                <Th className="text-right">SLA Breach</Th>
                <Th className="text-right">Overdue Time</Th>
                <Th className="text-right">Score (%)</Th>
                <Th className="text-right">SLA Avg Time</Th>
              </Tr>
            </Thead>
            <Tbody>
              {byAssigneeRows.map(a => (
                <Tr key={a.key}>
                  <Td className="font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">{a.label}</Td>
                  <Td className="text-right text-gray-700 dark:text-gray-300">{a.totalSla}</Td>
                  <Td className="text-right text-emerald-600 dark:text-emerald-400 font-semibold">{a.slaComplete}</Td>
                  <Td className={`text-right font-semibold ${a.slaBreach > 0 ? "text-red-500 dark:text-red-400" : "text-gray-400 dark:text-gray-500"}`}>{a.slaBreach}</Td>
                  <Td className={`text-right font-semibold ${a.overdueMinutes > 0 ? "text-red-500 dark:text-red-400" : "text-gray-400 dark:text-gray-500"}`}>{fmtMinutes(a.overdueMinutes)}</Td>
                  <Td className="text-right font-bold" style={{ color: statusColor(a.slaScore) }}>{a.slaScore}%</Td>
                  <Td className="text-right text-gray-500 dark:text-gray-400">{fmtMinutes(a.avgBreachMinutes)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </NxCard>

      {/* ══════════════════════════════════════════════════════════════
          Detailed reports — every "View all/full" link above lands here.
          Kept from the prior build so no existing detail is lost.
      ══════════════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 mb-5">
        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700/40" />
        <span className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Detailed Reports</span>
        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700/40" />
      </div>

      {otherPipeline.length > 0 && (
        <div className="flex flex-col gap-5 mb-5">
          {otherPipeline.map(p => (
            <NxCard key={p.templateName}>
              <PanelHead title={p.templateName} sub={p.entityType} />
              <PipelineFunnel p={p} />
            </NxCard>
          ))}
        </div>
      )}

      <NxCard id="detail-workflows" className="scroll-mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <PanelHead title={`Ongoing Workflows (${filteredDrilldown.length})`} sub="Every open workflow — click a Work Order or Bill Request to jump to it" />
          <div className="flex flex-wrap gap-2">
            <SelectFilter value={wfTypeFilter} onChange={v => setWfTypeFilter(v as WorkflowEntityType | "all")}
              options={[{ label: "All Types", value: "all" }, { label: "Work Order", value: "WorkOrder" }, { label: "Bill Request", value: "BillRequest" }, { label: "Custom", value: "Custom" }]} />
            <SelectFilter value={wfStatusFilter} onChange={v => setWfStatusFilter(v as "all" | "overdue" | "ontrack")}
              options={[{ label: "All Status", value: "all" }, { label: "Overdue", value: "overdue" }, { label: "On Track", value: "ontrack" }]} />
            <SelectFilter value={wfAssigneeFilter} onChange={v => setWfAssigneeFilter(v)}
              options={[{ label: "All Assignees", value: "all" }, ...wfAssigneeOptions.map(a => ({ label: a, value: a }))]} />
          </div>
        </div>
        {filteredDrilldown.length === 0 ? (
          <div className="text-gray-400 dark:text-gray-500 text-[13px] text-center py-5">No ongoing workflows match this filter.</div>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Entity</Th>
                <Th>Type</Th>
                <Th>Current Stage</Th>
                <Th>Assigned To</Th>
                <Th>SLA</Th>
                <Th className="text-right">Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredDrilldown.map(d => {
                const remainingMs = d.dueAt ? new Date(d.dueAt).getTime() - Date.now() : null;
                return (
                  <Tr key={d.instanceId}>
                    <Td>
                      {d.entityType === "WorkOrder" ? (
                        <span className="text-primary font-semibold cursor-pointer" onClick={() => navigate(`/work-items/${d.entityId}`)}>{d.entityLabel}</span>
                      ) : d.entityType === "BillRequest" ? (
                        <span className="text-primary font-semibold cursor-pointer" onClick={() => navigate(billRequestPath(d.entityId))}>{d.entityLabel}</span>
                      ) : d.entityLabel}
                    </Td>
                    <Td><NxBadge color={d.entityType === "WorkOrder" ? "blue" : "indigo"}>{d.entityType}</NxBadge></Td>
                    <Td>{d.currentStage}</Td>
                    <Td>{d.assignedTo}</Td>
                    <Td>
                      {d.breached ? <span className="text-red-500 dark:text-red-400">Overdue {fmtMinutes(d.overdueMinutes)}</span>
                        : remainingMs !== null ? <span className="text-emerald-600 dark:text-emerald-400">{fmtMinutes(Math.round(remainingMs / 60000))} left</span>
                        : "—"}
                    </Td>
                    <Td className="text-right">
                      {d.breached ? <NxBadge color="red">🔴 Overdue</NxBadge> : <NxBadge color="green">🟢 On Track</NxBadge>}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </NxCard>
    </div>
  );
}
