import { useEffect, useState } from "react";
import { FileText, CheckCircle2 } from "lucide-react";
import axios from "axios";
import dayjs from "dayjs";
import DailyProjectReportSections from "../../components/DailyProjectReportSections";
import { firstMissingDprField } from "../../shared/constants/dprOptions";
import type { DprFormValues } from "../../shared/constants/dprOptions";
import toast from "react-hot-toast";
import Btn from "../../ui/Btn";
import Card from "../../ui/Card";
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

const emptyForm: { projectId: string; driName: string; date: string } & Partial<DprFormValues> = {
  projectId: "", driName: "", date: dayjs().format("YYYY-MM-DD"),
};

export default function PublicDailyReportForm() {
  const [projects, setProjects] = useState<Lookup[]>([]);
  const [driUsers, setDriUsers] = useState<Lookup[]>([]);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    Promise.all([pub.get("/projects"), pub.get("/dri-users")])
      .then(([p, u]) => {
        setProjects(p.data.projects || []);
        setDriUsers(u.data.users || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit() {
    if (!form.projectId) return toast.error("Select a project");
    if (!form.driName) return toast.error("Select your name");
    if (!form.date) return toast.error("Select a date");
    const missing = firstMissingDprField(form);
    if (missing) return toast.error(`Select ${missing}`);

    setSubmitting(true);
    try {
      await pub.post("/daily-reports", { ...form, date: dayjs(form.date).toISOString() });
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
          <div className="text-xl font-bold text-[#1a1f2e] mb-2">Daily Project Report Submitted!</div>
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
          <div className="text-[11px] text-gray-400">Daily Project Report</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <FileText className="w-[18px] h-[18px] text-[#4f46e5]" />
          <span className="font-semibold text-[#1a1f2e]">Daily Project Report</span>
        </div>
      </div>

      <div className="max-w-[760px] mx-auto px-4 py-8 pb-16">
        <div className="mb-7">
          <h3 className="text-2xl font-bold text-[#1a1f2e] m-0">Daily Project Report</h3>
          <p className="text-gray-500">Fill this in at the end of each site day — takes about 2 minutes.</p>
        </div>

        <Card className="mb-5 flex flex-col gap-4">
          <SField
            label="Project Name" required placeholder="Choose"
            value={form.projectId || null}
            onChange={v => setForm(f => ({ ...f, projectId: v }))}
            options={projects.map(p => ({ label: p.name, value: p._id }))}
          />
          <SField
            label="DRI Name" required placeholder="Choose"
            value={form.driName || null}
            onChange={v => setForm(f => ({ ...f, driName: v }))}
            options={driUsers.map(d => ({ label: d.name, value: d.name }))}
          />
          <DatePicker
            label="Date" value={form.date}
            onChange={v => setForm(f => ({ ...f, date: v }))}
            max={dayjs().format("YYYY-MM-DD")}
          />
        </Card>

        <DailyProjectReportSections values={form} onChange={patch => setForm(f => ({ ...f, ...patch }))} />

        <Btn label="Submit Report" style={{ background: "#4f46e5", borderColor: "#4f46e5" }} className="w-full mt-1" loading={submitting} onClick={onSubmit} />
      </div>
    </div>
  );
}
