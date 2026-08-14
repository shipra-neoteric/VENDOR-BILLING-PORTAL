export const DRAWING_TYPE_OPTIONS = [
  "Architectural", "Structural", "MEP", "Civil", "Interior", "Landscape", "Shop Drawing", "As-Built", "Other",
];

export const SOURCE_OPTIONS = ["Site Visit", "RFI", "Client Request", "Internal Review", "Other"];

export const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"] as const;
export type DrawingRequestPriority = typeof PRIORITY_OPTIONS[number] | "";

export const STATUS_OPTIONS = ["pending", "committed", "completed", "delayed"] as const;
export type DrawingRequestStatus = typeof STATUS_OPTIONS[number];

export const STATUS_LABEL: Record<DrawingRequestStatus, string> = {
  pending: "Pending", committed: "Committed", completed: "Completed", delayed: "Delayed",
};

export const STATUS_COLOR: Record<DrawingRequestStatus, "gray" | "blue" | "green" | "red" | "amber"> = {
  pending: "amber", committed: "blue", completed: "green", delayed: "red",
};

// ── Review chain — L1 (GM screen) → L2 (Architect draws) → L3 (GM
// cross-check) → L4 (GM final approval) must all clear before Planning can act ──
export const REVIEW_STATUS_OPTIONS = ["l1-gm", "l2-architect", "l3-gm", "l4-gm", "approved", "returned"] as const;
export type DrawingReviewStatus = typeof REVIEW_STATUS_OPTIONS[number];

export const REVIEW_STATUS_LABEL: Record<DrawingReviewStatus, string> = {
  "l1-gm": "GM Screening (L1)", "l2-architect": "Architect Drawing (L2)",
  "l3-gm": "GM Cross-Check (L3)", "l4-gm": "GM Final Approval (L4)",
  approved: "Approved", returned: "Returned",
};

export const REVIEW_STATUS_COLOR: Record<DrawingReviewStatus, "gray" | "blue" | "green" | "red" | "amber" | "purple" | "teal"> = {
  "l1-gm": "amber", "l2-architect": "blue", "l3-gm": "purple", "l4-gm": "teal", approved: "green", returned: "red",
};

export interface DrawingReviewHistoryEntry {
  stage: "l1-gm" | "l2-architect" | "l3-gm" | "l4-gm" | "dri";
  action: "forwarded" | "submitted" | "approved" | "returned" | "resubmitted";
  by?: { _id: string; name: string } | null;
  at: string;
  remarks?: string;
}

export interface DrawingRequestFile { name: string; url: string; }

export const PRIORITY_LABEL: Record<string, string> = {
  low: "Low", medium: "Medium", high: "High", urgent: "Urgent",
};

export const PRIORITY_COLOR: Record<string, "gray" | "blue" | "amber" | "red"> = {
  low: "gray", medium: "blue", high: "amber", urgent: "red",
};

export interface DrawingRequestUser { _id: string; name: string; email: string; }

export interface DrawingRequest {
  _id: string;
  ticketNo: string;
  projectId: string;
  projectName: string;
  description: string;
  drawingType: string;
  source: string;
  driName: string;
  reviewStatus: DrawingReviewStatus;
  reviewHistory: DrawingReviewHistoryEntry[];
  drawingFiles: DrawingRequestFile[];
  assignedTo?: DrawingRequestUser | null;
  committedDate?: string | null;
  priority: string;
  status: DrawingRequestStatus;
  actualCompletionDate?: string | null;
  planningVerified: boolean;
  projectAcknowledged: boolean;
  remarks: string;
  submittedBy?: DrawingRequestUser | null;
  isPublicSubmission: boolean;
  createdAt: string;
}

export function delayDays(req: DrawingRequest): number | null {
  if (!req.committedDate || !req.actualCompletionDate) return null;
  const diff = new Date(req.actualCompletionDate).getTime() - new Date(req.committedDate).getTime();
  return Math.round(diff / 86400000);
}
