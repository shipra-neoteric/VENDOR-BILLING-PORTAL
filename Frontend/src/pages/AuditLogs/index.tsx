import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { History } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import { AUDIT_MODULES } from "./moduleMeta";

interface SummaryRow {
  module: string;
  count: number;
  lastActivityAt: string;
}

export default function AuditLogs() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Record<string, SummaryRow>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get("/audit-logs/summary")
      .then((res) => {
        const map: Record<string, SummaryRow> = {};
        (res.data.summary ?? []).forEach((row: SummaryRow) => {
          map[row.module] = row;
        });
        setSummary(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-[900px] mx-auto">
      <PageHeader
        title="Audit Logs"
        subtitle="Complete record of who did what, and when — pick a module to see its activity."
        icon={History}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {AUDIT_MODULES.map((m) => {
          const row = summary[m.key];
          const count = row?.count ?? 0;
          const Icon = m.icon;
          return (
            <div
              key={m.key}
              onClick={() => navigate(`/audit-logs/${m.key}`)}
              className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 border-l-4 border-l-primary rounded-lg p-5 pb-4 cursor-pointer hover:shadow-lg transition-shadow shadow-sm"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-primary shrink-0" />
                <div className="text-[17px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9] truncate">{m.label}</div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">{m.subtitle}</div>
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>{loading ? "…" : `${count} log${count !== 1 ? "s" : ""}`}</span>
                {row?.lastActivityAt && <span>{dayjs(row.lastActivityAt).format("DD MMM, hh:mm a")}</span>}
              </div>
              <div className="mt-3 text-xs text-primary font-semibold">Open →</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
