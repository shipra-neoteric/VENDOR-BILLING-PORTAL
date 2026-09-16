import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  LayoutDashboard, Building2, HardHat, Receipt, Banknote, Hourglass,
  RotateCcw, X, AlertTriangle, TrendingUp, Clock, FileText, AlertCircle, ArrowUpRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import apiClient from "../../services/apiClient";
import { useExecutiveDashboard } from "../../features/dashboard/hooks/useExecutiveDashboard";
import { useCategories } from "../../hooks/useCategories";
import { selectableProjects } from "../../utils/projectOptions";
import { fmtCr } from "../../features/dashboard/utils";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import NxBtn from "../../ui/nexora/Btn";
import Card from "../../ui/Card";
import { FilterRow, SelectFilter } from "../../ui/Filters";
import { DateRangePicker } from "../../ui/DatePicker";
import { Skeleton, SkeletonTable } from "../../ui/Skeleton";
import KpiCard from "../../features/dashboard/components/KpiCard";
import ProjectLifecycle from "../../features/dashboard/components/ProjectLifecycle";
import ProjectHealth from "../../features/dashboard/components/ProjectHealth";
import SpendByCategory from "../../features/dashboard/components/SpendByCategory";
import ContractorsByCategory from "../../features/dashboard/components/ContractorsByCategory";
import ApprovalBottleneckByLevel from "../../features/dashboard/components/ApprovalBottleneckByLevel";
import BillingVsPaymentTrend from "../../features/dashboard/components/BillingVsPaymentTrend";

interface ProjectOption { _id: string; name: string; parentId?: string | null; }
interface ContractorOption { vendorCode: string; companyName: string; }

