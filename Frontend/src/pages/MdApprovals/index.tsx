import { useEffect, useMemo, useState, useCallback } from "react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { ShieldCheck, Check, X, Undo2, Eye, Hourglass, CheckCircle2, AlertTriangle } from "lucide-react";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import PageHeader from "../../ui/PageHeader";
import NxBadge from "../../ui/nexora/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import Btn from "../../ui/Btn";
import NxBtn from "../../ui/nexora/Btn";
import Spinner from "../../ui/Spinner";
import EmptyState from "../../ui/EmptyState";
import ConfirmModal from "../../ui/ConfirmModal";
import Modal from "../../ui/Modal";
import Field from "../../ui/Field";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { SearchFilter, DropdownSelectFilter } from "../../ui/Filters";
import UISwitch from "../../ui/Switch";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import ReviewDrawer from "./ReviewDrawer";
import { SYSTEM_LABEL } from "./types";
import type { MdApprovalRow, MdSystem, MdTab } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Same "pending for >1 day" convention as BillRequests/index.tsx's own
// isOverdue()/OVERDUE_MS — reused here rather than inventing a new threshold.
const OVERDUE_MS = 24 * 60 * 60 * 1000;
function isOverdue(row: MdApprovalRow): boolean {
  if (!row.pendingSince) return false;
  return Date.now() - new Date(row.pendingSince).getTime() > OVERDUE_MS;
}

// Same "does this user hold any of the 3 relevant final-stage permissions"
// check the backend guard uses — mirrors BillRequests/index.tsx's own
// hasAnyBillRequestsAccess convention: Owner keeps its app-wide bypass, and
// this page/nav item is otherwise gated purely on explicit permission grants.
function hasAnyMdApprovalsAccess(user: ReturnType<typeof useAuth>["user"]): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  const perms = user.permissions ?? [];
  return perms.some((p) =>
    (p.module === "work-orders" && p.actions.includes("ceo-approve")) ||
    (p.module === "bill-requests" && p.actions.includes("l4-approve")) ||
    (p.module === "accounts-payment" && p.actions.includes("l2-director-approve"))
  );
}

// Endpoint map per row.system — every action from this screen goes through
// the real, unmodified per-system route, never a new aggregator-side one.
// BillRequest/RunningBill-Manual resolve their approve path per-row (see
// approveEndpointFor below) since which stage actually finalizes a given
// document depends on its department's configured approval-level count
// (gm/l3/l4 can each be "the final stage" — see mdApprovalsController.js's
// finalStageFor) — the entries below are just the reject endpoint (same
// regardless of stage) plus a placeholder approve path never used directly.
const ACTION_ENDPOINTS: Record<MdSystem, { approve: { method: "put" | "patch"; path: (id: string) => string }; reject: { method: "put" | "patch"; path: (id: string) => string; bodyKey: "reason" | "rejectReason" }; sendBack?: { method: "put" | "patch"; path: (id: string) => string } }> = {
  WorkOrder: {
    approve: { method: "patch", path: (id) => `/work-orders/${id}/final-approve` },
    reject:  { method: "patch", path: (id) => `/work-orders/${id}/send-back`, bodyKey: "reason" },
    sendBack: { method: "patch", path: (id) => `/work-orders/${id}/send-back` },
  },
  BillRequest: {
    approve: { method: "put", path: (id) => `/bill-requests/${id}/l4-approve` },
    reject:  { method: "put", path: (id) => `/bill-requests/${id}/reject`, bodyKey: "rejectReason" },
  },
  "RunningBill-Manual": {
    approve: { method: "patch", path: (id) => `/bills/${id}/manual-l4-approve` },
    reject:  { method: "patch", path: (id) => `/bills/${id}/manual-reject`, bodyKey: "reason" },
  },
  "RunningBill-Accounts": {
    approve: { method: "patch", path: (id) => `/bills/${id}/l2-director-approve` },
    reject:  { method: "patch", path: (id) => `/bills/${id}/reject`, bodyKey: "reason" },
  },
};

