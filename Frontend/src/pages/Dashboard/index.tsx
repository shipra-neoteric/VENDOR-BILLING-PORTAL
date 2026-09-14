import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LayoutDashboard, Building2, HardHat, Receipt, Banknote, Hourglass,
  RotateCcw, X, ArrowUp, ArrowDown, ArrowUpDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import apiClient from "../../services/apiClient";
import { useExecutiveDashboard } from "../../features/dashboard/hooks/useExecutiveDashboard";
import { useCategories } from "../../hooks/useCategories";
import { selectableProjects } from "../../utils/projectOptions";
import { fmtCr } from "../../features/dashboard/utils";
import { progressBarClass } from "../../features/dashboard/components/shared";
import type { ExecutiveDashboardProjectRow } from "../../types/ExecutiveDashboard";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Badge from "../../ui/Badge";
import { FilterRow, SearchFilter, SelectFilter } from "../../ui/Filters";
import { DateRangePicker } from "../../ui/DatePicker";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { Skeleton, SkeletonTable } from "../../ui/Skeleton";
import EmptyState from "../../ui/EmptyState";
import NxStatCard from "../../ui/nexora/StatCard";

interface ProjectOption { _id: string; name: string; parentId?: string | null; }
interface ContractorOption { vendorCode: string; companyName: string; }

const STATUS_BADGE: Record<string, "green" | "gray" | "amber"> = {
  active: "green", completed: "gray", "on-hold": "amber",
};

type SortKey = "name" | "awardedContractValue" | "workExecutedValue" | "billedGross" | "certifiedNet" | "paidAmount" | "remainingContract" | "progress" | "pendingBillReqs";

