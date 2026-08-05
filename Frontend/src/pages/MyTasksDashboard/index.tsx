import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Users, Network, Clock, LayoutList } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import PageHeader from "../../ui/PageHeader";
import KPICard from "../../ui/KPICard";
import Card from "../../ui/Card";
import Badge from "../../ui/Badge";
import Btn from "../../ui/Btn";
import Spinner from "../../ui/Spinner";

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
const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    <Card padded={false} className="overflow-hidden mb-5">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/40 flex items-center gap-2.5">
        <span className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{title}</span>
        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{ background: `${color}1a`, color }}>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="py-8 px-5 text-center text-sm text-gray-400">{emptyText}</div>
      ) : (
        <div>
          {rows.map(r => (
            <div key={r.key} className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-50 dark:border-gray-700/30 last:border-b-0">
              <div className="min-w-0">
                <div className="font-bold text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9]">{r.label}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{r.sub}</div>
              </div>
              <div className="flex items-center gap-3.5 shrink-0">
                <div className="text-right">
                  {r.amount != null && <div className="font-mono font-bold text-sm" style={{ color }}>{fmt(r.amount)}</div>}
                  <div className="text-[11px] text-gray-400">{r.when}</div>
                </div>
                <Btn small label={buttonLabel} style={{ background: color, borderColor: color }} onClick={() => onOpen(r.key)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
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

  if (loading) return <Spinner label="Loading your tasks…" />;

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
    <div>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(" ")[0] || roleLabel}`}
        subtitle="Here's what's waiting on your approval right now."
        icon={LayoutList}
      />

      {(role === "gm" || role === "agm") && (
        <>
          <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(178px,1fr))] mb-5">
            <KPICard label="Pending L1 (AGM)" value={billReqs.length} icon={Clock} accent="#d97706" />
            <KPICard label="Pending L2 (GM)" value={billReqsGm.length} icon={Clock} accent="#2563eb" />
            <KPICard label="Today's Progress Entries" value={kpis.progressEntriesToday} icon={FileText} accent="#16a34a" />
            <KPICard label="Active DRIs Today" value={kpis.drisActiveToday} icon={Users} accent="#7c3aed" />
            <KPICard label="Active Projects Today" value={kpis.projectsActiveToday} icon={Network} accent="#0d9488" />
          </div>

          <Card className="mb-5 flex items-center justify-between flex-wrap gap-2.5">
            <div>
              <div className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">Site Progress</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                See what DRI has been logging project-by-project, approve any over-plan progress, and carry a bill through AGM (L1) and GM (L2) approval.
              </div>
            </div>
            <Btn label="Open Site Progress →" color="primary" onClick={() => navigate("/site-progress")} />
          </Card>
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
        <div className="text-center py-16 text-gray-400">
          <Badge color="gray">No task queues configured for your role</Badge>
        </div>
      )}
    </div>
  );
}
