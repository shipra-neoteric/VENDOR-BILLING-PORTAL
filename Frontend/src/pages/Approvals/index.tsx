import { useState, useMemo } from "react";
import {
  Tabs,
  Table,
  Button,
  Tag,
  Modal,
  Form,
  Input,
  Descriptions,
  Row,
  Col,
  Empty,
  message,
} from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  runningBills as seedBills,
  workOrders as seedWorkOrders,
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

type ActionType = "verify" | "approve" | "reject";

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

function calcAmounts(b: RunningBill) {
  const gstAmt = (b.amount * b.gstPercent) / 100;
  const gross  = b.amount + gstAmt;
  const tdsAmt = (gross * b.tdsPercent) / 100;
  const net    = gross - tdsAmt;
  return { gstAmt, gross, tdsAmt, net };
}

// ── Bill action card (module-level to avoid remount on re-render) ─────────────
function BillCard({
  bill,
  showVerify,
  showApprove,
  onAction,
}: {
  bill: RunningBill;
  showVerify?: boolean;
  showApprove?: boolean;
  onAction: (bill: RunningBill, type: ActionType) => void;
}) {
  const wo = seedWorkOrders.find((w) => w.id === bill.workOrderId);
  const { gross, net } = calcAmounts(bill);

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e4e7ee",
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#f8c9a0";
        e.currentTarget.style.boxShadow = "0 3px 10px rgba(243,121,22,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#e4e7ee";
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
      }}
    >
      {/* Left: bill info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 5,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: 700,
              color: "#f37916",
              fontSize: 14,
            }}
          >
            {bill.billNo}
          </span>
          <Tag color="orange" style={{ fontFamily: "monospace", marginLeft: 0 }}>
            {bill.workOrderNo}
          </Tag>
          <Tag
            color={STATUS_CFG[bill.status].color}
            style={{ marginLeft: 0 }}
          >
            {STATUS_CFG[bill.status].label.toUpperCase()}
          </Tag>
        </div>

        <div style={{ fontWeight: 600, fontSize: 13, color: "#1a1f2e" }}>
          {bill.vendorName}
        </div>
        <div style={{ fontSize: 11, color: "#5a6278", marginTop: 2 }}>
          {bill.projectName}
          {wo?.scopeOfWork &&
            ` · ${wo.scopeOfWork.slice(0, 60)}${
              wo.scopeOfWork.length > 60 ? "…" : ""
            }`}
        </div>
        {bill.description && (
          <div style={{ fontSize: 11, color: "#9ba3b8", marginTop: 3 }}>
            {bill.description}
          </div>
        )}
        <div style={{ fontSize: 11, color: "#9ba3b8", marginTop: 3 }}>
          {bill.billRefNo && `Ref: ${bill.billRefNo} · `}
          {dayjs(bill.billDate).format("DD MMM YYYY")}
          {bill.submittedAt &&
            ` · Submitted ${dayjs(bill.submittedAt).format("DD MMM YYYY")}`}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          {showVerify && (
            <Button
              size="small"
              icon={<CheckOutlined />}
              style={{
                background: "#16a85a",
                borderColor: "#16a85a",
                color: "#fff",
              }}
              onClick={() => onAction(bill, "verify")}
            >
              Verify
            </Button>
          )}
          {showApprove && (
            <Button
              size="small"
              icon={<SafetyCertificateOutlined />}
              type="primary"
              style={{ background: "#f37916", borderColor: "#f37916" }}
              onClick={() => onAction(bill, "approve")}
            >
              Approve
            </Button>
          )}
          <Button
            size="small"
            icon={<CloseOutlined />}
            danger
            onClick={() => onAction(bill, "reject")}
          >
            Reject
          </Button>
        </div>
      </div>

      {/* Right: amount summary */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 18,
            fontWeight: 700,
            color: "#f37916",
          }}
        >
          {fmt(gross)}
        </div>
        <div style={{ fontSize: 10, color: "#9ba3b8" }}>incl. GST</div>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 13,
            color: "#16a85a",
            fontWeight: 600,
            marginTop: 6,
          }}
        >
          {fmt(net)}
        </div>
        <div style={{ fontSize: 10, color: "#9ba3b8" }}>net payable</div>
      </div>
    </div>
  );
}

