import { useEffect, useState } from "react";
import {
  Banknote, Wallet, Receipt, FileText, AlertOctagon, HeartPulse,
  ChevronRight, TrendingUp, CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import type { DPRFinancial } from "../../types/DPR";
import type { ComparisonMode } from "../../features/dashboard/components/MiniCharts";
import { deltaText, HighlightsBanner, DetailListModal } from "../../features/dashboard/components/shared";
import Card from "../../ui/Card";
import Btn from "../../ui/Btn";
import Badge from "../../ui/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import Modal from "../../ui/Modal";
import Spinner from "../../ui/Spinner";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import Donut from "../../ui/charts/Donut";
import GroupedBar from "../../ui/charts/GroupedBar";
import { AGING_LIGHT, AGING_DARK } from "../../ui/charts/palette";
import { useTheme } from "../../context/ThemeContext";

const LIST_PREVIEW_LIMIT = 5;

const fmtCr = (n: number) => {
  const v = n ?? 0;
  return v >= 10_000_000 ? `₹${(v / 10_000_000).toFixed(2)} Cr`
    : v >= 1_00_000 ? `₹${(v / 1_00_000).toFixed(2)} L`
    : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

function contractorStatus(daysWaiting: number): { label: string; color: "green" | "amber" | "red" } {
  if (daysWaiting >= 30) return { label: "Critical", color: "red" };
  if (daysWaiting >= 15) return { label: "Delayed", color: "amber" };
  return { label: "Good", color: "green" };
}

function PaymentHealthPanel({ breakdown, healthScore }: { breakdown: DPRFinancial["paymentHealthBreakdown"]; healthScore: DPRFinancial["healthScore"] }) {
  const { isDark } = useTheme();
  const colors = isDark ? AGING_DARK : AGING_LIGHT;
  const notDueColor = isDark ? "#6B7280" : "#9CA3AF";
  const segments = [
    { label: "On Time", value: breakdown.onTime, color: colors[0] },
    { label: "Delayed (1-30 Days)", value: breakdown.delayed1to30, color: colors[1] },
    { label: "Delayed (31-60 Days)", value: breakdown.delayed31to60, color: colors[2] },
    { label: "Delayed (>60 Days)", value: breakdown.delayedOver60, color: colors[3] },
    { label: "Not Due Yet", value: breakdown.notDueYet, color: notDueColor },
  ];
  const statusMeta = healthScore.status === "good"
    ? { text: "Healthy — your payment cycle is well-managed.", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", Icon: CheckCircle2 }
    : healthScore.status === "warning"
    ? { text: "Needs attention — some bills are aging past 15 days.", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10", Icon: AlertOctagon }
    : { text: "Critical — a significant share of bills are badly overdue.", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10", Icon: AlertOctagon };

  return (
    <Card>
      <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Payment Health</div>
      <div className="text-xs text-gray-400 mb-4">Paid bills by days-to-pay, plus bills not yet due</div>
      <Donut segments={segments} legendValueFormat={fmtCr} hideCenter />
      <div className={`flex items-center gap-2 mt-5 rounded-lg px-3 py-2.5 text-xs font-medium ${statusMeta.bg} ${statusMeta.color}`}>
        <statusMeta.Icon className="w-4 h-4 shrink-0" />
        {statusMeta.text}
      </div>
    </Card>
  );
}

function TopContractorsTable({ contractors, onOpenContractor }: { contractors: DPRFinancial["topDelayedContractors"]; onOpenContractor: (vendorName: string) => void }) {
  return (
    <Table>
      <Thead>
        <Tr><Th>Contractor</Th><Th>Paid</Th><Th>Pending</Th><Th>Overdue</Th><Th>Days Waiting</Th><Th>Bills</Th><Th>Status</Th></Tr>
      </Thead>
      <Tbody>
        {contractors.map(c => {
          const status = contractorStatus(c.daysWaiting);
          return (
            <Tr key={c.vendorName} className="cursor-pointer" onClick={() => onOpenContractor(c.vendorName)}>
              <Td className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] whitespace-nowrap">{c.vendorName}</Td>
              <Td className="font-mono text-emerald-600 dark:text-emerald-400">{fmtCr(c.paidAmount)}</Td>
              <Td className="font-mono">{fmtCr(c.pendingAmount)}</Td>
              <Td className="font-mono text-red-500">{c.overdueAmount > 0 ? fmtCr(c.overdueAmount) : "—"}</Td>
              <Td className="font-mono">{c.daysWaiting}d</Td>
              <Td>
                <button onClick={e => { e.stopPropagation(); onOpenContractor(c.vendorName); }} className="font-mono text-primary hover:underline">{c.billCount}</button>
              </Td>
              <Td><Badge color={status.color} small>{status.label}</Badge></Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
}

function ContractorBillsModal({ vendorName, bills, onClose }: { vendorName: string; bills: DPRFinancial["aging"]["table"]; onClose: () => void }) {
  const total = bills.reduce((s, b) => s + b.amount, 0);
  return (
    <Modal title={vendorName} subtitle={`${bills.length} pending bill${bills.length !== 1 ? "s" : ""} · ${fmtCr(total)} total`} onClose={onClose} footer={<Btn label="Close" outline onClick={onClose} />}>
      {bills.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-8">No pending bills for this contractor.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {bills.map((b, i) => (
            <div key={i} className="border border-gray-100 dark:border-gray-700/40 rounded-lg px-3 py-2.5">
              <div className="flex justify-between items-center gap-2">
                <span className="font-semibold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{b.billNo}</span>
                <span className="text-xs font-bold text-primary">{fmtCr(b.amount)}</span>
              </div>
              <div className="flex justify-between items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">{b.project}{b.projectLocation ? ` (${b.projectLocation})` : ""}</span>
                <Badge color={b.daysPending >= 16 ? "red" : b.daysPending >= 8 ? "amber" : "green"} small>{b.daysPending}d</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function AgingAnalysisPanel({ buckets, total }: { buckets: DPRFinancial["aging"]["buckets"]; total: number }) {
  return (
    <Card>
      <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Aging Analysis</div>
      <div className="text-xs text-gray-400 mb-4">Pending payments by days since raised</div>
      <Table>
        <Thead>
          <Tr><Th>Aging Bucket</Th><Th>Amount</Th><Th>% of Total</Th></Tr>
        </Thead>
        <Tbody>
          {buckets.map(b => (
            <Tr key={b.label}>
              <Td className="whitespace-nowrap">{b.label}</Td>
              <Td className="font-mono">{fmtCr(b.amount)}</Td>
              <Td className="font-mono">{total > 0 ? Math.round((b.amount / total) * 100) : 0}%</Td>
            </Tr>
          ))}
        </Tbody>
        <tfoot>
          <Tr className="!hover:bg-transparent">
            <Td className="font-bold text-primary">Total Pending</Td>
            <Td className="font-mono font-bold text-primary">{fmtCr(total)}</Td>
            <Td className="font-mono font-bold text-primary">100%</Td>
          </Tr>
        </tfoot>
      </Table>
    </Card>
  );
}

const CR = 10_000_000;
// "MMM" alone ("Apr") is ambiguous once the selected range spans more than a
// year — two different Aprils would otherwise look identical on the axis.
function monthLabeler(trend: { month: string }[]) {
  const spansMultipleYears = new Set(trend.map(m => m.month.slice(0, 4))).size > 1;
  return (m: string) => dayjs(`${m}-01`).format(spansMultipleYears ? "MMM 'YY" : "MMM");
}

function BillsVsPaymentsTable({ trend }: { trend: DPRFinancial["monthlyBillingTrend"] }) {
  const monthLabel = monthLabeler(trend);
  return (
    <Table>
      <Thead>
        <Tr><Th>Month</Th><Th>Bills Raised</Th><Th>Payments Released</Th><Th>Balance</Th></Tr>
      </Thead>
      <Tbody>
        {trend.map(m => (
          <Tr key={m.month}>
            <Td>{monthLabel(m.month)}</Td>
            <Td className="font-mono">{fmtCr(m.raisedAmount)}</Td>
            <Td className="font-mono">{fmtCr(m.paidAmount)}</Td>
            <Td className="font-mono text-amber-600 dark:text-amber-400">{fmtCr(Math.max(0, m.raisedAmount - m.paidAmount))}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

function BillsVsPaymentsPanel({ trend }: { trend: DPRFinancial["monthlyBillingTrend"] }) {
  const [showAll, setShowAll] = useState(false);
  const monthLabel = monthLabeler(trend);
  const totalRaised = trend.reduce((s, m) => s + m.raisedAmount, 0);
  const totalPaid = trend.reduce((s, m) => s + m.paidAmount, 0);
  return (
    <Card>
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Bills vs Payments</div>
          <div className="text-xs text-gray-400 mt-0.5">Monthly value raised vs. released</div>
        </div>
        {trend.length > 0 && (
          <button onClick={() => setShowAll(true)} className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5 shrink-0">
            View All <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <GroupedBar
        groups={trend.map(m => ({ label: monthLabel(m.month), values: [m.raisedAmount / CR, m.paidAmount / CR] }))}
        seriesLabels={["Bills Raised (₹ Cr)", "Payments Released (₹ Cr)"]}
        formatValue={n => `₹${n.toFixed(2)} Cr`}
        formatAxisValue={n => String(Math.round(n))}
      />
      <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-gray-100 dark:border-gray-700/40">
        <div>
          <div className="text-[11px] text-gray-400">Total Bills</div>
          <div className="text-base font-bold font-mono text-[#1A1A2E] dark:text-[#F1F5F9]">{fmtCr(totalRaised)}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400">Total Payments</div>
          <div className="text-base font-bold font-mono text-[#1A1A2E] dark:text-[#F1F5F9]">{fmtCr(totalPaid)}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-400">Balance</div>
          <div className="text-base font-bold font-mono text-amber-600 dark:text-amber-400">{fmtCr(Math.max(0, totalRaised - totalPaid))}</div>
        </div>
      </div>
      {showAll && (
        <Modal title="Bills vs Payments" onClose={() => setShowAll(false)} footer={<Btn label="Close" outline onClick={() => setShowAll(false)} />}>
          <BillsVsPaymentsTable trend={trend} />
        </Modal>
      )}
    </Card>
  );
}

interface FinActivityEvent {
  _id: string; type: string; vendorName?: string;
  projectId?: { name?: string } | string; createdAt: string; metadata?: { billNo?: string; amount?: number };
}

const FIN_ACTIVITY_META: Record<string, { icon: LucideIcon; color: string; label: (ev: FinActivityEvent) => string }> = {
  PAYMENT_RELEASED:       { icon: Banknote, color: "#008300", label: ev => `Payment of ${fmtCr(ev.metadata?.amount ?? 0)} released` },
  RUNNING_BILL_APPROVED:  { icon: FileText, color: "#2a78d6", label: ev => `Bill ${ev.metadata?.billNo ?? ""} approved for payment` },
};

function RecentFinancialActivitiesPanel({ projectId }: { projectId: string }) {
  const [events, setEvents] = useState<FinActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string | number> = { types: "PAYMENT_RELEASED,RUNNING_BILL_APPROVED", limit: showMore ? 30 : 8 };
    if (projectId !== "all") params.projectId = projectId;
    apiClient.get("/projects/activity", { params })
      .then(r => setEvents(r.data.events ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [showMore, projectId]);

  if (loading) return <Spinner size="small" />;
  if (events.length === 0) return <div className="text-sm text-gray-400 text-center py-6">No recent financial activity.</div>;

  return (
    <div className="flex flex-col gap-3 max-h-96 overflow-y-auto custom-scrollbar">
      {events.map(ev => {
        const meta = FIN_ACTIVITY_META[ev.type] ?? { icon: Banknote, color: "#898781", label: () => ev.type };
        const Icon = meta.icon;
        const projectName = typeof ev.projectId === "object" ? ev.projectId?.name : undefined;
        return (
          <div key={ev._id} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${meta.color}18`, border: `1.5px solid ${meta.color}44` }}>
              <Icon className="w-4 h-4" style={{ color: meta.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#1A1A2E] dark:text-[#F1F5F9]">{meta.label(ev)} {ev.vendorName ? `to ${ev.vendorName}` : ""}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {projectName} · {dayjs(ev.createdAt).format("hh:mm A")}
              </div>
            </div>
          </div>
        );
      })}
      {!showMore && events.length >= 8 && (
        <button onClick={() => setShowMore(true)} className="text-xs font-semibold text-primary hover:underline self-start">Load more</button>
      )}
    </div>
  );
}

export default function FinancialView({ financial, comparisonMode, projectId, rangeLabel }: { financial: DPRFinancial; comparisonMode: ComparisonMode; projectId: string; rangeLabel: string }) {
  const { kpis, comparisons, details, paymentBreakdown, paymentHealthBreakdown, monthlyBillingTrend, aging, topDelayedContractors, healthScore, briefs } = financial;
  const [drill, setDrill] = useState<{ title: string; key: keyof typeof details } | null>(null);
  const [showAllContractors, setShowAllContractors] = useState(false);
  const [openContractor, setOpenContractor] = useState<string | null>(null);

  // Every drill-down key on this dashboard is backed by RunningBill records
  // (see dprController's financialDetails) — one uniform kind, unlike the
  // Operational dashboard which mixes work orders and bill requests too.
  const open = (title: string, key: keyof typeof details) => setDrill({ title, key });
  const cd = comparisonMode === "none" ? "yesterday" : comparisonMode;
  const totalPending = aging.buckets.reduce((s, b) => s + b.amount, 0);
  // "Overdue" = past this system's ~15-day payment window (the 16+ Days bucket) —
  // there's no 30/60/90-day cycle in the real data to key off instead.
  const overdueAmount = aging.buckets.find(b => /16\+/.test(b.label))?.amount ?? 0;

  return (
    <div>
      <HighlightsBanner
        icon={TrendingUp} title={`Financial Highlights — ${rangeLabel}`} briefs={briefs}
        statusOk={healthScore.status === "good"}
        statusText={healthScore.status === "good" ? "Overall financial status is healthy." : healthScore.status === "warning" ? "Financial health needs attention." : "Financial health is critical."}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <NxStatCard
          icon={Banknote} label={`Payments Released (${rangeLabel})`} value={fmtCr(kpis.amountReleasedToday)}
          delta={deltaText(comparisons.amountReleased[cd], comparisonMode)} deltaDown={(comparisons.amountReleased[cd] ?? 0) < 0}
          onClick={() => open("Amount Released", "amountReleasedToday")}
        />
        <NxStatCard icon={Wallet} label="Total Payments Released" value={fmtCr(paymentBreakdown.released)} />
        <NxStatCard
          icon={Receipt} label="Pending Payments" value={fmtCr(kpis.pendingValueToday)}
          onClick={() => open("Pending Value", "pendingValueToday")}
        />
        <NxStatCard
          icon={FileText} label={`Bills Raised (${rangeLabel})`} value={fmtCr(kpis.billsRaisedValueToday)}
          delta={deltaText(comparisons.billsRaisedValue[cd], comparisonMode)} deltaDown={(comparisons.billsRaisedValue[cd] ?? 0) < 0}
          onClick={() => open("Bills Raised", "billsRaisedValueToday")}
        />
        <NxStatCard icon={AlertOctagon} label="Overdue Payments" value={fmtCr(overdueAmount)} />
        <NxStatCard icon={HeartPulse} label="Payment Health Score" value={`${healthScore.score}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <PaymentHealthPanel breakdown={paymentHealthBreakdown} healthScore={healthScore} />
        <Card padded={false} className="lg:col-span-2">
          <div className="flex justify-between items-center px-5 pt-5 pb-3.5">
            <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Top Contractors – Payment Status</div>
            {topDelayedContractors.length > LIST_PREVIEW_LIMIT && (
              <button onClick={() => setShowAllContractors(true)} className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5">
                View All <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {topDelayedContractors.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-6">No contractor payments pending.</div>
          ) : (
            <TopContractorsTable contractors={topDelayedContractors.slice(0, LIST_PREVIEW_LIMIT)} onOpenContractor={setOpenContractor} />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <AgingAnalysisPanel buckets={aging.buckets} total={totalPending} />
        <BillsVsPaymentsPanel trend={monthlyBillingTrend} />
        <Card>
          <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9] mb-3.5">Recent Financial Activities</div>
          <RecentFinancialActivitiesPanel projectId={projectId} />
        </Card>
      </div>

      {showAllContractors && (
        <Modal title="Top Contractors – Payment Status" extraWide onClose={() => setShowAllContractors(false)} footer={<Btn label="Close" outline onClick={() => setShowAllContractors(false)} />}>
          <TopContractorsTable contractors={topDelayedContractors} onOpenContractor={setOpenContractor} />
        </Modal>
      )}

      {openContractor && (
        <ContractorBillsModal
          vendorName={openContractor}
          bills={aging.table.filter(b => b.contractor === openContractor)}
          onClose={() => setOpenContractor(null)}
        />
      )}

      {drill && (
        <DetailListModal title={drill.title} rows={details[drill.key]} kind="runningBill" onClose={() => setDrill(null)} />
      )}
    </div>
  );
}
