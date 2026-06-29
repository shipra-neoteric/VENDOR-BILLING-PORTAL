import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Tag,
  Select,
  Card,
  Drawer,
  Space,
  Row,
  Col,
  Progress,
  Tooltip,
  Alert,
  Steps,
  Tabs,
  Divider,
  Spin,
  Empty,
  Timeline,
  Statistic,
  Descriptions,
} from "antd";
import {
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
  DollarOutlined,
  InfoCircleOutlined,
  HistoryOutlined,
  WarningOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import type { Project, WorkOrder, ScopeItem, ScopeItemStatus } from "../../types/VendorBilling";

// ── ID normalization (MongoDB _id → id) ───────────────────────

const normalizeId = (obj: any) => ({ ...obj, id: obj._id || obj.id });
const normalizeWO = (wo: any): WorkOrder => ({
  ...normalizeId(wo),
  scopeItems: (wo.scopeItems || []).map((si: any) => ({
    ...normalizeId(si),
    progressEntries: (si.progressEntries || []).map(normalizeId),
    subItems: (si.subItems || []).map(normalizeId),
  })),
});

// ── Constants ─────────────────────────────────────────────────

const SCOPE_STATUS_CFG: Record<ScopeItemStatus, { color: string; bg: string; label: string; antColor: string }> = {
  pending:   { color: "#9ba3b8", bg: "#f5f6f8", label: "Pending",   antColor: "default" },
  running:   { color: "#f37916", bg: "#fff8f3", label: "Running",   antColor: "warning" },
  completed: { color: "#16a85a", bg: "#f0faf4", label: "Completed", antColor: "success" },
};

// ── Helpers ──────────────────────────────────────────────────

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const fmtQty = (n: number) => n.toLocaleString("en-IN");

const isItemDelayed = (item: ScopeItem): boolean => {
  if (item.status === "completed" || !item.plannedEnd) return false;
  return dayjs().isAfter(dayjs(item.plannedEnd), "day");
};

const delayDays = (item: ScopeItem): number =>
  Math.max(0, dayjs().diff(dayjs(item.plannedEnd), "day"));

const getCompletionPct = (item: ScopeItem): number => {
  const base = item.plannedQty || item.subItems.reduce((s, si) => s + si.plannedQty, 0);
  if (!base) return 0;
  return Math.min(100, Math.round((item.completedQty / base) * 100));
};

// ── Stat Card ─────────────────────────────────────────────────

function StatCard({
  title, value, sub, color, bg,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  bg?: string;
}) {
  return (
    <div style={{ background: bg || "#fff", border: "1px solid #e4e7ee", borderRadius: 10, padding: "16px 18px", minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9ba3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || "#1a1f2e", lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#9ba3b8", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Scope Item Detail Drawer ───────────────────────────────────

function ScopeItemDrawer({
  item,
  workOrderNo,
  open,
  onClose,
}: {
  item: ScopeItem | null;
  workOrderNo: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!item) return null;
  const pct = getCompletionPct(item);
  const delayed = isItemDelayed(item);
  const cfg = SCOPE_STATUS_CFG[item.status];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={680}
      title={
        <Space>
          <div
            style={{
              background: cfg.color,
              color: "#fff",
              borderRadius: "50%",
              width: 28, height: 28,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 800,
            }}
          >
            {pct}
            <span style={{ fontSize: 8 }}>%</span>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{item.description}</div>
            <div style={{ fontSize: 12, color: "#9ba3b8", fontWeight: 400 }}>
              Work Order: <span style={{ color: "#f37916", fontFamily: "monospace" }}>{workOrderNo}</span>
              {delayed && <span style={{ color: "#e03b3b", marginLeft: 10 }}>· ⚠ {delayDays(item)} days overdue</span>}
            </div>
          </div>
        </Space>
      }
    >
      <Tabs
        size="small"
        items={[
          {
            key: "overview",
            label: <><InfoCircleOutlined /> Overview</>,
            children: (
              <div>
                {delayed && (
                  <Alert
                    type="error"
                    showIcon
                    message={
                      <span>
                        <strong>{item.description}</strong> is overdue by <strong>{delayDays(item)} days</strong>.
                        Planned end was {dayjs(item.plannedEnd).format("DD MMM YYYY")}.
                      </span>
                    }
                    style={{ marginBottom: 16, borderRadius: 6 }}
                  />
                )}

                <Row gutter={[16, 0]}>
                  <Col span={12}>
                    <div style={{ background: "#f5f6f8", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#9ba3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Planning</div>
                      <Descriptions column={1} size="small" colon={false}>
                        <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Unit</span>}>{item.unit}</Descriptions.Item>
                        <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Planned Qty</span>}>
                          <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{fmtQty(item.plannedQty)} {item.unit}</span>
                        </Descriptions.Item>
                        <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Rate</span>}>
                          <span style={{ fontFamily: "monospace" }}>₹{item.rate.toLocaleString("en-IN")}/{item.unit}</span>
                        </Descriptions.Item>
                        <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Planned Start</span>}>
                          {item.plannedStart ? dayjs(item.plannedStart).format("DD MMM YYYY") : "—"}
                        </Descriptions.Item>
                        <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Planned End</span>}>
                          <span style={{ color: delayed ? "#e03b3b" : "inherit", fontWeight: delayed ? 700 : 400 }}>
                            {item.plannedEnd ? dayjs(item.plannedEnd).format("DD MMM YYYY") : "—"}
                            {delayed && " ⚠"}
                          </span>
                        </Descriptions.Item>
                      </Descriptions>
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ background: "#f5f6f8", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#9ba3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Execution</div>
                      <Descriptions column={1} size="small" colon={false}>
                        <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Status</span>}>
                          <Tag color={cfg.antColor} style={{ fontWeight: 600 }}>{cfg.label}</Tag>
                          {delayed && <Tag color="red" style={{ fontWeight: 600 }}>{delayDays(item)}d Late</Tag>}
                        </Descriptions.Item>
                        <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Completed</span>}>
                          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#16a85a" }}>{fmtQty(item.completedQty)} {item.unit}</span>
                        </Descriptions.Item>
                        <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Remaining</span>}>
                          <span style={{ fontFamily: "monospace" }}>{fmtQty(Math.max(0, item.plannedQty - item.completedQty))} {item.unit}</span>
                        </Descriptions.Item>
                        <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Progress Entries</span>}>
                          {item.progressEntries.length} update{item.progressEntries.length !== 1 ? "s" : ""}
                        </Descriptions.Item>
                      </Descriptions>
                    </div>
                  </Col>
                </Row>

                <div style={{ background: "#fff", border: "1px solid #e4e7ee", borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "#1a1f2e" }}>Completion</span>
                    <span style={{ fontWeight: 800, fontSize: 18, fontFamily: "monospace", color: pct >= 100 ? "#16a85a" : delayed ? "#e03b3b" : "#f37916" }}>
                      {pct}%
                    </span>
                  </div>
                  <Progress
                    percent={pct}
                    strokeColor={pct >= 100 ? "#16a85a" : delayed ? "#e03b3b" : "#f37916"}
                    showInfo={false}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9ba3b8", marginTop: 8 }}>
                    <span>{fmtQty(item.completedQty)} done</span>
                    <span>{fmtQty(Math.max(0, item.plannedQty - item.completedQty))} remaining</span>
                    <span>{fmtQty(item.plannedQty)} planned</span>
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: "history",
            label: <><HistoryOutlined /> Progress ({item.progressEntries.length})</>,
            children: (
              <div>
                {item.progressEntries.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "48px 20px", color: "#9ba3b8", border: "1px dashed #e4e7ee", borderRadius: 8 }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
                    <div style={{ fontWeight: 600, color: "#5a6278" }}>No progress recorded yet</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Go to Work Orders to record progress on this item.</div>
                  </div>
                ) : (
                  <Timeline
                    mode="left"
                    items={[...item.progressEntries].reverse().map((pe, i, arr) => {
                      const cumulative = arr.slice(i).reduce((s, e) => s + e.qtyAdded, 0);
                      return {
                        dot: <div style={{ background: "#16a85a", borderRadius: "50%", width: 10, height: 10 }} />,
                        label: <span style={{ fontSize: 11, color: "#9ba3b8" }}>{dayjs(pe.date).format("DD MMM YYYY")}</span>,
                        children: (
                          <div style={{ border: "1px solid #e4e7ee", borderRadius: 8, padding: "10px 14px", background: "#fff", marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#16a85a", fontSize: 14 }}>
                                +{fmtQty(pe.qtyAdded)} {item.unit}
                              </span>
                              <span style={{ fontSize: 11, color: "#9ba3b8" }}>Cumulative: {fmtQty(cumulative)} {item.unit}</span>
                            </div>
                            {pe.remarks && <div style={{ fontSize: 12, color: "#5a6278", marginTop: 4 }}>{pe.remarks}</div>}
                          </div>
                        ),
                      };
                    })}
                  />
                )}
              </div>
            ),
          },
          {
            key: "financial",
            label: <><DollarOutlined /> Financial</>,
            children: (
              <div>
                <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                  <Col span={12}>
                    <Card size="small" style={{ border: "1px solid #e4e7ee", borderRadius: 8 }}>
                      <Statistic
                        title={<span style={{ fontSize: 11, color: "#9ba3b8", fontWeight: 700, textTransform: "uppercase" }}>Contract Value</span>}
                        value={item.amount}
                        prefix="₹"
                        formatter={v => Number(v).toLocaleString("en-IN")}
                        valueStyle={{ fontFamily: "monospace", fontWeight: 800, color: "#2563eb" }}
                      />
                      <div style={{ fontSize: 12, color: "#9ba3b8", marginTop: 4 }}>
                        {fmtQty(item.plannedQty)} {item.unit} × ₹{item.rate.toLocaleString("en-IN")}
                      </div>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" style={{ border: "1px solid #b7e8c8", borderRadius: 8, background: "#f0faf4" }}>
                      <Statistic
                        title={<span style={{ fontSize: 11, color: "#9ba3b8", fontWeight: 700, textTransform: "uppercase" }}>Billable Now</span>}
                        value={item.completedQty * item.rate}
                        prefix="₹"
                        formatter={v => Number(v).toLocaleString("en-IN")}
                        valueStyle={{ fontFamily: "monospace", fontWeight: 800, color: "#16a85a" }}
                      />
                      <div style={{ fontSize: 12, color: "#9ba3b8", marginTop: 4 }}>
                        {fmtQty(item.completedQty)} {item.unit} × ₹{item.rate.toLocaleString("en-IN")}
                      </div>
                    </Card>
                  </Col>
                </Row>
                <div style={{ border: "1px solid #e4e7ee", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ background: "#f5f6f8", padding: "10px 16px", fontWeight: 700, fontSize: 12, color: "#5a6278", borderBottom: "1px solid #e4e7ee" }}>
                    Breakdown
                  </div>
                  <div style={{ padding: "12px 16px" }}>
                    {[
                      { label: "Rate", val: `₹${item.rate.toLocaleString("en-IN")} per ${item.unit}`, color: "#1a1f2e" },
                      { label: "Planned Qty", val: `${fmtQty(item.plannedQty)} ${item.unit}`, color: "#1a1f2e" },
                      { label: "Completed Qty", val: `${fmtQty(item.completedQty)} ${item.unit}`, color: "#16a85a" },
                      { label: "Remaining Qty", val: `${fmtQty(Math.max(0, item.plannedQty - item.completedQty))} ${item.unit}`, color: "#5a6278" },
                    ].map(row => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f5f6f8", fontSize: 13 }}>
                        <span style={{ color: "#9ba3b8" }}>{row.label}</span>
                        <strong style={{ fontFamily: "monospace", color: row.color }}>{row.val}</strong>
                      </div>
                    ))}
                    <Divider style={{ margin: "10px 0" }} />
                    {[
                      { label: "Contract Value", val: fmt(item.amount), color: "#2563eb" },
                      { label: "Billable Now", val: fmt(item.completedQty * item.rate), color: "#16a85a" },
                      { label: "Remaining Value", val: fmt(Math.max(0, item.plannedQty - item.completedQty) * item.rate), color: "#f37916" },
                    ].map(row => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, fontWeight: 700 }}>
                        <span style={{ color: "#5a6278" }}>{row.label}</span>
                        <span style={{ fontFamily: "monospace", color: row.color }}>{row.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ),
          },
        ]}
      />
    </Drawer>
  );
}

