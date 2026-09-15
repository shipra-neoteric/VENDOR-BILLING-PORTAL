import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import Card from "../../../ui/Card";
import Badge from "../../../ui/Badge";
import EmptyState from "../../../ui/EmptyState";
import { SelectFilter } from "../../../ui/Filters";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../ui/Table";
import { fmtCr } from "../utils";
import type { ExecutiveDashboardContractorCategoryRow } from "../../../types/ExecutiveDashboard";

// green=Healthy, amber=Attention, blue=Pending, red=Critical — same badge
// color vocabulary already used for HEALTH_BADGE on the main table above.
const STATUS_BADGE: Record<ExecutiveDashboardContractorCategoryRow["status"], "green" | "amber" | "blue" | "red"> = {
  Healthy: "green", Attention: "amber", Pending: "blue", Critical: "red",
};

interface ContractorsByCategoryProps {
  contractorsByCategory: ExecutiveDashboardContractorCategoryRow[];
}

// A project picker replaces the earlier "View Matrix" shortcut — filters
// this card's own (already-fetched) rows by project name client-side, no
// extra request, so someone scanning this card can narrow it to one project
// without leaving the dashboard.
export default function ContractorsByCategory({ contractorsByCategory }: ContractorsByCategoryProps) {
  const [projectFilter, setProjectFilter] = useState("");

  const projectOptions = useMemo(() => {
    const names = [...new Set(contractorsByCategory.map(r => r.project).filter(Boolean))].sort();
    return names.map(name => ({ label: name, value: name }));
  }, [contractorsByCategory]);

  const rows = projectFilter
    ? contractorsByCategory.filter(r => r.project === projectFilter)
    : contractorsByCategory;

  return (
    <Card size="sm">
      <div className="flex items-center justify-between mb-2.5 gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#172033] dark:text-[#F1F5F9] shrink-0">
          <Users className="w-4 h-4 text-primary" />
          Contractors by Category
        </h3>
        {projectOptions.length > 0 && (
          <SelectFilter
            value={projectFilter}
            onChange={setProjectFilter}
            options={projectOptions}
            placeholder="All Projects"
          />
        )}
      </div>

      {contractorsByCategory.length === 0 ? (
        <EmptyState title="No contractor activity yet" message="Contractors will appear here once work orders are raised." />
      ) : rows.length === 0 ? (
        <EmptyState title="No contractors for this project" message="Try a different project or clear the filter." />
      ) : (
        <Table containerClassName="max-h-[360px] overflow-y-auto" className="min-w-[760px]">
          <Thead>
            <Tr>
              <Th className="w-[20%] truncate" dense>Contractor</Th>
              <Th className="w-[13%] truncate" dense>Category</Th>
              <Th className="w-[15%] truncate" dense>Project</Th>
              <Th className="w-[16%] text-right truncate" dense>Contract Value</Th>
              <Th className="w-[12%] text-right truncate" dense>Paid</Th>
              <Th className="w-[12%] text-right truncate" dense>Pending</Th>
              <Th className="w-[12%] truncate" dense>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((r, i) => (
              <Tr key={`${r.contractor}-${r.project}-${i}`}>
                <Td dense className="font-semibold text-[#172033] dark:text-[#F1F5F9] truncate" title={r.contractor}>{r.contractor}</Td>
                <Td dense className="text-xs text-gray-500 dark:text-gray-400 truncate" title={r.category}>{r.category}</Td>
                <Td dense className="text-xs text-gray-500 dark:text-gray-400 truncate" title={r.project}>{r.project}</Td>
                <Td dense className="text-right truncate">{fmtCr(r.contractValue)}</Td>
                <Td dense className="text-right text-emerald-600 dark:text-emerald-400 truncate">{fmtCr(r.paid)}</Td>
                <Td dense className="text-right truncate">{fmtCr(r.pending)}</Td>
                <Td dense className="truncate"><Badge color={STATUS_BADGE[r.status]} small>{r.status}</Badge></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Card>
  );
}
