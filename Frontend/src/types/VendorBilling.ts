export type UserRole =
  | "owner"
  | "engineer"
  | "accounts"
  | "gm"
  | "contractor";

export type ProjectStatus =
  | "active"
  | "completed"
  | "on-hold";

export type BillStatus =
  | "draft"
  | "submitted"
  | "verified"
  | "approved"
  | "rejected"
  | "paid";

export interface Project {
  id: string;
  code: string;
  name: string;
  location: string;
  contractValue: number;
  status: ProjectStatus;
  projectType?: "apartment" | "plot";
  parentId?: string | null;
}

export interface Contractor {
  id: string;
  vendorCode: string;
  companyName: string;
  shortCode?: string;
  ownerName: string;
  address: string;

  mobile: string;
  alternateMobile?: string;

  email?: string;

  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;

  gstNumber?: string;
  panNumber?: string;
  aadhaarNumber?: string;

  workTypes: string[];

  reference1?: string;
  reference2?: string;

  averageTurnover?: number;

  status: "active" | "inactive";

  documents?: Record<string, { fileName?: string; dataUrl?: string } | undefined>;
}

export interface WorkItem {
  id: string;
  projectId: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  executedQty: number;
}

export interface WorkProgressEntry {
  id: string;
  date: string;
  qtyAdded: number;
  remarks?: string;
  tower?: string;
  floor?: string;
  flatNo?: string;
  plotNo?: string;
  locationNote?: string;
}

export interface ScopeSubItem {
  id: string;
  description: string;
  remarks?: string;
  unit: string;
  plannedQty: number;
  rate: number;
  amount: number;
}

export type ScopeItemStatus = "pending" | "running" | "completed";

export interface ScopeItem {
  id: string;
  description: string;
  remarks?: string;
  unit: string;
  plannedQty: number;
  rate: number;
  amount: number;
  gstPercent?: number;
  plannedStart: string;
  plannedEnd: string;
  status: ScopeItemStatus;
  completedQty: number;
  progressEntries: WorkProgressEntry[];
  subItems: ScopeSubItem[];
}

export type WorkOrderStatus = "draft" | "issued" | "in-progress" | "completed" | "cancelled";

export type WorkCategory =
  | "Civil / RCC"
  | "Finishing"
  | "MEP"
  | "Interior"
  | "External Works"
  | "Hospitality"
  | "";

export interface PaymentMilestone {
  id: string;
  stage: string;
  date: string;
  type: string;
  mode: string;
  amount: number;
  amountMode?: "fixed" | "percent";
  amountPercent?: number | null;
  discount?: number;
  gstPercent: number;
  payable: number;
}

export interface WorkOrder {
  id: string;
  workOrderNo: string;
  issueDate: string;
  preparedByName?: string;
  preparedByContact?: string;
  projectId: string;
  projectName: string;
  projectLocation?: string;
  vendorCode: string;
  vendorName: string;
  ownerName: string;
  mobile: string;
  category?: WorkCategory;
  subCategory?: string;
  scopeOfWork?: string;
  totalTenure?: string;
  scopeItems: ScopeItem[];
  contractValue: number;
  discount?: number;
  gstPercent?: number;
  retentionPercent?: number;
  documentName?: string;
  documentUrl?: string;
  documents?: { name: string; url: string }[];
  paymentMilestones?: PaymentMilestone[];
  warrantyTerms?: string[];
  status: WorkOrderStatus;
  cancelReason?: string;
  cancelledBy?: { _id: string; name: string; email?: string } | string;
  cancelledAt?: string;
  createdAt?: string;
  createdBy?: { _id: string; name: string; email?: string } | string;
}

export interface Bill {
  id: string;
  billNumber: string;
  projectId: string;
  contractorId: string;
  billDate: string;
  amount: number;
  status: BillStatus;
  remarks?: string;
}

export interface RunningBill {
  id: string;
  billNo: string;
  workOrderId: string;
  workOrderNo: string;
  projectId: string;
  projectName: string;
  vendorCode: string;
  vendorName: string;
  billDate: string;
  billRefNo?: string;
  description?: string;
  amount: number;
  gstPercent: number;
  tdsPercent: number;
  remarks?: string;
  status: BillStatus;
  submittedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectReason?: string;
}