// ── Work Order Progress Card ───────────────────────────────────

function WorkOrderCard({
  wo,
  onViewItem,
}: {
  wo: WorkOrder;
  onViewItem: (item: ScopeItem, wo: WorkOrder) => void;
}) {
  const items = wo.scopeItems || [];
  const done = items.filter(i => i.status === "completed").length;
  const running = items.filter(i => i.status === "running").length;
  const delayed = items.filter(isItemDelayed).length;
  const totalPlanned = items.reduce((s, i) => s + i.plannedQty, 0);
  const totalDone = items.reduce((s, i) => s + i.completedQty, 0);
  const pct = totalPlanned > 0 ? Math.round((totalDone / totalPlanned) * 100) : 0;
  const billable = items.reduce((s, i) => s + i.completedQty * i.rate, 0);

  return (
    <div style={{ border: "1px solid #e4e7ee", borderRadius: 10, overflow: "hidden", marginBottom: 20, background: "#fff" }}>
      {/* Card Header */}
      <div style={{ background: "#f5f6f8", padding: "12px 16px", borderBottom: "1px solid #e4e7ee", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "monospace", fontWeight: 800, color: "#f37916", fontSize: 15 }}>{wo.workOrderNo}</span>
        <span style={{ color: "#5a6278", fontWeight: 600 }}>{wo.vendorName}</span>
        <Tag style={{ marginLeft: "auto" }}>
          {done}/{items.length} items done
          {running > 0 && <span style={{ color: "#f37916", marginLeft: 6 }}>{running} running</span>}
        </Tag>
        {delayed > 0 && (
          <Tag color="red" icon={<ExclamationCircleOutlined />} style={{ fontWeight: 600 }}>
            {delayed} overdue
          </Tag>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }}>
          <Progress percent={pct} size="small" strokeColor="#16a85a" trailColor="#f0f0f0" showInfo={false} style={{ flex: 1 }} />
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#16a85a", fontSize: 13, minWidth: 40 }}>{pct}%</span>
        </div>
        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#2563eb", fontSize: 13 }}>
          Contract: {fmt(wo.contractValue)}
        </span>
        {billable > 0 && (
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#16a85a", fontSize: 13 }}>
            Billable: {fmt(billable)}
          </span>
        )}
      </div>

      {/* Scope Items */}
      {items.length === 0 ? (
        <div style={{ padding: "24px 16px", color: "#9ba3b8", textAlign: "center", fontSize: 13 }}>
          No scope items defined for this work order.
        </div>
      ) : (
        <div style={{ padding: "12px 16px" }}>
          {items.map((item, idx) => {
            const p = getCompletionPct(item);
            const del = isItemDelayed(item);
            const cfg = SCOPE_STATUS_CFG[item.status];
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  marginBottom: idx < items.length - 1 ? 8 : 0,
                  border: `1px solid ${del ? "#ffcdd2" : "#e4e7ee"}`,
                  borderLeft: `4px solid ${del ? "#e03b3b" : cfg.color}`,
                  borderRadius: 8,
                  background: del ? "#fff9f9" : "#fafbfc",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                {/* Number badge */}
                <span
                  style={{
                    background: cfg.color,
                    color: "#fff",
                    borderRadius: "50%",
                    width: 22, height: 22,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </span>

                {/* Name + dates */}
                <div style={{ flex: "0 0 220px", minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1f2e" }}>{item.description}</div>
                  <div style={{ fontSize: 11, color: "#9ba3b8", marginTop: 2 }}>
                    {item.plannedStart && dayjs(item.plannedStart).format("DD MMM")}
                    {item.plannedStart && item.plannedEnd && " → "}
                    {item.plannedEnd && (
                      <span style={{ color: del ? "#e03b3b" : "#9ba3b8", fontWeight: del ? 600 : 400 }}>
                        {dayjs(item.plannedEnd).format("DD MMM YYYY")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status tag */}
                <Tag
                  style={{ background: cfg.bg, border: `1px solid ${cfg.color}`, color: cfg.color, fontWeight: 600, fontSize: 11 }}
                >
                  {cfg.label}
                </Tag>
                {del && (
                  <Tooltip title={`Was due ${dayjs(item.plannedEnd).format("DD MMM YYYY")}`}>
                    <Tag color="red" icon={<WarningOutlined />} style={{ fontWeight: 600 }}>
                      {delayDays(item)}d late
                    </Tag>
                  </Tooltip>
                )}

                {/* Progress bar */}
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: "#16a85a" }}>{fmtQty(item.completedQty)} {item.unit}</span>
                    <span style={{ color: "#9ba3b8" }}>of {fmtQty(item.plannedQty)} {item.unit}</span>
                  </div>
                  <Progress
                    percent={p}
                    size="small"
                    strokeColor={p >= 100 ? "#16a85a" : del ? "#e03b3b" : "#f37916"}
                    trailColor="#f0f0f0"
                    showInfo={false}
                  />
                </div>

                {/* Percentage */}
                <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 14, color: p >= 100 ? "#16a85a" : del ? "#e03b3b" : "#f37916", minWidth: 40, textAlign: "right" }}>
                  {p}%
                </span>

                {/* Progress entries count */}
                {item.progressEntries.length > 0 && (
                  <Tag icon={<HistoryOutlined />} style={{ fontSize: 11, color: "#5a6278", borderColor: "#e4e7ee" }}>
                    {item.progressEntries.length} entr{item.progressEntries.length !== 1 ? "ies" : "y"}
                  </Tag>
                )}

                {/* View button */}
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => onViewItem(item, wo)}
                  style={{ flexShrink: 0 }}
                >
                  Detail
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function WorkProgress() {
  const [projects,          setProjects]          = useState<Project[]>([]);
  const [workOrders,        setWorkOrders]         = useState<WorkOrder[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loadingProjects,   setLoadingProjects]   = useState(true);
  const [loadingWOs,        setLoadingWOs]         = useState(false);

  // Scope item detail drawer
  const [drawerItem,   setDrawerItem]   = useState<ScopeItem | null>(null);
  const [drawerWONo,   setDrawerWONo]   = useState<string>("");
  const [drawerOpen,   setDrawerOpen]   = useState(false);

  // ── Load projects on mount ─────────────────────────────────
  useEffect(() => {
    apiClient.get<{ projects: Project[] }>("/projects")
      .then(r => {
        const ps = r.data.projects.map(normalizeId);
        setProjects(ps);
        // Auto-select the first project if only one exists
        if (ps.length === 1) setSelectedProjectId(ps[0].id);
      })
      .finally(() => setLoadingProjects(false));
  }, []);

  // ── Load work orders when project changes ──────────────────
  useEffect(() => {
    if (!selectedProjectId) { setWorkOrders([]); return; }
    setLoadingWOs(true);
    apiClient.get<{ workOrders: WorkOrder[] }>(`/work-orders?projectId=${selectedProjectId}`)
      .then(r => setWorkOrders(r.data.workOrders.map(normalizeWO)))
      .finally(() => setLoadingWOs(false));
  }, [selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  // ── Aggregate stats from all scope items ───────────────────
  const allScopeItems = useMemo(
    () => workOrders.flatMap(wo => wo.scopeItems || []),
    [workOrders]
  );

  const stats = useMemo(() => {
    const items = allScopeItems;
    const totalPlanned   = items.reduce((s, i) => s + i.plannedQty, 0);
    const totalCompleted = items.reduce((s, i) => s + i.completedQty, 0);
    return {
      total:     items.length,
      pending:   items.filter(i => i.status === "pending").length,
      running:   items.filter(i => i.status === "running").length,
      completed: items.filter(i => i.status === "completed").length,
      delayed:   items.filter(isItemDelayed).length,
      billableValue:  items.reduce((s, i) => s + i.completedQty * i.rate, 0),
      contractValue:  items.reduce((s, i) => s + i.amount, 0),
      overallPct: totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0,
      totalPlanned,
      totalCompleted,
    };
  }, [allScopeItems]);

  const delayedItems = useMemo(
    () => allScopeItems.filter(isItemDelayed),
    [allScopeItems]
  );

  // ── Pipeline steps (all scope items ordered by WO then index) ─
  const pipelineItems = useMemo(
    () => workOrders.flatMap(wo => (wo.scopeItems || []).map((si, idx) => ({ ...si, seqLabel: `${wo.workOrderNo}·${idx + 1}` }))),
    [workOrders]
  );

  const stepStatus = (item: ScopeItem) => {
    if (item.status === "completed") return "finish";
    if (isItemDelayed(item)) return "error";
    if (item.status === "running") return "process";
    return "wait";
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <PageShell
      title="Work Progress"
      description="Select a project to see real-time progress across all work orders and scope items."
    >
      {/* Project Selector */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E5E7EB",
          borderRadius: 10,
          padding: "16px 20px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1f2e" }}>Select Project</div>
        <Spin spinning={loadingProjects} size="small">
          <Select
            placeholder="Choose a project to view progress…"
            value={selectedProjectId}
            onChange={setSelectedProjectId}
            style={{ minWidth: 300 }}
            size="large"
            showSearch
            filterOption={(inp, opt) =>
              String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())
            }
            options={projects.map(p => ({
              label: `${p.code} — ${p.name}`,
              value: p.id,
            }))}
            allowClear
            onClear={() => setSelectedProjectId(null)}
          />
        </Spin>
        {selectedProject && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <Tag color="blue" style={{ fontSize: 13, padding: "3px 10px" }}>{selectedProject.code}</Tag>
            <span style={{ color: "#5a6278", fontSize: 13 }}>{selectedProject.location}</span>
            <Tag color={selectedProject.status === "active" ? "green" : "default"} style={{ fontWeight: 600 }}>
              {selectedProject.status}
            </Tag>
          </div>
        )}
      </div>

      {/* Empty state — no project selected */}
      {!selectedProjectId && !loadingProjects && (
        <div style={{ textAlign: "center", padding: "80px 20px", background: "#fff", borderRadius: 10, border: "1px dashed #E5E7EB" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏗️</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: "#1a1f2e", marginBottom: 8 }}>Select a Project</div>
          <div style={{ color: "#9ba3b8", fontSize: 14 }}>
            Choose a project from the dropdown above to see its work order progress.
          </div>
          {projects.length === 0 && (
            <div style={{ marginTop: 16, color: "#f37916", fontSize: 13 }}>
              No projects found. Create a project first in the Projects section.
            </div>
          )}
        </div>
      )}

      {/* Project content */}
      {selectedProjectId && (
        <Spin spinning={loadingWOs} tip="Loading work orders…">

          {/* Summary Stats */}
          {!loadingWOs && (
            <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
              <Col xs={12} sm={8} md={4}>
                <StatCard title="Total Items" value={stats.total} sub={`${workOrders.length} work order${workOrders.length !== 1 ? "s" : ""}`} />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <StatCard title="Running" value={stats.running} color="#f37916" bg="#fff8f3"
                  sub={`${stats.pending} pending`} />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <StatCard title="Completed" value={stats.completed} color="#16a85a" bg="#f0faf4"
                  sub={`of ${stats.total} total`} />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <StatCard
                  title="Overdue"
                  value={stats.delayed}
                  color={stats.delayed > 0 ? "#e03b3b" : "#9ba3b8"}
                  bg={stats.delayed > 0 ? "#fff5f5" : "#fff"}
                  sub={stats.delayed > 0 ? "items past due date" : "On schedule"}
                />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <StatCard title="Billable Now" value={fmt(stats.billableValue)} color="#16a85a" bg="#f0faf4"
                  sub={`of ${fmt(stats.contractValue)}`} />
              </Col>
              <Col xs={12} sm={8} md={4}>
                <StatCard
                  title="Overall Progress"
                  value={`${stats.overallPct}%`}
                  color="#f37916"
                  bg="#fff8f3"
                  sub={`${fmtQty(stats.totalCompleted)} / ${fmtQty(stats.totalPlanned)} units`}
                />
              </Col>
            </Row>
          )}

          {/* Pipeline strip — only when there are items */}
          {!loadingWOs && pipelineItems.length > 0 && (
            <Card
              size="small"
              title={<span style={{ fontWeight: 700, fontSize: 13, color: "#1a1f2e" }}>Scope Items Pipeline</span>}
              style={{ marginBottom: 16, borderColor: "#e4e7ee" }}
            >
              <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                <Steps
                  size="small"
                  current={pipelineItems.findIndex(i => i.status === "running" || i.status === "pending")}
                  style={{ minWidth: Math.max(600, pipelineItems.length * 90) }}
                  items={pipelineItems.map(item => ({
                    title: (
                      <span style={{ fontSize: 11, fontWeight: 600 }}>
                        {item.description.length > 14 ? item.description.substring(0, 13) + "…" : item.description}
                      </span>
                    ),
                    description: (
                      <span style={{ fontSize: 10, color: isItemDelayed(item) ? "#e03b3b" : "#9ba3b8" }}>
                        {getCompletionPct(item) > 0 ? `${getCompletionPct(item)}%` : (item.plannedStart ? dayjs(item.plannedStart).format("MMM YY") : "—")}
                        {isItemDelayed(item) && " ⚠"}
                      </span>
                    ),
                    status: stepStatus(item),
                  }))}
                />
              </div>
            </Card>
          )}

          {/* Delay alert */}
          {!loadingWOs && delayedItems.length > 0 && (
            <Alert
              type="error"
              icon={<ExclamationCircleOutlined />}
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
              message={<span style={{ fontWeight: 600 }}>{delayedItems.length} scope item{delayedItems.length > 1 ? "s are" : " is"} overdue</span>}
              description={
                <span>
                  {delayedItems.map((item, i) => (
                    <span key={item.id}>
                      <strong style={{ color: "#e03b3b", cursor: "pointer" }} onClick={() => {
                        const wo = workOrders.find(w => (w.scopeItems || []).some(si => si.id === item.id));
                        if (wo) { setDrawerItem(item); setDrawerWONo(wo.workOrderNo); setDrawerOpen(true); }
                      }}>
                        {item.description}
                      </strong>
                      {" "}
                      <span style={{ color: "#9ba3b8" }}>
                        ({delayDays(item)} days past {dayjs(item.plannedEnd).format("DD MMM YYYY")})
                      </span>
                      {i < delayedItems.length - 1 && "  ·  "}
                    </span>
                  ))}
                </span>
              }
            />
          )}

          {/* No work orders yet */}
          {!loadingWOs && workOrders.length === 0 && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <div style={{ fontWeight: 600, color: "#5a6278", marginBottom: 4 }}>No work orders for this project yet</div>
                  <div style={{ fontSize: 12, color: "#9ba3b8" }}>
                    Create a work order in the Work Orders section and assign it to this project.
                  </div>
                </div>
              }
              style={{ padding: "48px 0", background: "#fff", borderRadius: 10, border: "1px dashed #E5E7EB" }}
            />
          )}

          {/* Work order cards */}
          {!loadingWOs && workOrders.map(wo => (
            <WorkOrderCard
              key={wo.id}
              wo={wo}
              onViewItem={(item, w) => {
                setDrawerItem(item);
                setDrawerWONo(w.workOrderNo);
                setDrawerOpen(true);
              }}
            />
          ))}
        </Spin>
      )}

      {/* Scope item detail drawer */}
      <ScopeItemDrawer
        item={drawerItem}
        workOrderNo={drawerWONo}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDrawerItem(null); }}
      />
    </PageShell>
  );
}