// ── History table columns ─────────────────────────────────────────────────────
const historyColumns = [
  {
    title: "Bill No.",
    dataIndex: "billNo",
    render: (v: string) => (
      <span
        style={{ fontFamily: "monospace", color: "#f37916", fontWeight: 600 }}
      >
        {v}
      </span>
    ),
  },
  {
    title: "Date",
    dataIndex: "billDate",
    render: (v: string) => dayjs(v).format("DD MMM YYYY"),
  },
  {
    title: "Work Order",
    dataIndex: "workOrderNo",
    render: (v: string) => (
      <Tag color="orange" style={{ fontFamily: "monospace" }}>
        {v}
      </Tag>
    ),
  },
  { title: "Vendor", dataIndex: "vendorName" },
  {
    title: "Net Payable",
    render: (_: unknown, r: RunningBill) => (
      <span
        style={{
          fontFamily: "monospace",
          color: "#16a85a",
          fontWeight: 600,
        }}
      >
        {fmt(calcAmounts(r).net)}
      </span>
    ),
  },
  {
    title: "Status",
    dataIndex: "status",
    render: (v: BillStatus) => (
      <Tag color={STATUS_CFG[v].color}>
        {STATUS_CFG[v].label.toUpperCase()}
      </Tag>
    ),
  },
  {
    title: "Verified By",
    render: (_: unknown, r: RunningBill) =>
      r.verifiedBy ? (
        <span style={{ fontSize: 12 }}>
          {r.verifiedBy}
          <br />
          <span style={{ color: "#9ba3b8", fontSize: 11 }}>
            {r.verifiedAt && dayjs(r.verifiedAt).format("DD MMM YYYY")}
          </span>
        </span>
      ) : (
        <span style={{ color: "#9ba3b8" }}>—</span>
      ),
  },
  {
    title: "Approved / Rejected By",
    render: (_: unknown, r: RunningBill) => {
      if (r.approvedBy)
        return (
          <span style={{ fontSize: 12 }}>
            {r.approvedBy}
            <br />
            <span style={{ color: "#9ba3b8", fontSize: 11 }}>
              {r.approvedAt && dayjs(r.approvedAt).format("DD MMM YYYY")}
            </span>
          </span>
        );
      if (r.rejectedBy)
        return (
          <span style={{ fontSize: 12, color: "#e03b3b" }}>
            {r.rejectedBy}
            {r.rejectReason ? ` — ${r.rejectReason}` : ""}
          </span>
        );
      return <span style={{ color: "#9ba3b8" }}>—</span>;
    },
  },
];

