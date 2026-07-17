import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "../../../services/apiClient";

export interface ReportSchedule {
  _id: string;
  viewType: "operational" | "financial";
  projectId: string | null;
  projectName: string;
  timeOfDay: string;
  active: boolean;
  lastNotifiedDate: string | null;
  createdAt: string;
}

export function useReportSchedules() {
  const queryClient = useQueryClient();

  const query = useQuery<ReportSchedule[]>({
    queryKey: ["report-schedules"],
    queryFn: async () => (await apiClient.get("/report-schedules")).data.schedules,
  });

  const create = useMutation({
    mutationFn: async (payload: { viewType: string; projectId: string | null; projectName: string; timeOfDay: string }) =>
      (await apiClient.post("/report-schedules", payload)).data.schedule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["report-schedules"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/report-schedules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["report-schedules"] }),
  });

  return { schedules: query.data ?? [], isLoading: query.isLoading, create, remove };
}

export function useDueReportSchedules() {
  return useQuery<ReportSchedule[]>({
    queryKey: ["report-schedules-due"],
    queryFn: async () => (await apiClient.get("/report-schedules/due")).data.due,
    staleTime: 0,
    refetchOnMount: true,
  });
}
