import { Routes, Route, Navigate } from "react-router-dom";

import Dashboard from "../pages/Dashboard";
import Projects from "../pages/Projects";
import Contractors from "../pages/Contractors";
import Categories from "../pages/Categories";
import WorkItems from "../pages/WorkItems";
import WorkProgress from "../pages/WorkProgress";
import Bills from "../pages/Bills";
import Approvals from "../pages/Approvals";
import Ledger from "../pages/Ledger";
import Login from "../pages/Login";

import MainLayout from "../layouts/MainLayout/MainLayout";
import ProtectedRoute from "../components/ProtectedRoute";

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/contractors" element={<Contractors />} />
                <Route path="/categories" element={<Categories />} />
                <Route path="/work-items" element={<WorkItems />} />
                <Route path="/work-progress" element={<WorkProgress />} />
                <Route path="/bills" element={<Bills />} />
                <Route path="/approvals" element={<Approvals />} />
                <Route path="/ledger" element={<Ledger />} />
              </Routes>
            </MainLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

export default AppRoutes;
