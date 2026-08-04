import { useState } from "react";
import toast from "react-hot-toast";
import { PenTool } from "lucide-react";
import apiClient from "../services/apiClient";
import Btn from "../ui/Btn";
import Modal from "../ui/Modal";
import Field from "../ui/Field";
import SField from "../ui/SField";

// Authenticated-only — raised from the Daily Progress Report page so a DRI
// (or admin) can ask Planning/Design for a drawing without leaving the form.
// Never rendered on the public no-login form (see DailyProgressReport vs.
// PublicDailyProgressReportForm) since there's no requester identity to route it to.
export default function DrawingRequestButton({
  projectId, projectOptions,
}: {
  projectId?: string;
  projectOptions: { label: string; value: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ projectId: projectId || "", description: "", priority: "normal" as "normal" | "urgent" });

  function openModal() {
    setForm({ projectId: projectId || "", description: "", priority: "normal" });
    setOpen(true);
  }

  async function submit() {
    if (!form.projectId) return toast.error("Select a project");
    if (!form.description.trim()) return toast.error("Describe what drawing is needed");
    setSaving(true);
    try {
      await apiClient.post("/drawing-requests", form);
      toast.success("Drawing request submitted");
      setOpen(false);
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
              textarea label="What drawing do you need?" required rows={3}
              placeholder="e.g. Structural drawing for 2nd floor slab, Tower B"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
            <div>
              <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">Priority</span>
              <div className="flex gap-2.5">
                {[{ label: "Normal", value: "normal" as const, color: "#6B7280" }, { label: "Urgent", value: "urgent" as const, color: "#DC2626" }].map(opt => (
                  <button key={opt.value} type="button" onClick={() => setForm(f => ({ ...f, priority: opt.value }))}
                    className="px-4 py-1.5 rounded-lg border font-semibold text-xs cursor-pointer"
                    style={{
                      borderColor: form.priority === opt.value ? opt.color : "#E5E7EB",
                      background: form.priority === opt.value ? `${opt.color}18` : "transparent",
                      color: form.priority === opt.value ? opt.color : "#6B7280",
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
