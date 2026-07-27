import type { ReactNode } from "react";
import { Descriptions, Tag } from "antd";
import { vendorLabel } from "../utils/vendorLabel";
import type { Contractor } from "../types/VendorBilling";

const DOCUMENT_FIELD_LABELS: { key: string; label: string }[] = [
  { key: "gstCertificate",  label: "GST Certificate" },
  { key: "panCard",         label: "PAN Card" },
  { key: "cancelledCheque", label: "Cancelled Cheque" },
  { key: "businessCard",    label: "Business Card" },
  { key: "aadhaarCard",     label: "Aadhaar Card" },
];

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: "#6B7280",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        borderBottom: "1px solid #E5E7EB",
        paddingBottom: 8,
        marginBottom: 16,
        marginTop: 24,
      }}
    >
      {children}
    </div>
  );
}

// The complete contractor profile — Firm/Bank/Tax/Work Types/References/
// Documents — shared verbatim between the Contractors page's own "View
// Profile" drawer and any other place (e.g. Accounts Payment's vendor
// quick-view) that needs the exact same detail, not a trimmed-down
// re-implementation that can drift out of sync with it.
export default function ContractorDetailView({ contractor }: { contractor: Contractor }) {
  const c = contractor;
  return (
    <>
      <SectionHeading>Firm Details</SectionHeading>
      <Descriptions column={2} size="small">
        <Descriptions.Item label="Vendor Code" span={2}>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00" }}>
            {c.vendorCode}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="Company">{vendorLabel(c.companyName, c.shortCode)}</Descriptions.Item>
        <Descriptions.Item label="Owner">{c.ownerName}</Descriptions.Item>
        <Descriptions.Item label="Mobile">{c.mobile}</Descriptions.Item>
        <Descriptions.Item label="Alt. Mobile">{c.alternateMobile || "—"}</Descriptions.Item>
        <Descriptions.Item label="Email" span={2}>{c.email || "—"}</Descriptions.Item>
        <Descriptions.Item label="Address" span={2}>{c.address}</Descriptions.Item>
      </Descriptions>

      <SectionHeading>Bank Details</SectionHeading>
      <Descriptions column={2} size="small">
        <Descriptions.Item label="Account Holder">{c.accountHolderName}</Descriptions.Item>
        <Descriptions.Item label="Bank">{c.bankName}</Descriptions.Item>
        <Descriptions.Item label="Account No.">{c.accountNumber}</Descriptions.Item>
        <Descriptions.Item label="IFSC">{c.ifscCode}</Descriptions.Item>
        <Descriptions.Item label="Branch">{c.branchName}</Descriptions.Item>
      </Descriptions>

      <SectionHeading>Tax Details</SectionHeading>
      <Descriptions column={2} size="small">
        <Descriptions.Item label="GST">{c.gstNumber || "—"}</Descriptions.Item>
        <Descriptions.Item label="PAN">{c.panNumber || "—"}</Descriptions.Item>
        <Descriptions.Item label="Aadhaar">{c.aadhaarNumber || "—"}</Descriptions.Item>
      </Descriptions>

      <SectionHeading>Work Types</SectionHeading>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(c.workTypes || []).map((t) => (
          <Tag key={t} color="orange">{t}</Tag>
        ))}
      </div>

      {(c.reference1 || c.reference2 || c.averageTurnover) && (
        <>
          <SectionHeading>References</SectionHeading>
          <Descriptions column={1} size="small">
            {c.reference1 && (
              <Descriptions.Item label="Reference 1">{c.reference1}</Descriptions.Item>
            )}
            {c.reference2 && (
              <Descriptions.Item label="Reference 2">{c.reference2}</Descriptions.Item>
            )}
            {c.averageTurnover && (
              <Descriptions.Item label="Avg. Turnover">
                ₹{c.averageTurnover} Lakhs
              </Descriptions.Item>
            )}
          </Descriptions>
        </>
      )}

      {c.documents && Object.values(c.documents).some(d => d?.dataUrl) && (
        <>
          <SectionHeading>Documents</SectionHeading>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {DOCUMENT_FIELD_LABELS.filter(({ key }) => c.documents?.[key]?.dataUrl).map(({ key, label }) => (
              <a
                key={key}
                href={c.documents![key]!.dataUrl}
                download={c.documents![key]!.fileName || label}
                style={{
                  display: "flex", alignItems: "center", gap: 8, fontSize: 13,
                  color: "#FF7A00", textDecoration: "none",
                }}
              >
                📎 {label}
                <span style={{ color: "#9CA3AF", fontSize: 12 }}>({c.documents![key]!.fileName || "download"})</span>
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}
