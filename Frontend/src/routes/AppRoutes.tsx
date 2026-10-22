import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Spinner from "../ui/Spinner";

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
const Consultants       = lazy(() => import("../pages/Consultants"));
const VendorGroups      = lazy(() => import("../pages/VendorGroups"));
const Companies         = lazy(() => import("../features/companies"));
const Categories        = lazy(() => import("../features/categories"));
const WorkItems         = lazy(() => import("../features/work-items"));
const QuotationComparison = lazy(() => import("../pages/QuotationComparison"));
const WorkProgress      = lazy(() => import("../features/work-progress"));
const AccountsPayment   = lazy(() => import("../pages/AccountsPayment"));
const Billing           = lazy(() => import("../pages/Billing"));
const ProcurementTracker = lazy(() => import("../pages/ProcurementTracker"));
const BillRequests      = lazy(() => import("../pages/BillRequests"));
const MdApprovals       = lazy(() => import("../pages/MdApprovals"));
const SiteProgress      = lazy(() => import("../pages/SiteProgress"));
const AdvancePayments   = lazy(() => import("../pages/AdvancePayments"));
const WorkOrderDashboard = lazy(() => import("../pages/WorkOrderDashboard"));
const Ledger            = lazy(() => import("../features/ledger"));
const UserManagement    = lazy(() => import("../pages/UserManagement"));
const RolePermissions   = lazy(() => import("../pages/UserManagement/RolePermissions"));
const EditUser          = lazy(() => import("../pages/UserManagement/EditUser"));
const DRIDashboard      = lazy(() => import("../pages/DRIDashboard"));
const PublicForms       = lazy(() => import("../pages/PublicForms"));
const SlaSettings       = lazy(() => import("../pages/SlaSettings"));
const SlaSettingsDetail = lazy(() => import("../pages/SlaSettings/Detail"));
const SlaDashboard      = lazy(() => import("../pages/SlaDashboard"));
const AuditLogs         = lazy(() => import("../pages/AuditLogs"));
const AuditLogModule    = lazy(() => import("../pages/AuditLogs/ModuleLogs"));
const DailyProgressReport = lazy(() => import("../pages/DailyProgressReport"));
const DrawingRequests    = lazy(() => import("../pages/DrawingRequests"));
const DriHome            = lazy(() => import("../pages/DriHome"));
const Backup              = lazy(() => import("../pages/Backup"));
const RecurringBilling    = lazy(() => import("../pages/RecurringBilling"));
const NexoraPreview        = lazy(() => import("../pages/NexoraPreview"));
const ContractorMatrix     = lazy(() => import("../pages/ContractorMatrix"));
const ProjectsList         = lazy(() => import("../pages/ProjectsList"));
const MastersOverview      = lazy(() => import("../pages/MastersOverview"));
const PendingWorkOrders    = lazy(() => import("../pages/PendingWorkOrders"));
const PendingPayments      = lazy(() => import("../pages/PendingPayments"));

import MainLayout     from "../layouts/MainLayout/MainLayout";
import ProtectedRoute from "../components/ProtectedRoute";
import RequireModule from "../components/RequireModule";
import { useAuth }    from "../context/AuthContext";
import { getDefaultPath } from "../layouts/Sidebar/Sidebar";

