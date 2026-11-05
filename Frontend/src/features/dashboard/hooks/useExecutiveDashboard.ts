import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import apiClient from "../../../services/apiClient";
import type { ExecutiveDashboardReport } from "../../../types/ExecutiveDashboard";

const DEBOUNCE_MS = 350;
// Reports already loaded this session, by filter set. Going Dashboard -> Projects -> back (or between the pages that share this
// hook) shows the last report at once and refreshes it quietly, instead of an empty page and a spinner for every visit.
const FRESH_MS = 30_000;
const reportCache = new Map<string, { data: ExecutiveDashboardReport; at: number }>();

// Reads project/category/contractor/date filters straight off the URL (so a
// refresh or a shared link reproduces the exact same view) and calls GET
// /api/dashboard/executive whenever any of them change. `stage` isn't read
// here — the backend no-ops it (Phase 2) and there's no UI control for it yet.
export function useExecutiveDashboard() {
  const [searchParams] = useSearchParams();
  const cacheKey = searchParams.toString();
  const cached = reportCache.get(cacheKey);
  const [data, setData] = useState<ExecutiveDashboardReport | null>(cached ? cached.data : null);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<Error | null>(null);
  const firstRun = useRef(true);
  // Bumped by retry() to force the effect below to re-run even when none of
  // the actual filter values changed (a plain "try again" after a failure).
  const [retryTick, setRetryTick] = useState(0);

  const projectId = searchParams.get("projectId") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const contractorId = searchParams.get("contractorId") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  // A generation counter, not an AbortController — apiClient's response
  // interceptor toasts "Cannot connect to the server" on any request that
  // fails without a `response` (see services/apiClient.ts), which is exactly
  // what an aborted axios request looks like. Rejecting a stale RESPONSE
  // instead of cancelling the in-flight REQUEST gets the same "a fast filter
  // change can't let an old slow response win" guarantee without tripping
  // that toast on every superseded filter change.
  const requestGen = useRef(0);

  useEffect(() => {
    const gen = ++requestGen.current;
    const hit = reportCache.get(cacheKey);
    if (hit) { setData(hit.data); setLoading(false); setError(null); }
    // Fresh enough (and not a manual retry): nothing to fetch.
    if (hit && Date.now() - hit.at < FRESH_MS && retryTick === 0) { firstRun.current = false; return; }
    // The first load of a page goes out at once; the debounce is only for a user typing / changing filters afterwards.
    const wait = firstRun.current ? 0 : DEBOUNCE_MS;
    firstRun.current = false;
    const timer = setTimeout(() => {
      if (!hit) setLoading(true);
      const params: Record<string, string> = {};
      if (projectId) params.projectId = projectId;
      if (categoryId) params.categoryId = categoryId;
      if (contractorId) params.contractorId = contractorId;
      if (from) params.from = from;
      if (to) params.to = to;

      apiClient
        .get<ExecutiveDashboardReport>("/dashboard/executive", { params })
        .then((res) => {
          if (gen !== requestGen.current) return;
          reportCache.set(cacheKey, { data: res.data, at: Date.now() });
          setData(res.data);
          setError(null);
        })
        .catch((err) => {
          if (gen !== requestGen.current) return;
          setError(err instanceof Error ? err : new Error("Failed to load the dashboard"));
        })
        .finally(() => {
          if (gen !== requestGen.current) return;
          setLoading(false);
        });
    }, wait);

    return () => clearTimeout(timer);
  }, [projectId, categoryId, contractorId, from, to, retryTick, cacheKey]);

  const retry = () => setRetryTick((t) => t + 1);

  return { data, loading, error, retry };
}
