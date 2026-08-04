import Card from "../ui/Card";
import Field from "../ui/Field";
import SField from "../ui/SField";
import {
  WORK_DELAYED_OPTIONS, LABOUR_SHORT_OPTIONS, ADDITIONAL_LABOUR_OPTIONS,
  MATERIAL_SHORT_OPTIONS, MATERIAL_RUNOUT_OPTIONS, YES_NO_OPTIONS,
  DRAWING_PENDING_OPTIONS, DRAWING_PENDING_DAYS_OPTIONS,
  CHALLENGE_BLOCKING_OPTIONS, ESCALATION_REQUIRED_OPTIONS,
} from "../shared/constants/dprOptions";
import type { DprFormValues } from "../shared/constants/dprOptions";

const opts = (arr: string[]) => arr.map(v => ({ label: v, value: v }));

function SectionCard({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <Card padded={false} className="mb-5 overflow-hidden">
      <div className="px-4 py-2.5 font-bold text-white" style={{ background: color }}>{title}</div>
      <div className="p-4 flex flex-col gap-4">{children}</div>
    </Card>
  );
}

interface Props {
  values: Partial<DprFormValues>;
  onChange: (patch: Partial<DprFormValues>) => void;
}

// The full Daily Project Report question set, field-for-field with the
// team's existing Google Form — shared between the public (no-login) and
// authenticated (DRI dashboard) submission pages so the two can never drift.
export default function DailyProjectReportSections({ values, onChange }: Props) {
  return (
    <>
      <SectionCard title="Work Progress" color="#4f46e5">
        <Field
          textarea label="Tomorrow's Plan" required rows={2}
          hint="Describe what activities will happen on site tomorrow"
          placeholder="e.g. Shuttering for 2nd floor slab, plastering on Tower B ground floor…"
          value={values.tomorrowsPlan ?? ""}
          onChange={e => onChange({ tomorrowsPlan: e.target.value })}
        />
        <SField
          label="Is any work delayed today?" required placeholder="Choose"
          value={values.workDelayed ?? null}
          onChange={v => onChange({ workDelayed: v })}
          options={opts(WORK_DELAYED_OPTIONS)}
        />
      </SectionCard>

      <SectionCard title="Labour Alert" color="#4f46e5">
        <SField
          label="Is labour short on any contractor's team today?" required placeholder="Choose"
          value={values.labourShort ?? null}
          onChange={v => onChange({ labourShort: v })}
          options={opts(LABOUR_SHORT_OPTIONS)}
        />
        <SField
          label="How many additional labour needed tomorrow?" placeholder="Choose"
          value={values.additionalLabourNeeded ?? null}
          onChange={v => onChange({ additionalLabourNeeded: v })}
          options={opts(ADDITIONAL_LABOUR_OPTIONS)}
        />
        <Field
          label="What work will stop if labour not arranged?" placeholder="Optional"
          value={values.labourShortageImpact ?? ""}
          onChange={e => onChange({ labourShortageImpact: e.target.value })}
        />
      </SectionCard>

      <SectionCard title="Critical Material Alert" color="#4f46e5">
        <SField
          label="Is any critical material running short?" required placeholder="Choose"
          value={values.materialShort ?? null}
          onChange={v => onChange({ materialShort: v })}
          options={opts(MATERIAL_SHORT_OPTIONS)}
        />
        <SField
          label="In how many days will it run out?" placeholder="Choose"
          value={values.materialRunOutDays ?? null}
          onChange={v => onChange({ materialRunOutDays: v })}
          options={opts(MATERIAL_RUNOUT_OPTIONS)}
        />
        <SField
          label="Did you receive the requested material on time?" required placeholder="Choose"
          value={values.materialReceivedOnTime ?? null}
          onChange={v => onChange({ materialReceivedOnTime: v })}
          options={opts(YES_NO_OPTIONS)}
        />
        <Field
          label="What activity will stop without this material?" placeholder="Optional"
          value={values.materialShortageImpact ?? ""}
          onChange={e => onChange({ materialShortageImpact: e.target.value })}
        />
      </SectionCard>

      <SectionCard title="Critical Drawing Alert" color="#4f46e5">
        <SField
          label="Is any critical drawing pending from Planning?" required placeholder="Choose"
          value={values.drawingPending ?? null}
          onChange={v => onChange({ drawingPending: v })}
          options={opts(DRAWING_PENDING_OPTIONS)}
        />
        <Field
          label="Drawing Reference or Description" placeholder="Optional"
          value={values.drawingReference ?? ""}
          onChange={e => onChange({ drawingReference: e.target.value })}
        />
        <SField
          label="Since how many days is it pending?" placeholder="Choose"
          value={values.drawingPendingDays ?? null}
          onChange={v => onChange({ drawingPendingDays: v })}
          options={opts(DRAWING_PENDING_DAYS_OPTIONS)}
        />
        <Field
          label="What activity will be blocked without this drawing?" placeholder="Optional"
          value={values.drawingBlockedActivity ?? ""}
          onChange={e => onChange({ drawingBlockedActivity: e.target.value })}
        />
      </SectionCard>

      <SectionCard title="Challenges & Escalations" color="#4f46e5">
        <SField
          label="Is there any challenge blocking work right now?" required placeholder="Choose"
          value={values.challengeBlocking ?? null}
          onChange={v => onChange({ challengeBlocking: v })}
          options={opts(CHALLENGE_BLOCKING_OPTIONS)}
        />
        <Field
          label="Describe the challenge briefly" placeholder="Optional"
          value={values.challengeDescription ?? ""}
          onChange={e => onChange({ challengeDescription: e.target.value })}
        />
        <SField
          label="Is escalation required from leadership today?" required placeholder="Choose"
          value={values.escalationRequired ?? null}
          onChange={v => onChange({ escalationRequired: v })}
          options={opts(ESCALATION_REQUIRED_OPTIONS)}
        />
        <Field
          label="What decision or action is needed from leadership?" placeholder="Optional"
          value={values.escalationAction ?? ""}
          onChange={e => onChange({ escalationAction: e.target.value })}
        />
      </SectionCard>
    </>
  );
}
