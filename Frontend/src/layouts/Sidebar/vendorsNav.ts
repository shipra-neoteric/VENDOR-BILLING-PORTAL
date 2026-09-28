import type { ReactNode } from "react";
import { Users, Ruler, Network } from "lucide-react";
import { createElement } from "react";

export interface VendorsNavItem {
  name: string;
  path: string;
  icon: ReactNode;
}

// Single source of truth for the "Vendors" section — Contractors,
// Consultants and Vendor Groups, previously scattered across the
// "Contractors" and "Professional Services" sidebar groups, now reachable
// only through this one section. Existing routes are reused as-is
// (/contractors, /consultants, /vendor-groups) — a navigation regrouping
// only, not a new set of pages.
export const VENDORS_ITEMS: VendorsNavItem[] = [
  { name: "Contractors",   path: "/contractors",   icon: createElement(Users, { className: "w-4 h-4" }) },
  { name: "Consultants",   path: "/consultants",   icon: createElement(Ruler, { className: "w-4 h-4" }) },
  { name: "Vendor Groups", path: "/vendor-groups", icon: createElement(Network, { className: "w-4 h-4" }) },
];

export const VENDORS_PATHS = VENDORS_ITEMS.map(i => i.path);

// True while the current pathname is one of the Vendors pages — used to
// decide whether the secondary Vendors panel should render alongside the
// main sidebar.
export function isVendorsPath(pathname: string): boolean {
  return VENDORS_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
}
