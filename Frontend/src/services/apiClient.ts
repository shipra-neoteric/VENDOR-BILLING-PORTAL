import axios from "axios";
import { message } from "antd";

// Strip BOM (﻿) that PowerShell can inject into env vars
const rawApiUrl = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");

const apiClient = axios.create({
  baseURL: rawApiUrl,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    // Unwrap the { success, message, data } envelope added by the backend responseFormatter
    // so every caller can still do `res.data.bills`, `res.data.token`, etc.
    if (
      response.data &&
      typeof response.data === "object" &&
      "success" in response.data &&
      "data" in response.data
    ) {
      response.data = response.data.data;
    }
    return response;
  },
  (error) => {
    if (!error.response) {
      message.error(
        "Cannot connect to backend server. Make sure it is running on port 5000."
      );
    } else {
      const msg =
        error.response.data?.message || error.message || "Request failed";
      message.error(msg);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
