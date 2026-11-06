// MIS Performance — planned vs actual for VMS approval work, from the real workflow data.
//
// One "planned" item = one workflow stage (Work Order / Bill Request approval step) that was given a due time by its SLA setting
// (WorkflowInstance stage.dueAt). It is planned in the week / month its due time falls in (IST). Then:
//   Work Done     = the stage was completed;   Work Not Done = Planned − Work Done (still open),
//   On time       = completed within SLA;       Late         = completed after its due time (stage.delayMinutes > 0, business-hours aware),
//   Overdue       = still open and past its due time;   SLA Breached = Late + Overdue,
//   Completion %  = Work Done ÷ Planned;  On-Time % / Late % = share of the completed work;
//   Difference    = Planned − Work Done;  Performance Gap % = (Work Done − Planned) ÷ Planned  (minus = behind plan).
// Only stages already due (due time up to the end of the selected range, never beyond today by default) count against the plan.
// Each stage is credited to whoever completed it, else to whoever it is assigned to; role-only stages show as "Unassigned".
const ExcelJS = require('exceljs');
const asyncHandler = require('../utils/asyncHandler');
const { success, badRequest } = require('../utils/responseFormatter');
const User = require('../models/User');
const WorkOrder = require('../models/WorkOrder');
const BillRequest = require('../models/BillRequest');
const WorkflowInstance = require('../models/WorkflowInstance');
const { overdueMinutesFor } = require('../utils/slaEngine');

const HIDDEN_USERS = ['Admin', 'DRI 1']; // shared/system accounts, left out like on the User table
const SLA_EXCLUDED_STAGES = new Set(['Payment Released']); // silenced in the SLA engine (TMS callback not reliable yet)
const IST_MIN = 330;
const DAY = 86400000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON3 = MONTHS.map(m => m.slice(0, 3));

// ── IST date helpers (a "day" is an IST day, so a stage due at 11:30 pm IST belongs to that day) ──
const istParts = (d) => { const t = new Date(d.getTime() + IST_MIN * 60000); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), dow: t.getUTCDay() }; };
const istDayStart = (y, m, d) => new Date(Date.UTC(y, m, d) - IST_MIN * 60000);
const ymd = (d) => { const p = istParts(d); return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
const parseYmd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? istDayStart(+m[1], +m[2] - 1, +m[3]) : null; };
const mondayOf = (d) => { const p = istParts(d); return new Date(istDayStart(p.y, p.m, p.d).getTime() - ((p.dow + 6) % 7) * DAY); };
const fmtDay = (d) => { const p = istParts(d); return `${String(p.d).padStart(2, '0')} ${MON3[p.m]}`; };
const monthKeyOf = (d) => { const p = istParts(d); return `${p.y}-${String(p.m + 1).padStart(2, '0')}`; };
const monthLabelOf = (d) => { const p = istParts(d); return `${MONTHS[p.m]} ${p.y}`; };

// ── aggregation ──
const newAgg = () => ({ planned: 0, done: 0, onTime: 0, late: 0, overdue: 0, tatSum: 0, tatCount: 0, delaySum: 0, delayCount: 0 });
function addCase(a, c) {
  a.planned++;
  if (c.done) { a.done++; if (c.late) a.late++; else a.onTime++; if (c.tatMinutes !== null) { a.tatSum += c.tatMinutes; a.tatCount++; } }
  else if (c.overdue) a.overdue++;
  // delay time: how far past its due time each delayed stage is (late completions: how late it finished; overdue: how long it has been overdue)
  if ((c.late || c.overdue) && c.delayMinutes > 0) { a.delaySum += c.delayMinutes; a.delayCount++; }
}
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100; // the % Not Done / On Time / Not On Time shares keep two decimals
function finish(a) {
  const notDone = a.planned - a.done;
  return {
    planned: a.planned, done: a.done, notDone, pending: notDone - a.overdue, overdue: a.overdue,
    onTime: a.onTime, late: a.late, breached: a.late + a.overdue,
    completionPct: a.planned ? r1((a.done / a.planned) * 100) : null,
    notDonePct: a.planned ? r2((notDone / a.planned) * 100) : null, // share of planned that is not done (100 − completion)
    onTimePct: a.done ? r2((a.onTime / a.done) * 100) : null,
    latePct: a.done ? r2((a.late / a.done) * 100) : null,
    difference: a.planned - a.done,
    gapPct: a.planned ? r1(((a.done - a.planned) / a.planned) * 100) : null,
    avgDelayMinutes: a.delayCount ? Math.round(a.delaySum / a.delayCount) : null, // average delay per delayed stage; null = nothing delayed
    avgTatMinutes: a.tatCount ? Math.round(a.tatSum / a.tatCount) : null, // null = no completed stage yet; 0 = finished in under a minute
  };
}
const sumAggs = (list) => { const t = newAgg(); for (const a of list) for (const k of Object.keys(t)) t[k] += a[k]; return t; };

