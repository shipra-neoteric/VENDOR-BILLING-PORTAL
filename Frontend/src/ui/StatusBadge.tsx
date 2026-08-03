import { BILL_STATUS_COLOR, BILL_STATUS_LABEL } from "../shared/constants/billStatus";

interface StatusBadgeProps {
  status: string;
  colorMap?: Record<string, string>;
  labelMap?: Record<string, string>;
}

// Same status -> color/label convention as shared/components/StatusTag.tsx,
// rebuilt without the antd Tag wrapper for pages built on Frontend/src/ui/.
export default function StatusBadge({ status, colorMap = BILL_STATUS_COLOR, labelMap = BILL_STATUS_LABEL }: StatusBadgeProps) {
  const color = colorMap[status] ?? "#9CA3AF";
  const label = labelMap[status] ?? status.toUpperCase();
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-bold bg-white dark:bg-transparent"
      style={{ color, border: `1px solid ${color}` }}
    >
      {label}
    </span>
  );
}
