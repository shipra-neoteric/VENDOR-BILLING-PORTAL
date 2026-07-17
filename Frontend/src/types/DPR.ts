export interface DPRComparison { yesterday: number | null; avg7d: number | null; avg30d: number | null; }
export interface DPRDetailRow { id: string; label: string; project: string; vendor: string; value: number; }

export interface DPRFunnelStage { label: string; count: number; }

export interface DPRSiteProgressRow {
  projectId: string; projectName: string; projectLocation?: string; workOrderNo: string;
  description: string; unit: string; todayQty: number;
  completedQty: number; plannedQty: number; completionPct: number;
}

export interface DPRTrendPoint { date: string; count: number; }
export interface DPRCategorySlice { name: string; count: number; pct: number; color: string; }

export interface DPRProjectPerformance {
  projectId: string; projectName: string; projectLocation?: string;
  woCount: number; billRequestCount: number; approvedCount: number; paidCount: number;
  releasedAmount: number; pendingAmount: number; progressPct: number;
}

export interface DPROperational {
  kpis: {
    woCreatedToday: number; billRequestsToday: number; billsApprovedToday: number;
    paymentsReleasedToday: number; advancePaymentsToday: number; progressEntriesToday: number;
    pendingApprovals: number; contractorsActiveToday: number;
  };
  comparisons: Record<"woCreated" | "billRequestsRaised" | "billsApproved" | "paymentsReleased" | "advancePayments" | "progressEntries", DPRComparison>;
  details: Record<"woCreatedToday" | "billRequestsToday" | "billsApprovedToday" | "paymentsReleasedToday" | "advancePaymentsToday" | "pendingApprovals", DPRDetailRow[]>;
  funnel: DPRFunnelStage[];
  siteProgressToday: DPRSiteProgressRow[];
  woTrend: DPRTrendPoint[];
  woByCategory: DPRCategorySlice[];
  projectPerformance: DPRProjectPerformance[];
  briefs: string[];
}

export interface DPRMoneyTrendPoint { date: string; amount: number; }
export interface DPRBillsTrendPoint { date: string; raised: number; approved: number; paid: number; }

export interface DPRAgingBucket { label: string; count: number; amount: number; }
export interface DPRAgingRow { contractor: string; project: string; projectLocation?: string; billNo: string; amount: number; daysPending: number; status: string; }
export interface DPRAgingHeatCell { projectId: string; projectName: string; projectLocation?: string; bucket: string; count: number; }

export interface DPRDelayedContractor { vendorName: string; pendingAmount: number; daysWaiting: number; billCount: number; }
export interface DPRDelayedProject { projectId: string; projectName: string; projectLocation?: string; pendingAmount: number; avgDelayDays: number; }
export interface DPRAdvancePayment { vendorName: string; projectName: string; projectLocation?: string; amount: number; reason: string; adjusted: number; balance: number; date: string; }

export interface DPRFinancial {
  kpis: {
    amountReleasedToday: number; billsRaisedValueToday: number; approvedValueToday: number;
    pendingValueToday: number; outstandingLiability: number; advanceAmountToday: number;
  };
  comparisons: Record<"amountReleased" | "billsRaisedValue" | "approvedValue" | "advanceAmount", DPRComparison>;
  details: Record<"amountReleasedToday" | "billsRaisedValueToday" | "approvedValueToday" | "advanceAmountToday" | "pendingValueToday" | "outstandingLiability", DPRDetailRow[]>;
  paymentBreakdown: { released: number; retentionHeld: number; advanceRecovered: number; tds: number; net: number };
  dailyReleaseTrend: DPRMoneyTrendPoint[];
  billsTrend: DPRBillsTrendPoint[];
  aging: {
    buckets: DPRAgingBucket[]; table: DPRAgingRow[]; heatmap: DPRAgingHeatCell[];
    oldestPending: { contractor: string; project: string; amount: number; daysPending: number } | null;
  };
  approvalTimes: { avgVerificationDays: number; avgApprovalDays: number; avgPaymentDays: number };
  topDelayedContractors: DPRDelayedContractor[];
  topDelayedProjects: DPRDelayedProject[];
  advancePaymentsList: DPRAdvancePayment[];
  alerts: string[];
  healthScore: { score: number; status: "good" | "warning" | "critical" };
  briefs: string[];
}

export interface DPRReport {
  meta: {
    date: string;
    dateFrom: string | null;
    dateTo: string;
    isSingleDay: boolean;
    projectId: string | null;
    generatedAt: string;
  };
  operational: DPROperational;
  financial: DPRFinancial;
}
