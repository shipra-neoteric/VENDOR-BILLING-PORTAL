import { useState } from "react";
import { Skeleton, Alert, Tag, Switch, Tooltip } from "antd";
import { useDashboardData } from "../../features/dashboard/hooks/useDashboardData";
import { SummaryCards }     from "../../features/dashboard/components/SummaryCards";
import { BillingChart }     from "../../features/dashboard/components/BillingChart";
import { calcKPIs }         from "../../features/dashboard/utils";
import { Panel, Grid2, KpiCard, KpiRow, TrendLine, Donut, Gauge, DrillDownDrawer, BriefBanner, fmtMoney, statusColor } from "../../features/dashboard/components/MiniCharts";
import type { ComparisonMode } from "../../features/dashboard/components/MiniCharts";
import type { DPRFinancial, DPRProjectPerformance } from "../../types/DPR";

export default function FinancialView({ financial, comparisonMode, projectPerformance }: { financial: DPRFinancial; comparisonMode: ComparisonMode; projectPerformance: DPRProjectPerformance[] }) {
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data, isLoading, error } = useDashboardData(includeArchived);
  const legacyKpis = data ? calcKPIs(data.workOrders, data.bills) : null;
  const [drill, setDrill] = useState<{ title: string; key: keyof typeof details } | null>(null);

  const { kpis, comparisons, details, paymentBreakdown, dailyReleaseTrend, billsTrend, aging, approvalTimes, topDelayedContractors, topDelayedProjects, advancePaymentsList, alerts, healthScore, briefs } = financial;
  const open = (title: string, key: keyof typeof details) => setDrill({ title, key });
  const cmp = comparisonMode === "none" ? "yesterday" : comparisonMode;

  const maxAgingCount = Math.max(1, ...aging.buckets.map(b => b.count));
  const maxDelayDays = Math.max(1, ...topDelayedContractors.map(c => c.daysWaiting));
  const heatProjects = [...new Map(aging.heatmap.map(h => [h.projectId, { name: h.projectName, location: h.projectLocation }])).entries()];
  const heatBuckets = aging.buckets.map(b => b.label);
  const topProjectsByRelease = [...projectPerformance].sort((a, b) => b.releasedAmount - a.releasedAmount).slice(0, 5);

  return (
    <div>
      <BriefBanner icon="💰" title="Today's Financial Highlights" briefs={briefs} />

      {/* ── Health + Alerts ── */}
      <div style={{ background: "#FFF7F7", border: "2px solid #EF4444", borderRadius: 18, padding: 28, marginBottom: 24, display: "grid", gridTemplateColumns: "auto 1fr", gap: 28, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Gauge score={healthScore.score} size={130} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Payment Health</div>
            <div style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 2 }}>% of bills paid within 15 days of raising</div>
            <Tag color={healthScore.status === "good" ? "green" : healthScore.status === "warning" ? "gold" : "red"} style={{ marginTop: 8, fontWeight: 700 }}>
              {healthScore.status.toUpperCase()}
            </Tag>
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

      {/* ── Financial KPIs ── */}
      <KpiRow>
        <KpiCard icon="💰" label="Released" value={fmtMoney(kpis.amountReleasedToday)} color="#16a34a"
          change={comparisons.amountReleased[cmp]} comparisonMode={comparisonMode} onClick={() => open("Amount Released", "amountReleasedToday")} />
        <KpiCard icon="🧾" label="Bills Raised" value={fmtMoney(kpis.billsRaisedValueToday)} color="#2563eb"
          change={comparisons.billsRaisedValue[cmp]} comparisonMode={comparisonMode} onClick={() => open("Bills Raised", "billsRaisedValueToday")} />
        <KpiCard icon="✅" label="Approved Value" value={fmtMoney(kpis.approvedValueToday)} color="#7c3aed"
          change={comparisons.approvedValue[cmp]} comparisonMode={comparisonMode} onClick={() => open("Approved Value", "approvedValueToday")} />
        <KpiCard icon="⏳" label="Pending Value" value={fmtMoney(kpis.pendingValueToday)} color="#d97706"
          onClick={() => open("Pending Value", "pendingValueToday")} />
        <KpiCard icon="🔴" label="Outstanding Liability" value={fmtMoney(kpis.outstandingLiability)} color="#e03b3b"
          onClick={() => open("Outstanding Liability", "outstandingLiability")} />
        <KpiCard icon="💵" label="Advance Amount" value={fmtMoney(kpis.advanceAmountToday)} color="#0891b2"
          change={comparisons.advanceAmount[cmp]} comparisonMode={comparisonMode} onClick={() => open("Advance Amount", "advanceAmountToday")} />
      </KpiRow>

      {/* ── Contract-value summary cards ── */}
      <div style={{ marginBottom: 8, display: "flex", justifyContent: "flex-end" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--nx-text-2)" }}>
          <Switch size="small" checked={includeArchived} onChange={setIncludeArchived} />
          Include archived bills
        </label>
      </div>
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : error || !legacyKpis ? (
        <Alert type="error" showIcon message={(error as Error)?.message ?? "Failed to load billing data"} style={{ borderRadius: 10, marginBottom: 24 }} />
      ) : (
        <SummaryCards {...legacyKpis} />
      )}

      {/* ── Payment breakdown + trend ── */}
      <Grid2>
        <Panel title="Payment Breakdown" sub="Cumulative, across paid bills">
          {[
            { label: "Released", value: paymentBreakdown.released, color: "#16a34a" },
            { label: "Retention Held", value: paymentBreakdown.retentionHeld, color: "#7c3aed" },
            { label: "Advance Recovered", value: paymentBreakdown.advanceRecovered, color: "#d97706" },
            { label: "TDS", value: paymentBreakdown.tds, color: "#e03b3b" },
            { label: "Net Payment", value: paymentBreakdown.net, color: "#2563eb" },
          ].map(row => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ width: 130, fontSize: 12.5, color: "#374151", flexShrink: 0 }}>{row.label}</span>
              <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 4, height: 16 }}>
                <div style={{ width: `${Math.min(100, (row.value / Math.max(1, paymentBreakdown.released)) * 100)}%`, background: row.color, height: "100%", borderRadius: 4, minWidth: row.value > 0 ? 4 : 0 }} />
              </div>
              <span style={{ width: 100, fontSize: 12.5, fontWeight: 700, color: "#374151", textAlign: "right", flexShrink: 0 }}>{fmtMoney(row.value)}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Daily Amount Released" sub="Last 7 days">
          <TrendLine points={dailyReleaseTrend.map(t => ({ date: t.date, value: t.amount }))} color="#16a34a" formatValue={fmtMoney} />
        </Panel>
      </Grid2>

      <Grid2>
        <Panel title="Bills Raised — 30 Days" sub="Count of bills raised per day">
          <TrendLine points={billsTrend.map(t => ({ date: t.date, value: t.raised }))} color="#2563eb" />
        </Panel>
        <Panel title="Bills Approved vs Paid — 30 Days" sub="Blue = approved, Green = paid">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <TrendLine points={billsTrend.map(t => ({ date: t.date, value: t.approved }))} color="#7c3aed" height={90} />
            <TrendLine points={billsTrend.map(t => ({ date: t.date, value: t.paid }))} color="#16a34a" height={90} />
          </div>
        </Panel>
      </Grid2>

      {/* ── Top projects by amount released ── */}
      <Panel title="Top Projects" sub="By amount released">
        {topProjectsByRelease.length === 0 ? (
          <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "10px 0" }}>No project activity yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topProjectsByRelease.map(p => (
              <div key={p.projectId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #F3F4F6" }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#374151" }}>{p.projectName}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                    {p.projectLocation && `${p.projectLocation} · `}{fmtMoney(p.releasedAmount)} released
                  </div>
                </div>
                <Tag color={p.progressPct >= 90 ? "green" : p.progressPct >= 60 ? "gold" : "red"} style={{ color: statusColor(p.progressPct) }}>{p.progressPct}%</Tag>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div style={{ height: 4 }} />

      {/* ── Aging report ── */}
      <Panel title="Aging Report" sub="Days since bill raised, not yet paid">
        <Grid2>
          <div>
            <Donut segments={aging.buckets.map((b, i) => ({ label: b.label, value: b.count, color: ["#16a34a", "#f59e0b", "#f97316", "#e03b3b"][i] }))} />
            {aging.oldestPending && (
              <div style={{ marginTop: 16, background: "#FFF7F7", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase" }}>Oldest Pending</div>
                <div style={{ fontWeight: 700, color: "#374151", fontSize: 13 }}>{aging.oldestPending.contractor}</div>
                <div style={{ fontSize: 12, color: "#e03b3b", fontWeight: 700 }}>{fmtMoney(aging.oldestPending.amount)} · {aging.oldestPending.daysPending} days</div>
              </div>
            )}
          </div>
          <div>
            {aging.buckets.map((b, i) => (
              <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ width: 90, fontSize: 12.5, color: "#374151" }}>{b.label}</span>
                <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 4, height: 16 }}>
                  <div style={{ width: `${Math.min(100, (b.count / maxAgingCount) * 100)}%`, background: ["#16a34a", "#f59e0b", "#f97316", "#e03b3b"][i], height: "100%", borderRadius: 4, minWidth: b.count > 0 ? 4 : 0 }} />
                </div>
                <span style={{ width: 110, fontSize: 11.5, color: "#6B7280", textAlign: "right" }}>{b.count} · {fmtMoney(b.amount)}</span>
              </div>
            ))}
          </div>
        </Grid2>

        {heatProjects.length > 0 && (
          <div style={{ marginTop: 16, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 12px", color: "#6B7280", fontSize: 11, textTransform: "uppercase" }}>Project</th>
                  {heatBuckets.map(b => <th key={b} style={{ padding: "6px 12px", color: "#6B7280", fontSize: 11, textTransform: "uppercase" }}>{b}</th>)}
                </tr>
              </thead>
              <tbody>
                {heatProjects.map(([pid, proj]) => (
                  <tr key={pid} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "8px 12px" }}>
                      <div style={{ fontWeight: 600, color: "#374151" }}>{proj.name}</div>
                      {proj.location && <div style={{ fontSize: 10.5, color: "#9CA3AF" }}>{proj.location}</div>}
                    </td>
                    {heatBuckets.map(b => {
                      const cell = aging.heatmap.find(h => h.projectId === pid && h.bucket === b);
                      return (
                        <td key={b} style={{ padding: "8px 12px", textAlign: "center" }}>
                          {cell ? <Tooltip title={`${cell.count} bill(s)`}>{cell.count >= 3 ? "🔴" : cell.count >= 1 ? "🟡" : "—"}</Tooltip> : <span style={{ color: "#D1D5DB" }}>—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {aging.table.length > 0 && (
          <div style={{ marginTop: 16, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Contractor", "Project", "Bill No", "Amount", "Days Pending", "Status"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aging.table.slice(0, 15).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "8px 12px" }}>{r.contractor}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <div>{r.project}</div>
                      {r.projectLocation && <div style={{ fontSize: 10.5, color: "#9CA3AF" }}>{r.projectLocation}</div>}
                    </td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{r.billNo}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{fmtMoney(r.amount)}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <Tag color={r.daysPending >= 16 ? "red" : r.daysPending >= 8 ? "orange" : r.daysPending >= 4 ? "gold" : "green"}>{r.daysPending} days</Tag>
                    </td>
                    <td style={{ padding: "8px 12px" }}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div style={{ height: 4 }} />

      {/* ── Approval times + Top delayed ── */}
      <Grid2>
        <Panel title="Average Approval Cycle Times" tall>
          {[
            { label: "Verification", days: approvalTimes.avgVerificationDays },
            { label: "Approval", days: approvalTimes.avgApprovalDays },
            { label: "Payment Release", days: approvalTimes.avgPaymentDays },
          ].map(row => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F3F4F6" }}>
              <span style={{ fontSize: 13, color: "#374151" }}>{row.label}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: statusColor(row.days <= 3 ? 100 : row.days <= 7 ? 75 : 40) }}>{row.days}d</span>
            </div>
          ))}
        </Panel>
        <Panel title="Top Delayed Contractors & Projects" tall>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", marginBottom: 8 }}>Contractors</div>
          {topDelayedContractors.length === 0 ? (
            <div style={{ color: "#9CA3AF", fontSize: 12.5, marginBottom: 12 }}>None currently delayed.</div>
          ) : topDelayedContractors.map(c => (
            <div key={c.vendorName} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ width: 130, fontSize: 12, color: "#374151", flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.vendorName}</span>
              <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 4, height: 12 }}>
                <div style={{ width: `${Math.min(100, (c.daysWaiting / maxDelayDays) * 100)}%`, background: "#e03b3b", height: "100%", borderRadius: 4 }} />
              </div>
              <span style={{ width: 110, fontSize: 11, color: "#6B7280", textAlign: "right" }}>{c.daysWaiting}d · {fmtMoney(c.pendingAmount)}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", margin: "14px 0 8px" }}>Projects</div>
          {topDelayedProjects.length === 0 ? (
            <div style={{ color: "#9CA3AF", fontSize: 12.5 }}>None currently delayed.</div>
          ) : topDelayedProjects.map(p => (
            <div key={p.projectId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0" }}>
              <span style={{ color: "#374151" }}>{p.projectName}{p.projectLocation && ` (${p.projectLocation})`}</span>
              <span style={{ color: "#e03b3b", fontWeight: 600 }}>{fmtMoney(p.pendingAmount)} · avg {p.avgDelayDays}d</span>
            </div>
          ))}
        </Panel>
      </Grid2>

      {/* ── Advance payments ── */}
      <Panel title="Advance Payments" sub="Most recent 15">
        {advancePaymentsList.length === 0 ? (
          <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "10px 0" }}>No advance payments recorded.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr>
                  {["Contractor", "Project", "Amount", "Reason", "Adjusted", "Balance"].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10.5, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {advancePaymentsList.map((a, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 600 }}>{a.vendorName}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <div>{a.projectName}</div>
                      {a.projectLocation && <div style={{ fontSize: 10.5, color: "#9CA3AF" }}>{a.projectLocation}</div>}
                    </td>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{fmtMoney(a.amount)}</td>
                    <td style={{ padding: "8px 10px" }}>{a.reason}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{fmtMoney(a.adjusted)}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace", color: a.balance > 0 ? "#e03b3b" : "#16a34a" }}>{fmtMoney(a.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div style={{ height: 20 }} />

      {/* ── Monthly billing trend ── */}
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : error || !data ? (
        <Alert type="error" showIcon message={(error as Error)?.message ?? "Failed to load billing data"} style={{ borderRadius: 10 }} />
      ) : (
        <BillingChart bills={data.bills} />
      )}

      <DrillDownDrawer
        open={!!drill} onClose={() => setDrill(null)}
        title={drill?.title ?? ""} rows={drill ? details[drill.key] : []}
      />
    </div>
  );
}
