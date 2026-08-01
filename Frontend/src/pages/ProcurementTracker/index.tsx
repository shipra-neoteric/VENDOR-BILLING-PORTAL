import { useEffect, useMemo, useState } from "react";
import { Button, Col, Input, Row, Select, Space, Table, Tag } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import StatCard from "../../shared/components/StatCard";
import StatusTag from "../../shared/components/StatusTag";
import { selectableProjects } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";
import type { Contractor } from "../../types/VendorBilling";

// One row per bill (not per Work Order — a single WO can spawn many bills
// over its life, and each one has its own independent Verification/L1/L2/
// Payment progress) — reuses the same GET /bills + GET /work-orders data
// Accounts Payment and Billing already fetch, no new backend endpoint or
// Purchase-Order/GRN entity needed.

interface BillRow {
  id: string;
  billNo: string;
  workOrderNo?: string;
  workOrderId?: string;
  projectName?: string;
  vendorCode?: string;
  vendorName?: string;
  amount: number;
  gstPercent?: number;
  retentionAmount?: number;
  advanceRecovery?: number;
  status: string;
  billDate: string;
  verificationBy?: { name?: string } | null;
  verificationAt?: string;
  l1ApprovedBy?: { name?: string } | null;
  l1ApprovedAt?: string;
  l2ApprovedBy?: { name?: string } | null;
  l2ApprovedAt?: string;
  tmsSentAt?: string;
  paymentDate?: string;
  paidAmount?: number;
}

interface ProjectOpt { id: string; name: string; code: string; parentId?: string | null; }

const fmt = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const normalizeId = (obj: Record<string, unknown>) => ({ ...obj, id: (obj._id || obj.id)?.toString() || "" });

const STAGE_ORDER = ["draft", "verify-done", "l1-approved", "approved", "sent-to-tms", "paid"];
function stageReached(status: string, stage: string): boolean {
  if (status === "hold" || status === "rejected") return false;
  return STAGE_ORDER.indexOf(status) >= STAGE_ORDER.indexOf(stage);
}

function StageCell({ done, who, at }: { done: boolean; who?: string; at?: string }) {
  if (!done) return <span style={{ color: "#C0C4CC" }}>—</span>;
  return (
    <div>
      <Tag color="green" style={{ fontSize: 11 }}>✓ Done</Tag>
      {(who || at) && (
        <div style={{ fontSize: 10, color: "#9ba3b8", marginTop: 2 }}>
          {who || ""}{who && at ? " · " : ""}{at ? dayjs(at).format("DD MMM") : ""}
        </div>
      )}
    </div>
  );
}

