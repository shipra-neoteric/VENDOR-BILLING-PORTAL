import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Receipt, FileText, Ban, CheckCircle2 } from "lucide-react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import Modal from "../../ui/Modal";
import { Descriptions, DescItem } from "../../ui/Descriptions";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import Spinner from "../../ui/Spinner";
import EmptyState from "../../ui/EmptyState";
import { SearchFilter, DropdownSelectFilter } from "../../ui/Filters";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import { selectableProjects } from "../../utils/projectOptions";
import { useAuth } from "../../context/AuthContext";
import type { AuthUser } from "../../context/AuthContext";
import { BILL_TYPE_CFG } from "../../shared/constants/billOptions";
import { BILL_STATUS, BILL_STATUS_LABEL } from "../../shared/constants/billStatus";
import { billFinancials } from "../../shared/utils/billMath";
import NewBillDrawer from "./NewBillDrawer";

// ── Types — a read-only slice of what AccountsPayment's own Bill looks
// like; this page never edits a bill, only lists/views + creates new ones ──

interface BillLineItem {
  description: string;
  unit: string;
  plannedQty: number;
  billedQty: number;
  rate: number;
  amount: number;
}

interface Bill {
  id: string;
  billNo: string;
  workOrderId?: string;
  workOrderNo?: string;
  projectId?: string;
  projectName?: string;
  vendorCode?: string;
  vendorName?: string;
  companyName?: string;
  billDate: string;
  generatedBy?: string;
  lineItems: BillLineItem[];
  amount: number;
  gstPercent: number;
  retentionPercent?: number;
  retentionAmount?: number;
  advanceRecovery?: number;
  tdsPercent?: number;
  tdsAmount?: number;
  remarks?: string;
  status: string;
  billType?: string;
  createdAt?: string;
}

interface ProjectOpt { id: string; name: string; code: string; parentId?: string | null; }

const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Per-unit rates are fractional far more often than totals are — rounding
// them for display (as fmt() does) silently turns 130.5 into 131.
const fmtRate = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const netAfterAdvance = (b: Bill) =>
  billFinancials({
    gross: b.amount || 0, gstPercent: b.gstPercent ?? 0,
    retentionAmount: b.retentionAmount ?? 0, advanceRecovery: b.advanceRecovery ?? 0,
  }).netPayable;
const normalizeId = (obj: Record<string, unknown>) => ({ ...obj, id: (obj._id || obj.id)?.toString() || "" });

// Nexora semantic mapping for each backend bill status — gray/amber for the
// early not-yet-approved stages, blue/indigo/cyan as it moves through the
// approval chain, orange for the on-hold warning state, green once paid,
// red once rejected. Mirrors BILL_STATUS_COLOR's ordering, just recolored
// onto the fixed Nexora badge palette instead of arbitrary hex.
const BILL_STATUS_BADGE_COLOR: Record<string, NxBadgeColor> = {
  draft: "gray",
  "verify-done": "amber",
  "l1-approved": "blue",
  approved: "indigo",
  "sent-to-tms": "cyan",
  hold: "orange",
  paid: "green",
  rejected: "red",
};

function hasPerm(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return !!user.permissions?.find((p) => p.module === "billing")?.actions.includes(action);
}

