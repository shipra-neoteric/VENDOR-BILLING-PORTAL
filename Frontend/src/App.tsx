import { ConfigProvider } from "antd";
import AppRoutes from "./routes/AppRoutes";
import { AuthProvider } from "./context/AuthContext";

function App() {
  return (
    <AuthProvider>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#FF7A00",
          colorLink: "#FF7A00",
          fontFamily:
            '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          borderRadius: 8,
          borderRadiusLG: 10,
          borderRadiusSM: 6,
          colorBgLayout: "#F8FAFC",
          colorBgContainer: "#ffffff",
          colorBorder: "#E5E7EB",
          colorBorderSecondary: "#F3F4F6",
          colorText: "#111827",
          colorTextSecondary: "#6B7280",
          colorFillSecondary: "#F9FAFB",
          colorFillAlter: "#FFF8F0",
        },
        components: {
          Table: {
            headerBg: "#F9FAFB",
            headerColor: "#374151",
            headerFontSize: 12,
            rowHoverBg: "#FFFAF5",
            borderColor: "#E5E7EB",
            headerSplitColor: "transparent",
          },
          Button: { borderRadius: 8, fontWeight: 600, primaryShadow: "none" },
          Card: { borderRadius: 12, paddingLG: 20 },
          Input: { borderRadius: 8 },
          Select: { borderRadius: 8 },
          DatePicker: { borderRadius: 8 },
          InputNumber: { borderRadius: 8 },
          Tag: { borderRadius: 6, fontWeight: 600 },
          Tabs: {
            inkBarColor: "#FF7A00",
            itemSelectedColor: "#FF7A00",
            itemHoverColor: "#FF7A00",
          },
          Steps: { colorPrimary: "#FF7A00" },
          Alert: { borderRadius: 8 },
        },
      }}
    >
      <AppRoutes />
    </ConfigProvider>
    </AuthProvider>
  );
}

export default App;
