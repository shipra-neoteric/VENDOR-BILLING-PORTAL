import { useEffect, useState, useMemo, useCallback } from "react";
import type { Dayjs } from "dayjs";
import { ArrowLeft, BookOpen, RotateCw, Wallet, Receipt, CheckCircle2, FileText, Landmark, Scale } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import { selectableProjects, getWorkOrderProjectId } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";
import PageHeader from "../../ui/PageHeader";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import { DropdownSelectFilter } from "../../ui/Filters";
import SField from "../../ui/SField";
import { Descriptions, DescItem } from "../../ui/Descriptions";
import Switch from "../../ui/Switch";
import Spinner from "../../ui/Spinner";
import Alert from "../../ui/Alert";
import EmptyState from "../../ui/EmptyState";
import { Table, Thead, Tbody, Tfoot, Tr, Th, Td } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";

// ── Types ─────────────────────────────────────────────────────
type BillStatus = "draft" | "verify-done" | "l1-approved" | "approved" | "sent-to-tms" | "hold" | "rejected" | "paid";

interface WO {
  _id: string; workOrderNo: string;
  // Populated by the backend as an object; kept loose since some call sites may pass a raw id.
  projectId?: string | { _id: string; code?: string; name?: string; projectType?: string } | null;
  projectName?: string;
  vendorCode?: string; vendorName?: string; contractValue?: number;
  issueDate?: string; status?: string; scopeOfWork?: string; category?: string;
}

interface Bill {
  _id: string; billNo: string; workOrderId?: string; workOrderNo?: string;
  projectName?: string; vendorCode?: string; vendorName?: string;
  billDate: string; billRefNo?: string; amount: number;
  gstPercent: number; tdsPercent: number; tdsAmount?: number; paidAmount?: number;
  retentionAmount?: number; advanceRecovery?: number;
  remarks?: string; status: BillStatus;
  billType?: string; relationshipType?: string; isActive?: boolean;
  supersededBy?: { _id: string; billNo: string; billType?: string } | null;
  linkedBills?: { billId: string; billNo: string; relationshipType: string }[];
  billingCycle?: number;
}
interface Project { _id: string; code?: string; name?: string; parentId?: string | null; }
interface Contractor { _id: string; vendorCode: string; companyName?: string; shortCode?: string; }

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctStr = (n: number, d: number) => d ? ((n / d) * 100).toFixed(1) + "%" : "0%";

// Hold/Retention and Advance Recovery aren't the contractor's taxable value —
// GST is calculated on the amount net of both, not the raw billed amount.
// TDS is the bill's own already-decided tdsAmount (set at Verification,
// itself net of Hold/Advance/GST) rather than a recompute against the gross.
// "Gross"/"Net" below keep their original amount+GST / gross-tds-retention-advance
// shape so every downstream column and total still lines up — only the GST
// rupee figure itself moves to the corrected base.
function calcBill(b: Bill) {
  const retention = b.retentionAmount ?? 0;
  const advance   = b.advanceRecovery ?? 0;
  const netBeforeGst = b.amount - retention - advance;
  const gst   = (netBeforeGst * (b.gstPercent ?? 18)) / 100;
  const gross = b.amount + gst;
  const tds   = b.tdsAmount ?? 0;
  const net   = gross - tds - retention - advance;
  return { gst, gross, tds, retention, advance, net };
}

// Maps each bill stage onto the fixed Nexora badge palette — gray=draft,
// amber/cyan=pending stages, blue/indigo=approved-and-moving-on, orange=hold
// (a warning/paused state), green=paid, red=rejected.
const STATUS_CFG: Record<BillStatus, { color: NxBadgeColor; label: string }> = {
  draft:         { color: "gray",   label: "Draft" },
  "verify-done": { color: "amber",  label: "Awaiting L1 AGM" },
  "l1-approved": { color: "cyan",   label: "Awaiting L2 Director" },
  approved:      { color: "blue",   label: "Ready for TMS" },
  "sent-to-tms": { color: "indigo", label: "Sent to TMS" },
  hold:          { color: "orange", label: "On Hold" },
  rejected:      { color: "red",    label: "Rejected" },
  paid:          { color: "green",  label: "Paid" },
};

