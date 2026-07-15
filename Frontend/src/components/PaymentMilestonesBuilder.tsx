import { Button, Input, InputNumber, Select, DatePicker, Row, Col } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

export interface MilestoneDraft {
  id: string;
  stage: string;
  date: string;
  type: string;
  mode: string;
  amount: number | null;
  gstPercent: number;
  gstType: "inclusive" | "exclusive";
}

const MODE_OPTIONS = [
  { label: "Bank Transfer", value: "Bank Transfer" },
  { label: "NEFT",          value: "NEFT" },
  { label: "RTGS",          value: "RTGS" },
  { label: "UPI",           value: "UPI" },
  { label: "Cheque",        value: "Cheque" },
  { label: "Cash",          value: "Cash" },
];

const GST_OPTIONS = [0, 5, 12, 18, 28].map(v => ({ label: `${v}%`, value: v }));

export function newMilestone(): MilestoneDraft {
  return {
    id: crypto.randomUUID(),
    stage: "", date: "", type: "", mode: "Bank Transfer",
    amount: null, gstPercent: 18, gstType: "exclusive",
  };
}

export function calcPayable(m: MilestoneDraft): number {
  const amt = m.amount || 0;
  if (m.gstType === "inclusive") return Math.round(amt);
  return Math.round(amt * (1 + (m.gstPercent || 0) / 100));
}

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export default function PaymentMilestonesBuilder({
  items, onChange,
}: {
  items: MilestoneDraft[];
  onChange: (items: MilestoneDraft[]) => void;
}) {
  const upd = (id: string, patch: Partial<MilestoneDraft>) =>
    onChange(items.map(m => m.id === id ? { ...m, ...patch } : m));

  const grandTotal = items.reduce((s, m) => s + calcPayable(m), 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1f2e" }}>Payment Milestones</div>
        <Button
          type="dashed" icon={<PlusOutlined />} size="small"
          onClick={() => onChange([...items, newMilestone()])}
          style={{ borderColor: "#f37916", color: "#f37916" }}
        >
          Add Milestone
        </Button>
      </div>

      {items.length === 0 && (
        <div style={{ border: "2px dashed #e4e7ee", borderRadius: 8, padding: "24px 20px", textAlign: "center", color: "#9ba3b8", marginBottom: 12 }}>
          <div style={{ fontSize: 12 }}>No payment milestones yet — e.g. "At the time of Order", "On Dispatch", "On Delivery".</div>
        </div>
      )}

      {items.map((m, idx) => (
        <div key={m.id} style={{ border: "1px solid #e4e7ee", borderRadius: 8, marginBottom: 10, padding: "12px 14px" }}>
          <Row gutter={[10, 10]}>
            <Col xs={24} sm={6}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Stage / Type</div>
              <Input
                placeholder='e.g. "At the time of Order"'
                value={m.type}
                onChange={e => upd(m.id, { type: e.target.value, stage: m.stage || `Milestone ${idx + 1}` })}
              />
            </Col>
            <Col xs={12} sm={4}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Date</div>
              <DatePicker
                format="DD/MM/YYYY" style={{ width: "100%" }}
                value={m.date ? dayjs(m.date) : null}
                onChange={d => upd(m.id, { date: d ? d.format("YYYY-MM-DD") : "" })}
              />
            </Col>
            <Col xs={12} sm={4}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Mode</div>
              <Select value={m.mode} options={MODE_OPTIONS} style={{ width: "100%" }}
                onChange={v => upd(m.id, { mode: v })} />
            </Col>
            <Col xs={12} sm={4}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Amount (₹)</div>
              <InputNumber placeholder="Amount" value={m.amount} style={{ width: "100%" }}
                min={0} onChange={v => upd(m.id, { amount: v })} />
            </Col>
            <Col xs={12} sm={3}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>GST %</div>
              <Select value={m.gstPercent} options={GST_OPTIONS} style={{ width: "100%" }}
                onChange={v => upd(m.id, { gstPercent: v })} />
            </Col>
            <Col xs={12} sm={3}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>GST Type</div>
              <Select
                value={m.gstType} style={{ width: "100%" }}
                options={[{ label: "Exclusive", value: "exclusive" }, { label: "Inclusive", value: "inclusive" }]}
                onChange={v => upd(m.id, { gstType: v })}
              />
            </Col>
          </Row>
          <Row gutter={[10, 0]} style={{ marginTop: 8 }}>
            <Col flex="auto">
              <div style={{ fontSize: 12, color: "#5a6278" }}>
                Payable: <strong style={{ fontFamily: "monospace", color: "#d4620c" }}>{fmt(calcPayable(m))}</strong>
              </div>
            </Col>
            <Col>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}
                onClick={() => onChange(items.filter(x => x.id !== m.id))} style={{ padding: 0 }} />
            </Col>
          </Row>
        </div>
      ))}

      {items.length > 0 && (
        <div style={{ background: "#fff8f3", border: "1px solid #f8c9a0", borderRadius: 8, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600, color: "#5a6278" }}>Grand Total Payable</span>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#d4620c", fontSize: 15 }}>{fmt(grandTotal)}</span>
        </div>
      )}
    </div>
  );
}
