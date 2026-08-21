import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { ClipboardList, CircleCheck, Search, UserCheck, ShieldCheck, Send, Wallet, ArrowRight } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import { SearchFilter, DropdownSelectFilter } from "../../ui/Filters";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import { SkeletonTable } from "../../ui/Skeleton";
import EmptyState from "../../ui/EmptyState";
import { selectableProjects } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";
import type { Contractor } from "../../types/VendorBilling";

// One row per bill (not per Work Order — a single WO can spawn many bills
// over its life, and each one has its own independent Verification/L1/L2/
// Payment progress) — reuses the same GET /bills + GET /work-orders data
// Accounts Payment and Billing already fetch, no new backend endpoint or
// Purchase-Order/GRN entity needed.

interface BillRow {
  id: string;
  billNo: string;
  workOrderNo?: string;
  workOrderId?: string;
  projectName?: string;
  vendorCode?: string;
  vendorName?: string;
  amount: number;
  gstPercent?: number;
  retentionAmount?: number;
  advanceRecovery?: number;
  status: string;
  billDate: string;
  verificationBy?: { name?: string } | null;
  verificationAt?: string;
  l1ApprovedBy?: { name?: string } | null;
  l1ApprovedAt?: string;
  l2ApprovedBy?: { name?: string } | null;
  l2ApprovedAt?: string;
  tmsSentAt?: string;
  paymentDate?: string;
  paidAmount?: number;
}

interface ProjectOpt { id: string; name: string; code: string; parentId?: string | null; }

const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const normalizeId = (obj: Record<string, unknown>) => ({ ...obj, id: (obj._id || obj.id)?.toString() || "" });

// The bill status's own bordered-outline StatusBadge look predates the
// Nexora badge palette (a fixed set of filled pills) — mapped locally here
// rather than editing the shared billStatus.ts constants, since other
// not-yet-migrated pages still read those raw hex colors too.
const STATUS_NX_COLOR: Record<string, NxBadgeColor> = {
  draft: "gray",
  "verify-done": "amber",
  "l1-approved": "cyan",
  approved: "blue",
  "sent-to-tms": "indigo",
  hold: "orange",
  paid: "green",
  rejected: "red",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Awaiting Verification",
  "verify-done": "Awaiting L1 AGM",
  "l1-approved": "Awaiting L2 Director",
  approved: "L2 Approved — Ready for TMS",
  "sent-to-tms": "Sent to TMS",
  hold: "On Hold",
  paid: "Paid",
  rejected: "Rejected",
};

const STAGE_ORDER = ["draft", "verify-done", "l1-approved", "approved", "sent-to-tms", "paid"];
function stageReached(status: string, stage: string): boolean {
  if (status === "hold" || status === "rejected") return false;
  return STAGE_ORDER.indexOf(status) >= STAGE_ORDER.indexOf(stage);
}

