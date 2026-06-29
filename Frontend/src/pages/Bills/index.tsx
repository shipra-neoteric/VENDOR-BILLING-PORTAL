import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";

// ── Types ────────────────────────────────────────────────────────

type BillStatus = "draft" | "submitted" | "verified" | "approved" | "rejected" | "paid";

interface LineItem {
  scopeItemId: string;
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
  workOrderId: string;
  workOrderNo: string;
  projectId: string;
  projectName: string;
  vendorCode: string;
  vendorName: string;
  billDate: string;
  billingPeriodFrom?: string;
  billingPeriodTo?: string;
  contractorRefNo?: string;
  generatedBy?: string;
  lineItems: LineItem[];
  amount: number;
  gstPercent: number;
  tdsPercent: number;
  remarks?: string;
  status: BillStatus;
  submittedAt?: string;
  verifiedBy?: { name: string; role: string } | null;
  verifiedAt?: string;
  approvedBy?: { name: string; role: string } | null;
  approvedAt?: string;
  rejectedBy?: { name: string; role: string } | null;
  rejectReason?: string;
  paymentDate?: string;
  paymentUTR?: string;
  paymentMode?: string;
  paymentReleasedBy?: string;
  paymentBank?: string;
  createdAt?: string;
}

interface ProjectOpt { id: string; name: string; code: string; }
interface ContractorOpt { id: string; vendorCode: string; companyName: string; ownerName?: string; mobile?: string; }
interface ScopeItemOpt { id: string; description: string; unit: string; plannedQty: number; completedQty: number; rate?: number; }
interface WorkOrderOpt { id: string; workOrderNo: string; projectId: string; projectName: string; vendorCode: string; vendorName: string; scopeItems: ScopeItemOpt[]; }

// ── Helpers ──────────────────────────────────────────────────────

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const normalizeId = (obj: any) => ({ ...obj, id: obj._id?.toString() || obj.id });
const normalizeWO = (wo: any): WorkOrderOpt => ({
  ...normalizeId(wo),
  scopeItems: (wo.scopeItems || []).map(normalizeId),
});

const STATUS_CFG: Record<BillStatus, { label: string; antColor: string }> = {
  draft:     { label: "Draft",      antColor: "default" },
  submitted: { label: "Submitted",  antColor: "processing" },
  verified:  { label: "Verified",   antColor: "warning" },
  approved:  { label: "Approved",   antColor: "success" },
  rejected:  { label: "Rejected",   antColor: "error" },
  paid:      { label: "Paid",       antColor: "purple" },
};

// ── StatCard ─────────────────────────────────────────────────────

