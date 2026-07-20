import axios from "axios";
import { message } from "antd";

// Strip BOM (﻿) that PowerShell can inject into env vars
const rawApiUrl = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/^﻿/, "");

const apiClient = axios.create({
  baseURL: rawApiUrl,
  headers: { "Content-Type": "application/json" },
  // The backend runs on Render's free tier, which sleeps after ~15 min idle and takes
  // 20-50s to wake back up on the next request. 15s was too short and made a normal
  // cold start look like a broken connection — give it real room before giving up.
  timeout: 45000,
});

apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Prevents duplicate "session expired" toasts + redirects when multiple requests fail simultaneously
let sessionExpiredPending = false;

function forceReLogin(msg: string) {
  if (sessionExpiredPending) return;
  sessionExpiredPending = true;
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
  message.error(msg);
  setTimeout(() => {
    sessionExpiredPending = false;
    window.location.replace("/login");
  }, 1200);
}

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
  async (error) => {
    const config = error.config || {};

    // The free-tier backend can be asleep on the very first request after a period of
    // inactivity, which surfaces as a timeout here. Silently retry once (the wake-up
    // call already went out during the first attempt) before bothering the user.
    // Only safe to auto-retry reads — retrying a timed-out POST/PATCH/DELETE could
    // double-submit an action (e.g. create a bill twice) if the original request had
    // actually reached the server and was just slow to respond.
    const isSafeToRetry = (config.method || "get").toLowerCase() === "get";
    if (error.code === "ECONNABORTED" && isSafeToRetry && !config.__retriedAfterWake) {
      config.__retriedAfterWake = true;
      try {
        return await apiClient(config);
      } catch (retryErr) {
        return Promise.reject(retryErr);
      }
    }

    if (!error.response) {
      if (error.code === "ECONNABORTED") {
        message.error("Server is taking longer than usual to respond. Please try again in a moment.");
      } else {
        message.error("Cannot connect to the server. Please check your internet connection and try again.");
      }
    } else {
      const status = error.response.status;
      const msg = error.response.data?.message || error.message || "Request failed";

      // Token expired or invalid — force re-login (deduplicated)
      if (status === 401) {
        forceReLogin("Session expired. Please sign in again.");
        return Promise.reject(error);
      }

      message.error(msg);
    }
    return Promise.reject(error);
  }
);

export default apiClient;
