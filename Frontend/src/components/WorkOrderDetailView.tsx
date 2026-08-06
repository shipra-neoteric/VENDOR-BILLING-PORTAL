import { Fragment } from "react";
import { Link2, Lock } from "lucide-react";
import dayjs from "dayjs";
import WorkOrderApprovalWorkflow from "./WorkOrderApprovalWorkflow";
import { getWorkOrderDocuments } from "./DocumentsUpload";
import type { WorkOrder, WorkOrderStatus } from "../types/VendorBilling";
import { Descriptions, DescItem } from "../ui/Descriptions";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../ui/Table";

const STATUS_CFG: Record<WorkOrderStatus, { color: "gray" | "blue" | "orange" | "green" | "red"; label: string }> = {
  draft:         { color: "gray",   label: "Draft" },
  issued:        { color: "blue",   label: "Issued" },
  "in-progress": { color: "orange", label: "In Progress" },
  completed:     { color: "green",  label: "Completed" },
  cancelled:     { color: "red",    label: "Cancelled" },
};

const fmt = (n: number) => "₹" + (n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Per-unit rates (e.g. ₹130.5/sqft) are fractional far more often than totals
// are — rounding them for display (as the money-total fmt() above does)
// silently turns 130.5 into 131. This keeps up to 2 decimal places instead.
const fmtRate = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The complete read side of a Work Order — Live Workflow, summary, billing
// tape, scope of work, payment milestones, warranty terms — shared verbatim
// between WorkItems' own quick-View drawer and any other place (e.g. Accounts
// Payment's WO quick-view) that needs the exact same detail, not a trimmed-down
// re-implementation that can drift out of sync with it.
export default function WorkOrderDetailView({
  workOrder, bills = [], onUpdated, readOnly = false,
}: {
  workOrder: WorkOrder;
  bills?: { status: string; amount: number }[];
  onUpdated?: (updated: WorkOrder) => void;
  readOnly?: boolean;
}) {
  const wo = workOrder;
  const isProfessionalServices = wo.contractType === "professional-services";
  const contractVal = wo.contractValue ?? 0;
  const certifiedAmt = bills.filter(b => b.status === "approved" || b.status === "sent-to-tms" || b.status === "paid").reduce((s, b) => s + b.amount, 0);
  const pendingAmt   = bills.filter(b => b.status === "draft" || b.status === "verify-done" || b.status === "l1-approved").reduce((s, b) => s + b.amount, 0);
  const remaining    = Math.max(0, contractVal - certifiedAmt - pendingAmt);
  const certPct = contractVal > 0 ? (certifiedAmt / contractVal) * 100 : 0;
  const pendPct = contractVal > 0 ? (pendingAmt / contractVal) * 100 : 0;

  return (
    <>
      {/* ── Live Workflow — the same 4-level approval chain as the full page ── */}
      <div className="mb-5">
        <WorkOrderApprovalWorkflow
          workOrder={{ ...wo, _id: wo.id }}
          onUpdated={(updated) => onUpdated?.(updated as unknown as WorkOrder)}
          readOnly={readOnly}
        />
      </div>

      <Card className="mb-5">
        <Descriptions>
          <DescItem label="Work Order No">
            <span className="font-mono font-bold text-primary">{wo.workOrderNo}</span>
          </DescItem>
          <DescItem label="Issue Date">{dayjs(wo.issueDate).format("DD MMM YYYY")}</DescItem>
          <DescItem label="Project">{wo.projectName}</DescItem>
          {wo.projectLocation && <DescItem label="Location">{wo.projectLocation}</DescItem>}
          <DescItem label="Issuing Company">{wo.companyName}</DescItem>
          {wo.category && <DescItem label="Category">{wo.category}{wo.subCategory ? ` / ${wo.subCategory}` : ""}</DescItem>}
          <DescItem label="Status">
            <div className="flex items-center gap-1.5">
              <Badge color={STATUS_CFG[wo.status]?.color}>{STATUS_CFG[wo.status]?.label}</Badge>
              {wo.isLocked && (
                <Badge color="amber"><Lock className="w-3 h-3 mr-1 inline" />Locked</Badge>
              )}
            </div>
          </DescItem>
          {wo.isLocked && (
            <DescItem label="Locked" span={2}>
              <span className="text-gray-400 text-xs">
                Rates, scope items, milestones, and contract value cannot be edited until unlocked.
                {wo.lockedAt && ` (${dayjs(wo.lockedAt).format("DD MMM YYYY, hh:mm a")})`}
              </span>
            </DescItem>
          )}
          {wo.status === "cancelled" && (
            <DescItem label="Cancellation Remark" span={2}>
              <span className="text-red-600">{wo.cancelReason || "—"}</span>
              {wo.cancelledAt && (
                <span className="text-gray-400 ml-2 text-xs">
                  ({dayjs(wo.cancelledAt).format("DD MMM YYYY, hh:mm a")})
                </span>
              )}
            </DescItem>
          )}
          <DescItem label={isProfessionalServices ? "Consultant Code" : "Vendor Code"}>
            <span className="font-mono font-semibold text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400 px-1.5 py-0.5 rounded">
              {wo.vendorCode}
            </span>
          </DescItem>
          <DescItem label={isProfessionalServices ? "Firm" : "Contractor Company"}>{wo.vendorName}</DescItem>
          <DescItem label={isProfessionalServices ? "Principal" : "Owner"}>{wo.ownerName}</DescItem>
          <DescItem label="Mobile">{wo.mobile}</DescItem>
          <DescItem label="Assigned DRI">
            {(wo.assignedDRI ?? []).length > 0
              ? (wo.assignedDRI ?? []).map(d => (typeof d === "string" ? d : d.name)).join(", ")
              : <span className="text-gray-400">Not assigned</span>}
          </DescItem>
          <DescItem label="Contract Value" span={2}>
            <span className="font-mono font-bold text-primary text-[15px]">{fmt(wo.contractValue)}</span>
          </DescItem>
          {wo.internalRemark && <DescItem label="Remarks" span={2}>{wo.internalRemark}</DescItem>}
          {getWorkOrderDocuments(wo).length > 0 && (
            <DescItem label="Documents" span={2}>
              <div className="flex flex-col gap-1">
                {getWorkOrderDocuments(wo).map((d, i) => (
                  <a key={i} href={d.url} target="_blank" rel="noreferrer" download={d.name} className="flex items-center gap-1.5 text-primary hover:underline">
                    <Link2 className="w-3.5 h-3.5" /> {d.name}
                  </a>
                ))}
              </div>
            </DescItem>
          )}
        </Descriptions>
      </Card>

      {/* ── Billing Summary ─────────────────────────────── */}
      <Card className="mb-5">
        <div className="font-semibold text-[13px] text-gray-700 dark:text-gray-300 mb-3">Billing Summary</div>
        <div className="flex h-3 rounded-md overflow-hidden bg-gray-200 dark:bg-gray-700 mb-3.5">
          {certPct > 0 && <div style={{ width: `${certPct}%`, background: "#16a34a" }} title={`Certified: ${fmt(certifiedAmt)}`} />}
          {pendPct > 0 && <div style={{ width: `${pendPct}%`, background: "#f59e0b" }} title={`Pending: ${fmt(pendingAmt)}`} />}
        </div>
        <div className="flex border-t border-gray-200 dark:border-gray-700/40 pt-3">
          {[
            { label: "Contract Value", value: fmt(contractVal), color: "text-gray-700 dark:text-gray-300", dot: "#6B7280" },
            { label: "Certified ✓", value: fmt(certifiedAmt), color: "text-emerald-600 dark:text-emerald-400", dot: "#16a34a" },
            { label: "Pending ⏳", value: fmt(pendingAmt), color: "text-amber-600 dark:text-amber-400", dot: "#f59e0b" },
            { label: "Remaining", value: fmt(remaining), color: "text-gray-500 dark:text-gray-400", dot: "#D1D5DB" },
          ].map((s, i) => (
            <div key={i} className={`flex-1 ${i === 0 ? "text-left pl-0" : "text-center pl-3"} ${i < 3 ? "border-r border-gray-200 dark:border-gray-700/40" : ""} pr-3`}>
              <div className={`text-[11px] text-gray-400 mb-0.5 flex items-center gap-1.5 ${i === 0 ? "justify-start" : "justify-center"}`}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: s.dot }} />
                {s.label}
              </div>
              <div className={`font-bold font-mono text-[13px] ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Scope of Work / Deliverables ────────────────────────────── */}
      <Card padded={false} className="overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/40 font-semibold text-[13px] text-gray-700 dark:text-gray-300">
          {isProfessionalServices ? "Deliverables" : "Scope of Work"}
        </div>
        {wo.scopeItems.length === 0 ? (
          <div className="py-6 text-center text-gray-400 text-sm">
            {isProfessionalServices ? "No deliverables defined" : "No scope items defined"}
          </div>
        ) : (
          <Table>
            <Thead>
              <Tr>
                {(isProfessionalServices
                  ? ["Deliverable", "Stage", "Due Date", "Status", "Amount"]
                  : ["Description", "Unit", "Planned Qty", "Rate", "Amount"]
                ).map(h => <Th key={h}>{h}</Th>)}
              </Tr>
            </Thead>
            <Tbody>
              {wo.scopeItems.map((si) => {
                const hasSubItems = (si.subItems?.length ?? 0) > 0;
                return (
                <Fragment key={si.id}>
                  <Tr>
                    <Td>
                      <span className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{si.description}</span>
                      {hasSubItems && <span className="ml-1.5 text-[11px] text-gray-400">({si.subItems.length} particulars)</span>}
                      {si.remarks && <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">📌 {si.remarks}</div>}
                    </Td>
                    {isProfessionalServices ? (
                      <>
                        <Td><TdText>{si.stage || "—"}</TdText></Td>
                        <Td><TdText>{si.plannedEnd ? dayjs(si.plannedEnd).format("DD MMM YYYY") : "—"}</TdText></Td>
                        <Td>
                          <Badge color={si.status === "completed" ? "green" : si.status === "running" ? "orange" : "gray"} small>
                            {si.status === "completed" ? "Completed" : si.status === "running" ? "In Progress" : "Pending"}
                          </Badge>
                        </Td>
                      </>
                    ) : (
                      <>
                        <Td><TdText>{si.unit}</TdText></Td>
                        <Td><span className="font-mono"><TdText>{si.plannedQty.toLocaleString("en-IN")}</TdText></span></Td>
                        <Td><span className="font-mono"><TdText>{fmtRate(si.rate || 0)}</TdText></span></Td>
                      </>
                    )}
                    <Td><span className="font-mono font-bold text-primary">{fmt(si.amount || 0)}</span></Td>
                  </Tr>
                  {hasSubItems && si.subItems.map(sub => (
                    <Tr key={sub.id} className="bg-gray-50 dark:bg-gray-800/30">
                      <Td>
                        <span className="pl-4 text-[13px] text-gray-600 dark:text-gray-400">↳ {sub.description}</span>
                        {(sub.plannedStart || sub.plannedEnd) && (
                          <div className="pl-4 text-xs text-gray-400 mt-0.5">
                            {sub.plannedStart ? dayjs(sub.plannedStart).format("DD MMM YYYY") : "—"} → {sub.plannedEnd ? dayjs(sub.plannedEnd).format("DD MMM YYYY") : "—"}
                          </div>
                        )}
                        {sub.remarks && <div className="pl-4 text-xs text-amber-600 dark:text-amber-400 mt-0.5">📌 {sub.remarks}</div>}
                      </Td>
                      <Td><TdText>{sub.unit}</TdText></Td>
                      <Td><span className="font-mono"><TdText>{sub.plannedQty.toLocaleString("en-IN")}</TdText></span></Td>
                      <Td><span className="font-mono"><TdText>{fmtRate(sub.rate || 0)}</TdText></span></Td>
                      <Td><span className="font-mono font-semibold text-gray-600 dark:text-gray-400">{fmt(sub.amount || 0)}</span></Td>
                    </Tr>
                  ))}
                </Fragment>
              );})}
            </Tbody>
          </Table>
        )}
      </Card>

      {/* ── Payment Milestones ──────────────────────── */}
      {(wo.paymentMilestones?.length ?? 0) > 0 && (
        <Card padded={false} className="overflow-hidden mt-4">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/40 font-semibold text-[13px] text-gray-700 dark:text-gray-300">
            Payment Milestones
          </div>
          <Table>
            <Thead>
              <Tr>
                {["Type", "Date", "Mode", "Amount", "GST", "Payable"].map(h => <Th key={h}>{h}</Th>)}
              </Tr>
            </Thead>
            <Tbody>
              {wo.paymentMilestones!.map((m) => (
                <Tr key={m.id}>
                  <Td><TdText>{m.type}</TdText></Td>
                  <Td><TdText>{m.date ? dayjs(m.date).format("DD MMM YYYY") : "—"}</TdText></Td>
                  <Td><TdText>{m.mode}</TdText></Td>
                  <Td><span className="font-mono"><TdText>{fmt(m.amount || 0)}</TdText></span></Td>
                  <Td><TdText>{m.gstPercent}%</TdText></Td>
                  <Td><span className="font-mono font-bold text-primary">{fmt(m.payable || 0)}</span></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      {/* ── Security Deposits — reference only, doesn't drive contractValue ── */}
      {(wo.securityDeposits?.length ?? 0) > 0 && (
        <Card padded={false} className="overflow-hidden mt-4">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/40 font-semibold text-[13px] text-gray-700 dark:text-gray-300">
            Security Deposit
          </div>
          <div className="p-4 flex flex-col gap-3">
            {wo.securityDeposits!.map((d) => {
              const selected = wo.scopeItems.filter(si => d.scopeItemIds.includes(si.id));
              const selectedValue = selected.reduce((s, si) => s + (si.amount || 0), 0);
              return (
                <div key={d.id} className="border border-gray-200 dark:border-gray-700/40 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">
                    {selected.map(si => si.description).join(", ") || "—"}
                  </div>
                  <div className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                    Held as {d.mode === "percent" ? `${d.rate}%` : `${fmtRate(d.rate || 0)}/unit`}
                  </div>
                  {d.notes && <div className="text-amber-600 dark:text-amber-400 text-xs mt-1">📌 {d.notes}</div>}
                  <div className="mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-gray-700/40 text-xs text-gray-500 dark:text-gray-400">
                    Selected items' value <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">{fmt(selectedValue)}</span>
                    {" + "}Deposit <span className="font-mono font-semibold text-primary">{fmt(d.amount || 0)}</span>
                    {" = "}
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(selectedValue + (d.amount || 0))}</span>
                    {" true full value"}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Warranty Terms ──────────────────────────── */}
      {(wo.warrantyTerms?.length ?? 0) > 0 && (
        <Card className="mt-4">
          <div className="font-semibold text-[13px] text-gray-700 dark:text-gray-300 mb-2">Special Terms and Conditions</div>
          {wo.warrantyTerms!.map((t, i) => (
            <div key={i} className="text-sm text-gray-700 dark:text-gray-300 mb-1 flex gap-1.5">
              <span className="text-gray-400">{i + 1}.</span> {t}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
