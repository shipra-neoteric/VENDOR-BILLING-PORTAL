import dayjs from "dayjs";
import type { LogRow } from "./ModuleLogs";

const fmtVal = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "N/A";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

function initials(name?: string) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default function ActivityDetailDrawer({ row }: { row: LogRow }) {
  const resourceLabel = row.entityType ? `${row.entityType}${row.entityLabel ? `: ${row.entityLabel}` : ""}` : null;
  const hasChanges = !!row.changes && Object.keys(row.changes).length > 0;

  return (
    <div className="space-y-5">
      {resourceLabel && <div className="text-xs text-gray-400">{resourceLabel}</div>}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
            {initials(row.userName)}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9] truncate">{row.userName || "System"}</div>
            <div className="text-xs text-gray-400 truncate">{row.userEmail || "—"}</div>
          </div>
        </div>
        <div className="text-xs text-gray-400 shrink-0">{dayjs(row.createdAt).format("DD MMM YYYY, hh:mm a")}</div>
      </div>

      <div>
        <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">What Happened</div>
        <div className="bg-gray-50 dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">
          {row.description}
        </div>
      </div>

      {hasChanges && (
        <div>
          <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Field Changes</div>
          <div className="space-y-2.5">
            {Object.entries(row.changes!).map(([field, c]) => (
              <div key={field} className="border border-gray-200 dark:border-gray-700/40 rounded-lg p-3">
                <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{field}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold px-2 py-1 rounded-md bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20">
                    {fmtVal(c.from)}
                  </span>
                  <span className="text-gray-400 text-xs">→</span>
                  <span className="text-xs font-semibold px-2 py-1 rounded-md bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20">
                    {fmtVal(c.to)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
