import { Award } from "lucide-react";
import Card from "../../../ui/Card";
import EmptyState from "../../../ui/EmptyState";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../ui/Table";
import { fmtCr } from "../utils";
import type { ExecutiveDashboardVendorScorecardRow } from "../../../types/ExecutiveDashboard";

export default function TopVendorsScorecard({ vendors }: { vendors: ExecutiveDashboardVendorScorecardRow[] }) {
  return (
    <Card size="sm">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#172033] dark:text-[#F1F5F9]">
          <Award className="w-4 h-4 text-primary" />
          Top Vendors (Scorecard)
        </h3>
      </div>

      {vendors.length === 0 ? (
        <EmptyState title="No vendor activity yet" message="Vendors will appear here once work orders are raised." />
      ) : (
        <Table containerClassName="max-h-[320px] overflow-y-auto">
          <Thead>
            <Tr>
              <Th dense>Vendor</Th>
              <Th dense className="text-right">Business Given</Th>
              <Th dense className="text-right">Avg Approval</Th>
              <Th dense className="text-right">Pending Dues</Th>
            </Tr>
          </Thead>
          <Tbody>
            {vendors.map((v, i) => (
              <Tr key={v.code} className={i % 2 === 1 ? "bg-gray-50/60 dark:bg-white/[0.02]" : ""}>
                <Td className="py-2 text-xs font-semibold text-[#172033] dark:text-[#F1F5F9] truncate max-w-[160px]" title={v.name}>
                  {v.name}
                </Td>
                <Td className="py-2 text-xs text-right tabular-nums">{fmtCr(v.businessGiven)}</Td>
                <Td className="py-2 text-xs text-right tabular-nums text-gray-500 dark:text-gray-400">
                  {v.avgApprovalDays !== null ? `${v.avgApprovalDays}d` : "–"}
                </Td>
                <Td className="py-2 text-xs text-right tabular-nums">
                  {v.pendingDues > 0 ? (
                    <span className="font-semibold text-amber-600 dark:text-amber-400">{fmtCr(v.pendingDues)}</span>
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600">{"₹"}0</span>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Card>
  );
}
