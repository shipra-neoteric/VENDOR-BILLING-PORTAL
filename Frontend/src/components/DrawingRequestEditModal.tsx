import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import dayjs from "dayjs";
import { PenTool } from "lucide-react";
import apiClient from "../services/apiClient";
import {
  PRIORITY_OPTIONS, PRIORITY_LABEL, STATUS_OPTIONS, STATUS_LABEL,
} from "../shared/constants/drawingRequestOptions";
import type { DrawingRequest } from "../shared/constants/drawingRequestOptions";
import Modal from "../ui/Modal";
import Btn from "../ui/Btn";
import Field from "../ui/Field";
import SField from "../ui/SField";
import { DatePicker } from "../ui/DatePicker";
import Checkbox from "../ui/Checkbox";
import { SectionHeading } from "../ui/Descriptions";

interface UserOption { _id: string; name: string; }

const toDateInput = (v?: string | null) => (v ? dayjs(v).format("YYYY-MM-DD") : "");

export default function DrawingRequestEditModal({
  request, onClose, onSaved,
}: {
  request: DrawingRequest;
  onClose: () => void;
  onSaved: (updated: DrawingRequest) => void;
}) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    assignedTo: request.assignedTo?._id || "",
    committedDate: toDateInput(request.committedDate),
    priority: request.priority || "",
    status: request.status,
    actualCompletionDate: toDateInput(request.actualCompletionDate),
    planningVerified: request.planningVerified,
    projectAcknowledged: request.projectAcknowledged,
    remarks: request.remarks || "",
  });

  useEffect(() => {
    apiClient.get("/auth/users").then(res => setUsers(res.data.users ?? [])).catch(() => {});
  }, []);

  const isApproved = request.reviewStatus === "approved";

  async function handleSave() {
    setSaving(true);
    try {
      const res = await apiClient.put(`/drawing-requests/${request._id}`, {
        // AGM/GM/Planning fields only reach the backend once the review chain
        // has actually cleared — sending them earlier just gets rejected, so
        // there's no reason to send fields the form isn't even showing.
        ...(isApproved ? {
          assignedTo: form.assignedTo || null,
          committedDate: form.committedDate || null,
          priority: form.priority || "",
          status: form.status,
          actualCompletionDate: form.actualCompletionDate || null,
          planningVerified: form.planningVerified,
          projectAcknowledged: form.projectAcknowledged,
        } : {}),
        remarks: form.remarks,
      });
      toast.success("Drawing request updated");
      onSaved(res.data.request as DrawingRequest);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Update failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Edit Drawing Request" subtitle={request.projectName} icon={PenTool}
      onClose={onClose}
      extraWide
      footer={
        <div className="flex justify-end gap-2">
          <Btn label="Cancel" outline onClick={onClose} />
          <Btn label="Save" color="purple" loading={saving} onClick={handleSave} />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <SectionHeading>Request Info</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Project" value={request.projectName} disabled />
          <Field label="Drawing Type" value={request.drawingType} disabled />
        </div>
        <Field textarea label="Drawing Description" rows={2} value={request.description} disabled />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Source" value={request.source} disabled />
          <Field label="Requested By (DRI)" value={request.driName} disabled />
        </div>

        {isApproved ? (
          <>
            <SectionHeading>AGM Response</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SField
                label="Assigned To" placeholder="Choose employee"
                value={form.assignedTo || null}
                onChange={v => setForm(f => ({ ...f, assignedTo: v }))}
                options={users.map(u => ({ label: u.name, value: u._id }))}
              />
              <DatePicker
                label="Committed Date" value={form.committedDate}
                onChange={v => setForm(f => ({ ...f, committedDate: v }))}
              />
            </div>

            <SectionHeading>GM — Priority</SectionHeading>
            <SField
              label="Priority" placeholder="Choose priority"
              value={form.priority || null}
              onChange={v => setForm(f => ({ ...f, priority: v }))}
              options={PRIORITY_OPTIONS.map(p => ({ label: PRIORITY_LABEL[p], value: p }))}
            />

            <SectionHeading>Planning — Status</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SField
                label="Status" required
                value={form.status}
                onChange={v => setForm(f => ({ ...f, status: v as typeof form.status }))}
                options={STATUS_OPTIONS.map(s => ({ label: STATUS_LABEL[s], value: s }))}
              />
              <DatePicker
                label="Actual Completion" value={form.actualCompletionDate}
                onChange={v => setForm(f => ({ ...f, actualCompletionDate: v }))}
              />
            </div>

            <SectionHeading>Verification</SectionHeading>
            <div className="flex gap-6">
              <Checkbox
                checked={form.planningVerified}
                onChange={v => setForm(f => ({ ...f, planningVerified: v }))}
                label="Planning Verified"
              />
              <Checkbox
                checked={form.projectAcknowledged}
                onChange={v => setForm(f => ({ ...f, projectAcknowledged: v }))}
                label="Project Acknowledged"
              />
            </div>
          </>
        ) : (
          <div className="text-[12.5px] text-gray-400 rounded-lg border border-dashed border-gray-200 dark:border-gray-700/40 px-3.5 py-3">
            AGM Response, GM Priority, and Planning Status only become editable once this request clears AGM and GM review — use the Review Workflow panel on the request's detail view to move it forward.
          </div>
        )}
        <Field
          textarea label="Remarks" rows={2} placeholder="Optional remarks"
          value={form.remarks}
          onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
        />
      </div>
    </Modal>
  );
}
