import type { ReactNode } from "react";

interface StatCardProps {
  label:    string;
  value:    ReactNode;
  sub?:     ReactNode;
  icon?:    ReactNode;
  color?:   string;
  accent?:  string;
}

export default function StatCard({ label, value, sub, icon, color = "#374151", accent }: StatCardProps) {
  return (
    <div
      style={{
        background:    "#fff",
        border:        "1px solid #E5E7EB",
        borderLeft:    accent ? `4px solid ${accent}` : "1px solid #E5E7EB",
        borderRadius:  12,
        padding:       "18px 20px",
        boxShadow:     "0 1px 3px rgba(0,0,0,0.05)",
        transition:    "box-shadow 0.2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)")}
    >
      {icon && <div style={{ fontSize: 22, marginBottom: 8, lineHeight: 1 }}>{icon}</div>}
      <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "monospace", lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
