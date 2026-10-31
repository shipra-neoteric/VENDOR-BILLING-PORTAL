// A vendor as approvers see it: when the vendor belongs to a Vendor Group only the group's name is
// shown, and the individual vendor chosen to be paid (the payee) appears below it as "Pay to".
// Vendors with no group show their own name, as before.
export default function VendorParty({ vendorName, groupName, payeeName }: {
  vendorName?: string; groupName?: string; payeeName?: string;
}) {
  const main = groupName || vendorName;
  if (!main) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  const payee = payeeName && payeeName !== main ? payeeName : "";
  return (
    <>
      <div className="truncate">{main}</div>
      {payee && <div className="truncate text-[10px] text-gray-400 dark:text-gray-500">Pay to: {payee}</div>}
    </>
  );
}

// Plain-text version for detail lines: "Group — Pay to: Vendor".
export function vendorPartyText(vendorName?: string, groupName?: string, payeeName?: string): string {
  const main = groupName || vendorName || "—";
  const payee = payeeName && payeeName !== main ? payeeName : "";
  return payee ? `${main} — Pay to: ${payee}` : main;
}
