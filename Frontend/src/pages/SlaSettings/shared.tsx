import { Button, Input, Select, InputNumber, Switch, Row, Col } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import type { WorkflowTemplateStage, WorkflowEntityType } from "../../types/Workflow";

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
  { label: "CEO",        value: "ceo" },
  { label: "Engineer",   value: "engineer" },
  { label: "Accounts",   value: "accounts" },
  { label: "Contractor", value: "contractor" },
  { label: "DRI",        value: "dri" },
];

export const DAY_OPTIONS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(d => ({
  label: d[0].toUpperCase() + d.slice(1), value: d,
}));

export interface UserOption { _id: string; name: string; email: string; }

export function newStage(): WorkflowTemplateStage {
  return {
    name: "", order: 0, assignedRole: "any", assignedUserId: null,
    slaHours: 24, businessHoursOnly: false, workingDays: ["mon", "tue", "wed", "thu", "fri"],
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

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Stages</div>
        <Button type="dashed" icon={<PlusOutlined />} size="small"
          onClick={() => onChange([...stages, newStage()])}
          style={{ borderColor: "#f37916", color: "#f37916" }}>
          Add Stage
        </Button>
      </div>

      {stages.length === 0 && (
        <div style={{ border: "2px dashed #e4e7ee", borderRadius: 8, padding: "24px 20px", textAlign: "center", color: "#9ba3b8", marginBottom: 12, fontSize: 12 }}>
          No stages yet — e.g. "Contractor Sign-off", "AGM Approval", "GM Approval".
        </div>
      )}

      {stages.map((s, i) => (
        <div key={i} style={{ border: "1px solid #e4e7ee", borderRadius: 8, marginBottom: 10, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ background: "#f37916", color: "#fff", borderRadius: "50%", width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
            <Input
              placeholder="Stage name, e.g. AGM Approval"
              value={s.name}
              onChange={e => upd(i, { name: e.target.value })}
              style={{ flex: 1 }}
            />
            <Button type="link" danger size="small" icon={<DeleteOutlined />}
              onClick={() => onChange(stages.filter((_, idx) => idx !== i))} />
          </div>

          <Row gutter={[10, 10]}>
            <Col xs={12} sm={6}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Assigned Role</div>
              <Select value={s.assignedRole} options={ROLE_OPTIONS} style={{ width: "100%" }}
                onChange={v => upd(i, { assignedRole: v })} />
            </Col>
            <Col xs={12} sm={6}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Assigned Person (optional)</div>
              <Select
                allowClear placeholder="Anyone with the role"
                value={s.assignedUserId || undefined}
                options={users.map(u => ({ label: `${u.name} (${u.email})`, value: u._id }))}
                style={{ width: "100%" }} showSearch
                filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
                onChange={v => upd(i, { assignedUserId: v || null })}
              />
            </Col>
            <Col xs={12} sm={4}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>SLA (hours)</div>
              <InputNumber min={0.5} step={0.5} value={s.slaHours} style={{ width: "100%" }}
                onChange={v => upd(i, { slaHours: v || 1 })} />
            </Col>
            <Col xs={12} sm={4}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Escalate After (min)</div>
              <InputNumber min={0} placeholder="0 = none" value={s.escalateAfterMinutes} style={{ width: "100%" }}
                onChange={v => upd(i, { escalateAfterMinutes: v || 0 })} />
            </Col>
            <Col xs={24} sm={4} style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
              <Switch size="small" checked={s.businessHoursOnly}
                onChange={v => upd(i, { businessHoursOnly: v })} />
              <span style={{ fontSize: 12, color: "var(--nx-text-2)" }}>Business hours only (9am–6pm)</span>
            </Col>
          </Row>

          {s.businessHoursOnly && (
            <Row style={{ marginTop: 10 }}>
              <Col span={24}>
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Working Days</div>
                <Select mode="multiple" value={s.workingDays} options={DAY_OPTIONS} style={{ width: "100%" }}
                  onChange={v => upd(i, { workingDays: v })} />
              </Col>
            </Row>
          )}

          {s.escalateAfterMinutes > 0 && (
            <Row style={{ marginTop: 10 }}>
              <Col span={12}>
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Escalate To (optional)</div>
                <Select
                  allowClear placeholder="Escalation contact"
                  value={s.escalateToUserId || undefined}
                  options={users.map(u => ({ label: `${u.name} (${u.email})`, value: u._id }))}
                  style={{ width: "100%" }} showSearch
                  filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
                  onChange={v => upd(i, { escalateToUserId: v || null })}
                />
              </Col>
            </Row>
          )}
        </div>
      ))}
    </div>
  );
}
