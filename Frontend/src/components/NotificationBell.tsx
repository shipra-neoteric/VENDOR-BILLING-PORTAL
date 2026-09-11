import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dropdown } from "antd";
import { Bell, Check } from "lucide-react";
import apiClient from "../services/apiClient";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export interface AppNotification {
  _id: string;
  type: string;
  category: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  link: string;
  read: boolean;
  createdAt: string;
}

// Polls rather than a websocket — matches this app's existing pattern
// elsewhere (no real-time transport exists in this codebase yet); 30s keeps
// the badge reasonably fresh without hammering the API.
const POLL_MS = 30000;

export default function NotificationBell() {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function loadUnreadCount() {
    apiClient.get("/notifications/unread-count").then(res => setUnreadCount(res.data.count ?? 0)).catch(() => {});
  }

  const [showAll, setShowAll] = useState(false);

  function loadRecent(all = false) {
    setLoading(true);
    apiClient.get("/notifications", { params: { limit: all ? 50 : 8 } })
      .then(res => setNotifications(res.data.notifications ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadUnreadCount();
    pollRef.current = setInterval(loadUnreadCount, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen) {
      setShowAll(false);
      loadRecent(false);
    }
  }

  function openNotification(n: AppNotification) {
    if (!n.read) {
      apiClient.patch(`/notifications/${n._id}/read`).catch(() => {});
      setNotifications(prev => prev.map(x => x._id === n._id ? { ...x, read: true } : x));
      setUnreadCount(c => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  function markAllRead() {
    apiClient.patch("/notifications/mark-all-read").catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  return (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      open={open}
      onOpenChange={handleOpenChange}
      popupRender={() => (
        <div className="w-[360px] max-w-[92vw] bg-white dark:bg-[#1E293B] rounded-lg shadow-lg border border-gray-200 dark:border-gray-700/40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/40">
            <span className="text-sm font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1">
                <Check className="w-3 h-3" /> Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">No notifications yet.</div>
            ) : (
              notifications.map(n => (
                <button
                  key={n._id}
                  type="button"
                  onClick={() => openNotification(n)}
                  className={`w-full text-left px-4 py-2.5 border-b border-gray-50 dark:border-gray-700/20 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${!n.read ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />}
                    <div className={`min-w-0 ${n.read ? "pl-3.5" : ""}`}>
                      <div className="text-[12.5px] font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] truncate">{n.title}</div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">{n.message}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{dayjs(n.createdAt).fromNow()}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          {!showAll && (
            <button
              type="button"
              onClick={() => { setShowAll(true); loadRecent(true); }}
              className="w-full text-center py-2 text-[12px] font-semibold text-primary hover:bg-gray-50 dark:hover:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700/40"
            >
              View All
            </button>
          )}
        </div>
      )}
    >
      <button
        type="button"
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-lg border border-gray-200/70 dark:border-gray-700/50 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors shrink-0"
      >
        <Bell className="w-4.5 h-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    </Dropdown>
  );
}
