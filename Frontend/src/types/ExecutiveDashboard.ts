// Mirrors Backend/src/controllers/executiveDashboardController.js's response
// shape exactly (GET /api/dashboard/executive) — Phase 1 of the Projects
// Overview rebuild. Phase 2/3 fields (stageSummary, alerts, forecasts,
// paymentFlow, categories, contractorCategory, deepLinks) don't exist on the
// backend yet, so they're deliberately absent here too.

export interface ExecutiveDashboardKPIs {
  activeProjects: number;
  totalContractValue: number;
  workExecuted: number;
  totalBilled: number;
  totalPaid: number;
  pendingApprovals: number;
}

export interface ExecutiveDashboardProjectRow {
  projectId: string;
  code: string;
  name: string;
  status: "active" | "completed" | "on-hold";
  awardedContractValue: number;
  workExecutedValue: number;
  billedGross: number;
  certifiedNet: number;
  paidAmount: number;
  remainingContract: number;
  progress: number;
  pendingBillReqs: number;
  openBills: number;
  activeVendors: number;
}

export interface ExecutiveDashboardReport {
  meta: {
    generatedAt: string;
    filters: {
      projectId: string | null;
      stage: string | null;
      categoryId: string | null;
      contractorId: string | null;
      from: string | null;
      to: string | null;
    };
    currency: string;
    dataWarnings: string[];
  };
  kpis: ExecutiveDashboardKPIs;
  projects: ExecutiveDashboardProjectRow[];
}
