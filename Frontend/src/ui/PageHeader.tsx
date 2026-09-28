import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  // Optional back-arrow button before the icon/title — for a page reached
  // via a specific shortcut elsewhere (e.g. Billing → Advance Payments)
  // rather than its own sidebar entry, so there's a way back to where the
  // user came from. Omitted entirely (no arrow) when a page doesn't need it.
  onBack?: () => void;
}

export default function PageHeader({ title, subtitle, icon: Icon, actions, onBack }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 mb-6 w-full">
      <div className="flex items-center gap-3 min-w-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            title="Back"
            className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center shrink-0 text-gray-500 dark:text-gray-400"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[#1A1A2E] dark:text-[#F1F5F9] truncate">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
