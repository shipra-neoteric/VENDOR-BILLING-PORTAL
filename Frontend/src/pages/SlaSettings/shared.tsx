import { Plus, Trash2 } from "lucide-react";
import type { WorkflowTemplateStage, WorkflowEntityType } from "../../types/Workflow";
import Btn from "../../ui/Btn";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import MultiSelect from "../../ui/MultiSelect";
import Switch from "../../ui/Switch";

export const ENTITY_OPTIONS: { label: string; value: WorkflowEntityType }[] = [
  { label: "Work Order",   value: "WorkOrder" },
  { label: "Bill Request", value: "BillRequest" },
  { label: "Custom",       value: "Custom" },
];

export const ROLE_OPTIONS = [
  { label: "Anyone", value: "any" },
  { label: "Owner",      value: "owner" },
  { label: "GM",         value: "gm" },
  { label: "AGM",        value: "agm" },
  { label: "Accounts",   value: "accounts" },
  { label: "Site DRI",   value: "site-dri" },
];

export const DAY_OPTIONS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(d => ({
  label: d[0].toUpperCase() + d.slice(1), value: d,
}));

export interface UserOption { _id: string; name: string; email: string; }

export function newStage(): WorkflowTemplateStage {
  return {
    name: "", order: 0, assignedRole: "any", assignedUserId: null,
    slaHours: 24, businessHoursOnly: false, workingDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    reminderBeforeMinutes: 0, escalateAfterMinutes: 0, escalateToUserId: null,
  };
}

export function StageBuilder({
  stages, onChange, users,
}: {
  stages: WorkflowTemplateStage[];
  onChange: (stages: WorkflowTemplateStage[]) => void;
  users: UserOption[];
}) {
  const upd = (i: number, patch: Partial<WorkflowTemplateStage>) =>
    onChange(stages.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  const userOptions = users.map(u => ({ label: `${u.name} (${u.email})`, value: u._id }));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">Stages</div>
        <Btn small outline icon={Plus} label="Add Stage" onClick={() => onChange([...stages, newStage()])} />
      </div>

      {stages.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg py-6 px-5 text-center text-gray-400 text-xs mb-3">
          No stages yet — e.g. "Contractor Sign-off", "AGM Approval", "GM Approval".
        </div>
      )}

      {stages.map((s, i) => (
        <div key={i} className="border border-gray-200 dark:border-gray-700/40 rounded-lg mb-2.5 p-3.5">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="bg-primary text-white rounded-full w-[22px] h-[22px] inline-flex items-center justify-center text-[11px] font-bold shrink-0">{i + 1}</span>
            <Field
              placeholder="Stage name, e.g. AGM Approval"
              value={s.name}
              onChange={e => upd(i, { name: e.target.value })}
              className="flex-1"
            />
            <Btn small color="red" icon={Trash2} onClick={() => onChange(stages.filter((_, idx) => idx !== i))} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <SField
              label="Assigned Role" value={s.assignedRole} options={ROLE_OPTIONS}
              onChange={v => upd(i, { assignedRole: v })}
            />
            <SField
              label="Assigned Person (optional)" placeholder="Anyone with the role"
              value={s.assignedUserId || null} options={userOptions}
              onChange={v => upd(i, { assignedUserId: v || null })}
            />
            <Field
              label="SLA (hours)" type="number" min={0.5} step={0.5}
              value={s.slaHours}
              onChange={e => upd(i, { slaHours: Number(e.target.value) || 1 })}
            />
            <Field
              label="Escalate After (min)" type="number" min={0} placeholder="0 = none"
              value={s.escalateAfterMinutes}
              onChange={e => upd(i, { escalateAfterMinutes: Number(e.target.value) || 0 })}
            />
          </div>

          <div className="mt-2.5">
            <Switch
              checked={s.businessHoursOnly}
              onChange={v => upd(i, { businessHoursOnly: v })}
              offLabel="Business hours only (9am–6pm)"
              onLabel="Business hours only (9am–6pm)"
            />
          </div>

          {s.businessHoursOnly && (
            <div className="mt-2.5">
              <MultiSelect
                label="Working Days" values={s.workingDays} options={DAY_OPTIONS}
                onChange={v => upd(i, { workingDays: v })}
              />
            </div>
          )}

          {s.escalateAfterMinutes > 0 && (
            <div className="mt-2.5 max-w-[50%]">
              <SField
                label="Escalate To (optional)" placeholder="Escalation contact"
                value={s.escalateToUserId || null} options={userOptions}
                onChange={v => upd(i, { escalateToUserId: v || null })}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
