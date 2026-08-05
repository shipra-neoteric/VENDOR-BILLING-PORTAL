import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Sidebar from "../Sidebar/Sidebar";
import Header from "../Header/Header";
import type { ReactNode } from "react";

interface Props { children?: ReactNode; }

export default function MainLayout({ children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close the mobile off-canvas sidebar on every navigation — otherwise it
  // stays open over the new page until manually dismissed.
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--nx-bg)" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Header onToggleSidebar={() => setSidebarOpen(o => !o)} />
        <div className="flex-1 overflow-y-auto p-4 md:p-7">
          {/* Supports both legacy children prop and React Router Outlet */}
          {children ?? <Outlet />}
        </div>
      </div>
    </div>
  );
}
