import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Col, Descriptions, Divider, Drawer, Input, Row, Select, Space, Table, Tag } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import { selectableProjects } from "../../utils/projectOptions";
import { useAuth } from "../../context/AuthContext";
import type { AuthUser } from "../../context/AuthContext";
import StatusTag from "../../shared/components/StatusTag";
import { BILL_TYPE_CFG } from "../../shared/constants/billOptions";
import { BILL_STATUS, BILL_STATUS_LABEL } from "../../shared/constants/billStatus";
import { billFinancials } from "../../shared/utils/billMath";
import NewBillDrawer from "./NewBillDrawer";

// ── Types — a read-only slice of what AccountsPayment's own Bill looks
// like; this page never edits a bill, only lists/views + creates new ones ──

interface BillLineItem {
  description: string;
  unit: string;
  plannedQty: number;
  billedQty: number;
  rate: number;
  amount: number;
}

interface Bill {
  id: string;
  billNo: string;
  workOrderId?: string;
  workOrderNo?: string;
  projectId?: string;
  projectName?: string;
  vendorCode?: string;
  vendorName?: string;
  companyName?: string;
  billDate: string;
  generatedBy?: string;
  lineItems: BillLineItem[];
  amount: number;
  gstPercent: number;
  retentionPercent?: number;
  retentionAmount?: number;
  advanceRecovery?: number;
  tdsPercent?: number;
  tdsAmount?: number;
  remarks?: string;
  status: string;
  billType?: string;
  createdAt?: string;
}

interface ProjectOpt { id: string; name: string; code: string; parentId?: string | null; }

const fmt = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const netAfterAdvance = (b: Bill) =>
  billFinancials({
    gross: b.amount || 0, gstPercent: b.gstPercent ?? 0,
    retentionAmount: b.retentionAmount ?? 0, advanceRecovery: b.advanceRecovery ?? 0,
  }).netPayable;
const normalizeId = (obj: Record<string, unknown>) => ({ ...obj, id: (obj._id || obj.id)?.toString() || "" });

function hasPerm(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return !!user.permissions?.find((p) => p.module === "billing")?.actions.includes(action);
}

