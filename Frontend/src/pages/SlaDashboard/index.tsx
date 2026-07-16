import { useCallback, useEffect, useState } from "react";
import { Select, Spin, Alert, Tag, Tooltip } from "antd";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import type { WorkflowMISReport, WorkflowEntityType, MISPipeline } from "../../types/Workflow";

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
const fmtMoney = (n: number) => n ? "₹" + Math.round(n).toLocaleString("en-IN") : "₹0";
const statusColor = (pct: number) => pct >= 90 ? "#16a34a" : pct >= 60 ? "#f59e0b" : "#e03b3b";
const statusEmoji = (pct: number) => pct >= 90 ? "🟢" : pct >= 60 ? "🟡" : "🔴";

// ── Tier 2 panel (operational cards) ────────────────────────────
function Panel({ title, sub, children, tall }: { title: string; sub?: string; children: React.ReactNode; tall?: boolean }) {
  return (
    <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 16, boxShadow: "0 1px 6px rgba(0,0,0,0.04)", overflow: "hidden", height: tall ? "100%" : undefined }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6" }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#374151" }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

// ── Tier 3 panel (reports — lighter) ─────────────────────────────
function ReportPanel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#FAFAFA", border: "1px solid #EEF0F2", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: "1px solid #EEF0F2" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#4B5563" }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ padding: "14px 18px" }}>{children}</div>
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>{children}</div>;
}

function BarRow({ label, value, max, count, color = "#f37916" }: { label: string; value: number; max: number; count?: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span style={{ width: 150, fontSize: 12.5, color: "#374151", flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={label}>{label}</span>
      <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 4, height: 16, position: "relative" }}>
        <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color, height: "100%", borderRadius: 4, minWidth: value > 0 ? 4 : 0, transition: "width 0.4s" }} />
      </div>
      <span style={{ width: 90, fontSize: 12.5, fontWeight: 700, color: "#374151", textAlign: "right", flexShrink: 0 }}>
        {count !== undefined ? count : value}
      </span>
    </div>
  );
}

// ── Circular health gauge (hand-rolled SVG, no chart library) ───
function HealthGauge({ score, size = 148 }: { score: number; size?: number }) {
  const stroke = 13;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  const color = statusColor(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text x="50%" y="47%" textAnchor="middle" fontSize={size * 0.24} fontWeight={800} fill={color} fontFamily="inherit">{score}%</text>
      <text x="50%" y="65%" textAnchor="middle" fontSize={size * 0.075} fill="#9CA3AF">SLA HEALTH</text>
    </svg>
  );
}

// ── Trend line chart (hand-rolled SVG) ──────────────────────────
function TrendChart({ points }: { points: { date: string; netSla: number }[] }) {
  if (points.length < 2) {
    return <div style={{ fontSize: 12.5, color: "#9CA3AF", padding: "20px 0", textAlign: "center" }}>Not enough history yet — a daily snapshot is captured automatically each day this dashboard is opened. Check back in a few days.</div>;
  }
  const W = 600, H = 140, pad = 20;
  const xStep = (W - pad * 2) / (points.length - 1);
  const toY = (v: number) => H - pad - (v / 100) * (H - pad * 2);
  const linePts = points.map((p, i) => `${pad + i * xStep},${toY(p.netSla)}`).join(" ");
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1={pad} y1={toY(95)} x2={W - pad} y2={toY(95)} stroke="#D1D5DB" strokeDasharray="4 4" strokeWidth={1} />
      <polyline points={linePts} fill="none" stroke="#16a34a" strokeWidth={2.5} />
      {points.map((p, i) => (
        <circle key={p.date} cx={pad + i * xStep} cy={toY(p.netSla)} r={3.2} fill="#16a34a" />
      ))}
    </svg>
  );
}

