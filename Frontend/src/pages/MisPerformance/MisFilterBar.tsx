import { useMemo } from "react";
import { X } from "lucide-react";
import { FilterRow, SelectFilter } from "../../ui/Filters";
import { defaultFilters, type MisFilters, type Performance } from "./shared";

const dateInput = "h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";

// Date range, Weekly / Monthly, Department, User and Role. Options come from the data itself (what actually exists), and the User list
// narrows to the chosen role / department.
export default function MisFilterBar({ filters, onChange, options }: { filters: MisFilters; onChange: (f: MisFilters) => void; options?: Performance["options"] }) {
  const set = (patch: Partial<MisFilters>) => onChange({ ...filters, ...patch });
  const userOptions = useMemo(() => (options?.users ?? [])
    .filter(u => (!filters.role || u.role === filters.role)
      && (!filters.department || u.department.toLowerCase() === filters.department.toLowerCase()))
    .map(u => ({ value: u.id, label: u.name })), [options, filters.role, filters.department]);
  const def = defaultFilters();
  const dirty = filters.department || filters.userId || filters.role || filters.from !== def.from || filters.to !== def.to || filters.groupBy !== "week";

  return (
    <FilterRow>
      <div className="inline-flex h-10 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-[#0F172A]">
        {(["week", "month"] as const).map(g => (
          <button
            key={g} type="button" onClick={() => set({ groupBy: g })}
            className={`px-4 text-[13px] font-medium transition-colors ${filters.groupBy === g ? "bg-primary text-white" : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
          >{g === "week" ? "Weekly" : "Monthly"}</button>
        ))}
      </div>
      <input type="date" className={dateInput} value={filters.from} max={filters.to} onChange={e => e.target.value && set({ from: e.target.value })} title="From" />
      <span className="text-xs text-gray-400 pb-3">to</span>
      <input type="date" className={dateInput} value={filters.to} min={filters.from} onChange={e => e.target.value && set({ to: e.target.value })} title="To" />
      <div className="w-44"><SelectFilter value={filters.department} onChange={v => set({ department: v, userId: "" })} options={(options?.departments ?? []).map(d => ({ value: d, label: d }))} placeholder="All departments" /></div>
      <div className="w-40"><SelectFilter value={filters.role} onChange={v => set({ role: v, userId: "" })} options={(options?.roles ?? []).map(r => ({ value: r, label: r }))} placeholder="All roles" /></div>
      <div className="w-48"><SelectFilter value={filters.userId} onChange={v => set({ userId: v })} options={userOptions} placeholder="All users" /></div>
      {dirty && (
        <button type="button" onClick={() => onChange(def)} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
          <X className="w-4 h-4" /> Reset
        </button>
      )}
    </FilterRow>
  );
}
