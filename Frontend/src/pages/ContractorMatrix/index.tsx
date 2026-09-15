import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Grid3x3 } from "lucide-react";
import apiClient from "../../services/apiClient";
import type { ContractorMatrixReport } from "../../types/ExecutiveDashboard";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Badge from "../../ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { Skeleton } from "../../ui/Skeleton";
import EmptyState from "../../ui/EmptyState";
import { SearchFilter } from "../../ui/Filters";
import { fmtCr } from "../../features/dashboard/utils";

const DEBOUNCE_MS = 350;

// Same "read filters straight off the URL, debounce, reject stale responses
// via a generation counter" shape as
// features/dashboard/hooks/useExecutiveDashboard.ts — kept local to this page
// since its response shape (rows/categories/contractors, no kpis/alerts/etc.)
// is different enough that sharing the hook wouldn't actually save code.
function useContractorMatrix() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<ContractorMatrixReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const requestGen = useRef(0);

  const projectId = searchParams.get("projectId") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const contractorId = searchParams.get("contractorId") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  useEffect(() => {
    const gen = ++requestGen.current;
    const timer = setTimeout(() => {
      setLoading(true);
      const params: Record<string, string> = {};
      if (projectId) params.projectId = projectId;
      if (categoryId) params.categoryId = categoryId;
      if (contractorId) params.contractorId = contractorId;
      if (from) params.from = from;
      if (to) params.to = to;

      apiClient
        .get<ContractorMatrixReport>("/dashboard/executive/contractor-matrix", { params })
        .then((res) => {
          if (gen !== requestGen.current) return;
          setData(res.data);
          setError(null);
        })
        .catch((err) => {
          if (gen !== requestGen.current) return;
          setError(err instanceof Error ? err : new Error("Failed to load the contractor matrix"));
        })
        .finally(() => {
          if (gen !== requestGen.current) return;
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [projectId, categoryId, contractorId, from, to, retryTick]);

  const retry = () => setRetryTick((t) => t + 1);
  return { data, loading, error, retry };
}

// green=Healthy, amber=Attention, blue=Pending, red=Critical — same
// vocabulary as ContractorsByCategory's own STATUS_BADGE.
const STATUS_BADGE: Record<string, "green" | "amber" | "blue" | "red"> = {
  Healthy: "green", Attention: "amber", Pending: "blue", Critical: "red",
};
const STATUS_DOT: Record<string, string> = {
  Healthy: "bg-emerald-500", Attention: "bg-amber-500", Pending: "bg-blue-500", Critical: "bg-red-500",
};
const STATUS_LEGEND: { status: string; label: string }[] = [
  { status: "Healthy", label: "Healthy" },
  { status: "Attention", label: "Attention" },
  { status: "Pending", label: "Pending" },
  { status: "Critical", label: "Critical" },
];

export default function ContractorMatrix() {
  const [searchParams] = useSearchParams();
  const { data, loading, error, retry } = useContractorMatrix();
  const [contractorSearch, setContractorSearch] = useState("");

  // Rows = contractors, columns = categories — reads better on a wide screen
  // than the reverse (there are usually far more contractors than
  // categories, so this keeps the header row short and lets the vertical
  // list of contractors scroll naturally instead of the column headers).
  const cellByKey = useMemo(() => {
    const rows = data?.rows ?? [];
    const map = new Map<string, (typeof rows)[number]>();
    for (const r of rows) map.set(`${r.contractorCode} ${r.category}`, r);
    return map;
  }, [data]);

  const contractorRows = useMemo(() => {
    const contractors = data?.contractors ?? [];
    if (!contractorSearch.trim()) return contractors;
    const q = contractorSearch.trim().toLowerCase();
    return contractors.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [data, contractorSearch]);

  const categories = data?.categories ?? [];
  const maxContractValue = useMemo(
    () => Math.max(1, ...((data?.rows ?? []).map(r => r.contractValue))),
    [data]
  );

  const backLinkSearch = searchParams.toString();

  return (
    <div className="pb-6">
      <PageHeader
        title="Contractor x Category Matrix"
        subtitle="Every contractor's contract value, paid and pending amount, broken down by work category."
        icon={Grid3x3}
        actions={
          <Link to={{ pathname: "/dashboard", search: backLinkSearch }}>
            <Btn label="Back to Dashboard" icon={ArrowLeft} outline small />
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm w-full">
          <SearchFilter value={contractorSearch} onChange={setContractorSearch} placeholder="Search contractor…" />
        </div>
        {data && data.rows.length > 0 && (
          <div className="flex items-center gap-4 flex-wrap">
            {STATUS_LEGEND.map(({ status, label }) => (
              <span key={status} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="font-bold text-gray-600 dark:text-gray-300 mb-1">Couldn't load the contractor matrix</div>
          <div className="text-sm text-gray-400 mb-4 max-w-sm">{error.message}</div>
          <Btn label="Retry" color="primary" onClick={retry} />
        </div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState title="No contractor activity yet" message="Contractors will appear here once work orders are raised." />
      ) : contractorRows.length === 0 ? (
        <EmptyState title="No contractors match that search" message="Try a different name or vendor code." />
      ) : (
        <>
          <Table containerClassName="max-h-[70vh] overflow-y-auto" className="min-w-max border-separate border-spacing-0">
            <Thead>
              <Tr>
                <Th stickyLeft className="min-w-[200px] py-3 sticky top-0 z-20 shadow-[1px_0_0_0_rgba(0,0,0,0.06)]">
                  Contractor
                </Th>
                {categories.map(cat => (
                  <Th key={cat} className="min-w-[188px] text-right py-3 sticky top-0 z-10" title={cat}>
                    <span className="block truncate">{cat}</span>
                  </Th>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {contractorRows.map((c, i) => (
                <Tr key={c.code} className={i % 2 === 1 ? "bg-gray-50/60 dark:bg-white/[0.02]" : ""}>
                  <Td
                    stickyLeft
                    className="font-semibold text-[#172033] dark:text-[#F1F5F9] truncate min-w-[200px] shadow-[1px_0_0_0_rgba(0,0,0,0.06)]"
                    title={`${c.name} (${c.code})`}
                  >
                    {c.name}
                  </Td>
                  {categories.map(cat => {
                    const cell = cellByKey.get(`${c.code} ${cat}`);
                    if (!cell) {
                      return (
                        <Td key={cat} className="text-center min-w-[188px]">
                          <span className="text-gray-300 dark:text-gray-600 text-xs">{"–"}</span>
                        </Td>
                      );
                    }
                    const intensity = Math.min(1, cell.contractValue / maxContractValue);
                    return (
                      <Td
                        key={cat}
                        className="min-w-[188px] align-top"
                        title={[
                          `Contract Value: ${fmtCr(cell.contractValue)}`,
                          `Paid: ${fmtCr(cell.paid)}`,
                          `Pending: ${fmtCr(cell.pending)}`,
                          `Projects: ${cell.projectCount}`,
                          `Status: ${cell.status}`,
                        ].join("\n")}
                      >
                        <div className="flex flex-col items-end gap-1.5 py-0.5">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-bold text-sm tabular-nums text-[#172033] dark:text-white">
                              {fmtCr(cell.contractValue)}
                            </span>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[cell.status] ?? "bg-blue-500"}`} />
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">{fmtCr(cell.paid)} paid</span>
                            <Badge color={STATUS_BADGE[cell.status] ?? "blue"} small>{cell.status}</Badge>
                          </div>
                          <div className="w-full h-1 rounded-full bg-gray-100 dark:bg-gray-700/50 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.max(4, intensity * 100)}%` }}
                            />
                          </div>
                        </div>
                      </Td>
                    );
                  })}
                </Tr>
              ))}
            </Tbody>
          </Table>
          <p className="mt-3 text-[11px] text-gray-400">
            The bar beneath each amount shows contract value relative to the largest cell in view; the dot reflects payment
            health. An empty {"–"} cell means that contractor has no work order in that category (not a zero-value one).
          </p>
        </>
      )}
    </div>
  );
}