export interface Approval {
  id: string;
  billId: string;
  approvedBy: string;
  role: UserRole;
  action: "verified" | "approved" | "rejected";
  remarks?: string;
  date: string;
}

export interface LedgerEntry {
  id: string;
  projectId: string;
  billId: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  date: string;
}

export interface DashboardStats {
  contractValue: number;
  certifiedAmount: number;
  approvedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
}

// ── Contractor Billing & Verification Workflow ────────────────

export type ContractorBillStatus =
  | "draft"
  | "submitted"
  | "under-verification"
  | "verification-completed"
  | "returned"
  | "closed";

export interface ContractorBillItem {
  id: string;
  scopeItemId: string;
  scopeItemDesc: string;
  unit: string;
  boqQty: number;
  previouslyPaidQty: number;
  claimedQty: number;
  systemQty: number;
  rate: number;
  claimedAmount: number;
  verifiedQty?: number;
  verifiedAmount?: number;
  verificationRemarks?: string;
}

export interface ContractorBill {
  id: string;
  billNo: string;
  projectId: string;
  projectName: string;
  vendorCode: string;
  vendorName: string;
  workOrderId: string;
  workOrderNo: string;
  billDate: string;
  billingPeriodFrom: string;
  billingPeriodTo: string;
  contractorRefNo?: string;
  submittedAt?: string;
  remarks?: string;
  status: ContractorBillStatus;
  items: ContractorBillItem[];
  totalClaimedAmount: number;
  totalVerifiedAmount?: number;
  verifiedBillId?: string;
  returnReason?: string;
}

export type ApprovalRole =
  | "site-engineer"
  | "project-manager"
  | "gm"
  | "accounts"
  | "finance";

export interface ApprovalStep {
  id: string;
  role: ApprovalRole;
  roleLabel: string;
  action: "pending" | "approved" | "rejected";
  approverName?: string;
  remarks?: string;
  timestamp?: string;
}

export interface VerifiedBillItem {
  id: string;
  scopeItemId: string;
  scopeItemDesc: string;
  unit: string;
  previousCertifiedQty: number;
  currentCertifiedQty: number;
  cumulativeCertifiedQty: number;
  rate: number;
  amount: number;
}

export type VerifiedBillStatus =
  | "generated"
  | "under-approval"
  | "approved"
  | "payment-processing"
  | "paid"
  | "closed";

export interface VerifiedBill {
  id: string;
  verifiedBillNo: string;
  contractorBillId: string;
  contractorBillNo: string;
  projectId: string;
  projectName: string;
  vendorCode: string;
  vendorName: string;
  workOrderId: string;
  workOrderNo: string;
  billingPeriodFrom: string;
  billingPeriodTo: string;
  generatedAt: string;
  generatedBy: string;
  items: VerifiedBillItem[];
  grossAmount: number;
  advanceDeduction: number;
  retentionPercent: number;
  retentionAmount: number;
  otherRecoveries: number;
  gstPercent: number;
  gstAmount: number;
  tdsPercent: number;
  tdsAmount: number;
  netPayable: number;
  approvalChain: ApprovalStep[];
  status: VerifiedBillStatus;
  paymentUTR?: string;
  paymentChequeNo?: string;
  paymentDate?: string;
  paymentBank?: string;
  paymentMode?: "neft" | "rtgs" | "cheque" | "imps";
  paymentReleasedBy?: string;
}

// ── Work Execution Tracking ───────────────────────────────────
// Separate from Work Orders (which are formal contract documents).
// These track live construction progress stage by stage.

export type WorkItemStatus = "pending" | "running" | "completed" | "on-hold" | "cancelled";

export interface ProgressEntry {
  id: string;
  workItemId: string;
  date: string;
  quantityAdded: number;
  remarks?: string;
  updatedBy: string;
}

export interface WorkItemExecution {
  id: string;
  projectId: string;
  contractorId?: string;
  workOrderId?: string;
  sequence: number;
  name: string;
  unit: string;
  plannedQuantity: number;
  completedQuantity: number;
  remainingQuantity: number;
  completionPercentage: number;
  rate: number;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  status: WorkItemStatus;
  delayDays: number;
  description?: string;
  remarks?: string;
  progressEntries: ProgressEntry[];
}

