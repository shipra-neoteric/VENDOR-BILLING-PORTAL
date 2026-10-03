import type { ReactNode } from "react";
import { Building2, Landmark, Tags, UserPlus, Settings, Database, Share2, LayoutGrid, Repeat } from "lucide-react";
import { createElement } from "react";

export interface MastersNavItem {
  name: string;
  path: string;
  icon: ReactNode;
}

// The Masters landing page (new — see Frontend/src/pages/MastersOverview),
// kept separate from MASTERS_ITEMS below since it's rendered as its own
// highlighted entry at the top of the secondary panel (MastersSidebar),
// not part of the plain vertical list.
export const MASTERS_OVERVIEW_ITEM: MastersNavItem = {
  name: "Overview", path: "/masters", icon: createElement(LayoutGrid, { className: "w-4 h-4" }),
};

// Single source of truth for the "Masters" admin section — shared by the
// main Sidebar (which just needs the path list, to know when the secondary
// panel below should be visible) and MastersSidebar (which renders the
// actual panel). Existing routes are reused as-is (/projects, /companies,
// etc.) — Masters is a navigation regrouping only, not a new set of pages
// (Overview above is the one new page this section adds).
export const MASTERS_ITEMS: MastersNavItem[] = [
  { name: "Projects",     path: "/projects",     icon: createElement(Building2, { className: "w-4 h-4" }) },
  { name: "Companies",    path: "/companies",    icon: createElement(Landmark, { className: "w-4 h-4" }) },
  { name: "Categories",   path: "/categories",   icon: createElement(Tags, { className: "w-4 h-4" }) },
  { name: "Public Forms", path: "/public-forms", icon: createElement(Share2, { className: "w-4 h-4" }) },
  { name: "SLA",          path: "/sla-settings", icon: createElement(Settings, { className: "w-4 h-4" }) },
  { name: "Users",        path: "/users",        icon: createElement(UserPlus, { className: "w-4 h-4" }) },
  { name: "Backup",       path: "/backup",       icon: createElement(Database, { className: "w-4 h-4" }) },
  { name: "Recurring Billing", path: "/recurring-billing", icon: createElement(Repeat, { className: "w-4 h-4" }) },
];

export const MASTERS_PATHS = [MASTERS_OVERVIEW_ITEM.path, ...MASTERS_ITEMS.map(i => i.path)];

// True while the current pathname is one of the Masters pages (including
// their own sub-routes, e.g. /users/roles/:id) — used to decide whether the
// secondary Masters panel should render alongside the main sidebar.
export function isMastersPath(pathname: string): boolean {
  return MASTERS_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
}