// Resolves the real approve/reject endpoint for a BillRequest/RunningBill-
// Manual row using its finalStage (gm/l3/l4) — falls back to l4 if
// finalStage is somehow missing (shouldn't happen for a pending row, only
// possible on already-decided rows where no action is offered anyway).
function stageApproveEndpoint(row: MdApprovalRow): { method: "put" | "patch"; path: string } {
  const stage = row.finalStage ?? "l4";
  if (row.system === "BillRequest") return { method: "put", path: `/bill-requests/${row.id}/${stage}-approve` };
  return { method: "patch", path: `/bills/${row.id}/manual-${stage}-approve` };
}

// The 3 explicit "quick filter" system buttons the user asked for, plus an
// "All Systems" default. RunningBill-Manual (Manual Bills) has no button of
// its own — it's folded into the "Bill Requests" group since it's the same
// underlying flow (a bill raised without a Work Order), not a distinct
// system in the way WorkOrder/Accounts-Payment are. This replaces the old
// module DropdownSelectFilter outright (same job, one control instead of two).
const SYSTEM_GROUPS: { key: string; label: string; systems: MdSystem[] }[] = [
  { key: "all", label: "All Systems", systems: [] },
  { key: "BillRequest", label: "Bill Requests", systems: ["BillRequest", "RunningBill-Manual"] },
  { key: "WorkOrder", label: "Work Orders", systems: ["WorkOrder"] },
  { key: "RunningBill-Accounts", label: "Accounts Payment", systems: ["RunningBill-Accounts"] },
];

