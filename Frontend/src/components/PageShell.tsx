import type { ReactNode } from "react";

interface PageShellProps {
  title: ReactNode;
  description?: string;
  cta?: ReactNode;
  children: ReactNode;
}

export default function PageShell({ title, description, cta, children }: PageShellProps) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--nx-text)", margin: 0, lineHeight: 1.3 }}>
            {title}
          </h1>
          {description && (
            <p style={{ fontSize: 13, color: "var(--nx-text-2)", margin: "4px 0 0", lineHeight: 1.5 }}>
              {description}
            </p>
          )}
        </div>
        {cta && <div>{cta}</div>}
      </div>
      {children}
    </div>
  );
}
