import { ConfigProvider, theme as antTheme } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useLocation } from "react-router-dom";
import AppRoutes from "./routes/AppRoutes";
import PublicWorkOrderForm from "./pages/PublicWorkOrderForm";
import PublicContractorForm from "./pages/PublicContractorForm";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import baseTheme from "./theme/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry:     2,
      staleTime: 60_000,
    },
  },
});

function ThemedApp() {
  const { isDark } = useTheme();
  const { pathname } = useLocation();

  // Public routes — no auth, no sidebar
  if (pathname === "/public/work-order") {
    return (
      <ConfigProvider theme={{ ...baseTheme, algorithm: antTheme.defaultAlgorithm }}>
        <PublicWorkOrderForm />
        <Toaster position="top-right" />
      </ConfigProvider>
    );
  }

  if (pathname === "/public/contractor") {
    return (
      <ConfigProvider theme={{ ...baseTheme, algorithm: antTheme.defaultAlgorithm }}>
        <PublicContractorForm />
        <Toaster position="top-right" />
      </ConfigProvider>
    );
  }

  const mergedTheme = {
    ...baseTheme,
    algorithm: isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      ...baseTheme.token,
      ...(isDark ? {
        colorBgLayout:        "#0F172A",
        colorBgContainer:     "#1E293B",
        colorBorder:          "#334155",
        colorBorderSecondary: "#1E293B",
        colorText:            "#F1F5F9",
        colorTextSecondary:   "#94A3B8",
        colorFillSecondary:   "#1E293B",
        colorFillAlter:       "#162032",
      } : {}),
    },
    components: {
      ...baseTheme.components,
      ...(isDark ? {
        Table: {
          headerBg:         "#1a2535",
          headerColor:      "#94A3B8",
          rowHoverBg:       "#1a2535",
          borderColor:      "#334155",
          headerSplitColor: "transparent",
        },
      } : {}),
    },
  };

  return (
    <ConfigProvider theme={mergedTheme}>
      <AppRoutes />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            borderRadius: 10,
            fontFamily:   '"Inter", sans-serif',
            fontSize:     14,
            background:   isDark ? "#1E293B" : "#ffffff",
            color:        isDark ? "#F1F5F9" : "#111827",
            border:       `1px solid ${isDark ? "#334155" : "#E5E7EB"}`,
            boxShadow:    isDark
              ? "0 4px 12px rgba(0,0,0,0.4)"
              : "0 4px 12px rgba(0,0,0,0.1)",
          },
        }}
      />
    </ConfigProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <ThemedApp />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
