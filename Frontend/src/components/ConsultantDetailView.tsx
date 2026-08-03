import type { ReactNode } from "react";
import { Descriptions, Tag } from "antd";
import type { Consultant } from "../types/VendorBilling";

const DOCUMENT_FIELD_LABELS: { key: string; label: string }[] = [
  { key: "gstCertificate",  label: "GST Certificate" },
  { key: "panCard",         label: "PAN Card" },
  { key: "cancelledCheque", label: "Cancelled Cheque" },
  { key: "businessCard",    label: "Business Card" },
  { key: "professionalRegistrationCert", label: "Professional Registration Certificate" },
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

// The complete consultant profile — mirrors ContractorDetailView's structure
// so both "master data" modules feel consistent, with consultancy-specific
// fields (registration/license/experience/software/portfolio) in place of
// work types/turnover/references.
export default function ConsultantDetailView({ consultant }: { consultant: Consultant }) {
  const c = consultant;
  return (
    <>
      <SectionHeading>Firm Details</SectionHeading>
      <Descriptions column={2} size="small">
        <Descriptions.Item label="Consultant Code" span={2}>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00" }}>
            {c.consultantCode}
          </span>
        </Descriptions.Item>
        <Descriptions.Item label="Firm / Consultant">{c.firmName}</Descriptions.Item>
        <Descriptions.Item label="Principal">{c.principalName}</Descriptions.Item>
        <Descriptions.Item label="Type" span={2}>
          <Tag color="purple">{c.consultancyType}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Mobile">{c.mobile}</Descriptions.Item>
        <Descriptions.Item label="Alt. Mobile">{c.alternateMobile || "—"}</Descriptions.Item>
        <Descriptions.Item label="Email" span={2}>{c.email || "—"}</Descriptions.Item>
        <Descriptions.Item label="Address" span={2}>{c.address || "—"}</Descriptions.Item>
      </Descriptions>

      <SectionHeading>Professional Details</SectionHeading>
      <Descriptions column={2} size="small">
        <Descriptions.Item label="Professional Registration">{c.professionalRegistration || "—"}</Descriptions.Item>
        <Descriptions.Item label="License No.">{c.licenseNo || "—"}</Descriptions.Item>
        <Descriptions.Item label="Experience">{c.experience || "—"}</Descriptions.Item>
        <Descriptions.Item label="Portfolio" span={2}>
          {c.portfolioUrl ? <a href={c.portfolioUrl} target="_blank" rel="noopener noreferrer">{c.portfolioUrl}</a> : "—"}
        </Descriptions.Item>
      </Descriptions>
      {(c.designSoftware || []).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {c.designSoftware!.map((s) => (
            <Tag key={s} color="blue">{s}</Tag>
          ))}
        </div>
      )}

      <SectionHeading>Bank Details</SectionHeading>
      <Descriptions column={2} size="small">
        <Descriptions.Item label="Account Holder">{c.accountHolderName || "—"}</Descriptions.Item>
        <Descriptions.Item label="Bank">{c.bankName || "—"}</Descriptions.Item>
        <Descriptions.Item label="Account No.">{c.accountNumber || "—"}</Descriptions.Item>
        <Descriptions.Item label="IFSC">{c.ifscCode || "—"}</Descriptions.Item>
        <Descriptions.Item label="Branch">{c.branchName || "—"}</Descriptions.Item>
      </Descriptions>

      <SectionHeading>Tax Details</SectionHeading>
      <Descriptions column={2} size="small">
        <Descriptions.Item label="PAN">{c.panNumber || "—"}</Descriptions.Item>
        <Descriptions.Item label="Aadhaar">{c.aadhaarNumber || "—"}</Descriptions.Item>
        <Descriptions.Item label="GST" span={2}>{c.gstNumber || "—"}</Descriptions.Item>
      </Descriptions>

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