// ── Main component ────────────────────────────────────────────────────────────
export default function Approvals() {
  const [bills, setBills] = useState<RunningBill[]>(seedBills);
  const [activeTab, setActiveTab] = useState("queue");
  const [actionBill, setActionBill] = useState<RunningBill | null>(null);
  const [actionType, setActionType] = useState<ActionType>("verify");
  const [modalOpen, setModalOpen] = useState(false);
  const [remarks, setRemarks] = useState("");

  const submitted = useMemo(
    () => bills.filter((b) => b.status === "submitted"),
    [bills]
  );
  const verified = useMemo(
    () => bills.filter((b) => b.status === "verified"),
    [bills]
  );
  const approved = useMemo(
    () => bills.filter((b) => b.status === "approved"),
    [bills]
  );
  const totalPending = submitted.length + verified.length;

  function openAction(bill: RunningBill, type: ActionType) {
    setActionBill(bill);
    setActionType(type);
    setRemarks("");
    setModalOpen(true);
  }

  function executeAction() {
    if (!actionBill) return;
    const today = dayjs().format("YYYY-MM-DD");

    setBills((prev) =>
      prev.map((b) => {
        if (b.id !== actionBill.id) return b;
        if (actionType === "verify")
          return {
            ...b,
            status: "verified" as BillStatus,
            verifiedBy: "Site Engineer",
            verifiedAt: today,
          };
        if (actionType === "approve")
          return {
            ...b,
            status: "approved" as BillStatus,
            approvedBy: "GM / Owner",
            approvedAt: today,
          };
        return {
          ...b,
          status: "rejected" as BillStatus,
          rejectedBy: "GM / Owner",
          rejectReason: remarks || "No reason given",
        };
      })
    );

    const msgs: Record<ActionType, string> = {
      verify:  "Bill verified — forwarded for GM approval",
      approve: "Bill approved & certified",
      reject:  "Bill rejected",
    };
    message.success(msgs[actionType]);
    setModalOpen(false);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Approvals</h1>
        <p className="text-gray-500 text-sm mt-1">
          Review and action running bills through the verification → approval
          workflow.
        </p>
      </div>

      {/* Stats row */}
      <Row gutter={12} style={{ marginBottom: 24 }}>
        {[
          {
            label: "Pending Action",
            value: totalPending,
            color: "#f37916",
            sub: "bills awaiting review",
          },
          {
            label: "Needs Verification",
            value: submitted.length,
            color: "#2563eb",
            sub: "submitted by contractor",
          },
          {
            label: "Needs Approval",
            value: verified.length,
            color: "#0d9488",
            sub: "verified by site engineer",
          },
          {
            label: "Approved",
            value: approved.length,
            color: "#16a85a",
            sub: "certified & closed",
          },
        ].map((s) => (
          <Col key={s.label} xs={12} sm={6}>
            <div
              style={{
                background: "#fff",
                border: "1px solid #e4e7ee",
                borderRadius: 12,
                padding: "16px 18px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
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
                {s.label}
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 26,
                  fontWeight: 700,
                  color: s.color,
                }}
              >
                {s.value}
              </div>
              <div style={{ fontSize: 11, color: "#5a6278", marginTop: 3 }}>
                {s.sub}
              </div>
            </div>
          </Col>
        ))}
      </Row>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "queue",
            label: `Action Queue${totalPending ? ` (${totalPending})` : ""}`,
            children: (
              <>
                {/* Pending Verification */}
                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#5a6278",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Pending Verification
                    </span>
                    <span
                      style={{
                        background: "#eff4ff",
                        color: "#2563eb",
                        borderRadius: 10,
                        padding: "2px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {submitted.length}
                    </span>
                  </div>
                  {submitted.length === 0 ? (
                    <Empty
                      description="No bills pending verification"
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                  ) : (
                    submitted.map((b) => (
                      <BillCard
                        key={b.id}
                        bill={b}
                        showVerify
                        onAction={openAction}
                      />
                    ))
                  )}
                </div>

                <div
                  style={{
                    height: 1,
                    background: "#e4e7ee",
                    margin: "24px 0",
                  }}
                />

                {/* Pending Approval */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#5a6278",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Pending Approval
                    </span>
                    <span
                      style={{
                        background: "#e8fff8",
                        color: "#0d9488",
                        borderRadius: 10,
                        padding: "2px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {verified.length}
                    </span>
                  </div>
                  {verified.length === 0 ? (
                    <Empty
                      description="No bills pending approval"
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                  ) : (
                    verified.map((b) => (
                      <BillCard
                        key={b.id}
                        bill={b}
                        showApprove
                        onAction={openAction}
                      />
                    ))
                  )}
                </div>

                {totalPending === 0 && (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "48px 20px",
                      color: "#9ba3b8",
                    }}
                  >
                    <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                    <div
                      style={{
                        fontSize: 14,
                        color: "#5a6278",
                        fontWeight: 600,
                      }}
                    >
                      All clear!
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      No bills pending your action right now.
                    </div>
                  </div>
                )}
              </>
            ),
          },
          {
            key: "history",
            label: "All Bills",
            children: (
              <Table
                rowKey="id"
                dataSource={[...bills].sort((a, b) =>
                  b.billDate.localeCompare(a.billDate)
                )}
                columns={historyColumns}
                scroll={{ x: true }}
              />
            ),
          },
        ]}
      />

      {/* Action Modal */}
      <Modal
        open={modalOpen}
        title={
          actionType === "verify"
            ? "Verify Bill — Site Engineer"
            : actionType === "approve"
            ? "Approve Bill — GM / Owner"
            : "Reject Bill"
        }
        onCancel={() => setModalOpen(false)}
        onOk={executeAction}
        okText={
          actionType === "verify"
            ? "✓  Verify"
            : actionType === "approve"
            ? "✓  Approve & Certify"
            : "✗  Reject Bill"
        }
        okButtonProps={{
          style:
            actionType === "reject"
              ? { background: "#e03b3b", borderColor: "#e03b3b" }
              : actionType === "approve"
              ? { background: "#f37916", borderColor: "#f37916" }
              : { background: "#16a85a", borderColor: "#16a85a" },
        }}
        destroyOnHidden
        width={480}
      >
        {actionBill &&
          (() => {
            const { gstAmt, gross, tdsAmt, net } = calcAmounts(actionBill);
            return (
              <>
                <Descriptions
                  size="small"
                  column={1}
                  style={{ marginBottom: 16, marginTop: 8 }}
                >
                  <Descriptions.Item label="Bill No.">
                    <span
                      style={{
                        fontFamily: "monospace",
                        color: "#f37916",
                        fontWeight: 600,
                      }}
                    >
                      {actionBill.billNo}
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="Work Order">
                    <Tag
                      color="orange"
                      style={{ fontFamily: "monospace" }}
                    >
                      {actionBill.workOrderNo}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Vendor">
                    {actionBill.vendorName}
                  </Descriptions.Item>
                  <Descriptions.Item label="Date">
                    {dayjs(actionBill.billDate).format("DD MMM YYYY")}
                  </Descriptions.Item>
                  {actionBill.billRefNo && (
                    <Descriptions.Item label="Ref">
                      {actionBill.billRefNo}
                    </Descriptions.Item>
                  )}
                  {actionBill.description && (
                    <Descriptions.Item label="Work Done">
                      {actionBill.description}
                    </Descriptions.Item>
                  )}
                </Descriptions>

                {/* Calc breakdown */}
                <div
                  style={{
                    background: "#fff8f3",
                    border: "1px solid #f8c9a0",
                    borderRadius: 10,
                    padding: "14px 16px",
                    marginBottom: 16,
                    fontFamily: "monospace",
                    fontSize: 13,
                  }}
                >
                  {[
                    {
                      label: "Base Amount",
                      value: fmt(actionBill.amount),
                      color: "#5a6278",
                    },
                    {
                      label: `GST @ ${actionBill.gstPercent}%`,
                      value: fmt(gstAmt),
                      color: "#5a6278",
                    },
                  ].map((r) => (
                    <div
                      key={r.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "3px 0",
                        color: r.color,
                      }}
                    >
                      <span>{r.label}</span>
                      <span>{r.value}</span>
                    </div>
                  ))}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 0 3px",
                      borderTop: "1px solid #f8c9a0",
                      marginTop: 4,
                      color: "#d4620c",
                      fontWeight: 700,
                    }}
                  >
                    <span>GROSS AMOUNT</span>
                    <span>{fmt(gross)}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "3px 0",
                      color: "#5a6278",
                    }}
                  >
                    <span>TDS @ {actionBill.tdsPercent}%</span>
                    <span>({fmt(tdsAmt)})</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 0 0",
                      borderTop: "1px solid #f8c9a0",
                      marginTop: 4,
                      color: "#16a85a",
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    <span>NET PAYABLE</span>
                    <span>{fmt(net)}</span>
                  </div>
                </div>

                <Form.Item
                  label="Remarks"
                  style={{ marginBottom: 0 }}
                  required={actionType === "reject"}
                >
                  <Input.TextArea
                    rows={2}
                    placeholder={
                      actionType === "reject"
                        ? "Reason for rejection…"
                        : "Add remarks or conditions (optional)…"
                    }
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                </Form.Item>
              </>
            );
          })()}
      </Modal>
    </div>
  );
}
