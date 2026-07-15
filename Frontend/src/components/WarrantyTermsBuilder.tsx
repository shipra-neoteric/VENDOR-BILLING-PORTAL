import { Button, Input } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";

export default function WarrantyTermsBuilder({
  items, onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1f2e" }}>Warranty / Guarantee Terms</div>
        <Button
          type="dashed" icon={<PlusOutlined />} size="small"
          onClick={() => onChange([...items, ""])}
          style={{ borderColor: "#f37916", color: "#f37916" }}
        >
          Add Term
        </Button>
      </div>

      {items.length === 0 && (
        <div style={{ border: "2px dashed #e4e7ee", borderRadius: 8, padding: "20px 20px", textAlign: "center", color: "#9ba3b8", marginBottom: 12, fontSize: 12 }}>
          No warranty / guarantee terms yet — e.g. "5-year structural warranty on RCC work".
        </div>
      )}

      {items.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "#9ba3b8", minWidth: 18, marginTop: 8, fontWeight: 600 }}>{i + 1}.</span>
          <Input.TextArea
            rows={2}
            placeholder="e.g. Contractor provides a 2-year warranty against workmanship defects"
            value={t}
            onChange={e => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            style={{ flex: 1 }}
          />
          <Button type="link" size="small" danger icon={<DeleteOutlined />}
            onClick={() => onChange(items.filter((_, idx) => idx !== i))} style={{ marginTop: 2 }} />
        </div>
      ))}
    </div>
  );
}
