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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
        {FORMS.map(f => (
          <div
            key={f.key}
            style={{
              background: "var(--nx-white)", border: "1px solid var(--nx-border)",
              borderRadius: 12, padding: "20px 20px 16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, background: `${f.color}18`,
                color: f.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
              }}>
                {f.icon}
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--nx-text)" }}>{f.name}</div>
            </div>
            <div style={{ fontSize: 12, color: "var(--nx-text-2)", marginBottom: 14, lineHeight: 1.5 }}>
              {f.description}
            </div>
            <div style={{
              background: "var(--nx-fill-2)", border: "1px solid var(--nx-border)", borderRadius: 8,
              padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "var(--nx-text-2)",
              marginBottom: 12, wordBreak: "break-all",
            }}>
              {origin}{f.path}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                icon={<CopyOutlined />}
                onClick={() => copyLink(f.path)}
                style={{ borderColor: f.color, color: f.color }}
              >
                Copy Link
              </Button>
              <Button
                icon={<ExportOutlined />}
                onClick={() => window.open(f.path, "_blank", "noopener,noreferrer")}
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
