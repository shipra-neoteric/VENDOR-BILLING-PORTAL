import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import { Link2, Lock, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import apiClient from "../services/apiClient";
import WorkOrderApprovalWorkflow from "./WorkOrderApprovalWorkflow";
import { getWorkOrderDocuments } from "./DocumentsUpload";
import PaymentMilestonesBuilder, { calcPayable } from "./PaymentMilestonesBuilder";
import type { MilestoneDraft } from "./PaymentMilestonesBuilder";
import type { WorkOrder, WorkOrderStatus } from "../types/VendorBilling";
import Badge from "../ui/Badge";
import Card from "../ui/Card";
import Btn from "../ui/Btn";
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td, TdText } from "../ui/Table";

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

// ── Tabular info blocks — label and value sit side by side in the SAME row
// (not stacked), several label|value pairs per row, separated only by
// vertical rules — no horizontal lines between rows.
function PairedGrid({ pairsPerRow, items }: { pairsPerRow: number; items: { label: string; value?: ReactNode }[] }) {
  const rows: { label: string; value?: ReactNode }[][] = [];
  for (let i = 0; i < items.length; i += pairsPerRow) rows.push(items.slice(i, i + pairsPerRow));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((it, ci) => (
                <Fragment key={ci}>
                  <td className={`px-3 py-3.5 text-[12.5px] text-gray-400 dark:text-gray-500 whitespace-nowrap align-top bg-gray-50 dark:bg-gray-800/40 ${ci > 0 ? "border-l border-gray-200 dark:border-gray-700/40" : ""}`}>
                    {it.label}
                  </td>
                  <td className="px-3 py-3.5 text-[14.5px] font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] align-top">
                    {it.value ?? <span className="text-gray-400 font-normal">—</span>}
                  </td>
                </Fragment>
              ))}
              {Array.from({ length: pairsPerRow - row.length }).map((_, k) => (
                <Fragment key={`pad-${k}`}>
                  <td className="border-l border-gray-200 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-800/40" />
                  <td />
                </Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tabular key/value block — one label|value pair per row, used for
// Payment Terms / Bank Details.
function KeyValueTable({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700/40">
      <table className="w-full border-collapse text-sm">
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/40">
          {rows.map(([label, value], i) => (
            <tr key={i}>
              <td className="px-4 py-3 text-[13.5px] text-gray-500 dark:text-gray-400 border-r border-gray-100 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-800/40 w-1/2">{label}</td>
              <td className="px-4 py-3 text-[14.5px] font-semibold text-right text-[#1A1A2E] dark:text-[#F1F5F9]">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function toMilestoneDraft(m: NonNullable<WorkOrder["paymentMilestones"]>[number]): MilestoneDraft {
  return {
    id: m.id,
    stage: m.stage,
    date: m.date,
    type: m.type,
    mode: m.mode,
    amount: m.amount ?? null,
    amountMode: m.amountMode ?? "fixed",
    amountPercent: m.amountPercent ?? null,
    gstPercent: m.gstPercent,
  };
}

// The complete read side of a Work Order — identity/commercial summary, work
// items, payment terms & bank details, billing tape, milestones, warranty
// terms, and the Live Workflow block at the bottom — shared verbatim between
// WorkItems' own quick-View drawer and any other place (e.g. Accounts
// Payment's WO quick-view) that needs the exact same detail, not a
// trimmed-down re-implementation that can drift out of sync with it.
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

  const itemsSubtotal = wo.scopeItems.reduce((s, si) => s + (si.amount || 0), 0);
  const gstPercent = wo.gstPercent ?? 18;
  const gstAmount = itemsSubtotal * (gstPercent / 100);
  const grandTotal = itemsSubtotal + gstAmount - (wo.discount || 0);

  const securityDepositTotal = (wo.securityDeposits ?? []).reduce((s, d) => s + (d.amount || 0), 0);
  const advanceMilestone = (wo.paymentMilestones ?? []).find(m => (m.type || "").toLowerCase().includes("advance"));
  const bank = wo.contractorDetails;
  const documents = getWorkOrderDocuments(wo);

  // ── Inline Payment Milestones editing — no need to leave this view or
  // open the full Edit Work Order drawer just to correct a milestone.
  const [editingMilestones, setEditingMilestones] = useState(false);
  const [milestoneDraft, setMilestoneDraft] = useState<MilestoneDraft[]>([]);
  const [discountDraft, setDiscountDraft] = useState<number | null>(wo.discount ?? null);
  const [savingMilestones, setSavingMilestones] = useState(false);

  function startEditingMilestones() {
    setMilestoneDraft((wo.paymentMilestones ?? []).map(toMilestoneDraft));
    setDiscountDraft(wo.discount ?? null);
    setEditingMilestones(true);
  }

  async function handleSaveMilestones() {
    setSavingMilestones(true);
    try {
      const payload = milestoneDraft.map(m => ({ ...m, payable: calcPayable(m) }));
      // The backend's milestones-vs-contract-value check reads contractValue/
      // gstPercent off this same request body (not off the WO already in the
      // DB) — omitting them here defaults both to 0 and rejects every save.
      const res = await apiClient.put(`/work-orders/${wo.id}`, {
        paymentMilestones: payload,
        discount: discountDraft,
        contractValue: wo.contractValue,
        gstPercent: wo.gstPercent,
      });
      onUpdated?.(res.data.workOrder as WorkOrder);
      toast.success("Payment milestones updated");
      setEditingMilestones(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to update milestones");
    } finally {
      setSavingMilestones(false);
    }
  }

  return (
    <>
      {/* ── Identity — Work Order / Project details vs Contractor details ── */}
      <Card padded={false} className="mb-5 overflow-hidden">
        <PairedGrid
          pairsPerRow={2}
          items={[
            { label: "Work Order No.", value: <span className="font-mono font-bold text-primary">{wo.workOrderNo}</span> },
            { label: isProfessionalServices ? "Firm" : "Contractor Name", value: wo.vendorName },
            { label: "Project Name", value: wo.projectName },
            { label: "Contractor Address", value: bank?.address },
            { label: "Site Location", value: wo.projectLocation },
            { label: "Contractor Contact", value: wo.mobile },
            { label: "Issuing Company", value: wo.companyName },
            { label: "Contractor Email", value: bank?.email },
            { label: "Date of Issue", value: dayjs(wo.issueDate).format("DD MMM YYYY") },
            { label: "GST No. (Contractor)", value: bank?.gstNumber },
            {
              label: "Assigned DRI",
              value: (wo.assignedDRI ?? []).length > 0
                ? (wo.assignedDRI ?? []).map(d => (typeof d === "string" ? d : d.name)).join(", ")
                : undefined,
            },
            { label: "PAN No.", value: bank?.panNumber },
            {
              label: isProfessionalServices ? "Consultant Code" : "Vendor Code",
              value: (
                <span className="font-mono font-semibold text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400 px-1.5 py-0.5 rounded">
                  {wo.vendorCode}
                </span>
              ),
            },
            { label: isProfessionalServices ? "Principal" : "Owner", value: wo.ownerName },
          ]}
        />
      </Card>

      {/* ── Commercial Summary ──────────────────────────── */}
      <Card padded={false} className="mb-5 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/40 font-semibold text-[13px] text-gray-700 dark:text-gray-300">
          Commercial Summary
        </div>
        <PairedGrid
          pairsPerRow={3}
          items={[
            { label: "WO Value", value: <span className="font-mono font-bold text-primary text-[15px]">{fmt(contractVal)}</span> },
            { label: "Retention %", value: `${wo.retentionPercent ?? 0}%` },
            { label: "GST %", value: `${gstPercent}%` },
            {
              label: "Status",
              value: (
                <div>
                  <div className="flex items-center gap-1.5">
                    <Badge color={STATUS_CFG[wo.status]?.color}>{STATUS_CFG[wo.status]?.label}</Badge>
                    {wo.isLocked && <Badge color="amber"><Lock className="w-3 h-3 mr-1 inline" />Locked</Badge>}
                  </div>
                  {wo.isLocked && wo.approvalStatus === "approved" && (
                    <div className="inline-block mt-2 -rotate-12 border-2 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider opacity-70 select-none">
                      Verified &amp; Locked
                    </div>
                  )}
                </div>
              ),
            },
            { label: "Work Category", value: wo.category ? `${wo.category}${wo.subCategory ? ` / ${wo.subCategory}` : ""}` : undefined },
          ]}
        />
        {wo.isLocked && (
          <div className="text-gray-400 text-xs px-4 py-3 border-t border-gray-100 dark:border-gray-700/40">
            Rates, scope items, milestones, and contract value cannot be edited until unlocked.
            {wo.lockedAt && ` (${dayjs(wo.lockedAt).format("DD MMM YYYY, hh:mm a")})`}
          </div>
        )}
        {wo.status === "cancelled" && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700/40">
            <div className="text-xs font-semibold text-gray-400 mb-0.5">Cancellation Remark</div>
            <span className="text-red-600 text-sm">{wo.cancelReason || "—"}</span>
            {wo.cancelledAt && (
              <span className="text-gray-400 ml-2 text-xs">
                ({dayjs(wo.cancelledAt).format("DD MMM YYYY, hh:mm a")})
              </span>
            )}
          </div>
        )}
      </Card>

      {/* ── Work Items ──────────────────────────────── */}
      <Card padded={false} className="overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/40 font-semibold text-[13px] text-gray-700 dark:text-gray-300">
          {isProfessionalServices ? "Deliverables" : "Work Items"}
        </div>
        {wo.scopeItems.length === 0 ? (
          <div className="py-6 text-center text-gray-400 text-sm">
            {isProfessionalServices ? "No deliverables defined" : "No scope items defined"}
          </div>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th className="w-10">S.No</Th>
                {(isProfessionalServices
                  ? ["Deliverable", "Stage", "Due Date", "Status", "Amount"]
                  : ["Description", "Unit", "Planned Qty", "Rate", "Amount"]
                ).map(h => <Th key={h}>{h}</Th>)}
              </Tr>
            </Thead>
            <Tbody>
              {wo.scopeItems.map((si, idx) => {
                const hasSubItems = (si.subItems?.length ?? 0) > 0;
                return (
                <Fragment key={si.id}>
                  <Tr>
                    <Td><TdText>{idx + 1}</TdText></Td>
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
                      <Td />
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
            <Tfoot>
              <Tr className="hover:bg-transparent dark:hover:bg-transparent">
                <Td colSpan={5} className="text-right font-semibold text-gray-500 dark:text-gray-400">Items Subtotal</Td>
                <Td><span className="font-mono font-semibold text-gray-700 dark:text-gray-300">{fmt(itemsSubtotal)}</span></Td>
              </Tr>
              <Tr className="hover:bg-transparent dark:hover:bg-transparent">
                <Td colSpan={5} className="text-right font-semibold text-gray-500 dark:text-gray-400">GST {gstPercent}%</Td>
                <Td><span className="font-mono font-semibold text-gray-700 dark:text-gray-300">{fmt(gstAmount)}</span></Td>
              </Tr>
              <Tr className="hover:bg-transparent dark:hover:bg-transparent">
                <Td colSpan={5} className="text-right font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">Grand Total</Td>
                <Td><span className="font-mono font-bold text-primary text-[15px]">{fmt(grandTotal)}</span></Td>
              </Tr>
            </Tfoot>
          </Table>
        )}
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

      {/* ── Payment Terms + Bank Details (Contractor) ──────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <Card padded={false} className="overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/40 font-semibold text-[13px] text-gray-700 dark:text-gray-300">
            Payment Terms
          </div>
          <KeyValueTable
            rows={[
              ["Retention %", `${wo.retentionPercent ?? 0}%`],
              ["Advance", advanceMilestone
                ? (advanceMilestone.amountMode === "percent"
                    ? `${advanceMilestone.amountPercent ?? 0}% (${fmt(advanceMilestone.amount || 0)})`
                    : fmt(advanceMilestone.amount || 0))
                : "—"],
              ...(wo.totalTenure ? ([["Payment / Contract Tenure", wo.totalTenure]] as [string, ReactNode][]) : []),
              ["Security Deposit", securityDepositTotal > 0 ? fmt(securityDepositTotal) : "—"],
            ]}
          />
        </Card>
        <Card padded={false} className="overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/40 font-semibold text-[13px] text-gray-700 dark:text-gray-300">
            Bank Details {isProfessionalServices ? "(Consultant)" : "(Contractor)"}
          </div>
          {bank ? (
            <KeyValueTable
              rows={[
                ["Account Holder Name", bank.accountHolderName || "—"],
                ["Bank Name", bank.bankName || "—"],
                ["Account Number", <span className="font-mono">{bank.accountNumber || "—"}</span>],
                ["IFSC Code", <span className="font-mono">{bank.ifscCode || "—"}</span>],
                ...(bank.branchName ? ([["Branch", bank.branchName]] as [string, ReactNode][]) : []),
              ]}
            />
          ) : (
            <div className="text-sm text-gray-400 py-6 text-center">Bank details not available.</div>
          )}
        </Card>
      </div>

      {/* ── Payment Milestones ──────────────────────── */}
      <Card padded={false} className="overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700/40 flex items-center justify-between">
          <span className="font-semibold text-[13px] text-gray-700 dark:text-gray-300">Payment Milestones</span>
          {!readOnly && !editingMilestones && (
            <button
              onClick={startEditingMilestones}
              className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
        </div>
        {editingMilestones ? (
          <div className="p-4">
            <PaymentMilestonesBuilder
              items={milestoneDraft}
              onChange={setMilestoneDraft}
              contractValue={itemsSubtotal}
              contractValueInclGst={itemsSubtotal + gstAmount}
              discount={discountDraft}
              onDiscountChange={setDiscountDraft}
            />
            <div className="flex gap-2 mt-3">
              <Btn color="primary" small loading={savingMilestones} onClick={handleSaveMilestones} label="Save Changes" />
              <Btn outline small onClick={() => setEditingMilestones(false)} label="Cancel" />
            </div>
          </div>
        ) : (wo.paymentMilestones?.length ?? 0) > 0 ? (
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
        ) : (
          <div className="py-6 text-center text-gray-400 text-sm">No payment milestones defined</div>
        )}
      </Card>

      {/* ── Security Deposits — reference only, doesn't drive contractValue ── */}
      {(wo.securityDeposits?.length ?? 0) > 0 && (
        <Card padded={false} className="overflow-hidden mb-5">
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
        <Card className="mb-5">
          <div className="font-semibold text-[13px] text-gray-700 dark:text-gray-300 mb-2">Special Terms and Conditions</div>
          {wo.warrantyTerms!.map((t, i) => (
            <div key={i} className="text-sm text-gray-700 dark:text-gray-300 mb-1 flex gap-1.5">
              <span className="text-gray-400">{i + 1}.</span> {t}
            </div>
          ))}
        </Card>
      )}

      {/* ── Office Remark / Documents ──────────────────────── */}
      {(wo.internalRemark || documents.length > 0) && (
        <Card className="mb-5">
          {wo.internalRemark && (
            <>
              <div className="font-semibold text-[13px] text-gray-700 dark:text-gray-300 mb-1">Office Remark</div>
              <div className="text-sm text-gray-700 dark:text-gray-300 mb-3">{wo.internalRemark}</div>
            </>
          )}
          {documents.length > 0 && (
            <>
              <div className="font-semibold text-[13px] text-gray-700 dark:text-gray-300 mb-1.5">Documents</div>
              <div className="flex flex-col gap-1">
                {documents.map((d, i) => (
                  <a key={i} href={d.url} target="_blank" rel="noreferrer" download={d.name} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                    <Link2 className="w-3.5 h-3.5" /> {d.name}
                  </a>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {/* ── Approval Workflow & Signatures — at the bottom ──────────── */}
      <WorkOrderApprovalWorkflow
        workOrder={{ ...wo, _id: wo.id }}
        onUpdated={(updated) => onUpdated?.(updated as unknown as WorkOrder)}
        readOnly={readOnly}
      />
    </>
  );
}
