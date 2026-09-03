import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { ReactNode } from "react";

interface Props { children?: ReactNode; }

export default function ProtectedRoute({ children }: Props) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  // Carries the originally-requested path (e.g. a Slack "View & Decide" deep
  // link) through to Login, so it can send the user back there after signing in.
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  // Supports both legacy children usage and React Router Outlet pattern
  return children ? <>{children}</> : <Outlet />;
}
