import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Empty, Spin } from "antd";
import dayjs from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";

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
  const [billReqs, setBillReqs] = useState<BillRequestRow[]>([]);
  const [woInstances, setWoInstances] = useState<WFInstance[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiClient.get("/bills"),
      apiClient.get("/bill-requests", { params: { status: "pending" } }),
      apiClient.get("/workflows/instances", { params: { entityType: "WorkOrder", status: "in-progress" } }),
    ])
      .then(([billsR, brR, wfR]) => {
        setBills(billsR.data.bills ?? []);
        setBillReqs(brR.data.billRequests ?? []);
        setWoInstances(wfR.data.instances ?? []);
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

  // ── GM: bills at 'submitted', waiting on GM approval ──
  const gmBills = bills.filter(b => b.status === "submitted");
  const gmBillRows = gmBills.map(b => ({
    key: b._id, label: b.billNo,
    sub: [b.vendorName, b.projectName, b.workOrderNo].filter(Boolean).join(" · "),
    amount: b.amount, when: `${daysAgo(b.billDate)}d pending`,
  }));

  // ── AGM: bill requests at 'pending', waiting on AGM approval ──
  const agmReqRows = billReqs.map(r => ({
    key: r._id, label: r.reqNo,
    sub: [r.vendorName, r.projectName, r.workOrderNo].filter(Boolean).join(" · "),
    amount: r.items.reduce((s, it) => s + (it.amount || 0), 0) || undefined,
    when: `${daysAgo(r.createdAt)}d pending`,
  }));

  // ── Accounts: three stages of bills ──
  const acctVerify   = bills.filter(b => b.status === "verified");
  const acctInitiate = bills.filter(b => b.status === "approved");
  const acctRelease  = bills.filter(b => b.status === "payment-initiated");
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
      {role === "gm" && (
        <>
          <QueueSection
            title="Work Orders Awaiting Your Sign-off" color="#3b82f6"
            rows={woRows} emptyText="No work orders waiting on you" buttonLabel="Review →"
            onOpen={openWO}
          />
          <QueueSection
            title="Bills Awaiting Your GM Approval" color="#16a85a"
            rows={gmBillRows} emptyText="No bills waiting on your approval" buttonLabel="Approve →"
            onOpen={() => navigate("/approvals")}
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
            title="Bill Requests Awaiting Your Approval" color="#d97706"
            rows={agmReqRows} emptyText="No bill requests waiting on your approval" buttonLabel="Approve →"
            onOpen={() => navigate("/bill-requests")}
          />
        </>
      )}

      {role === "accounts" && (
        <>
          <QueueSection
            title="Bills Awaiting Verification" color="#0d9488"
            rows={toRows(acctVerify)} emptyText="Nothing pending verification" buttonLabel="Verify →"
            onOpen={() => navigate("/approvals")}
          />
          <QueueSection
            title="Ready to Initiate Payment" color="#3730a3"
            rows={toRows(acctInitiate)} emptyText="Nothing ready for payment initiation" buttonLabel="Initiate →"
            onOpen={() => navigate("/approvals")}
          />
          <QueueSection
            title="Ready to Release Payment" color="#7c3aed"
            rows={toRows(acctRelease)} emptyText="Nothing ready for release" buttonLabel="Release →"
            onOpen={() => navigate("/bills")}
          />
        </>
      )}

      {!role && (
        <Empty description="No task queues configured for your role" />
      )}
    </PageShell>
  );
}
