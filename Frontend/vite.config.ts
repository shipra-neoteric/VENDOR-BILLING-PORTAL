import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@react-pdf") || id.includes("react-pdf")) return "vendor-pdf";
          if (id.includes("recharts") || id.includes("d3-"))          return "vendor-charts";
          if (id.includes("xlsx"))                                     return "vendor-xlsx";
          if (id.includes("dayjs"))                                    return "vendor-dayjs";
          if (id.includes("antd") || id.includes("@ant-design"))      return "vendor-antd";
          if (id.includes("react-dom") || id.includes("react-router")) return "vendor-react";
        },
      },
    },
  },
});