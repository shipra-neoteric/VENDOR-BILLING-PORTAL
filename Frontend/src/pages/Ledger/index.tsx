import { useState, useMemo } from "react";
import {
  Table,
  Button,
  Tag,
  Select,
  Row,
  Col,
  Descriptions,
  Empty,
} from "antd";
import { ArrowLeftOutlined, BookOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  workOrders as allWorkOrders,
  runningBills as allBills,
  projects as allProjects,
  contractors as allContractors,
} from "../../services/mockData";
import type { RunningBill, BillStatus } from "../../types/VendorBilling";

const STATUS_CFG: Record<BillStatus, { color: string; label: string }> = {
  draft:     { color: "default", label: "Draft" },
  submitted: { color: "blue",    label: "Submitted" },
  verified:  { color: "cyan",    label: "Verified" },
  approved:  { color: "green",   label: "Approved" },
  rejected:  { color: "red",     label: "Rejected" },
  paid:      { color: "purple",  label: "Paid" },
};

const fmt  = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const pct  = (n: number, d: number) => d ? ((n / d) * 100).toFixed(1) + "%" : "0%";

function calcBill(b: RunningBill) {
  const gst   = (b.amount * b.gstPercent) / 100;
  const gross = b.amount + gst;
  const tds   = (gross * b.tdsPercent) / 100;
  const net   = gross - tds;
  return { gst, gross, tds, net };
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  color = "#1a1f2e",
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e4e7ee",
        borderRadius: 12,
        padding: "16px 18px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        height: "100%",
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#9ba3b8",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "monospace",
          fontSize: 20,
          fontWeight: 700,
          color,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "#5a6278", marginTop: 3 }}>{sub}</div>
      )}
    </div>
  );
}

