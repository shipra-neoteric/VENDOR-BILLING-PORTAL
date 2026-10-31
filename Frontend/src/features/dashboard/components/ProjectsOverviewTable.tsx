import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, ArrowDown, ArrowUpDown, Download, ExternalLink } from "lucide-react";
import apiClient from "../../../services/apiClient";
import { fmtCr } from "../utils";
import type { ExecutiveDashboardProjectRow } from "../../../types/ExecutiveDashboard";
import Btn from "../../../ui/Btn";
import Badge from "../../../ui/Badge";
import { SearchFilter } from "../../../ui/Filters";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../ui/Table";
import EmptyState from "../../../ui/EmptyState";

type SortKey = "name" | "awardedContractValue" | "workExecutedValue" | "billedGross" | "certifiedNet" | "paidAmount" | "remainingContract" | "progress" | "pendingBillReqs";

const HEADER_CELL = "px-3! py-2! text-[11px]! border-r border-gray-200 dark:border-gray-700/60 last:border-r-0";
const BODY_CELL = "px-3! py-1.5! text-[13px]! align-middle! border-r border-gray-100 dark:border-gray-700/40 last:border-r-0";

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

// The Projects Overview table — shared by the Dashboard and the standalone /projects-overview page.
// `projects` is the dashboard's own project rows (already filtered by the page's filters); `stage`
// narrows them further by overall stage; `exportParams` is passed straight to the CSV export.
export default function ProjectsOverviewTable({ projects, stage = "", exportParams = {}, maxHeightClass = "max-h-[70vh]" }: {
  projects: ExecutiveDashboardProjectRow[];
  stage?: string;
  exportParams?: Record<string, string>;
  maxHeightClass?: string;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("awardedContractValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [exporting, setExporting] = useState(false);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await apiClient.get("/dashboard/executive/export.csv", { params: exportParams, responseType: "blob" });
      saveBlob(res.data as Blob, `projects-overview-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      // Handled globally
    } finally {
      setExporting(false);
    }
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

  return (
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
        <Table containerClassName={`${maxHeightClass} overflow-y-auto`} className="min-w-[1100px]">
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
              <Th className={`w-[5%] text-center uppercase tracking-wider ${HEADER_CELL}`}>
                ACTION
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((p, i) => (
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
                    // Displayed text is capped at 100% (a corrupt/missing contractValue
                    // or genuine overbilling can otherwise show "463%") — the
                    // overspending flag/bar-color still uses the real, uncapped
                    // ratio so a genuinely huge overspend still reads as amber.
                    const displayPct = Math.min(100, costUsedPct);
                    return (
                      <div className="flex items-center gap-2 min-w-[90px]">
                        <div className="w-12 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                          <div className={`h-full rounded-full ${overspending ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${displayPct}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums">{displayPct}%{overspending && costUsedPct > 100 ? "+" : ""}</span>
                      </div>
                    );
                  })()}
                </Td>
                <Td className={`${BODY_CELL} text-right`}>
                  {(() => {
                    const pendingPayment = Math.max(0, p.certifiedNet - p.paidAmount);
                    return pendingPayment > 0 ? (
                      <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                        {fmtCr(pendingPayment)}
                      </span>
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
                    <Badge color={HEALTH_BADGE[p.health] ?? "gray"} small>
                      {p.health}
                    </Badge>
                  </button>
                </Td>
                <Td className={`${BODY_CELL} text-center`}>
                  <button
                    type="button"
                    onClick={() => navigate(`/projects?id=${p.projectId}`)}
                    className="inline-flex items-center justify-center p-1 text-gray-500 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                    title="View Project Details"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
