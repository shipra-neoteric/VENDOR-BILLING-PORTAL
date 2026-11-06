import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { fmtDuration, fmtGap, fmtNum, fmtPct, gapColor, pctColor, type DeptAverage, type DeptRow, type UserAverage, type UserRow } from "./shared";

const th = "whitespace-normal! leading-tight align-bottom";
const num = (n: number, tone = "") => <span className={`tabular-nums ${n ? `font-semibold ${tone}` : "text-gray-300 dark:text-gray-600"}`}>{n || "—"}</span>;

export function PctCell({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-[13px] font-semibold tabular-nums" style={{ color: pctColor(pct) }}>{pct}%</span>
      <div className="w-16 h-1 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: pctColor(pct) }} /></div>
    </div>
  );
}
const GapCell = ({ gap }: { gap: number | null }) => <span className="tabular-nums font-semibold" style={{ color: gapColor(gap) }}>{fmtGap(gap)}</span>;

const avgRow = "bg-gray-50 dark:bg-gray-800/60 font-semibold";

export function DepartmentTable({ rows, average }: { rows: DeptRow[]; average: DeptAverage }) {
  return (
    <Table containerClassName="max-h-[420px] overflow-y-auto">
      <colgroup>{[18, 7, 8, 8, 8, 8, 7, 8, 11, 8, 8.5, 8.5].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
      <Thead className="sticky top-0 z-10">
        <Tr>
          <Th dense className={th}>Department</Th><Th dense className={`${th} text-right`}>Users</Th>
          <Th dense className={`${th} text-right`}>Planned</Th><Th dense className={`${th} text-right`}>Work Done</Th><Th dense className={`${th} text-right`}>Not Done</Th>
          <Th dense className={`${th} text-right`}>On Time</Th><Th dense className={`${th} text-right`}>Late</Th><Th dense className={`${th} text-right`}>SLA Breached</Th>
          <Th dense className={`${th} text-right`}>Completion %</Th><Th dense className={`${th} text-right`}>Perf. Gap</Th>
          <Th dense className={`${th} text-right`} title="Planned ÷ users handling that department's stages">Planned / User</Th><Th dense className={`${th} text-right`}>Done / User</Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.length === 0 && <Tr><Td dense colSpan={12} className="text-center text-gray-400 py-6">No planned work in this period</Td></Tr>}
        {rows.map(r => (
          <Tr key={r.name}>
            <Td dense className="font-semibold">{r.name}</Td><Td dense className="text-right tabular-nums">{r.users || "—"}</Td>
            <Td dense className="text-right">{num(r.planned)}</Td><Td dense className="text-right">{num(r.done, "text-emerald-600")}</Td><Td dense className="text-right">{num(r.notDone, "text-amber-600")}</Td>
            <Td dense className="text-right">{num(r.onTime)}</Td><Td dense className="text-right">{num(r.late, "text-red-600")}</Td><Td dense className="text-right">{num(r.breached, "text-red-600")}</Td>
            <Td dense className="text-right"><div className="flex justify-end"><PctCell pct={r.completionPct} /></div></Td>
            <Td dense className="text-right"><GapCell gap={r.gapPct} /></Td>
            <Td dense className="text-right tabular-nums">{fmtNum(r.plannedPerUser)}</Td><Td dense className="text-right tabular-nums">{fmtNum(r.donePerUser)}</Td>
          </Tr>
        ))}
        {rows.length > 0 && (
          <Tr className={avgRow}>
            <Td dense>Overall average <span className="font-normal text-[10px] text-gray-400">({average.departments} depts)</span></Td>
            <Td dense className="text-right tabular-nums">{fmtNum(average.avgUsersPerDept)}</Td>
            <Td dense className="text-right tabular-nums">{fmtNum(average.avgPlanned)}</Td><Td dense className="text-right tabular-nums">{fmtNum(average.avgDone)}</Td>
            <Td dense colSpan={3} className="text-right text-[11px] font-normal text-gray-500">On-time (weighted) {fmtPct(average.weightedOnTimePct)}</Td>
            <Td dense colSpan={2} className="text-right text-[11px] font-normal text-gray-500">Completion: {fmtPct(average.weightedCompletionPct)} weighted · {fmtPct(average.meanCompletionPct)} mean</Td>
            <Td dense colSpan={2} />
          </Tr>
        )}
      </Tbody>
    </Table>
  );
}

const GROUP_BORDER = "border-l border-gray-200 dark:border-gray-700/60"; // thin divider before each section
const grp = "text-center text-[10px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200 border-b-2 border-primary/50 bg-orange-50/60 dark:bg-gray-800/70";
const share = (v: number | null, bad: boolean) => (
  <span className="tabular-nums font-semibold" style={{ color: v === null ? "#D1D5DB" : bad ? (v > 0 ? gapColor(-v) : "#9CA3AF") : pctColor(v) }}>{fmtPct(v)}</span>
);