const deptLabel = (doc) => {
  const raw = doc ? (doc.department === 'custom' ? (doc.customDepartment || '') : (doc.department || '')) : '';
  const s = String(raw).trim();
  return s ? s.replace(/^\w/, c => c.toUpperCase()) : 'No Department';
};

// All planned stages (with who / which department / which role), before the range and filters are applied.
async function loadCases() {
  const [instances, users] = await Promise.all([
    WorkflowInstance.find({}).select('entityType entityId status currentStageIndex stages').lean(),
    User.find({}).select('name role department isActive').lean(),
  ]);
  const woIds = instances.filter(i => i.entityType === 'WorkOrder').map(i => i.entityId);
  const brIds = instances.filter(i => i.entityType === 'BillRequest').map(i => i.entityId);
  const [wos, brs] = await Promise.all([
    woIds.length ? WorkOrder.find({ _id: { $in: woIds } }).select('department customDepartment').lean() : [],
    brIds.length ? BillRequest.find({ _id: { $in: brIds } }).select('department customDepartment').lean() : [],
  ]);
  const deptOf = new Map();
  for (const d of [...wos, ...brs]) deptOf.set(String(d._id), deptLabel(d));
  const userById = new Map(users.map(u => [String(u._id), u]));
  const hidden = new Set(users.filter(u => HIDDEN_USERS.includes(u.name)).map(u => String(u._id)));

  const now = new Date();
  const cases = [];
  instances.forEach(inst => {
    inst.stages.forEach((st, idx) => {
      if (st.status === 'pending' || !st.startedAt || !st.dueAt || SLA_EXCLUDED_STAGES.has(st.name)) return;
      const done = st.status === 'completed';
      // an open stage only counts while its workflow is genuinely sitting on it (not left open on a finished / cancelled one)
      if (!done && !(inst.status === 'in-progress' && idx === inst.currentStageIndex)) return;
      const uid = String(st.completedBy || st.assignedUserId || '');
      if (uid && hidden.has(uid)) return;
      const user = uid ? userById.get(uid) : null;
      cases.push({
        dueAt: new Date(st.dueAt), done,
        late: done ? (st.delayMinutes || 0) > 0 : false,
        overdue: done ? false : overdueMinutesFor(st, now) > 0,
        delayMinutes: done ? (st.delayMinutes || 0) : overdueMinutesFor(st, now),
        tatMinutes: done && st.completedAt ? Math.round((new Date(st.completedAt) - new Date(st.startedAt)) / 60000) : null,
        userId: uid || null,
        userName: user ? user.name : null,
        role: user ? (user.role || '') : (st.assignedRole && st.assignedRole !== 'any' ? st.assignedRole : ''),
        department: deptOf.get(String(inst.entityId)) || 'No Department',
      });
    });
  });
  const people = users.filter(u => u.isActive !== false && !HIDDEN_USERS.includes(u.name))
    .map(u => ({ id: String(u._id), name: u.name, role: u.role || '', department: u.department || '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { cases, people, userById };
}

function buildBuckets(from, to, groupBy) {
  const buckets = [];
  if (groupBy === 'month') {
    const p = istParts(from);
    let y = p.y, m = p.m;
    for (;;) {
      const start = istDayStart(y, m, 1);
      if (start > to) break;
      const nextStart = istDayStart(m === 11 ? y + 1 : y, (m + 1) % 12, 1);
      buckets.push({ key: `${y}-${String(m + 1).padStart(2, '0')}`, start, end: new Date(nextStart.getTime() - 1), label: `${MONTHS[m]} ${y}`, monthLabel: `${MONTHS[m]} ${y}`, monthKey: `${y}-${String(m + 1).padStart(2, '0')}`, weekNo: null });
      y = m === 11 ? y + 1 : y; m = (m + 1) % 12;
    }
    return buckets;
  }
  const perMonth = new Map();
  for (let start = mondayOf(from); start <= to; start = new Date(start.getTime() + 7 * DAY)) {
    const end = new Date(start.getTime() + 7 * DAY - 1);
    const monthKey = monthKeyOf(start); // a week belongs to the month its Monday falls in
    const n = (perMonth.get(monthKey) || 0) + 1;
    perMonth.set(monthKey, n);
    buckets.push({ key: ymd(start), start, end, monthKey, monthLabel: monthLabelOf(start), weekNo: n, label: `Week - ${n} (${fmtDay(start)} – ${fmtDay(new Date(end.getTime() - 1))})` });
  }
  return buckets;
}

async function buildPerformance(query) {
  const groupBy = query.groupBy === 'month' ? 'month' : 'week';
  const todayStart = (() => { const p = istParts(new Date()); return istDayStart(p.y, p.m, p.d); })();
  const toDay = parseYmd(query.to) || todayStart;
  const to = new Date(toDay.getTime() + DAY - 1);
  const fromDay = parseYmd(query.from) || new Date(mondayOf(todayStart).getTime() - 11 * 7 * DAY);
  if (fromDay > to) return { error: 'The From date is after the To date.' };
  if (to.getTime() - fromDay.getTime() > 800 * DAY) return { error: 'Please choose a range of at most about two years.' };

  const { cases: all, people, userById } = await loadCases();
  const department = query.department || '';
  const userId = query.userId || '';
  const role = query.role || '';

  const inRange = all.filter(c => c.dueAt >= fromDay && c.dueAt <= to);
  const departments = [...new Set(inRange.map(c => c.department))].sort();
  const cases = inRange.filter(c =>
    (!department || c.department === department)
    && (!userId || c.userId === userId)
    && (!role || c.role === role));

  const buckets = buildBuckets(fromDay, to, groupBy);
  const aggByKey = new Map(buckets.map(b => [b.key, newAgg()]));
  const total = newAgg();
  const byDept = new Map();
  const byUser = new Map();
  for (const c of cases) {
    const key = groupBy === 'month' ? monthKeyOf(c.dueAt) : ymd(mondayOf(c.dueAt));
    const agg = aggByKey.get(key);
    if (agg) addCase(agg, c);
    addCase(total, c);
    if (!byDept.has(c.department)) byDept.set(c.department, { agg: newAgg(), users: new Set() });
    const d = byDept.get(c.department);
    addCase(d.agg, c);
    if (c.userId) d.users.add(c.userId);
    const uKey = c.userId || 'unassigned';
    if (!byUser.has(uKey)) byUser.set(uKey, newAgg());
    addCase(byUser.get(uKey), c);
  }

  const rows = buckets.map(b => ({ key: b.key, label: b.label, monthLabel: b.monthLabel, monthKey: b.monthKey, weekNo: b.weekNo, start: b.start, end: b.end, ...finish(aggByKey.get(b.key)) }));
  const groups = [];
  if (groupBy === 'week') {
    for (const r of rows) {
      let g = groups[groups.length - 1];
      if (!g || g.monthKey !== r.monthKey) { g = { monthKey: r.monthKey, monthLabel: r.monthLabel, rows: [], aggs: [] }; groups.push(g); }
      g.rows.push(r); g.aggs.push(aggByKey.get(r.key));
    }
    for (const g of groups) { g.total = finish(sumAggs(g.aggs)); delete g.aggs; }
  }

  const periodCount = Math.max(1, buckets.length);
  const deptRows = [...byDept.entries()].map(([name, v]) => {
    const f = finish(v.agg);
    return { name, users: v.users.size, ...f,
      plannedPerUser: v.users.size ? r1(f.planned / v.users.size) : null, donePerUser: v.users.size ? r1(f.done / v.users.size) : null };
  }).sort((a, b) => b.planned - a.planned);
  const userRows = [...byUser.entries()].map(([id, agg]) => {
    const u = id === 'unassigned' ? null : userById.get(id);
    const f = finish(agg);
    return { userId: id, name: u ? u.name : 'Unassigned (role-based)', role: u ? (u.role || '') : '', department: u ? (u.department || '') : '', ...f,
      avgPlannedPerPeriod: r1(f.planned / periodCount), avgDonePerPeriod: r1(f.done / periodCount) };
  }).sort((a, b) => b.planned - a.planned || a.name.localeCompare(b.name));

  // Averages. Weighted = totals divided (so a person with 2 stages does not weigh like one with 200); "mean" = plain average of the rows.
  const named = userRows.filter(u => u.userId !== 'unassigned' && u.planned > 0);
  const mean = (arr) => (arr.length ? r1(arr.reduce((s, v) => s + v, 0) / arr.length) : null);
  const namedAgg = sumAggs([...byUser.entries()].filter(([id]) => id !== 'unassigned').map(([, a]) => a));
  const namedFin = finish(namedAgg);
  const userAverage = {
    users: named.length, avgPlanned: mean(named.map(u => u.planned)), avgDone: mean(named.map(u => u.done)), avgNotDone: mean(named.map(u => u.notDone)),
    avgDonePerPeriod: mean(named.map(u => u.avgDonePerPeriod)), weightedCompletionPct: namedFin.completionPct, meanCompletionPct: mean(named.filter(u => u.completionPct !== null).map(u => u.completionPct)),
    avgOnTime: mean(named.map(u => u.onTime)), avgLate: mean(named.map(u => u.late)), avgBreached: mean(named.map(u => u.breached)),
    // weighted = from the summed totals of the named users (unassigned role-based stages are not in any employee average)
    weightedNotDonePct: namedFin.notDonePct, weightedOnTimePct: namedFin.onTimePct, weightedLatePct: namedFin.latePct, avgDelayMinutes: namedFin.avgDelayMinutes, avgTatMinutes: namedFin.avgTatMinutes,
  };
  const activeDepts = deptRows.filter(d => d.planned > 0);
  const departmentAverage = {
    departments: activeDepts.length, avgPlanned: mean(activeDepts.map(d => d.planned)), avgDone: mean(activeDepts.map(d => d.done)),
    weightedCompletionPct: finish(total).completionPct, meanCompletionPct: mean(activeDepts.filter(d => d.completionPct !== null).map(d => d.completionPct)),
    weightedOnTimePct: finish(total).onTimePct, avgUsersPerDept: mean(activeDepts.map(d => d.users)),
  };

  const roles = [...new Set([...people.map(p => p.role), ...inRange.map(c => c.role)].filter(Boolean))].sort();
  return {
    meta: {
      from: ymd(fromDay), to: ymd(toDay), groupBy, periodCount, generatedAt: new Date().toISOString(),
      filters: { department, userId, userName: userId ? (userById.get(userId)?.name || '') : '', role },
    },
    kpis: finish(total),
    rows, groups, total: finish(total),
    departments: deptRows, users: userRows, userAverage, departmentAverage,
    options: { departments, roles, users: people },
  };
}

exports.getMisPerformance = asyncHandler(async (req, res) => {
  const data = await buildPerformance(req.query);
  if (data.error) return badRequest(res, data.error);
  return success(res, data);
});

// ── Excel export (same data as the screen, laid out like the weekly MIS report) ──
const ORANGE = 'FFFF7A00', LIGHT = 'FFFFF3E6', GREY = 'FFF3F4F6';
const hours = (m) => { // same look as the screen: 2d 3h / 5h 10m / 12m
  if (m === null || m === undefined) return '—';
  if (m === 0) return '<1m';
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
};
const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const gap = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v}%`);

function headerRow(ws, values) {
  const row = ws.addRow(values);
  row.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
  row.height = 22;
  return row;
}
function styleRow(row, { bold = false, fill = null } = {}) {
  row.eachCell((c, i) => { c.font = { bold }; if (fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }; c.border = { top: { style: 'thin', color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } }; if (i > 1) c.alignment = { horizontal: 'right' }; });
}

exports.exportMisPerformanceXlsx = asyncHandler(async (req, res) => {
  const d = await buildPerformance(req.query);
  if (d.error) return badRequest(res, d.error);
  const wb = new ExcelJS.Workbook();
  wb.creator = req.user?.name || 'VMS';
  wb.created = new Date();
  const unit = d.meta.groupBy === 'month' ? 'Month' : 'Week';
  const k = d.kpis;

  // Summary
  const s = wb.addWorksheet('Summary');
  s.columns = [{ width: 34 }, { width: 22 }, { width: 60 }];
  s.addRow(['MIS REPORT · USER PERFORMANCE']).font = { bold: true, color: { argb: ORANGE }, size: 11 };
  const t = s.addRow([`${unit}ly MIS Report`]); t.font = { bold: true, size: 18 };
  s.addRow([`${d.meta.from} – ${d.meta.to}`]).font = { color: { argb: 'FF6B7280' } };
  s.addRow([]);
  const f = d.meta.filters;
  [['Grouped by', unit], ['Department', f.department || 'All'], ['User', f.userName || 'All'], ['Role', f.role || 'All'],
    ['Generated on', new Date(d.meta.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })], ['Prepared by', req.user?.name || '']]
    .forEach(([a, b]) => { s.addRow([a, b]).getCell(1).font = { bold: true }; });
  s.addRow([]);
  headerRow(s, ['Metric', 'Value', 'How it is calculated']);
  [
    ['Total Planned', k.planned, 'Workflow stages whose SLA due time falls in the period (only stages already due)'],
    ['Work Done', k.done, 'Planned stages that were completed'],
    ['Work Not Done', k.notDone, 'Total Planned − Work Done (still open)'],
    ['   of which Overdue', k.overdue, 'Open and already past the SLA due time'],
    ['   of which Pending (not yet due)', k.pending, 'Open and still within SLA'],
    ['Completion %', pct(k.completionPct), 'Work Done ÷ Total Planned'],
    ['On-Time Completion', `${k.onTime} (${pct(k.onTimePct)})`, 'Completed within SLA ÷ Work Done'],
    ['Late Completion', `${k.late} (${pct(k.latePct)})`, 'Completed after the SLA due time ÷ Work Done'],
    ['SLA Breached', k.breached, 'Late completions + Overdue open stages'],
    ['Difference', k.difference, 'Planned − Work Done'],
    ['Performance Gap', gap(k.gapPct), '(Work Done − Planned) ÷ Planned; minus = behind plan'],
    ['Avg TAT', hours(k.avgTatMinutes), 'Average time from start to completion of a completed stage'],
  ].forEach(r => { const row = s.addRow(r); styleRow(row); row.getCell(3).alignment = { horizontal: 'left', wrapText: true }; });

  // Breakdown (weekly: month sub-totals; last row = grand total)
  const b = wb.addWorksheet(`${unit}ly Breakdown`);
  b.columns = [{ width: 16 }, { width: 30 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 13 }];
  headerRow(b, ['Month', unit, 'Planned', 'Work Done', 'Not Done', 'On Time', 'Late', 'Breached', 'Completion %', 'Difference', 'Perf. Gap']);
  const line = (a, bLabel, x) => [a, bLabel, x.planned, x.done, x.notDone, x.onTime, x.late, x.breached, pct(x.completionPct), x.difference, gap(x.gapPct)];
  if (d.meta.groupBy === 'week') {
    for (const g of d.groups) {
      g.rows.forEach((r, i) => styleRow(b.addRow(line(i === 0 ? g.monthLabel : '', r.label, r))));
      styleRow(b.addRow(line('', `${g.monthLabel} total`, g.total)), { bold: true, fill: LIGHT });
    }
    styleRow(b.addRow(line('', 'Total Weeks', d.total)), { bold: true, fill: GREY });
  } else {
    d.rows.forEach(r => styleRow(b.addRow(line('', r.label, r))));
    styleRow(b.addRow(line('', 'Total Months', d.total)), { bold: true, fill: GREY });
  }
  b.views = [{ state: 'frozen', ySplit: 1 }];

  // Departments
  const dp = wb.addWorksheet('Departments');
  dp.columns = [{ width: 24 }, { width: 8 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 13 }, { width: 14 }, { width: 14 }];
  headerRow(dp, ['Department', 'Users', 'Planned', 'Work Done', 'Not Done', 'On Time', 'Late', 'Breached', 'Completion %', 'Perf. Gap', 'Planned / User', 'Done / User']);
  d.departments.forEach(x => styleRow(dp.addRow([x.name, x.users, x.planned, x.done, x.notDone, x.onTime, x.late, x.breached, pct(x.completionPct), gap(x.gapPct), x.plannedPerUser ?? '—', x.donePerUser ?? '—'])));
  const da = d.departmentAverage;
  styleRow(dp.addRow(['Overall average', da.avgUsersPerDept ?? '—', da.avgPlanned ?? '—', da.avgDone ?? '—', '', '', '', '', `${pct(da.weightedCompletionPct)} weighted · ${pct(da.meanCompletionPct)} mean`, '', '', '']), { bold: true, fill: GREY });

  // Users — five grouped sections; employees first with the average row, role-only (unassigned) stages separately underneath
  const us = wb.addWorksheet('Users');
  us.columns = [{ width: 28 }, { width: 18 }, { width: 14 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 15 }, { width: 13 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 12 }];
  const groupRow = us.addRow(['User Details', '', '', 'Work Summary', '', '', 'SLA Breakdown', '', '', '', 'Performance', '', '', 'Productivity']);
  [[1, 3], [4, 6], [7, 10], [11, 13]].forEach(([a, b]) => us.mergeCells(1, a, 1, b));
  groupRow.eachCell(c => { c.font = { bold: true, color: { argb: 'FF7A3E00' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }; c.alignment = { horizontal: 'center' }; c.border = { bottom: { style: 'medium', color: { argb: ORANGE } } }; });
  headerRow(us, ['User', 'Role', 'Department', 'Planned', 'Work Done', 'Not Done', 'Done On Time', 'Done Not On Time', 'SLA Breached', 'Avg Delay', '% Not Done', '% Done On Time', '% Done Not On Time', 'Avg TAT']);
  const userLine = (x) => [x.name, x.role, x.department, x.planned, x.done, x.notDone, x.onTime, x.late, x.breached, hours(x.avgDelayMinutes), pct(x.notDonePct), pct(x.onTimePct), pct(x.latePct), hours(x.avgTatMinutes)];
  d.users.filter(x => x.userId !== 'unassigned').forEach(x => styleRow(us.addRow(userLine(x))));
  const ua = d.userAverage;
  styleRow(us.addRow(['Average per user', '', '', ua.avgPlanned ?? '—', ua.avgDone ?? '—', ua.avgNotDone ?? '—', ua.avgOnTime ?? '—', ua.avgLate ?? '—', ua.avgBreached ?? '—', hours(ua.avgDelayMinutes),
    pct(ua.weightedNotDonePct), pct(ua.weightedOnTimePct), pct(ua.weightedLatePct), hours(ua.avgTatMinutes)]), { bold: true, fill: GREY });
  const un = d.users.filter(x => x.userId === 'unassigned');
  if (un.length) {
    const note = us.addRow(['Unassigned — stages assigned to a role only (not part of the averages above)']);
    note.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
    un.forEach(x => styleRow(us.addRow(userLine(x))));
  }
  us.views = [{ state: 'frozen', ySplit: 2 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="mis-${d.meta.groupBy}ly-report-${d.meta.from}-to-${d.meta.to}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});
