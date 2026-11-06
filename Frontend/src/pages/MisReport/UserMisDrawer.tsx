import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { User as UserIcon, FilePlus2, CheckCircle2, XCircle, Undo2, Timer } from "lucide-react";
import apiClient from "../../services/apiClient";
import Modal from "../../ui/Modal";
import Btn from "../../ui/Btn";
import Spinner from "../../ui/Spinner";
import NxBadge from "../../ui/nexora/Badge";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import { fmtDuration, slaColor, type UserMisRow } from "./shared";

interface ActivityItem {
  type: "created" | "approved" | "rejected" | "sent-back" | "sentBack" | "sla";
  module: string; ref: string; detail: string; at: string;
  amount?: number | null; status?: string; stage?: string; note?: string;
  slaKind?: "onTime" | "delayed" | "pending"; delayMinutes?: number; tatMinutes?: number | null; dueAt?: string | null;
}
type Filter = "all" | "created" | "decisions" | "sla";

const fmtMoney = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

const TYPE_META: Record<string, { label: string; icon: typeof FilePlus2; tone: string }> = {
  created: { label: "Created", icon: FilePlus2, tone: "text-blue-600 bg-blue-50 dark:bg-blue-500/10" },
  approved: { label: "Approved", icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10" },
  rejected: { label: "Rejected", icon: XCircle, tone: "text-red-600 bg-red-50 dark:bg-red-500/10" },
  sentBack: { label: "Sent back", icon: Undo2, tone: "text-amber-600 bg-amber-50 dark:bg-amber-500/10" },
  sla: { label: "SLA stage", icon: Timer, tone: "text-primary bg-orange-50 dark:bg-orange-500/10" },
};
const SLA_BADGE: Record<string, { color: NxBadgeColor; label: string }> = {
  onTime: { color: "green", label: "On time" }, delayed: { color: "red", label: "Delayed" }, pending: { color: "amber", label: "Pending" },
};

function Stat({ label, value, tone = "" }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-700/50 bg-white dark:bg-gray-800/40 px-3 py-2.5">
      <div className="text-[11px] text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-0.5 ${tone}`}>{value}</div>
    </div>
  );
}

// One person's performance and dated activity history — opened from a row of the MIS Report user table.
export default function UserMisDrawer({ user, from, to, onClose }: { user: UserMisRow; from: string; to: string; onClose: () => void }) {
  const [row, setRow] = useState<UserMisRow>(user);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let live = true;
    setActivity(null); setError(false);
    apiClient.get(`/user-mis/${user.userId}`, { params: { from: from || undefined, to: to || undefined } })
      .then(r => { if (!live) return; setRow(r.data.user); setActivity(r.data.activity ?? []); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [user.userId, from, to]);

  const shown = useMemo(() => (activity ?? []).filter(a =>
    filter === "all" ? true : filter === "created" ? a.type === "created" : filter === "sla" ? a.type === "sla" : (a.type !== "created" && a.type !== "sla")), [activity, filter]);
  const counts = useMemo(() => ({
    all: activity?.length ?? 0,
    created: activity?.filter(a => a.type === "created").length ?? 0,
    decisions: activity?.filter(a => a.type !== "created" && a.type !== "sla").length ?? 0,
    sla: activity?.filter(a => a.type === "sla").length ?? 0,
  }), [activity]);
  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" }, { key: "created", label: "Created" }, { key: "decisions", label: "Decisions" }, { key: "sla", label: "SLA stages" },
  ];

  return (
    <Modal
      icon={UserIcon}
      title={row.name}
      subtitle={[row.role, row.department && row.department.replace(/^\w/, c => c.toUpperCase())].filter(Boolean).join(" · ")}
      extraWide
      onClose={onClose}
      footer={<div className="flex justify-end"><Btn outline label="Close" onClick={onClose} /></div>}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        <Stat label="Work Orders created" value={row.workOrders} />
        <Stat label="Bill Requests raised" value={row.billRequests} />
        <Stat label="Bills created" value={row.bills} />
        <Stat label="SLA stages handled" value={row.slaTotal} />
        <Stat label="Approved" value={row.approved} tone="text-emerald-600" />
        <Stat label="Rejected" value={row.rejected} tone="text-red-600" />
        <Stat label="Sent back" value={row.sentBack} tone="text-amber-600" />
        <Stat label="SLA compliance" value={row.slaPct === null ? "—" : `${row.slaPct}%`} />
      </div>
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <Stat label="On time" value={row.slaOnTime} tone="text-emerald-600" />
        <Stat label="Delayed" value={row.slaDelayed} tone="text-red-600" />
        <Stat label="Avg TAT" value={fmtDuration(row.avgTatMinutes)} />
      </div>
      {row.slaPct !== null && (
        <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden mb-5 -mt-2">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, row.slaPct)}%`, background: slaColor(row.slaPct) }} />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-3">
        {FILTERS.map(f => (
          <button
            key={f.key} type="button" onClick={() => setFilter(f.key)}
            className={`h-8 px-3 rounded-full text-xs font-medium border transition-colors ${filter === f.key
              ? "bg-primary text-white border-primary" : "bg-white dark:bg-transparent text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
          >
            {f.label} <span className="opacity-80">({counts[f.key]})</span>
          </button>
        ))}
      </div>

      {error ? <div className="text-sm text-red-500">Could not load the activity history.</div>
        : !activity ? <Spinner label="Loading…" />
        : shown.length === 0 ? <div className="text-sm text-gray-400 py-6 text-center">No activity in this period</div>
        : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/50 border border-gray-100 dark:border-gray-700/50 rounded-lg">
            {shown.map((a, i) => {
              const key = a.type === "sent-back" ? "sentBack" : a.type;
              const meta = TYPE_META[key] ?? TYPE_META.created;
              const Icon = meta.icon;
              return (
                <li key={`${a.type}-${a.ref}-${a.at}-${i}`} className="flex gap-3 px-3 py-2.5">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${meta.tone}`}><Icon className="w-4 h-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[13px] font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{meta.label}: {a.ref || "—"}</span>
                      <NxBadge color="gray">{a.module}</NxBadge>
                      {a.type === "sla" && a.slaKind && <NxBadge color={SLA_BADGE[a.slaKind].color}>{SLA_BADGE[a.slaKind].label}</NxBadge>}
                    </div>
                    <div className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {[a.stage, a.detail].filter(Boolean).join(" · ") || "—"}
                      {a.amount ? ` · ${fmtMoney(a.amount)}` : ""}
                    </div>
                    {a.type === "sla" && (
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {a.tatMinutes != null ? `Took ${fmtDuration(a.tatMinutes)}` : "Open"}
                        {a.dueAt ? ` · due ${dayjs(a.dueAt).format("DD MMM, h:mm A")}` : ""}
                        {a.slaKind === "delayed" && a.delayMinutes ? ` · ${fmtDuration(a.delayMinutes)} late` : ""}
                      </div>
                    )}
                    {a.note && <div className="text-[11px] text-gray-400 mt-0.5 italic">“{a.note}”</div>}
                  </div>
                  <div className="text-[11px] text-gray-400 whitespace-nowrap text-right shrink-0">
                    {dayjs(a.at).format("DD MMM YYYY")}<div>{dayjs(a.at).format("h:mm A")}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      {activity && activity.length >= 300 && <div className="text-[11px] text-gray-400 mt-2">Showing the latest 300 entries.</div>}
    </Modal>
  );
}
