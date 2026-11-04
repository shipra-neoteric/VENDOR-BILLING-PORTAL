// Mirror of Backend/src/utils/paidStatuses.js — which bill statuses count as PAID in money totals.
// TMS (the payment system) is not connected yet, so a bill that is "Ready for TMS" ('approved') or sent to TMS counts as
// paid for now. When TMS goes live, set TMS_CONNECTED to true (here and in the backend file) so only 'paid' counts.
const TMS_CONNECTED = false;

export const PAID_LIKE_STATUSES: string[] = TMS_CONNECTED ? ["paid"] : ["paid", "approved", "sent-to-tms", "payment-initiated"];

export const isPaidLike = (status: string | undefined | null): boolean => !!status && PAID_LIKE_STATUSES.includes(status);
