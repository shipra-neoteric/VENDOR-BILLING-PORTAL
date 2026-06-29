import type { ReactNode } from "react";

interface PageShellProps {
  /** Page title */
  title: string;
  /** Short descriptive subtitle */
  description?: string;
  /** Primary CTA button (orange, top-right) */
  cta?: ReactNode;
  children: ReactNode;
}

/**
 * Standard page header used across all Vendor Billing pages.
 * Matches Nexora ERP layout: title + description left, CTA right.
 */
export default function PageShell({ title, description, cta, children }: PageShellProps) {
  return (
    <div>
      {/* Page header row */}
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
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#111827",
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            {title}
          </h1>
          {description && (
            <p
              style={{
                fontSize: 13,
                color: "#6B7280",
                margin: "4px 0 0",
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          )}
        </div>
        {cta && <div>{cta}</div>}
      </div>

      {/* Page body */}
      {children}
    </div>
  );
}
