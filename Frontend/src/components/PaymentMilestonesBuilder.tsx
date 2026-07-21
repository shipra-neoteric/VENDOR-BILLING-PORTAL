import { useEffect } from "react";
import { Button, Input, InputNumber, Select, Segmented, DatePicker, Row, Col } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import GstSelect from "./GstSelect";

export interface MilestoneDraft {
  id: string;
  stage: string;
  date: string;
  type: string;
  mode: string;
  // `amount` is always the resolved rupee figure actually used everywhere
  // downstream (payable calc, PDF, save payload) — amountMode/amountPercent
  // just remember *how* it was entered, so re-opening the form still shows
  // "10%" instead of silently converting it to a flat rupee value.
  amount: number | null;
  amountMode: "fixed" | "percent";
  amountPercent: number | null;
  // Flat rupee discount applied to this milestone only, before GST — e.g. a
  // negotiated reduction agreed on at this payment stage.
  discount: number | null;
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

export function newMilestone(): MilestoneDraft {
  return {
    id: crypto.randomUUID(),
    stage: "", date: "", type: "", mode: "Bank Transfer",
    amount: null, amountMode: "fixed", amountPercent: null, discount: null,
    gstPercent: 18, gstType: "exclusive",
  };
}

export function calcPayable(m: MilestoneDraft): number {
  const amt = Math.max(0, (m.amount || 0) - (m.discount || 0));
  if (m.gstType === "inclusive") return Math.round(amt);
  return Math.round(amt * (1 + (m.gstPercent || 0) / 100));
}

export function calcGrandTotal(items: MilestoneDraft[]): number {
  return items.reduce((s, m) => s + calcPayable(m), 0);
}

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export default function PaymentMilestonesBuilder({
  items, onChange, contractValueInclGst,
}: {
  items: MilestoneDraft[];
  onChange: (items: MilestoneDraft[]) => void;
  contractValueInclGst?: number;
}) {
  const upd = (id: string, patch: Partial<MilestoneDraft>) =>
    onChange(items.map(m => m.id === id ? { ...m, ...patch } : m));

  // Keep percent-based milestones' resolved rupee amount in sync if the
  // contract value changes later (e.g. scope items edited after a % was set).
  useEffect(() => {
    if (!contractValueInclGst) return;
    const stale = items.some(m => {
      if (m.amountMode !== "percent" || m.amountPercent == null) return false;
      return m.amount !== Math.round((m.amountPercent / 100) * contractValueInclGst);
    });
    if (!stale) return;
    onChange(items.map(m => (m.amountMode === "percent" && m.amountPercent != null)
      ? { ...m, amount: Math.round((m.amountPercent / 100) * contractValueInclGst) }
      : m));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractValueInclGst]);

  const grandTotal = calcGrandTotal(items);
  const exceeds = contractValueInclGst !== undefined && contractValueInclGst > 0 && grandTotal > contractValueInclGst;

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
            <Col xs={24} sm={5}>
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
            <Col xs={12} sm={3}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Mode</div>
              <Select value={m.mode} options={MODE_OPTIONS} style={{ width: "100%" }}
                onChange={v => upd(m.id, { mode: v })} />
            </Col>
            <Col xs={12} sm={4}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#9ba3b8" }}>Amount</span>
                <Segmented
                  size="small"
                  value={m.amountMode}
                  onChange={v => upd(m.id, { amountMode: v as "fixed" | "percent" })}
                  options={[{ label: "₹", value: "fixed" }, { label: "%", value: "percent" }]}
                />
              </div>
              {m.amountMode === "percent" ? (
                <>
                  <InputNumber
                    placeholder="% of contract"
                    value={m.amountPercent}
                    style={{ width: "100%" }}
                    min={0} max={100} step={0.1}
                    formatter={v => (v === undefined || v === null ? "" : `${v}%`)}
                    parser={v => Number(String(v ?? "").replace("%", "")) as unknown as number}
                    onChange={v => {
                      const pct = typeof v === "number" ? v : 0;
                      const resolved = contractValueInclGst ? Math.round((pct / 100) * contractValueInclGst) : 0;
                      upd(m.id, { amountPercent: pct, amount: resolved });
                    }}
                  />
                  <div style={{ fontSize: 10.5, color: "#9ba3b8", marginTop: 2 }}>
                    {contractValueInclGst ? `= ${fmt(m.amount || 0)}` : "Add scope of work items first"}
                  </div>
                </>
              ) : (
                <InputNumber placeholder="Amount" value={m.amount} style={{ width: "100%" }}
                  min={0} onChange={v => upd(m.id, { amount: v })} />
              )}
            </Col>
            <Col xs={12} sm={4}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>GST %</div>
              <GstSelect value={m.gstPercent} onChange={v => upd(m.id, { gstPercent: v })} style={{ width: "100%" }} />
            </Col>
            <Col xs={12} sm={4}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>GST Type</div>
              <Select
                value={m.gstType} style={{ width: "100%" }}
                options={[{ label: "Exclusive", value: "exclusive" }, { label: "Inclusive", value: "inclusive" }]}
                onChange={v => upd(m.id, { gstType: v })}
              />
            </Col>
            <Col xs={12} sm={4}>
              <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Discount (₹)</div>
              <InputNumber
                placeholder="0" value={m.discount} style={{ width: "100%" }}
                min={0} onChange={v => upd(m.id, { discount: v })}
              />
            </Col>
          </Row>
          <Row gutter={[10, 0]} style={{ marginTop: 8 }}>
            <Col flex="auto">
              <div style={{ fontSize: 12, color: "#5a6278" }}>
                {(m.discount || 0) > 0 && (
                  <>Less discount: <strong style={{ fontFamily: "monospace", color: "#dc2626" }}>{fmt(m.discount || 0)}</strong> · </>
                )}
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
        <div style={{ background: exceeds ? "#fef2f2" : "#fff8f3", border: `1px solid ${exceeds ? "#fca5a5" : "#f8c9a0"}`, borderRadius: 8, padding: "10px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, color: "#5a6278" }}>Grand Total Payable</span>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: exceeds ? "#dc2626" : "#d4620c", fontSize: 15 }}>{fmt(grandTotal)}</span>
          </div>
          {exceeds && (
            <div style={{ fontSize: 12, color: "#dc2626", marginTop: 6, fontWeight: 600 }}>
              ⚠ Exceeds the scope of work's contract value (incl. GST) of {fmt(contractValueInclGst!)} by {fmt(grandTotal - contractValueInclGst!)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
