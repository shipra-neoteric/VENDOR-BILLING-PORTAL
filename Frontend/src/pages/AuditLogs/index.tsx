import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { History } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import Card from "../../ui/Card";
import Segmented from "../../ui/Segmented";
import { Skeleton } from "../../ui/Skeleton";
import { AUDIT_MODULES } from "./moduleMeta";

interface SummaryRow {
  module: string;
  count: number;
  lastActivityAt: string;
}

interface UserSummaryRow {
  userEmail: string;
  userName?: string;
  count: number;
  lastActivityAt: string;
}

export default function AuditLogs() {
  const navigate = useNavigate();
  const [view, setView] = useState<"module" | "user">("module");
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

  // Fetched once per session on the "By User" tab, not per module — the same
  // /audit-logs/users endpoint ModuleLogs.tsx uses, just without a module
  // filter so it aggregates across everything a user has ever touched.
  const [userSummaries, setUserSummaries] = useState<UserSummaryRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);

  useEffect(() => {
    if (view !== "user" || usersLoaded) return;
    setUsersLoading(true);
    apiClient.get("/audit-logs/users")
      .then((res) => { setUserSummaries(res.data.users ?? []); setUsersLoaded(true); })
      .catch(() => {})
      .finally(() => setUsersLoading(false));
  }, [view, usersLoaded]);

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle={view === "module"
          ? "Complete record of who did what, and when — pick a module to see its activity."
          : "Pick a user to see everything they've done, across every module."}
        icon={History}
        actions={
          <Segmented
            value={view}
            onChange={(v) => setView(v as "module" | "user")}
            options={[
              { value: "module", label: "By Module" },
              { value: "user", label: "By User" },
            ]}
          />
        }
      />

      {view === "module" ? (
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
      ) : usersLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : userSummaries.length === 0 ? (
        <div className="text-sm text-gray-400 py-10 text-center">No activity recorded yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {userSummaries.map((u) => (
            <Card
              key={u.userEmail || "system"}
              onClick={() => navigate(`/audit-logs/all?user=${encodeURIComponent(u.userEmail)}`)}
              className="cursor-pointer hover:shadow-lg transition-all duration-200"
            >
              <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9] truncate">
                {u.userName || (u.userEmail ? u.userEmail : "System")}
              </div>
              {u.userEmail && u.userName && (
                <div className="text-xs text-gray-400 truncate mb-2">{u.userEmail}</div>
              )}
              <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 mt-2">
                <span className="font-medium text-gray-600 dark:text-gray-300">{u.count} log{u.count !== 1 ? "s" : ""}</span>
                <span>{dayjs(u.lastActivityAt).format("DD MMM, hh:mm a")}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
