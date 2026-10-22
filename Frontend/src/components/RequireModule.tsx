import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { canView, getDefaultPath } from "../layouts/Sidebar/Sidebar";

// Route-level enforcement of the exact same rule the Sidebar already uses
// to decide what to SHOW — closes the gap where hiding a nav link was the
// only thing stopping someone from reaching a page (Masters, Users,
// Backup, ...) by typing its URL directly. A page that shouldn't render
// for this user redirects to wherever they'd actually land (same logic
// the post-login redirect already uses), instead of silently rendering
// with no data, or worse, with data a real API call still returns.
export default function RequireModule({ moduleId }: { moduleId: string }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const allowed = canView(moduleId, user?.permissions, user?.role);
  if (allowed) return <Outlet />;
  const target = getDefaultPath(user?.permissions, user?.role);
  // Nothing else to land on (or the landing page itself is the blocked one) — redirecting would
  // loop, so say plainly that access has to be granted in the Permission Matrix.
  if (target === pathname) return <NoAccess />;
  return <Navigate to={target} replace />;
}

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-6">
      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4"><ShieldAlert className="w-6 h-6" /></div>
      <div className="text-[16px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">You don't have access to this page</div>
      <div className="text-[13px] text-gray-500 dark:text-gray-400 mt-1.5 max-w-sm">Access comes from the Permission Matrix. Ask an administrator to grant it to your account or role.</div>
    </div>
  );
}
