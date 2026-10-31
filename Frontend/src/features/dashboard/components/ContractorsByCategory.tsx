import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import Modal from "../../../ui/Modal";
import Btn from "../../../ui/Btn";
import Card from "../../../ui/Card";
import Badge from "../../../ui/Badge";
import EmptyState from "../../../ui/EmptyState";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../../ui/Table";
import { fmtCr } from "../utils";
import type { ExecutiveDashboardContractorCategoryRow } from "../../../types/ExecutiveDashboard";

type Status = ExecutiveDashboardContractorCategoryRow["status"];

// green=Healthy, amber=Attention, blue=Pending, red=Critical — same badge
// color vocabulary already used for HEALTH_BADGE on the main table above.
const STATUS_BADGE: Record<Status, "green" | "amber" | "blue" | "red"> = {
  Healthy: "green", Attention: "amber", Pending: "blue", Critical: "red",
};
// When several work orders collapse into one row, it shows the worst of their statuses.
const STATUS_SEVERITY: Record<Status, number> = { Healthy: 0, Pending: 1, Attention: 2, Critical: 3 };

interface ContractorsByCategoryProps {
  contractorsByCategory: ExecutiveDashboardContractorCategoryRow[];
}

// Members of one Vendor Group are one party: the group is shown (once), never its individual vendors.
const partyKey = (r: ExecutiveDashboardContractorCategoryRow) => r.vendorGroupId || r.contractorCode || r.contractor;
const partyName = (r: ExecutiveDashboardContractorCategoryRow) => r.vendorGroupName || r.contractor;

interface MergedRow {
  party: string;        // partyKey — one table row, and what the detail drawer opens
  contractor: string;
  categories: string[];
  sites: number;
  workOrders: number;
  contractValue: number;
  paid: number;
  pending: number;
  status: Status;
}

