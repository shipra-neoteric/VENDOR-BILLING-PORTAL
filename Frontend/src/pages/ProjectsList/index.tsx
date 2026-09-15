import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  LayoutDashboard, ArrowLeft, RotateCcw, X, ArrowUp, ArrowDown, ArrowUpDown, Download,
} from "lucide-react";
import apiClient from "../../services/apiClient";
import { useExecutiveDashboard } from "../../features/dashboard/hooks/useExecutiveDashboard";
import { useCategories } from "../../hooks/useCategories";
import { selectableProjects } from "../../utils/projectOptions";
import { fmtCr } from "../../features/dashboard/utils";
import type { ExecutiveDashboardProjectRow } from "../../types/ExecutiveDashboard";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Badge from "../../ui/Badge";
import { FilterRow, SearchFilter, SelectFilter } from "../../ui/Filters";
import { DateRangePicker } from "../../ui/DatePicker";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { SkeletonTable } from "../../ui/Skeleton";
import EmptyState from "../../ui/EmptyState";

interface ProjectOption { _id: string; name: string; parentId?: string | null; }
interface ContractorOption { vendorCode: string; companyName: string; }

// Excel/spreadsheet-style cell chrome — visible column borders on every
// cell (not just the outer table border) plus comfortable, readable padding
// and font size. The `!` (Tailwind's important modifier) is needed because
// the shared Th/Td components hardcode their own padding/font-size classes
// (see Frontend/src/ui/Table.tsx) — a plain same-specificity utility class
// passed in isn't guaranteed to win over those (Tailwind's compiled
// stylesheet order decides ties, not the order class names are written in
// the DOM attribute), so without `!` these overrides could silently lose.
const HEADER_CELL = "px-3! py-2! text-[11px]! border-r border-gray-200 dark:border-gray-700/60 last:border-r-0";
const BODY_CELL = "px-3! py-1.5! text-[13px]! align-middle! border-r border-gray-100 dark:border-gray-700/40 last:border-r-0";

// Same stage->color mapping ProjectLifecycle's pipeline tiles use on the
// dashboard. Rendered as plain colored text, sized to actually fit inside
// the column (truncated, not wrapped) instead of a dot/pill/badge — every
// boxed version kept reading as either too tiny or too heavy against the
// rest of the table.
const STAGE_TEXT: Record<string, string> = {
  "Planning": "text-blue-600 dark:text-blue-400",
  "Work Orders Issued": "text-blue-600 dark:text-blue-400",
  "Work in Progress": "text-emerald-600 dark:text-emerald-400",
  "Billing": "text-purple-600 dark:text-purple-400",
  "Payment Pending": "text-amber-600 dark:text-amber-400",
  "Completed": "text-teal-600 dark:text-teal-400",
};

const HEALTH_BADGE: Record<string, "green" | "amber" | "red"> = {
  Healthy: "green", Attention: "amber", Critical: "red",
};

type SortKey = "name" | "awardedContractValue" | "workExecutedValue" | "billedGross" | "certifiedNet" | "paidAmount" | "remainingContract" | "progress" | "pendingBillReqs";

