import { useEffect, useState } from "react";
import { PenTool, CheckCircle2 } from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import { DRAWING_TYPE_OPTIONS, SOURCE_OPTIONS } from "../../shared/constants/drawingRequestOptions";
import Btn from "../../ui/Btn";
import Card from "../../ui/Card";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import Spinner from "../../ui/Spinner";

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");
const pub = axios.create({ baseURL: BASE.replace(/\/api$/, "/api/public") });
pub.interceptors.response.use(r => {
  if (r.data && "success" in r.data && "data" in r.data) r.data = r.data.data;
  return r;
});

interface Lookup { _id: string; name: string; }

const emptyForm = { projectId: "", description: "", drawingType: "", source: "", driName: "" };

export default function PublicDrawingRequestForm() {
  const [projects, setProjects] = useState<Lookup[]>([]);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    pub.get("/projects")
      .then(r => setProjects(r.data.projects || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit() {
    if (!form.projectId) return toast.error("Select a project");
    if (!form.description.trim()) return toast.error("Describe the drawing required");
    if (!form.drawingType) return toast.error("Select a drawing type");
    if (!form.driName.trim()) return toast.error("Enter your name");

    setSubmitting(true);
    try {
      const res = await pub.post("/drawing-requests", form);
      setSubmitted(res.data.request?.ticketNo ?? null);
    } catch {
      // axios interceptor shows the error toast
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setForm(emptyForm);
    setSubmitted(null);
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
          <div className="text-xl font-bold text-[#1a1f2e] mb-2">Drawing Request Submitted!</div>
          <p className="text-gray-500 mb-1">Your ticket number is</p>
          <p className="font-mono font-bold text-[#7c3aed] text-lg mb-6">{submitted}</p>
          <Btn label="Submit Another" style={{ background: "#7c3aed", borderColor: "#7c3aed" }} onClick={reset} />
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <div className="bg-white border-b border-gray-200 px-6 h-[60px] flex items-center sticky top-0 z-50 shadow-sm">
        <div className="w-9 h-9 rounded-[10px] bg-[#7c3aed] flex items-center justify-center text-white mr-3">
          <PenTool className="w-4 h-4" />
        </div>
        <div>
          <div className="font-bold text-[15px] leading-tight text-[#1a1f2e]">Neoteric Properties</div>
          <div className="text-[11px] text-gray-400">Drawing Request</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <PenTool className="w-[18px] h-[18px] text-[#7c3aed]" />
          <span className="font-semibold text-[#1a1f2e]">Drawing Request</span>
        </div>
      </div>

      <div className="max-w-[600px] mx-auto px-4 py-8 pb-16">
        <div className="mb-7">
          <h3 className="text-2xl font-bold text-[#1a1f2e] m-0">Drawing Request</h3>
          <p className="text-gray-500">Ask Planning/Design for a drawing you need on site.</p>
        </div>

        <Card className="flex flex-col gap-4">
          <SField
            label="Project" required placeholder="Choose project"
            value={form.projectId || null}
            onChange={v => setForm(f => ({ ...f, projectId: v }))}
            options={projects.map(p => ({ label: p.name, value: p._id }))}
          />
          <Field
            textarea label="Drawing Description" required rows={3}
            placeholder="Describe the drawing required"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
          <SField
            label="Drawing Type" required placeholder="Choose type"
            value={form.drawingType || null}
            onChange={v => setForm(f => ({ ...f, drawingType: v }))}
            options={DRAWING_TYPE_OPTIONS.map(t => ({ label: t, value: t }))}
          />
          <SField
            label="Source (optional)" placeholder="Choose source"
            value={form.source || null}
            onChange={v => setForm(f => ({ ...f, source: v }))}
            options={SOURCE_OPTIONS.map(s => ({ label: s, value: s }))}
          />
          <Field
            label="Requested By (DRI)" required placeholder="Type your name"
            value={form.driName}
            onChange={e => setForm(f => ({ ...f, driName: e.target.value }))}
          />
        </Card>

        <Btn
          label="Submit Request" style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
          className="w-full mt-5" loading={submitting} onClick={onSubmit}
        />
      </div>
    </div>
  );
}