// Work order's own lifecycle status (distinct from a bill's status above).
const WO_STATUS_COLOR: Record<string, NxBadgeColor> = {
  draft: "gray", issued: "amber", "in-progress": "amber", completed: "green", cancelled: "red",
};

const BILL_TYPE_LABEL: Record<string, string> = {
  running:              "Running Bill",
  final:                "Final Bill",
  advance_mobilization: "Mob. Advance",
  advance_secured:      "Secured Advance",
  advance_material:     "Material Advance",
  recovery:             "Recovery",
  credit_note:          "Credit Note",
  debit_note:           "Debit Note",
  revision:             "Revision",
  correction:           "Correction",
  retention_release:    "Retention Release",
};

// ── Tape bar ──────────────────────────────────────────────────
function TapeBar({ contract, certified, pending }: { contract: number; certified: number; pending: number }) {
  const certPct = contract ? Math.min((certified / contract) * 100, 100) : 0;
  const pendPct = contract ? Math.min((pending   / contract) * 100, 100 - certPct) : 0;
  const remaining = contract - certified - pending;
  return (
    <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-4 mb-5">
      <div className="flex justify-between flex-wrap gap-2 text-[11px] font-mono text-gray-400 dark:text-gray-500 mb-1.5">
        <span>₹0</span>
        <span className="text-emerald-600 dark:text-emerald-400">{fmt(certified)} certified</span>
        {pending > 0 && <span className="text-primary">{fmt(pending)} pending</span>}
        <span>{fmt(contract)} contract</span>
      </div>
      <div className="h-2.5 bg-gray-100 dark:bg-gray-700/40 rounded-full overflow-hidden flex">
        <div className="bg-emerald-500 transition-[width] duration-300" style={{ width: `${certPct}%` }} />
        <div className="bg-primary/50 transition-[width] duration-300" style={{ width: `${pendPct}%` }} />
      </div>
      <div className="flex gap-5 flex-wrap mt-2.5 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />Certified (Approved)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary/50 shrink-0" />Pending Approval</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-100 dark:bg-gray-700/40 border border-gray-300 dark:border-gray-600 shrink-0" />Remaining</span>
        <span className={`ml-auto font-mono ${remaining < 0 ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>
          {fmt(Math.max(remaining, 0))} remaining{remaining < 0 ? " ⚠️ over-billed" : ""}
        </span>
      </div>
    </div>
  );
}

// ── Mini progress bar (summary table row) ──────────────────────
function ProgressCell({ certifiedPct, billedPct }: { certifiedPct: number; billedPct: number }) {
  return (
    <div className="min-w-[100px]">
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-emerald-600 dark:text-emerald-400">{certifiedPct.toFixed(0)}%</span>
        <span className="text-gray-400">{billedPct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-700/40 rounded-full overflow-hidden flex">
        <div className="bg-emerald-500" style={{ width: `${Math.min(certifiedPct, 100)}%` }} />
        <div className="bg-primary/50" style={{ width: `${Math.min(billedPct - certifiedPct, 100 - certifiedPct)}%` }} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function Ledger() {
  const [workOrders, setWorkOrders]   = useState<WO[]>([]);
  const [bills, setBills]             = useState<Bill[]>([]);
  const [projects, setProjects]       = useState<Project[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [selectedWOId, setSelectedWOId]     = useState<string | null>(null);
  const [projectFilter, setProjectFilter]   = useState<string>("all");
  const [vendorFilter, setVendorFilter]     = useState<string>("all");
  const [dateFrom, setDateFrom]             = useState<Dayjs | null>(null);
  const [dateTo, setDateTo]                 = useState<Dayjs | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);

  const load = useCallback(async (withArchived: boolean) => {
    setLoading(true);
    setError("");
    try {
      const [woRes, billRes, projRes, ctrRes] = await Promise.all([
        apiClient.get("/work-orders"),
        apiClient.get(`/bills${withArchived ? "?archived=all" : ""}`),
        apiClient.get("/projects"),
        apiClient.get("/contractors"),
      ]);
      setWorkOrders(woRes.data.workOrders ?? woRes.data ?? []);
      setBills(billRes.data.bills ?? billRes.data ?? []);
      setProjects(projRes.data.projects ?? projRes.data ?? []);
      setContractors(ctrRes.data.contractors ?? ctrRes.data ?? []);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to load ledger data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(includeArchived); }, [load, includeArchived]);

  // ── Summary data ──────────────────────────────────────────
  const filteredWOs = useMemo(() => workOrders.filter(wo => {
    const matchProject = projectFilter === "all" || getWorkOrderProjectId(wo.projectId) === projectFilter;
    const matchVendor  = vendorFilter  === "all" || wo.vendorCode === vendorFilter;
    const matchDate    = inDateRange(wo.issueDate, dateFrom, dateTo);
    return matchProject && matchVendor && matchDate;
  }), [workOrders, projectFilter, vendorFilter, dateFrom, dateTo]);

  const woSummaries = useMemo(() => filteredWOs.map(wo => {
    const woBills       = bills.filter(b => b.workOrderId?.toString() === wo._id?.toString());
    // Active bills: not superseded by another bill — these count toward certified totals
    const activeBills   = woBills.filter(b => b.isActive !== false);
    const contract      = wo.contractValue ?? 0;
    let totalGross = 0, certifiedNet = 0, pendingGross = 0;
    for (const b of activeBills) {
      const { gross, net } = calcBill(b);
      totalGross += gross;
      if (b.status === "approved" || b.status === "sent-to-tms" || b.status === "hold" || b.status === "paid") certifiedNet += net;
      if (b.status === "draft" || b.status === "verify-done" || b.status === "l1-approved") pendingGross += gross;
    }
    const supersededCount = woBills.length - activeBills.length;
    const balance      = contract - certifiedNet;
    const billedPct    = contract ? (totalGross / contract) * 100 : 0;
    const certifiedPct = contract ? (certifiedNet / contract) * 100 : 0;
    return { wo, woBills, activeBills, supersededCount, contract, totalGross, certifiedNet, pendingGross, balance, billedPct, certifiedPct };
  }), [filteredWOs, bills]);

  const pager = usePagination(woSummaries, 10);

  // ── Detail for selected WO ────────────────────────────────
  const detail = useMemo(() => {
    if (!selectedWOId) return null;
    const wo = workOrders.find(w => w._id === selectedWOId);
    if (!wo) return null;
    const woBills = bills
      .filter(b => b.workOrderId?.toString() === selectedWOId)
      .sort((a, b) => (a.billingCycle ?? 0) - (b.billingCycle ?? 0) || a.billDate.localeCompare(b.billDate));
    const contract = wo.contractValue ?? 0;
    let runningBalance = contract, cumCertifiedNet = 0;
    const rows = woBills.map((b, i) => {
      const { gst, gross, tds, retention, advance, net } = calcBill(b);
      // Only active bills contribute to the certified running balance
      const isSuperseded = b.isActive === false;
      const isCert = !isSuperseded && (b.status === "approved" || b.status === "sent-to-tms" || b.status === "hold" || b.status === "paid");
      if (isCert) { runningBalance -= net; cumCertifiedNet += net; }
      return { b, gst, gross, tds, retention, advance, net, isCert, isSuperseded, balanceAfter: isCert ? runningBalance : null, seq: i + 1 };
    });
    const activeRows   = rows.filter(r => !r.isSuperseded);
    const totalGross   = activeRows.reduce((s, r) => s + r.gross, 0);
    const totalNet     = activeRows.reduce((s, r) => s + r.net, 0);
    const pendingGross = activeRows.filter(r => r.b.status === "draft" || r.b.status === "verify-done" || r.b.status === "l1-approved").reduce((s, r) => s + r.gross, 0);
    const balance      = contract - cumCertifiedNet;
    const supersededCount = rows.filter(r => r.isSuperseded).length;
    return { wo, rows, contract, totalGross, totalNet, certifiedNet: cumCertifiedNet, pendingGross, balance, supersededCount };
  }, [selectedWOId, workOrders, bills]);

  if (loading) return <Spinner label="Loading ledger…" />;

  if (error) return <div className="m-6"><Alert type="error" message={error} /></div>;

  // ── Portfolio totals ──────────────────────────────────────
  const portfolioContract      = woSummaries.reduce((s, r) => s + r.contract, 0);
  const portfolioGross         = woSummaries.reduce((s, r) => s + r.totalGross, 0);
  const portfolioCertified     = woSummaries.reduce((s, r) => s + r.certifiedNet, 0);
  const portfolioBalance       = woSummaries.reduce((s, r) => s + Math.max(r.balance, 0), 0);
  const portfolioActuallyPaid  = bills
    .filter(b => b.status === "paid" && woSummaries.some(r => r.wo._id === b.workOrderId))
    .reduce((s, b) => s + calcBill(b).net, 0);
  const portfolioTotalBillAmountPaid = bills
    .filter(b => b.status === "paid" && woSummaries.some(r => r.wo._id === b.workOrderId))
    .reduce((s, b) => s + (b.amount ?? 0), 0);

  // ═══════════════════════════════════════════════════════════
  //  DETAIL VIEW
  // ═══════════════════════════════════════════════════════════
  if (selectedWOId && detail) {
    return (
      <div>
        <PageHeader
          icon={BookOpen}
          title={<>Ledger — <span className="text-primary">{detail.wo.workOrderNo}</span></>}
          subtitle={
            <span className="inline-flex items-center gap-1.5 flex-wrap">
              <span>{detail.wo.vendorCode}</span>
              {detail.wo.category && <span>· {detail.wo.category}</span>}
              <span>· {detail.wo.vendorName} · {detail.wo.projectName}</span>
            </span>
          }
          actions={<NxBtn color="secondary" icon={ArrowLeft} label="All Work Orders" onClick={() => setSelectedWOId(null)} />}
        />

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          <NxStatCard
            label="Contract Value" icon={Wallet}
            value={<>{fmt(detail.contract)}<div className="text-[11px] font-normal text-gray-400 mt-0.5">opening balance</div></>}
          />
          <NxStatCard
            label="Total Billed" icon={Receipt}
            value={<>{detail.totalGross > 0 ? fmt(detail.totalGross) : "—"}<div className="text-[11px] font-normal text-gray-400 mt-0.5">{detail.rows.length} bill{detail.rows.length !== 1 ? "s" : ""} · incl. GST</div></>}
          />
          <NxStatCard
            label="Certified (Net)" icon={CheckCircle2}
            value={<>{detail.certifiedNet > 0 ? fmt(detail.certifiedNet) : "—"}<div className="text-[11px] font-normal text-gray-400 mt-0.5">{detail.contract ? `${pctStr(detail.certifiedNet, detail.contract)} of contract` : "approved bills only"}</div></>}
          />
          <NxStatCard
            label="Total Bill Amount" icon={FileText}
            value={<>{fmt(detail.rows.filter(r => r.b.status === "paid").reduce((s, r) => s + r.gross, 0))}<div className="text-[11px] font-normal text-gray-400 mt-0.5">gross billed (paid bills)</div></>}
          />
          <NxStatCard
            label="Cash Released (Net TDS)" icon={Landmark}
            value={<>{fmt(detail.rows.filter(r => r.b.status === "paid").reduce((s, r) => s + r.net, 0))}<div className="text-[11px] font-normal text-gray-400 mt-0.5">actual bank transfer</div></>}
          />
          <NxStatCard
            label="Balance Remaining" icon={Scale}
            value={
              <>
                <span className={detail.balance < 0 ? "text-red-600 dark:text-red-400" : ""}>{fmt(Math.max(detail.balance, 0))}</span>
                <div className="text-[11px] font-normal text-gray-400 mt-0.5">{detail.balance < 0 ? "⚠️ over-billed" : "uncertified contract value"}</div>
              </>
            }
          />
        </div>

        <TapeBar contract={detail.contract} certified={detail.certifiedNet} pending={detail.pendingGross} />

        {/* WO meta */}
        <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-4 mb-5">
          <Descriptions columns={3}>
            {detail.wo.issueDate && <DescItem label="Issue Date">{dayjs(detail.wo.issueDate).format("DD MMM YYYY")}</DescItem>}
            <DescItem label="Project">{detail.wo.projectName}</DescItem>
            <DescItem label="Status">
              <NxBadge color={WO_STATUS_COLOR[detail.wo.status || ""] ?? "gray"}>{(detail.wo.status || "").toUpperCase()}</NxBadge>
            </DescItem>
            {detail.wo.scopeOfWork && <DescItem label="Scope" span={3}>{detail.wo.scopeOfWork}</DescItem>}
          </Descriptions>
        </div>

        {/* Ledger table */}
        {detail.rows.length === 0 ? (
          <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg">
            <EmptyState icon={FileText} title="No running bills for this work order yet" />
          </div>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>#</Th>
                <Th>Bill No. / Date</Th>
                <Th>Ref / Remarks</Th>
                <Th className="text-right">Base Amt</Th>
                <Th className="text-right">GST</Th>
                <Th className="text-right">Gross</Th>
                <Th className="text-right">TDS</Th>
                <Th className="text-right">Retention</Th>
                <Th className="text-right">Advance Recovery</Th>
                <Th className="text-right">Net Payable</Th>
                <Th>Status</Th>
                <Th className="text-right">Running Balance</Th>
              </Tr>
            </Thead>
            <Tbody>
              <Tr className="bg-blue-50/60 dark:bg-blue-500/10">
                <Td className="font-mono text-gray-400 text-xs">OB</Td>
                <Td className="font-bold text-primary" colSpan={2}>Opening Balance — Contract Value</Td>
                <Td className="text-right font-mono font-bold text-primary" colSpan={8}>{fmt(detail.contract)}</Td>
                <Td className="text-right font-mono font-bold text-primary">{fmt(detail.contract)}</Td>
              </Tr>
              {detail.rows.map(r => (
                <Tr key={r.b._id} className={r.isSuperseded ? "opacity-60 bg-gray-50 dark:bg-gray-800/30" : undefined}>
                  <Td className="font-mono text-gray-400 text-xs">{r.seq}</Td>
                  <Td>
                    <div className={`font-bold ${r.isSuperseded ? "text-gray-400 line-through" : "text-primary"}`}>
                      {r.b.billNo}
                    </div>
                    <div className="text-[11px] text-gray-400">{dayjs(r.b.billDate).format("DD MMM YYYY")}</div>
                    {r.b.supersededBy && (
                      <div className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold mt-0.5">
                        ↩ Superseded by {r.b.supersededBy.billNo}
                      </div>
                    )}
                  </Td>
                  <Td className="text-gray-500 dark:text-gray-400 text-xs">
                    {r.b.billRefNo && <div>{r.b.billRefNo}</div>}
                    {r.b.billType && r.b.billType !== "running" && (
                      <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide">
                        {BILL_TYPE_LABEL[r.b.billType] ?? r.b.billType}
                      </div>
                    )}
                    {r.b.remarks && <div className="text-[11px] text-gray-400 italic">{r.b.remarks}</div>}
                  </Td>
                  <Td className="text-right font-mono">{fmt(r.b.amount)}</Td>
                  <Td className="text-right font-mono text-emerald-600 dark:text-emerald-400">{fmt(r.gst)}</Td>
                  <Td className={`text-right font-mono font-bold ${r.isSuperseded ? "text-gray-400" : "text-primary"}`}>{fmt(r.gross)}</Td>
                  <Td className="text-right font-mono text-red-600 dark:text-red-400">({fmt(r.tds)})</Td>
                  <Td className="text-right font-mono text-purple-600 dark:text-purple-400">{r.retention > 0 ? `(${fmt(r.retention)})` : "—"}</Td>
                  <Td className="text-right font-mono text-amber-700 dark:text-amber-400">{r.advance > 0 ? `(${fmt(r.advance)})` : "—"}</Td>
                  <Td className={`text-right font-mono font-bold ${r.isSuperseded ? "text-gray-400" : "text-emerald-600 dark:text-emerald-400"}`}>{fmt(r.net)}</Td>
                  <Td>
                    {r.isSuperseded
                      ? <NxBadge color="gray">Superseded</NxBadge>
                      : <NxBadge color={STATUS_CFG[r.b.status].color}>{STATUS_CFG[r.b.status].label}</NxBadge>
                    }
                  </Td>
                  <Td className={`text-right font-mono font-bold ${r.balanceAfter !== null ? (r.balanceAfter < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400") : "text-gray-400"}`}>
                    {r.balanceAfter !== null ? fmt(r.balanceAfter) : "—"}
                  </Td>
                </Tr>
              ))}
            </Tbody>
            <Tfoot>
              <Tr>
                <Td colSpan={3} className="font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">CLOSING BALANCE</Td>
                <Td className="text-right font-mono font-semibold">{fmt(detail.rows.reduce((s, r) => s + r.b.amount, 0))}</Td>
                <Td className="text-right font-mono text-emerald-600 dark:text-emerald-400">{fmt(detail.rows.reduce((s, r) => s + r.gst, 0))}</Td>
                <Td className="text-right font-mono font-bold text-primary">{fmt(detail.totalGross)}</Td>
                <Td className="text-right font-mono text-red-600 dark:text-red-400">({fmt(detail.rows.reduce((s, r) => s + r.tds, 0))})</Td>
                <Td className="text-right font-mono text-purple-600 dark:text-purple-400">({fmt(detail.rows.reduce((s, r) => s + r.retention, 0))})</Td>
                <Td className="text-right font-mono text-amber-700 dark:text-amber-400">({fmt(detail.rows.reduce((s, r) => s + r.advance, 0))})</Td>
                <Td className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(detail.totalNet)}</Td>
                <Td />
                <Td className={`text-right font-mono font-bold ${detail.balance < 0 ? "text-red-600 dark:text-red-400" : "text-primary"}`}>
                  {fmt(Math.max(detail.balance, 0))} left
                </Td>
              </Tr>
            </Tfoot>
          </Table>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  SUMMARY VIEW
  // ═══════════════════════════════════════════════════════════
  return (
    <div>
      <PageHeader
        icon={BookOpen}
        title="Ledger"
        subtitle='Work Order billing summary — click "View Ledger" for a full statement.'
        actions={
          <div className="flex items-center gap-3">
            <Switch checked={includeArchived} onChange={setIncludeArchived} offLabel="Include archived bills" onLabel="Including archived bills" />
            <NxBtn color="secondary" icon={RotateCw} label="Refresh" onClick={() => load(includeArchived)} />
          </div>
        }
      />

      {/* Portfolio stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <NxStatCard
          label="Total Contract Value" icon={Wallet}
          value={<>{fmt(portfolioContract)}<div className="text-[11px] font-normal text-gray-400 mt-0.5">{woSummaries.length} work orders</div></>}
        />
        <NxStatCard
          label="Total Billed (Gross)" icon={Receipt}
          value={<>{fmt(portfolioGross)}<div className="text-[11px] font-normal text-gray-400 mt-0.5">all running bills incl. GST</div></>}
        />
        <NxStatCard
          label="Total Certified (Net)" icon={CheckCircle2}
          value={<>{fmt(portfolioCertified)}<div className="text-[11px] font-normal text-gray-400 mt-0.5">approved bills net payable</div></>}
        />
        <NxStatCard
          label="Total Bill Amount" icon={FileText}
          value={<>{fmt(portfolioTotalBillAmountPaid)}<div className="text-[11px] font-normal text-gray-400 mt-0.5">gross billed (paid bills)</div></>}
        />
        <NxStatCard
          label="Cash Released (Net TDS)" icon={Landmark}
          value={<>{fmt(portfolioActuallyPaid)}<div className="text-[11px] font-normal text-gray-400 mt-0.5">actual bank transfer</div></>}
        />
        <NxStatCard
          label="Balance Remaining" icon={Scale}
          value={<>{fmt(portfolioBalance)}<div className="text-[11px] font-normal text-gray-400 mt-0.5">uncertified contract value</div></>}
        />
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
        <div className="flex gap-2.5 items-center flex-wrap">
          <DropdownSelectFilter
            value={projectFilter} onChange={setProjectFilter} placeholder="All Projects"
            options={selectableProjects(projects).map(p => ({ value: p._id, label: p.name || p._id }))}
          />
          <DropdownSelectFilter
            value={vendorFilter} onChange={setVendorFilter} placeholder="All Vendors"
            options={contractors.map(c => ({ value: c.vendorCode, label: `${c.vendorCode} — ${vendorLabel(c.companyName || "", c.shortCode)}` }))}
          />
          <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
          <div className="w-64">
            <SField
              value={null} placeholder="Jump to Work Order…"
              onChange={id => { if (id) setSelectedWOId(id); }}
              options={workOrders.map(wo => ({ value: wo._id, label: `${wo.workOrderNo} — ${wo.vendorName}` }))}
            />
          </div>
          <span className="ml-auto text-gray-400 text-xs whitespace-nowrap">
            {woSummaries.length} work order{woSummaries.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Summary table */}
      {woSummaries.length === 0 ? (
        <EmptyState icon={BookOpen} title="No work orders match the selected filters" />
      ) : (
        <>
          <Table>
            <Thead>
              <Tr>
                <Th>Work Order</Th>
                <Th>Project</Th>
                <Th>Vendor</Th>
                <Th>Category</Th>
                <Th className="text-right">Contract Value</Th>
                <Th className="text-right">Total Billed</Th>
                <Th className="text-right">Certified (Net)</Th>
                <Th className="text-right">Balance</Th>
                <Th>Progress</Th>
                <Th className="text-center">Bills</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {pager.pageItems.map(r => (
                <Tr key={r.wo._id} className="cursor-pointer" onClick={() => setSelectedWOId(r.wo._id)}>
                  <Td className="font-bold text-primary">{r.wo.workOrderNo}</Td>
                  <Td className="text-gray-500 dark:text-gray-400">{r.wo.projectName || "—"}</Td>
                  <Td>
                    <div className="font-semibold text-sm">{r.wo.vendorName || "—"}</div>
                    <div className="text-[11px] text-gray-400">{r.wo.vendorCode}</div>
                  </Td>
                  <Td>{r.wo.category || <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                  <Td className="text-right font-mono font-bold">{fmt(r.contract)}</Td>
                  <Td className="text-right font-mono">{r.totalGross > 0 ? fmt(r.totalGross) : <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                  <Td className="text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">{r.certifiedNet > 0 ? fmt(r.certifiedNet) : <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                  <Td className={`text-right font-mono ${r.balance < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{fmt(r.balance)}</Td>
                  <Td><ProgressCell certifiedPct={r.certifiedPct} billedPct={r.billedPct} /></Td>
                  <Td className="text-center text-gray-500 dark:text-gray-400">{r.woBills.length || "—"}</Td>
                  <Td onClick={e => e.stopPropagation()}>
                    <NxBtn color="secondary" icon={BookOpen} label="View Ledger" onClick={() => setSelectedWOId(r.wo._id)} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {pager.totalPages > 1 && <div className="mt-4"><Pagination page={pager.page} totalPages={pager.totalPages} onChange={pager.setPage} /></div>}
        </>
      )}
    </div>
  );
}
