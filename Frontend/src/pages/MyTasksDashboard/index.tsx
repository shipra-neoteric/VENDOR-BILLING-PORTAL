import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Empty, Spin } from "antd";
import { FileTextOutlined, TeamOutlined, ClusterOutlined, ClockCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import StatCard from "../../shared/components/StatCard";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BillRow {
  _id: string; billNo: string; status: string; amount: number;
  vendorName?: string; projectName?: string; billDate: string;
  workOrderId?: string; workOrderNo?: string;
}
interface BillRequestRow {
  _id: string; reqNo: string; status: string; stageNo?: number;
  vendorName?: string; projectName?: string; createdAt: string;
  workOrderId?: string; workOrderNo?: string;
  items: { amount?: number }[];
}
interface WFStage { name: string; assignedRole: string; status: string; startedAt?: string | null; breached?: boolean; }
interface WFInstance {
  _id: string; entityId: string; entityLabel: string; currentStageIndex: number;
  stages: WFStage[]; projectName?: string; vendorName?: string; amount?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const daysAgo = (d: string) => dayjs().diff(dayjs(d), "day");

// ── Queue section (shared layout for every role's queues) ─────────────────────
function QueueSection({
  title, color, rows, emptyText, buttonLabel, onOpen,
}: {
  title: string; color: string; emptyText: string; buttonLabel: string;
  rows: { key: string; label: string; sub: string; amount?: number; when: string }[];
  onOpen: (key: string) => void;
}) {
  return (
    <div style={{ background: "var(--nx-white)", border: "1px solid #e4e7ee", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #e4e7ee", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--nx-text)" }}>{title}</span>
          <span style={{ background: `${color}1a`, color, fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 12 }}>{rows.length}</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "28px 18px" }}><Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} /></div>
      ) : (
        <div>
          {rows.map(r => (
            <div key={r.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 18px", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--nx-text)" }}>{r.label}</div>
                <div style={{ fontSize: 12, color: "var(--nx-text-2)", marginTop: 2 }}>{r.sub}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, display: "flex", alignItems: "center", gap: 14 }}>
                <div>
                  {r.amount != null && <div style={{ fontFamily: "monospace", fontWeight: 700, color, fontSize: 14 }}>{fmt(r.amount)}</div>}
                  <div style={{ fontSize: 11, color: "var(--nx-text-muted)" }}>{r.when}</div>
                </div>
                <Button size="small" type="primary" style={{ background: color, borderColor: color }} onClick={() => onOpen(r.key)}>
                  {buttonLabel}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MyTasksDashboard() {
  const { user } = useAuth();
  const role = user?.role as "gm" | "agm" | "accounts" | undefined;
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [bills, setBills]       = useState<BillRow[]>([]);
  const [billReqs, setBillReqs] = useState<BillRequestRow[]>([]);       // status: pending (L1, AGM)
  const [billReqsGm, setBillReqsGm] = useState<BillRequestRow[]>([]);   // status: pending-gm (L2, GM)
  const [woInstances, setWoInstances] = useState<WFInstance[]>([]);
  const [kpis, setKpis] = useState({ progressEntriesToday: 0, drisActiveToday: 0, projectsActiveToday: 0 });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiClient.get("/bills"),
      apiClient.get("/bill-requests", { params: { status: "pending" } }),
      apiClient.get("/bill-requests", { params: { status: "pending-gm" } }),
      apiClient.get("/workflows/instances", { params: { entityType: "WorkOrder", status: "in-progress" } }),
      apiClient.get("/dpr"),
    ])
      .then(([billsR, brR, brGmR, wfR, dprR]) => {
        setBills(billsR.data.bills ?? []);
        setBillReqs(brR.data.billRequests ?? []);
        setBillReqsGm(brGmR.data.billRequests ?? []);
        setWoInstances(wfR.data.instances ?? []);
        const k = dprR.data?.operational?.kpis || {};
        setKpis({
          progressEntriesToday: k.progressEntriesToday || 0,
          drisActiveToday:      k.drisActiveToday || 0,
          projectsActiveToday:  k.projectsActiveToday || 0,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
        <Spin size="large" tip="Loading your tasks…" />
      </div>
    );
  }

  // Work orders currently sitting at a stage assigned to this role.
  const myWOInstances = woInstances.filter(inst => {
    const stage = inst.stages[inst.currentStageIndex];
    return stage && stage.assignedRole === role;
  });
  const woRows = myWOInstances.map(inst => {
    const stage = inst.stages[inst.currentStageIndex];
    return {
      key: inst.entityId,
      label: inst.entityLabel,
      sub: [inst.projectName, inst.vendorName, stage?.name].filter(Boolean).join(" · "),
      amount: inst.amount,
      when: stage?.startedAt ? `${daysAgo(stage.startedAt)}d pending${stage.breached ? " · overdue" : ""}` : "",
    };
  });
  const openWO = (id: string) => navigate(`/work-items/${id}`);

  // ── AGM: bill requests at 'pending' (L1), waiting on AGM approval ──
  const agmReqRows = billReqs.map(r => ({
    key: r._id, label: r.reqNo,
    sub: [r.vendorName, r.projectName, r.workOrderNo].filter(Boolean).join(" · "),
    amount: r.items.reduce((s, it) => s + (it.amount || 0), 0) || undefined,
    when: `${daysAgo(r.createdAt)}d pending`,
  }));

  // ── GM: bill requests at 'pending-gm' (L2), waiting on GM approval ──
  const gmReqRows = billReqsGm.map(r => ({
    key: r._id, label: r.reqNo,
    sub: [r.vendorName, r.projectName, r.workOrderNo].filter(Boolean).join(" · "),
    amount: r.items.reduce((s, it) => s + (it.amount || 0), 0) || undefined,
    when: `${daysAgo(r.createdAt)}d pending`,
  }));

  // ── Accounts: stages of the Accounts Payment chain ──
  const acctVerify     = bills.filter(b => b.status === "draft");
  const acctL1Agm      = bills.filter(b => b.status === "verify-done");
  const acctL2Director = bills.filter(b => b.status === "l1-approved");
  const acctHold       = bills.filter(b => b.status === "hold");
  const acctSendTms    = bills.filter(b => b.status === "approved");
  const toRows = (list: BillRow[]) => list.map(b => ({
    key: b._id, label: b.billNo,
    sub: [b.vendorName, b.projectName, b.workOrderNo].filter(Boolean).join(" · "),
    amount: b.amount, when: `${daysAgo(b.billDate)}d pending`,
  }));

  const roleLabel = role === "gm" ? "General Manager" : role === "agm" ? "AGM" : role === "accounts" ? "Accounts" : "";

  return (
    <PageShell
      title={`Welcome back, ${user?.name?.split(" ")[0] || roleLabel}`}
      description={`Here's what's waiting on your approval right now.`}
    >
      {(role === "gm" || role === "agm") && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(178px, 1fr))", gap: 14, marginBottom: 20 }}>
            <StatCard label="Pending L1 (AGM)" value={billReqs.length} icon={<ClockCircleOutlined />} accent="#d97706" />
            <StatCard label="Pending L2 (GM)" value={billReqsGm.length} icon={<ClockCircleOutlined />} accent="#2563eb" />
            <StatCard label="Today's Progress Entries" value={kpis.progressEntriesToday} icon={<FileTextOutlined />} accent="#16a34a" />
            <StatCard label="Active DRIs Today" value={kpis.drisActiveToday} icon={<TeamOutlined />} accent="#7c3aed" />
            <StatCard label="Active Projects Today" value={kpis.projectsActiveToday} icon={<ClusterOutlined />} accent="#0d9488" />
          </div>

          <div style={{ background: "var(--nx-white)", border: "1px solid #e4e7ee", borderRadius: 12, padding: "16px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--nx-text)" }}>Site Progress</div>
              <div style={{ fontSize: 12, color: "var(--nx-text-2)", marginTop: 2 }}>
                See what DRI has been logging project-by-project, approve any over-plan progress, and carry a bill through AGM (L1) and GM (L2) approval.
              </div>
            </div>
            <Button type="primary" style={{ background: "#FF7A00", borderColor: "#FF7A00" }} onClick={() => navigate("/site-progress")}>
              Open Site Progress →
            </Button>
          </div>
        </>
      )}

      {role === "gm" && (
        <>
          <QueueSection
            title="Work Orders Awaiting Your Sign-off" color="#3b82f6"
            rows={woRows} emptyText="No work orders waiting on you" buttonLabel="Review →"
            onOpen={openWO}
          />
          <QueueSection
            title="Bill Requests Awaiting Your L2 Approval" color="#2563eb"
            rows={gmReqRows} emptyText="No bill requests waiting on your approval" buttonLabel="Approve →"
            onOpen={() => navigate("/site-progress")}
          />
        </>
      )}

      {role === "agm" && (
        <>
          <QueueSection
            title="Work Orders Awaiting Your Sign-off" color="#3b82f6"
            rows={woRows} emptyText="No work orders waiting on you" buttonLabel="Review →"
            onOpen={openWO}
          />
          <QueueSection
            title="Bill Requests Awaiting Your L1 Approval" color="#d97706"
            rows={agmReqRows} emptyText="No bill requests waiting on your approval" buttonLabel="Approve →"
            onOpen={() => navigate("/site-progress")}
          />
        </>
      )}

      {role === "accounts" && (
        <>
          <QueueSection
            title="Awaiting Verification" color="#0891b2"
            rows={toRows(acctVerify)} emptyText="Nothing waiting on verification" buttonLabel="Verify →"
            onOpen={() => navigate("/accounts-payment")}
          />
          <QueueSection
            title="Awaiting L1 AGM Approval" color="#0d9488"
            rows={toRows(acctL1Agm)} emptyText="Nothing pending L1 AGM approval" buttonLabel="Approve →"
            onOpen={() => navigate("/accounts-payment")}
          />
          <QueueSection
            title="Awaiting L2 Director Approval" color="#3730a3"
            rows={toRows(acctL2Director)} emptyText="Nothing ready for L2 Director approval" buttonLabel="Approve →"
            onOpen={() => navigate("/accounts-payment")}
          />
          <QueueSection
            title="On Hold — Needs Release" color="#9333ea"
            rows={toRows(acctHold)} emptyText="Nothing on hold" buttonLabel="Release →"
            onOpen={() => navigate("/accounts-payment")}
          />
          <QueueSection
            title="Ready to Send to TMS" color="#7c3aed"
            rows={toRows(acctSendTms)} emptyText="Nothing waiting to be sent to TMS" buttonLabel="Send →"
            onOpen={() => navigate("/accounts-payment")}
          />
        </>
      )}

      {!role && (
        <Empty description="No task queues configured for your role" />
      )}
    </PageShell>
  );
}
