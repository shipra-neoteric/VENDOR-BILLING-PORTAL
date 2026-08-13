import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Sidebar from "../Sidebar/Sidebar";
import Header from "../Header/Header";
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

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--nx-bg)" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
        <Header onToggleSidebar={() => setSidebarOpen(o => !o)} />
        <div className="flex-1 overflow-y-auto p-4 md:p-7">
          {/* Supports both legacy children prop and React Router Outlet */}
          {children ?? <Outlet />}
        </div>
      </div>
    </div>
  );
}