function StageCell({ done, who, at }: { done: boolean; who?: string; at?: string }) {
  if (!done) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  return (
    <div>
      <NxBadge color="green">
        <span className="inline-flex items-center gap-1"><CircleCheck className="w-3 h-3" /> Done</span>
      </NxBadge>
      {(who || at) && (
        <div className="text-[10px] text-gray-400 mt-1">
          {who || ""}{who && at ? " · " : ""}{at ? dayjs(at).format("DD MMM") : ""}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 10;

export default function ProcurementTracker() {
  const navigate = useNavigate();
  const [bills, setBills] = useState<BillRow[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    apiClient.get<{ bills: Record<string, unknown>[] }>("/bills")
      .then((r) => setBills((r.data.bills || []).map((b) => normalizeId(b) as unknown as BillRow)))
      .catch(() => {})
      .finally(() => setLoading(false));
    apiClient.get<{ projects: Record<string, unknown>[] }>("/projects")
      .then((r) => setProjects((r.data.projects || []).map((p) => normalizeId(p) as unknown as ProjectOpt)))
      .catch(() => {});
    apiClient.get<{ contractors: Record<string, unknown>[] }>("/contractors")
      .then((r) => setContractors((r.data.contractors || []).map((c) => normalizeId(c) as unknown as Contractor)))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return bills.filter((b) => {
      const matchSearch =
        !q ||
        (b.billNo || "").toLowerCase().includes(q) ||
        (b.workOrderNo || "").toLowerCase().includes(q) ||
        (b.vendorName || "").toLowerCase().includes(q) ||
        (b.projectName || "").toLowerCase().includes(q);
      const matchProject = !projectFilter || projects.find((p) => p.id === projectFilter)?.name === b.projectName;
      const matchVendor  = !vendorFilter || b.vendorCode === vendorFilter;
      const matchStatus  = !statusFilter || b.status === statusFilter;
      return matchSearch && matchProject && matchVendor && matchStatus;
    }).sort((a, b) => (b.billDate || "").localeCompare(a.billDate || ""));
  }, [bills, search, projectFilter, vendorFilter, statusFilter, projects]);

  const pager = usePagination(filtered, PAGE_SIZE);

  const stats = useMemo(() => ({
    total:       bills.length,
    verifying:   bills.filter((b) => b.status === "draft").length,
    l1:          bills.filter((b) => b.status === "verify-done").length,
    l2:          bills.filter((b) => b.status === "l1-approved").length,
    sentToTms:   bills.filter((b) => b.status === "sent-to-tms").length,
    paid:        bills.filter((b) => b.status === "paid").length,
    outstanding: bills.filter((b) => !["paid", "rejected"].includes(b.status)).reduce((s, b) => s + (b.amount || 0), 0),
  }), [bills]);

  const toggleStatus = (v: string) => setStatusFilter(statusFilter === v ? "" : v);

  return (
    <div>
      <PageHeader
        title="Procurement Tracker"
        subtitle="Track every bill's Verification → L1 AGM → L2 Director → TMS Payment lifecycle in one place"
        icon={ClipboardList}
        actions={<NxBtn color="secondary" label="Accounts Payment" onClick={() => navigate("/accounts-payment")} />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4 mb-5">
        <NxStatCard label="Total Bills" value={stats.total} icon={ClipboardList} />
        <NxStatCard label="Verifying" value={stats.verifying} icon={Search} active={statusFilter === "draft"} onClick={() => toggleStatus("draft")} />
        <NxStatCard label="Awaiting L1" value={stats.l1} icon={UserCheck} active={statusFilter === "verify-done"} onClick={() => toggleStatus("verify-done")} />
        <NxStatCard label="Awaiting L2" value={stats.l2} icon={ShieldCheck} active={statusFilter === "l1-approved"} onClick={() => toggleStatus("l1-approved")} />
        <NxStatCard label="Sent to TMS" value={stats.sentToTms} icon={Send} active={statusFilter === "sent-to-tms"} onClick={() => toggleStatus("sent-to-tms")} />
        <NxStatCard label="Outstanding" value={fmt(stats.outstanding)} icon={Wallet} />
      </div>

      <div className="bg-white/90 dark:bg-gray-800/95 backdrop-blur-xl border border-gray-100 dark:border-gray-700/50 rounded-xl shadow-sm p-5">
        <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
          <div className="flex gap-2.5 items-center flex-wrap">
            <SearchFilter value={search} onChange={setSearch} placeholder="Search bill no., PO, vendor, project…" />
            <DropdownSelectFilter
              value={projectFilter} onChange={setProjectFilter} placeholder="All Projects" resetValue=""
              options={selectableProjects(projects).map(p => ({ label: p.name, value: p.id }))}
            />
            <DropdownSelectFilter
              value={vendorFilter} onChange={setVendorFilter} placeholder="All Vendors" resetValue=""
              options={contractors.map(c => ({ label: `${vendorLabel(c.companyName, c.shortCode)} (${c.vendorCode})`, value: c.vendorCode }))}
            />
            <DropdownSelectFilter
              value={statusFilter} onChange={setStatusFilter} placeholder="All Statuses" resetValue=""
              options={["draft", "verify-done", "l1-approved", "approved", "sent-to-tms", "hold", "paid", "rejected"].map(s => ({ label: STATUS_LABEL[s], value: s }))}
            />
          </div>
        </div>

        {loading ? (
          <SkeletonTable rows={6} cols={9} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No bills match these filters" />
        ) : (
          <>
            <Table>
              <Thead>
                <Tr>
                  <Th>PO Number</Th>
                  <Th>Bill No</Th>
                  <Th>Vendor / Project</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Verification</Th>
                  <Th>L1</Th>
                  <Th>L2</Th>
                  <Th>Payment</Th>
                  <Th>Overall Status</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {pager.pageItems.map(r => (
                  <Tr key={r.id}>
                    <Td>{r.workOrderNo ? <span className="font-mono font-bold text-primary">{r.workOrderNo}</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                    <Td><TdText>{r.billNo}</TdText></Td>
                    <Td>
                      <div className="font-semibold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{r.vendorName || "—"}</div>
                      <div className="text-xs text-gray-400">{r.projectName || "—"}</div>
                    </Td>
                    <Td className="text-right"><span className="font-mono font-bold"><TdText>{fmt(r.amount)}</TdText></span></Td>
                    <Td><StageCell done={stageReached(r.status, "verify-done")} who={r.verificationBy?.name} at={r.verificationAt} /></Td>
                    <Td><StageCell done={stageReached(r.status, "l1-approved")} who={r.l1ApprovedBy?.name} at={r.l1ApprovedAt} /></Td>
                    <Td><StageCell done={stageReached(r.status, "approved")} who={r.l2ApprovedBy?.name} at={r.l2ApprovedAt} /></Td>
                    <Td>
                      {r.status === "paid" ? (
                        <StageCell done who={r.paidAmount != null ? fmt(r.paidAmount) : undefined} at={r.paymentDate} />
                      ) : r.status === "sent-to-tms" ? (
                        <NxBadge color="blue">Awaiting TMS</NxBadge>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </Td>
                    <Td><NxBadge color={STATUS_NX_COLOR[r.status] ?? "gray"}>{STATUS_LABEL[r.status] ?? r.status}</NxBadge></Td>
                    <Td>
                      <NxBtn color="secondary" icon={ArrowRight} label="Open" onClick={() => navigate("/accounts-payment")} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {pager.totalPages > 1 && <div className="mt-4"><Pagination page={pager.page} totalPages={pager.totalPages} onChange={pager.setPage} /></div>}
          </>
        )}
      </div>
    </div>
  );
}
