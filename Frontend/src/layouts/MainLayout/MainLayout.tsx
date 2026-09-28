import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Sidebar from "../Sidebar/Sidebar";
import MastersSidebar from "../Sidebar/MastersSidebar";
import { isMastersPath } from "../Sidebar/mastersNav";
import { VENDORS_ITEMS, isVendorsPath } from "../Sidebar/vendorsNav";
import Header from "../Header/Header";
import Segmented from "../../ui/Segmented";
import { useIsMobile, MOBILE_BREAKPOINT } from "../../hooks/useIsMobile";
import type { ReactNode } from "react";

interface Props { children?: ReactNode; }

export default function MainLayout({ children }: Props) {
  // Open by default on desktop (matches the sidebar's original always-visible
  // behavior), closed by default on mobile (an off-canvas overlay shouldn't
  // cover the page on first load). Read synchronously so there's no flash of
  // the wrong state on first paint.
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === "undefined" || window.innerWidth >= MOBILE_BREAKPOINT
  );
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();

  // Close the mobile off-canvas sidebar on every navigation — otherwise it
  // stays open over the new page until manually dismissed. Desktop's
  // collapse state is a deliberate user choice and shouldn't reset on nav.
  useEffect(() => { if (isMobile) setSidebarOpen(false); }, [location.pathname, isMobile]);

  // Re-expand when returning to desktop width — without this, dipping below
  // the mobile breakpoint (even briefly, e.g. a resized/half-snapped window)
  // leaves sidebarOpen=false, which desktop reads as "collapsed" (the 80px
  // icon rail) rather than "mobile closed" — the same boolean means two
  // different things depending on isMobile, so crossing back needs its own reset.
  useEffect(() => { if (!isMobile) setSidebarOpen(true); }, [isMobile]);

  // The secondary Masters panel only makes sense as a persistent extra
  // column on desktop (mobile's main Sidebar is already an off-canvas
  // overlay — stacking a second permanent column there would eat the whole
  // screen). On mobile, users still reach every Masters page directly via
  // the main Sidebar's own "Masters" entry, just without this extra panel.
  const showMastersPanel = !isMobile && isMastersPath(location.pathname);
  // Vendors (Contractors/Consultants/Vendor Groups) doesn't get its own
  // secondary sidebar column like Masters — instead a pill tab row (same
  // Segmented component/style used elsewhere, e.g. Work Orders' Execution vs
  // Professional Services tabs) switches between the 3 existing pages.
  const showVendorsTabs = isVendorsPath(location.pathname);
  // The "Masters" title/subtitle spans above the sidebar+content row across
  // all Masters sub-pages, keeping a consistent section header throughout.
  const showMastersTitleBar = showMastersPanel;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--nx-bg)" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
        <Header onToggleSidebar={() => setSidebarOpen(o => !o)} />
        {showMastersTitleBar && (
          <div style={{ flexShrink: 0, padding: "20px 28px 0" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--nx-sidebar-brand-color, #1A1A2E)" }}>Masters</div>
            <div style={{ fontSize: 13, color: "var(--nx-sidebar-sub-color, #9CA3AF)", marginTop: 4 }}>
              Everything in one place — pick a section to manage it.
            </div>
          </div>
        )}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {showMastersPanel && (
            <div style={{ marginLeft: 12 }}>
              <MastersSidebar />
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4 md:p-7" style={{ minWidth: 0 }}>
            {/* Every page opened from either sidebar sits inside this one big
                card — same bordered/shadowed look as the Header and main
                Sidebar — instead of floating directly on the page
                background. The negative margin cancels out this container's
                own padding so the card's edges line up with the Header's.
                No backdrop-blur here (unlike Header/Sidebar) — a
                backdrop-filter on an ancestor makes every descendant
                position:fixed element (Modal's full-screen backdrop, any
                dropdown portal, etc.) scope to THIS box's bounds instead of
                the real viewport, which silently broke every modal/drawer
                opened from a page inside it (the backdrop stopped covering
                the sidebar). */}
            <div className="-mx-1 md:-mx-4 -mt-2 md:-mt-5 min-h-[calc(100%+0.5rem)] bg-white/95 dark:bg-gray-800/95 border border-gray-100 dark:border-gray-700/50 shadow-sm rounded-xl p-4 md:p-6">
              {showVendorsTabs && (
                <div className="mb-4">
                  <Segmented
                    value={location.pathname}
                    onChange={(v) => navigate(v)}
                    options={VENDORS_ITEMS.map(i => ({ label: i.name, value: i.path }))}
                  />
                </div>
              )}
              {/* Supports both legacy children prop and React Router Outlet */}
              {children ?? <Outlet />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
