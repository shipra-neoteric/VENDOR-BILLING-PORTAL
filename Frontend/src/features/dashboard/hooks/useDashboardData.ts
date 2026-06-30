import { useQuery } from "@tanstack/react-query";
import apiClient from "../../../services/apiClient";
import type { WORow, BillRow } from "../utils";

interface ProjectRow { _id: string; name?: string; location?: string; status?: string; contractValue?: number; }

interface DashboardData {
  workOrders: WORow[];
  bills:      BillRow[];
  projects:   ProjectRow[];
}

export function useDashboardData() {
  return useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [woRes, billRes, projRes] = await Promise.all([
        apiClient.get("/work-orders"),
        apiClient.get("/bills"),
        apiClient.get("/projects"),
      ]);
      return {
        workOrders: woRes.data.workOrders  ?? woRes.data  ?? [],
        bills:      billRes.data.bills     ?? billRes.data ?? [],
        projects:   projRes.data.projects  ?? projRes.data ?? [],
      };
    },
    staleTime: 2 * 60 * 1000,
    retry:     2,
  });
}
