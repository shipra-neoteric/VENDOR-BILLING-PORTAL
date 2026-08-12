import type { ReactNode } from "react";
import { ChevronRight, TrendingUp, TrendingDown, CheckCircle2, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Card from "../../../ui/Card";
import Btn from "../../../ui/Btn";
import Modal from "../../../ui/Modal";
import { COMPARISON_LABELS } from "./MiniCharts";
import type { ComparisonMode } from "./MiniCharts";
import type { DPRDetailRow } from "../../../types/DPR";

export function progressBarClass(pct: number): string {
  return pct >= 90 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
}

export function deltaText(change: number | null | undefined, comparisonMode: ComparisonMode): string | undefined {
  if (comparisonMode === "none" || change === undefined) return undefined;
  if (change === null) return "New activity";
  const label = COMPARISON_LABELS[comparisonMode as Exclude<ComparisonMode, "none">];
  return change === 0 ? `No change ${label}` : `${Math.abs(change)}% ${label}`;
}

export function ViewAllLink({ label = "View All", onClick }: { label?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5 shrink-0">
      {label} <ChevronRight className="w-3.5 h-3.5" />
    </button>
  );
}

// Icon sits bottom-right, no colored chip behind it — matches ui/StatCard.tsx's
// convention (the one actually used elsewhere in the app, e.g. Projects), not
// a top icon-chip which isn't the real Nexora pattern.
export function StatTile({
  icon: Icon, label, value, delta, deltaDown, accent, onClick,
}: { icon: LucideIcon; label: string; value: ReactNode; delta?: string; deltaDown?: boolean; accent: string; onClick?: () => void }) {
  const Arrow = deltaDown ? TrendingDown : TrendingUp;
  return (
    <Card className={`relative ${onClick ? "text-left cursor-pointer hover:shadow-md transition-shadow" : ""}`} {...(onClick ? { onClick, role: "button" } : {})}>
      <div className="pr-6">
        <div className="text-[13px] text-gray-500 dark:text-gray-400 mb-1">{label}</div>
        <div className="text-2xl font-bold text-[#1A1A2E] dark:text-[#F1F5F9] font-mono leading-tight">{value}</div>
        {delta && (
          <div className={`text-xs font-semibold mt-1.5 flex items-center gap-1 ${deltaDown ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
            <Arrow className="w-3 h-3" /> {delta}
          </div>
        )}
      </div>
      <Icon className="absolute bottom-3 right-3 w-6 h-6" style={{ color: accent }} strokeWidth={2.5} />
    </Card>
  );
}

export function HighlightsBanner({
  icon: Icon, title, briefs, statusText, statusOk = true,
}: { icon: LucideIcon; title: string; briefs: string[]; statusText: string; statusOk?: boolean }) {
  const StatusIcon = statusOk ? CheckCircle2 : AlertTriangle;
  return (
    // Same white-card treatment as every other flashcard/filter on this page
    // (Card's own bg-white/border/shadow-sm) — no gray/orange fill of its own.
    <Card padded={false} className="mb-6 px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex items-center gap-2 font-extrabold text-[14px] text-[#1A1A2E] dark:text-[#F1F5F9] shrink-0">
        <Icon className="w-4 h-4 text-primary" /> {title}
      </div>
      {briefs.map((b, i) => (
        <div key={i} className="flex items-center gap-6">
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
          <div className="flex items-center gap-1.5 text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9]">
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            {b}
          </div>
        </div>
      ))}
      <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
      <div className={`flex items-center gap-1.5 text-[13px] font-medium ${statusOk ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
        <StatusIcon className="w-4 h-4 shrink-0" />
        {statusText}
      </div>
    </Card>
  );
}

export function DetailListModal({ title, rows, onClose }: { title: string; rows: DPRDetailRow[]; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} footer={<Btn label="Close" outline onClick={onClose} />}>
      {rows.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-8">No records for this metric.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={r.id || i} className="border border-gray-100 dark:border-gray-700/40 rounded-lg px-3 py-2.5">
              <div className="flex justify-between items-center gap-2">
                <span className="font-semibold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{r.label}</span>
                {r.value > 0 && <span className="text-xs font-bold text-primary">₹{r.value.toLocaleString("en-IN")}</span>}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{r.project}{r.vendor ? ` · ${r.vendor}` : ""}</div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
