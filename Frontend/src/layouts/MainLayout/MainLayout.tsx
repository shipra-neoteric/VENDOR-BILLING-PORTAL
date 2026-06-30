import { Outlet } from "react-router-dom";
import Sidebar from "../Sidebar/Sidebar";
import Header from "../Header/Header";
import type { ReactNode } from "react";

interface Props { children?: ReactNode; }

export default function MainLayout({ children }: Props) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F8FAFC" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Header />
        <div style={{ flex: 1, padding: "28px 32px", overflowY: "auto" }}>
          {/* Supports both legacy children prop and React Router Outlet */}
          {children ?? <Outlet />}
        </div>
      </div>
    </div>
  );
}
