import type { ExecutiveDashboardReport } from "../../types/ExecutiveDashboard";

// Dashboard reports already loaded this session, by filter set (see hooks/useExecutiveDashboard.ts). Kept in its own tiny module so the
// API client (after any change is saved) and the login/logout code can empty it without importing the hook — which would be circular.
export const reportCache = new Map<string, { data: ExecutiveDashboardReport; at: number }>();

export function clearExecutiveDashboardCache() {
  reportCache.clear();
}
