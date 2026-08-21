import { Paperclip } from "lucide-react";
import type { Consultant } from "../types/VendorBilling";
import { Descriptions, DescItem, SectionHeading } from "../ui/Descriptions";
import Badge from "../ui/Badge";

const DOCUMENT_FIELD_LABELS: { key: string; label: string }[] = [
  { key: "gstCertificate",  label: "GST Certificate" },
  { key: "panCard",         label: "PAN Card" },
  { key: "cancelledCheque", label: "Cancelled Cheque" },
  { key: "businessCard",    label: "Business Card" },
  { key: "professionalRegistrationCert", label: "Professional Registration Certificate" },
];

// The complete consultant profile — mirrors ContractorDetailView's structure
// so both "master data" modules feel consistent, with consultancy-specific
// fields (registration/license/experience/software/portfolio) in place of
// work types/turnover/references.
export default function ConsultantDetailView({ consultant }: { consultant: Consultant }) {
  const c = consultant;
  return (
    <>
      <SectionHeading>Firm Details</SectionHeading>
      <Descriptions>
        <DescItem label="Consultant Code" span={2}>
          <span className="font-bold text-primary">{c.consultantCode}</span>
        </DescItem>
        <DescItem label="Firm / Consultant">{c.firmName}</DescItem>
        <DescItem label="Principal">{c.principalName}</DescItem>
        <DescItem label="Type" span={2}><Badge color="purple">{c.consultancyType}</Badge></DescItem>
        <DescItem label="Mobile">{c.mobile}</DescItem>
        <DescItem label="Alt. Mobile">{c.alternateMobile}</DescItem>
        <DescItem label="Email" span={2}>{c.email}</DescItem>
        <DescItem label="Address" span={2}>{c.address}</DescItem>
      </Descriptions>

      <SectionHeading>Professional Details</SectionHeading>
      <Descriptions>
        <DescItem label="Professional Registration">{c.professionalRegistration}</DescItem>
        <DescItem label="License No.">{c.licenseNo}</DescItem>
        <DescItem label="Experience">{c.experience}</DescItem>
        <DescItem label="Portfolio" span={2}>
          {c.portfolioUrl ? <a href={c.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{c.portfolioUrl}</a> : undefined}
        </DescItem>
      </Descriptions>
      {(c.designSoftware || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {c.designSoftware!.map((s) => (
            <Badge key={s} color="blue">{s}</Badge>
          ))}
        </div>
      )}

      <SectionHeading>Bank Details</SectionHeading>
      <Descriptions>
        <DescItem label="Account Holder">{c.accountHolderName}</DescItem>
        <DescItem label="Bank">{c.bankName}</DescItem>
        <DescItem label="Account No.">{c.accountNumber}</DescItem>
        <DescItem label="IFSC">{c.ifscCode}</DescItem>
        <DescItem label="Branch">{c.branchName}</DescItem>
      </Descriptions>

      <SectionHeading>Tax Details</SectionHeading>
      <Descriptions>
        <DescItem label="PAN">{c.panNumber}</DescItem>
        <DescItem label="Aadhaar">{c.aadhaarNumber}</DescItem>
        <DescItem label="GST" span={2}>{c.gstNumber}</DescItem>
      </Descriptions>

      {c.documents && Object.values(c.documents).some(d => d?.dataUrl) && (
        <>
          <SectionHeading>Documents</SectionHeading>
          <div className="flex flex-col gap-1.5">
            {DOCUMENT_FIELD_LABELS.filter(({ key }) => c.documents?.[key]?.dataUrl).map(({ key, label }) => (
              <a
                key={key}
                href={c.documents![key]!.dataUrl}
                download={c.documents![key]!.fileName || label}
                className="flex items-center gap-2 text-[13px] text-primary no-underline hover:underline"
              >
                <Paperclip className="w-3.5 h-3.5" /> {label}
                <span className="text-gray-400 text-xs">({c.documents![key]!.fileName || "download"})</span>
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}
