import dayjs from "dayjs";
import type { LogRow } from "./ModuleLogs";

const fmtVal = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "N/A";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

interface PermEntry { module: string; actions: string[] }
// The permissions field is an array of {module, actions} objects — dumping
// that through JSON.stringify (fmtVal's generic fallback) produced one huge
// unreadable blob per side instead of a per-module diff a human can actually
// scan.
function isPermsArray(v: unknown): v is PermEntry[] {
  return Array.isArray(v) && v.every((e) => e && typeof e === "object" && typeof (e as PermEntry).module === "string" && Array.isArray((e as PermEntry).actions));
}

function PermsList({ perms, tone }: { perms: PermEntry[]; tone: "red" | "green" }) {
  if (perms.length === 0) return <span className="text-xs text-gray-400 italic">No permissions</span>;
  const cls = tone === "red"
    ? "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20"
    : "bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/20";
  return (
    <div className={`rounded-md border p-2.5 space-y-1 ${cls}`}>
      {perms.map((p) => (
        <div key={p.module} className="text-xs">
          <span className="font-semibold">{p.module}</span>: {p.actions.join(", ")}
        </div>
      ))}
    </div>
  );
}

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
      {resourceLabel && <div className="text-xs text-gray-400 break-all">{resourceLabel}</div>}

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
        <div className="bg-gray-50 dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 text-sm text-[#1A1A2E] dark:text-[#F1F5F9] break-all">
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
                {isPermsArray(c.from) && isPermsArray(c.to) ? (
                  <div className="space-y-2">
                    <PermsList perms={c.from} tone="red" />
                    <div className="text-gray-400 text-xs">↓</div>
                    <PermsList perms={c.to} tone="green" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold px-2 py-1 rounded-md bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 break-all max-w-full">
                      {fmtVal(c.from)}
                    </span>
                    <span className="text-gray-400 text-xs">→</span>
                    <span className="text-xs font-semibold px-2 py-1 rounded-md bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20 break-all max-w-full">
                      {fmtVal(c.to)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
