import { Button, Input, InputNumber, Select, Segmented, Row, Col } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";

// A security deposit deliberately baked into a group of scope items' own
// rates — e.g. the true agreed rate is ₹290/sqft, but each particular is
// written up at a lower rate (summing to ₹275.5/sqft), holding back the
// ₹14.5/sqft gap as security until the work is verified. This builder exists
// so that gap can be verified arithmetically (selected items' own value +
// this deposit = the true full value you actually agreed) rather than
// trusting manual subtraction across several particulars to not have a
// mistake in it. Reference/tracking only — never drives contractValue.
export interface SecurityDepositDraft {
  id: string;
  scopeItemIds: string[];
  mode: "perUnit" | "percent";
  rate: number | null;
  notes: string;
}

export function newSecurityDeposit(): SecurityDepositDraft {
  return { id: crypto.randomUUID(), scopeItemIds: [], mode: "perUnit", rate: null, notes: "" };
}

interface ScopeItemLike { id: string; description: string; plannedQty: number | null; amount?: number }

// Sum of the selected items' own plannedQty (for perUnit mode) — assumes the
// same per-unit rate applies uniformly across every selected item, matching
// how a single deposit row is meant to cover one group (e.g. one floor).
export function calcDepositAmount(d: SecurityDepositDraft, scopeItems: ScopeItemLike[]): number {
  const selected = scopeItems.filter(si => d.scopeItemIds.includes(si.id));
  const rate = d.rate || 0;
  if (d.mode === "percent") {
    const base = selected.reduce((s, si) => s + (si.amount || 0), 0);
    return Math.round(base * rate) / 100;
  }
  const qty = selected.reduce((s, si) => s + (si.plannedQty || 0), 0);
  return Math.round(qty * rate * 100) / 100;
}

const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SecurityDepositBuilder({
  items, onChange, scopeItems,
}: {
  items: SecurityDepositDraft[];
  onChange: (items: SecurityDepositDraft[]) => void;
  scopeItems: ScopeItemLike[];
}) {
  const upd = (id: string, patch: Partial<SecurityDepositDraft>) =>
    onChange(items.map(d => d.id === id ? { ...d, ...patch } : d));

  const itemOptions = scopeItems
    .filter(si => si.description.trim())
    .map(si => ({ label: si.description, value: si.id }));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1f2e" }}>Security Deposit</div>
          <div style={{ fontSize: 11, color: "#9ba3b8", marginTop: 2 }}>
            Reference only — doesn't change the contract value. Use it to verify that a deliberately-reduced rate on the items above, plus this deposit, adds back up to the rate you actually agreed.
          </div>
        </div>
        <Button
          type="dashed" icon={<PlusOutlined />} size="small"
          onClick={() => onChange([...items, newSecurityDeposit()])}
          style={{ borderColor: "#f37916", color: "#f37916", flexShrink: 0 }}
        >
          Add Deposit
        </Button>
      </div>

      {items.length === 0 && (
        <div style={{ border: "2px dashed #e4e7ee", borderRadius: 8, padding: "20px", textAlign: "center", color: "#9ba3b8" }}>
          <div style={{ fontSize: 12 }}>No security deposits tracked — only needed if some work items' rates were deliberately reduced, holding back the gap as security.</div>
        </div>
      )}

      {items.map((d) => {
        const selected = scopeItems.filter(si => d.scopeItemIds.includes(si.id));
        const selectedValue = selected.reduce((s, si) => s + (si.amount || 0), 0);
        const depositAmount = calcDepositAmount(d, scopeItems);
        return (
          <div key={d.id} style={{ border: "1px solid #e4e7ee", borderRadius: 8, marginBottom: 10, padding: "12px 14px" }}>
            <Row gutter={[10, 10]}>
              <Col xs={24} sm={12}>
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Held Against Work Item(s)</div>
                <Select
                  mode="multiple"
                  placeholder="Select the work item(s) this deposit is held against"
                  value={d.scopeItemIds}
                  options={itemOptions}
                  style={{ width: "100%" }}
                  onChange={v => upd(d.id, { scopeItemIds: v })}
                />
              </Col>
              <Col xs={12} sm={6}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "#9ba3b8" }}>Held As</span>
                  <Segmented
                    size="small"
                    value={d.mode}
                    onChange={v => upd(d.id, { mode: v as "perUnit" | "percent" })}
                    options={[{ label: "Per Unit", value: "perUnit" }, { label: "%", value: "percent" }]}
                  />
                </div>
                <InputNumber
                  placeholder={d.mode === "percent" ? "% of selected items' value" : "e.g. 14.5 per unit"}
                  value={d.rate}
                  style={{ width: "100%" }}
                  min={0} step={d.mode === "percent" ? 1 : 0.1}
                  onChange={v => upd(d.id, { rate: v })}
                />
              </Col>
              <Col xs={12} sm={6}>
                <div style={{ fontSize: 11, color: "#9ba3b8", marginBottom: 4 }}>Deposit Amount</div>
                <div style={{ fontFamily: "monospace", fontWeight: 700, color: "#d4620c", fontSize: 14, paddingTop: 6 }}>
                  {fmt(depositAmount)}
                </div>
              </Col>
            </Row>
            <Row gutter={[10, 0]} style={{ marginTop: 8 }}>
              <Col flex="auto">
                <Input
                  placeholder="Notes (optional) — e.g. why this rate was reduced"
                  value={d.notes}
                  onChange={e => upd(d.id, { notes: e.target.value })}
                  size="small"
                />
              </Col>
              <Col>
                <Button type="link" size="small" danger icon={<DeleteOutlined />}
                  onClick={() => onChange(items.filter(x => x.id !== d.id))} style={{ padding: 0 }} />
              </Col>
            </Row>
            {selected.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #e4e7ee", fontSize: 12, color: "#5a6278" }}>
                Selected items' value <strong style={{ fontFamily: "monospace" }}>{fmt(selectedValue)}</strong>
                {" + "}Deposit <strong style={{ fontFamily: "monospace", color: "#d4620c" }}>{fmt(depositAmount)}</strong>
                {" = "}
                <strong style={{ fontFamily: "monospace", color: "#16a34a" }}>{fmt(selectedValue + depositAmount)}</strong>
                <span style={{ color: "#9ba3b8" }}> true full value — check this matches what you actually agreed</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
