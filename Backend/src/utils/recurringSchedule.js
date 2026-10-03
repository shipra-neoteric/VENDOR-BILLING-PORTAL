// Advances a date by one period of the given frequency — shared by both the
// "what's the first nextRunAt when a schedule is created" calculation and
// "advance past this run" after the cron executes it. Calendar-based (not a
// fixed number of days), so "monthly" always lands on the same day-of-month
// (e.g. the 5th), not drifting by the number of days in between months.
function advanceByFrequency(date, frequency) {
  const d = new Date(date);
  switch (frequency) {
    case 'weekly':    d.setDate(d.getDate() + 7); break;
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); break;
    default: throw new Error(`Unknown frequency: ${frequency}`);
  }
  return d;
}

module.exports = { advanceByFrequency };
