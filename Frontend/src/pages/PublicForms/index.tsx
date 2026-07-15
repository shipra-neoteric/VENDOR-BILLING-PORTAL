import type { ReactNode } from "react";
import { Button, message } from "antd";
import { CopyOutlined, ExportOutlined, FileTextOutlined, TeamOutlined } from "@ant-design/icons";
import PageShell from "../../components/PageShell";

interface PublicFormDef {
  key: string;
  name: string;
  description: string;
  path: string;
  icon: ReactNode;
  color: string;
}

const FORMS: PublicFormDef[] = [
  {
    key: "work-order",
    name: "New Work Order",
    description: "Lets anyone with the link submit a new work order request — no login required. Submissions land directly in Work Orders.",
    path: "/public/work-order",
    icon: <FileTextOutlined />,
    color: "#2563eb",
  },
  {
    key: "contractor",
    name: "Contractor Registration",
    description: "Lets a new vendor register themselves — no login required. Submissions land directly in Contractors with an auto-assigned vendor code.",
    path: "/public/contractor",
    icon: <TeamOutlined />,
    color: "#16a34a",
  },
];

export default function PublicForms() {
  const origin = window.location.origin;

  const copyLink = async (path: string) => {
    try {
      await navigator.clipboard.writeText(`${origin}${path}`);
      message.success("Link copied to clipboard");
    } catch {
      message.error("Couldn't copy — copy it manually from the address bar");
    }
  };

  return (
    <PageShell
      title="Public Forms"
      description="Shareable, no-login forms that write straight into this system — send the link to anyone outside your team."
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
        {FORMS.map(f => (
          <div
            key={f.key}
            style={{
              position: "relative",
              background: "var(--nx-white)", border: "1px solid var(--nx-border)",
              borderRadius: 16, padding: "24px 22px 20px", overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              transition: "box-shadow 0.2s ease, transform 0.2s ease",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = `0 10px 28px ${f.color}22`;
              e.currentTarget.style.transform = "translateY(-3px)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {/* Top accent bar */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: f.color }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{
                width: 46, height: 46, borderRadius: 12, background: `${f.color}15`,
                color: f.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                boxShadow: `0 2px 8px ${f.color}20`,
              }}>
                {f.icon}
              </div>
              <span style={{
                display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700,
                color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0",
                borderRadius: 20, padding: "3px 10px", textTransform: "uppercase", letterSpacing: "0.04em",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
                Live
              </span>
            </div>

            <div style={{ fontWeight: 700, fontSize: 17, color: "var(--nx-text)", marginBottom: 6 }}>{f.name}</div>
            <div style={{ fontSize: 13, color: "var(--nx-text-2)", marginBottom: 18, lineHeight: 1.6 }}>
              {f.description}
            </div>

            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--nx-fill-2)", border: "1px dashed var(--nx-border)", borderRadius: 10,
              padding: "10px 12px", marginBottom: 16,
            }}>
              <span style={{ fontSize: 13, flexShrink: 0 }}>🔗</span>
              <span style={{
                fontFamily: "monospace", fontSize: 12, color: "var(--nx-text-2)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0,
              }}>
                {origin}{f.path}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <Button
                type="primary"
                icon={<CopyOutlined />}
                onClick={() => copyLink(f.path)}
                style={{ background: f.color, borderColor: f.color, flex: "2 1 auto" }}
              >
                Copy Link
              </Button>
              <Button
                icon={<ExportOutlined />}
                onClick={() => window.open(f.path, "_blank", "noopener,noreferrer")}
                style={{ flex: "1 1 auto" }}
              >
                Open
              </Button>
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
