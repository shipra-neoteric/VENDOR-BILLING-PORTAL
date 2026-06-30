import { Tag } from "antd";
import { BILL_STATUS_COLOR, BILL_STATUS_LABEL } from "../constants/billStatus";

interface StatusTagProps {
  status: string;
  colorMap?: Record<string, string>;
  labelMap?: Record<string, string>;
}

export default function StatusTag({ status, colorMap = BILL_STATUS_COLOR, labelMap = BILL_STATUS_LABEL }: StatusTagProps) {
  const color = colorMap[status] ?? "#9CA3AF";
  const label = labelMap[status] ?? status.toUpperCase();
  return (
    <Tag
      style={{
        color,
        background:  "#F9FAFB",
        border:      `1px solid ${color}`,
        fontWeight:  600,
        fontSize:    11,
        borderRadius: 6,
      }}
    >
      {label}
    </Tag>
  );
}
