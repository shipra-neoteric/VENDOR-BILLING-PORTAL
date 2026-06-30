import { Button } from "antd";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?:    string;
  title:    string;
  message?: string;
  action?:  { label: string; onClick: () => void };
  children?: ReactNode;
}

export default function EmptyState({ icon = "📭", title, message, action, children }: EmptyStateProps) {
  return (
    <div
      style={{
        textAlign:    "center",
        padding:      "52px 24px",
        borderRadius: 12,
        border:       "1px dashed #E5E7EB",
        background:   "#FAFAFA",
      }}
    >
      <div style={{ fontSize: 42, marginBottom: 14, lineHeight: 1 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: "#374151", marginBottom: 6 }}>{title}</div>
      {message && <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 18, maxWidth: 360, margin: "0 auto 18px" }}>{message}</div>}
      {action && (
        <Button
          type="primary"
          size="large"
          onClick={action.onClick}
          style={{ background: "#FF7A00", borderColor: "#FF7A00", fontWeight: 600 }}
        >
          {action.label}
        </Button>
      )}
      {children}
    </div>
  );
}
