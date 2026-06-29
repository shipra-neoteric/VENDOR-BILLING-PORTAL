import { useEffect, useState } from "react";
import { Tag, Table, Spin, Alert } from "antd";
import apiClient from "../../services/apiClient";
import { useCategories } from "../../hooks/useCategories";
import dayjs from "dayjs";

const BILL_STATUS_COLOR: Record<string, string> = {
  draft: "#9CA3AF", submitted: "#f59e0b", verified: "#3b82f6",
  approved: "#16a34a", paid: "#0d9488", rejected: "#ef4444",
};

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtCr = (n: number) =>
  n >= 10_000_000
    ? `₹${(n / 10_000_000).toFixed(2)} Cr`
    : n >= 1_00_000
    ? `₹${(n / 1_00_000).toFixed(2)} L`
    : fmt(n);

interface WORow { _id: string; contractValue?: number; category?: string; status?: string; projectName?: string; }
interface BillRow { _id: string; billNo?: string; vendorName?: string; amount?: number; status?: string; billDate?: string; workOrderId?: string; }
interface ProjectRow { _id: string; name?: string; location?: string; status?: string; contractValue?: number; }

export default function Dashboard() {
  const { categories } = useCategories();
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");
  const [workOrders, setWorkOrders] = useState<WORow[]>([]);
  const [bills, setBills]           = useState<BillRow[]>([]);
  const [projects, setProjects]     = useState<ProjectRow[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [woRes, billRes, projRes] = await Promise.all([
          apiClient.get("/work-orders"),
          apiClient.get("/bills"),
          apiClient.get("/projects"),
        ]);
        setWorkOrders(woRes.data.workOrders ?? woRes.data ?? []);
        setBills(billRes.data.bills ?? billRes.data ?? []);
        setProjects(projRes.data.projects ?? projRes.data ?? []);
      } catch (e: unknown) {
        setError((e as Error).message ?? "Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Aggregate stats ──────────────────────────────────────────
  const totalContractValue = workOrders.reduce((s, wo) => s + (wo.contractValue ?? 0), 0);
  const certifiedAmt  = bills.filter(b => b.status === "approved" || b.status === "paid").reduce((s, b) => s + (b.amount ?? 0), 0);
  const pendingAmt    = bills.filter(b => b.status === "submitted" || b.status === "verified").reduce((s, b) => s + (b.amount ?? 0), 0);
  const paidAmt       = bills.filter(b => b.status === "paid").reduce((s, b) => s + (b.amount ?? 0), 0);
  const pendingCount  = bills.filter(b => b.status === "submitted" || b.status === "verified").length;
  const remaining     = Math.max(0, totalContractValue - certifiedAmt - pendingAmt);

  // ── Category breakdown ───────────────────────────────────────
  // Build bill map: workOrderId → total billed amount
  const billsByWO: Record<string, number> = {};
  for (const b of bills) {
    if (!b.workOrderId) continue;
    billsByWO[b.workOrderId] = (billsByWO[b.workOrderId] ?? 0) + (b.amount ?? 0);
  }

  const categoryStats = categories.map(cat => {
    const catWOs = workOrders.filter(wo => wo.category === cat.name);
    const catContractVal = catWOs.reduce((s, wo) => s + (wo.contractValue ?? 0), 0);
    const catBilled = catWOs.reduce((s, wo) => s + (billsByWO[wo._id] ?? 0), 0);
    const pct = catContractVal > 0 ? Math.min(100, (catBilled / catContractVal) * 100) : 0;
    return { name: cat.name, color: cat.color, contractVal: catContractVal, billed: catBilled, pct, count: catWOs.length };
  }).filter(c => c.count > 0);

  const recentBills = [...bills]
    .sort((a, b) => new Date(b.billDate ?? 0).getTime() - new Date(a.billDate ?? 0).getTime())
    .slice(0, 8);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
        <Spin size="large" tip="Loading dashboard…" />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={error} style={{ margin: 24 }} />;
  }

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#111827" }}>Vendor Billing Dashboard</h1>
        <p style={{ color: "#6B7280", marginTop: 4, marginBottom: 0 }}>Overview of contract value, bills, approvals and payments.</p>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Contract Value", value: fmtCr(totalContractValue), color: "#FF7A00", icon: "🏗️" },
          { label: "Certified Amount", value: fmtCr(certifiedAmt), color: "#16a34a", icon: "✅" },
          { label: "Pending Approval", value: `${pendingCount} bills`, sub: fmtCr(pendingAmt), color: "#d97706", icon: "⏳" },
          { label: "Amount Paid", value: fmtCr(paidAmt), color: "#0d9488", icon: "💳" },
          { label: "Remaining Balance", value: fmtCr(remaining), color: "#6B7280", icon: "📊" },
        ].map((kpi, i) => (
          <div key={i} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{kpi.icon}</div>
            <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500, marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: kpi.color, fontFamily: "monospace" }}>{kpi.value}</div>
            {kpi.sub && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Overall Progress Bar ────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px 24px", marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#374151", marginBottom: 12 }}>Overall Billing Progress</div>
        <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: "#F3F4F6", marginBottom: 12 }}>
          {totalContractValue > 0 && <>
            <div style={{ width: `${(certifiedAmt / totalContractValue) * 100}%`, background: "#16a34a" }} title={`Certified: ${fmt(certifiedAmt)}`} />
            <div style={{ width: `${(pendingAmt / totalContractValue) * 100}%`, background: "#f59e0b" }} title={`Pending: ${fmt(pendingAmt)}`} />
          </>}
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {[
            { label: "Certified", color: "#16a34a", value: fmtCr(certifiedAmt) },
            { label: "Pending Approval", color: "#f59e0b", value: fmtCr(pendingAmt) },
            { label: "Remaining", color: "#D1D5DB", value: fmtCr(remaining) },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, display: "inline-block" }} />
              <span style={{ fontSize: 12, color: "#6B7280" }}>{s.label}:</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", fontFamily: "monospace" }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* ── Category Progress ────────────────────────────── */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#374151", marginBottom: 16 }}>Progress by Category</div>
          {categoryStats.length === 0 ? (
            <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: "24px 0" }}>No category data yet. Assign categories to work orders.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {categoryStats.map(cat => (
                <div key={cat.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: cat.color, display: "inline-block" }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{cat.name}</span>
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>({cat.count} WOs)</span>
                    </div>
                    <span style={{ fontSize: 12, fontFamily: "monospace", color: cat.color, fontWeight: 600 }}>{cat.pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "#F3F4F6", overflow: "hidden" }}>
                    <div style={{ width: `${cat.pct}%`, height: "100%", background: cat.color, borderRadius: 4, transition: "width 0.5s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>Billed: {fmtCr(cat.billed)}</span>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>Contract: {fmtCr(cat.contractVal)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Projects Table ───────────────────────────────── */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#374151", marginBottom: 16 }}>Projects</div>
          <Table
            pagination={false}
            dataSource={projects}
            rowKey="_id"
            size="small"
            locale={{ emptyText: "No projects found" }}
            columns={[
              { title: "Project", dataIndex: "name", ellipsis: true },
              { title: "Location", dataIndex: "location", ellipsis: true },
              {
                title: "Status",
                dataIndex: "status",
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

      {/* ── Recent Bills ────────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#374151", marginBottom: 16 }}>Recent Bills</div>
        <Table
          pagination={false}
          dataSource={recentBills}
          rowKey="_id"
          size="small"
          locale={{ emptyText: "No bills raised yet" }}
          columns={[
            { title: "Bill No", dataIndex: "billNo", render: (v: string) => <span style={{ fontFamily: "monospace", color: "#FF7A00", fontWeight: 600 }}>{v}</span> },
            { title: "Vendor", dataIndex: "vendorName", ellipsis: true },
            { title: "Amount", dataIndex: "amount", render: (v: number) => <span style={{ fontFamily: "monospace" }}>{fmt(v ?? 0)}</span> },
            {
              title: "Date", dataIndex: "billDate",
              render: (v: string) => v ? dayjs(v).format("DD MMM YYYY") : "—",
            },
            {
              title: "Status", dataIndex: "status",
              render: (s: string) => (
                <Tag style={{ color: BILL_STATUS_COLOR[s] ?? "#374151", background: "#F9FAFB", border: `1px solid ${BILL_STATUS_COLOR[s] ?? "#E5E7EB"}`, fontWeight: 600, fontSize: 11 }}>
                  {(s ?? "").toUpperCase()}
                </Tag>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
