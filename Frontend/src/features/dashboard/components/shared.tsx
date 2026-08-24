import { useEffect, useState } from "react";
import { ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../../services/apiClient";
import Card from "../../../ui/Card";
import Btn from "../../../ui/Btn";
import Modal from "../../../ui/Modal";
import Spinner from "../../../ui/Spinner";
import NxBadge from "../../../ui/nexora/Badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../ui/Table";
import WorkOrderDetailView from "../../../components/WorkOrderDetailView";
import BillDetailModal from "../../../components/BillDetailModal";
import type { BillDetailRequest } from "../../../components/BillDetailModal";
import type { WorkOrder } from "../../../types/VendorBilling";
import { BILL_STATUS_LABEL } from "../../../shared/constants/billStatus";
import { billFinancials } from "../../../shared/utils/billMath";
import { COMPARISON_LABELS } from "./MiniCharts";
import type { ComparisonMode } from "./MiniCharts";
import type { DPRDetailRow } from "../../../types/DPR";

const normalizeId = (obj: Record<string, unknown>) => ({ ...obj, id: (obj._id || obj.id)?.toString() || "" });

// Same shape ensureFullWorkOrder/WorkItems normalize a raw API work order
// into before handing it to WorkOrderDetailView — duplicated here (rather
// than imported) since WorkItems' copy is a page-local helper, not exported.
function normalizeWorkOrder(wo: any): WorkOrder {
  return {
    ...normalizeId(wo),
    scopeItems: (wo.scopeItems || []).map((si: any) => ({
      ...normalizeId(si),
      progressEntries: (si.progressEntries || []).map(normalizeId),
      subItems: (si.subItems || []).map(normalizeId),
    })),
    paymentMilestones: (wo.paymentMilestones || []).map(normalizeId),
  } as WorkOrder;
}

const fmtMoney = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A stat card's drill-down list is always one homogeneous collection (all
// work orders, or all bill requests, or all running bills) — `kind` tells
// DetailListModal which quick-view to open when a row is clicked, so "view"
// always shows the real record instead of the row just sitting there dead.
export type DrillKind = "workOrder" | "billRequest" | "runningBill";

function WorkOrderQuickView({ id, onClose }: { id: string; onClose: () => void }) {
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [bills, setBills] = useState<{ status: string; amount: number }[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get<{ workOrder: any }>(`/work-orders/${id}`),
      apiClient.get<{ bills: any[] }>("/bills", { params: { workOrderId: id } }),
    ])
      .then(([woRes, billsRes]) => {
        if (cancelled) return;
        setWo(normalizeWorkOrder(woRes.data.workOrder));
        setBills((billsRes.data.bills || []).map(b => ({ status: b.status, amount: b.amount || 0 })));
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [id]);

  return (
    <Modal title="Work Order" extraWide zIndex={210} onClose={onClose} footer={<Btn label="Close" outline onClick={onClose} />}>
      {error ? (
        <div className="text-sm text-red-500 text-center py-8">Couldn't load this work order.</div>
      ) : !wo ? (
        <div className="py-12 flex justify-center"><Spinner /></div>
      ) : (
        <WorkOrderDetailView workOrder={wo} bills={bills} readOnly />
      )}
    </Modal>
  );
}

function BillRequestQuickView({ id, onClose }: { id: string; onClose: () => void }) {
  const [billRequest, setBillRequest] = useState<BillDetailRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient.get<{ billRequests: BillDetailRequest[] }>("/bill-requests")
      .then(r => {
        if (cancelled) return;
        const found = (r.data.billRequests || []).find(b => b._id === id) ?? null;
        if (!found) setError("Couldn't find this bill request.");
        setBillRequest(found);
      })
      .catch(() => { if (!cancelled) setError("Couldn't load this bill request."); });
    return () => { cancelled = true; };
  }, [id]);

  if (error) {
    return (
      <Modal title="Bill Request" zIndex={210} onClose={onClose} footer={<Btn label="Close" outline onClick={onClose} />}>
        <div className="text-sm text-red-500 text-center py-8">{error}</div>
      </Modal>
    );
  }
  if (!billRequest) {
    return (
      <Modal title="Bill Request" zIndex={210} onClose={onClose} footer={<Btn label="Close" outline onClick={onClose} />}>
        <div className="py-12 flex justify-center"><Spinner /></div>
      </Modal>
    );
  }
  return <BillDetailModal billRequest={billRequest} open onClose={onClose} zIndex={210} />;
}