// ── Tape progress bar ─────────────────────────────────────────────────────────
function TapeBar({
  contract,
  certified,
  pending,
}: {
  contract: number;
  certified: number;
  pending: number;
}) {
  const certPct   = contract ? Math.min((certified / contract) * 100, 100) : 0;
  const pendPct   = contract ? Math.min((pending  / contract) * 100, 100 - certPct) : 0;
  const remaining = contract - certified - pending;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e4e7ee",
        borderRadius: 12,
        padding: "16px 18px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "#9ba3b8",
          marginBottom: 6,
          fontFamily: "monospace",
        }}
      >
        <span>₹0</span>
        <span style={{ color: "#16a85a" }}>
          {fmt(certified)} certified
        </span>
        {pending > 0 && (
          <span style={{ color: "#f37916" }}>{fmt(pending)} pending</span>
        )}
        <span>{fmt(contract)} contract</span>
      </div>

      <div
        style={{
          height: 10,
          background: "#edf0f7",
          borderRadius: 5,
          overflow: "hidden",
          display: "flex",
        }}
      >
        <div
          style={{
            width: `${certPct}%`,
            background: "#16a85a",
            transition: "width 0.4s",
          }}
        />
        <div
          style={{
            width: `${pendPct}%`,
            background: "#f37916",
            opacity: 0.5,
            transition: "width 0.4s",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 20,
          marginTop: 10,
          fontSize: 11,
          color: "#5a6278",
        }}
      >
        {[
          { dot: "#16a85a", label: "Certified (Approved)" },
          { dot: "#f37916", opacity: 0.5, label: "Pending Approval" },
          { dot: "#edf0f7", border: "1px solid #cdd1dd", label: "Remaining" },
        ].map((l) => (
          <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: l.dot,
                opacity: l.opacity,
                border: l.border,
                flexShrink: 0,
              }}
            />
            {l.label}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontFamily: "monospace", color: remaining < 0 ? "#e03b3b" : "#5a6278" }}>
          {fmt(Math.max(remaining, 0))} remaining
          {remaining < 0 && " ⚠️ over-billed"}
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Ledger() {
  const [selectedWOId, setSelectedWOId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter]   = useState<string>("all");
  const [vendorFilter, setVendorFilter]     = useState<string>("all");

  // ── Summary data ────────────────────────────────────────────
  const filteredWOs = useMemo(() => {
    return allWorkOrders.filter((wo) => {
      const matchProject = projectFilter === "all" || wo.projectId === projectFilter;
      const matchVendor  = vendorFilter  === "all" || wo.vendorCode === vendorFilter;
      return matchProject && matchVendor;
    });
  }, [projectFilter, vendorFilter]);

  // Per-WO billing summary for the summary table
  const woSummaries = useMemo(() => {
    return filteredWOs.map((wo) => {
      const bills = allBills.filter((b) => b.workOrderId === wo.id);
      const contract = wo.contractValue ?? 0;

      let totalGross = 0, certifiedNet = 0, pendingGross = 0;
      for (const b of bills) {
        const { gross, net } = calcBill(b);
        totalGross += gross;
        if (b.status === "approved") certifiedNet += net;
        if (b.status === "submitted" || b.status === "verified") pendingGross += gross;
      }
      const balance     = contract - certifiedNet;
      const billedPct   = contract ? (totalGross / contract) * 100 : 0;
      const certifiedPct = contract ? (certifiedNet / contract) * 100 : 0;

      return { wo, bills, contract, totalGross, certifiedNet, pendingGross, balance, billedPct, certifiedPct };
    });
  }, [filteredWOs]);

  // ── Detail data for selected WO ────────────────────────────
  const detail = useMemo(() => {
    if (!selectedWOId) return null;
    const wo = allWorkOrders.find((w) => w.id === selectedWOId);
    if (!wo) return null;

    const bills = allBills
      .filter((b) => b.workOrderId === selectedWOId)
      .sort((a, b) => a.billDate.localeCompare(b.billDate));

    const contract = wo.contractValue ?? 0;
    let runningBalance = contract;
    let cumCertifiedNet = 0;

    const rows = bills.map((b, i) => {
      const { gst, gross, tds, net } = calcBill(b);
      const isApproved = b.status === "approved";
      if (isApproved) {
        runningBalance  -= net;
        cumCertifiedNet += net;
      }
      return { b, gst, gross, tds, net, isApproved, balanceAfter: isApproved ? runningBalance : null, seq: i + 1 };
    });

    const totalGross       = rows.reduce((s, r) => s + r.gross, 0);
    const totalNet         = rows.reduce((s, r) => s + r.net, 0);
    const certifiedNet     = cumCertifiedNet;
    const pendingGross     = rows.filter(r => r.b.status === "submitted" || r.b.status === "verified").reduce((s, r) => s + r.gross, 0);
    const balance          = contract - certifiedNet;
    const billCount        = bills.length;

    return { wo, rows, contract, totalGross, totalNet, certifiedNet, pendingGross, balance, billCount };
  }, [selectedWOId]);

  // ── Summary table columns ──────────────────────────────────
  const summaryColumns = [
    {
      title: "Work Order No.",
      render: (_: unknown, r: typeof woSummaries[0]) => (
        <span style={{ fontFamily: "monospace", color: "#f37916", fontWeight: 600 }}>
          {r.wo.workOrderNo}
        </span>
      ),
    },
    { title: "Project",  render: (_: unknown, r: typeof woSummaries[0]) => r.wo.projectName },
    {
      title: "Vendor Code",
      render: (_: unknown, r: typeof woSummaries[0]) => (
        <Tag color="blue" style={{ fontFamily: "monospace" }}>{r.wo.vendorCode}</Tag>
      ),
    },
    { title: "Vendor",   render: (_: unknown, r: typeof woSummaries[0]) => r.wo.vendorName },
    {
      title: "Contract Value",
      render: (_: unknown, r: typeof woSummaries[0]) => (
        <span style={{ fontFamily: "monospace", color: "#2563eb", fontWeight: 600 }}>
          {fmt(r.contract)}
        </span>
      ),
    },
    {
      title: "Total Billed",
      render: (_: unknown, r: typeof woSummaries[0]) => (
        <span style={{ fontFamily: "monospace", color: "#f37916" }}>
          {r.totalGross > 0 ? fmt(r.totalGross) : <span style={{ color: "#9ba3b8" }}>—</span>}
        </span>
      ),
    },
    {
      title: "Certified (Net)",
      render: (_: unknown, r: typeof woSummaries[0]) => (
        <span style={{ fontFamily: "monospace", color: "#16a85a", fontWeight: 600 }}>
          {r.certifiedNet > 0 ? fmt(r.certifiedNet) : <span style={{ color: "#9ba3b8" }}>—</span>}
        </span>
      ),
    },
    {
      title: "Balance",
      render: (_: unknown, r: typeof woSummaries[0]) => (
        <span style={{ fontFamily: "monospace", color: r.balance < 0 ? "#e03b3b" : "#5a6278" }}>
          {fmt(r.balance)}
        </span>
      ),
    },
    {
      title: "% Billed",
      render: (_: unknown, r: typeof woSummaries[0]) => {
        const p = r.billedPct;
        return (
          <div style={{ minWidth: 80 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
              <span style={{ color: "#16a85a" }}>{r.certifiedPct.toFixed(0)}%</span>
              <span style={{ color: "#9ba3b8" }}>{p.toFixed(0)}%</span>
            </div>
            <div style={{ height: 5, background: "#edf0f7", borderRadius: 3, overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${Math.min(r.certifiedPct, 100)}%`, background: "#16a85a" }} />
              <div style={{ width: `${Math.min(p - r.certifiedPct, 100 - r.certifiedPct)}%`, background: "#f37916", opacity: 0.5 }} />
            </div>
          </div>
        );
      },
    },
    {
      title: "Bills",
      render: (_: unknown, r: typeof woSummaries[0]) => (
        <span style={{ color: r.bills.length ? "#1a1f2e" : "#9ba3b8" }}>
          {r.bills.length || "—"}
        </span>
      ),
    },
    {
      title: "",
      render: (_: unknown, r: typeof woSummaries[0]) => (
        <Button
          type="link"
          icon={<BookOutlined />}
          onClick={() => setSelectedWOId(r.wo.id)}
          style={{ color: "#f37916", paddingLeft: 0 }}
        >
          View Ledger
        </Button>
      ),
    },
  ];

  // ── Detail ledger table columns ────────────────────────────
  type DetailRow = NonNullable<typeof detail>["rows"][0];
  const detailColumns = [
    {
      title: "#",
      render: (_: unknown, r: DetailRow) => (
        <span style={{ fontFamily: "monospace", color: "#9ba3b8", fontSize: 11 }}>
          {r.seq}
        </span>
      ),
      width: 40,
    },
    {
      title: "Bill No. / Date",
      render: (_: unknown, r: DetailRow) => (
        <>
          <div style={{ fontFamily: "monospace", fontWeight: 600, color: "#f37916" }}>
            {r.b.billNo}
          </div>
          <div style={{ fontSize: 11, color: "#9ba3b8" }}>
            {dayjs(r.b.billDate).format("DD MMM YYYY")}
          </div>
        </>
      ),
    },
    {
      title: "Description / Ref",
      render: (_: unknown, r: DetailRow) => (
        <>
          {r.b.description && (
            <div style={{ fontSize: 12, color: "#1a1f2e" }}>{r.b.description}</div>
          )}
          {r.b.billRefNo && (
            <div style={{ fontSize: 11, color: "#9ba3b8" }}>{r.b.billRefNo}</div>
          )}
        </>
      ),
    },
    {
      title: "Base Amt",
      dataIndex: ["b", "amount"],
      render: (v: number) => (
        <span style={{ fontFamily: "monospace" }}>{fmt(v)}</span>
      ),
    },
    {
      title: `GST`,
      render: (_: unknown, r: DetailRow) => (
        <span style={{ fontFamily: "monospace", color: "#5a6278" }}>{fmt(r.gst)}</span>
      ),
    },
    {
      title: "Gross",
      render: (_: unknown, r: DetailRow) => (
        <span style={{ fontFamily: "monospace", color: "#f37916", fontWeight: 600 }}>
          {fmt(r.gross)}
        </span>
      ),
    },
    {
      title: "TDS",
      render: (_: unknown, r: DetailRow) => (
        <span style={{ fontFamily: "monospace", color: "#5a6278" }}>({fmt(r.tds)})</span>
      ),
    },
    {
      title: "Net Payable",
      render: (_: unknown, r: DetailRow) => (
        <span style={{ fontFamily: "monospace", color: "#16a85a", fontWeight: 600 }}>
          {fmt(r.net)}
        </span>
      ),
    },
    {
      title: "Status",
      render: (_: unknown, r: DetailRow) => (
        <Tag color={STATUS_CFG[r.b.status].color}>
          {STATUS_CFG[r.b.status].label.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: "Running Balance",
      render: (_: unknown, r: DetailRow) =>
        r.balanceAfter !== null ? (
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: 700,
              color: r.balanceAfter < 0 ? "#e03b3b" : "#16a85a",
            }}
          >
            {fmt(r.balanceAfter)}
          </span>
        ) : (
          <span style={{ color: "#9ba3b8" }}>—</span>
        ),
    },
  ];

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div>
      {/* ── DETAIL VIEW ──────────────────────────────────── */}
      {selectedWOId && detail ? (
        <>
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => setSelectedWOId(null)}
            >
              All Work Orders
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold mb-0">
                  Ledger —{" "}
                  <span style={{ fontFamily: "monospace", color: "#f37916" }}>
                    {detail.wo.workOrderNo}
                  </span>
                </h1>
                <Tag color="blue" style={{ fontFamily: "monospace" }}>
                  {detail.wo.vendorCode}
                </Tag>
              </div>
              <p className="text-gray-500 text-sm mt-1">
                {detail.wo.vendorName} · {detail.wo.projectName}
              </p>
            </div>
          </div>

          {/* Stat cards */}
          <Row gutter={12} style={{ marginBottom: 20 }}>
            <Col xs={12} sm={6}>
              <StatCard
                label="Contract Value"
                value={fmt(detail.contract)}
                sub="opening balance"
                color="#2563eb"
              />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard
                label="Total Billed"
                value={detail.totalGross > 0 ? fmt(detail.totalGross) : "—"}
                sub={`${detail.billCount} bill${detail.billCount !== 1 ? "s" : ""} · incl. GST`}
                color="#f37916"
              />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard
                label="Certified (Net)"
                value={detail.certifiedNet > 0 ? fmt(detail.certifiedNet) : "—"}
                sub={
                  detail.contract
                    ? `${pct(detail.certifiedNet, detail.contract)} of contract`
                    : "approved bills only"
                }
                color="#16a85a"
              />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard
                label="Balance Remaining"
                value={fmt(Math.max(detail.balance, 0))}
                sub={detail.balance < 0 ? "⚠️ over-billed" : "uncertified contract value"}
                color={detail.balance < 0 ? "#e03b3b" : "#5a6278"}
              />
            </Col>
          </Row>

          {/* Tape bar */}
          <TapeBar
            contract={detail.contract}
            certified={detail.certifiedNet}
            pending={detail.pendingGross}
          />

          {/* WO meta */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e4e7ee",
              borderRadius: 12,
              padding: "14px 18px",
              marginBottom: 20,
            }}
          >
            <Descriptions size="small" column={3}>
              <Descriptions.Item label="Issue Date">
                {dayjs(detail.wo.issueDate).format("DD MMM YYYY")}
              </Descriptions.Item>
              <Descriptions.Item label="Project">
                {detail.wo.projectName}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag>{detail.wo.status.toUpperCase()}</Tag>
              </Descriptions.Item>
              {detail.wo.scopeOfWork && (
                <Descriptions.Item label="Scope of Work" span={3}>
                  {detail.wo.scopeOfWork}
                </Descriptions.Item>
              )}
            </Descriptions>
          </div>

          {/* Ledger table */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e4e7ee",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #e4e7ee",
                fontSize: 12,
                fontWeight: 600,
                color: "#5a6278",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Quantity Ledger — {detail.wo.workOrderNo}
            </div>

            <Table
              rowKey={(r) => r.b.id}
              dataSource={detail.rows}
              columns={detailColumns}
              pagination={false}
              scroll={{ x: true }}
              bordered={false}
              components={{
                body: {
                  wrapper: (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
                    <tbody {...props} />
                  ),
                },
              }}
              summary={() => (
                <>
                  {/* Opening Balance row */}
                  <Table.Summary.Row
                    style={{ background: "#eff4ff" }}
                  >
                    <Table.Summary.Cell index={0} colSpan={3}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          color: "#9ba3b8",
                          fontSize: 11,
                        }}
                      >
                        OB
                      </span>
                      {"  "}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#2563eb",
                        }}
                      >
                        Opening Balance
                      </span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} colSpan={5}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          color: "#2563eb",
                          fontWeight: 700,
                        }}
                      >
                        {fmt(detail.contract)}
                      </span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8}>
                      <Tag
                        style={{
                          background: "#eff4ff",
                          color: "#2563eb",
                          border: "1px solid #bfdbfe",
                        }}
                      >
                        CONTRACT
                      </Tag>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={9}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          color: "#2563eb",
                          fontWeight: 700,
                        }}
                      >
                        {fmt(detail.contract)}
                      </span>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>

                  {/* Closing Balance row */}
                  {detail.rows.length > 0 && (
                    <Table.Summary.Row style={{ background: "#f5f6f8" }}>
                      <Table.Summary.Cell index={0} colSpan={3}>
                        <span
                          style={{ fontSize: 12, fontWeight: 700, color: "#1a1f2e" }}
                        >
                          CLOSING BALANCE
                        </span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={3}>
                        <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                          {fmt(detail.rows.reduce((s, r) => s + r.b.amount, 0))}
                        </span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={4}>
                        <span style={{ fontFamily: "monospace", color: "#5a6278" }}>
                          {fmt(detail.rows.reduce((s, r) => s + r.gst, 0))}
                        </span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={5}>
                        <span
                          style={{
                            fontFamily: "monospace",
                            color: "#f37916",
                            fontWeight: 700,
                          }}
                        >
                          {fmt(detail.totalGross)}
                        </span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={6}>
                        <span style={{ fontFamily: "monospace", color: "#5a6278" }}>
                          ({fmt(detail.rows.reduce((s, r) => s + r.tds, 0))})
                        </span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={7}>
                        <span
                          style={{
                            fontFamily: "monospace",
                            color: "#16a85a",
                            fontWeight: 700,
                          }}
                        >
                          {fmt(detail.totalNet)}
                        </span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={8} />
                      <Table.Summary.Cell index={9}>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontWeight: 700,
                            color:
                              detail.balance < 0 ? "#e03b3b" : "#f37916",
                          }}
                        >
                          {fmt(Math.max(detail.balance, 0))} left
                        </span>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  )}
                </>
              )}
            />

            {detail.rows.length === 0 && (
              <Empty
                description="No running bills for this work order yet"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ padding: "40px 0" }}
              />
            )}
          </div>
        </>
      ) : (
        /* ── SUMMARY VIEW ──────────────────────────────────── */
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">Ledger</h1>
              <p className="text-gray-500 text-sm mt-1">
                Work Order billing summary — click "View Ledger" for a full
                statement.
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <Select
              value={projectFilter}
              onChange={setProjectFilter}
              style={{ width: 220 }}
              options={[
                { value: "all", label: "All Projects" },
                ...allProjects.map((p) => ({
                  value: p.id,
                  label: `${p.code} — ${p.name}`,
                })),
              ]}
            />
            <Select
              value={vendorFilter}
              onChange={setVendorFilter}
              style={{ width: 240 }}
              options={[
                { value: "all", label: "All Vendors" },
                ...allContractors.map((c) => ({
                  value: c.vendorCode,
                  label: `${c.vendorCode} — ${c.companyName}`,
                })),
              ]}
            />
            <Select
              showSearch
              allowClear
              placeholder="Jump to Work Order…"
              style={{ width: 280 }}
              value={null}
              onChange={(id: string) => { if (id) setSelectedWOId(id); }}
              options={allWorkOrders.map((wo) => ({
                value: wo.id,
                label: `${wo.workOrderNo} — ${wo.vendorName}`,
              }))}
              filterOption={(input, opt) =>
                String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())
              }
            />
          </div>

          {/* Portfolio stat cards */}
          <Row gutter={12} style={{ marginBottom: 20 }}>
            {[
              {
                label: "Total Contract Value",
                value: fmt(woSummaries.reduce((s, r) => s + r.contract, 0)),
                sub: `${woSummaries.length} work orders`,
                color: "#2563eb",
              },
              {
                label: "Total Billed",
                value: fmt(woSummaries.reduce((s, r) => s + r.totalGross, 0)),
                sub: "all running bills (gross)",
                color: "#f37916",
              },
              {
                label: "Total Certified",
                value: fmt(woSummaries.reduce((s, r) => s + r.certifiedNet, 0)),
                sub: "approved bills (net)",
                color: "#16a85a",
              },
              {
                label: "Balance Remaining",
                value: fmt(
                  woSummaries.reduce(
                    (s, r) => s + Math.max(r.balance, 0),
                    0
                  )
                ),
                sub: "uncertified contract value",
                color: "#5a6278",
              },
            ].map((s) => (
              <Col key={s.label} xs={12} sm={6}>
                <StatCard {...s} />
              </Col>
            ))}
          </Row>

          {/* Summary table */}
          {woSummaries.length === 0 ? (
            <Empty description="No work orders match the selected filters" />
          ) : (
            <Table
              rowKey={(r) => r.wo.id}
              dataSource={woSummaries}
              columns={summaryColumns}
              scroll={{ x: true }}
              pagination={false}
              onRow={(_r) => ({
                style: { cursor: "pointer" },
                onMouseEnter: (e) => {
                  (e.currentTarget as HTMLElement).style.background = "#fffaf6";
                },
                onMouseLeave: (e) => {
                  (e.currentTarget as HTMLElement).style.background = "";
                },
              })}
            />
          )}
        </>
      )}
    </div>
  );
}
