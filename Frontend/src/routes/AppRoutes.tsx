import { Routes, Route, Navigate } from "react-router-dom";

import Dashboard           from "../features/dashboard";
import MyTasksDashboard     from "../pages/MyTasksDashboard";
import Projects             from "../features/projects";
import Contractors          from "../features/contractors";
import Companies            from "../features/companies";
import Categories           from "../features/categories";
import WorkItems            from "../features/work-items";
import WorkProgress         from "../features/work-progress";
import Bills                from "../features/bills";
import BillRequests         from "../pages/BillRequests";
import BillReview           from "../pages/BillReview";
import AdvancePayments      from "../pages/AdvancePayments";
import WorkOrderDashboard   from "../pages/WorkOrderDashboard";
import Approvals            from "../features/approvals";
import Ledger               from "../features/ledger";
import UserManagement       from "../pages/UserManagement";
import DRIDashboard         from "../pages/DRIDashboard";
import PublicForms          from "../pages/PublicForms";
import SlaSettings          from "../pages/SlaSettings";
import SlaSettingsDetail    from "../pages/SlaSettings/Detail";
import SlaDashboard         from "../pages/SlaDashboard";
import AuditLogs            from "../pages/AuditLogs";
import Login                from "../features/auth";

import MainLayout     from "../layouts/MainLayout/MainLayout";
import ProtectedRoute from "../components/ProtectedRoute";
import { useAuth }    from "../context/AuthContext";
import { getDefaultPath } from "../layouts/Sidebar/Sidebar";

function DriRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route index                    element={<Navigate to="/work-progress" replace />} />
          {/* Core DRI routes */}
          <Route path="/work-progress"    element={<WorkProgress />} />
          {/* Admin module routes — visible when admin grants DRI explicit view permission */}
          <Route path="/projects"         element={<Projects />} />
          <Route path="/companies"        element={<Companies />} />
          <Route path="/contractors"      element={<Contractors />} />
          <Route path="/categories"       element={<Categories />} />
          <Route path="/work-items"       element={<WorkItems />} />
          <Route path="/work-items/:id"   element={<WorkOrderDashboard />} />
          <Route path="/bills"            element={<Bills />} />
          <Route path="/bill-requests"    element={<BillRequests />} />
          <Route path="/approvals"        element={<Approvals />} />
          <Route path="/ledger"           element={<Ledger />} />
          <Route path="*"                 element={<Navigate to="/work-progress" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

// GM/AGM/Accounts land on a personalized "what's pending for you" queue instead of
// the shared Operational/Financial KPI dashboard — Owner keeps the full dashboard.
const TASK_QUEUE_ROLES = new Set(["gm", "agm", "accounts"]);

function AdminRoutes() {
  const { user } = useAuth();
  const defaultPath = getDefaultPath(user?.permissions);
  const showTaskQueue = TASK_QUEUE_ROLES.has(user?.role ?? "");

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route index                    element={<Navigate to={defaultPath} replace />} />
          <Route path="/dashboard"        element={showTaskQueue ? <MyTasksDashboard /> : <Dashboard />} />
          <Route path="/projects"         element={<Projects />} />
          <Route path="/contractors"      element={<Contractors />} />
          <Route path="/companies"        element={<Companies />} />
          <Route path="/categories"       element={<Categories />} />
          <Route path="/work-items"         element={<WorkItems />} />
          <Route path="/work-items/:id"   element={<WorkOrderDashboard />} />
          <Route path="/work-progress"    element={<WorkProgress />} />
          <Route path="/bills"            element={<Bills />} />
          <Route path="/bill-requests"    element={<BillRequests />} />
          <Route path="/bill-review"      element={<BillReview />} />
          <Route path="/advance-payments" element={<AdvancePayments />} />
          <Route path="/approvals"        element={<Approvals />} />
          <Route path="/ledger"           element={<Ledger />} />
          <Route path="/users"            element={<UserManagement />} />
          <Route path="/dri-dashboard"   element={<DRIDashboard />} />
          <Route path="/public-forms"    element={<PublicForms />} />
          <Route path="/sla-settings"    element={<SlaSettings />} />
          <Route path="/sla-settings/:id" element={<SlaSettingsDetail />} />
          <Route path="/sla-dashboard"   element={<SlaDashboard />} />
          <Route path="/audit-logs"      element={<AuditLogs />} />
          <Route path="*"                element={<Navigate to={defaultPath} replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

const AppRoutes = () => {
  const { user } = useAuth();
  if (user?.role === "site-dri") return <DriRoutes />;
  return <AdminRoutes />;
};

export default AppRoutes;
