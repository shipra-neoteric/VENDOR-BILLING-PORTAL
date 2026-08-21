import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { History } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import Card from "../../ui/Card";
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
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle="Complete record of who did what, and when — pick a module to see its activity."
        icon={History}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
        {AUDIT_MODULES.map((m) => {
          const row = summary[m.key];
          const count = row?.count ?? 0;
          const Icon = m.icon;
          return (
            <Card
              key={m.key}
              onClick={() => navigate(`/audit-logs/${m.key}`)}
              className="cursor-pointer hover:shadow-lg transition-all duration-200"
            >
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9] truncate">{m.label}</div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{m.subtitle}</div>
              <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                <span className="font-medium text-gray-600 dark:text-gray-300">{loading ? "…" : `${count} log${count !== 1 ? "s" : ""}`}</span>
                {row?.lastActivityAt && <span>{dayjs(row.lastActivityAt).format("DD MMM, hh:mm a")}</span>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
