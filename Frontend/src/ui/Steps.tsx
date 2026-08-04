import type { ReactNode } from "react";

export interface StepItem {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  status: "wait" | "process" | "finish" | "error";
}

const STATUS_COLOR: Record<StepItem["status"], string> = {
  wait: "#D1D5DB", process: "#D97706", finish: "#16A34A", error: "#DC2626",
};

export default function Steps({ items }: { items: StepItem[] }) {
  return (
    <div className="flex items-start">
      {items.map((step, i) => {
        const color = STATUS_COLOR[step.status];
        return (
          <div key={i} className={`flex items-start ${i < items.length - 1 ? "flex-1" : ""}`}>
            <div className="flex flex-col items-center shrink-0" style={{ width: 28 }}>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ border: `2px solid ${color}`, color }}
              >
                {step.icon ?? i + 1}
              </div>
              <div className="text-xs font-semibold mt-1.5 text-center leading-tight" style={{ color: step.status === "wait" ? "#9CA3AF" : "#1A1A2E", maxWidth: 90 }}>
                {step.title}
              </div>
              {step.description && (
                <div className="text-[11px] text-gray-400 mt-0.5 text-center leading-tight" style={{ maxWidth: 100 }}>
                  {step.description}
                </div>
              )}
            </div>
            {i < items.length - 1 && (
              <div className="flex-1 h-0.5 mt-3.5 mx-1 rounded" style={{ background: items[i + 1].status !== "wait" ? "#16A34A" : "#E5E7EB" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
