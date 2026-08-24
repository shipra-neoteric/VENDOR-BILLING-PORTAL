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
  // Set by clicking a Work Order/Bill Request SLA tile above — narrows the
  // Ongoing Workflows table below to just that one stage. Keyed by position
  // (stageIndex), not name — an older instance can have a stage name baked
  // in from before the template was last edited, so a name-string filter
  // would silently miss it even though the tile's own count includes it.
  const [wfStageFilter, setWfStageFilter] = useState<{ index: number; name: string } | null>(null);

  // Clicking a pipeline-stage tile jumps down to the Ongoing Workflows table
  // with entity type + stage pre-applied, so "8 pending at L1" and the rows
  // you land on always agree.
  const openStageDetail = (entityType: WorkflowEntityType, stageIndex: number, stageName: string) => {
    setWfTypeFilter(entityType);
    setWfStageFilter({ index: stageIndex, name: stageName });
    setWfStatusFilter("all");
    setWfAssigneeFilter("all");
    document.getElementById("detail-workflows")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

  const { pipeline, byAssignee, drilldown, recentActivity } = report;

  const woPipeline = pipeline.filter(p => p.entityType === "WorkOrder");
  const brPipeline = pipeline.filter(p => p.entityType === "BillRequest");
  const otherPipeline = pipeline.filter(p => p.entityType !== "WorkOrder" && p.entityType !== "BillRequest");

  // ── Pipeline tiles — real per-stage backlog (how many are sitting there right now)
  const pipelineTiles = woPipeline.flatMap(p => p.stages).slice(0, 6);
  const brPipelineTiles = brPipeline.flatMap(p => p.stages).slice(0, 6);

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
    if (wfStageFilter && d.currentStageIndex !== wfStageFilter.index) return false;
    if (wfStatusFilter === "overdue" && !d.breached) return false;
    if (wfStatusFilter === "ontrack" && d.breached) return false;
    if (wfAssigneeFilter !== "all" && d.assignedTo !== wfAssigneeFilter) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="SLA Report"
        subtitle="Real-time overview of work order and bill request SLA compliance across every stage."
        actions={
          <>
            <SelectFilter value={entityFilter} onChange={v => setEntityFilter(v as WorkflowEntityType | "all")}
              options={[{ label: "All Types", value: "all" }, { label: "Work Order", value: "WorkOrder" }, { label: "Bill Request", value: "BillRequest" }, { label: "Custom", value: "Custom" }]} />
            <SelectFilter value={rangeFilter} onChange={v => setRangeFilter(v as "all" | "7" | "30" | "90")}
              options={[{ label: "All Time", value: "all" }, { label: "7 Days", value: "7" }, { label: "30 Days", value: "30" }, { label: "90 Days", value: "90" }]} />
          </>
        }
      />

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

      {/* ══════════════ Row 4: Work Order SLA | Bill Request SLA ══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <NxCard className="h-full">
          <PanelHead title="Work Order SLA" sub="Click a stage to see exactly which work orders are pending there" info />
          {pipelineTiles.length === 0 ? (
            <div className="text-gray-400 dark:text-gray-500 text-[13px] text-center py-2.5">No Work Order workflows yet.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {pipelineTiles.map(s => (
                <button
                  key={s.stageIndex} type="button" onClick={() => openStageDetail("WorkOrder", s.stageIndex, s.name)}
                  className={`text-left rounded-lg px-2.5 py-2.5 border transition-colors ${s.pending > 0 ? "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/20" : "bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700/60"}`}
                >
                  <div className="text-[10.5px] font-semibold text-gray-500 dark:text-gray-400 truncate mb-1" title={s.name}>{s.name}</div>
                  <div className={`text-xl font-extrabold ${s.pending > 0 ? "text-blue-700 dark:text-blue-400" : "text-[#1A1A2E] dark:text-[#F1F5F9]"}`}>{s.pending}</div>
                  <div className="text-[10.5px] font-semibold mt-0.5 text-gray-400 dark:text-gray-500">pending</div>
                </button>
              ))}
            </div>
          )}
        </NxCard>

        <NxCard className="h-full">
          <PanelHead title="Bill Request SLA" sub="Click a stage to see exactly which bill requests are pending there" info />
          {brPipelineTiles.length === 0 ? (
            <div className="text-gray-400 dark:text-gray-500 text-[13px] text-center py-2.5">No Bill Request workflows yet.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {brPipelineTiles.map(s => (
                <button
                  key={s.stageIndex} type="button" onClick={() => openStageDetail("BillRequest", s.stageIndex, s.name)}
                  className={`text-left rounded-lg px-2.5 py-2.5 border transition-colors ${s.pending > 0 ? "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/20" : "bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700/60"}`}
                >
                  <div className="text-[10.5px] font-semibold text-gray-500 dark:text-gray-400 truncate mb-1" title={s.name}>{s.name}</div>
                  <div className={`text-xl font-extrabold ${s.pending > 0 ? "text-blue-700 dark:text-blue-400" : "text-[#1A1A2E] dark:text-[#F1F5F9]"}`}>{s.pending}</div>
                  <div className="text-[10.5px] font-semibold mt-0.5 text-gray-400 dark:text-gray-500">pending</div>
                </button>
              ))}
            </div>
          )}
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
          <div className="flex flex-wrap items-center gap-2">
            {wfStageFilter && (
              <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1 rounded-full">
                Stage: {wfStageFilter.name}
                <button type="button" onClick={() => setWfStageFilter(null)} className="hover:opacity-70" aria-label="Clear stage filter">✕</button>
              </span>
            )}
            <SelectFilter value={wfTypeFilter} onChange={v => { setWfTypeFilter(v as WorkflowEntityType | "all"); setWfStageFilter(null); }}
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
