import { useState } from "react";
import toast from "react-hot-toast";
import { PenTool } from "lucide-react";
import apiClient from "../services/apiClient";
import { DRAWING_TYPE_OPTIONS, SOURCE_OPTIONS, PRIORITY_OPTIONS, PRIORITY_LABEL } from "../shared/constants/drawingRequestOptions";
import Btn from "../ui/Btn";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import SField from "../ui/SField";

// Authenticated-only — raised from the Daily Progress Report page so a DRI
// (or admin) can ask Planning/Design for a drawing without leaving the form.
// Never rendered on the public no-login form (see DailyProgressReport vs.
// PublicDailyProgressReportForm) — that flow instead gets its own standalone
// public form (PublicDrawingRequestForm) since there's no in-page context to prefill from there.
export default function DrawingRequestButton({
  projectId, projectOptions, driName: driNameDefault, onSubmitted,
}: {
  projectId?: string;
  projectOptions: { label: string; value: string }[];
  driName?: string;
  onSubmitted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ projectId: projectId || "", description: "", drawingType: "", source: "", priority: "", driName: driNameDefault || "" });

  function openModal() {
    setForm({ projectId: projectId || "", description: "", drawingType: "", source: "", priority: "", driName: driNameDefault || "" });
    setOpen(true);
  }

  async function submit() {
    if (!form.projectId) return toast.error("Select a project");
    if (!form.description.trim()) return toast.error("Describe what drawing is needed");
    if (!form.drawingType) return toast.error("Select a drawing type");
    if (!form.driName.trim()) return toast.error("Enter the requester's name");
    setSaving(true);
    try {
      await apiClient.post("/drawing-requests", form);
      toast.success("Drawing request submitted");
      setOpen(false);
      onSubmitted?.();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to submit request";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Btn label="Drawing Request" icon={PenTool} outline onClick={openModal} />
      {open && (
        <Modal
          title="Request a Drawing" subtitle="Ask Planning/Design for a drawing you need on site" icon={PenTool}
          onClose={() => setOpen(false)}
          footer={<Btn label="Submit Request" color="primary" loading={saving} onClick={submit} />}
        >
          <div className="flex flex-col gap-4">
            <SField
              label="Project" required placeholder="Select project"
              value={form.projectId || null}
              onChange={v => setForm(f => ({ ...f, projectId: v }))}
              options={projectOptions}
            />
            <Field
              textarea label="Drawing Description" required rows={3}
              placeholder="e.g. Structural drawing for 2nd floor slab, Tower B"
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
            <SField
              label="Priority (optional)" placeholder="Choose priority"
              value={form.priority || null}
              onChange={v => setForm(f => ({ ...f, priority: v }))}
              options={PRIORITY_OPTIONS.map(p => ({ label: PRIORITY_LABEL[p], value: p }))}
            />
            <Field
              label="Requested By (DRI)" required placeholder="Requester's name"
              value={form.driName}
              onChange={e => setForm(f => ({ ...f, driName: e.target.value }))}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