function PipelineFunnel({ p }: { p: MISPipeline }) {
  return (
    <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
      {p.stages.map((s, i) => {
        const color = statusColor(s.withinSlaPct);
        return (
          <div key={s.name} style={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}>
            <div style={{ minWidth: 118, textAlign: "center", padding: "0 6px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={s.name}>{s.name}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{s.reached}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 3 }}>
                Avg {s.avgHours}h · <span style={{ color }}>{s.withinSlaPct}%</span>
                {s.pending > 0 && <><br /><span style={{ color: "#e03b3b" }}>{s.pending} waiting</span></>}
              </div>
            </div>
            {i < p.stages.length - 1 && <div style={{ width: 20, height: 2, background: "#D1D5DB", flexShrink: 0 }} />}
          </div>
        );
      })}
    </div>
  );
}

export default function SlaDashboard() {
  const navigate = useNavigate();
  const [report, setReport] = useState<WorkflowMISReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entityFilter, setEntityFilter] = useState<WorkflowEntityType | "all">("all");
  const [rangeFilter, setRangeFilter] = useState<"all" | "7" | "30" | "90">("all");

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

  if (loading && !report) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <Spin size="large" tip="Loading SLA MIS report…" />
    </div>
  );

  if (error) return <Alert type="error" message={error} style={{ margin: 24 }} />;
  if (!report) return null;

  const { health, alerts, bottlenecks, pipeline, byStage, byAssignee, departments, projectHealth, financial, contractorDelays, agingBuckets, drilldown, heatmap, recentActivity, trend } = report;

  const maxAging = Math.max(1, ...agingBuckets.map(b => b.count));
  const maxFinStage = Math.max(1, ...financial.byStage.map(s => s.amount));
  const maxDeptTotal = Math.max(1, ...departments.map(d => d.totalSla));
  const maxContractorBreach = Math.max(1, ...contractorDelays.map(c => c.slaBreach));

  const woPipeline = pipeline.filter(p => p.entityType === "WorkOrder");
  const brPipeline = pipeline.filter(p => p.entityType === "BillRequest");
  const otherPipeline = pipeline.filter(p => p.entityType !== "WorkOrder" && p.entityType !== "BillRequest");

  const depts = [...new Set(heatmap.map(h => h.dept))];
  const heatProjects = [...new Map(heatmap.map(h => [h.projectId, h.projectName])).entries()];

  return (
    <PageShell
      title="SLA MIS Dashboard"
      description="Where is the problem, who owns it, and what should you do next."
    >
      {/* ── Sticky executive bar ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(4px)",
        border: "1px solid #E5E7EB", borderRadius: 12, padding: "10px 20px", marginBottom: 20,
        display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase" }}>Health</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: statusColor(health.score) }}>{health.score}%</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase" }}>Open</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#374151" }}>{health.openWorkflows}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase" }}>Critical</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#991b1b" }}>{health.critical}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase" }}>Financial Risk</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#e03b3b" }}>{fmtMoney(financial.breachedAmount)}</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <Select value={entityFilter} onChange={setEntityFilter} size="small" style={{ width: 140 }}
            options={[{ label: "All Types", value: "all" }, { label: "Work Order", value: "WorkOrder" }, { label: "Bill Request", value: "BillRequest" }, { label: "Custom", value: "Custom" }]} />
          <Select value={rangeFilter} onChange={setRangeFilter} size="small" style={{ width: 130 }}
            options={[{ label: "All Time", value: "all" }, { label: "7 Days", value: "7" }, { label: "30 Days", value: "30" }, { label: "90 Days", value: "90" }]} />
        </div>
      </div>

      {/* ── TIER 1: SLA Health + Critical Alerts ── */}
      <div style={{
        background: "#FFF7F7", border: "2px solid #EF4444", borderRadius: 18, padding: 32, marginBottom: 28,
        boxShadow: "0 8px 24px rgba(239,68,68,0.08)", display: "grid", gridTemplateColumns: "auto 1fr", gap: 32, alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <HealthGauge score={health.score} />
          <div>
            <Tag color={health.status === "good" ? "green" : health.status === "warning" ? "gold" : "red"} style={{ fontWeight: 700, fontSize: 12, padding: "3px 10px" }}>
              {health.status === "good" ? "GOOD" : health.status === "warning" ? "NEEDS ATTENTION" : "CRITICAL"}
            </Tag>
            <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
              {[
                { label: "Open", value: health.openWorkflows },
                { label: "Overdue", value: health.overdue, color: "#e03b3b" },
                { label: "Critical (>48h)", value: health.critical, color: "#991b1b" },
                { label: "Done Today", value: health.completedToday, color: "#16a34a" },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: 10.5, color: "#9CA3AF", textTransform: "uppercase" }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color || "#374151" }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 8 }}>Target {health.target}% · Gap {Math.max(0, health.target - health.score)}%</div>
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#991b1b", marginBottom: 10 }}>🚨 Critical Alerts</div>
          {alerts.length === 0 ? (
            <div style={{ fontSize: 13, color: "#6B7280" }}>Nothing critical right now.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {alerts.map((a, i) => (
                <div key={i} style={{ fontSize: 13, color: "#7f1d1d", background: "#fff", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px" }}>{a}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── TIER 2, Row 1: Pipelines (WO | BR) ── */}
      <Grid2>
        <Panel title="Work Order Pipeline" sub="How many work orders reached each stage">
          {woPipeline.length ? woPipeline.map(p => <PipelineFunnel key={p.templateName} p={p} />) : <div style={{ color: "#9CA3AF", fontSize: 13 }}>No Work Order workflows yet.</div>}
        </Panel>
        <Panel title="Bill Request Pipeline" sub="How many bill requests reached each stage">
          {brPipeline.length ? brPipeline.map(p => <PipelineFunnel key={p.templateName} p={p} />) : <div style={{ color: "#9CA3AF", fontSize: 13 }}>No Bill Request workflows yet.</div>}
        </Panel>
      </Grid2>
      {otherPipeline.map(p => (
        <Panel key={p.templateName} title={p.templateName} sub={p.entityType}>
          <PipelineFunnel p={p} />
        </Panel>
      ))}

      {/* ── Row 2: Bottlenecks | Project Health ── */}
      <Grid2>
        <Panel title="Current Bottlenecks" sub="Where work is piling up right now" tall>
          {bottlenecks.length === 0 ? (
            <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "10px 0" }}>Nothing waiting.</div>
          ) : bottlenecks.map(b => {
            const stageRows = byStage.filter(s => s.stageName === b.stageName && s.entityType === b.entityType);
            const withinSla = stageRows[0]?.withinSlaPct ?? 0;
            return (
              <div key={`${b.entityType}:${b.stageName}`} style={{ border: "1px solid #F3F4F6", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>{b.stageName}</span>
                  <Tag color={b.entityType === "WorkOrder" ? "blue" : "purple"}>{b.entityType}</Tag>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#f37916", marginTop: 2 }}>{b.pendingCount} <span style={{ fontSize: 12, fontWeight: 500, color: "#9CA3AF" }}>waiting</span></div>
                <div style={{ background: "#F3F4F6", borderRadius: 4, height: 6, marginTop: 6 }}>
                  <div style={{ width: `${withinSla}%`, background: statusColor(withinSla), height: "100%", borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{withinSla}% historically within SLA at this stage</div>
              </div>
            );
          })}
        </Panel>
        <Panel title="Project Health" sub="On-time rate, delayed count, and ₹ blocked per project" tall>
          {projectHealth.length === 0 ? (
            <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "10px 0" }}>No project-linked workflows yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {projectHealth.map(p => (
                <Tooltip key={p.projectId} title={`${p.total} total workflow${p.total !== 1 ? "s" : ""} tracked for this project`}>
                  <div style={{ border: `1px solid ${statusColor(p.onTimePct)}33`, background: `${statusColor(p.onTimePct)}0c`, borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>{statusEmoji(p.onTimePct)} {p.projectName}</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: statusColor(p.onTimePct) }}>{p.onTimePct}%</span>
                    </div>
                    <div style={{ background: "#F3F4F6", borderRadius: 4, height: 6, marginTop: 6 }}>
                      <div style={{ width: `${p.onTimePct}%`, background: statusColor(p.onTimePct), height: "100%", borderRadius: 4 }} />
                    </div>
                    <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11.5, color: "#6B7280" }}>
                      <span>Open: <strong style={{ color: "#374151" }}>{p.pending}</strong></span>
                      <span>Delayed: <strong style={{ color: p.delayed > 0 ? "#e03b3b" : "#374151" }}>{p.delayed}</strong></span>
                      <span>Blocked: <strong style={{ color: p.blockedAmount > 0 ? "#e03b3b" : "#374151" }}>{fmtMoney(p.blockedAmount)}</strong></span>
                    </div>
                  </div>
                </Tooltip>
              ))}
            </div>
          )}
        </Panel>
      </Grid2>

      {/* ── Row 3: Financial Impact | Department Performance ── */}
      <Grid2>
        <Panel title="Financial Impact" tall>
          <div style={{ display: "flex", gap: 14, marginBottom: financial.byStage.length ? 16 : 0 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: "#9CA3AF", textTransform: "uppercase" }}>Pending (all open)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#374151" }}>{fmtMoney(financial.pendingAmount)}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10.5, color: "#9CA3AF", textTransform: "uppercase" }}>Breached (overdue)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#e03b3b" }}>{fmtMoney(financial.breachedAmount)}</div>
            </div>
          </div>
          {financial.byStage.map(s => (
            <div key={s.stageName} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ width: 150, fontSize: 12.5, color: "#374151", flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={s.stageName}>{s.stageName}</span>
              <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 4, height: 16 }}>
                <div style={{ width: `${Math.min(100, (s.amount / maxFinStage) * 100)}%`, background: "#2563eb", height: "100%", borderRadius: 4, minWidth: s.amount > 0 ? 4 : 0 }} />
              </div>
              <span style={{ width: 90, fontSize: 12.5, fontWeight: 700, color: "#374151", textAlign: "right", flexShrink: 0 }}>{fmtMoney(s.amount)}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Department Performance" tall>
          {departments.length === 0 ? (
            <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "10px 0" }}>No stages have started yet.</div>
          ) : departments.map(d => (
            <BarRow key={d.name} label={d.name} value={d.totalSla} max={maxDeptTotal} count={<span style={{ color: statusColor(d.completePct) }}>{d.completePct}%</span>} color={statusColor(d.completePct)} />
          ))}
        </Panel>
      </Grid2>

      {/* ── Row 4: Trend | Live Activity ── */}
      <Grid2>
        <Panel title="SLA Trend" sub="Net on-time % captured once per day" tall>
          <TrendChart points={trend} />
        </Panel>
        <Panel title="Live Activity" sub="Most recent stage completions and breaches" tall>
          {recentActivity.length === 0 ? (
            <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "10px 0" }}>No activity yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 220, overflowY: "auto" }}>
              {recentActivity.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: i < recentActivity.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                  <span style={{ fontSize: 11, color: "#9CA3AF", width: 70, flexShrink: 0 }}>{dayjs(e.time).format("h:mm A")}</span>
                  <span style={{ fontSize: 12.5, color: "#374151", flex: 1 }}>{e.text}</span>
                  <span>{e.type === "breach" ? "🔴" : e.type === "late" ? "🟡" : "✔️"}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </Grid2>

      {/* ── Heatmap: Project × Department ── */}
      {heatProjects.length > 0 && depts.length > 0 && (
        <Panel title="SLA Heatmap" sub="Compliance % by project and department">
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 12px", color: "#6B7280", fontSize: 11, textTransform: "uppercase" }}>Project</th>
                  {depts.map(d => <th key={d} style={{ padding: "6px 12px", color: "#6B7280", fontSize: 11, textTransform: "uppercase" }}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {heatProjects.map(([pid, pname]) => (
                  <tr key={pid} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600, color: "#374151" }}>{pname}</td>
                    {depts.map(d => {
                      const cell = heatmap.find(h => h.projectId === pid && h.dept === d);
                      return (
                        <td key={d} style={{ padding: "8px 12px", textAlign: "center" }}>
                          {cell ? (
                            <Tooltip title={`${cell.compliancePct}% compliant`}>
                              <span>{statusEmoji(cell.compliancePct)}</span>
                            </Tooltip>
                          ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <div style={{ height: 8 }} />

      {/* ── TIER 3: SLA By User + Contractor Delays + Aging ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 28, marginBottom: 16 }}>
        <ReportPanel title="SLA By User" sub="Only relevant for managers — everyone assigned a stage, ever">
          {byAssignee.length === 0 ? (
            <div style={{ color: "#9CA3AF", fontSize: 13 }}>No stages have started yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {["User", "Total SLA", "SLA Done", "SLA Breach", "SLA Overdue Time", "SLA Avg Time"].map((h, i) => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: i === 0 ? "left" : "right", fontSize: 10.5, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byAssignee.map(a => (
                    <tr key={a.key} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{a.label}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#374151" }}>{a.totalSla}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{a.slaComplete}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: a.slaBreach > 0 ? "#e03b3b" : "#9CA3AF", fontWeight: 600 }}>{a.slaBreach}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: a.overdueMinutes > 0 ? "#e03b3b" : "#9CA3AF", fontFamily: "monospace" }}>{fmtMinutes(a.overdueMinutes)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#6B7280", fontFamily: "monospace" }}>{fmtMinutes(a.avgBreachMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportPanel>
        <ReportPanel title="Contractor Delays" sub="Bills/work currently open, by contractor">
          {contractorDelays.length === 0 ? (
            <div style={{ color: "#9CA3AF", fontSize: 13 }}>No contractor-linked workflows yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {contractorDelays.map(c => (
                <div key={c.vendorName} style={{ border: "1px solid #EEF0F2", borderRadius: 8, padding: "8px 12px", background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 600, fontSize: 12.5, color: "#374151" }}>{c.vendorName}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: c.slaBreach > 0 ? "#e03b3b" : "#16a34a" }}>{c.slaBreach} delay{c.slaBreach !== 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ background: "#F3F4F6", borderRadius: 4, height: 6, marginTop: 6 }}>
                    <div style={{ width: `${Math.min(100, (c.slaBreach / maxContractorBreach) * 100)}%`, background: "#e03b3b", height: "100%", borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 5 }}>
                    Avg delay {fmtMinutes(c.avgBreachMinutes)} · Pending {fmtMoney(c.pendingAmount)} · {c.projectCount} project{c.projectCount !== 1 ? "s" : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ReportPanel>
      </div>

      <ReportPanel title="SLA Aging" sub="Currently overdue and still open">
        {agingBuckets.every(b => b.count === 0) ? (
          <div style={{ color: "#9CA3AF", fontSize: 13 }}>Nothing currently overdue.</div>
        ) : agingBuckets.map(b => (
          <BarRow key={b.label} label={b.label} value={b.count} max={maxAging} color="#e03b3b" />
        ))}
      </ReportPanel>

      <div style={{ height: 8 }} />

      {/* ── The one detailed action table ── */}
      <Panel title={`Ongoing Workflows (${drilldown.length})`} sub="Every open workflow — click a Work Order to jump to it">
        {drilldown.length === 0 ? (
          <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No ongoing workflows match this filter.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Entity", "Type", "Current Stage", "Assigned To", "SLA", "Status"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drilldown.map((d, i) => {
                  const remainingMs = d.dueAt ? new Date(d.dueAt).getTime() - Date.now() : null;
                  return (
                    <tr key={d.instanceId} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                      <td style={{ padding: "9px 12px" }}>
                        {d.entityType === "WorkOrder" ? (
                          <span style={{ color: "#FF7A00", fontWeight: 600, cursor: "pointer" }} onClick={() => navigate(`/work-items/${d.entityId}`)}>{d.entityLabel}</span>
                        ) : d.entityLabel}
                      </td>
                      <td style={{ padding: "9px 12px" }}><Tag color={d.entityType === "WorkOrder" ? "blue" : "purple"}>{d.entityType}</Tag></td>
                      <td style={{ padding: "9px 12px" }}>{d.currentStage}</td>
                      <td style={{ padding: "9px 12px" }}>{d.assignedTo}</td>
                      <td style={{ padding: "9px 12px", fontFamily: "monospace", fontSize: 12 }}>
                        {d.breached ? <span style={{ color: "#e03b3b" }}>Overdue {fmtMinutes(d.overdueMinutes)}</span>
                          : remainingMs !== null ? <span style={{ color: "#16a34a" }}>{fmtMinutes(Math.round(remainingMs / 60000))} left</span>
                          : "—"}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "right" }}>
                        {d.breached ? <Tag color="red">🔴 Overdue</Tag> : <Tag color="green">🟢 On Track</Tag>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