interface QuickViewBillLineItem { description: string; unit: string; billedQty: number; rate: number; amount: number; }
interface QuickViewBill {
  billNo: string; status: string; billDate?: string; projectName?: string; workOrderNo?: string;
  vendorName?: string; generatedBy?: string; lineItems: QuickViewBillLineItem[]; amount: number;
  gstPercent: number; retentionPercent?: number; retentionAmount?: number; advanceRecovery?: number; remarks?: string;
}
const BILL_STATUS_BADGE_COLOR: Record<string, "gray" | "amber" | "blue" | "indigo" | "cyan" | "orange" | "green" | "red"> = {
  draft: "gray", "verify-done": "amber", "l1-approved": "blue", approved: "indigo",
  "sent-to-tms": "cyan", hold: "orange", paid: "green", rejected: "red",
};

function RunningBillQuickView({ id, onClose }: { id: string; onClose: () => void }) {
  const [bill, setBill] = useState<QuickViewBill | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.get<{ bill: QuickViewBill }>(`/bills/${id}`)
      .then(r => { if (!cancelled) setBill(r.data.bill); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [id]);

  return (
    <Modal title={bill?.billNo || "Bill"} extraWide zIndex={210} onClose={onClose} footer={<Btn label="Close" outline onClick={onClose} />}>
      {error ? (
        <div className="text-sm text-red-500 text-center py-8">Couldn't load this bill.</div>
      ) : !bill ? (
        <div className="py-12 flex justify-center"><Spinner /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-gray-800/40 p-3.5 rounded-lg mb-4">
            {[
              ["Status", <NxBadge key="s" color={BILL_STATUS_BADGE_COLOR[bill.status] ?? "gray"}>{BILL_STATUS_LABEL[bill.status] || bill.status}</NxBadge>],
              ["Bill Date", bill.billDate ? dayjs(bill.billDate).format("DD MMM YYYY") : "—"],
              ["Project", bill.projectName || "—"],
              ["Work Order", bill.workOrderNo || "—"],
              ["Vendor", bill.vendorName || "—"],
              ["Generated By", bill.generatedBy || "—"],
            ].map(([label, val]) => (
              <div key={label as string}>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
                <div className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] text-[13px]">{val}</div>
              </div>
            ))}
          </div>

          <div className="font-bold text-[13px] mb-2 text-[#1A1A2E] dark:text-[#F1F5F9]">Line Items</div>
          <div className="mb-4">
            <Table>
              <Thead>
                <Tr><Th>Description</Th><Th className="text-right">Qty</Th><Th className="text-right">Rate</Th><Th className="text-right">Amount</Th></Tr>
              </Thead>
              <Tbody>
                {(bill.lineItems || []).map((li, i) => (
                  <Tr key={i}>
                    <Td>{li.description}</Td>
                    <Td className="text-right">{li.billedQty} {li.unit}</Td>
                    <Td className="text-right">{fmtMoney(li.rate)}</Td>
                    <Td className="text-right font-bold">{fmtMoney(li.amount)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>

          <div className="font-bold text-[13px] mb-2 text-[#1A1A2E] dark:text-[#F1F5F9]">Financial Summary</div>
          <div className="font-mono text-[13px] border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-hidden">
            <div className="flex justify-between px-3.5 py-1.5 border-b border-gray-100 dark:border-gray-700/40">
              <span>Gross Amount</span><span>{fmtMoney(bill.amount)}</span>
            </div>
            {(bill.retentionAmount ?? 0) > 0 && (
              <div className="flex justify-between px-3.5 py-1.5 border-b border-gray-100 dark:border-gray-700/40 text-amber-700 dark:text-amber-400">
                <span>− Hold / Retention{bill.retentionPercent ? ` (${bill.retentionPercent}%)` : ""}</span><span>{fmtMoney(bill.retentionAmount || 0)}</span>
              </div>
            )}
            {(bill.advanceRecovery ?? 0) > 0 && (
              <div className="flex justify-between px-3.5 py-1.5 border-b border-gray-100 dark:border-gray-700/40 text-amber-700 dark:text-amber-400">
                <span>− Advance Recovery</span><span>{fmtMoney(bill.advanceRecovery || 0)}</span>
              </div>
            )}
            <div className="flex justify-between px-3.5 py-1.5 border-b border-gray-100 dark:border-gray-700/40">
              <span>+ GST @ {bill.gstPercent}%</span>
              <span>{fmtMoney(billFinancials({ gross: bill.amount, gstPercent: bill.gstPercent, retentionAmount: bill.retentionAmount ?? 0, advanceRecovery: bill.advanceRecovery ?? 0 }).gstAmount)}</span>
            </div>
            <div className="flex justify-between px-3.5 py-2.5 bg-primary/5 font-extrabold text-[15px] text-primary">
              <span>Net Payable</span>
              <span>{fmtMoney(billFinancials({ gross: bill.amount, gstPercent: bill.gstPercent, retentionAmount: bill.retentionAmount ?? 0, advanceRecovery: bill.advanceRecovery ?? 0 }).netPayable)}</span>
            </div>
          </div>

          {bill.remarks && (
            <>
              <div className="border-t border-gray-200 dark:border-gray-700/40 my-4" />
              <div className="text-gray-500 dark:text-gray-400 text-[13px]"><strong>Remarks:</strong> {bill.remarks}</div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

export function progressBarClass(pct: number): string {
  return pct >= 90 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
}

export function deltaText(change: number | null | undefined, comparisonMode: ComparisonMode): string | undefined {
  if (comparisonMode === "none" || change === undefined) return undefined;
  if (change === null) return "New activity";
  const label = COMPARISON_LABELS[comparisonMode as Exclude<ComparisonMode, "none">];
  return change === 0 ? `No change ${label}` : `${Math.abs(change)}% ${label}`;
}

export function ViewAllLink({ label = "View All", onClick }: { label?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-xs font-semibold text-primary hover:underline flex items-center gap-0.5 shrink-0">
      {label} <ChevronRight className="w-3.5 h-3.5" />
    </button>
  );
}

export function HighlightsBanner({
  icon: Icon, title, briefs, statusText, statusOk = true,
}: { icon: LucideIcon; title: string; briefs: string[]; statusText: string; statusOk?: boolean }) {
  const StatusIcon = statusOk ? CheckCircle2 : AlertTriangle;
  return (
    // Same white-card treatment as every other flashcard/filter on this page
    // (Card's own bg-white/border/shadow-sm) — no gray/orange fill of its own.
    <Card padded={false} className="mb-6 px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex items-center gap-2 font-extrabold text-[14px] text-[#1A1A2E] dark:text-[#F1F5F9] shrink-0">
        <Icon className="w-4 h-4 text-primary" /> {title}
      </div>
      {briefs.map((b, i) => (
        <div key={i} className="flex items-center gap-6">
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
          <div className="flex items-center gap-1.5 text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9]">
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            {b}
          </div>
        </div>
      ))}
      <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
      <div className={`flex items-center gap-1.5 text-[13px] font-medium ${statusOk ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
        <StatusIcon className="w-4 h-4 shrink-0" />
        {statusText}
      </div>
    </Card>
  );
}

export function DetailListModal({
  title, rows, onClose, kind,
}: { title: string; rows: DPRDetailRow[]; onClose: () => void; kind?: DrillKind }) {
  const [viewId, setViewId] = useState<string | null>(null);
  return (
    <>
      <Modal title={title} onClose={onClose} footer={<Btn label="Close" outline onClick={onClose} />}>
        {rows.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-8">No records for this metric.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const clickable = !!kind && !!r.id;
              return (
                <button
                  key={r.id || i}
                  type="button"
                  disabled={!clickable}
                  onClick={clickable ? () => setViewId(r.id) : undefined}
                  className={`border border-gray-100 dark:border-gray-700/40 rounded-lg px-3 py-2.5 text-left w-full bg-transparent ${clickable ? "hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer transition-colors" : "cursor-default"}`}
                >
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-semibold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{r.label}</span>
                    {r.value > 0 && <span className="text-xs font-bold text-primary">₹{r.value.toLocaleString("en-IN")}</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{[r.project, r.vendor].filter(Boolean).join(" · ")}</div>
                </button>
              );
            })}
          </div>
        )}
      </Modal>
      {viewId && kind === "workOrder" && <WorkOrderQuickView id={viewId} onClose={() => setViewId(null)} />}
      {viewId && kind === "billRequest" && <BillRequestQuickView id={viewId} onClose={() => setViewId(null)} />}
      {viewId && kind === "runningBill" && <RunningBillQuickView id={viewId} onClose={() => setViewId(null)} />}
    </>
  );
}
