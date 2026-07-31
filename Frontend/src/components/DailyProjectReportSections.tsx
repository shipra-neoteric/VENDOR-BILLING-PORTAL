import { Card, Form, Input, Select } from "antd";
import {
  WORK_DELAYED_OPTIONS, LABOUR_SHORT_OPTIONS, ADDITIONAL_LABOUR_OPTIONS,
  MATERIAL_SHORT_OPTIONS, MATERIAL_RUNOUT_OPTIONS, YES_NO_OPTIONS,
  DRAWING_PENDING_OPTIONS, DRAWING_PENDING_DAYS_OPTIONS,
  CHALLENGE_BLOCKING_OPTIONS, ESCALATION_REQUIRED_OPTIONS,
} from "../shared/constants/dprOptions";

const opts = (arr: string[]) => arr.map(v => ({ label: v, value: v }));

const sectionCardStyle: React.CSSProperties = { borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" };
const sectionTitleStyle = (color: string): React.CSSProperties => ({
  fontWeight: 700, color: "#fff", background: color, margin: "-1px -1px 0",
  padding: "10px 16px", borderRadius: "12px 12px 0 0",
});

// The full Daily Project Report question set, field-for-field with the
// team's existing Google Form — shared between the public (no-login) and
// authenticated (DRI dashboard) submission pages so the two can never drift.
export default function DailyProjectReportSections() {
  return (
    <>
      <Card
        title={<span style={sectionTitleStyle("#4f46e5")}>Work Progress</span>}
        styles={{ header: { padding: 0, border: "none" }, body: { paddingTop: 20 } }}
        style={sectionCardStyle}
      >
        <Form.Item
          label="Tomorrow's Plan"
          name="tomorrowsPlan"
          tooltip="Describe what activities will happen on site tomorrow"
          rules={[{ required: true, message: "Describe tomorrow's plan" }]}
        >
          <Input.TextArea rows={2} placeholder="e.g. Shuttering for 2nd floor slab, plastering on Tower B ground floor…" />
        </Form.Item>
        <Form.Item label="Is any work delayed today?" name="workDelayed" rules={[{ required: true, message: "Select an option" }]}>
          <Select placeholder="Choose" options={opts(WORK_DELAYED_OPTIONS)} />
        </Form.Item>
      </Card>

      <Card
        title={<span style={sectionTitleStyle("#4f46e5")}>Labour Alert</span>}
        styles={{ header: { padding: 0, border: "none" }, body: { paddingTop: 20 } }}
        style={sectionCardStyle}
      >
        <Form.Item label="Is labour short on any contractor's team today?" name="labourShort" rules={[{ required: true, message: "Select an option" }]}>
          <Select placeholder="Choose" options={opts(LABOUR_SHORT_OPTIONS)} />
        </Form.Item>
        <Form.Item label="How many additional labour needed tomorrow?" name="additionalLabourNeeded">
          <Select placeholder="Choose" allowClear options={opts(ADDITIONAL_LABOUR_OPTIONS)} />
        </Form.Item>
        <Form.Item label="What work will stop if labour not arranged?" name="labourShortageImpact">
          <Input placeholder="Optional" />
        </Form.Item>
      </Card>

      <Card
        title={<span style={sectionTitleStyle("#4f46e5")}>Critical Material Alert</span>}
        styles={{ header: { padding: 0, border: "none" }, body: { paddingTop: 20 } }}
        style={sectionCardStyle}
      >
        <Form.Item label="Is any critical material running short?" name="materialShort" rules={[{ required: true, message: "Select an option" }]}>
          <Select placeholder="Choose" options={opts(MATERIAL_SHORT_OPTIONS)} />
        </Form.Item>
        <Form.Item label="In how many days will it run out?" name="materialRunOutDays">
          <Select placeholder="Choose" allowClear options={opts(MATERIAL_RUNOUT_OPTIONS)} />
        </Form.Item>
        <Form.Item label="Did you receive the requested material on time?" name="materialReceivedOnTime" rules={[{ required: true, message: "Select an option" }]}>
          <Select placeholder="Choose" options={opts(YES_NO_OPTIONS)} />
        </Form.Item>
        <Form.Item label="What activity will stop without this material?" name="materialShortageImpact">
          <Input placeholder="Optional" />
        </Form.Item>
      </Card>

      <Card
        title={<span style={sectionTitleStyle("#4f46e5")}>Critical Drawing Alert</span>}
        styles={{ header: { padding: 0, border: "none" }, body: { paddingTop: 20 } }}
        style={sectionCardStyle}
      >
        <Form.Item label="Is any critical drawing pending from Planning?" name="drawingPending" rules={[{ required: true, message: "Select an option" }]}>
          <Select placeholder="Choose" options={opts(DRAWING_PENDING_OPTIONS)} />
        </Form.Item>
        <Form.Item label="Drawing Reference or Description" name="drawingReference">
          <Input placeholder="Optional" />
        </Form.Item>
        <Form.Item label="Since how many days is it pending?" name="drawingPendingDays">
          <Select placeholder="Choose" allowClear options={opts(DRAWING_PENDING_DAYS_OPTIONS)} />
        </Form.Item>
        <Form.Item label="What activity will be blocked without this drawing?" name="drawingBlockedActivity">
          <Input placeholder="Optional" />
        </Form.Item>
      </Card>

      <Card
        title={<span style={sectionTitleStyle("#4f46e5")}>Challenges &amp; Escalations</span>}
        styles={{ header: { padding: 0, border: "none" }, body: { paddingTop: 20 } }}
        style={sectionCardStyle}
      >
        <Form.Item label="Is there any challenge blocking work right now?" name="challengeBlocking" rules={[{ required: true, message: "Select an option" }]}>
          <Select placeholder="Choose" options={opts(CHALLENGE_BLOCKING_OPTIONS)} />
        </Form.Item>
        <Form.Item label="Describe the challenge briefly" name="challengeDescription">
          <Input placeholder="Optional" />
        </Form.Item>
        <Form.Item label="Is escalation required from leadership today?" name="escalationRequired" rules={[{ required: true, message: "Select an option" }]}>
          <Select placeholder="Choose" options={opts(ESCALATION_REQUIRED_OPTIONS)} />
        </Form.Item>
        <Form.Item label="What decision or action is needed from leadership?" name="escalationAction">
          <Input placeholder="Optional" />
        </Form.Item>
      </Card>
    </>
  );
}
