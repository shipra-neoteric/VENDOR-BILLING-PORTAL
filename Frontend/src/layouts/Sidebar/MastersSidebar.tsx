import { NavLink } from "react-router-dom";
import { MASTERS_ITEMS, MASTERS_OVERVIEW_ITEM } from "./mastersNav";

// Secondary navigation panel for the admin-only "Masters" section — rendered
// by MainLayout alongside the main Sidebar whenever the current route is one
// of MASTERS_PATHS (Overview, Projects, Companies, Categories, Public Forms,
// SLA, Users, Backup). "Overview" gets its own highlighted pill at the top
// (matching the reference Settings-style pattern the user asked for), then
// the rest render as a plain vertical list below — same visual language as
// the main Sidebar's own nav items (nx-nav-item classes). Every link here
// points at an EXISTING route (Overview is the one new page this section
// adds) — a navigation regrouping, not a new set of pages.
export default function MastersSidebar() {
  return (
    <div
      className="flex flex-col overflow-hidden flex-shrink-0"
      style={{ width: 220, height: "calc(100% - 12px)", marginTop: 12 }}
    >
      <div className="overflow-y-auto overflow-x-hidden" style={{ flex: 1, padding: "20px 10px 12px" }}>
        <NavLink to={MASTERS_OVERVIEW_ITEM.path} end style={{ textDecoration: "none", display: "block" }}>
          {({ isActive }) => (
            <div
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 mb-3 border font-semibold text-[13px] transition-colors ${
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-gray-200 dark:border-gray-700/50 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/30"
              }`}
            >
              <span className="[&_svg]:w-4 [&_svg]:h-4">{MASTERS_OVERVIEW_ITEM.icon}</span>
              {MASTERS_OVERVIEW_ITEM.name}
            </div>
          )}
        </NavLink>

        <div style={{ height: 1, background: "var(--nx-sidebar-group-line)", margin: "0 6px 8px" }} />

        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--nx-sidebar-sub-color)", padding: "0 10px 6px" }}>
          Workspace
        </div>

        {MASTERS_ITEMS.map(item => (
          <NavLink key={item.path} to={item.path} style={{ textDecoration: "none", display: "block" }}>
            {({ isActive }) => (
              <div className={`nx-nav-item masters-nav-item${isActive ? " nx-nav-item--active masters-nav-item--active" : ""}`}>
                <span className="nx-nav-icon masters-nav-icon">{item.icon}</span>
                <span style={{ flex: 1 }}>{item.name}</span>
                {isActive && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--nx-orange)", flexShrink: 0 }} />
                )}
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
