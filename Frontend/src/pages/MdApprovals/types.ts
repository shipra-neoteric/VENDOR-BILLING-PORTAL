export type MdSystem = "WorkOrder" | "BillRequest" | "RunningBill-Manual" | "RunningBill-Accounts";
export type MdTab = "pending" | "approved" | "rejected" | "aging";

export interface MdApprovalRow {
  id: string;
  system: MdSystem;
  approvalType: string;
  referenceNumber?: string;
  requester?: string | null;
  workOrderNo?: string | null;
  projectName?: string | null;
  vendorName?: string | null;
  department?: string | null;
  isArchived?: boolean;
  amount: number;
  submittedAt?: string;
  pendingSince?: string;
  daysPending?: number;
  status: string;
  currentStage: string;
  // Only present on tab=approved/rejected rows.
  decision?: "approved" | "rejected" | "sent-back";
  decidedBy?: string | null;
  decidedAt?: string;
  daysToDecide?: number;
}

export const SYSTEM_LABEL: Record<MdSystem, string> = {
  WorkOrder: "Work Orders",
  BillRequest: "Bill Requests",
  "RunningBill-Manual": "Manual Bills",
  "RunningBill-Accounts": "Accounts Payment",
};
