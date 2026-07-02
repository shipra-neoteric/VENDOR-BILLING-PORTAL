import { useEffect, useState, useMemo, useCallback } from "react";
import { Button, Tag, Select, Row, Col, Empty, Spin, Alert, Descriptions } from "antd";
import { ArrowLeftOutlined, BookOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";

// ── Types ─────────────────────────────────────────────────────
type BillStatus = "draft" | "submitted" | "verified" | "approved" | "rejected" | "paid";

interface WO {
  _id: string; workOrderNo: string; projectId?: string; projectName?: string;
  vendorCode?: string; vendorName?: string; contractValue?: number;
  issueDate?: string; status?: string; scopeOfWork?: string; category?: string;
}
interface Bill {
  _id: string; billNo: string; workOrderId?: string; workOrderNo?: string;
  projectName?: string; vendorCode?: string; vendorName?: string;
  billDate: string; billRefNo?: string; amount: number;
  gstPercent: number; tdsPercent: number;
  remarks?: string; status: BillStatus;
}
interface Project { _id: string; code?: string; name?: string; }
interface Contractor { _id: string; vendorCode: string; companyName?: string; }

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const pctStr = (n: number, d: number) => d ? ((n / d) * 100).toFixed(1) + "%" : "0%";

function calcBill(b: Bill) {
  const gst   = (b.amount * (b.gstPercent ?? 18)) / 100;
  const gross = b.amount + gst;
  const tds   = (gross * (b.tdsPercent ?? 1)) / 100;
  const net   = gross - tds;
  return { gst, gross, tds, net };
}

const STATUS_CFG: Record<BillStatus, { color: string; label: string }> = {
  draft:     { color: "default", label: "Draft" },
  submitted: { color: "blue",    label: "Submitted" },
  verified:  { color: "cyan",    label: "Verified" },
  approved:  { color: "green",   label: "Approved" },
  rejected:  { color: "red",     label: "Rejected" },
  paid:      { color: "purple",  label: "Paid" },
};

const CATEGORY_COLOR: Record<string, string> = {
  "Civil / RCC": "#2563eb", Finishing: "#7c3aed", MEP: "#16a85a",
  Interior: "#f37916", "External Works": "#0d9488", Hospitality: "#e03b3b",
};

// ── Stat card ─────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "#1a1f2e" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: "var(--nx-white)", border: "1px solid #e4e7ee", borderRadius: 12, padding: "16px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", height: "100%" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ba3b8", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#5a6278", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Tape bar ──────────────────────────────────────────────────
function TapeBar({ contract, certified, pending }: { contract: number; certified: number; pending: number }) {
  const certPct = contract ? Math.min((certified / contract) * 100, 100) : 0;
  const pendPct = contract ? Math.min((pending   / contract) * 100, 100 - certPct) : 0;
  const remaining = contract - certified - pending;
  return (
    <div style={{ background: "var(--nx-white)", border: "1px solid #e4e7ee", borderRadius: 12, padding: "16px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ba3b8", marginBottom: 6, fontFamily: "monospace" }}>
        <span>₹0</span>
        <span style={{ color: "#16a85a" }}>{fmt(certified)} certified</span>
        {pending > 0 && <span style={{ color: "#f37916" }}>{fmt(pending)} pending</span>}
        <span>{fmt(contract)} contract</span>
      </div>
      <div style={{ height: 10, background: "#edf0f7", borderRadius: 5, overflow: "hidden", display: "flex" }}>
        <div style={{ width: `${certPct}%`, background: "#16a85a", transition: "width 0.4s" }} />
        <div style={{ width: `${pendPct}%`, background: "#f37916", opacity: 0.5, transition: "width 0.4s" }} />
      </div>
      <div style={{ display: "flex", gap: 20, marginTop: 10, fontSize: 11, color: "#5a6278", flexWrap: "wrap" }}>
        {[
          { dot: "#16a85a", opacity: 1,   label: "Certified (Approved)" },
          { dot: "#f37916", opacity: 0.5, label: "Pending Approval" },
          { dot: "#edf0f7", opacity: 1,   label: "Remaining", border: "1px solid #cdd1dd" },
        ].map(l => (
          <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: l.dot, opacity: l.opacity, border: l.border, flexShrink: 0 }} />
            {l.label}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontFamily: "monospace", color: remaining < 0 ? "#e03b3b" : "#5a6278" }}>
          {fmt(Math.max(remaining, 0))} remaining{remaining < 0 ? " ⚠️ over-billed" : ""}
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function Ledger() {
  const [workOrders, setWorkOrders]   = useState<WO[]>([]);
  const [bills, setBills]             = useState<Bill[]>([]);
  const [projects, setProjects]       = useState<Project[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [selectedWOId, setSelectedWOId]     = useState<string | null>(null);
  const [projectFilter, setProjectFilter]   = useState<string>("all");
  const [vendorFilter, setVendorFilter]     = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [woRes, billRes, projRes, ctrRes] = await Promise.all([
        apiClient.get("/work-orders"),
        apiClient.get("/bills"),
        apiClient.get("/projects"),
        apiClient.get("/contractors"),
      ]);
      setWorkOrders(woRes.data.workOrders ?? woRes.data ?? []);
      setBills(billRes.data.bills ?? billRes.data ?? []);
      setProjects(projRes.data.projects ?? projRes.data ?? []);
      setContractors(ctrRes.data.contractors ?? ctrRes.data ?? []);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to load ledger data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Summary data ──────────────────────────────────────────
  const filteredWOs = useMemo(() => workOrders.filter(wo => {
    const matchProject = projectFilter === "all" || wo.projectId === projectFilter || wo.projectName?.toLowerCase().includes(projectFilter.toLowerCase());
    const matchVendor  = vendorFilter  === "all" || wo.vendorCode === vendorFilter;
    return matchProject && matchVendor;
  }), [workOrders, projectFilter, vendorFilter]);

  const woSummaries = useMemo(() => filteredWOs.map(wo => {
    const woBills = bills.filter(b => b.workOrderId?.toString() === wo._id?.toString());
    const contract = wo.contractValue ?? 0;
    let totalGross = 0, certifiedNet = 0, pendingGross = 0;
    for (const b of woBills) {
      const { gross, net } = calcBill(b);
      totalGross += gross;
      if (b.status === "approved" || b.status === "paid") certifiedNet += net;
      if (b.status === "submitted" || b.status === "verified") pendingGross += gross;
    }
    const balance      = contract - certifiedNet;
    const billedPct    = contract ? (totalGross / contract) * 100 : 0;
    const certifiedPct = contract ? (certifiedNet / contract) * 100 : 0;
    return { wo, woBills, contract, totalGross, certifiedNet, pendingGross, balance, billedPct, certifiedPct };
  }), [filteredWOs, bills]);

  // ── Detail for selected WO ────────────────────────────────
  const detail = useMemo(() => {
    if (!selectedWOId) return null;
    const wo = workOrders.find(w => w._id === selectedWOId);
    if (!wo) return null;
    const woBills = bills
      .filter(b => b.workOrderId?.toString() === selectedWOId)
      .sort((a, b) => a.billDate.localeCompare(b.billDate));
    const contract = wo.contractValue ?? 0;
    let runningBalance = contract, cumCertifiedNet = 0;
    const rows = woBills.map((b, i) => {
      const { gst, gross, tds, net } = calcBill(b);
      const isCert = b.status === "approved" || b.status === "paid";
      if (isCert) { runningBalance -= net; cumCertifiedNet += net; }
      return { b, gst, gross, tds, net, isCert, balanceAfter: isCert ? runningBalance : null, seq: i + 1 };
    });
    const totalGross   = rows.reduce((s, r) => s + r.gross, 0);
    const totalNet     = rows.reduce((s, r) => s + r.net, 0);
    const pendingGross = rows.filter(r => r.b.status === "submitted" || r.b.status === "verified").reduce((s, r) => s + r.gross, 0);
    const balance      = contract - cumCertifiedNet;
    return { wo, rows, contract, totalGross, totalNet, certifiedNet: cumCertifiedNet, pendingGross, balance };
  }, [selectedWOId, workOrders, bills]);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
      <Spin size="large" tip="Loading ledger…" />
    </div>
  );

  if (error) return <Alert type="error" message={error} style={{ margin: 24 }} />;

  // ── Portfolio totals ──────────────────────────────────────
  const portfolioContract  = woSummaries.reduce((s, r) => s + r.contract, 0);
  const portfolioGross     = woSummaries.reduce((s, r) => s + r.totalGross, 0);
  const portfolioCertified = woSummaries.reduce((s, r) => s + r.certifiedNet, 0);
  const portfolioBalance   = woSummaries.reduce((s, r) => s + Math.max(r.balance, 0), 0);

  // ═══════════════════════════════════════════════════════════
  //  DETAIL VIEW
  // ═══════════════════════════════════════════════════════════
  if (selectedWOId && detail) {
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setSelectedWOId(null)}>All Work Orders</Button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
                Ledger — <span style={{ fontFamily: "monospace", color: "#f37916" }}>{detail.wo.workOrderNo}</span>
              </h1>
              <Tag color="blue" style={{ fontFamily: "monospace" }}>{detail.wo.vendorCode}</Tag>
              {detail.wo.category && (
                <Tag style={{ background: CATEGORY_COLOR[detail.wo.category] ? `${CATEGORY_COLOR[detail.wo.category]}20` : "#f5f6f8", color: CATEGORY_COLOR[detail.wo.category] || "#5a6278", border: "none", fontWeight: 600 }}>
                  {detail.wo.category}
                </Tag>
              )}
            </div>
            <p style={{ color: "#5a6278", marginTop: 4, marginBottom: 0, fontSize: 12 }}>
              {detail.wo.vendorName} · {detail.wo.projectName}
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <Row gutter={12} style={{ marginBottom: 20 }}>
          {[
            { label: "Contract Value", value: fmt(detail.contract), sub: "opening balance", color: "#2563eb" },
            { label: "Total Billed", value: detail.totalGross > 0 ? fmt(detail.totalGross) : "—", sub: `${detail.rows.length} bill${detail.rows.length !== 1 ? "s" : ""} · incl. GST`, color: "#f37916" },
            { label: "Certified (Net)", value: detail.certifiedNet > 0 ? fmt(detail.certifiedNet) : "—", sub: detail.contract ? `${pctStr(detail.certifiedNet, detail.contract)} of contract` : "approved bills only", color: "#16a85a" },
            { label: "Balance Remaining", value: fmt(Math.max(detail.balance, 0)), sub: detail.balance < 0 ? "⚠️ over-billed" : "uncertified contract value", color: detail.balance < 0 ? "#e03b3b" : "#5a6278" },
          ].map(s => (
            <Col key={s.label} xs={12} sm={6}><StatCard {...s} /></Col>
          ))}
        </Row>

        <TapeBar contract={detail.contract} certified={detail.certifiedNet} pending={detail.pendingGross} />

        {/* WO meta */}
        <div style={{ background: "var(--nx-white)", border: "1px solid #e4e7ee", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
          <Descriptions size="small" column={3}>
            {detail.wo.issueDate && <Descriptions.Item label="Issue Date">{dayjs(detail.wo.issueDate).format("DD MMM YYYY")}</Descriptions.Item>}
            <Descriptions.Item label="Project">{detail.wo.projectName}</Descriptions.Item>
            <Descriptions.Item label="Status"><Tag>{(detail.wo.status || "").toUpperCase()}</Tag></Descriptions.Item>
            {detail.wo.scopeOfWork && <Descriptions.Item label="Scope" span={3}>{detail.wo.scopeOfWork}</Descriptions.Item>}
          </Descriptions>
        </div>

        {/* Ledger table */}
        <div style={{ background: "var(--nx-white)", border: "1px solid #e4e7ee", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e4e7ee", fontSize: 12, fontWeight: 600, color: "#5a6278", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Quantity Ledger — {detail.wo.workOrderNo}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 780 }}>
              <thead>
                <tr style={{ background: "#eff4ff" }}>
                  <th style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 10, color: "#9ba3b8", width: 40 }}>#</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#2563eb" }}>Bill No. / Date</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#9ba3b8" }}>Ref / Remarks</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#9ba3b8" }}>Base Amt</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#16a34a" }}>GST</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#f37916" }}>Gross</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#dc2626" }}>TDS</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#16a85a" }}>Net Payable</th>
                  <th style={{ padding: "8px 12px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#9ba3b8" }}>Status</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#5a6278" }}>Running Balance</th>
                </tr>
                {/* Opening balance row */}
                <tr style={{ background: "#eff4ff", borderBottom: "2px solid #e4e7ee" }}>
                  <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#9ba3b8", fontSize: 11 }}>OB</td>
                  <td style={{ padding: "8px 12px", fontWeight: 600, color: "#2563eb", fontSize: 12 }} colSpan={2}>Opening Balance — Contract Value</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: "#2563eb", fontWeight: 700 }} colSpan={6}>{fmt(detail.contract)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "monospace", color: "#2563eb", fontWeight: 700 }}>{fmt(detail.contract)}</td>
                </tr>
              </thead>
              <tbody>
                {detail.rows.map(r => (
                  <tr key={r.b._id} style={{ borderBottom: "1px solid #f0f0f0" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#fffaf6")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}
                  >
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#9ba3b8", fontSize: 11 }}>{r.seq}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontFamily: "monospace", fontWeight: 600, color: "#f37916" }}>{r.b.billNo}</div>
                      <div style={{ fontSize: 11, color: "#9ba3b8" }}>{dayjs(r.b.billDate).format("DD MMM YYYY")}</div>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "#5a6278" }}>
                      {r.b.billRefNo && <div style={{ fontFamily: "monospace" }}>{r.b.billRefNo}</div>}
                      {r.b.remarks && <div style={{ fontSize: 11, color: "#9ba3b8", fontStyle: "italic" }}>{r.b.remarks}</div>}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace" }}>{fmt(r.b.amount)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "#16a34a" }}>{fmt(r.gst)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "#f37916", fontWeight: 600 }}>{fmt(r.gross)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "#dc2626" }}>({fmt(r.tds)})</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "#16a85a", fontWeight: 600 }}>{fmt(r.net)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <Tag color={STATUS_CFG[r.b.status].color}>{STATUS_CFG[r.b.status].label.toUpperCase()}</Tag>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: r.balanceAfter !== null ? (r.balanceAfter < 0 ? "#e03b3b" : "#16a85a") : "#9ba3b8" }}>
                      {r.balanceAfter !== null ? fmt(r.balanceAfter) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              {detail.rows.length > 0 && (
                <tfoot>
                  <tr style={{ background: "#f5f6f8", borderTop: "2px solid #e4e7ee" }}>
                    <td colSpan={3} style={{ padding: "10px 12px", fontWeight: 700, color: "var(--nx-text)", fontSize: 12 }}>CLOSING BALANCE</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmt(detail.rows.reduce((s, r) => s + r.b.amount, 0))}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "#16a34a" }}>{fmt(detail.rows.reduce((s, r) => s + r.gst, 0))}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "#f37916", fontWeight: 700 }}>{fmt(detail.totalGross)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "#dc2626" }}>({fmt(detail.rows.reduce((s, r) => s + r.tds, 0))})</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: "#16a85a", fontWeight: 700 }}>{fmt(detail.totalNet)}</td>
                    <td />
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: detail.balance < 0 ? "#e03b3b" : "#f37916" }}>
                      {fmt(Math.max(detail.balance, 0))} left
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {detail.rows.length === 0 && (
            <Empty description="No running bills for this work order yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: "40px 0" }} />
          )}
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  SUMMARY VIEW
  // ═══════════════════════════════════════════════════════════
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "var(--nx-text)" }}>Ledger</h1>
          <p style={{ color: "#5a6278", marginTop: 4, marginBottom: 0, fontSize: 13 }}>
            Work Order billing summary — click "View Ledger" for a full statement.
          </p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      </div>

      {/* Portfolio stat cards */}
      <Row gutter={12} style={{ marginBottom: 20 }}>
        {[
          { label: "Total Contract Value", value: fmt(portfolioContract), sub: `${woSummaries.length} work orders`, color: "#2563eb" },
          { label: "Total Billed (Gross)", value: fmt(portfolioGross), sub: "all running bills incl. GST", color: "#f37916" },
          { label: "Total Certified (Net)", value: fmt(portfolioCertified), sub: "approved bills net payable", color: "#16a85a" },
          { label: "Balance Remaining", value: fmt(portfolioBalance), sub: "uncertified contract value", color: "#5a6278" },
        ].map(s => (
          <Col key={s.label} xs={12} sm={6}><StatCard {...s} /></Col>
        ))}
      </Row>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <Select
          value={projectFilter} onChange={setProjectFilter} style={{ width: 220 }}
          options={[
            { value: "all", label: "All Projects" },
            ...projects.map(p => ({ value: p._id, label: p.name || p._id })),
          ]}
        />
        <Select
          value={vendorFilter} onChange={setVendorFilter} style={{ width: 240 }}
          options={[
            { value: "all", label: "All Vendors" },
            ...contractors.map(c => ({ value: c.vendorCode, label: `${c.vendorCode} — ${c.companyName || ""}` })),
          ]}
        />
        <Select
          showSearch allowClear placeholder="Jump to Work Order…" style={{ width: 280 }}
          value={null} onChange={(id: string) => { if (id) setSelectedWOId(id); }}
          options={workOrders.map(wo => ({ value: wo._id, label: `${wo.workOrderNo} — ${wo.vendorName}` }))}
          filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
        />
      </div>

      {/* Summary table */}
      {woSummaries.length === 0 ? (
        <Empty description="No work orders match the selected filters" />
      ) : (
        <div style={{ background: "var(--nx-white)", border: "1px solid #e4e7ee", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
              <thead>
                <tr style={{ background: "#f5f6f8" }}>
                  {["Work Order", "Project", "Vendor", "Category", "Contract Value", "Total Billed", "Certified (Net)", "Balance", "Progress", "Bills", ""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: h === "" || h === "Bills" ? "center" : "left", fontSize: 11, fontWeight: 600, color: "#9ba3b8", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e4e7ee", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {woSummaries.map(r => (
                  <tr key={r.wo._id} style={{ borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#fffaf6")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}
                    onClick={() => setSelectedWOId(r.wo._id)}
                  >
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#f37916", fontWeight: 600 }}>{r.wo.workOrderNo}</td>
                    <td style={{ padding: "10px 12px", color: "#5a6278" }}>{r.wo.projectName || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{r.wo.vendorName || "—"}</div>
                      <Tag color="blue" style={{ fontFamily: "monospace", fontSize: 10 }}>{r.wo.vendorCode}</Tag>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {r.wo.category ? (
                        <span style={{ background: `${CATEGORY_COLOR[r.wo.category] || "#9ba3b8"}20`, color: CATEGORY_COLOR[r.wo.category] || "#9ba3b8", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 5 }}>
                          {r.wo.category}
                        </span>
                      ) : <span style={{ color: "#9ba3b8" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#2563eb", fontWeight: 600 }}>{fmt(r.contract)}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", color: r.totalGross > 0 ? "#f37916" : "#9ba3b8" }}>{r.totalGross > 0 ? fmt(r.totalGross) : "—"}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", color: r.certifiedNet > 0 ? "#16a85a" : "#9ba3b8", fontWeight: 600 }}>{r.certifiedNet > 0 ? fmt(r.certifiedNet) : "—"}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", color: r.balance < 0 ? "#e03b3b" : "#5a6278" }}>{fmt(r.balance)}</td>
                    <td style={{ padding: "10px 12px", minWidth: 100 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
                        <span style={{ color: "#16a85a" }}>{r.certifiedPct.toFixed(0)}%</span>
                        <span style={{ color: "#9ba3b8" }}>{r.billedPct.toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 5, background: "#edf0f7", borderRadius: 3, overflow: "hidden", display: "flex" }}>
                        <div style={{ width: `${Math.min(r.certifiedPct, 100)}%`, background: "#16a85a" }} />
                        <div style={{ width: `${Math.min(r.billedPct - r.certifiedPct, 100 - r.certifiedPct)}%`, background: "#f37916", opacity: 0.5 }} />
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: r.woBills.length ? "#1a1f2e" : "#9ba3b8" }}>
                      {r.woBills.length || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <Button type="link" icon={<BookOutlined />} onClick={e => { e.stopPropagation(); setSelectedWOId(r.wo._id); }} style={{ color: "#f37916", paddingLeft: 0 }}>
                        View Ledger
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
