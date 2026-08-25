import { useEffect, useState } from "react";
import { Users, CheckCircle2 } from "lucide-react";
import axios from "axios";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { WORK_TYPE_OPTIONS, SHIFT_TYPE_OPTIONS } from "../../shared/constants/labourReportOptions";
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
interface ContractorLookup { vendorCode: string; companyName: string; vendorId?: string; name?: string; shortCode?: string; }

const emptyForm = { vendorCode: "", projectId: "", date: dayjs().format("YYYY-MM-DD"), workType: "", shiftType: "", labourCount: "" };

export default function PublicLabourReportForm() {
  const [projects, setProjects]       = useState<Lookup[]>([]);
  const [contractors, setContractors] = useState<ContractorLookup[]>([]);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);
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

  async function onSubmit() {
    if (!form.vendorCode) return toast.error("Select a contractor");
    if (!form.projectId) return toast.error("Select a location");
    if (!form.date) return toast.error("Select a date");
    if (!form.workType) return toast.error("Select a work type");
    if (!form.shiftType) return toast.error("Select a shift");
    if (form.labourCount === "" || Number(form.labourCount) < 0) return toast.error("Enter number of labourers");

    setSubmitting(true);
    try {
      await pub.post("/daily-labour-reports", { ...form, labourCount: Number(form.labourCount), date: dayjs(form.date).toISOString() });
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
          <div className="text-xl font-bold text-[#1a1f2e] mb-2">Labour Report Submitted!</div>
          <p className="text-gray-500 mb-6">Thanks — today's labour count has been recorded.</p>
          <Btn label="Submit Another" style={{ background: "#0d9488", borderColor: "#0d9488" }} onClick={reset} />
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <div className="bg-white border-b border-gray-200 px-6 h-[60px] flex items-center sticky top-0 z-50 shadow-sm">
        <div className="w-9 h-9 rounded-[10px] bg-[#0d9488] flex items-center justify-center text-white font-extrabold text-lg mr-3">N</div>
        <div>
          <div className="font-bold text-[15px] leading-tight text-[#1a1f2e]">Neoteric Properties</div>
          <div className="text-[11px] text-gray-400">Daily Contractor / Labour Report</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Users className="w-[18px] h-[18px] text-[#0d9488]" />
          <span className="font-semibold text-[#1a1f2e]">Labour Report</span>
        </div>
      </div>

      <div className="max-w-[560px] mx-auto px-4 py-8 pb-16">
        <div className="mb-7">
          <h3 className="text-2xl font-bold text-[#1a1f2e] m-0">Daily Contractor / Labour Report — All Sites</h3>
          <p className="text-gray-500">Log today's on-site labour count per contractor and work type.</p>
        </div>

        <Card className="flex flex-col gap-4">
          <SField
            label="Contractor Name" required placeholder="Choose"
            value={form.vendorCode || null}
            onChange={v => setForm(f => ({ ...f, vendorCode: v }))}
            options={contractors.map(c => ({
              label: c.companyName || c.name || "",
              value: c.vendorCode || c.vendorId || "",
              vendorId: c.vendorId || c.vendorCode || "",
              name: c.name || c.companyName || "",
              searchText: `${c.companyName || c.name || ""} ${c.vendorCode || ""} ${c.vendorId || ""}`.trim(),
            }))}
            filterFn={(opt, search) => {
              const s = search.toLowerCase().trim();
              const contractorName = (opt.name || opt.label || "").toLowerCase();
              const vendorId = (opt.vendorId || opt.vendorCode || opt.value || "").toLowerCase();
              return contractorName.includes(s) || vendorId.includes(s);
            }}
          />
          <SField
            label="Location" required placeholder="Choose"
            value={form.projectId || null}
            onChange={v => setForm(f => ({ ...f, projectId: v }))}
            options={projects.map(p => ({ label: p.name, value: p._id }))}
          />
          <DatePicker
            label="Date" value={form.date}
            onChange={v => setForm(f => ({ ...f, date: v }))}
            max={dayjs().format("YYYY-MM-DD")}
          />
          <SField
            label="कार्य प्रकार (Work Type)" required placeholder="Choose"
            value={form.workType || null}
            onChange={v => setForm(f => ({ ...f, workType: v }))}
            options={WORK_TYPE_OPTIONS.map(w => ({ label: w, value: w }))}
          />
          <SField
            label="Shift Type" required placeholder="Choose"
            value={form.shiftType || null}
            onChange={v => setForm(f => ({ ...f, shiftType: v }))}
            options={SHIFT_TYPE_OPTIONS.map(s => ({ label: s, value: s }))}
          />
          <Field
            label="श्रमिक संख्या (Number of Labourers)" required type="number" min={0}
            placeholder="e.g. 12"
            value={form.labourCount}
            onChange={e => setForm(f => ({ ...f, labourCount: e.target.value }))}
          />
        </Card>

        <Btn label="Submit Report" style={{ background: "#0d9488", borderColor: "#0d9488" }} className="w-full mt-5" loading={submitting} onClick={onSubmit} />
      </div>
    </div>
  );
}
