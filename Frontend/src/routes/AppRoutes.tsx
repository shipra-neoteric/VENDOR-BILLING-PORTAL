import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Spin } from "antd";

// Every page below is route-loaded on demand instead of shipping in the
// initial bundle — previously all ~19 page modules (several of them large:
// Accounts Payment, Site Progress, Work Items, Ledger…) downloaded and parsed
// up front regardless of which single page a user actually landed on.
// Login is the one exception: it's eager since it's the very first thing an
// unauthenticated visitor needs, and lazy-loading it would only add a loading
// flash with no real payload saved (nothing else has loaded yet either way).
import Login from "../features/auth";
const Dashboard         = lazy(() => import("../features/dashboard"));
const MyTasksDashboard  = lazy(() => import("../pages/MyTasksDashboard"));
const Projects          = lazy(() => import("../features/projects"));
const Contractors       = lazy(() => import("../features/contractors"));
const Companies         = lazy(() => import("../features/companies"));
const Categories        = lazy(() => import("../features/categories"));
const WorkItems         = lazy(() => import("../features/work-items"));
const WorkProgress      = lazy(() => import("../features/work-progress"));
const AccountsPayment   = lazy(() => import("../pages/AccountsPayment"));
const BillRequests      = lazy(() => import("../pages/BillRequests"));
const SiteProgress      = lazy(() => import("../pages/SiteProgress"));
const AdvancePayments   = lazy(() => import("../pages/AdvancePayments"));
const WorkOrderDashboard = lazy(() => import("../pages/WorkOrderDashboard"));
const Ledger            = lazy(() => import("../features/ledger"));
const UserManagement    = lazy(() => import("../pages/UserManagement"));
const DRIDashboard      = lazy(() => import("../pages/DRIDashboard"));
const PublicForms       = lazy(() => import("../pages/PublicForms"));
const SlaSettings       = lazy(() => import("../pages/SlaSettings"));
const SlaSettingsDetail = lazy(() => import("../pages/SlaSettings/Detail"));
const SlaDashboard      = lazy(() => import("../pages/SlaDashboard"));
const AuditLogs         = lazy(() => import("../pages/AuditLogs"));

import MainLayout     from "../layouts/MainLayout/MainLayout";
import ProtectedRoute from "../components/ProtectedRoute";
import { useAuth }    from "../context/AuthContext";
import { getDefaultPath } from "../layouts/Sidebar/Sidebar";

function RouteFallback() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
      <Spin size="large" />
    </div>
  );
}

function DriRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
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
            <Route path="/accounts-payment"  element={<AccountsPayment />} />
            <Route path="/bill-requests"    element={<BillRequests />} />
            <Route path="/ledger"           element={<Ledger />} />
            <Route path="*"                 element={<Navigate to="/work-progress" replace />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}

// GM/AGM land on a personalized "what's pending for you" queue instead of the
// shared Operational/Financial KPI dashboard — Owner keeps the full dashboard.
// Accounts used to share that queue page too, but they explicitly rejected its
// look — their "/dashboard" is now just the redesigned Accounts Payment page.
const TASK_QUEUE_ROLES = new Set(["gm", "agm"]);

function AdminRoutes() {
  const { user } = useAuth();
  const defaultPath = getDefaultPath(user?.permissions, user?.role);
  const showTaskQueue = TASK_QUEUE_ROLES.has(user?.role ?? "");
  const isAccounts = user?.role === "accounts";

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route index                    element={<Navigate to={defaultPath} replace />} />
            <Route path="/dashboard"        element={isAccounts ? <AccountsPayment /> : showTaskQueue ? <MyTasksDashboard /> : <Dashboard />} />
            <Route path="/projects"         element={<Projects />} />
            <Route path="/contractors"      element={<Contractors />} />
            <Route path="/companies"        element={<Companies />} />
            <Route path="/categories"       element={<Categories />} />
            <Route path="/work-items"         element={<WorkItems />} />
            <Route path="/work-items/:id"   element={<WorkOrderDashboard />} />
            <Route path="/work-progress"    element={<WorkProgress />} />
            <Route path="/accounts-payment"  element={<AccountsPayment />} />
            <Route path="/site-progress"    element={<SiteProgress />} />
            <Route path="/advance-payments" element={<AdvancePayments />} />
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
    </Suspense>
  );
}

const AppRoutes = () => {
  const { user } = useAuth();
  if (user?.role === "site-dri") return <DriRoutes />;
  return <AdminRoutes />;
};

export default AppRoutes;
