import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, UserX } from "lucide-react";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Badge from "../../ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { Skeleton } from "../../ui/Skeleton";
import EmptyState from "../../ui/EmptyState";
import { SearchFilter } from "../../ui/Filters";
import { useExecutiveDashboard } from "../../features/dashboard/hooks/useExecutiveDashboard";
import { useState, useMemo } from "react";
import type { ExecutiveDashboardNoApprovalWorkOrder } from "../../types/ExecutiveDashboard";

// Same real approvalStatus vocabulary the 4-level WorkOrder chain uses (see
// Backend/src/models/WorkOrder.js) — matches
// features/dashboard/components/NoApprovalWorkOrders.tsx's own labels.
const STATUS_LABEL: Record<ExecutiveDashboardNoApprovalWorkOrder["status"], string> = {
  "draft": "Draft",
  "pending-checker": "Pending Checker",
  "pending-approver": "Pending Approver",
  "pending-final": "Pending Final",
  "sent-back": "Sent Back",
};
const STATUS_BADGE: Record<ExecutiveDashboardNoApprovalWorkOrder["status"], "gray" | "amber" | "red"> = {
  "draft": "gray",
  "pending-checker": "amber",
  "pending-approver": "amber",
  "pending-final": "amber",
  "sent-back": "red",
};

// Full-page version of the dashboard's "Work Orders — No Approvals" widget
// (features/dashboard/components/NoApprovalWorkOrders.tsx) — that widget
// already caps itself to 8/expand-to-all in a small card; this page is the
// same underlying `data.noApprovalWorkOrders` list (already uncapped, no new
// backend endpoint needed) with room to search/scroll a long list properly,
// and each row deep-links to the exact work order the same way the widget's
// rows already do.
export default function PendingWorkOrders() {
  const [searchParams] = useSearchParams();
  const { data, loading, error, retry } = useExecutiveDashboard();
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const list = data?.noApprovalWorkOrders ?? [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(wo =>
      wo.workOrderNo.toLowerCase().includes(q) ||
      wo.projectName.toLowerCase().includes(q) ||
      wo.category.toLowerCase().includes(q)
    );
  }, [data, search]);

  const backLinkSearch = searchParams.toString();

  return (
    <div className="pb-6">
      <PageHeader
        title="Pending Work Orders"
        subtitle="Work orders stuck in their approval chain — click one to open it directly."
        icon={UserX}
        actions={
          <Link to={{ pathname: "/dashboard", search: backLinkSearch }}>
            <Btn label="Back to Dashboard" icon={ArrowLeft} outline small />
          </Link>
        }
      />

      <div className="mb-4 max-w-sm">
        <SearchFilter value={search} onChange={setSearch} placeholder="Search by WO no, project, category…" />
      </div>

      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="font-bold text-gray-600 dark:text-gray-300 mb-1">Couldn't load pending work orders</div>
          <div className="text-sm text-gray-400 mb-4 max-w-sm">{error.message}</div>
          <Btn label="Retry" color="primary" onClick={retry} />
        </div>
      ) : !data || data.noApprovalWorkOrders.length === 0 ? (
        <EmptyState title="Nothing stuck in approval" message="Every work order has cleared its approval chain in good time." />
      ) : rows.length === 0 ? (
        <EmptyState title="No work orders match that search" message="Try a different WO number, project, or category." />
      ) : (
        <Table containerClassName="max-h-[70vh]">
          <Thead>
            <Tr>
              <Th className="w-[18%]">Work Order</Th>
              <Th className="w-[22%]">Project</Th>
              <Th className="w-[18%]">Category</Th>
              <Th className="w-[18%]">Status</Th>
              <Th className="w-[12%] text-right">Days Pending</Th>
              <Th className="w-[12%]"></Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map(wo => (
              <Tr key={wo.workOrderId}>
                <Td className="font-bold text-[#172033] dark:text-[#F1F5F9]">{wo.workOrderNo}</Td>
                <Td className="truncate">{wo.projectName}</Td>
                <Td className="truncate text-gray-500 dark:text-gray-400">{wo.category}</Td>
                <Td><Badge color={STATUS_BADGE[wo.status]} small>{STATUS_LABEL[wo.status]}</Badge></Td>
                <Td className="text-right font-bold text-red-600 dark:text-red-400">{wo.daysPending}d</Td>
                <Td className="text-right">
                  <Link to={`/work-items/${wo.workOrderId}?from=pending-work-orders`} className="text-xs font-semibold text-primary hover:underline">
                    Open →
                  </Link>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
