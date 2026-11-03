import { useEffect, useState } from "react";
import { History, ChevronDown, ChevronRight } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../services/apiClient";
import Card from "../ui/Card";
import Badge from "../ui/Badge";

// Who did what to this work order and when — edits (with what changed), approvals, locks, scope
// additions, progress — straight from the audit trail, newest first.

interface HistoryEntry {
  _id: string;
  action: string;
  userName?: string;
  description?: string;
  createdAt: string;
  changes?: Record<string, unknown> | null;
}

const ACTION_COLOR: Record<string, "blue" | "green" | "red" | "amber" | "gray"> = {
  CREATE: "blue", UPDATE: "amber", APPROVE: "green", REJECT: "red", DELETE: "red",
};

const LABEL: Record<string, string> = {
  projectName: "Project", companyName: "Company", vendorCode: "Vendor", category: "Category", subCategory: "Sub-category",
  department: "Department", customDepartment: "Custom department", issueDate: "Issue date", totalTenure: "Tenure",
  description: "Description", scopeOfWork: "Scope of work", internalRemark: "Internal remark", contractValue: "Contract value",
  discount: "Discount", gstPercent: "GST %", retentionPercent: "Retention %", status: "Status", documents: "Documents",
  paymentMilestones: "Payment milestones", warrantyTerms: "Warranty terms", itemsAdded: "Items added", itemsRemoved: "Items removed",
  scopeItems: "Items changed", rate: "Rate", plannedQty: "Planned qty", unit: "Unit", amount: "Amount", plannedStart: "Start", plannedEnd: "End",
  approvalStatus: "Approval", isLocked: "Locked",
};
const MONEY = new Set(["contractValue", "discount", "amount", "rate"]);

function fmtValue(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "number") return MONEY.has(key) ? "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) return dayjs(v).format("DD MMM YYYY");
  return String(v);
}

function isChange(v: unknown): v is { from?: unknown; to?: unknown } {
  return !!v && typeof v === "object" && !Array.isArray(v) && ("from" in (v as object) || "to" in (v as object));
}

// One line per changed field: "Category: Civil → Electricity"; per-item edits are nested under their item.
function ChangeLines({ changes }: { changes: Record<string, unknown> }) {
  return (
    <div className="mt-1.5 flex flex-col gap-0.5 text-[12px] text-gray-600 dark:text-gray-300">
      {Object.entries(changes).map(([key, val]) => {
        if (key === "scopeItems" && val && typeof val === "object") {
          return Object.entries(val as Record<string, Record<string, unknown>>).map(([item, fields]) => (
            <div key={`${key}-${item}`}>
              <span className="font-semibold">{item}:</span>{" "}
              {Object.entries(fields).map(([f, c], i) => (
                <span key={f}>{i > 0 ? " · " : ""}{LABEL[f] || f} {isChange(c) ? `${fmtValue(f, c.from)} → ${fmtValue(f, c.to)}` : ""}</span>
              ))}
            </div>
          ));
        }
        if (isChange(val)) {
          return (
            <div key={key}>
              <span className="font-semibold">{LABEL[key] || key}:</span> {fmtValue(key, val.from)} <span className="text-gray-400">→</span> {fmtValue(key, val.to)}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export default function WorkOrderHistory({ workOrderId }: { workOrderId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || rows !== null) return;
    apiClient.get<{ history: HistoryEntry[] }>(`/work-orders/${workOrderId}/history`, { suppressErrorToast: true })
      .then((r) => setRows(r.data.history ?? []))
      .catch(() => { setError(true); setRows([]); });
  }, [open, rows, workOrderId]);

  // A different work order opened in the same drawer starts fresh.
  useEffect(() => { setRows(null); setError(false); }, [workOrderId]);

  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <Card className="mb-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 text-left">
        <History className="w-4 h-4 text-primary" />
        <span className="font-bold text-[14px] text-[#1A1A2E] dark:text-[#F1F5F9]">Edit history</span>
        <Chevron className="w-4 h-4 text-gray-400 ml-auto" />
      </button>

      {open && (
        <div className="mt-3">
          {rows === null ? (
            <div className="text-sm text-gray-400 py-3">Loading…</div>
          ) : error ? (
            <div className="text-sm text-gray-400 py-3">The history could not be loaded.</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-gray-400 py-3">Nothing recorded yet.</div>
          ) : (
            <div className="flex flex-col max-h-[420px] overflow-y-auto pr-1">
              {rows.map((h) => (
                <div key={h._id} className="py-2.5 border-b border-gray-100 dark:border-gray-700/40 text-[13px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge color={ACTION_COLOR[h.action] ?? "gray"} small>{h.action}</Badge>
                    <span className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{h.userName || "System"}</span>
                    <span className="text-xs text-gray-400 ml-auto">{dayjs(h.createdAt).format("DD MMM YYYY, hh:mm A")}</span>
                  </div>
                  {h.description && <div className="mt-1 text-gray-600 dark:text-gray-300">{h.description}</div>}
                  {h.changes && <ChangeLines changes={h.changes} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