// Matches the `type` strings produced by Backend/src/utils/projectStageRules.js's
// buildAlerts() — a per-alert icon so the compact "Needs Your Attention" rows
// read at a glance, not just a generic warning triangle for everything.
const ALERT_TYPE_ICON: Record<string, LucideIcon> = {
  "billing-exceeds-executed": TrendingUp,
  "bill-request-pending-approval": Hourglass,
  "bill-pending-approval": Hourglass,
  "certified-payment-overdue": Clock,
  "work-order-zero-progress": HardHat,
  "no-progress-recorded": FileText,
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, retry } = useExecutiveDashboard();

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const { categories } = useCategories();
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  useEffect(() => {
    apiClient.get("/projects").then(res => setProjects(res.data.projects ?? [])).catch(() => {});
    apiClient.get("/contractors").then(res => setContractors(res.data.contractors ?? [])).catch(() => {});
  }, []);

  const projectId = searchParams.get("projectId") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const contractorId = searchParams.get("contractorId") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  // Stage isn't sent to the backend (the API's own `stage` param is a documented
  // no-op today) — filtered client-side against each row's already-computed
  // overallStage, same field the stage cards themselves are counted from.
  const stage = searchParams.get("stage") ?? "";
  const hasFilters = !!(projectId || categoryId || contractorId || from || to || stage);

  function toggleStageFilter(s: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (next.get("stage") === s) next.delete("stage");
      else next.set("stage", s);
      return next;
    }, { replace: true });
  }

  function setFilter(key: string, value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  }

  function resetFilters() {
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  // KPI cards and ProjectLifecycle's "View Details" both used to just
  // scroll to the in-page table; now that the table lives on its own route
  // (/projects-overview), they navigate there instead, carrying whatever
  // filters are currently active.
  function goToProjectsList() {
    navigate({ pathname: "/projects-overview", search: searchParams.toString() });
  }

  const projectOptions = useMemo(() => selectableProjects(projects), [projects]);
  const categoryOptions = useMemo(
    () => categories.filter(c => !c.parentId).map(c => ({ label: c.name, value: c.name })),
    [categories]
  );
  const contractorOptions = useMemo(
    () => contractors.map(c => ({ label: `${c.companyName} (${c.vendorCode})`, value: c.vendorCode })),
    [contractors]
  );

  const filterChips: { key: string; label: string }[] = [];
  if (projectId) filterChips.push({ key: "projectId", label: `Project: ${projectOptions.find(p => p._id === projectId)?.name ?? projectId}` });
  if (categoryId) filterChips.push({ key: "categoryId", label: `Category: ${categoryId}` });
  if (contractorId) filterChips.push({ key: "contractorId", label: `Contractor: ${contractors.find(c => c.vendorCode === contractorId)?.companyName ?? contractorId}` });
  if (from) filterChips.push({ key: "from", label: `From: ${from}` });
  if (to) filterChips.push({ key: "to", label: `To: ${to}` });
  if (stage) filterChips.push({ key: "stage", label: `Stage: ${stage}` });

  const kpis = data?.kpis;
  const kpiCards: { label: string; value: string | number; icon: LucideIcon; tone: "neutral" | "green" | "red" | "amber" | "blue" }[] = kpis ? [
    { label: "Active Projects", value: kpis.activeProjects, icon: Building2, tone: "blue" },
    { label: "Total Contract Value", value: fmtCr(kpis.totalContractValue), icon: LayoutDashboard, tone: "neutral" },
    { label: "Total Executed", value: fmtCr(kpis.workExecuted), icon: HardHat, tone: "neutral" },
    { label: "Total Billed", value: fmtCr(kpis.totalBilled), icon: Receipt, tone: "blue" },
    { label: "Total Paid", value: fmtCr(kpis.totalPaid), icon: Banknote, tone: "green" },
  ] : [];

  return (
    <div className="pb-6">
      <PageHeader
        title="Dashboard"
        subtitle="Complete view of project progress, cost and attention areas."
        icon={LayoutDashboard}
        actions={
          <NxBtn
            color="secondary"
            label="View All Projects"
            icon={ArrowUpRight}
            onClick={() => navigate({ pathname: "/projects-overview", search: searchParams.toString() })}
          />
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <FilterRow className="!mb-0">
          <SelectFilter value={projectId} onChange={v => setFilter("projectId", v)} placeholder="All Projects" options={projectOptions.map(p => ({ label: p.name, value: p._id }))} />
          <SelectFilter value={categoryId} onChange={v => setFilter("categoryId", v)} placeholder="All Categories" options={categoryOptions} />
          <SelectFilter value={contractorId} onChange={v => setFilter("contractorId", v)} placeholder="All Contractors" options={contractorOptions} />
          <DateRangePicker from={from} to={to} onChange={(f, t) => setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (f) next.set("from", f); else next.delete("from");
            if (t) next.set("to", t); else next.delete("to");
            return next;
          }, { replace: true })} />
          {hasFilters && <Btn label="Reset Filters" icon={RotateCcw} outline small onClick={resetFilters} />}
        </FilterRow>

        <div className="flex flex-wrap items-center gap-2">
          <NxBtn
            color="secondary"
            label="Pending Bill"
            onClick={() => navigate("/pending-payments")}
          />
          <NxBtn
            color="secondary"
            label="Pending Work Order"
            onClick={() => navigate("/pending-work-orders")}
          />
        </div>
      </div>

      {filterChips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 -mt-1">
          {filterChips.map(chip => (
            <button
              key={chip.key}
              onClick={() => setFilter(chip.key, "")}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              {chip.label} <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}

      {loading && !data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
          <SkeletonTable rows={8} cols={9} />
        </>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="font-bold text-gray-600 dark:text-gray-300 mb-1">Couldn't load the dashboard</div>
          <div className="text-sm text-gray-400 mb-4 max-w-sm">{error.message}</div>
          <Btn label="Retry" color="primary" onClick={retry} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-4">
            {kpiCards.map(c => (
              <KpiCard key={c.label} icon={c.icon} label={c.label} value={c.value} tone={c.tone} onClick={goToProjectsList} />
            ))}
          </div>

          {/* Big trend chart (left) + a stacked column of the four numbers that
              matter most day-to-day (right) — same "large chart + stacked
              side stats" rhythm as the reference layout, built from numbers
              already on data.kpis/data.paymentAging (no new backend calls). */}
          {data && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2 min-w-0">
                <BillingVsPaymentTrend trend={data.billingVsPaymentTrend} />
              </div>
              <div className="xl:col-span-1 flex flex-col gap-3">
                <KpiCard label="Overdue Amount" value={fmtCr(data.kpis.overdueAmount)} icon={AlertCircle} tone="red" />
                <KpiCard label="Pending Approvals" value={data.kpis.pendingApprovals} icon={Hourglass} tone="amber" />
                <KpiCard label="Outstanding Amount" value={fmtCr(data.kpis.outstandingAmount)} icon={Receipt} tone="blue" />
                <KpiCard label="Total Certified" value={fmtCr(data.kpis.totalCertified)} icon={Banknote} tone="green" />
              </div>
            </div>
          )}

          {/* Lifecycle card + attention panel, matched to the same height:
              ProjectHealth stays its natural compact size, and
              ProjectLifecycle (flex-1) grows to absorb whatever's left so
              the combined left column matches the (alert-driven, variable)
              right panel's height — ProjectLifecycle then shares that extra
              space evenly across its own sections internally instead of
              piling it into one gap. */}
          {data && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4 items-stretch">
              <div className="xl:col-span-2 min-w-0 flex flex-col gap-4">
                <ProjectHealth projects={data.projects} />
                <ProjectLifecycle
                  className="flex-1"
                  stageSummary={data.stageSummary}
                  kpis={data.kpis}
                  activity={data.activity}
                  activeStage={stage || null}
                  onSelectStage={toggleStageFilter}
                  onViewDetails={goToProjectsList}
                />
              </div>

              {(data.alerts.length > 0 || data.forecasts) && (
                <Card className="xl:col-span-1 min-w-0 flex flex-col">
                  {data.alerts.length > 0 && (
                  <>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Needs Your Attention
                    </h3>
                    {data.alerts.length > 6 && (
                      <button
                        type="button"
                        onClick={() => setShowAllAlerts(v => !v)}
                        className="text-xs font-semibold text-primary shrink-0 hover:underline"
                      >
                        {showAllAlerts ? "Show Less" : `View All (${data.alertsTotalCount})`}
                      </button>
                    )}
                  </div>
                  <div className={`space-y-1.5 flex-1 overflow-y-auto pr-0.5 ${showAllAlerts ? "max-h-[420px]" : ""}`}>
                    {(showAllAlerts ? data.alerts : data.alerts.slice(0, 6)).map(a => {
                      const AlertIcon = ALERT_TYPE_ICON[a.type] ?? AlertTriangle;
                      const critical = a.severity === "critical";
                      return (
                        <Link
                          key={a.id}
                          to={a.link}
                          className={`flex items-center gap-2.5 rounded-lg p-2 transition-colors ${critical ? "bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/15" : "bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/15"}`}
                        >
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${critical ? "bg-red-500" : "bg-amber-500"}`}>
                            <AlertIcon className="w-3 h-3 text-white" strokeWidth={2.25} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs font-bold truncate ${critical ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>{a.projectName}</div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{a.title}</div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                  </>
                  )}

                  {data.forecasts && (
                    <div className={data.alerts.length > 0 ? "mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/40" : ""}>
                      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        If This Continues
                      </h3>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 rounded-lg p-1.5 bg-primary/5 dark:bg-primary/10">
                          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-primary">
                            <Banknote className="w-3 h-3 text-white" strokeWidth={2.25} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold truncate text-[#172033] dark:text-[#F1F5F9]">{fmtCr(data.forecasts.cashRequirement.totalCertifiedUnpaid)} cash required</div>
                            <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{data.forecasts.cashRequirement.basis}</div>
                          </div>
                        </div>
                        {data.forecasts.budgetRisk.filter(f => f.flagged).slice(0, 2).map(f => (
                          <div key={f.projectId} className="flex items-center gap-2 rounded-lg p-1.5 bg-red-50 dark:bg-red-500/10">
                            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-red-500">
                              <TrendingUp className="w-3 h-3 text-white" strokeWidth={2.25} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold truncate text-red-700 dark:text-red-400">{f.projectName} — +{f.overrunPercent}% overrun</div>
                              <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{f.message}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}

          {data && (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SpendByCategory categorySpend={data.categorySpend} />
              <ApprovalBottleneckByLevel approvalsByLevel={data.approvalsByLevel} />
            </div>
          )}

          {data && <div className="mt-4"><ContractorsByCategory contractorsByCategory={data.contractorsByCategory} /></div>}
        </>
      )}
    </div>
  );
}