function StatCard({
  title, value, sub, color, bg, icon,
}: {
  title: string; value: React.ReactNode; sub?: string;
  color?: string; bg?: string; icon?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: bg || "#fff",
        border: "1px solid #e4e7ee",
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 11, fontWeight: 700, color: "#9ba3b8",
          textTransform: "uppercase", letterSpacing: "0.06em",
        }}
      >
        {icon} {title}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || "#1a1f2e", marginTop: 4 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#9ba3b8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function Bills() {
  const [bills, setBills]             = useState<Bill[]>([]);
  const [loading, setLoading]         = useState(true);
  const [projects, setProjects]       = useState<ProjectOpt[]>([]);
  const [contractors, setContractors] = useState<ContractorOpt[]>([]);

  // Filters
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState("all");

  // New Bill drawer
  const [newOpen, setNewOpen]         = useState(false);
  const [newSaving, setNewSaving]     = useState(false);
  const [newForm]                      = Form.useForm();
  const [newProjectId, setNewProjectId]     = useState<string>("");
  const [newVendorCode, setNewVendorCode]   = useState<string>("");
  const [newWOId, setNewWOId]               = useState<string>("");
  const [woList, setWoList]                 = useState<WorkOrderOpt[]>([]);
  const [selectedWO, setSelectedWO]         = useState<WorkOrderOpt | null>(null);
  const [lineItems, setLineItems]           = useState<LineItem[]>([]);

  // View drawer
  const [viewBill, setViewBill]       = useState<Bill | null>(null);
  const [viewOpen, setViewOpen]       = useState(false);

  // Approve / Reject drawer
  const [actionBillId, setActionBillId] = useState<string | null>(null);
  const [actionType, setActionType]     = useState<"approve" | "reject">("approve");
  const [actionOpen, setActionOpen]     = useState(false);
  const [actionForm]                     = Form.useForm();
  const [actionSaving, setActionSaving] = useState(false);

  // Pay drawer
  const [payBillId, setPayBillId]     = useState<string | null>(null);
  const [payOpen, setPayOpen]         = useState(false);
  const [payForm]                      = Form.useForm();
  const [paySaving, setPaySaving]     = useState(false);

  // ── Load data ────────────────────────────────────────────────

  const loadBills = () => {
    setLoading(true);
    apiClient
      .get<{ bills: any[] }>("/bills")
      .then((r) => setBills((r.data.bills || []).map(normalizeId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBills();
    apiClient
      .get<{ projects: any[] }>("/projects")
      .then((r) => setProjects((r.data.projects || []).map(normalizeId)))
      .catch(() => {});
    apiClient
      .get<{ contractors: any[] }>("/contractors")
      .then((r) => setContractors((r.data.contractors || []).map(normalizeId)))
      .catch(() => {});
  }, []);

  // When project is selected in New Bill form → load its work orders
  useEffect(() => {
    if (!newProjectId) {
      setWoList([]);
      setNewVendorCode("");
      setNewWOId("");
      setSelectedWO(null);
      setLineItems([]);
      return;
    }
    apiClient
      .get<{ workOrders: any[] }>(`/work-orders?projectId=${newProjectId}`)
      .then((r) => setWoList((r.data.workOrders || []).map(normalizeWO)))
      .catch(() => setWoList([]));
  }, [newProjectId]);

  // ── Derived ──────────────────────────────────────────────────

  const contractorsInProject = useMemo(() => {
    const seen = new Set<string>();
    const result: { vendorCode: string; vendorName: string }[] = [];
    for (const wo of woList) {
      if (!seen.has(wo.vendorCode)) {
        seen.add(wo.vendorCode);
        result.push({ vendorCode: wo.vendorCode, vendorName: wo.vendorName });
      }
    }
    return result;
  }, [woList]);

  const filteredWOs = useMemo(() => {
    if (!newVendorCode) return woList;
    return woList.filter((wo) => wo.vendorCode === newVendorCode);
  }, [woList, newVendorCode]);

  // Find full contractor details from the contractors list
  const selectedContractor = useMemo(
    () => contractors.find((c) => c.vendorCode === newVendorCode) || null,
    [contractors, newVendorCode]
  );

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        b.billNo.toLowerCase().includes(q) ||
        b.vendorName.toLowerCase().includes(q) ||
        b.workOrderNo.toLowerCase().includes(q) ||
        b.projectName.toLowerCase().includes(q) ||
        (b.generatedBy || "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || b.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [bills, search, statusFilter]);

  const stats = useMemo(
    () => ({
      submitted: bills.filter((b) => b.status === "submitted" || b.status === "verified").length,
      approved:  bills.filter((b) => b.status === "approved").length,
      paid:      bills.filter((b) => b.status === "paid").length,
      totalPaid: bills.filter((b) => b.status === "paid").reduce((s, b) => s + b.amount, 0),
    }),
    [bills]
  );

  const totalLineAmount = useMemo(
    () => lineItems.reduce((s, li) => s + li.amount, 0),
    [lineItems]
  );

  const currentViewBill = useMemo(
    () => (viewBill ? bills.find((b) => b.id === viewBill.id) || viewBill : null),
    [bills, viewBill]
  );

  // ── New Bill ─────────────────────────────────────────────────

  function openNewBill() {
    newForm.resetFields();
    setNewProjectId("");
    setNewVendorCode("");
    setNewWOId("");
    setWoList([]);
    setSelectedWO(null);
    setLineItems([]);
    setNewOpen(true);
  }

  function onVendorSelect(vc: string) {
    setNewVendorCode(vc);
    setNewWOId("");
    setSelectedWO(null);
    setLineItems([]);
  }

  function onWOSelect(woId: string) {
    setNewWOId(woId);
    const wo = woList.find((w) => w.id === woId) || null;
    setSelectedWO(wo);
    if (wo) {
      setLineItems(
        wo.scopeItems.map((si) => ({
          scopeItemId: si.id,
          description: si.description,
          unit:        si.unit || "",
          plannedQty:  si.plannedQty || 0,
          billedQty:   0,
          rate:        si.rate || 0,
          amount:      0,
        }))
      );
    } else {
      setLineItems([]);
    }
  }

  function updateLineItem(idx: number, field: "billedQty" | "rate", val: number) {
    setLineItems((prev) =>
      prev.map((li, i) => {
        if (i !== idx) return li;
        const updated = { ...li, [field]: val };
        updated.amount = Math.round(updated.billedQty * updated.rate);
        return updated;
      })
    );
  }

  async function handleSubmitBill() {
    if (!newWOId) { message.error("Select a Work Order"); return; }
    const hasQty = lineItems.some((li) => li.billedQty > 0);
    if (!hasQty) { message.error("Enter billed quantity for at least one work item"); return; }
    try {
      const values = await newForm.validateFields();
      setNewSaving(true);
      const payload = {
        workOrderId:       newWOId,
        billDate:          dayjs(values.billDate).toISOString(),
        generatedBy:       values.generatedBy,
        contractorRefNo:   values.contractorRefNo,
        billingPeriodFrom: values.billingPeriodFrom ? dayjs(values.billingPeriodFrom).toISOString() : undefined,
        billingPeriodTo:   values.billingPeriodTo   ? dayjs(values.billingPeriodTo).toISOString()   : undefined,
        remarks:           values.remarks,
        lineItems:         lineItems.filter((li) => li.billedQty > 0),
      };
      const res = await apiClient.post<{ bill: any }>("/bills", payload);
      setBills((prev) => [normalizeId(res.data.bill), ...prev]);
      message.success(`Bill ${res.data.bill.billNo} submitted for approval`);
      setNewOpen(false);
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.message || "Failed to create bill");
    } finally {
      setNewSaving(false);
    }
  }

  // ── Approve / Reject ─────────────────────────────────────────

  function openAction(bill: Bill, type: "approve" | "reject") {
    setActionBillId(bill.id);
    setActionType(type);
    actionForm.resetFields();
    setActionOpen(true);
  }

  async function handleAction() {
    if (!actionBillId) return;
    try {
      const values = await actionForm.validateFields();
      setActionSaving(true);
      const endpoint =
        actionType === "approve"
          ? `/bills/${actionBillId}/approve`
          : `/bills/${actionBillId}/reject`;
      const body =
        actionType === "approve"
          ? { remarks: values.remarks }
          : { reason: values.reason };
      const res = await apiClient.patch<{ bill: any }>(endpoint, body);
      const updated = normalizeId(res.data.bill);
      setBills((prev) => prev.map((b) => (b.id === actionBillId ? updated : b)));
      message.success(actionType === "approve" ? "Bill approved" : "Bill rejected");
      setActionOpen(false);
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.message || "Action failed");
    } finally {
      setActionSaving(false);
    }
  }

  // ── Pay ──────────────────────────────────────────────────────

  function openPay(bill: Bill) {
    setPayBillId(bill.id);
    payForm.resetFields();
    payForm.setFieldsValue({ paymentDate: dayjs(), paymentMode: "neft" });
    setPayOpen(true);
  }

  async function handlePay() {
    if (!payBillId) return;
    try {
      const values = await payForm.validateFields();
      setPaySaving(true);
      const body = {
        paymentUTR:        values.paymentUTR,
        paymentMode:       values.paymentMode,
        paymentDate:       values.paymentDate ? dayjs(values.paymentDate).toISOString() : undefined,
        paymentBank:       values.paymentBank,
        paymentReleasedBy: values.paymentReleasedBy,
      };
      const res = await apiClient.patch<{ bill: any }>(`/bills/${payBillId}/pay`, body);
      const updated = normalizeId(res.data.bill);
      setBills((prev) => prev.map((b) => (b.id === payBillId ? updated : b)));
      message.success("Payment recorded");
      setPayOpen(false);
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.message || "Failed to record payment");
    } finally {
      setPaySaving(false);
    }
  }

  // ── Table columns ────────────────────────────────────────────

  const payTarget = useMemo(
    () => (payBillId ? bills.find((b) => b.id === payBillId) || null : null),
    [bills, payBillId]
  );

  const actionTarget = useMemo(
    () => (actionBillId ? bills.find((b) => b.id === actionBillId) || null : null),
    [bills, actionBillId]
  );

  const columns = [
    {
      title: "Bill No.",
      dataIndex: "billNo",
      width: 110,
      render: (v: string) => (
        <span style={{ fontFamily: "monospace", color: "#f37916", fontWeight: 700 }}>{v}</span>
      ),
    },
    {
      title: "Date",
      dataIndex: "billDate",
      width: 100,
      render: (v: string) => (v ? dayjs(v).format("DD MMM YYYY") : "—"),
    },
    {
      title: "Work Order",
      dataIndex: "workOrderNo",
      width: 110,
      render: (v: string) => (
        <Tag color="orange" style={{ fontFamily: "monospace", fontWeight: 600 }}>
          {v}
        </Tag>
      ),
    },
    { title: "Project",    dataIndex: "projectName", width: 160 },
    { title: "Contractor", dataIndex: "vendorName",  width: 160 },
    {
      title: "Amount",
      dataIndex: "amount",
      width: 130,
      render: (v: number) => (
        <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{fmt(v)}</span>
      ),
    },
    {
      title: "Generated By",
      dataIndex: "generatedBy",
      width: 130,
      render: (v: string) => v || <span style={{ color: "#c0c4cc" }}>—</span>,
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 120,
      render: (v: BillStatus) => (
        <Tag color={STATUS_CFG[v]?.antColor || "default"} style={{ fontWeight: 600, fontSize: 11 }}>
          {STATUS_CFG[v]?.label || v}
        </Tag>
      ),
    },
    {
      title: "Actions",
      width: 210,
      render: (_: unknown, r: Bill) => (
        <Space size={0} wrap>
          <Button
            type="link" size="small" icon={<EyeOutlined />}
            onClick={() => { setViewBill(r); setViewOpen(true); }}
          >
            View
          </Button>
          {(r.status === "submitted" || r.status === "verified") && (
            <>
              <Button
                type="link" size="small"
                style={{ color: "#16a85a" }} icon={<CheckCircleOutlined />}
                onClick={() => openAction(r, "approve")}
              >
                Approve
              </Button>
              <Button
                type="link" size="small" danger icon={<CloseCircleOutlined />}
                onClick={() => openAction(r, "reject")}
              >
                Reject
              </Button>
            </>
          )}
          {r.status === "approved" && (
            <Button
              type="link" size="small"
              style={{ color: "#7c3aed", fontWeight: 700 }} icon={<DollarOutlined />}
              onClick={() => openPay(r)}
            >
              Pay
            </Button>
          )}
        </Space>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────────────────

  return (
    <PageShell
      title="Billing & Payments"
      description="Generate bills for completed work · Approval chain · Payment release"
      cta={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={openNewBill}
          style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
        >
          New Bill
        </Button>
      }
    >
      {/* Stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <StatCard
            title="Pending Approval"
            value={stats.submitted}
            sub="submitted bills"
            color="#1677ff"
            bg="#f0f6ff"
            icon={<ClockCircleOutlined />}
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="Approved"
            value={stats.approved}
            sub="awaiting payment"
            color="#16a85a"
            bg="#f0faf4"
            icon={<CheckCircleOutlined />}
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="Payments Released"
            value={stats.paid}
            color="#7c3aed"
            icon={<DollarOutlined />}
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="Total Paid"
            value={fmt(stats.totalPaid)}
            color="#16a85a"
            bg="#f0faf4"
            icon={<FileTextOutlined />}
          />
        </Col>
      </Row>

      {/* Filter bar */}
      <div
        style={{
          display: "flex", gap: 10, flexWrap: "wrap",
          marginBottom: 14, alignItems: "center",
        }}
      >
        <Input.Search
          placeholder="Search bills…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 280 }}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 180 }}
          options={[
            { label: "All Status",  value: "all" },
            { label: "Submitted",   value: "submitted" },
            { label: "Verified",    value: "verified" },
            { label: "Approved",    value: "approved" },
            { label: "Rejected",    value: "rejected" },
            { label: "Paid",        value: "paid" },
          ]}
        />
        <span style={{ marginLeft: "auto", color: "#9ba3b8", fontSize: 12 }}>
          {filteredBills.length} bill{filteredBills.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Bills table */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E5E7EB",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <Spin spinning={loading}>
          <Table
            rowKey="id"
            dataSource={filteredBills}
            columns={columns}
            scroll={{ x: 1200 }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{
              emptyText: loading ? " " : (
                <div style={{ padding: "48px", textAlign: "center", color: "#9ba3b8" }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🧾</div>
                  <div style={{ fontWeight: 700, color: "#5a6278", fontSize: 15 }}>No bills yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Click "New Bill" to generate the first bill for completed work.
                  </div>
                </div>
              ),
            }}
          />
        </Spin>
      </div>

      {/* ── View Drawer ──────────────────────────────────────────── */}
      <Drawer
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        width={720}
        title={
          currentViewBill && (
            <div>
              <span style={{ fontFamily: "monospace", color: "#f37916", fontWeight: 800, fontSize: 16 }}>
                {currentViewBill.billNo}
              </span>
              <Tag
                color={STATUS_CFG[currentViewBill.status]?.antColor || "default"}
                style={{ marginLeft: 12, fontWeight: 600 }}
              >
                {STATUS_CFG[currentViewBill.status]?.label}
              </Tag>
              <div style={{ fontSize: 12, color: "#9ba3b8", fontWeight: 400, marginTop: 4 }}>
                {currentViewBill.vendorName} · {currentViewBill.workOrderNo} ·{" "}
                {dayjs(currentViewBill.billDate).format("DD MMM YYYY")}
              </div>
            </div>
          )
        }
        extra={
          currentViewBill && (
            <Space>
              {(currentViewBill.status === "submitted" || currentViewBill.status === "verified") && (
                <>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    style={{ background: "#16a85a", borderColor: "#16a85a" }}
                    onClick={() => { setViewOpen(false); openAction(currentViewBill, "approve"); }}
                  >
                    Approve
                  </Button>
                  <Button
                    danger
                    icon={<CloseCircleOutlined />}
                    onClick={() => { setViewOpen(false); openAction(currentViewBill, "reject"); }}
                  >
                    Reject
                  </Button>
                </>
              )}
              {currentViewBill.status === "approved" && (
                <Button
                  type="primary"
                  icon={<DollarOutlined />}
                  style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
                  onClick={() => { setViewOpen(false); openPay(currentViewBill); }}
                >
                  Record Payment
                </Button>
              )}
            </Space>
          )
        }
      >
        {currentViewBill && (
          <>
            {/* Bill header */}
            <div
              style={{
                border: "1px solid #e4e7ee",
                borderRadius: 10,
                padding: 16,
                marginBottom: 16,
                background: "#fafbff",
              }}
            >
              <Row gutter={[16, 8]}>
                <Col span={12}>
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Project</span>}>
                      <span style={{ fontWeight: 700 }}>{currentViewBill.projectName}</span>
                    </Descriptions.Item>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Contractor</span>}>
                      {currentViewBill.vendorName}
                    </Descriptions.Item>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Vendor Code</span>}>
                      <Tag color="blue" style={{ fontFamily: "monospace" }}>{currentViewBill.vendorCode}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Work Order</span>}>
                      <Tag color="orange" style={{ fontFamily: "monospace" }}>{currentViewBill.workOrderNo}</Tag>
                    </Descriptions.Item>
                  </Descriptions>
                </Col>
                <Col span={12}>
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Bill Date</span>}>
                      {dayjs(currentViewBill.billDate).format("DD MMM YYYY")}
                    </Descriptions.Item>
                    {currentViewBill.billingPeriodFrom && (
                      <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Billing Period</span>}>
                        {dayjs(currentViewBill.billingPeriodFrom).format("DD MMM")}
                        {" – "}
                        {currentViewBill.billingPeriodTo ? dayjs(currentViewBill.billingPeriodTo).format("DD MMM YYYY") : ""}
                      </Descriptions.Item>
                    )}
                    {currentViewBill.contractorRefNo && (
                      <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Ref No.</span>}>
                        {currentViewBill.contractorRefNo}
                      </Descriptions.Item>
                    )}
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Generated By</span>}>
                      <strong>{currentViewBill.generatedBy || "—"}</strong>
                    </Descriptions.Item>
                  </Descriptions>
                </Col>
              </Row>
            </div>

            {/* Reject reason */}
            {currentViewBill.status === "rejected" && currentViewBill.rejectReason && (
              <Alert
                type="error"
                showIcon
                message={<span><strong>Rejection Reason:</strong> {currentViewBill.rejectReason}</span>}
                style={{ marginBottom: 16 }}
              />
            )}

            {/* Line items */}
            <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1f2e", marginBottom: 10 }}>
              Work Items Billed
            </div>
            <div style={{ overflowX: "auto", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f5f6f8" }}>
                    {["Work Item", "Unit", "BOQ Qty", "Billed Qty", "Rate (₹)", "Amount"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "8px 10px", fontWeight: 700,
                          color: "#5a6278", textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(currentViewBill.lineItems || []).map((li, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f5f6f8" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600, color: "#1a1f2e" }}>
                        {li.description}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#9ba3b8" }}>{li.unit}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace" }}>
                        {(li.plannedQty || 0).toLocaleString("en-IN")}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#f37916" }}>
                        {(li.billedQty || 0).toLocaleString("en-IN")}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace" }}>
                        {li.rate.toLocaleString("en-IN")}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#16a85a" }}>
                        {fmt(li.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: "#f5f6f8", fontWeight: 700 }}>
                    <td colSpan={5} style={{ padding: "8px 10px", textAlign: "right", color: "#5a6278" }}>
                      Total Billed Amount
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", color: "#f37916", fontSize: 14 }}>
                      {fmt(currentViewBill.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Financial summary */}
            {(() => {
              const gross  = currentViewBill.amount;
              const gstAmt = Math.round(gross * (currentViewBill.gstPercent || 0) / 100);
              const tdsAmt = Math.round(gross * (currentViewBill.tdsPercent || 0) / 100);
              const net    = gross + gstAmt - tdsAmt;
              return (
                <div
                  style={{
                    border: "1px solid #e4e7ee", borderRadius: 8,
                    overflow: "hidden", fontFamily: "monospace", fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      background: "#f5f6f8", padding: "8px 14px",
                      fontWeight: 700, fontSize: 11, color: "#5a6278",
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}
                  >
                    Financial Summary
                  </div>
                  <div style={{ padding: "8px 14px" }}>
                    {[
                      { label: "Gross Amount",                          value: fmt(gross),   color: "#1a1f2e" },
                      { label: `GST @ ${currentViewBill.gstPercent}%`, value: fmt(gstAmt),  color: "#5a6278" },
                      { label: `TDS @ ${currentViewBill.tdsPercent}%`, value: `(${fmt(tdsAmt)})`, color: "#e03b3b" },
                      { label: "NET PAYABLE",                           value: fmt(net),      color: "#16a85a", bold: true },
                    ].map((r, i, arr) => (
                      <div
                        key={i}
                        style={{
                          display: "flex", justifyContent: "space-between",
                          padding: "5px 0",
                          borderTop: i === arr.length - 1 ? "2px solid #e4e7ee" : "none",
                          marginTop: i === arr.length - 1 ? 4 : 0,
                          color: r.color,
                          fontWeight: (r as any).bold ? 700 : 400,
                          fontSize: (r as any).bold ? 14 : 13,
                        }}
                      >
                        <span>{r.label}</span>
                        <span>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Status trail */}
            {currentViewBill.remarks && (
              <>
                <Divider />
                <div style={{ color: "#5a6278", fontSize: 13 }}>
                  <strong>Remarks:</strong> {currentViewBill.remarks}
                </div>
              </>
            )}

            {/* Approval info */}
            {currentViewBill.approvedBy && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0faf4", borderRadius: 8, border: "1px solid #b7e8c8" }}>
                <div style={{ fontSize: 12, color: "#16a85a", fontWeight: 700 }}>
                  ✅ Approved by {(currentViewBill.approvedBy as any)?.name || "—"}
                  {currentViewBill.approvedAt && (
                    <span style={{ fontWeight: 400, color: "#9ba3b8", marginLeft: 8 }}>
                      {dayjs(currentViewBill.approvedAt).format("DD MMM YYYY")}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Payment info */}
            {currentViewBill.status === "paid" && (
              <>
                <Divider />
                <div
                  style={{
                    background: "#f5f0ff", border: "1px solid #c4b5fd",
                    borderRadius: 8, padding: "14px 16px",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#7c3aed", marginBottom: 10 }}>
                    💳 Payment Released
                  </div>
                  <Descriptions column={2} size="small" colon={false}>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Payment Date</span>}>
                      {currentViewBill.paymentDate ? dayjs(currentViewBill.paymentDate).format("DD MMM YYYY") : "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Mode</span>}>
                      <Tag color="purple">{currentViewBill.paymentMode?.toUpperCase() || "—"}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>UTR / Ref</span>}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700 }}>
                        {currentViewBill.paymentUTR || "—"}
                      </span>
                    </Descriptions.Item>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Bank</span>}>
                      {currentViewBill.paymentBank || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Released By</span>}>
                      {currentViewBill.paymentReleasedBy || "—"}
                    </Descriptions.Item>
                  </Descriptions>
                </div>
              </>
            )}
          </>
        )}
      </Drawer>

      {/* ── New Bill Drawer ───────────────────────────────────────── */}
      <Drawer
        open={newOpen}
        onClose={() => setNewOpen(false)}
        placement="right"
        width={800}
        title={
          <Space>
            <span style={{ fontSize: 20 }}>📄</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>New Bill</div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                Select project → contractor → work order → fill quantities
              </div>
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              size="large"
              type="primary"
              loading={newSaving}
              onClick={handleSubmitBill}
              style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
            >
              Submit Bill for Approval
            </Button>
          </div>
        }
        destroyOnClose
      >
        {/* Step 1 — Select Project / WO */}
        <div
          style={{
            background: "#f5f6f8", borderRadius: 8,
            padding: "14px 16px", marginBottom: 20,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1f2e", marginBottom: 12 }}>
            Step 1 — Select Work Order
          </div>
          <Row gutter={16}>
            <Col span={8}>
              <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 600, color: "#5a6278" }}>Project *</div>
              <Select
                showSearch
                placeholder="Select project…"
                style={{ width: "100%" }}
                value={newProjectId || undefined}
                onChange={(v) => { setNewProjectId(v); setNewVendorCode(""); setNewWOId(""); setSelectedWO(null); setLineItems([]); }}
                filterOption={(input, opt) =>
                  String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())
                }
                options={projects.map((p) => ({
                  value: p.id,
                  label: `${p.code} — ${p.name}`,
                }))}
              />
            </Col>
            <Col span={8}>
              <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 600, color: "#5a6278" }}>Contractor *</div>
              <Select
                showSearch
                placeholder={newProjectId ? "Select contractor…" : "Select project first"}
                style={{ width: "100%" }}
                disabled={!newProjectId || contractorsInProject.length === 0}
                value={newVendorCode || undefined}
                onChange={onVendorSelect}
                options={contractorsInProject.map((c) => ({
                  value: c.vendorCode,
                  label: `${c.vendorCode} — ${c.vendorName}`,
                }))}
              />
            </Col>
            <Col span={8}>
              <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 600, color: "#5a6278" }}>Work Order *</div>
              <Select
                showSearch
                placeholder={newVendorCode ? "Select work order…" : "Select contractor first"}
                style={{ width: "100%" }}
                disabled={!newVendorCode}
                value={newWOId || undefined}
                onChange={onWOSelect}
                options={filteredWOs.map((wo) => ({
                  value: wo.id,
                  label: wo.workOrderNo,
                }))}
              />
            </Col>
          </Row>

          {/* Contractor details auto-fill */}
          {newVendorCode && (
            <div
              style={{
                marginTop: 12, padding: "10px 12px",
                background: "#fff", borderRadius: 6,
                border: "1px solid #e4e7ee", fontSize: 12,
              }}
            >
              <Row gutter={16}>
                <Col span={6}>
                  <div style={{ color: "#9ba3b8", fontWeight: 600, marginBottom: 2 }}>Vendor Code</div>
                  <Tag color="blue" style={{ fontFamily: "monospace" }}>{newVendorCode}</Tag>
                </Col>
                <Col span={8}>
                  <div style={{ color: "#9ba3b8", fontWeight: 600, marginBottom: 2 }}>Contractor Name</div>
                  <div style={{ fontWeight: 700 }}>
                    {contractorsInProject.find((c) => c.vendorCode === newVendorCode)?.vendorName || "—"}
                  </div>
                </Col>
                {selectedContractor && (
                  <>
                    <Col span={5}>
                      <div style={{ color: "#9ba3b8", fontWeight: 600, marginBottom: 2 }}>Owner</div>
                      <div>{selectedContractor.ownerName || "—"}</div>
                    </Col>
                    <Col span={5}>
                      <div style={{ color: "#9ba3b8", fontWeight: 600, marginBottom: 2 }}>Mobile</div>
                      <div style={{ fontFamily: "monospace" }}>{selectedContractor.mobile || "—"}</div>
                    </Col>
                  </>
                )}
              </Row>
            </div>
          )}
        </div>

        {/* Step 2 — Bill Details + Remarks (single Form instance) */}
        <Form form={newForm} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="Bill Date" name="billDate" rules={[{ required: true, message: "Required" }]}>
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" defaultValue={dayjs()} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Period From" name="billingPeriodFrom">
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Period To" name="billingPeriodTo">
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Generated By (Your Name)"
                name="generatedBy"
                rules={[{ required: true, message: "Required" }]}
              >
                <Input placeholder="Full name of person generating this bill" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Contractor Ref. No." name="contractorRefNo">
                <Input placeholder="e.g. ABCI/2026/003" />
              </Form.Item>
            </Col>
          </Row>

        {/* Step 3 — Line Items */}
        {lineItems.length > 0 && (
          <>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1f2e", marginBottom: 10 }}>
              Work Items — Enter Quantities
            </div>
            {lineItems.map((li, idx) => (
              <div
                key={li.scopeItemId}
                style={{
                  border: "1px solid #e4e7ee", borderRadius: 8,
                  padding: "12px 14px", marginBottom: 10,
                }}
              >
                <div
                  style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: "#1a1f2e" }}>{li.description}</div>
                    <div style={{ fontSize: 11, color: "#9ba3b8", marginTop: 2 }}>
                      BOQ: {(li.plannedQty || 0).toLocaleString("en-IN")} {li.unit}
                    </div>
                  </div>
                  <div style={{ fontFamily: "monospace", fontWeight: 700, color: "#16a85a", fontSize: 14 }}>
                    {li.billedQty > 0 ? fmt(li.amount) : "₹ —"}
                  </div>
                </div>
                <Row gutter={12} align="middle">
                  <Col flex="0 0 200px">
                    <div style={{ fontSize: 11, color: "#5a6278", marginBottom: 4 }}>
                      Billed Qty ({li.unit})
                    </div>
                    <InputNumber
                      style={{ width: "100%" }}
                      min={0}
                      placeholder="0"
                      value={li.billedQty || undefined}
                      onChange={(v) => updateLineItem(idx, "billedQty", Number(v) || 0)}
                    />
                  </Col>
                  <Col flex="0 0 200px">
                    <div style={{ fontSize: 11, color: "#5a6278", marginBottom: 4 }}>
                      Rate (₹ / {li.unit || "unit"})
                    </div>
                    <InputNumber
                      style={{ width: "100%" }}
                      min={0}
                      placeholder="0.00"
                      value={li.rate || undefined}
                      onChange={(v) => updateLineItem(idx, "rate", Number(v) || 0)}
                    />
                  </Col>
                  <Col flex="1">
                    <div style={{ fontSize: 11, color: "#5a6278", marginBottom: 4 }}>Amount</div>
                    <div style={{ fontFamily: "monospace", fontWeight: 700, color: "#1a1f2e", fontSize: 14, paddingTop: 5 }}>
                      {li.billedQty > 0 && li.rate > 0 ? fmt(li.amount) : "—"}
                    </div>
                  </Col>
                </Row>
              </div>
            ))}

            {/* Total */}
            <div
              style={{
                background: "#fff8f3", border: "1px solid #f8c9a0",
                borderRadius: 8, padding: "12px 16px",
                display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: 16,
              }}
            >
              <span style={{ fontWeight: 700, color: "#d4620c" }}>Total Bill Amount</span>
              <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 20, color: "#d4620c" }}>
                {fmt(totalLineAmount)}
              </span>
            </div>
          </>
        )}

        {selectedWO && lineItems.length === 0 && (
          <Alert
            type="info"
            message="No scope items found for this work order."
            style={{ marginBottom: 16 }}
          />
        )}

          <Form.Item label="Remarks" name="remarks">
            <Input.TextArea rows={2} placeholder="Describe the scope of work covered in this bill…" />
          </Form.Item>
        </Form>
      </Drawer>

      {/* ── Approve / Reject Drawer ───────────────────────────────── */}
      <Drawer
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        placement="right"
        width={480}
        title={
          <Space>
            <span style={{ fontSize: 20 }}>{actionType === "approve" ? "✅" : "❌"}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                {actionType === "approve" ? "Approve" : "Reject"} Bill
                {actionTarget ? ` — ${actionTarget.billNo}` : ""}
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                {actionTarget && `${actionTarget.vendorName} · ${actionTarget.workOrderNo}`}
              </div>
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => setActionOpen(false)}>Cancel</Button>
            <Button
              size="large"
              type="primary"
              loading={actionSaving}
              onClick={handleAction}
              style={{
                background: actionType === "approve" ? "#16a85a" : "#e03b3b",
                borderColor: actionType === "approve" ? "#16a85a" : "#e03b3b",
              }}
            >
              {actionType === "approve" ? "Approve" : "Reject"}
            </Button>
          </div>
        }
        destroyOnClose
      >
        {actionTarget && (
          <>
            <div
              style={{
                background: "#f5f6f8", borderRadius: 8,
                padding: "12px 14px", marginBottom: 16,
                display: "flex", justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "#9ba3b8", fontWeight: 700, textTransform: "uppercase" }}>
                  Bill Amount
                </div>
                <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 20, color: "#f37916" }}>
                  {fmt(actionTarget.amount)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#9ba3b8" }}>{actionTarget.vendorName}</div>
                <Tag color="orange" style={{ fontFamily: "monospace", marginTop: 4 }}>
                  {actionTarget.workOrderNo}
                </Tag>
              </div>
            </div>

            <Form form={actionForm} layout="vertical">
              {actionType === "reject" ? (
                <Form.Item
                  label="Reason for Rejection"
                  name="reason"
                  rules={[{ required: true, message: "Please provide a reason" }]}
                >
                  <Input.TextArea
                    rows={4}
                    placeholder="Explain why this bill is being rejected…"
                  />
                </Form.Item>
              ) : (
                <Form.Item label="Remarks (optional)" name="remarks">
                  <Input.TextArea
                    rows={3}
                    placeholder="Any approval conditions or notes…"
                  />
                </Form.Item>
              )}
            </Form>
          </>
        )}
      </Drawer>

      {/* ── Pay Drawer ────────────────────────────────────────────── */}
      <Drawer
        open={payOpen}
        onClose={() => { setPayOpen(false); setPayBillId(null); }}
        placement="right"
        width={520}
        title={
          <Space>
            <span style={{ fontSize: 20 }}>💳</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                Record Payment{payTarget ? ` — ${payTarget.billNo}` : ""}
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                Enter UTR / cheque details to release payment
              </div>
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => { setPayOpen(false); setPayBillId(null); }}>Cancel</Button>
            <Button
              size="large"
              type="primary"
              loading={paySaving}
              onClick={handlePay}
              style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
            >
              Record Payment
            </Button>
          </div>
        }
        destroyOnClose
      >
        {payTarget && (
          <>
            <div
              style={{
                background: "#f5f0ff", border: "1px solid #c4b5fd",
                borderRadius: 8, padding: "12px 14px", marginBottom: 16,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "#9ba3b8", fontWeight: 700, textTransform: "uppercase" }}>
                  Net Payable to Contractor
                </div>
                <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 22, color: "#7c3aed" }}>
                  {fmt(payTarget.amount)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{payTarget.vendorName}</div>
                <div style={{ fontSize: 11, color: "#9ba3b8" }}>{payTarget.workOrderNo}</div>
              </div>
            </div>

            <Form form={payForm} layout="vertical">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Payment Date" name="paymentDate" rules={[{ required: true }]}>
                    <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Payment Mode" name="paymentMode" rules={[{ required: true }]}>
                    <Select
                      options={[
                        { label: "NEFT", value: "neft" },
                        { label: "RTGS", value: "rtgs" },
                        { label: "IMPS", value: "imps" },
                        { label: "Cheque", value: "cheque" },
                        { label: "Cash", value: "cash" },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="UTR / Transaction Reference" name="paymentUTR">
                <Input placeholder="e.g. HDFC202606270001234" style={{ fontFamily: "monospace" }} />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Bank" name="paymentBank">
                    <Input placeholder="e.g. HDFC Bank" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Released By" name="paymentReleasedBy" rules={[{ required: true }]}>
                    <Input placeholder="Finance officer name" />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </>
        )}
      </Drawer>
    </PageShell>
  );
}
