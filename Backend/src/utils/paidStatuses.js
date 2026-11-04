// Which bill statuses count as PAID in the money rollups (Projects, Dashboard, project stats, vendor groups, DPR).
//
// TMS (the payment system) is not connected yet, so a bill that is "Ready for TMS" (status 'approved') or has been
// sent to TMS ('sent-to-tms', 'payment-initiated') is treated as paid for now. Advance bills are bills like any other,
// so they come in through this as well. When TMS goes live, set TMS_CONNECTED to true and only 'paid' counts again.
const TMS_CONNECTED = false;

const PAID_LIKE_STATUSES = TMS_CONNECTED
  ? ['paid']
  : ['paid', 'approved', 'sent-to-tms', 'payment-initiated'];

// Certified = signed off by the final approver (whether or not it has been paid yet).
const CERTIFIED_STATUSES = [...new Set(['approved', 'paid', ...PAID_LIKE_STATUSES])];

const isPaidLike = (status) => PAID_LIKE_STATUSES.includes(status);

module.exports = { TMS_CONNECTED, PAID_LIKE_STATUSES, CERTIFIED_STATUSES, isPaidLike };
