import { Paperclip, Download } from "lucide-react";
import type { ReactNode } from "react";
import { vendorLabel } from "../utils/vendorLabel";
import type { Contractor } from "../types/VendorBilling";
import NxBadge from "../ui/nexora/Badge";
import Badge from "../ui/Badge";

const DOCUMENT_FIELD_LABELS: { key: string; label: string }[] = [
  { key: "gstCertificate",  label: "GST Certificate" },
  { key: "panCard",         label: "PAN Card" },
  { key: "cancelledCheque", label: "Cancelled Cheque" },
  { key: "businessCard",    label: "Business Card" },
  { key: "aadhaarCard",     label: "Aadhaar Card" },
];

// One accent-barred section title + its bordered card body — same visual
// language as Accounts Payment's bill detail drawer (orange accent bar,
// uppercase muted label), so a vendor profile opened from either page
// (Contractors' own "View Profile" drawer, or Accounts Payment's vendor
// quick-view) feels like it belongs to the same design system.
function ProfileCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/40 p-3.5 mb-3.5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-[15px] rounded bg-[#ff7a00]" />
        <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, span, children }: { label: string; span?: 2; children?: ReactNode }) {
  return (
    <div className={span === 2 ? "sm:col-span-2" : ""}>
      <div className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 mb-0.5">{label}</div>
      <div className="text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9]">{children ?? "—"}</div>
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
  const hasDocuments = c.documents && Object.values(c.documents).some(d => d?.dataUrl);
  return (
    <>
      {/* Header strip — company + vendor code + status at a glance, before
          drilling into any of the section cards below. */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700/40 bg-gray-50/60 dark:bg-gray-800/20 p-3.5 mb-3.5">
        <div className="min-w-0">
          <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9] truncate">
            {vendorLabel(c.companyName, c.shortCode)}
          </div>
          <div className="text-[12px] text-gray-400 mt-0.5">{c.ownerName}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <NxBadge color={(c.status || "active") === "active" ? "green" : "red"}>
            {((c.status || "active")).toUpperCase()}
          </NxBadge>
          <span className="font-bold text-[#ff7a00] text-sm">{c.vendorCode}</span>
        </div>
      </div>

      <ProfileCard title="Firm Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <Field label="Mobile">{c.mobile}</Field>
          <Field label="Alt. Mobile">{c.alternateMobile}</Field>
          <Field label="Email" span={2}>{c.email}</Field>
          <Field label="Address" span={2}>{c.address}</Field>
        </div>
      </ProfileCard>

      <ProfileCard title="Bank Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <Field label="Account Holder">{c.accountHolderName}</Field>
          <Field label="Bank">{c.bankName}</Field>
          <Field label="Account No.">{c.accountNumber}</Field>
          <Field label="IFSC">{c.ifscCode}</Field>
          <Field label="Branch">{c.branchName}</Field>
        </div>
      </ProfileCard>

      <ProfileCard title="Tax Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <Field label="GST">{c.gstNumber}</Field>
          <Field label="PAN">{c.panNumber}</Field>
          <Field label="Aadhaar">{c.aadhaarNumber}</Field>
        </div>
      </ProfileCard>

      <ProfileCard title="Work Types">
        <div className="flex flex-wrap gap-1.5">
          {(c.workTypes || []).length > 0
            ? c.workTypes!.map((t) => <Badge key={t} color="orange">{t}</Badge>)
            : <span className="text-[13px] text-gray-400">—</span>}
        </div>
      </ProfileCard>

      {(c.reference1 || c.reference2 || c.averageTurnover) && (
        <ProfileCard title="References">
          <div className="grid grid-cols-1 gap-y-3">
            {c.reference1 && <Field label="Reference 1">{c.reference1}</Field>}
            {c.reference2 && <Field label="Reference 2">{c.reference2}</Field>}
            {c.averageTurnover && <Field label="Avg. Turnover">₹{c.averageTurnover} Lakhs</Field>}
          </div>
        </ProfileCard>
      )}

      {hasDocuments && (
        <ProfileCard title="Documents">
          <div className="flex flex-col gap-1.5">
            {DOCUMENT_FIELD_LABELS.filter(({ key }) => c.documents?.[key]?.dataUrl).map(({ key, label }) => (
              <a
                key={key}
                href={c.documents![key]!.dataUrl}
                download={c.documents![key]!.fileName || label}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700/40 px-3 py-2 text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9] no-underline hover:border-[#ff7a00] hover:bg-orange-50/40 dark:hover:bg-orange-500/5 transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Paperclip className="w-3.5 h-3.5 text-[#ff7a00] shrink-0" />
                  <span className="font-medium">{label}</span>
                  <span className="text-gray-400 text-xs truncate">{c.documents![key]!.fileName || "download"}</span>
                </span>
                <Download className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              </a>
            ))}
          </div>
        </ProfileCard>
      )}
    </>
  );
}