export default function Billing() {
  const { user } = useAuth();
  const canCreate = hasPerm(user, "create");

  const [bills, setBills] = useState<Bill[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);

  const [viewBillId, setViewBillId] = useState<string | null>(null);

  const loadBills = useCallback(() => {
    setLoading(true);
    apiClient.get<{ bills: Record<string, unknown>[] }>("/bills")
      .then((r) => setBills((r.data.bills || []).map((b) => normalizeId(b) as unknown as Bill)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadBills(); }, [loadBills]);

  useEffect(() => {
    apiClient.get<{ projects: Record<string, unknown>[] }>("/projects")
      .then((r) => setProjects((r.data.projects || []).map((p) => normalizeId(p) as unknown as ProjectOpt)))
      .catch(() => {});
  }, []);

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        (b.billNo || "").toLowerCase().includes(q) ||
        (b.vendorName || "").toLowerCase().includes(q) ||
        (b.workOrderNo || "").toLowerCase().includes(q) ||
        (b.projectName || "").toLowerCase().includes(q) ||
        (b.generatedBy || "").toLowerCase().includes(q);
      const matchProject = !projectFilter || b.projectId === projectFilter;
      const matchStatus  = !statusFilter || b.status === statusFilter;
      const matchDate     = inDateRange(b.billDate, dateFrom, dateTo);
      return matchSearch && matchProject && matchStatus && matchDate;
    }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [bills, search, projectFilter, statusFilter, dateFrom, dateTo]);

  const { page, totalPages, setPage, pageItems: pagedBills } = usePagination(filteredBills, 20);

  // Computed off the raw (unfiltered) list so clicking a stat card always
  // shows the true total for that bucket, not a number depressed by
  // whatever filter is already active — same convention as WorkItems.
  const statusCounts = useMemo(() => {
    const c = { total: bills.length, draft: 0, hold: 0, paid: 0 };
    for (const b of bills) {
      if (b.status === "draft") c.draft++;
      else if (b.status === "hold") c.hold++;
      else if (b.status === "paid") c.paid++;
    }
    return c;
  }, [bills]);

  const viewBill = useMemo(
    () => (viewBillId ? bills.find((b) => b.id === viewBillId) || null : null),
    [bills, viewBillId]
  );

  return (
    <div>
      <PageHeader
        icon={Receipt}
        title="Billing"
        subtitle="Every bill in the system — from DRI-progress → AGM → GM approvals, or created directly here — still processed through Accounts Payment"
        actions={
          canCreate ? (
            <NxBtn color="primary" icon={Plus} label="New Bill" onClick={() => setNewOpen(true)} />
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <NxStatCard label="Total Bills" value={statusCounts.total} icon={Receipt} />
        <NxStatCard
          label="Awaiting Verification" value={statusCounts.draft} icon={FileText}
          active={statusFilter === BILL_STATUS.DRAFT}
          onClick={() => setStatusFilter(statusFilter === BILL_STATUS.DRAFT ? "" : BILL_STATUS.DRAFT)}
        />
        <NxStatCard
          label="On Hold" value={statusCounts.hold} icon={Ban}
          active={statusFilter === BILL_STATUS.HOLD}
          onClick={() => setStatusFilter(statusFilter === BILL_STATUS.HOLD ? "" : BILL_STATUS.HOLD)}
        />
        <NxStatCard
          label="Paid" value={statusCounts.paid} icon={CheckCircle2}
          active={statusFilter === BILL_STATUS.PAID}
          onClick={() => setStatusFilter(statusFilter === BILL_STATUS.PAID ? "" : BILL_STATUS.PAID)}
        />
      </div>

      <div className="bg-white/90 dark:bg-gray-800/95 backdrop-blur-xl border border-gray-100 dark:border-gray-700/50 rounded-xl shadow-sm p-5">
        <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
          <div className="flex gap-2.5 items-center flex-wrap">
            <SearchFilter placeholder="Search bill no., vendor, WO, project…" value={search} onChange={setSearch} />
            <DropdownSelectFilter
              value={projectFilter}
              onChange={setProjectFilter}
              placeholder="All Projects"
              resetValue=""
              options={selectableProjects(projects).map((p) => ({ value: p.id, label: p.name }))}
            />
            <DropdownSelectFilter
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="All Statuses"
              resetValue=""
              options={Object.values(BILL_STATUS).map((s) => ({ value: s, label: BILL_STATUS_LABEL[s] || s }))}
            />
            <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
            <span className="ml-auto text-gray-400 text-xs whitespace-nowrap">
              {filteredBills.length} bill{filteredBills.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {loading ? (
          <Spinner size="large" />
        ) : filteredBills.length === 0 ? (
          <EmptyState icon={FileText} title="No bills found" message="Try adjusting your search or filters." />
        ) : (
          <>
            <Table>
              <Thead>
                <Tr>
                  <Th>Bill No.</Th>
                  <Th>Bill Type</Th>
                  <Th>Work Order</Th>
                  <Th>Vendor</Th>
                  <Th>Project</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pagedBills.map((r) => (
                  <Tr key={r.id} className="cursor-pointer" onClick={() => setViewBillId(r.id)}>
                    <Td className="font-bold text-primary">{r.billNo}</Td>
                    <Td>
                      {r.billType ? (
                        <NxBadge color="blue">{BILL_TYPE_CFG[r.billType]?.label || r.billType}</NxBadge>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </Td>
                    <Td>{r.workOrderNo || <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                    <Td>{r.vendorName || <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                    <Td>{r.projectName || <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                    <Td className="text-right font-bold">{fmt(netAfterAdvance(r))}</Td>
                    <Td><NxBadge color={BILL_STATUS_BADGE_COLOR[r.status] ?? "gray"}>{BILL_STATUS_LABEL[r.status] || r.status}</NxBadge></Td>
                    <Td>{r.billDate ? dayjs(r.billDate).format("DD MMM YYYY") : "—"}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>

            {totalPages > 1 && (
              <div className="mt-4">
                <Pagination page={page} totalPages={totalPages} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {viewBill && (
        <Modal
          extraWide
          title={viewBill.billNo}
          subtitle="Read-only — process this bill in Accounts Payment"
          onClose={() => setViewBillId(null)}
        >
          <Descriptions columns={2}>
            <DescItem label="Status"><NxBadge color={BILL_STATUS_BADGE_COLOR[viewBill.status] ?? "gray"}>{BILL_STATUS_LABEL[viewBill.status] || viewBill.status}</NxBadge></DescItem>
            <DescItem label="Bill Date">{viewBill.billDate ? dayjs(viewBill.billDate).format("DD MMM YYYY") : "—"}</DescItem>
            <DescItem label="Project">{viewBill.projectName || "—"}</DescItem>
            <DescItem label="Work Order">{viewBill.workOrderNo || "—"}</DescItem>
            <DescItem label="Vendor">{viewBill.vendorName || "—"}</DescItem>
            <DescItem label="Generated By">{viewBill.generatedBy || "—"}</DescItem>
          </Descriptions>

          <div className="border-t border-gray-200 dark:border-gray-700/40 my-4" />

          <div className="font-bold text-[13px] mb-2 text-[#1A1A2E] dark:text-[#F1F5F9]">Line Items</div>
          <div className="mb-4">
            <Table>
              <Thead>
                <Tr>
                  <Th>Description</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Rate</Th>
                  <Th className="text-right">Amount</Th>
                </Tr>
              </Thead>
              <Tbody>
                {(viewBill.lineItems || []).map((li, i) => (
                  <Tr key={i}>
                    <Td>{li.description}</Td>
                    <Td className="text-right">{li.billedQty} {li.unit}</Td>
                    <Td className="text-right">{fmtRate(li.rate)}</Td>
                    <Td className="text-right font-bold">{fmt(li.amount)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>

          <div className="font-bold text-[13px] mb-2 text-[#1A1A2E] dark:text-[#F1F5F9]">Financial Summary</div>
          <div className="font-mono text-[13px] border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-hidden">
            <div className="flex justify-between px-3.5 py-1.5 border-b border-gray-100 dark:border-gray-700/40">
              <span>Gross Amount</span><span>{fmt(viewBill.amount)}</span>
            </div>
            {(viewBill.retentionAmount ?? 0) > 0 && (
              <div className="flex justify-between px-3.5 py-1.5 border-b border-gray-100 dark:border-gray-700/40 text-amber-700 dark:text-amber-400">
                <span>− Hold / Retention{viewBill.retentionPercent ? ` (${viewBill.retentionPercent}%)` : ""}</span><span>{fmt(viewBill.retentionAmount || 0)}</span>
              </div>
            )}
            {(viewBill.advanceRecovery ?? 0) > 0 && (
              <div className="flex justify-between px-3.5 py-1.5 border-b border-gray-100 dark:border-gray-700/40 text-amber-700 dark:text-amber-400">
                <span>− Advance Recovery</span><span>{fmt(viewBill.advanceRecovery || 0)}</span>
              </div>
            )}
            <div className="flex justify-between px-3.5 py-1.5 border-b border-gray-100 dark:border-gray-700/40">
              <span>+ GST @ {viewBill.gstPercent}%</span>
              <span>{fmt(billFinancials({ gross: viewBill.amount, gstPercent: viewBill.gstPercent, retentionAmount: viewBill.retentionAmount ?? 0, advanceRecovery: viewBill.advanceRecovery ?? 0 }).gstAmount)}</span>
            </div>
            <div className="flex justify-between px-3.5 py-2.5 bg-primary/5 font-extrabold text-[15px] text-primary">
              <span>Net Payable</span><span>{fmt(netAfterAdvance(viewBill))}</span>
            </div>
          </div>

          {viewBill.remarks && (
            <>
              <div className="border-t border-gray-200 dark:border-gray-700/40 my-4" />
              <div className="text-gray-500 dark:text-gray-400 text-[13px]"><strong>Remarks:</strong> {viewBill.remarks}</div>
            </>
          )}
        </Modal>
      )}

      <NewBillDrawer
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(bill) => {
          setBills((prev) => [normalizeId(bill) as unknown as Bill, ...prev]);
        }}
      />
    </div>
  );
}
