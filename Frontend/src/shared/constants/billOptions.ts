// Shared between Accounts Payment (bill detail/processing) and Billing
// (bill creation) — both need the same bill-type/relationship/payment-mode
// labels, so this lives in one place instead of two drifting copies.

export const BILL_TYPE_CFG: Record<string, { label: string; color: string }> = {
  running:              { label: "Running Bill",     color: "#2563eb" },
  final:                { label: "Final Bill",       color: "#16a85a" },
  advance_mobilization: { label: "Mob. Advance",     color: "#7c3aed" },
  advance_secured:      { label: "Secured Advance",  color: "#7c3aed" },
  advance_material:     { label: "Material Advance", color: "#7c3aed" },
  recovery:             { label: "Recovery",         color: "#d97706" },
  credit_note:          { label: "Credit Note",      color: "#dc2626" },
  debit_note:           { label: "Debit Note",       color: "#d97706" },
  revision:             { label: "Revision",         color: "#0d9488" },
  correction:           { label: "Correction",       color: "#0d9488" },
  retention_release:    { label: "Retention Release",color: "#0369a1" },
};

export const RELATIONSHIP_OPTIONS = [
  { value: "NONE",                label: "None — standalone bill" },
  { value: "CONTINUES",           label: "CONTINUES — next running bill in sequence" },
  { value: "SUPERSEDES",          label: "SUPERSEDES — final bill replacing running bills" },
  { value: "ADJUSTMENT",          label: "ADJUSTMENT — credit/debit note on a bill" },
  { value: "REVISION_OF",         label: "REVISION_OF — replaces an earlier bill" },
  { value: "ADVANCE_FOR",         label: "ADVANCE_FOR — advance for future billing" },
  { value: "RECOVERY_OF",         label: "RECOVERY_OF — recovering a prior advance" },
  { value: "SETTLEMENT_OF",       label: "SETTLEMENT_OF — settling outstanding balance" },
  { value: "CORRECTION_OF",       label: "CORRECTION_OF — correcting a previous bill" },
  { value: "RETENTION_RELEASE_OF",label: "RETENTION_RELEASE_OF — releasing held retention" },
];

export const PAYMENT_MODE_OPTIONS = [
  { label: "NEFT", value: "neft" },
  { label: "RTGS", value: "rtgs" },
  { label: "IMPS", value: "imps" },
  { label: "Internet Banking", value: "internet_banking" },
  { label: "UPI", value: "upi" },
  { label: "Cheque", value: "cheque" },
  { label: "Demand Draft (DD)", value: "dd" },
  { label: "Cash", value: "cash" },
];