export default function ProcurementTracker() {
  const navigate = useNavigate();
  const [bills, setBills] = useState<BillRow[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);
  const [vendorFilter, setVendorFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  useEffect(() => {
    setLoading(true);
    apiClient.get<{ bills: Record<string, unknown>[] }>("/bills")
      .then((r) => setBills((r.data.bills || []).map((b) => normalizeId(b) as unknown as BillRow)))
      .catch(() => {})
      .finally(() => setLoading(false));
    apiClient.get<{ projects: Record<string, unknown>[] }>("/projects")
      .then((r) => setProjects((r.data.projects || []).map((p) => normalizeId(p) as unknown as ProjectOpt)))
      .catch(() => {});
    apiClient.get<{ contractors: Record<string, unknown>[] }>("/contractors")
      .then((r) => setContractors((r.data.contractors || []).map((c) => normalizeId(c) as unknown as Contractor)))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return bills.filter((b) => {
      const matchSearch =
        !q ||
        (b.billNo || "").toLowerCase().includes(q) ||
        (b.workOrderNo || "").toLowerCase().includes(q) ||
        (b.vendorName || "").toLowerCase().includes(q) ||
        (b.projectName || "").toLowerCase().includes(q);
      const matchProject = !projectFilter || projects.find((p) => p.id === projectFilter)?.name === b.projectName;
      const matchVendor  = !vendorFilter || b.vendorCode === vendorFilter;
      const matchStatus  = !statusFilter || b.status === statusFilter;
      return matchSearch && matchProject && matchVendor && matchStatus;
    }).sort((a, b) => (b.billDate || "").localeCompare(a.billDate || ""));
  }, [bills, search, projectFilter, vendorFilter, statusFilter, projects]);

  const stats = useMemo(() => ({
    total:       bills.length,
    verifying:   bills.filter((b) => b.status === "draft").length,
    l1:          bills.filter((b) => b.status === "verify-done").length,
    l2:          bills.filter((b) => b.status === "l1-approved").length,
    sentToTms:   bills.filter((b) => b.status === "sent-to-tms").length,
    paid:        bills.filter((b) => b.status === "paid").length,
    outstanding: bills.filter((b) => !["paid", "rejected"].includes(b.status)).reduce((s, b) => s + (b.amount || 0), 0),
  }), [bills]);

  const columns = [
    { title: "PO Number", dataIndex: "workOrderNo", width: 120, render: (v?: string) => v ? <span style={{ fontFamily: "monospace", color: "#2563EB", fontWeight: 700 }}>{v}</span> : <span style={{ color: "#C0C4CC" }}>—</span> },
    { title: "Bill No", dataIndex: "billNo", width: 110, render: (v: string) => <span style={{ fontFamily: "monospace" }}>{v}</span> },
    {
      title: "Vendor / Project", key: "vendor", width: 220,
      render: (_: unknown, r: BillRow) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.vendorName || "—"}</div>
          <div style={{ fontSize: 11, color: "#9ba3b8" }}>{r.projectName || "—"}</div>
        </div>
      ),
    },
    { title: "Amount", dataIndex: "amount", width: 120, align: "right" as const, render: (v: number) => <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{fmt(v)}</span> },
    { title: "Verification", key: "verify", width: 110, render: (_: unknown, r: BillRow) => <StageCell done={stageReached(r.status, "verify-done")} who={r.verificationBy?.name} at={r.verificationAt} /> },
    { title: "L1", key: "l1", width: 110, render: (_: unknown, r: BillRow) => <StageCell done={stageReached(r.status, "l1-approved")} who={r.l1ApprovedBy?.name} at={r.l1ApprovedAt} /> },
    { title: "L2", key: "l2", width: 110, render: (_: unknown, r: BillRow) => <StageCell done={stageReached(r.status, "approved")} who={r.l2ApprovedBy?.name} at={r.l2ApprovedAt} /> },
    { title: "Payment", key: "payment", width: 120, render: (_: unknown, r: BillRow) => r.status === "paid" ? <StageCell done who={r.paidAmount != null ? fmt(r.paidAmount) : undefined} at={r.paymentDate} /> : r.status === "sent-to-tms" ? <Tag color="processing" style={{ fontSize: 11 }}>Awaiting TMS</Tag> : <span style={{ color: "#C0C4CC" }}>—</span> },
    { title: "Overall Status", dataIndex: "status", width: 150, render: (v: string) => <StatusTag status={v} /> },
    {
      title: "", key: "actions", width: 50,
      render: () => (
        <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); navigate("/accounts-payment"); }}>Open →</Button>
      ),
    },
  ];

  return (
    <PageShell
      title="Procurement Tracker"
      description="Track every bill's Verification → L1 AGM → L2 Director → TMS Payment lifecycle in one place"
      cta={
        <Space>
          <Button onClick={() => navigate("/accounts-payment")}>Accounts Payment</Button>
          <Button type="primary" style={{ background: "#FF7A00", borderColor: "#FF7A00" }}>Procurement Tracker</Button>
        </Space>
      }
    >
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={8} md={4}><StatCard label="Total Bills" value={stats.total} accent="#6B7280" /></Col>
        <Col xs={12} sm={8} md={4}><StatCard label="Verifying" value={stats.verifying} accent="#FF7A00" /></Col>
        <Col xs={12} sm={8} md={4}><StatCard label="Awaiting L1" value={stats.l1} accent="#0891b2" /></Col>
        <Col xs={12} sm={8} md={4}><StatCard label="Awaiting L2" value={stats.l2} accent="#7C3AED" /></Col>
        <Col xs={12} sm={8} md={4}><StatCard label="Sent to TMS" value={stats.sentToTms} accent="#1D4ED8" /></Col>
        <Col xs={12} sm={8} md={4}><StatCard label="Outstanding" value={fmt(stats.outstanding)} accent="#DC2626" /></Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col flex="1" style={{ minWidth: 220 }}>
          <Input
            prefix={<SearchOutlined style={{ color: "#9CA3AF" }} />}
            placeholder="Search bill no., PO, vendor, project…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
        </Col>
        <Col>
          <Select
            allowClear placeholder="Project" style={{ width: 200 }}
            value={projectFilter} onChange={setProjectFilter}
            options={selectableProjects(projects).map((p) => ({ value: p.id, label: p.name }))}
          />
        </Col>
        <Col>
          <Select
            allowClear placeholder="Vendor" style={{ width: 220 }}
            value={vendorFilter} onChange={setVendorFilter}
            options={contractors.map((c) => ({ value: c.vendorCode, label: `${vendorLabel(c.companyName, c.shortCode)} (${c.vendorCode})` }))}
          />
        </Col>
        <Col>
          <Select
            allowClear placeholder="Status" style={{ width: 170 }}
            value={statusFilter} onChange={setStatusFilter}
            options={["draft", "verify-done", "l1-approved", "approved", "sent-to-tms", "hold", "paid", "rejected"].map((s) => ({ value: s, label: s }))}
          />
        </Col>
      </Row>

      <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1300 }}
          pagination={{ pageSize: 20, showSizeChanger: false }}
        />
      </div>
    </PageShell>
  );
}
