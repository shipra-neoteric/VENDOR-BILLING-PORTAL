// Advances a date by one period of the given frequency — shared by both the
// "what's the first nextRunAt when a schedule is created" calculation and
// "advance past this run" after the cron executes it. Calendar-based (not a
// fixed number of days), so "monthly" always lands on the same day-of-month
// (e.g. the 5th), not drifting by the number of days in between months.
//
// `anchorDate` (the schedule's own original startDate) anchors which
// day-of-month monthly/quarterly advancement targets. Without it, naive
// `Date.setMonth` arithmetic on a start date like Jan 31st normalizes "Feb
// 31" to Mar 2/3 (JS rolls overflow into the next month), and worse, if the
// NEXT advance is computed from that already-drifted date instead of the
// true anchor, the day-of-month permanently drifts further every cycle and
// never returns to the 31st. Recomputing from the real anchor day each time
// (clamped to whatever the target month actually has, e.g. Jan 31 -> Feb 28
// -> Mar 31, not Mar 28) keeps it landing on the intended day whenever that
// month allows it, instead of drifting away forever.
function addMonthsAnchored(date, months, anchorDate) {
  const anchorDay = anchorDate ? new Date(anchorDate).getDate() : date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  const daysInTargetMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(anchorDay, daysInTargetMonth));
  return next;
}

function advanceByFrequency(date, frequency, anchorDate) {
  const d = new Date(date);
  switch (frequency) {
    case 'weekly':    d.setDate(d.getDate() + 7); return d;
    case 'monthly':   return addMonthsAnchored(d, 1, anchorDate);
    case 'quarterly': return addMonthsAnchored(d, 3, anchorDate);
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); return d;
    default: throw new Error(`Unknown frequency: ${frequency}`);
  }
}

module.exports = { advanceByFrequency };
