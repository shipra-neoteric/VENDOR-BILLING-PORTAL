import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Banknote } from "lucide-react";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Badge from "../../ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { Skeleton } from "../../ui/Skeleton";
import EmptyState from "../../ui/EmptyState";
import { SearchFilter } from "../../ui/Filters";
import { useExecutiveDashboard } from "../../features/dashboard/hooks/useExecutiveDashboard";
import { useState, useMemo } from "react";
import { fmtCr } from "../../features/dashboard/utils";

// Aging severity — same 0-30/31-60/61-90/90+ bands the dashboard's own
// Payment Aging widget already buckets by (see
// Backend/src/controllers/executiveDashboardController.js's AGING_BUCKETS).
function agingBadge(days: number): "gray" | "amber" | "red" {
  if (days > 60) return "red";
  if (days > 30) return "amber";
  return "gray";
}

// Full-page version of the "Payment Aging" concept — every certified-but-
// unpaid RunningBill (status 'approved'), which Payment Aging only shows as
// bucketed totals. This page lists them individually (already uncapped from
// `data.pendingPaymentBills`, no new backend endpoint needed), each row
// deep-linking straight into Accounts Payment's own bill drawer via the same
// ?bill=<id> param that page already reads (see its Slack deep-link effect).
export default function PendingPayments() {
  const [searchParams] = useSearchParams();
  const { data, loading, error, retry } = useExecutiveDashboard();
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const list = data?.pendingPaymentBills ?? [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(b =>
      b.billNo.toLowerCase().includes(q) ||
      b.projectName.toLowerCase().includes(q) ||
      b.vendorName.toLowerCase().includes(q) ||
      b.workOrderNo.toLowerCase().includes(q)
    );
  }, [data, search]);

  const backLinkSearch = searchParams.toString();

  return (
    <div className="pb-6">
      <PageHeader
        title="Pending Payments"
        subtitle="Certified bills still awaiting payment — click one to open it directly."
        icon={Banknote}
        actions={
          <Link to={{ pathname: "/dashboard", search: backLinkSearch }}>
            <Btn label="Back to Dashboard" icon={ArrowLeft} outline small />
          </Link>
        }
      />

      <div className="mb-4 max-w-sm">
        <SearchFilter value={search} onChange={setSearch} placeholder="Search by bill no, project, vendor…" />
      </div>

      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="font-bold text-gray-600 dark:text-gray-300 mb-1">Couldn't load pending payments</div>
          <div className="text-sm text-gray-400 mb-4 max-w-sm">{error.message}</div>
          <Btn label="Retry" color="primary" onClick={retry} />
        </div>
      ) : !data || data.pendingPaymentBills.length === 0 ? (
        <EmptyState title="Nothing awaiting payment" message="Every certified bill has been paid." />
      ) : rows.length === 0 ? (
        <EmptyState title="No bills match that search" message="Try a different bill number, project, or vendor." />
      ) : (
        <Table containerClassName="max-h-[70vh]">
          <Thead>
            <Tr>
              <Th className="w-[14%]">Bill No</Th>
              <Th className="w-[20%]">Project</Th>
              <Th className="w-[18%]">Vendor</Th>
              <Th className="w-[14%]">Work Order</Th>
              <Th className="w-[14%] text-right">Amount</Th>
              <Th className="w-[10%] text-right">Days Pending</Th>
              <Th className="w-[10%]"></Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map(b => (
              <Tr key={b.billId}>
                <Td className="font-bold text-[#172033] dark:text-[#F1F5F9]">{b.billNo}</Td>
                <Td className="truncate">{b.projectName}</Td>
                <Td className="truncate text-gray-500 dark:text-gray-400">{b.vendorName}</Td>
                <Td className="truncate text-gray-500 dark:text-gray-400">{b.workOrderNo}</Td>
                <Td className="text-right font-bold tabular-nums">{fmtCr(b.amount)}</Td>
                <Td className="text-right">
                  <Badge color={agingBadge(b.daysPending)} small>{b.daysPending}d</Badge>
                </Td>
                <Td className="text-right">
                  <Link to={`/accounts-payment?bill=${b.billId}`} className="text-xs font-semibold text-primary hover:underline">
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
