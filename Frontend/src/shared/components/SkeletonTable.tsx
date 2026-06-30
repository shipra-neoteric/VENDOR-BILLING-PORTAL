import { Skeleton } from "antd";

interface SkeletonTableProps {
  rows?:    number;
  columns?: number;
}

export default function SkeletonTable({ rows = 6, columns = 5 }: SkeletonTableProps) {
  return (
    <div style={{ padding: "16px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 16, padding: "10px 16px", borderBottom: "1px solid #F3F4F6", marginBottom: 4 }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton.Input key={i} active size="small" style={{ flex: 1, height: 16, borderRadius: 4 }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "flex", gap: 16, padding: "14px 16px", borderBottom: "1px solid #F9FAFB" }}>
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton.Input
              key={c}
              active
              size="small"
              style={{ flex: 1, height: 14, borderRadius: 4, opacity: 1 - r * 0.1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
