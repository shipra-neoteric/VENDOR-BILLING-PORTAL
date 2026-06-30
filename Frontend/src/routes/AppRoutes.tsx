import { Routes, Route, Navigate } from "react-router-dom";

import Dashboard    from "../features/dashboard";
import Projects     from "../features/projects";
import Contractors  from "../features/contractors";
import Companies    from "../features/companies";
import Categories   from "../features/categories";
import WorkItems    from "../features/work-items";
import WorkProgress from "../features/work-progress";
import Bills        from "../features/bills";
import Approvals    from "../features/approvals";
import Ledger       from "../features/ledger";
import Login        from "../features/auth";

import MainLayout     from "../layouts/MainLayout/MainLayout";
import ProtectedRoute from "../components/ProtectedRoute";

const AppRoutes = () => (
  <Routes>
    {/* Public */}
    <Route path="/login" element={<Login />} />

    {/* Protected — renders ProtectedRoute → MainLayout → page via Outlet */}
    <Route element={<ProtectedRoute />}>
      <Route element={<MainLayout />}>
        <Route index                   element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard"       element={<Dashboard />} />
        <Route path="/projects"        element={<Projects />} />
        <Route path="/contractors"     element={<Contractors />} />
        <Route path="/companies"       element={<Companies />} />
        <Route path="/categories"      element={<Categories />} />
        <Route path="/work-items"      element={<WorkItems />} />
        <Route path="/work-progress"   element={<WorkProgress />} />
        <Route path="/bills"           element={<Bills />} />
        <Route path="/approvals"       element={<Approvals />} />
        <Route path="/ledger"          element={<Ledger />} />
      </Route>
    </Route>

    {/* Fallback */}
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
);

export default AppRoutes;
