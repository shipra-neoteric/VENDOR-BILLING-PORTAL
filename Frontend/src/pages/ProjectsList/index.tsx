import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LayoutDashboard, ArrowLeft, RotateCcw, X } from "lucide-react";
import apiClient from "../../services/apiClient";
import { useExecutiveDashboard } from "../../features/dashboard/hooks/useExecutiveDashboard";
import ProjectsOverviewTable from "../../features/dashboard/components/ProjectsOverviewTable";
import { useCategories } from "../../hooks/useCategories";
import { selectableProjects } from "../../utils/projectOptions";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import { FilterRow, SelectFilter } from "../../ui/Filters";
import { DateRangePicker } from "../../ui/DatePicker";
import { SkeletonTable } from "../../ui/Skeleton";

// ── Type Definitions ──────────────────────────────────────────────────────────
interface ProjectOption {
  _id: string;
  name: string;
  code?: string;
  parentId?: string | null;
}

interface ContractorOption {
  vendorCode: string;
  companyName: string;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ProjectsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, retry } = useExecutiveDashboard();

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const { categories } = useCategories();

  useEffect(() => {
    apiClient.get("/projects").then(res => setProjects(res.data.projects ?? [])).catch(() => { });
    apiClient.get("/contractors").then(res => setContractors(res.data.contractors ?? [])).catch(() => { });
  }, []);

  const projectId = searchParams.get("projectId") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const contractorId = searchParams.get("contractorId") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const stage = searchParams.get("stage") ?? "";
  const hasFilters = !!(projectId || categoryId || contractorId || from || to || stage);

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

  const exportParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (projectId) params.projectId = projectId;
    if (categoryId) params.categoryId = categoryId;
    if (contractorId) params.contractorId = contractorId;
    if (from) params.from = from;
    if (to) params.to = to;
    return params;
  }, [projectId, categoryId, contractorId, from, to]);

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

  return (
    <div className="pb-6">
      <PageHeader
        title="Projects Overview"
        subtitle="Complete view of project progress, cost and attention areas."
        icon={LayoutDashboard}
        actions={
          <Link to="/dashboard">
            <Btn title="Back to Dashboard" aria-label="Back to Dashboard" icon={ArrowLeft} outline small />
          </Link>
        }
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
        <SkeletonTable rows={10} cols={9} />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="font-bold text-gray-600 dark:text-gray-300 mb-1">Couldn't load the projects list</div>
          <div className="text-sm text-gray-400 mb-4 max-w-sm">{error.message}</div>
          <Btn label="Retry" color="primary" onClick={retry} />
        </div>
      ) : (
        <ProjectsOverviewTable projects={data?.projects ?? []} stage={stage} exportParams={exportParams} />
      )}
    </div>
  );
}
