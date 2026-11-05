import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, ArrowDown, ArrowUpDown, Eye, Search, ChevronLeft, ChevronRight } from "lucide-react";
import apiClient from "../../../services/apiClient";
import { fmtCr } from "../utils";
import type { ExecutiveDashboardProjectRow } from "../../../types/ExecutiveDashboard";
import Badge from "../../../ui/Badge";
import Card from "../../../ui/Card";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../ui/Table";
import EmptyState from "../../../ui/EmptyState";

type SortKey = "name" | "awardedContractValue" | "paidAmount" | "pendingBillsAmount";

const PAGE_SIZE = 10;

const STAGE_BADGE: Record<string, "blue" | "green" | "purple" | "amber" | "teal"> = {
  "Planning": "blue",
  "Work Orders Issued": "blue",
  "Work in Progress": "green",
  "Billing": "purple",
  "Payment Pending": "amber",
  "Completed": "teal",
};

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

// Downloads the projects overview as CSV for the given filters (used by the page's header button).
export async function exportProjectsOverviewCsv(exportParams: Record<string, string> = {}) {
  try {
    const res = await apiClient.get("/dashboard/executive/export.csv", { params: exportParams, responseType: "blob" });
    saveBlob(res.data as Blob, `projects-overview-${new Date().toISOString().slice(0, 10)}.csv`);
  } catch {
    // Handled globally
  }
}

function SortHeader({ label, sortKey, active, dir, onClick, className }: {
  label: string; sortKey: SortKey; active: boolean; dir: "asc" | "desc"; onClick: (k: SortKey) => void; className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  const alignRight = className?.includes("text-right");
  return (
    <Th className={className}>
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

// "My Projects" — the projects overview table (the projects page's rows, already filtered by the page's filters;
// `stage` narrows them further by overall stage), with its own search and paging.
export default function ProjectsOverviewTable({ projects, stage = "" }: {
  projects: ExecutiveDashboardProjectRow[];
  stage?: string;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("awardedContractValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const rows = useMemo(() => {
    const byStage = stage ? projects.filter(p => p.overallStage === stage) : projects;
    const filtered = search
      ? byStage.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase()))
      : byStage;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [projects, search, sortKey, sortDir, stage]);

  // Back to the first page whenever the list itself changes.
  useEffect(() => { setPage(1); }, [search, stage, projects, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const from = rows.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
  const to = Math.min(current * PAGE_SIZE, rows.length);

  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-base font-bold text-[#172033] dark:text-white">My Projects</h3>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by project name or code…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No projects match these filters" message="Try widening the date range or clearing a filter." />
      ) : (
        <>
          <Table className="min-w-[760px]">
            <Thead>
              <Tr>
                <SortHeader label="Project" sortKey="name" active={sortKey === "name"} dir={sortDir} onClick={toggleSort} className="w-[34%]" />
                <Th className="w-[20%]">Stage</Th>
                <SortHeader label="Paid" sortKey="paidAmount" active={sortKey === "paidAmount"} dir={sortDir} onClick={toggleSort} className="w-[18%] text-right" />
                <SortHeader label="Remaining" sortKey="pendingBillsAmount" active={sortKey === "pendingBillsAmount"} dir={sortDir} onClick={toggleSort} className="w-[18%] text-right" />
                <Th className="w-[10%] text-center">Action</Th>
              </Tr>
            </Thead>
            <Tbody>
              {pageRows.map((p) => {
                // Remaining = value of the bills still waiting (verification / approval / hold), not contract minus paid.
                const pending = Math.max(0, p.pendingBillsAmount);
                return (
                  <Tr key={p.projectId}>
                    <Td>
                      <div className="font-semibold text-[#172033] dark:text-[#F1F5F9] truncate" title={p.name}>{p.name}</div>
                      <div className="text-[11px] text-gray-400">{p.code}</div>
                    </Td>
                    <Td><Badge color={STAGE_BADGE[p.overallStage] ?? "gray"} small>{p.overallStage}</Badge></Td>
                    <Td className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{fmtCr(p.paidAmount)}</Td>
                    <Td className="text-right">
                      {pending > 0
                        ? <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">{fmtCr(pending)}</span>
                        : <span className="text-gray-300 dark:text-gray-600">₹0</span>}
                    </Td>
                    <Td className="text-center">
                      <button
                        type="button"
                        onClick={() => navigate(`/projects?id=${p.projectId}`)}
                        className="inline-flex items-center justify-center p-1.5 text-gray-500 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                        title="View Project Details"
                        aria-label={`View ${p.name}`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>Showing {from} to {to} of {rows.length} project{rows.length !== 1 ? "s" : ""}</span>
            {pageCount > 1 && (
              <div className="flex items-center gap-1">
                <button type="button" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Previous page"
                  className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-700 disabled:opacity-40">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map(n => (
                  <button key={n} type="button" onClick={() => setPage(n)} aria-current={n === current ? "page" : undefined}
                    className={`w-8 h-8 inline-flex items-center justify-center rounded-md border text-xs font-semibold ${n === current ? "bg-primary border-primary text-white" : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                    {n}
                  </button>
                ))}
                <button type="button" disabled={current === pageCount} onClick={() => setPage(current + 1)} aria-label="Next page"
                  className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-gray-700 disabled:opacity-40">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
