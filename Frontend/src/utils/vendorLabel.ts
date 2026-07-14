// Some vendor codes are separate tax entities that are, in practice, all
// billed under one real-world firm (e.g. VC-1/VC-2/VC-3 for A/B/C all under
// firm "D"). `shortCode` lets a contractor be tagged with that firm's short
// form, shown in brackets so it's obvious they're grouped together.
export function vendorLabel(companyName: string, shortCode?: string): string {
  return shortCode ? `${companyName} (${shortCode})` : companyName;
}
