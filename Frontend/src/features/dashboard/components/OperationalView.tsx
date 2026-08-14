import { useEffect, useState } from "react";
import {
  ClipboardList, FileText, Banknote, Hourglass, Target, HardHat, ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../../services/apiClient";
import { useCategories } from "../../../hooks/useCategories";
import { useDashboardData } from "../hooks/useDashboardData";
import { CategoryProgress } from "./CategoryProgress";
import type { DPROperational, DPRProjectPerformance } from "../../../types/DPR";
import type { WORow, BillRow } from "../utils";
import { woProjectId } from "../utils";
import type { ComparisonMode } from "./MiniCharts";
import { progressBarClass, deltaText, ViewAllLink, StatTile, HighlightsBanner, DetailListModal } from "./shared";
import Card from "../../../ui/Card";
import Btn from "../../../ui/Btn";
import Modal from "../../../ui/Modal";
import Spinner from "../../../ui/Spinner";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../ui/Table";
import Funnel from "../../../ui/charts/Funnel";
import Donut from "../../../ui/charts/Donut";

const LIST_PREVIEW_LIMIT = 5;
const WO_PENDING_APPROVAL_STATUSES = ["pending-checker", "pending-approver", "pending-final"];
const BILL_PENDING_STATUSES = ["draft", "verify-done", "l1-approved"];

// Buckets by the work order's own lifecycle status (authoritative field on the
// model) rather than a derived percentage. `workOrders` is already filtered by
// the caller to the selected project (or all, when none is selected).
function WorkProgressPanel({ workOrders }: { workOrders: WORow[] }) {
  const relevant = workOrders.filter(w => w.status !== "cancelled");
  const completed = relevant.filter(w => w.status === "completed").length;
  const inProgress = relevant.filter(w => w.status === "issued" || w.status === "in-progress").length;
  const notStarted = relevant.filter(w => w.status === "draft" || !w.status).length;
  const total = relevant.length;

  return (
    <Card>
      <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Work Progress Overview</div>
      <div className="text-xs text-gray-400 mb-4">Completion status across all work orders</div>
      {total === 0 ? (
        <div className="text-sm text-gray-400 text-center py-8">No work orders yet.</div>
      ) : (
        <>
          <Donut
            segments={[
              { label: "Completed", value: completed, color: "#1baf7a" },
              { label: "In Progress", value: inProgress, color: "#2a78d6" },
              { label: "Not Started", value: notStarted, color: "#D1D5DB" },
            ]}
            legendMode="percent"
            hideCenter
          />
          <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-gray-100 dark:border-gray-700/40">
            <div>
              <div className="text-[11px] text-gray-400">Total Work Items</div>
              <div className="text-lg font-bold font-mono text-[#1A1A2E] dark:text-[#F1F5F9]">{total}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-400">Completed Items</div>
              <div className="text-lg font-bold font-mono text-[#1A1A2E] dark:text-[#F1F5F9]">{completed}</div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function ProjectPerfTable({ rows }: { rows: DPRProjectPerformance[] }) {
  return (
    <Table>
      <Thead>
        <Tr><Th>Project Name</Th><Th>WOs</Th><Th>Progress</Th><Th>Today's Activity</Th><Th>Pending</Th></Tr>
      </Thead>
      <Tbody>
        {rows.map(p => {
          const pending = Math.max(0, p.billRequestCount - p.approvedCount - p.paidCount);
          return (
            <Tr key={p.projectId}>
              <Td>
                <div className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] whitespace-nowrap">{p.projectName}</div>
                {p.projectLocation && <div className="text-xs text-gray-400">{p.projectLocation}</div>}
              </Td>
              <Td className="font-mono">{p.woCount}</Td>
              <Td>
                <div className="flex items-center gap-2 min-w-[110px]">
                  <div className="w-16 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                    <div className={`h-full rounded-full ${progressBarClass(p.progressPct)}`} style={{ width: `${Math.min(100, p.progressPct)}%` }} />
                  </div>
                  <span className="text-xs font-mono font-semibold">{p.progressPct}%</span>
                </div>
              </Td>
              <Td className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{p.woCount} WOs, {p.billRequestCount} Bills</Td>
              <Td>{pending > 0 ? <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{pending}</span> : <span className="text-gray-300">—</span>}</Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
}

// Only the Bills row has a matching detail list to drill into — built straight
// off the same `bills` array the count itself is computed from, so what you
// see when you click always matches the number on the row (previously this
// opened the DPR report's own `details.pendingApprovals`, which is bill
// *requests* pending AGM/GM review — a different collection entirely from
// the RunningBills counted here, so it routinely showed "No records" even
// when the badge read 45). Work Orders and Site Progress rows stay counts
// only, since WORow doesn't carry a bill/WO number or vendor name to list.
function PendingApprovalsPanel({
  workOrders, bills, siteProgressCount,
}: { workOrders: WORow[]; bills: BillRow[]; siteProgressCount: number }) {
  const [showBills, setShowBills] = useState(false);
  const woPending = workOrders.filter(w => WO_PENDING_APPROVAL_STATUSES.includes(w.approvalStatus || "")).length;
  const pendingBills = bills.filter(b => BILL_PENDING_STATUSES.includes(b.status || ""));

  const rows: { icon: LucideIcon; color: string; label: string; sub: string; count: number; onClick?: () => void }[] = [
    { icon: ClipboardList, color: "#2a78d6", label: "Work Orders", sub: "Waiting for approval", count: woPending },
    { icon: FileText, color: "#eb6834", label: "Bills", sub: "Waiting for approval", count: pendingBills.length, onClick: () => setShowBills(true) },
    { icon: HardHat, color: "#1baf7a", label: "Site Progress Entries", sub: "Logged today", count: siteProgressCount },
  ];

  return (
    <>
      <div className="flex flex-col gap-1">
        {rows.map(r => (
          <button
            key={r.label} onClick={r.onClick} disabled={!r.onClick}
            className={`flex items-center gap-3 px-1.5 py-2.5 rounded-lg text-left w-full ${r.onClick ? "hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer" : "cursor-default"}`}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${r.color}18` }}>
              <r.icon className="w-4 h-4" style={{ color: r.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{r.label}</div>
              <div className="text-[11px] text-gray-400">{r.sub}</div>
            </div>
            <span className={`text-sm font-bold ${r.count > 0 ? "text-red-500" : "text-gray-300"}`}>{r.count}</span>
            {r.onClick && <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />}
          </button>
        ))}
      </div>
      {showBills && (
        <DetailListModal
          title="Bills Waiting for Approval"
          rows={pendingBills.map(b => ({ id: b._id, label: b.billNo || "—", project: "", vendor: b.vendorName || "", value: b.amount || 0 }))}
          onClose={() => setShowBills(false)}
        />
      )}
    </>
  );
}

interface ActivityEvent {
  _id: string; type: string; vendorName?: string; workOrderNo?: string;
  projectId?: { name?: string; code?: string } | string; createdAt: string;
}

const ACTIVITY_META: Record<string, { icon: LucideIcon; color: string; label: (ev: ActivityEvent) => string }> = {
  WORK_ORDER_CREATED: { icon: ClipboardList, color: "#2a78d6", label: ev => `Work Order ${ev.workOrderNo ?? ""} created` },
  PAYMENT_RELEASED:    { icon: Banknote,     color: "#008300", label: () => "Payment released" },
  BILL_REQUESTED:       { icon: FileText,     color: "#eb6834", label: () => "Bill request submitted" },
};

function RecentActivitiesPanel({ projectId }: { projectId: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string | number> = { types: "WORK_ORDER_CREATED,PAYMENT_RELEASED,BILL_REQUESTED", limit: showMore ? 30 : 8 };
    if (projectId !== "all") params.projectId = projectId;
    apiClient.get("/projects/activity", { params })
      .then(r => setEvents(r.data.events ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [showMore, projectId]);

  if (loading) return <Spinner size="small" />;
  if (events.length === 0) return <div className="text-sm text-gray-400 text-center py-6">No recent activity.</div>;

  return (
    <div className="flex flex-col gap-3 max-h-96 overflow-y-auto custom-scrollbar">
      {events.map(ev => {
        const meta = ACTIVITY_META[ev.type] ?? { icon: ClipboardList, color: "#898781", label: () => ev.type };
        const Icon = meta.icon;
        const projectName = typeof ev.projectId === "object" ? ev.projectId?.name : undefined;
        return (
          <div key={ev._id} className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${meta.color}18`, border: `1.5px solid ${meta.color}44` }}>
              <Icon className="w-4 h-4" style={{ color: meta.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#1A1A2E] dark:text-[#F1F5F9]">{meta.label(ev)}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {projectName}{ev.vendorName ? ` · ${ev.vendorName}` : ""} · {dayjs(ev.createdAt).format("hh:mm A")}
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

export default function OperationalView({ data, comparisonMode, projectId }: { data: DPROperational; comparisonMode: ComparisonMode; projectId: string }) {
  const { kpis, comparisons, details, funnel, siteProgressToday, projectPerformance, briefs } = data;
  const [drill, setDrill] = useState<{ title: string; key: keyof typeof details } | null>(null);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllSiteProgress, setShowAllSiteProgress] = useState(false);

  const open = (title: string, key: keyof typeof details) => setDrill({ title, key });

  const { categories, loading: categoriesLoading } = useCategories();
  const { data: legacyData } = useDashboardData(false);
  const workOrders = legacyData?.workOrders ?? [];
  const bills = legacyData?.bills ?? [];

  // Category progress, the work-progress ring, and pending-approval counts all
  // scope to the project picked in the header filter — everything else on this
  // page (funnel, site progress, projects table) already comes pre-scoped from
  // the /dpr response itself.
  const scopedWorkOrders = projectId === "all" ? workOrders : workOrders.filter(wo => woProjectId(wo) === projectId);
  const scopedWOIds = new Set(scopedWorkOrders.map(w => w._id));
  const scopedBills = projectId === "all" ? bills : bills.filter(b => b.workOrderId && scopedWOIds.has(b.workOrderId));
  const categoriesWithWOs = categories.filter(cat => scopedWorkOrders.some(wo => wo.category === cat.name));

  const cd = comparisonMode === "none" ? "yesterday" : comparisonMode;
  const paymentsReleasedAmount = projectPerformance.reduce((s, p) => s + (p.releasedAmount || 0), 0);
  const avgSiteProgressPct = siteProgressToday.length
    ? Math.round(siteProgressToday.reduce((s, r) => s + r.completionPct, 0) / siteProgressToday.length)
    : 0;
  const siteProgressRows = showAllSiteProgress ? siteProgressToday : siteProgressToday.slice(0, LIST_PREVIEW_LIMIT);

  return (
    <div>
      <HighlightsBanner
        icon={HardHat} title="Today's Operational Highlights" briefs={briefs}
        statusOk={kpis.pendingApprovals === 0}
        statusText={kpis.pendingApprovals === 0 ? "No critical issues. Operations on track." : `${kpis.pendingApprovals} approval${kpis.pendingApprovals !== 1 ? "s" : ""} pending review.`}
      />

      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatTile
          icon={ClipboardList} label="Work Orders Today" value={kpis.woCreatedToday} accent="#2a78d6"
          delta={deltaText(comparisons.woCreated[cd], comparisonMode)} deltaDown={(comparisons.woCreated[cd] ?? 0) < 0}
          onClick={() => open("Work Orders Created", "woCreatedToday")}
        />
        <StatTile
          icon={FileText} label="Bills Raised Today" value={kpis.billRequestsToday} accent="#4a3aa7"
          delta={deltaText(comparisons.billRequestsRaised[cd], comparisonMode)} deltaDown={(comparisons.billRequestsRaised[cd] ?? 0) < 0}
          onClick={() => open("Bill Requests Raised", "billRequestsToday")}
        />
        <StatTile
          icon={Banknote} label="Payments Released" value={paymentsReleasedAmount >= 10_000_000 ? `₹${(paymentsReleasedAmount / 10_000_000).toFixed(2)} Cr` : `₹${(paymentsReleasedAmount / 100_000).toFixed(2)} L`} accent="#008300"
          delta={deltaText(comparisons.paymentsReleased[cd], comparisonMode)} deltaDown={(comparisons.paymentsReleased[cd] ?? 0) < 0}
          onClick={() => open("Payments Released", "paymentsReleasedToday")}
        />
        <StatTile
          icon={Hourglass} label="Pending Approvals" value={kpis.pendingApprovals} accent="#eda100"
          onClick={() => open("Pending Approvals", "pendingApprovals")}
        />
        <StatTile
          icon={Target} label="Site Progress Today" value={`${avgSiteProgressPct}%`} accent="#2a78d6"
        />
      </div>

      {/* Funnel + Work Progress + Category */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Work Order Progress (By Stage)</div>
          <div className="text-xs text-gray-400 mb-4">How many items moved through each stage on the selected date</div>
          <Funnel stages={funnel.map(f => ({ label: f.label, count: f.count }))} />
        </Card>

        <WorkProgressPanel workOrders={scopedWorkOrders} />

        <Card>
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Progress by Category</div>
              <div className="text-xs text-gray-400 mt-0.5">Billed vs. contract value per work-order category</div>
            </div>
            {categoriesWithWOs.length > LIST_PREVIEW_LIMIT && (
              <ViewAllLink label={`View All (${categoriesWithWOs.length})`} onClick={() => setShowAllCategories(true)} />
            )}
          </div>
          {categoriesLoading ? <Spinner size="small" /> : (
            <CategoryProgress categories={categories} workOrders={scopedWorkOrders} bills={scopedBills} limit={LIST_PREVIEW_LIMIT} />
          )}
        </Card>
      </div>

      {/* Site Progress / Projects at a Glance / Pending Approvals + Recent Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <Card className="lg:col-span-1">
          <div className="flex justify-between items-start mb-1">
            <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Site Progress Today</div>
            {!showAllSiteProgress && siteProgressToday.length > LIST_PREVIEW_LIMIT && (
              <ViewAllLink onClick={() => setShowAllSiteProgress(true)} />
            )}
          </div>
          <div className="text-xs text-gray-400 mb-3.5">Top scope items with progress logged</div>
          {siteProgressToday.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-6">No site progress logged for this date.</div>
          ) : (
            <div className="flex flex-col gap-2.5 max-h-96 overflow-y-auto custom-scrollbar">
              {siteProgressRows.map((s, i) => (
                <div key={i} className="border border-gray-100 dark:border-gray-700/40 rounded-lg px-3 py-2.5">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-semibold text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9]">{s.description}</span>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">+{s.todayQty.toLocaleString("en-IN")} {s.unit}</span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {s.projectName}{s.projectLocation && ` (${s.projectLocation})`} · {s.workOrderNo}
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full mt-2 overflow-hidden">
                    <div className={`h-full rounded-full ${progressBarClass(s.completionPct)}`} style={{ width: `${Math.min(100, s.completionPct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card padded={false} className="lg:col-span-2">
          <div className="flex justify-between items-center px-5 pt-5 pb-3.5">
            <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Projects at a Glance</div>
            {projectPerformance.length > LIST_PREVIEW_LIMIT && (
              <ViewAllLink label="View All Projects" onClick={() => setShowAllProjects(true)} />
            )}
          </div>
          {projectPerformance.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-6">No project-linked work orders yet.</div>
          ) : (
            <ProjectPerfTable rows={projectPerformance.slice(0, LIST_PREVIEW_LIMIT)} />
          )}
        </Card>

        <div className="lg:col-span-1 flex flex-col gap-4">
          <Card>
            <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9] mb-2">Pending Approvals</div>
            <PendingApprovalsPanel
              workOrders={scopedWorkOrders} bills={scopedBills} siteProgressCount={siteProgressToday.length}
            />
          </Card>
          <Card>
            <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9] mb-3.5">Recent Activities</div>
            <RecentActivitiesPanel projectId={projectId} />
          </Card>
        </div>
      </div>

      {showAllProjects && (
        <Modal title="Projects at a Glance" wide onClose={() => setShowAllProjects(false)} footer={<Btn label="Close" outline onClick={() => setShowAllProjects(false)} />}>
          <ProjectPerfTable rows={projectPerformance} />
        </Modal>
      )}

      {showAllCategories && (
        <Modal title="Progress by Category" onClose={() => setShowAllCategories(false)} footer={<Btn label="Close" outline onClick={() => setShowAllCategories(false)} />}>
          <CategoryProgress categories={categories} workOrders={scopedWorkOrders} bills={scopedBills} />
        </Modal>
      )}

      {drill && (
        <DetailListModal title={drill.title} rows={details[drill.key]} onClose={() => setDrill(null)} />
      )}
    </div>
  );
}
