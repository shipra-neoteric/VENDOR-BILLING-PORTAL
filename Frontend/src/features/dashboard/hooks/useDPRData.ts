import { useQuery } from "@tanstack/react-query";
import apiClient from "../../../services/apiClient";
import type { DPRReport } from "../../../types/DPR";

// dateFrom === null means "no lower bound" (the "All Time" range preset).
export function useDPRData(dateFrom: string | null, dateTo: string, projectId: string | "all") {
  return useQuery<DPRReport>({
    queryKey: ["dpr", dateFrom, dateTo, projectId],
    queryFn: async () => {
      const params: Record<string, string> = { dateTo };
      if (dateFrom) params.dateFrom = dateFrom;
      if (projectId !== "all") params.projectId = projectId;
      const res = await apiClient.get("/dpr", { params });
      return res.data;
    },
    staleTime: 60 * 1000,
    retry: 2,
  });
}
