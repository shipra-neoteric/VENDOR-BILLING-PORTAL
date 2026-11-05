import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Landmark, HardHat, Receipt, Banknote, TrendingUp } from "lucide-react";
import Modal from "../../ui/Modal";
import Spinner from "../../ui/Spinner";
import Btn from "../../ui/Btn";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import StatusBadge from "../../ui/StatusBadge";
import apiClient from "../../services/apiClient";

export type TileKind = "contract" | "executed" | "billed" | "paid" | "progress";

interface ContractRow { id: string; workOrderNo: string; vendorName: string; category: string; status: string; contractValue: number; counted: boolean; reason: string }
interface ExecutedRow { id: string; workOrderNo: string; vendorName: string; status: string; plannedValue: number; executedValue: number; percent: number }
export interface BillRow {
  id: string; billNo: string; workOrderNo: string; vendorName: string; status: string; billType: string; billDate?: string;
  gross: number; takenOff: number; counted: number; netPayable: number; note: string;
}
interface Breakdown {
  totals: { contract: number; executed: number; billed: number; paid: number; progress: number };
  contract: ContractRow[]; executed: ExecutedRow[]; billed: BillRow[]; paid: BillRow[]; duplicatesHidden: number;
}

const fmt = (n: number) => "₹" + (n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const META: Record<TileKind, { title: string; icon: typeof Landmark; help: string }> = {
  contract: { title: "Total Contract Value", icon: Landmark, help: "Work orders that count towards the contract: approved and not cancelled, or already billed. Others are shown greyed with the reason." },
  executed: { title: "Work Executed", icon: HardHat, help: "Work done so far per work order — completed quantity × rate from the Work Progress entries." },
  billed: { title: "Total Billed", icon: Receipt, help: "Bill gross, less what repeats earlier bills or recovers an advance, plus advances given. Rejected bills are not counted." },
  paid: { title: "Paid", icon: Banknote, help: "Net payable of paid bills. Bills that are Ready for TMS / Sent to TMS count as paid until TMS is connected." },
  progress: { title: "Overall Progress", icon: TrendingUp, help: "Executed value ÷ planned value of the work orders that count, per work order." },
};

// Right-side drawer behind each tile on a project's page: the full list whose total is that tile's number.
export default function TileBreakdownDrawer({ projectId, kind, onClose }: { projectId: string; kind: TileKind; onClose: () => void }) {
  const [data, setData] = useState<Breakdown | null>(null);
  const [error, setError] = useState(false);
  const meta = META[kind];

  useEffect(() => {
    let live = true;
    setData(null); setError(false);
    apiClient.get(`/projects/${projectId}/breakdown`)
      .then(r => { if (live) setData(r.data); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [projectId]);

  const totalLabel = (label: string, value: string) => (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/40 px-4 py-3 mb-3">
      <span className="text-[13px] font-semibold text-gray-600 dark:text-gray-300">{label}</span>
      <span className="text-lg font-extrabold tabular-nums text-[#1A1A2E] dark:text-[#F1F5F9]">{value}</span>
    </div>
  );
  const muted = "opacity-50";

  function body(d: Breakdown) {
    if (kind === "contract") {
      const counted = d.contract.filter(r => r.counted);
      return (
        <>
          {totalLabel(`${counted.length} work order${counted.length !== 1 ? "s" : ""} counted`, fmt(d.totals.contract))}
          <Table>
            <Thead><Tr><Th>Work Order</Th><Th>Vendor</Th><Th>Status</Th><Th className="text-right">Contract Value</Th><Th>Counted</Th></Tr></Thead>
            <Tbody>
              {d.contract.map(r => (
                <Tr key={r.id} className={r.counted ? "" : muted}>
                  <Td className="font-semibold">{r.workOrderNo}</Td>
                  <Td>{r.vendorName || "—"}{r.category ? <div className="text-[11px] text-gray-400">{r.category}</div> : null}</Td>
                  <Td className="capitalize">{r.status}</Td>
                  <Td className="text-right font-mono">{fmt(r.contractValue)}</Td>
                  <Td className="text-xs">{r.counted ? (r.reason || "Yes") : `No — ${r.reason}`}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </>
      );
    }
    if (kind === "executed" || kind === "progress") {
      const planned = d.executed.reduce((s, r) => s + r.plannedValue, 0);
      return (
        <>
          {kind === "executed"
            ? totalLabel(`${d.executed.length} work order${d.executed.length !== 1 ? "s" : ""}`, fmt(d.totals.executed))
            : totalLabel(`Executed ${fmt(d.totals.executed)} of planned ${fmt(planned)}`, `${d.totals.progress}%`)}
          <Table>
            <Thead><Tr><Th>Work Order</Th><Th>Vendor</Th><Th className="text-right">Planned</Th><Th className="text-right">Executed</Th><Th className="text-right">Progress</Th></Tr></Thead>
            <Tbody>
              {d.executed.map(r => (
                <Tr key={r.id}>
                  <Td className="font-semibold">{r.workOrderNo}</Td>
                  <Td>{r.vendorName || "—"}</Td>
                  <Td className="text-right font-mono">{fmt(r.plannedValue)}</Td>
                  <Td className="text-right font-mono">{fmt(r.executedValue)}</Td>
                  <Td className="text-right tabular-nums">{r.percent}%</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </>
      );
    }
    const rows = kind === "billed" ? d.billed : d.paid;
    const countedRows = kind === "billed" ? rows.filter(r => r.counted !== 0).length : rows.length;
    return (
      <>
        {totalLabel(`${countedRows} bill${countedRows !== 1 ? "s" : ""} counted${kind === "billed" ? ` of ${rows.length}` : ""}`, fmt(kind === "billed" ? d.totals.billed : d.totals.paid))}
        <Table>
          <Thead>
            <Tr>
              <Th>Bill</Th><Th>Work Order</Th><Th>Vendor</Th><Th>Date</Th><Th>Status</Th>
              {kind === "billed" ? <><Th className="text-right">Gross</Th><Th className="text-right">Taken off</Th><Th className="text-right">Counted</Th></> : <Th className="text-right">Net Paid</Th>}
            </Tr>
          </Thead>
          <Tbody>
            {rows.map(r => (
              <Tr key={r.id} className={kind === "billed" && r.counted === 0 ? muted : ""}>
                <Td>
                  <div className="font-semibold">{r.billNo}</div>
                  {r.billType.startsWith("advance") && <div className="text-[10px] text-amber-600">Advance</div>}
                  {kind === "billed" && r.note && <div className="text-[10px] text-gray-400 max-w-[180px]">{r.note}</div>}
                </Td>
                <Td>{r.workOrderNo}</Td>
                <Td>{r.vendorName || "—"}</Td>
                <Td>{r.billDate ? dayjs(r.billDate).format("DD MMM YYYY") : "—"}</Td>
                <Td><StatusBadge status={r.status} /></Td>
                {kind === "billed" ? (
                  <>
                    <Td className="text-right font-mono">{fmt(r.gross)}</Td>
                    <Td className="text-right font-mono">{r.takenOff > 0 ? `− ${fmt(r.takenOff)}` : "—"}</Td>
                    <Td className="text-right font-mono font-bold">{fmt(r.counted)}</Td>
                  </>
                ) : <Td className="text-right font-mono font-bold">{fmt(r.netPayable)}</Td>}
              </Tr>
            ))}
          </Tbody>
        </Table>
        {d.duplicatesHidden > 0 && <div className="text-[11px] text-gray-400 mt-2">{d.duplicatesHidden} duplicate copy bill{d.duplicatesHidden !== 1 ? "s" : ""} (from the old reconciliation script) are hidden and not counted.</div>}
      </>
    );
  }

  return (
    <Modal
      icon={meta.icon}
      title={meta.title}
      subtitle={meta.help}
      extraWide
      onClose={onClose}
      footer={<div className="flex justify-end"><Btn outline label="Close" onClick={onClose} /></div>}
    >
      {error ? <div className="text-sm text-red-500">Could not load the list.</div> : !data ? <Spinner label="Loading…" /> : body(data)}
    </Modal>
  );
}
