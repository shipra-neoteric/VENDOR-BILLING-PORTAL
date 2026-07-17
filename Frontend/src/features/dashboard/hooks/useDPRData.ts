import { useQuery } from "@tanstack/react-query";
import apiClient from "../../../services/apiClient";
import type { DPRReport } from "../../../types/DPR";

export function useDPRData(date: string, projectId: string | "all") {
  return useQuery<DPRReport>({
    queryKey: ["dpr", date, projectId],
    queryFn: async () => {
      const params: Record<string, string> = { date };
      if (projectId !== "all") params.projectId = projectId;
      const res = await apiClient.get("/dpr", { params });
      return res.data;
    },
    staleTime: 60 * 1000,
    retry: 2,
  });
}
