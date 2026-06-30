import { Routes, Route, Navigate } from "react-router-dom";

import Dashboard    from "../features/dashboard";
import Projects     from "../features/projects";
import Contractors  from "../features/contractors";
import Companies    from "../features/companies";
import Categories   from "../features/categories";
import WorkItems    from "../features/work-items";
import WorkProgress from "../features/work-progress";
import Bills        from "../features/bills";
import BillRequests from "../pages/BillRequests";
import Approvals    from "../features/approvals";
import Ledger       from "../features/ledger";
import Login        from "../features/auth";

import MainLayout     from "../layouts/MainLayout/MainLayout";
import ProtectedRoute from "../components/ProtectedRoute";
import { useAuth }    from "../context/AuthContext";

function DriRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route index                 element={<Navigate to="/work-progress" replace />} />
          <Route path="/work-progress" element={<WorkProgress />} />
          <Route path="*"              element={<Navigate to="/work-progress" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route index                    element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"        element={<Dashboard />} />
          <Route path="/projects"         element={<Projects />} />
          <Route path="/contractors"      element={<Contractors />} />
          <Route path="/companies"        element={<Companies />} />
          <Route path="/categories"       element={<Categories />} />
          <Route path="/work-items"       element={<WorkItems />} />
          <Route path="/work-progress"    element={<WorkProgress />} />
          <Route path="/bills"            element={<Bills />} />
          <Route path="/bill-requests"    element={<BillRequests />} />
          <Route path="/approvals"        element={<Approvals />} />
          <Route path="/ledger"           element={<Ledger />} />
          <Route path="*"                 element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

const AppRoutes = () => {
  const { user } = useAuth();
  if (user?.role === "dri") return <DriRoutes />;
  return <AdminRoutes />;
};

export default AppRoutes;