// User-wise performance, in five grouped sections: User Details · Work Summary · SLA Breakdown · Performance · Productivity.
// Employees' rows come first with the "Average per user" row under them; stages that are only assigned to a role (no person) are shown
// separately underneath and are NOT part of any employee average.
export function UserTable({ rows, average, onSelect }: { rows: UserRow[]; average: UserAverage; unitLabel?: string; onSelect?: (u: UserRow) => void }) {
  const people = rows.filter(r => r.userId !== "unassigned");
  const widths = [15, 8, 7, 7, 7, 7.5, 8, 7.5, 8.5, 8.5, 8.5, 7.5];

  const cells = (r: UserRow) => (
    <>
      <Td dense className={`text-right ${GROUP_BORDER}`}>{num(r.planned)}</Td>
      <Td dense className="text-right">{num(r.done, "text-emerald-600")}</Td>
      <Td dense className="text-right">{num(r.notDone, "text-amber-600")}</Td>
      <Td dense className={`text-right ${GROUP_BORDER}`}>{num(r.onTime, "text-emerald-600")}</Td>
      <Td dense className="text-right">{num(r.late, "text-amber-600")}</Td>
      <Td dense className="text-right">{num(r.breached, "text-red-600")}</Td>
      <Td dense className={`text-right ${GROUP_BORDER}`}>{share(r.notDonePct, true)}</Td>
      <Td dense className="text-right">{share(r.onTimePct, false)}</Td>
      <Td dense className="text-right">{share(r.latePct, true)}</Td>
      <Td dense className={`text-right tabular-nums whitespace-nowrap ${GROUP_BORDER}`}>{fmtDuration(r.avgTatMinutes)}</Td>
    </>
  );

  return (
    <Table containerClassName="max-h-[480px] overflow-y-auto">
      <colgroup>{widths.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
      <Thead className="sticky top-0 z-10">
        <Tr>
          <Th dense colSpan={2} className={grp}>User Details</Th>
          <Th dense colSpan={3} className={`${grp} ${GROUP_BORDER}`}>Work Summary</Th>
          <Th dense colSpan={3} className={`${grp} ${GROUP_BORDER}`}>SLA Breakdown</Th>
          <Th dense colSpan={3} className={`${grp} ${GROUP_BORDER}`}>Performance</Th>
          <Th dense colSpan={1} className={`${grp} ${GROUP_BORDER}`}>Productivity</Th>
        </Tr>
        <Tr>
          <Th dense className={th}>User</Th><Th dense className={th}>Role</Th>
          <Th dense className={`${th} text-right ${GROUP_BORDER}`}>Planned</Th><Th dense className={`${th} text-right`}>Work Done</Th><Th dense className={`${th} text-right`}>Not Done</Th>
          <Th dense className={`${th} text-right ${GROUP_BORDER}`} title="Completed within the SLA time">Done On Time</Th>
          <Th dense className={`${th} text-right`} title="Completed after the SLA due time">Done Not On Time</Th>
          <Th dense className={`${th} text-right`} title="Done late + still open past the due time">SLA Breached</Th>
          <Th dense className={`${th} text-right ${GROUP_BORDER}`} title="Not done ÷ Planned">% Not Done</Th>
          <Th dense className={`${th} text-right`} title="Done on time ÷ Work Done">% Done On Time</Th>
          <Th dense className={`${th} text-right`} title="Done not on time ÷ Work Done">% Done Not On Time</Th>
          <Th dense className={`${th} text-right ${GROUP_BORDER}`} title="Average time to complete a stage">Avg TAT</Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.length === 0 && <Tr><Td dense colSpan={12} className="text-center text-gray-400 py-6">No planned work in this period</Td></Tr>}
        {people.map(r => (
          <Tr key={r.userId} className={onSelect ? "cursor-pointer hover:bg-orange-50/50 dark:hover:bg-gray-800/60" : ""} onClick={onSelect ? () => onSelect(r) : undefined}>
            <Td dense><div className="font-semibold">{r.name}</div>{r.department && <div className="text-[11px] text-gray-400 capitalize">{r.department}</div>}</Td>
            <Td dense className="whitespace-nowrap">{r.role || "—"}</Td>
            {cells(r)}
          </Tr>
        ))}
        {people.length > 0 && (
          <Tr className={`${avgRow} border-t-2 border-gray-300 dark:border-gray-600`}>
            <Td dense>Average per user <span className="font-normal text-[10px] text-gray-400">({average.users} users)</span></Td><Td dense />
            <Td dense className={`text-right tabular-nums ${GROUP_BORDER}`}>{fmtNum(average.avgPlanned)}</Td>
            <Td dense className="text-right tabular-nums">{fmtNum(average.avgDone)}</Td>
            <Td dense className="text-right tabular-nums">{fmtNum(average.avgNotDone)}</Td>
            <Td dense className={`text-right tabular-nums ${GROUP_BORDER}`}>{fmtNum(average.avgOnTime)}</Td>
            <Td dense className="text-right tabular-nums">{fmtNum(average.avgLate)}</Td>
            <Td dense className="text-right tabular-nums">{fmtNum(average.avgBreached)}</Td>
            <Td dense className={`text-right ${GROUP_BORDER}`}>{share(average.weightedNotDonePct, true)}</Td>
            <Td dense className="text-right">{share(average.weightedOnTimePct, false)}</Td>
            <Td dense className="text-right">{share(average.weightedLatePct, true)}</Td>
            <Td dense className={`text-right tabular-nums whitespace-nowrap ${GROUP_BORDER}`}>{fmtDuration(average.avgTatMinutes)}</Td>
          </Tr>
        )}
      </Tbody>
    </Table>
  );
}