function SortHeader({ label, sortKey, active, dir, onClick, className }: {
  label: string; sortKey: SortKey; active: boolean; dir: "asc" | "desc"; onClick: (k: SortKey) => void; className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Th className={className}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-primary ${active ? "text-primary" : ""}`}
      >
        {label} <Icon className="w-3 h-3" />
      </button>
    </Th>
  );
}

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, retry } = useExecutiveDashboard();

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const { categories } = useCategories();

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("awardedContractValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient.get("/projects").then(res => setProjects(res.data.projects ?? [])).catch(() => {});
    apiClient.get("/contractors").then(res => setContractors(res.data.contractors ?? [])).catch(() => {});
  }, []);

  const projectId = searchParams.get("projectId") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const contractorId = searchParams.get("contractorId") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const hasFilters = !!(projectId || categoryId || contractorId || from || to);

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

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function scrollToTable() {
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const rows = useMemo(() => {
    const list = data?.projects ?? [];
    const filtered = search
      ? list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase()))
      : list;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [data, search, sortKey, sortDir]);

  const filterChips: { key: string; label: string }[] = [];
  if (projectId) filterChips.push({ key: "projectId", label: `Project: ${projectOptions.find(p => p._id === projectId)?.name ?? projectId}` });
  if (categoryId) filterChips.push({ key: "categoryId", label: `Category: ${categoryId}` });
  if (contractorId) filterChips.push({ key: "contractorId", label: `Contractor: ${contractors.find(c => c.vendorCode === contractorId)?.companyName ?? contractorId}` });
  if (from) filterChips.push({ key: "from", label: `From: ${from}` });
  if (to) filterChips.push({ key: "to", label: `To: ${to}` });

  const kpis = data?.kpis;
  const kpiCards: { label: string; value: string | number; icon: LucideIcon }[] = kpis ? [
    { label: "Active Projects", value: kpis.activeProjects, icon: Building2 },
    { label: "Total Contract Value", value: fmtCr(kpis.totalContractValue), icon: LayoutDashboard },
    { label: "Work Executed", value: fmtCr(kpis.workExecuted), icon: HardHat },
    { label: "Total Billed", value: fmtCr(kpis.totalBilled), icon: Receipt },
    { label: "Total Paid", value: fmtCr(kpis.totalPaid), icon: Banknote },
    { label: "Pending Approvals", value: kpis.pendingApprovals, icon: Hourglass },
  ] : [];

  return (
    <div className="pb-10">
      <PageHeader
        title="Projects Overview"
        subtitle="Complete view of project progress, cost and attention areas."
        icon={LayoutDashboard}
      />

      <FilterRow>
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

      {filterChips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5 -mt-2">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
            {kpiCards.map(c => (
              <NxStatCard key={c.label} icon={c.icon} label={c.label} value={c.value} onClick={scrollToTable} />
            ))}
          </div>

          <div ref={tableRef}>
            <div className="mb-4">
              <SearchFilter value={search} onChange={setSearch} placeholder="Search by project name or code…" />
            </div>

            {rows.length === 0 ? (
              <EmptyState title="No projects match these filters" message="Try widening the date range or clearing a filter." />
            ) : (
              <Table containerClassName="max-h-[560px]" className="min-w-[1100px]">
                <Thead>
                  <Tr>
                    <SortHeader label="Project" sortKey="name" active={sortKey === "name"} dir={sortDir} onClick={toggleSort} className="w-[16%]" />
                    <SortHeader label="Contract Value" sortKey="awardedContractValue" active={sortKey === "awardedContractValue"} dir={sortDir} onClick={toggleSort} className="w-[10%]" />
                    <SortHeader label="Work Executed" sortKey="workExecutedValue" active={sortKey === "workExecutedValue"} dir={sortDir} onClick={toggleSort} className="w-[10%]" />
                    <SortHeader label="Billed" sortKey="billedGross" active={sortKey === "billedGross"} dir={sortDir} onClick={toggleSort} className="w-[10%]" />
                    <SortHeader label="Certified" sortKey="certifiedNet" active={sortKey === "certifiedNet"} dir={sortDir} onClick={toggleSort} className="w-[10%]" />
                    <SortHeader label="Paid" sortKey="paidAmount" active={sortKey === "paidAmount"} dir={sortDir} onClick={toggleSort} className="w-[10%]" />
                    <SortHeader label="Remaining" sortKey="remainingContract" active={sortKey === "remainingContract"} dir={sortDir} onClick={toggleSort} className="w-[10%]" />
                    <SortHeader label="Progress" sortKey="progress" active={sortKey === "progress"} dir={sortDir} onClick={toggleSort} className="w-[10%]" />
                    <SortHeader label="Pending Actions" sortKey="pendingBillReqs" active={sortKey === "pendingBillReqs"} dir={sortDir} onClick={toggleSort} className="w-[8%]" />
                    <Th className="w-[6%]">Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map((p: ExecutiveDashboardProjectRow) => (
                    <Tr key={p.projectId}>
                      <Td>
                        <div className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] whitespace-nowrap truncate" title={p.name}>{p.name}</div>
                        <div className="text-xs text-gray-400 font-mono">{p.code}</div>
                      </Td>
                      <Td className="font-mono">{fmtCr(p.awardedContractValue)}</Td>
                      <Td className="font-mono">{fmtCr(p.workExecutedValue)}</Td>
                      <Td className="font-mono">{fmtCr(p.billedGross)}</Td>
                      <Td className="font-mono">{fmtCr(p.certifiedNet)}</Td>
                      <Td className="font-mono text-emerald-600 dark:text-emerald-400">{fmtCr(p.paidAmount)}</Td>
                      <Td className="font-mono">{fmtCr(p.remainingContract)}</Td>
                      <Td>
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <div className="w-14 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                            <div className={`h-full rounded-full ${progressBarClass(p.progress)}`} style={{ width: `${Math.min(100, p.progress)}%` }} />
                          </div>
                          <span className="text-xs font-mono font-semibold">{p.progress}%</span>
                        </div>
                      </Td>
                      <Td>
                        {p.pendingBillReqs > 0 ? (
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{p.pendingBillReqs}</span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </Td>
                      <Td><Badge color={STATUS_BADGE[p.status] ?? "gray"} small>{p.status}</Badge></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </div>

          {data && data.meta.dataWarnings.length > 0 && (
            <div className="mt-4 text-xs text-gray-400">
              {data.meta.dataWarnings.map((w, i) => <div key={i}>Note: {w}</div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
