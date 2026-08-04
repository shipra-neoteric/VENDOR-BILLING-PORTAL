import { Paperclip } from "lucide-react";
import { vendorLabel } from "../utils/vendorLabel";
import type { Contractor } from "../types/VendorBilling";
import { Descriptions, DescItem, SectionHeading } from "../ui/Descriptions";
import Badge from "../ui/Badge";

const DOCUMENT_FIELD_LABELS: { key: string; label: string }[] = [
  { key: "gstCertificate",  label: "GST Certificate" },
  { key: "panCard",         label: "PAN Card" },
  { key: "cancelledCheque", label: "Cancelled Cheque" },
  { key: "businessCard",    label: "Business Card" },
  { key: "aadhaarCard",     label: "Aadhaar Card" },
];

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
      <Descriptions>
        <DescItem label="Vendor Code" span={2}>
          <span className="font-mono font-bold text-primary">{c.vendorCode}</span>
        </DescItem>
        <DescItem label="Company">{vendorLabel(c.companyName, c.shortCode)}</DescItem>
        <DescItem label="Owner">{c.ownerName}</DescItem>
        <DescItem label="Mobile">{c.mobile}</DescItem>
        <DescItem label="Alt. Mobile">{c.alternateMobile}</DescItem>
        <DescItem label="Email" span={2}>{c.email}</DescItem>
        <DescItem label="Address" span={2}>{c.address}</DescItem>
      </Descriptions>

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
        <DescItem label="GST">{c.gstNumber}</DescItem>
        <DescItem label="PAN">{c.panNumber}</DescItem>
        <DescItem label="Aadhaar">{c.aadhaarNumber}</DescItem>
      </Descriptions>

      <SectionHeading>Work Types</SectionHeading>
      <div className="flex flex-wrap gap-1.5">
        {(c.workTypes || []).map((t) => (
          <Badge key={t} color="orange">{t}</Badge>
        ))}
      </div>

      {(c.reference1 || c.reference2 || c.averageTurnover) && (
        <>
          <SectionHeading>References</SectionHeading>
          <Descriptions columns={1}>
            {c.reference1 && <DescItem label="Reference 1">{c.reference1}</DescItem>}
            {c.reference2 && <DescItem label="Reference 2">{c.reference2}</DescItem>}
            {c.averageTurnover && <DescItem label="Avg. Turnover">₹{c.averageTurnover} Lakhs</DescItem>}
          </Descriptions>
        </>
      )}

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
