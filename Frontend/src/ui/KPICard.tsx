import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  accent?: string;
}

export default function KPICard({ label, value, sub, icon: Icon, accent = "#FF7A00" }: KPICardProps) {
  return (
    <div
      className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      {Icon && (
        <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2" style={{ background: `${accent}1A` }}>
          <Icon className="w-4.5 h-4.5" style={{ color: accent }} />
        </div>
      )}
      <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
        {label}
      </div>
      <div className="text-xl font-bold font-mono text-[#1A1A2E] dark:text-[#F1F5F9] leading-tight">
        {value}
      </div>
      {sub && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