export default function MdApprovals() {
  const { user } = useAuth();
  const [tab, setTab] = useState<MdTab>("pending");
  const [items, setItems] = useState<MdApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [systemGroupKey, setSystemGroupKey] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);

  // Stat-tile data — honestly derived from the same, unmodified /md/approvals
  // endpoint, fetched for the "pending" and "approved" tabs regardless of
  // which tab is currently on screen, purely to feed the top tile row.
  const [tileStats, setTileStats] = useState({
    pendingCount: 0,
    pendingAmount: 0,
    overdueCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
  });

  const loadTileStats = useCallback(() => {
    Promise.all([
      apiClient.get<{ items: MdApprovalRow[] }>("/md/approvals", { params: { tab: "pending" } }),
      apiClient.get<{ items: MdApprovalRow[] }>("/md/approvals", { params: { tab: "approved" } }),
      apiClient.get<{ items: MdApprovalRow[] }>("/md/approvals", { params: { tab: "rejected" } }),
    ])
      .then(([p, a, r]) => {
        const pendingItems = p.data.items ?? [];
        const approvedItems = a.data.items ?? [];
        const rejectedItems = r.data.items ?? [];
        setTileStats({
          pendingCount: pendingItems.length,
          pendingAmount: pendingItems.reduce((s, r) => s + (r.amount || 0), 0),
          overdueCount: pendingItems.filter(isOverdue).length,
          approvedCount: approvedItems.length,
          rejectedCount: rejectedItems.length,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadTileStats(); }, [loadTileStats]);

  const [reviewRow, setReviewRow] = useState<MdApprovalRow | null>(null);
  const [approveTarget, setApproveTarget] = useState<MdApprovalRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<MdApprovalRow | null>(null);
  const [sendBackTarget, setSendBackTarget] = useState<MdApprovalRow | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const backendTab = tab === "aging" ? "pending" : tab;
    apiClient.get<{ items: MdApprovalRow[] }>("/md/approvals", { params: { tab: backendTab } })
      .then((res) => setItems(res.data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const hasAccess = hasAnyMdApprovalsAccess(user);

  // Per system-group counts for the pill row below — counted off the
  // currently active tab's own items (before the other filters/search
  // narrow them further), same "count regardless of other filters" idea as
  // the Pending L1-L4 tab badges on BillRequests/index.tsx.
  const systemGroupCounts = useMemo(() => {
    const base = tab === "aging" ? items.filter(isOverdue) : items;
    const counts: Record<string, number> = {};
    for (const g of SYSTEM_GROUPS) {
      counts[g.key] = g.key === "all" ? base.length : base.filter((r) => g.systems.includes(r.system)).length;
    }
    return counts;
  }, [items, tab]);

  const deptOptions = useMemo(
    () => Array.from(new Set(items.map((r) => r.department).filter((d): d is string => !!d))).map((d) => ({ value: d, label: d })),
    [items]
  );
  const projectOptions = useMemo(
    () => Array.from(new Set(items.map((r) => r.projectName).filter((p): p is string => !!p))).map((p) => ({ value: p, label: p })),
    [items]
  );
  const filtered = useMemo(() => {
    let list = items;
    if (tab === "aging") list = list.filter(isOverdue);
    if (!showArchived) list = list.filter((r) => !r.isArchived);
    if (systemGroupKey !== "all") {
      const group = SYSTEM_GROUPS.find((g) => g.key === systemGroupKey);
      if (group) list = list.filter((r) => group.systems.includes(r.system));
    }
    if (deptFilter !== "all") list = list.filter((r) => r.department === deptFilter);
    if (projectFilter !== "all") list = list.filter((r) => r.projectName === projectFilter);
    if (search.trim()) {
      // Matches on every field name shown in the table — reference no.,
      // requester, department, approval type, system label, and amount —
      // not just requester/reference, so a search for e.g. "Accounts" or
      // "82000" finds rows by department/amount too, same breadth as the
      // multi-field search already used on BillRequests/index.tsx.
      const q = search.trim().toLowerCase();
      list = list.filter((r) =>
        (r.requester || "").toLowerCase().includes(q) ||
        (r.referenceNumber || "").toLowerCase().includes(q) ||
        (r.workOrderNo || "").toLowerCase().includes(q) ||
        (r.projectName || "").toLowerCase().includes(q) ||
        (r.vendorName || "").toLowerCase().includes(q) ||
        (r.department || "").toLowerCase().includes(q) ||
        (r.approvalType || "").toLowerCase().includes(q) ||
        SYSTEM_LABEL[r.system].toLowerCase().includes(q) ||
        String(r.amount ?? "").includes(q)
      );
    }
    list = list.filter((r) => inDateRange(r.submittedAt, dateFrom, dateTo));
    if (tab === "aging") list = [...list].sort((a, b) => (b.daysPending ?? 0) - (a.daysPending ?? 0));
    return list;
  }, [items, tab, systemGroupKey, deptFilter, projectFilter, showArchived, search, dateFrom, dateTo]);

  if (!hasAccess) return null;

  const hasActiveFilters =
    search !== "" || systemGroupKey !== "all" || deptFilter !== "all" || projectFilter !== "all" ||
    showArchived || !!dateFrom || !!dateTo;

  const clearAllFilters = () => {
    setSearch("");
    setSystemGroupKey("all");
    setDeptFilter("all");
    setProjectFilter("all");
    setShowArchived(false);
    setDateFrom(null);
    setDateTo(null);
  };

  const refetchAndClose = () => {
    setApproveTarget(null);
    setRejectTarget(null);
    setSendBackTarget(null);
    setReviewRow(null);
    setReason("");
    load();
    loadTileStats();
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    setSaving(true);
    try {
      const { method, path } = approveTarget.system === "BillRequest" || approveTarget.system === "RunningBill-Manual"
        ? stageApproveEndpoint(approveTarget)
        : { method: ACTION_ENDPOINTS[approveTarget.system].approve.method, path: ACTION_ENDPOINTS[approveTarget.system].approve.path(approveTarget.id) };
      const res = await apiClient[method](path, { remarks: "" });
      toast.success(res.data?.message || "Approved");
      refetchAndClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to approve");
    } finally { setSaving(false); }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setSaving(true);
    try {
      const { method, path, bodyKey } = ACTION_ENDPOINTS[rejectTarget.system].reject;
      await apiClient[method](path(rejectTarget.id), { [bodyKey]: reason });
      toast.success("Rejected");
      refetchAndClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to reject");
    } finally { setSaving(false); }
  };

  const handleSendBack = async () => {
    if (!sendBackTarget) return;
    const cfg = ACTION_ENDPOINTS[sendBackTarget.system].sendBack;
    if (!cfg) return;
    setSaving(true);
    try {
      await apiClient[cfg.method](cfg.path(sendBackTarget.id), { reason });
      toast.success("Sent back");
      refetchAndClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to send back");
    } finally { setSaving(false); }
  };

  const isDecidedTab = tab === "approved" || tab === "rejected";

  const actionButtons = (row: MdApprovalRow) => (
    <div className="flex items-center gap-1.5">
      <NxBtn color="icon-blue" title="Review" icon={Eye} onClick={() => setReviewRow(row)} />
      {!isDecidedTab && (
        <>
          <NxBtn color="icon-green" title="Approve" icon={Check} onClick={() => setApproveTarget(row)} />
          <NxBtn color="icon-red" title="Reject" icon={X} onClick={() => setRejectTarget(row)} />
          {row.system === "WorkOrder" && (
            <NxBtn color="icon-gray" title="Send Back" icon={Undo2} onClick={() => setSendBackTarget(row)} />
          )}
        </>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Final Approval"
        subtitle="One centralized queue for every approval that requires Final Approval, across Work Orders, Bill Requests and Bills."
        icon={ShieldCheck}
      />

      {/* Stat tiles — every number here is real, traced to a fetched value:
          pendingCount/pendingAmount/overdueCount come from a fresh fetch of
          tab=pending (independent of whichever tab is on screen), approvedCount
          from tab=approved, rejectedCount from tab=rejected. No "Due Today"/
          "On Hold" tiles — this system has no SLA/hold concept at this stage.
          These tiles ARE the tab navigation (click to switch) — no separate
          tabs row, since that would just duplicate the same 4-way switch. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <NxStatCard
          label="Pending My Approval"
          value={<>{tileStats.pendingCount}<span className="block text-xs font-normal text-gray-500 mt-0.5">{fmt(tileStats.pendingAmount)}</span></>}
          icon={Hourglass}
          active={tab === "pending"}
          onClick={() => setTab("pending")}
        />
        <NxStatCard
          label="Overdue (24h+)"
          value={tileStats.overdueCount}
          icon={AlertTriangle}
          active={tab === "aging"}
          onClick={() => setTab("aging")}
        />
        <NxStatCard
          label="Approved"
          value={tileStats.approvedCount}
          icon={CheckCircle2}
          active={tab === "approved"}
          onClick={() => setTab("approved")}
        />
        <NxStatCard
          label="Rejected"
          value={tileStats.rejectedCount}
          icon={X}
          active={tab === "rejected"}
          onClick={() => setTab("rejected")}
        />
      </div>

      {/* Entire list surface — system pills, filters and the table itself —
          in one glass-panel shell, matching the app's own convention (see
          WorkItems/index.tsx's identical wrapper). */}
      <div className="bg-white/90 dark:bg-gray-800/95 backdrop-blur-xl border border-gray-100 dark:border-gray-700/50 rounded-xl shadow-sm p-5">
        {/* 3 system quick-filter buttons (+ All Systems) — the main ask.
            Replaces the old module dropdown so there's a single control for
            "which system", not two doing the same job. */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {SYSTEM_GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setSystemGroupKey(g.key)}
              className={`px-5 py-3 rounded-xl text-base font-bold border-2 shadow-sm transition-colors ${
                systemGroupKey === g.key
                  ? "bg-primary text-white border-primary shadow-md"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700 hover:border-primary"
              }`}
            >
              {g.label}
              <span className={`ml-1.5 ${systemGroupKey === g.key ? "opacity-90" : "opacity-60"}`}>
                {systemGroupCounts[g.key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Filters — same bordered-card + single-row layout as
            WorkItems/index.tsx's own filter box. */}
        <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
          <div className="flex gap-2.5 items-center flex-wrap">
            <SearchFilter value={search} onChange={setSearch} placeholder="Search by reference, requester, department…" />
            <DropdownSelectFilter value={projectFilter} onChange={setProjectFilter} options={projectOptions} placeholder="All projects" resetValue="all" />
            <DropdownSelectFilter value={deptFilter} onChange={setDeptFilter} options={deptOptions} placeholder="All departments" resetValue="all" />
            <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
            {/* Fixed width wrapper — "Archived" and "Show Archived" are
                different lengths, so without a fixed width toggling this
                switch shrank/grew the row and reflowed every other field. */}
            <div className="w-[124px] shrink-0">
              <UISwitch checked={showArchived} onChange={setShowArchived} onLabel="Archived" offLabel="Show Archived" />
            </div>
            {hasActiveFilters && <Btn small outline label="Clear all" onClick={clearAllFilters} />}
            <span className="ml-auto text-gray-400 text-xs whitespace-nowrap">
              {filtered.length} item{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner size="large" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={tab === "pending" ? "Nothing pending your approval" : tab === "aging" ? "Nothing overdue" : `No ${tab} items`}
            message={tab === "pending" ? "You're all caught up — nothing across any approval chain needs you right now." : "Nothing matches this view right now."}
          />
        ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>System</Th>
              <Th>Reference</Th>
              <Th>Work Order</Th>
              <Th>Project</Th>
              <Th>Vendor</Th>
              <Th>Department</Th>
              <Th>Amount</Th>
              <Th>{isDecidedTab ? "Decided / Days to Decide" : "Pending Since"}</Th>
              <Th>Action</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map((row) => (
              <Tr
                key={`${row.system}-${row.id}`}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60"
                onClick={() => setReviewRow(row)}
              >
                <Td><NxBadge color="indigo">{SYSTEM_LABEL[row.system]}</NxBadge></Td>
                <Td className="font-bold">{row.referenceNumber || "—"}</Td>
                <Td>{row.workOrderNo || "—"}</Td>
                <Td>{row.projectName || "—"}</Td>
                <Td>{row.vendorName || "—"}</Td>
                <Td>{row.department || "—"}</Td>
                <Td className="font-mono">{fmt(row.amount)}</Td>
                <Td>
                  {isDecidedTab ? (
                    <div>
                      <div>{row.decidedAt ? dayjs(row.decidedAt).format("DD MMM YYYY") : "—"}</div>
                      <div className="text-xs text-gray-400">{row.daysToDecide ?? 0}d to decide · {row.decidedBy || "—"}</div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>{row.daysPending ?? 0} days</span>
                      {isOverdue(row) && <NxBadge color="red">Overdue</NxBadge>}
                    </div>
                  )}
                </Td>
                <Td onClick={(e) => e.stopPropagation()}>{actionButtons(row)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        )}
      </div>

      {reviewRow && (
        <ReviewDrawer
          row={reviewRow}
          onClose={() => setReviewRow(null)}
          footer={
            !isDecidedTab ? (
              <div className="flex justify-end gap-2">
                {reviewRow.system === "WorkOrder" && (
                  <Btn outline icon={Undo2} label="Send Back" onClick={() => { setSendBackTarget(reviewRow); setReviewRow(null); }} />
                )}
                <Btn color="red" icon={X} label="Reject" onClick={() => { setRejectTarget(reviewRow); setReviewRow(null); }} />
                <Btn color="green" icon={Check} label="Approve" onClick={() => { setApproveTarget(reviewRow); setReviewRow(null); }} />
              </div>
            ) : undefined
          }
        />
      )}

      {approveTarget && (
        <ConfirmModal
          title="Approve"
          message={`Approve ${approveTarget.referenceNumber || "this item"}? This is the final approval stage for this ${approveTarget.approvalType}.`}
          confirmLabel="Approve"
          loading={saving}
          onConfirm={handleApprove}
          onCancel={() => setApproveTarget(null)}
        />
      )}

      {rejectTarget && (
        <Modal onClose={() => { setRejectTarget(null); setReason(""); }} title="Reject">
          <div className="p-4 space-y-3">
            <Field textarea rows={3} placeholder="Reason for rejection…" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Btn label="Cancel" outline onClick={() => { setRejectTarget(null); setReason(""); }} disabled={saving} />
              <Btn label="Confirm Reject" color="red" loading={saving} disabled={!reason.trim()} onClick={handleReject} />
            </div>
          </div>
        </Modal>
      )}

      {sendBackTarget && (
        <Modal onClose={() => { setSendBackTarget(null); setReason(""); }} title="Send Back">
          <div className="p-4 space-y-3">
            <Field textarea rows={3} placeholder="Explain what needs to be corrected…" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Btn label="Cancel" outline onClick={() => { setSendBackTarget(null); setReason(""); }} disabled={saving} />
              <Btn label="Confirm Send Back" color="red" loading={saving} disabled={!reason.trim()} onClick={handleSendBack} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
