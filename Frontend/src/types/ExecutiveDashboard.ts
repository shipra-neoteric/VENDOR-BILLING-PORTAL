// Mirrors Backend/src/controllers/executiveDashboardController.js's response
// shape exactly (GET /api/dashboard/executive). Phase 1 = kpis/projects base
// fields. Phase 2 = overallStage/bottleneck/health on each project row, plus
// top-level alerts/forecasts (see Backend/src/utils/projectStageRules.js for
// the exact rules/thresholds behind these). Phase 3 (paymentFlow, categories,
// contractorCategory, deepLinks) still doesn't exist, so still absent here.

export interface ExecutiveDashboardKPIs {
  activeProjects: number;
  totalContractValue: number;
  workExecuted: number;
  totalBilled: number;
  // Sum of certifiedNet across the filtered project set — same basis as
  // forecasts.cashRequirement, added for the Contract-to-Payment Flow visual.
  totalCertified: number;
  totalPaid: number;
  pendingApprovals: number;
  // Certified but not yet paid, across the filtered project set.
  outstandingAmount: number;
  // Certified-but-unpaid AND aged past the "Attention" threshold
  // (HEALTH_THRESHOLDS.certifiedUnpaidAttentionDays, currently 7 days) —
  // a subset of outstandingAmount.
  overdueAmount: number;
}

// "Project Activity" panel (ProjectLifecycle.tsx) — current operational
// workload snapshot, scoped to the same filtered project/work-order set as
// the rest of this response. See executiveDashboardController.js's own
// `activity` block comment for the exact definition behind each field.
export interface ExecutiveDashboardActivity {
  workOrdersActive: number;
  siteProgressPending: number;
  billsAwaitingVerification: number;
  approvalsPending: number;
  drawingRequestsOpen: number;
  delayedProjects: number;
  atRiskProjects: number;
  criticalProjects: number;
}

export interface ExecutiveDashboardStageSummaryEntry {
  stage: "Planning" | "Work Orders Issued" | "Work in Progress" | "Billing" | "Payment Pending" | "Completed";
  count: number;
}

export interface ExecutiveDashboardCategorySpend {
  category: string;
  amount: number;
  percent: number;
}

export interface ExecutiveDashboardContractorCategoryRow {
  contractor: string;
  category: string;
  project: string;
  contractValue: number;
  paid: number;
  pending: number;
  status: "Healthy" | "Attention" | "Pending" | "Critical";
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
  overallStage: "Planning" | "Work Orders Issued" | "Work in Progress" | "Billing" | "Payment Pending" | "Completed";
  bottleneck: string | null;
  health: "Healthy" | "Attention" | "Critical";
  healthReasons: string[];
}

export interface ExecutiveDashboardAlert {
  id: string;
  type: string;
  severity: "critical" | "attention";
  projectId: string;
  projectName: string;
  title: string;
  message: string;
  ageDays?: number;
  amount?: number;
  link: string;
}

export interface ExecutiveDashboardBudgetForecast {
  type: "budget-risk";
  projectId: string;
  projectName: string;
  message: string;
  basis: string;
  projectedFinalCost?: number;
  contractValue?: number;
  overrunPercent?: number;
  flagged?: boolean;
}

export interface ExecutiveDashboardForecasts {
  budgetRisk: ExecutiveDashboardBudgetForecast[];
  cashRequirement: {
    type: "cash-requirement";
    totalCertifiedUnpaid: number;
    projectCount: number;
    basis: string;
  };
}

// Mirrors Backend/src/controllers/executiveDashboardController.js's
// buildContractorMatrixData response shape exactly (GET
// /api/dashboard/executive/contractor-matrix) — the full, uncapped
// contractor x category cross-tab behind the "View Matrix" link on the
// Contractors by Category card.
export interface ContractorMatrixRow {
  contractorCode: string;
  contractorName: string;
  category: string;
  contractValue: number;
  paid: number;
  pending: number;
  projectCount: number;
  status: "Healthy" | "Attention" | "Pending" | "Critical";
}

export interface ContractorMatrixReport {
  meta: {
    generatedAt: string;
    filters: {
      projectId: string | null;
      categoryId: string | null;
      contractorId: string | null;
      from: string | null;
      to: string | null;
    };
    currency: string;
    dataWarnings: string[];
  };
  rows: ContractorMatrixRow[];
  categories: string[];
  contractors: { code: string; name: string }[];
}

export interface ExecutiveDashboardCategoryExecution {
  category: string;
  totalWorkOrders: number;
  completedPercent: number;
  executedValue: number;
  remainingValue: number;
}

export interface ExecutiveDashboardAgingBucket {
  bucket: "0-30" | "31-60" | "61-90" | "90+";
  label: string;
  amount: number;
  percent: number;
}

export interface ExecutiveDashboardPaymentAging {
  total: number;
  buckets: ExecutiveDashboardAgingBucket[];
}

export interface ExecutiveDashboardApprovalLevel {
  level: string;
  label: string;
  count: number;
  avgDays: number;
}

export interface ExecutiveDashboardTrendPoint {
  month: string;
  billed: number;
  paid: number;
}

export interface ExecutiveDashboardNoApprovalWorkOrder {
  workOrderId: string;
  workOrderNo: string;
  projectId: string;
  projectName: string;
  category: string;
  status: "draft" | "pending-checker" | "pending-approver" | "pending-final" | "sent-back";
  daysPending: number;
}

export interface ExecutiveDashboardVendorScorecardRow {
  code: string;
  name: string;
  businessGiven: number;
  paid: number;
  pendingDues: number;
  avgApprovalDays: number | null;
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
  activity: ExecutiveDashboardActivity;
  projects: ExecutiveDashboardProjectRow[];
  alerts: ExecutiveDashboardAlert[];
  alertsTotalCount: number;
  forecasts: ExecutiveDashboardForecasts;
  stageSummary: ExecutiveDashboardStageSummaryEntry[];
  categorySpend: ExecutiveDashboardCategorySpend[];
  contractorsByCategory: ExecutiveDashboardContractorCategoryRow[];
  categoryExecution: ExecutiveDashboardCategoryExecution[];
  paymentAging: ExecutiveDashboardPaymentAging;
  approvalsByLevel: ExecutiveDashboardApprovalLevel[];
  billingVsPaymentTrend: ExecutiveDashboardTrendPoint[];
  noApprovalWorkOrders: ExecutiveDashboardNoApprovalWorkOrder[];
  topVendorsScorecard: ExecutiveDashboardVendorScorecardRow[];
}
