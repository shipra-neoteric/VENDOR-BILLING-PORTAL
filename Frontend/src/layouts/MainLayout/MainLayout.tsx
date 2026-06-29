import Sidebar from "../Sidebar/Sidebar";
import Header from "../Header/Header";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F8FAFC" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Header />
        <div style={{ flex: 1, padding: "28px 32px", overflowY: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
