import { Skeleton, Alert, Table, Tag } from "antd";
import { useCategories } from "../../hooks/useCategories";
import { useDashboardData } from "../../features/dashboard/hooks/useDashboardData";
import { SummaryCards }     from "../../features/dashboard/components/SummaryCards";
import { BillingChart }     from "../../features/dashboard/components/BillingChart";
import { CategoryProgress } from "../../features/dashboard/components/CategoryProgress";
import { RecentBillsTable } from "../../features/dashboard/components/RecentBillsTable";
import { calcKPIs, fmtCr }  from "../../features/dashboard/utils";

// ── Overall progress bar ─────────────────────────────────────────
function ProgressBar({ certifiedAmt, pendingAmt, totalContractValueWithGST, remaining }: {
  certifiedAmt: number; pendingAmt: number; totalContractValueWithGST: number; remaining: number;
}) {
  return (
    <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "20px 24px", marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--nx-text-3)", marginBottom: 12 }}>Overall Billing Progress</div>
      <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: "var(--nx-fill)", marginBottom: 12 }}>
        {totalContractValueWithGST > 0 && (
          <>
            <div style={{ width: `${(certifiedAmt / totalContractValueWithGST) * 100}%`, background: "#16a34a", transition: "width 0.6s ease" }} />
            <div style={{ width: `${(pendingAmt  / totalContractValueWithGST) * 100}%`, background: "#f59e0b", transition: "width 0.6s ease" }} />
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {[
          { label: "Certified",        color: "#16a34a", value: fmtCr(certifiedAmt) },
          { label: "Pending Approval", color: "#f59e0b", value: fmtCr(pendingAmt) },
          { label: "Remaining",        color: "#D1D5DB", value: fmtCr(remaining) },
        ].map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, display: "inline-block" }} />
            <span style={{ fontSize: 12, color: "var(--nx-text-2)" }}>{s.label}:</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--nx-text-3)", fontFamily: "monospace" }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Skeleton while loading ────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(178px, 1fr))", gap: 16, marginBottom: 24 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "18px 20px" }}>
            <Skeleton.Input active style={{ width: 32, height: 32, borderRadius: "50%", marginBottom: 12, display: "block" }} />
            <Skeleton.Input active size="small" style={{ width: "60%", height: 12, marginBottom: 8, display: "block" }} />
            <Skeleton.Input active style={{ width: "80%", height: 20, display: "block" }} />
          </div>
        ))}
      </div>
      <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
        <Skeleton.Input active style={{ width: 220, height: 16, marginBottom: 16, display: "block" }} />
        <Skeleton.Input active style={{ width: "100%", height: 14, borderRadius: 7, display: "block" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {[0, 1].map(i => (
          <div key={i} style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "20px 24px" }}>
            <Skeleton active paragraph={{ rows: 5 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────
export default function Dashboard() {
  const { categories } = useCategories();
  const { data, isLoading, error } = useDashboardData();

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <Alert
        type="error"
        showIcon
        message={(error as Error)?.message ?? "Failed to load dashboard data"}
        style={{ margin: 24, borderRadius: 10 }}
      />
    );
  }

  const { workOrders, bills, projects } = data;
  const kpis = calcKPIs(workOrders, bills);

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "var(--nx-text)" }}>Project Cost Center</h1>
        <p style={{ color: "var(--nx-text-2)", marginTop: 4, marginBottom: 0 }}>
          Overview of contract value, bills, approvals and payments.
        </p>
      </div>

      {/* KPI cards */}
      <SummaryCards {...kpis} />

      {/* Overall progress bar */}
      <ProgressBar {...kpis} />

      {/* Monthly trend chart */}
      <BillingChart bills={bills} />

      {/* Category progress + Projects table */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--nx-text-3)", marginBottom: 16 }}>Progress by Category</div>
          <CategoryProgress categories={categories} workOrders={workOrders} bills={bills} />
        </div>

        <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--nx-text-3)", marginBottom: 16 }}>Projects</div>
          <Table
            pagination={false}
            dataSource={projects}
            rowKey="_id"
            size="small"
            locale={{ emptyText: "No projects found" }}
            columns={[
              { title: "Project",  dataIndex: "name",     ellipsis: true },
              { title: "Location", dataIndex: "location", ellipsis: true },
              {
                title: "Status", dataIndex: "status",
                render: (s: string) => (
                  <Tag color={s === "active" ? "green" : s === "completed" ? "blue" : "orange"}>
                    {(s ?? "").toUpperCase()}
                  </Tag>
                ),
              },
            ]}
          />
        </div>
      </div>

      {/* Recent bills */}
      <div style={{ background: "var(--nx-white)", border: "1px solid var(--nx-border)", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--nx-text-3)", marginBottom: 16 }}>Recent Bills</div>
        <RecentBillsTable bills={bills} />
      </div>
    </div>
  );
}
