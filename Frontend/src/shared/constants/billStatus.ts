export const BILL_STATUS = {
  DRAFT:     'draft',
  SUBMITTED: 'submitted',
  VERIFIED:  'verified',
  APPROVED:  'approved',
  PAID:      'paid',
  REJECTED:  'rejected',
} as const;

export type BillStatus = (typeof BILL_STATUS)[keyof typeof BILL_STATUS];

export const BILL_STATUS_COLOR: Record<string, string> = {
  draft:     '#9CA3AF',
  submitted: '#f59e0b',
  verified:  '#3b82f6',
  approved:  '#16a34a',
  paid:      '#0d9488',
  rejected:  '#ef4444',
};

export const BILL_STATUS_LABEL: Record<string, string> = {
  draft:     'Draft',
  submitted: 'Submitted',
  verified:  'Verified',
  approved:  'Approved',
  paid:      'Paid',
  rejected:  'Rejected',
};
