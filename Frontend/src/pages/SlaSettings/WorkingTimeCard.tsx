import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CalendarClock } from "lucide-react";
import apiClient from "../../services/apiClient";
import Card from "../../ui/Card";
import Btn from "../../ui/Btn";
import SField from "../../ui/SField";
import MultiSelect from "../../ui/MultiSelect";
import { DAY_OPTIONS } from "./shared";

interface SlaConfig { workingDays: string[]; startHour: number; endHour: number }

const hourLabel = (h: number) => {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h === 0 || h === 24 ? "AM" : h < 12 ? "AM" : "PM";
  return `${h12}:00 ${suffix}${h === 24 ? " (midnight)" : ""}`;
};
const START_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ label: hourLabel(h), value: String(h) }));
const END_OPTIONS = Array.from({ length: 24 }, (_, i) => ({ label: hourLabel(i + 1), value: String(i + 1) }));

// Masters → SLA: the working days and working hours (IST) that every SLA clock runs on. Time outside them (nights, days off such as
// Sunday) is not counted against any SLA; it applies to all workflows, including how existing ones are judged in the SLA and MIS reports.
export default function WorkingTimeCard() {
  const [saved, setSaved] = useState<SlaConfig | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [start, setStart] = useState("9");
  const [end, setEnd] = useState("18");
  const [saving, setSaving] = useState(false);

  const apply = useCallback((c: SlaConfig) => {
    setSaved(c); setDays(c.workingDays); setStart(String(c.startHour)); setEnd(String(c.endHour));
  }, []);

  useEffect(() => {
    apiClient.get("/workflows/sla-config").then(r => apply(r.data.config)).catch(() => {});
  }, [apply]);

  const invalid = days.length === 0 || Number(end) <= Number(start);
  const dirty = !!saved && (days.slice().sort().join() !== saved.workingDays.slice().sort().join() || Number(start) !== saved.startHour || Number(end) !== saved.endHour);
  const dayLabels = DAY_OPTIONS.filter(d => days.includes(d.value)).map(d => d.label);
  const off = DAY_OPTIONS.filter(d => !days.includes(d.value)).map(d => d.label);

  async function save() {
    if (invalid) return toast.error(days.length === 0 ? "Choose at least one working day" : "End time must be after the start time");
    setSaving(true);
    try {
      const r = await apiClient.put("/workflows/sla-config", { workingDays: days, startHour: Number(start), endHour: Number(end) });
      apply(r.data.config);
      toast.success("SLA working time saved");
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { message?: string } } }).response?.data?.message || "Could not save the working time");
    } finally { setSaving(false); }
  }

  return (
    <Card className="mb-4">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock className="w-4 h-4 text-primary" />
        <div className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">SLA Working Time</div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        SLA hours are counted only on these days and between these hours (IST). Nights and days off are not counted — for new approvals and
        for how existing ones show in the SLA and MIS reports.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <MultiSelect label="Working Days" values={days} options={DAY_OPTIONS} onChange={setDays} />
        <SField label="Working Hours — From" value={start} options={START_OPTIONS} onChange={v => setStart(v || "9")} />
        <SField label="Working Hours — To" value={end} options={END_OPTIONS} onChange={v => setEnd(v || "18")} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {invalid
            ? <span className="text-red-500">{days.length === 0 ? "Choose at least one working day." : "The end time must be after the start time."}</span>
            : <>SLA runs {dayLabels.join(", ")} · {hourLabel(Number(start))} – {hourLabel(Number(end))}{off.length ? <> · off: <b>{off.join(", ")}</b></> : null}</>}
        </div>
        <Btn label="Save Working Time" color="primary" small loading={saving} disabled={!dirty || invalid} onClick={save} />
      </div>
    </Card>
  );
}