function RouteFallback() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
      <Spinner />
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
            <Route index                    element={<Navigate to="/dri-home" replace />} />
            {/* Core DRI routes */}
            <Route path="/dri-home"         element={<DriHome />} />
            <Route path="/work-progress"    element={<WorkProgress />} />
            <Route path="/daily-progress-report" element={<DailyProgressReport />} />
            {/* Admin module routes — visible when admin grants DRI explicit view permission */}
            <Route element={<RequireModule moduleId="projects" />}>
              <Route path="/projects"         element={<Projects />} />
            </Route>
            <Route element={<RequireModule moduleId="companies" />}>
              <Route path="/companies"        element={<Companies />} />
            </Route>
            <Route element={<RequireModule moduleId="contractors" />}>
              <Route path="/contractors"      element={<Contractors />} />
            </Route>
            <Route element={<RequireModule moduleId="consultants" />}>
              <Route path="/consultants"      element={<Consultants />} />
            </Route>
            <Route element={<RequireModule moduleId="categories" />}>
              <Route path="/categories"       element={<Categories />} />
            </Route>
            <Route element={<RequireModule moduleId="work-orders" />}>
              <Route path="/work-items"       element={<WorkItems />} />
            </Route>
            <Route element={<RequireModule moduleId="work-orders" />}>
              <Route path="/work-items/:id"   element={<WorkOrderDashboard />} />
            </Route>
            <Route element={<RequireModule moduleId="accounts-payment" />}>
              <Route path="/accounts-payment"  element={<AccountsPayment />} />
            </Route>
            <Route element={<RequireModule moduleId="bill-requests" />}>
              <Route path="/bill-requests"    element={<BillRequests />} />
            </Route>
            <Route element={<RequireModule moduleId="ledger" />}>
              <Route path="/ledger"           element={<Ledger />} />
            </Route>
            <Route element={<RequireModule moduleId="drawing-requests" />}>
              <Route path="/drawing-requests" element={<DrawingRequests />} />
            </Route>
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
            <Route element={<RequireModule moduleId="dashboard" />}>
              <Route path="/dashboard"        element={isAccounts ? <AccountsPayment /> : showTaskQueue ? <MyTasksDashboard /> : <Dashboard />} />
            </Route>
            <Route element={<RequireModule moduleId="dashboard" />}>
              <Route path="/contractor-matrix" element={<ContractorMatrix />} />
            </Route>
            <Route element={<RequireModule moduleId="dashboard" />}>
              <Route path="/pending-work-orders" element={<PendingWorkOrders />} />
            </Route>
            <Route element={<RequireModule moduleId="dashboard" />}>
              <Route path="/pending-payments" element={<PendingPayments />} />
            </Route>
            <Route element={<RequireModule moduleId="projects" />}>
              <Route path="/projects-overview" element={<ProjectsList />} />
            </Route>
            {/* Masters and its sub-pages previously rendered for ANYONE who
                navigated straight to the URL — the sidebar hid the link,
                but nothing stopped a direct visit. RequireModule enforces
                the same per-module permission the sidebar itself already
                checks, at the route level. */}
            <Route element={<RequireModule moduleId="masters" />}>
              <Route path="/masters"          element={<MastersOverview />} />
            </Route>
            <Route element={<RequireModule moduleId="projects" />}>
              <Route path="/projects"         element={<Projects />} />
            </Route>
            <Route element={<RequireModule moduleId="contractors" />}>
              <Route path="/contractors"      element={<Contractors />} />
            </Route>
            <Route element={<RequireModule moduleId="consultants" />}>
              <Route path="/consultants"      element={<Consultants />} />
            </Route>
            <Route element={<RequireModule moduleId="vendor-groups" />}>
              <Route path="/vendor-groups"    element={<VendorGroups />} />
            </Route>
            <Route element={<RequireModule moduleId="companies" />}>
              <Route path="/companies"        element={<Companies />} />
            </Route>
            <Route element={<RequireModule moduleId="categories" />}>
              <Route path="/categories"       element={<Categories />} />
            </Route>
            <Route element={<RequireModule moduleId="work-orders" />}>
              <Route path="/work-items"         element={<WorkItems />} />
            </Route>
            <Route element={<RequireModule moduleId="work-orders" />}>
              <Route path="/work-items/:id"   element={<WorkOrderDashboard />} />
            </Route>
            <Route element={<RequireModule moduleId="quotation-comparison" />}>
              <Route path="/quotation-comparison" element={<QuotationComparison />} />
            </Route>
            <Route element={<RequireModule moduleId="work-progress" />}>
              <Route path="/work-progress"    element={<WorkProgress />} />
            </Route>
            <Route element={<RequireModule moduleId="accounts-payment" />}>
              <Route path="/accounts-payment"  element={<AccountsPayment />} />
            </Route>
            <Route element={<RequireModule moduleId="billing" />}>
              <Route path="/billing"          element={<Billing />} />
            </Route>
            <Route element={<RequireModule moduleId="procurement-tracker" />}>
              <Route path="/procurement-tracker" element={<ProcurementTracker />} />
            </Route>
            <Route element={<RequireModule moduleId="bill-review" />}>
              <Route path="/site-progress"    element={<SiteProgress />} />
            </Route>
            <Route element={<RequireModule moduleId="bill-requests" />}>
              <Route path="/bill-requests"    element={<BillRequests />} />
            </Route>
            <Route element={<RequireModule moduleId="md-approvals" />}>
              <Route path="/md-approvals"     element={<MdApprovals />} />
            </Route>
            <Route element={<RequireModule moduleId="advance-payments" />}>
              <Route path="/advance-payments" element={<AdvancePayments />} />
            </Route>
            <Route element={<RequireModule moduleId="ledger" />}>
              <Route path="/ledger"           element={<Ledger />} />
            </Route>
            <Route element={<RequireModule moduleId="user-management" />}>
              <Route path="/users"            element={<UserManagement />} />
              <Route path="/users/roles/:id"  element={<RolePermissions />} />
              <Route path="/users/new"        element={<EditUser />} />
              <Route path="/users/:id/edit"   element={<EditUser />} />
            </Route>
            <Route element={<RequireModule moduleId="dri-dashboard" />}>
              <Route path="/dri-dashboard"   element={<DRIDashboard />} />
            </Route>
            <Route element={<RequireModule moduleId="public-forms" />}>
              <Route path="/public-forms"    element={<PublicForms />} />
            </Route>
            <Route element={<RequireModule moduleId="sla-settings" />}>
              <Route path="/sla-settings"    element={<SlaSettings />} />
              <Route path="/sla-settings/:id" element={<SlaSettingsDetail />} />
            </Route>
            <Route element={<RequireModule moduleId="sla-dashboard" />}>
              <Route path="/sla-dashboard"   element={<SlaDashboard />} />
            </Route>
            <Route element={<RequireModule moduleId="audit-logs" />}>
              <Route path="/audit-logs"      element={<AuditLogs />} />
            </Route>
            <Route element={<RequireModule moduleId="audit-logs" />}>
              <Route path="/audit-logs/:module" element={<AuditLogModule />} />
            </Route>
            <Route element={<RequireModule moduleId="backup" />}>
              <Route path="/backup"          element={<Backup />} />
            </Route>
            <Route element={<RequireModule moduleId="recurring-billing" />}>
              <Route path="/recurring-billing" element={<RecurringBilling />} />
            </Route>
            <Route element={<RequireModule moduleId="masters" />}>
              <Route path="/nexora-preview"  element={<NexoraPreview />} />
            </Route>
            <Route element={<RequireModule moduleId="daily-progress-report" />}>
              <Route path="/daily-progress-report" element={<DailyProgressReport />} />
            </Route>
            <Route element={<RequireModule moduleId="drawing-requests" />}>
              <Route path="/drawing-requests" element={<DrawingRequests />} />
            </Route>
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
