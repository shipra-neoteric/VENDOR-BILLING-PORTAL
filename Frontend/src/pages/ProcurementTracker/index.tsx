import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { ClipboardList, CircleCheck } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import KPICard from "../../ui/KPICard";
import Badge from "../../ui/Badge";
import StatusBadge from "../../ui/StatusBadge";
import { FilterRow, SearchFilter, SelectFilter } from "../../ui/Filters";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import Pagination from "../../ui/Pagination";
import { SkeletonTable } from "../../ui/Skeleton";
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

const fmt = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const normalizeId = (obj: Record<string, unknown>) => ({ ...obj, id: (obj._id || obj.id)?.toString() || "" });

const STAGE_ORDER = ["draft", "verify-done", "l1-approved", "approved", "sent-to-tms", "paid"];
function stageReached(status: string, stage: string): boolean {
  if (status === "hold" || status === "rejected") return false;
  return STAGE_ORDER.indexOf(status) >= STAGE_ORDER.indexOf(stage);
}

function StageCell({ done, who, at }: { done: boolean; who?: string; at?: string }) {
  if (!done) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  return (
    <div>
      <Badge color="green" small>
        <CircleCheck className="w-3 h-3 mr-1" /> Done
      </Badge>
      {(who || at) && (
        <div className="text-[10px] text-gray-400 mt-1">
          {who || ""}{who && at ? " · " : ""}{at ? dayjs(at).format("DD MMM") : ""}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 20;

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
  const [page, setPage] = useState(1);

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

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  const stats = useMemo(() => ({
    total:       bills.length,
    verifying:   bills.filter((b) => b.status === "draft").length,
    l1:          bills.filter((b) => b.status === "verify-done").length,
    l2:          bills.filter((b) => b.status === "l1-approved").length,
    sentToTms:   bills.filter((b) => b.status === "sent-to-tms").length,
    paid:        bills.filter((b) => b.status === "paid").length,
    outstanding: bills.filter((b) => !["paid", "rejected"].includes(b.status)).reduce((s, b) => s + (b.amount || 0), 0),
  }), [bills]);

  return (
    <div>
      <PageHeader
        title="Procurement Tracker"
        subtitle="Track every bill's Verification → L1 AGM → L2 Director → TMS Payment lifecycle in one place"
        icon={ClipboardList}
        actions={<Btn label="Accounts Payment" outline onClick={() => navigate("/accounts-payment")} />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-5">
        <KPICard label="Total Bills" value={stats.total} accent="#6B7280" />
        <KPICard label="Verifying" value={stats.verifying} accent="#FF7A00" />
        <KPICard label="Awaiting L1" value={stats.l1} accent="#0891b2" />
        <KPICard label="Awaiting L2" value={stats.l2} accent="#7C3AED" />
        <KPICard label="Sent to TMS" value={stats.sentToTms} accent="#1D4ED8" />
        <KPICard label="Outstanding" value={fmt(stats.outstanding)} accent="#DC2626" />
      </div>

      <FilterRow>
        <SearchFilter value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search bill no., PO, vendor, project…" />
        <SelectFilter
          value={projectFilter}
          onChange={v => { setProjectFilter(v); setPage(1); }}
          placeholder="All Projects"
          options={selectableProjects(projects).map(p => ({ label: p.name, value: p.id }))}
        />
        <SelectFilter
          value={vendorFilter}
          onChange={v => { setVendorFilter(v); setPage(1); }}
          placeholder="All Vendors"
          options={contractors.map(c => ({ label: `${vendorLabel(c.companyName, c.shortCode)} (${c.vendorCode})`, value: c.vendorCode }))}
        />
        <SelectFilter
          value={statusFilter}
          onChange={v => { setStatusFilter(v); setPage(1); }}
          placeholder="All Statuses"
          options={["draft", "verify-done", "l1-approved", "approved", "sent-to-tms", "hold", "paid", "rejected"].map(s => ({ label: s, value: s }))}
        />
      </FilterRow>

      {loading ? (
        <SkeletonTable rows={6} cols={9} />
      ) : (
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
            {paged.length === 0 && (
              <Tr><Td colSpan={10}><div className="text-center text-gray-400 py-8">No bills match these filters</div></Td></Tr>
            )}
            {paged.map(r => (
              <Tr key={r.id}>
                <Td>{r.workOrderNo ? <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{r.workOrderNo}</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}</Td>
                <Td><span className="font-mono"><TdText>{r.billNo}</TdText></span></Td>
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
                    <Badge color="blue" small>Awaiting TMS</Badge>
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600">—</span>
                  )}
                </Td>
                <Td><StatusBadge status={r.status} /></Td>
                <Td>
                  <Btn small outline label="Open →" onClick={() => navigate("/accounts-payment")} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-gray-400">{filtered.length} bills</span>
          <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