// Same createObjectURL/synthetic-<a>/revokeObjectURL pattern used elsewhere
// (see Frontend/src/pages/Backup/index.tsx's saveBlob).
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function SortHeader({ label, sortKey, active, dir, onClick, className }: {
  label: string; sortKey: SortKey; active: boolean; dir: "asc" | "desc"; onClick: (k: SortKey) => void; className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  // Right-aligned columns pass `text-right` in `className` for the <th>
  // itself, but a <th>'s own text-align can't reliably win over the base Th
  // component's hardcoded `text-left` (both are plain utility classes of
  // equal specificity, so which one wins depends on Tailwind's internal
  // stylesheet order, not the order these class names are written in) — so
  // alignment is driven explicitly here instead, via flex justify-end on the
  // button itself, which always works regardless of that ordering.
  const alignRight = className?.includes("text-right");
  return (
    <Th className={`${HEADER_CELL} ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`w-full flex items-center gap-1 hover:text-primary ${alignRight ? "justify-end" : ""} ${active ? "text-primary" : ""}`}
      >
        {label} <Icon className="w-3 h-3 shrink-0" />
      </button>
    </Th>
  );
}

// Extracted out of Dashboard/index.tsx into its own page — same data
// (GET /api/dashboard/executive via useExecutiveDashboard, unchanged),
// filters, sorting and export, just given its own route instead of being
// embedded at the bottom of the dashboard.
export default function ProjectsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, retry } = useExecutiveDashboard();

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const { categories } = useCategories();

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("awardedContractValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    apiClient.get("/projects").then(res => setProjects(res.data.projects ?? [])).catch(() => {});
    apiClient.get("/contractors").then(res => setContractors(res.data.contractors ?? [])).catch(() => {});
  }, []);

  const projectId = searchParams.get("projectId") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const contractorId = searchParams.get("contractorId") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  // Stage isn't sent to the backend (the API's own `stage` param is a
  // documented no-op) — filtered client-side against each row's already-
  // computed overallStage, same field the dashboard's stage tiles count from.
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

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (projectId) params.projectId = projectId;
      if (categoryId) params.categoryId = categoryId;
      if (contractorId) params.contractorId = contractorId;
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await apiClient.get("/dashboard/executive/export.csv", { params, responseType: "blob" });
      saveBlob(res.data as Blob, `projects-overview-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      // apiClient's response interceptor already surfaces the error via toast.
    } finally {
      setExporting(false);
    }
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
    const byStage = stage ? list.filter(p => p.overallStage === stage) : list;
    const filtered = search
      ? byStage.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase()))
      : byStage;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [data, search, sortKey, sortDir, stage]);

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
            <Btn label="Back to Dashboard" icon={ArrowLeft} outline small />
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
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex-1">
              <SearchFilter value={search} onChange={setSearch} placeholder="Search by project name or code…" />
            </div>
            <Btn
              label={exporting ? "Exporting…" : "Export CSV"}
              icon={Download}
              outline
              small
              loading={exporting}
              onClick={exportCsv}
              aria-label="Export projects overview as CSV"
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState title="No projects match these filters" message="Try widening the date range or clearing a filter." />
          ) : (
            <Table containerClassName="max-h-[70vh] overflow-y-auto" className="min-w-[1100px]">
              <Thead>
                <Tr>
                  <Th className={`w-[3%] ${HEADER_CELL}`}>#</Th>
                  <SortHeader label="Project" sortKey="name" active={sortKey === "name"} dir={sortDir} onClick={toggleSort} className="w-[16%]" />
                  <Th className={`w-[9%] ${HEADER_CELL}`}>Stage</Th>
                  <SortHeader label="Contract" sortKey="awardedContractValue" active={sortKey === "awardedContractValue"} dir={sortDir} onClick={toggleSort} className="w-[9%] text-right" />
                  <SortHeader label="Executed" sortKey="workExecutedValue" active={sortKey === "workExecutedValue"} dir={sortDir} onClick={toggleSort} className="w-[9%] text-right" />
                  <SortHeader label="Paid" sortKey="paidAmount" active={sortKey === "paidAmount"} dir={sortDir} onClick={toggleSort} className="w-[9%] text-right" />
                  <SortHeader label="Remaining" sortKey="remainingContract" active={sortKey === "remainingContract"} dir={sortDir} onClick={toggleSort} className="w-[9%] text-right" />
                  <SortHeader label="Progress" sortKey="progress" active={sortKey === "progress"} dir={sortDir} onClick={toggleSort} className="w-[12%]" />
                  <Th className={`w-[12%] ${HEADER_CELL}`}>Cost Used</Th>
                  <Th className={`w-[7%] text-right ${HEADER_CELL}`}>Pending</Th>
                  <Th className={`w-[8%] ${HEADER_CELL}`}>Health</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rows.map((p: ExecutiveDashboardProjectRow, i) => (
                  <Tr key={p.projectId} className={i % 2 === 1 ? "bg-gray-50/60 dark:bg-white/[0.02]" : ""}>
                    <Td className={`${BODY_CELL} text-gray-400`}>{i + 1}</Td>
                    <Td className={BODY_CELL}>
                      <div className="font-semibold text-[#172033] dark:text-[#F1F5F9] whitespace-nowrap truncate leading-tight" title={p.name}>{p.name}</div>
                      <div className="text-[11px] text-gray-400 leading-tight">{p.code}</div>
                    </Td>
                    <Td className={`${BODY_CELL} whitespace-nowrap overflow-hidden`}>
                      <span className={`block truncate font-medium text-[11px]! ${STAGE_TEXT[p.overallStage] ?? "text-gray-500"}`} title={p.overallStage}>
                        {p.overallStage}
                      </span>
                    </Td>
                    <Td className={`${BODY_CELL} text-right tabular-nums`}>{fmtCr(p.awardedContractValue)}</Td>
                    <Td className={`${BODY_CELL} text-right tabular-nums`}>{fmtCr(p.workExecutedValue)}</Td>
                    <Td className={`${BODY_CELL} text-right tabular-nums text-emerald-600 dark:text-emerald-400`}>{fmtCr(p.paidAmount)}</Td>
                    <Td className={`${BODY_CELL} text-right tabular-nums`}>{fmtCr(p.remainingContract)}</Td>
                    <Td className={BODY_CELL}>
                      <div className="flex items-center gap-2 min-w-[90px]">
                        <div className="w-12 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, p.progress)}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums">{p.progress}%</span>
                      </div>
                    </Td>
                    <Td className={BODY_CELL}>
                      {(() => {
                        const costUsedPct = p.awardedContractValue > 0 ? Math.round((p.billedGross / p.awardedContractValue) * 100) : 0;
                        const overspending = costUsedPct > p.progress + 10;
                        return (
                          <div className="flex items-center gap-2 min-w-[90px]">
                            <div className="w-12 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                              <div className={`h-full rounded-full ${overspending ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${Math.min(100, costUsedPct)}%` }} />
                            </div>
                            <span className="text-xs font-semibold tabular-nums">{costUsedPct}%</span>
                          </div>
                        );
                      })()}
                    </Td>
                    <Td className={`${BODY_CELL} text-right`}>
                      {(() => {
                        const pendingPayment = Math.max(0, p.certifiedNet - p.paidAmount);
                        return pendingPayment > 0 ? (
                          <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">{fmtCr(pendingPayment)}</span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">₹0</span>
                        );
                      })()}
                    </Td>
                    <Td className={BODY_CELL}>
                      <button
                        type="button"
                        className="cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                        title={p.healthReasons.length ? p.healthReasons.join(" · ") : "No issues detected"}
                        aria-label={`Health: ${p.health}.${p.healthReasons.length ? " " + p.healthReasons.join(". ") : " No issues detected."}`}
                      >
                        <Badge color={HEALTH_BADGE[p.health] ?? "gray"} small>{p.health}</Badge>
                      </button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
