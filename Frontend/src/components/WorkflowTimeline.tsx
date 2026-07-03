import { useState } from "react";
import dayjs from "dayjs";

export interface TimelineStep {
  key: string;
  name: string;
  icon: string;
  status: "completed" | "current" | "pending" | "rejected" | "skipped";
  date?: string;
  completedBy?: string;
  description?: string;
}

interface Props {
  steps: TimelineStep[];
  onStepClick?: (step: TimelineStep) => void;
}

const ST: Record<string, { bg: string; border: string; iconColor: string; nameColor: string }> = {
  completed: { bg: "#16a34a", border: "#16a34a",  iconColor: "#fff",            nameColor: "#16a34a" },
  current:   { bg: "#2563eb", border: "#2563eb",  iconColor: "#fff",            nameColor: "#2563eb" },
  pending:   { bg: "var(--nx-white)", border: "#d1d5db", iconColor: "rgba(156,163,175,0.6)", nameColor: "#9ca3af" },
  rejected:  { bg: "#ef4444", border: "#ef4444",  iconColor: "#fff",            nameColor: "#ef4444" },
  skipped:   { bg: "var(--nx-fill)", border: "#d1d5db", iconColor: "#9ca3af",   nameColor: "#9ca3af" },
};

export function WorkflowTimeline({ steps, onStepClick }: Props) {
  const [hoveredKey,  setHoveredKey]  = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (!steps.length) return null;

  const handleClick = (step: TimelineStep) => {
    if (step.status === "completed" || step.status === "rejected") {
      setExpandedKey(prev => prev === step.key ? null : step.key);
    }
    onStepClick?.(step);
  };

  const expandedStep = steps.find(s => s.key === expandedKey && (s.status === "completed" || s.status === "rejected"));

  return (
    <>
      <style>{`
        @keyframes wf-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(37,99,235,0.35); }
          50%      { box-shadow: 0 0 0 10px rgba(37,99,235,0); }
        }
        @keyframes wf-flow {
          0%   { left:0;              opacity:0; }
          15%  { left:0;              opacity:1; }
          85%  { left:calc(100% - 6px); opacity:1; }
          100% { left:calc(100% - 6px); opacity:0; }
        }
        .wf-pulse { animation: wf-pulse 2s ease-in-out infinite; }
        .wf-ring  { transition: transform 0.2s ease; }
        .wf-node.clickable { cursor: pointer; }
        .wf-node.clickable:hover .wf-ring { transform: scale(1.1); }
      `}</style>

      <div style={{ overflowX: "auto", paddingBottom: 4, width: "100%" }}>
        {/* Steps row */}
        <div style={{ display: "flex", alignItems: "flex-start", padding: "8px 6px 4px", minWidth: "max-content" }}>
          {steps.map((step, i) => {
            const st      = ST[step.status] ?? ST.pending;
            const isClick = step.status === "completed" || step.status === "rejected";
            const isHover = hoveredKey === step.key;
            const next    = steps[i + 1];
            const lineGreen = step.status === "completed";
            const flowDot   = step.status === "completed" && next?.status === "current";

            return (
              <div key={step.key} style={{ display: "flex", alignItems: "flex-start" }}>
                {/* Step column */}
                <div
                  className={`wf-node${isClick ? " clickable" : ""}`}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 84, position: "relative" }}
                  onClick={() => handleClick(step)}
                  onMouseEnter={() => setHoveredKey(step.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                >
                  {/* Hover tooltip */}
                  {isHover && step.date && (
                    <div style={{
                      position: "absolute", bottom: "calc(100% + 10px)", left: "50%",
                      transform: "translateX(-50%)",
                      background: "#111827", color: "#f9fafb", borderRadius: 8,
                      padding: "10px 14px", fontSize: 11.5, whiteSpace: "nowrap",
                      zIndex: 300, pointerEvents: "none",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 12 }}>{step.name.replace(/\n/g, " ")}</div>
                      <div style={{ color: "#9ca3af" }}>{dayjs(step.date).format("DD MMM YYYY, HH:mm")}</div>
                      {step.completedBy && (
                        <div style={{ color: "#6b7280", marginTop: 3 }}>by {step.completedBy}</div>
                      )}
                      {isClick && (
                        <div style={{ color: "#60a5fa", marginTop: 4, fontSize: 10 }}>Click to see details</div>
                      )}
                      {/* Arrow */}
                      <div style={{
                        position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
                        borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
                        borderTop: "6px solid #111827",
                      }} />
                    </div>
                  )}

                  {/* Step number badge */}
                  <div style={{
                    position: "absolute", top: -7, right: 9,
                    width: 17, height: 17, borderRadius: "50%",
                    background: step.status === "pending" || step.status === "skipped" ? "#e5e7eb" : st.border,
                    color: step.status === "pending" || step.status === "skipped" ? "#9ca3af" : "#fff",
                    fontSize: 9, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "1.5px solid var(--nx-white)",
                    zIndex: 1,
                  }}>
                    {i + 1}
                  </div>

                  {/* Circle */}
                  <div
                    className={`wf-ring${step.status === "current" ? " wf-pulse" : ""}`}
                    style={{
                      width: 46, height: 46, borderRadius: "50%",
                      background: st.bg,
                      border: `2.5px solid ${st.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: step.status === "completed" || step.status === "rejected" ? 18 : 20,
                      color: st.iconColor,
                      fontWeight: 800,
                      flexShrink: 0,
                      opacity: step.status === "skipped" ? 0.45 : 1,
                    }}
                  >
                    {step.status === "completed" ? "✓"
                      : step.status === "rejected" ? "✕"
                      : step.icon}
                  </div>

                  {/* Step name */}
                  <div style={{
                    fontSize: 10.5, fontWeight: step.status === "current" ? 700 : 600,
                    color: st.nameColor, textAlign: "center", marginTop: 9,
                    lineHeight: 1.4, whiteSpace: "pre-line", maxWidth: 80,
                  }}>
                    {step.name}
                  </div>

                  {/* Date */}
                  {step.date && (
                    <div style={{ fontSize: 9.5, color: "var(--nx-text-muted)", marginTop: 4, textAlign: "center", lineHeight: 1.3 }}>
                      {dayjs(step.date).format("DD MMM")}<br />{dayjs(step.date).format("HH:mm")}
                    </div>
                  )}

                  {/* Completed by */}
                  {step.completedBy && (
                    <div style={{
                      fontSize: 9, color: "var(--nx-text-muted)", marginTop: 2,
                      textAlign: "center", maxWidth: 80,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {step.completedBy}
                    </div>
                  )}
                </div>

                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div style={{
                    width: 30, height: 2, marginTop: 23, flexShrink: 0,
                    background: lineGreen ? "#16a34a" : "var(--nx-border)",
                    borderRadius: 2, position: "relative",
                    transition: "background 0.5s ease",
                  }}>
                    {flowDot && (
                      <div style={{
                        position: "absolute", top: "50%", transform: "translateY(-50%)",
                        width: 6, height: 6, borderRadius: "50%", background: "#2563eb",
                        animation: "wf-flow 1.6s ease-in-out infinite",
                      }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Expanded step detail panel */}
        {expandedStep && (
          <div style={{
            margin: "14px 6px 4px",
            padding: "14px 18px",
            background: expandedStep.status === "rejected" ? "#fef2f2" : "var(--nx-fill-2)",
            border: `1px solid ${expandedStep.status === "rejected" ? "#fecaca" : "var(--nx-border)"}`,
            borderRadius: 10,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 15 }}>{expandedStep.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--nx-text)" }}>
                    {expandedStep.name.replace(/\n/g, " ")}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 9px", borderRadius: 20,
                    background: expandedStep.status === "completed" ? "#dcfce7" : "#fee2e2",
                    color:      expandedStep.status === "completed" ? "#16a34a" : "#ef4444",
                  }}>
                    {expandedStep.status === "completed" ? "Completed" : "Rejected"}
                  </span>
                </div>
                {expandedStep.date && (
                  <div style={{ fontSize: 12, color: "var(--nx-text-2)", marginBottom: 3, display: "flex", gap: 6 }}>
                    <span>📅</span>{dayjs(expandedStep.date).format("DD MMM YYYY, HH:mm")}
                  </div>
                )}
                {expandedStep.completedBy && (
                  <div style={{ fontSize: 12, color: "var(--nx-text-2)", display: "flex", gap: 6 }}>
                    <span>👤</span>{expandedStep.completedBy}
                  </div>
                )}
                {expandedStep.description && (
                  <div style={{ fontSize: 12, color: "var(--nx-text-muted)", marginTop: 6 }}>{expandedStep.description}</div>
                )}
              </div>
              <button
                onClick={() => setExpandedKey(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--nx-text-muted)", padding: 0, lineHeight: 1, flexShrink: 0 }}
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