// One row per contractor (a Vendor Group counts as one) across every site and category; the
// per-site / per-work-order breakdown is in the drawer a row opens.
export default function ContractorsByCategory({ contractorsByCategory }: ContractorsByCategoryProps) {
  const navigate = useNavigate();
  // Row click opens that party across every site (not just the clicked row's project).
  const [openParty, setOpenParty] = useState<string | null>(null);

  // One row per vendor group or vendor — all their work orders, sites and categories rolled together.
  const rows = useMemo(() => {
    const map = new Map<string, MergedRow & { siteSet: Set<string> }>();
    for (const r of contractorsByCategory) {
      const key = partyKey(r);
      const m = map.get(key) ?? {
        party: key, contractor: partyName(r), categories: [], sites: 0, workOrders: 0, contractValue: 0, paid: 0, pending: 0, status: r.status, siteSet: new Set<string>(),
      };
      m.workOrders += 1;
      m.contractValue += r.contractValue; m.paid += r.paid; m.pending += r.pending;
      if (r.category && !m.categories.includes(r.category)) m.categories.push(r.category);
      m.siteSet.add(r.projectId || r.project);
      m.sites = m.siteSet.size;
      if (STATUS_SEVERITY[r.status] > STATUS_SEVERITY[m.status]) m.status = r.status;
      map.set(key, m);
    }
    return [...map.values()].sort((a, b) => b.contractValue - a.contractValue);
  }, [contractorsByCategory]);

  const detail = useMemo(() => {
    if (!openParty) return null;
    const wos = contractorsByCategory.filter(r => partyKey(r) === openParty);
    if (wos.length === 0) return null;
    const isGroup = !!wos[0].vendorGroupId;
    const vendors = new Set(wos.map(r => r.contractorCode || r.contractor));
    const sites = new Map<string, { project: string; projectId?: string; woCount: number; contract: number; paid: number; pending: number }>();
    for (const r of wos) {
      const k = r.projectId || r.project;
      const s = sites.get(k) ?? { project: r.project, projectId: r.projectId, woCount: 0, contract: 0, paid: 0, pending: 0 };
      s.woCount += 1; s.contract += r.contractValue; s.paid += r.paid; s.pending += r.pending;
      sites.set(k, s);
    }
    return {
      name: partyName(wos[0]), isGroup,
      code: isGroup ? `Vendor group · ${vendors.size} vendor${vendors.size !== 1 ? "s" : ""}` : (wos[0].contractorCode || "—"),
      vendorCode: isGroup ? undefined : wos[0].contractorCode,
      wos, sites: [...sites.values()].sort((a, b) => b.contract - a.contract),
      contract: wos.reduce((t, r) => t + r.contractValue, 0), paid: wos.reduce((t, r) => t + r.paid, 0), pending: wos.reduce((t, r) => t + r.pending, 0),
    };
  }, [openParty, contractorsByCategory]);

  return (
    <Card size="sm">
      <div className="flex items-center justify-between mb-2.5 gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#172033] dark:text-[#F1F5F9] shrink-0">
          <Users className="w-4 h-4 text-primary" />
          Contractors by Category
        </h3>
      </div>

      {contractorsByCategory.length === 0 ? (
        <EmptyState title="No contractor activity yet" message="Contractors will appear here once work orders are raised." />
      ) : (
        <Table containerClassName="max-h-[360px] overflow-y-auto" className="min-w-[760px]">
          <Thead>
            <Tr>
              <Th className="w-[22%] truncate" dense>Contractor</Th>
              <Th className="w-[16%] truncate" dense>Category</Th>
              <Th className="w-[7%] text-right truncate" dense>Sites</Th>
              <Th className="w-[9%] text-right truncate" dense>Work Orders</Th>
              <Th className="w-[14%] text-right truncate" dense>Contract Value</Th>
              <Th className="w-[11%] text-right truncate" dense>Paid</Th>
              <Th className="w-[11%] text-right truncate" dense>Pending</Th>
              <Th className="w-[10%] truncate" dense>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map(r => (
              <Tr
                key={r.party}
                className="cursor-pointer"
                title="Click to see this contractor's work orders, value and sites"
                onClick={() => setOpenParty(r.party)}
              >
                <Td dense className="font-semibold text-[#172033] dark:text-[#F1F5F9] truncate" title={r.contractor}>{r.contractor}</Td>
                <Td dense className="text-xs text-gray-500 dark:text-gray-400 truncate" title={r.categories.join(", ")}>{r.categories.join(", ")}</Td>
                <Td dense className="text-right">{r.sites}</Td>
                <Td dense className="text-right">{r.workOrders}</Td>
                <Td dense className="text-right truncate">{fmtCr(r.contractValue)}</Td>
                <Td dense className="text-right text-emerald-600 dark:text-emerald-400 truncate">{fmtCr(r.paid)}</Td>
                <Td dense className="text-right truncate">{fmtCr(r.pending)}</Td>
                <Td dense className="truncate"><Badge color={STATUS_BADGE[r.status]} small>{r.status}</Badge></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {detail && (
        <Modal
          icon={Users}
          title={detail.name}
          extraWide
          onClose={() => setOpenParty(null)}
          footer={<div className="flex justify-end"><Btn outline label="Close" onClick={() => setOpenParty(null)} /></div>}
        >
          <div className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 -mt-1 mb-3.5">{detail.code}</div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-5">
            {[
              ["Work orders", String(detail.wos.length)],
              ["Sites", String(detail.sites.length)],
              ["Contract value", fmtCr(detail.contract)],
              ["Paid", fmtCr(detail.paid)],
              ["Pending", fmtCr(detail.pending)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-gray-200 dark:border-gray-700/40 px-3 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
                <div className="text-base font-semibold text-[#172033] dark:text-[#F1F5F9] mt-0.5">{value}</div>
              </div>
            ))}
          </div>

          <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">By site</div>
          <Table className="mb-5 min-w-[560px]">
            <Thead>
              <Tr><Th dense>Site</Th><Th dense className="text-right">Work orders</Th><Th dense className="text-right">Contract value</Th><Th dense className="text-right">Paid</Th><Th dense className="text-right">Pending</Th></Tr>
            </Thead>
            <Tbody>
              {detail.sites.map(s => (
                <Tr key={s.projectId || s.project} className={s.projectId ? "cursor-pointer" : undefined} onClick={() => s.projectId && navigate(`/projects?id=${s.projectId}${detail.vendorCode ? `&vendor=${encodeURIComponent(detail.vendorCode)}` : ""}`)}>
                  <Td dense className="font-semibold text-primary truncate" title={s.project}>{s.project || "—"}</Td>
                  <Td dense className="text-right">{s.woCount}</Td>
                  <Td dense className="text-right">{fmtCr(s.contract)}</Td>
                  <Td dense className="text-right text-emerald-600 dark:text-emerald-400">{fmtCr(s.paid)}</Td>
                  <Td dense className="text-right">{fmtCr(s.pending)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>

          <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Work orders</div>
          <Table className="min-w-[700px]">
            <Thead>
              <Tr>
                <Th dense>WO</Th>
                {detail.isGroup && <Th dense>Vendor</Th>}
                <Th dense>Site</Th><Th dense>Category</Th><Th dense className="text-right">Contract value</Th><Th dense className="text-right">Paid</Th><Th dense className="text-right">Pending</Th><Th dense>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {detail.wos.map((r, i) => (
                <Tr key={r.workOrderId || i}>
                  <Td dense>
                    {r.workOrderId ? (
                      <button type="button" className="font-semibold text-primary hover:underline" onClick={() => navigate(`/work-items/${r.workOrderId}`)}>{r.workOrderNo || "WO"}</button>
                    ) : (r.workOrderNo || "—")}
                  </Td>
                  {detail.isGroup && <Td dense className="text-xs truncate" title={r.contractor}>{r.contractor}</Td>}
                  <Td dense className="text-xs text-gray-500 dark:text-gray-400 truncate" title={r.project}>{r.project}</Td>
                  <Td dense className="text-xs text-gray-500 dark:text-gray-400 truncate" title={r.category}>{r.category}</Td>
                  <Td dense className="text-right">{fmtCr(r.contractValue)}</Td>
                  <Td dense className="text-right text-emerald-600 dark:text-emerald-400">{fmtCr(r.paid)}</Td>
                  <Td dense className="text-right">{fmtCr(r.pending)}</Td>
                  <Td dense><Badge color={STATUS_BADGE[r.status]} small>{r.status}</Badge></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Modal>
      )}
    </Card>
  );
}
