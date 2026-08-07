import { useEffect, useState } from "react";
import { ClipboardList, CheckCircle2 } from "lucide-react";
import axios from "axios";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import WorkCategoryChecklist from "../../components/WorkCategoryChecklist";
import { firstMissingProgressField, MIN_IMAGES_PER_CATEGORY } from "../../shared/constants/dailyProgressReportOptions";
import type { DailyProgressReportFormValues, WorkEntry } from "../../shared/constants/dailyProgressReportOptions";
import Btn from "../../ui/Btn";
import Card from "../../ui/Card";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import { DatePicker } from "../../ui/DatePicker";
import Spinner from "../../ui/Spinner";

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");
const pub = axios.create({ baseURL: BASE.replace(/\/api$/, "/api/public") });
pub.interceptors.response.use(r => {
  if (r.data && "success" in r.data && "data" in r.data) r.data = r.data.data;
  return r;
});

interface Lookup { _id: string; name: string; }
interface ContractorLookup { vendorCode: string; companyName: string; }

const emptyForm: DailyProgressReportFormValues = {
  projectId: "", driName: "", date: dayjs().format("YYYY-MM-DD"), vendorCode: "",
  shiftType: "", labourCount: "", workEntries: [],
};

export default function PublicDailyProgressReportForm() {
  const [projects, setProjects] = useState<Lookup[]>([]);
  const [contractors, setContractors] = useState<ContractorLookup[]>([]);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    Promise.all([pub.get("/projects"), pub.get("/contractors")])
      .then(([p, c]) => {
        setProjects(p.data.projects || []);
        setContractors(c.data.contractors || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function setEntries(workEntries: WorkEntry[]) {
    setForm(f => ({ ...f, workEntries }));
  }

  async function onSubmit() {
    const missing = firstMissingProgressField(form);
    if (missing) return toast.error(`Select ${missing}`);
    if (form.workEntries.length === 0) return toast.error("Check at least one work type");
    const short = form.workEntries.find(e => e.images.length < MIN_IMAGES_PER_CATEGORY);
    if (short) return toast.error(`"${short.workType}" needs at least ${MIN_IMAGES_PER_CATEGORY} photo${MIN_IMAGES_PER_CATEGORY === 1 ? "" : "s"}`);

    setSubmitting(true);
    try {
      await pub.post("/daily-progress-reports", form);
      setSubmitted(true);
    } catch {
      // axios interceptor shows the error toast
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setForm(emptyForm);
    setSubmitted(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fb]">
        <Spinner label="Loading form…" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex flex-col items-center justify-center p-6">
        <Card className="max-w-[480px] w-full text-center py-10">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <div className="text-xl font-bold text-[#1a1f2e] mb-2">Daily Progress Report Submitted!</div>
          <p className="text-gray-500 mb-6">Thanks — your report for today has been recorded.</p>
          <Btn label="Submit Another" style={{ background: "#4f46e5", borderColor: "#4f46e5" }} onClick={reset} />
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <div className="bg-white border-b border-gray-200 px-6 h-[60px] flex items-center sticky top-0 z-50 shadow-sm">
        <div className="w-9 h-9 rounded-[10px] bg-[#4f46e5] flex items-center justify-center text-white font-extrabold text-lg mr-3">N</div>
        <div>
          <div className="font-bold text-[15px] leading-tight text-[#1a1f2e]">Neoteric Properties</div>
          <div className="text-[11px] text-gray-400">Daily Progress Report</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ClipboardList className="w-[18px] h-[18px] text-[#4f46e5]" />
          <span className="font-semibold text-[#1a1f2e]">Daily Progress Report</span>
        </div>
      </div>

      <div className="max-w-[760px] mx-auto px-4 py-8 pb-16">
        <div className="mb-7">
          <h3 className="text-2xl font-bold text-[#1a1f2e] m-0">Daily Progress Report</h3>
          <p className="text-gray-500">Fill this in at the end of each site day — work progress by category with photo evidence.</p>
        </div>

        <Card className="mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SField
              label="Project Name" required placeholder="Choose"
              value={form.projectId || null}
              onChange={v => setForm(f => ({ ...f, projectId: v }))}
              options={projects.map(p => ({ label: p.name, value: p._id }))}
            />
            <SField
              label="Contractor Name" required placeholder="Choose"
              value={form.vendorCode || null}
              onChange={v => setForm(f => ({ ...f, vendorCode: v }))}
              options={contractors.map(c => ({ label: c.companyName, value: c.vendorCode }))}
            />
            <Field
              label="DRI Name" required placeholder="Type your name"
              value={form.driName}
              onChange={e => setForm(f => ({ ...f, driName: e.target.value }))}
            />
            <DatePicker
              label="Date" value={form.date}
              onChange={v => setForm(f => ({ ...f, date: v }))}
              max={dayjs().format("YYYY-MM-DD")}
            />
            <SField
              label="Shift Type" required placeholder="Choose"
              value={form.shiftType || null}
              onChange={v => setForm(f => ({ ...f, shiftType: v }))}
              options={[{ label: "Day", value: "Day" }, { label: "Night", value: "Night" }]}
            />
            <Field
              label="Number of Labourers" required type="number" min={0}
              placeholder="e.g. 12"
              value={form.labourCount}
              onChange={e => setForm(f => ({ ...f, labourCount: e.target.value === "" ? "" : Number(e.target.value) }))}
            />
          </div>
        </Card>

        <Card className="mb-5">
          <div className="font-bold text-sm text-[#1a1f2e] mb-3">Work Type — check what happened today</div>
          <WorkCategoryChecklist entries={form.workEntries} onChange={setEntries} uploadClient={pub} />
        </Card>

        <Btn
          label="Submit Report" style={{ background: "#4f46e5", borderColor: "#4f46e5" }}
          className="w-full mt-1" loading={submitting} onClick={onSubmit}
        />
      </div>
    </div>
  );
}