export default function Billing() {
  const { user } = useAuth();
  const canCreate = hasPerm(user, "create");

  const [bills, setBills] = useState<Bill[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);

  const [viewBillId, setViewBillId] = useState<string | null>(null);

  const loadBills = useCallback(() => {
    setLoading(true);
    apiClient.get<{ bills: Record<string, unknown>[] }>("/bills")
      .then((r) => setBills((r.data.bills || []).map((b) => normalizeId(b) as unknown as Bill)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadBills(); }, [loadBills]);

  useEffect(() => {
    apiClient.get<{ projects: Record<string, unknown>[] }>("/projects")
      .then((r) => setProjects((r.data.projects || []).map((p) => normalizeId(p) as unknown as ProjectOpt)))
      .catch(() => {});
  }, []);

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        (b.billNo || "").toLowerCase().includes(q) ||
        (b.vendorName || "").toLowerCase().includes(q) ||
        (b.workOrderNo || "").toLowerCase().includes(q) ||
        (b.projectName || "").toLowerCase().includes(q) ||
        (b.generatedBy || "").toLowerCase().includes(q);
      const matchProject = !projectFilter || b.projectId === projectFilter;
      const matchStatus  = !statusFilter || b.status === statusFilter;
      const matchDate     = inDateRange(b.billDate, dateFrom, dateTo);
      return matchSearch && matchProject && matchStatus && matchDate;
    }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [bills, search, projectFilter, statusFilter, dateFrom, dateTo]);

  const viewBill = useMemo(
    () => (viewBillId ? bills.find((b) => b.id === viewBillId) || null : null),
    [bills, viewBillId]
  );

  const columns = [
    {
      title: "Bill No.",
      dataIndex: "billNo",
      width: 120,
      render: (v: string) => <span style={{ fontFamily: "monospace", color: "#2563EB", fontWeight: 700 }}>{v}</span>,
    },
    {
      title: "Bill Type",
      dataIndex: "billType",
      width: 140,
      render: (v?: string) => v
        ? <Tag style={{ fontSize: 11, color: BILL_TYPE_CFG[v]?.color || "#2563eb", borderColor: BILL_TYPE_CFG[v]?.color || "#2563eb", background: `${BILL_TYPE_CFG[v]?.color || "#2563eb"}10` }}>{BILL_TYPE_CFG[v]?.label || v}</Tag>
        : <span style={{ color: "#C0C4CC" }}>—</span>,
    },
    {
      title: "Work Order",
      dataIndex: "workOrderNo",
      width: 140,
      render: (v?: string) => v ? <span style={{ fontFamily: "monospace", color: "#2563EB" }}>{v}</span> : <span style={{ color: "#C0C4CC" }}>—</span>,
    },
    {
      title: "Vendor",
      dataIndex: "vendorName",
      width: 180,
      render: (v?: string) => v || <span style={{ color: "#C0C4CC" }}>—</span>,
    },
    {
      title: "Project",
      dataIndex: "projectName",
      width: 170,
      render: (v?: string) => v || <span style={{ color: "#C0C4CC" }}>—</span>,
    },
    {
      title: "Amount",
      dataIndex: "amount",
      width: 130,
      align: "right" as const,
      render: (_: number, r: Bill) => <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{fmt(netAfterAdvance(r))}</span>,
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 150,
      render: (v: string) => <StatusTag status={v} />,
    },
    {
      title: "Date",
      dataIndex: "billDate",
      width: 110,
      render: (v: string) => (v ? dayjs(v).format("DD MMM YYYY") : "—"),
    },
  ];

  return (
    <PageShell
      title="Billing"
      description="Every bill in the system — from DRI-progress → AGM → GM approvals, or created directly here — still processed through Accounts Payment"
      cta={
        canCreate ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => setNewOpen(true)}
            style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
          >
            New Bill
          </Button>
        ) : undefined
      }
    >
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col flex="1" style={{ minWidth: 220 }}>
          <Input
            prefix={<SearchOutlined style={{ color: "#9CA3AF" }} />}
            placeholder="Search bill no., vendor, WO, project…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
          />
        </Col>
        <Col>
          <Select
            allowClear
            placeholder="Project"
            style={{ width: 200 }}
            value={projectFilter}
            onChange={setProjectFilter}
            options={selectableProjects(projects).map((p) => ({ value: p.id, label: p.name }))}
          />
        </Col>
        <Col>
          <Select
            allowClear
            placeholder="Status"
            style={{ width: 160 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={Object.values(BILL_STATUS).map((s) => ({ value: s, label: BILL_STATUS_LABEL[s] || s }))}
          />
        </Col>
        <Col>
          <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
        </Col>
      </Row>

      <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filteredBills}
          onRow={(r) => ({ onClick: () => setViewBillId(r.id), style: { cursor: "pointer" } })}
          pagination={{ pageSize: 20, showSizeChanger: false }}
        />
      </div>

      <Drawer
        open={!!viewBillId}
        onClose={() => setViewBillId(null)}
        placement="right"
        width={720}
        title={
          <Space>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{viewBill?.billNo}</div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                Read-only — process this bill in Accounts Payment
              </div>
            </div>
          </Space>
        }
      >
        {viewBill && (
          <>
            <Descriptions column={2} size="small" colon={false} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Status"><StatusTag status={viewBill.status} /></Descriptions.Item>
              <Descriptions.Item label="Bill Date">{viewBill.billDate ? dayjs(viewBill.billDate).format("DD MMM YYYY") : "—"}</Descriptions.Item>
              <Descriptions.Item label="Project">{viewBill.projectName || "—"}</Descriptions.Item>
              <Descriptions.Item label="Work Order">{viewBill.workOrderNo || "—"}</Descriptions.Item>
              <Descriptions.Item label="Vendor">{viewBill.vendorName || "—"}</Descriptions.Item>
              <Descriptions.Item label="Generated By">{viewBill.generatedBy || "—"}</Descriptions.Item>
            </Descriptions>

            <Divider />

            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Line Items</div>
            <div style={{ border: "1px solid #e4e7ee", borderRadius: 8, overflow: "auto", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f5f6f8" }}>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Description</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Qty</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Rate</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewBill.lineItems || []).map((li, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "6px 8px" }}>{li.description}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>{li.billedQty} {li.unit}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>{fmt(li.rate)}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{fmt(li.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Financial Summary</div>
            <div style={{ fontFamily: "monospace", fontSize: 13, border: "1px solid #e4e7ee", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: "1px solid #f5f6f8" }}>
                <span>Gross Amount</span><span>{fmt(viewBill.amount)}</span>
              </div>
              {(viewBill.retentionAmount ?? 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: "1px solid #f5f6f8", color: "#b45309" }}>
                  <span>− Hold / Retention{viewBill.retentionPercent ? ` (${viewBill.retentionPercent}%)` : ""}</span><span>{fmt(viewBill.retentionAmount || 0)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: "1px solid #f5f6f8" }}>
                <span>+ GST @ {viewBill.gstPercent}%</span><span>{fmt(billFinancials({ gross: viewBill.amount, gstPercent: viewBill.gstPercent, retentionAmount: viewBill.retentionAmount ?? 0 }).gstAmount)}</span>
              </div>
              {(viewBill.advanceRecovery ?? 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: "1px solid #f5f6f8", color: "#b45309" }}>
                  <span>− Advance Recovery</span><span>{fmt(viewBill.advanceRecovery || 0)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#fff8f3", fontWeight: 800, fontSize: 15, color: "#d4620c" }}>
                <span>Net Payable</span><span>{fmt(netAfterAdvance(viewBill))}</span>
              </div>
            </div>

            {viewBill.remarks && (
              <>
                <Divider />
                <div style={{ color: "#5a6278", fontSize: 13 }}><strong>Remarks:</strong> {viewBill.remarks}</div>
              </>
            )}
          </>
        )}
      </Drawer>

      <NewBillDrawer
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(bill) => {
          setBills((prev) => [normalizeId(bill) as unknown as Bill, ...prev]);
        }}
      />
    </PageShell>
  );
}
