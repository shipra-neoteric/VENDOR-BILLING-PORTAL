export const BILL_STATUS = {
  DRAFT:         'draft',
  VERIFY_DONE:   'verify-done',
  L1_APPROVED:   'l1-approved',
  APPROVED:      'approved',
  SENT_TO_TMS:   'sent-to-tms',
  HOLD:          'hold',
  PAID:          'paid',
  REJECTED:      'rejected',
} as const;

export type BillStatus = (typeof BILL_STATUS)[keyof typeof BILL_STATUS];

export const BILL_STATUS_COLOR: Record<string, string> = {
  draft:         '#9CA3AF',
  'verify-done': '#f59e0b',
  'l1-approved': '#0891b2',
  approved:      '#2563eb',
  'sent-to-tms': '#7c3aed',
  hold:          '#9333ea',
  paid:          '#16a34a',
  rejected:      '#ef4444',
};

export const BILL_STATUS_LABEL: Record<string, string> = {
  draft:         'Awaiting Verification',
  'verify-done': 'Pending L1 (AGM)',
  'l1-approved': 'Pending L2 (GM)',
  approved:      'Ready for TMS',
  'sent-to-tms': 'Sent to TMS',
  hold:          'Hold',
  paid:          'Paid',
  rejected:      'Rejected',
};
