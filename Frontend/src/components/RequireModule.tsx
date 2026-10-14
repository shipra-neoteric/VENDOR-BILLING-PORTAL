import { Navigate, Outlet } from "react-router-dom";
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
  const allowed = canView(moduleId, user?.permissions, user?.role);
  if (!allowed) return <Navigate to={getDefaultPath(user?.permissions, user?.role)} replace />;
  return <Outlet />;
}
