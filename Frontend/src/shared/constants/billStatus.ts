export const BILL_STATUS = {
  DRAFT:              'draft',
  SUBMITTED:          'submitted',
  VERIFIED:           'verified',
  APPROVED:           'approved',
  PAYMENT_INITIATED:  'payment-initiated',
  HOLD:               'hold',
  PAID:               'paid',
  REJECTED:           'rejected',
} as const;

export type BillStatus = (typeof BILL_STATUS)[keyof typeof BILL_STATUS];

export const BILL_STATUS_COLOR: Record<string, string> = {
  draft:               '#9CA3AF',
  submitted:           '#f59e0b',
  verified:            '#3b82f6',
  approved:            '#2563eb',
  'payment-initiated': '#d97706',
  hold:                '#9333ea',
  paid:                '#16a34a',
  rejected:            '#ef4444',
};

export const BILL_STATUS_LABEL: Record<string, string> = {
  draft:               'Awaiting Maker',
  submitted:           'Awaiting Checker',
  verified:            'Awaiting Checker (legacy)',
  approved:            'Awaiting Approver',
  'payment-initiated': 'Payment Initiated',
  hold:                'On Hold',
  paid:                'Paid',
  rejected:            'Rejected',
};
