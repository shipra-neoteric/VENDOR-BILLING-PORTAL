import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { inDateRange } from "../components/DateRangeFilter";
import { REVIEW_STATUS_LABEL } from "../shared/constants/drawingRequestOptions";
import type { DrawingRequest } from "../shared/constants/drawingRequestOptions";

interface ReportLike {
  projectId: string;
  projectName?: string;
  driName: string;
  date: string;
  vendorCode: string;
  vendorName?: string;
  labourCount: number | "";
  workEntries: { workType: string }[];
}
interface ProjectLike { _id: string; name: string; }
interface ProgressEntryLike {
  date: string | Date;
  qtyAdded: number;
  enteredBy?: { _id: string; name: string } | string | null;
  invalidated?: { done?: boolean; reason?: string };
}
interface SubItemLike {
  description: string;
  unit?: string;
  plannedQty?: number;
  completedQty?: number;
  progressEntries?: ProgressEntryLike[];
}
interface ScopeItemLike {
  description: string;
  unit?: string;
  plannedQty?: number;
  completedQty?: number;
  progressEntries?: ProgressEntryLike[];
  subItems?: SubItemLike[];
}
interface WorkOrderLike {
  projectId?: string | { _id: string; name?: string };
  assignedDRI?: ({ _id: string; name: string; email?: string } | string)[];
  scopeItems: ScopeItemLike[];
}

export interface ReportPeriod { from: Dayjs | null; to: Dayjs | null; }

export function periodLabel({ from, to }: ReportPeriod): string {
  if (!from && !to) return "All Time";
  if (from && to && from.isSame(to, "day")) return from.format("DD MMM YYYY");
  return `${from ? from.format("DD MMM YYYY") : "…"} – ${to ? to.format("DD MMM YYYY") : "…"}`;
}

// The equal-length window immediately preceding the selected period, used
// only for the "vs Previous Period" column — undefined for "All Time" since
// there's no prior window to compare against.
function previousPeriod({ from, to }: ReportPeriod): ReportPeriod | null {
  if (!from || !to) return null;
  const days = to.diff(from, "day") + 1;
  return { from: from.subtract(days, "day"), to: from.subtract(1, "day").endOf("day") };
}

export interface DailyProgressReportSummary {
  periodLabel: string;
  generatedAt: string;
  preparedBy: string;
  scopeLabel: string;
  kpis: {
    totalLabour: number;
    projectsCovered: number;
    totalContractors: number;
    workTypes: number;
    reportingDays: number;
    reportsSubmitted: number;
    drawingRequests: number;
  };
  projectSummary: {
    projectName: string; labour: number; contractors: number; majorWorkType: string; reportsCount: number; changePct: number | null;
    // Per-contractor breakdown nested under this project — same 4 columns as
    // the in-app labour flashcards (Vendor Code / Contractor Name / Work
    // Type / Labour Count), aggregated across the same date range/filters.
    vendorBreakdown: { vendorCode: string; vendorName: string; workType: string; labourCount: number }[];
  }[];
  workTypeSummary: { workType: string; entries: number; pct: number }[];
  workProgress: { description: string; unit: string; planned: number; completed: number; pct: number }[];
  drawingRequests: { ticketNo: string; description: string; projectName: string; driName: string; stageLabel: string; requestedOn: string; daysSince: number }[];
  actionItems: { level: "critical" | "warning" | "good"; text: string }[];
}

export function buildDailyProgressReportSummary(args: {
  reports: ReportLike[];
  workOrders: WorkOrderLike[];
  drawingReqs: DrawingRequest[];
  projects: ProjectLike[];
  period: ReportPeriod;
  filterProjectId: string;
  filterDriName: string;
  preparedBy: string;
}): DailyProgressReportSummary {
  const { reports, workOrders, drawingReqs, projects, period, filterProjectId, filterDriName, preparedBy } = args;

  const inRange = reports.filter(r =>
    inDateRange(r.date, period.from, period.to) &&
    (!filterProjectId || r.projectId === filterProjectId) &&
    (!filterDriName || r.driName === filterDriName)
  );

  const projectIds = new Set(inRange.map(r => r.projectId));
  const contractorCodes = new Set(inRange.map(r => r.vendorCode));
  const workTypeSet = new Set(inRange.flatMap(r => r.workEntries.map(e => e.workType)));
  const reportingDays = new Set(inRange.map(r => dayjs(r.date).format("YYYY-MM-DD"))).size;

  // ── Project-wise labour summary (+ per-contractor breakdown) ──
  const byProject = new Map<string, {
    projectName: string; labour: number; contractors: Set<string>; workTypeCounts: Map<string, number>; reportsCount: number;
    vendors: Map<string, { vendorName: string; workTypes: Set<string>; labour: number }>;
  }>();
  for (const r of inRange) {
    const key = r.projectId || r.projectName || "—";
    if (!byProject.has(key)) byProject.set(key, { projectName: r.projectName || "—", labour: 0, contractors: new Set(), workTypeCounts: new Map(), reportsCount: 0, vendors: new Map() });
    const row = byProject.get(key)!;
    row.labour += Number(r.labourCount) || 0;
    row.contractors.add(r.vendorCode);
    row.reportsCount += 1;
    for (const e of r.workEntries) row.workTypeCounts.set(e.workType, (row.workTypeCounts.get(e.workType) || 0) + 1);

    if (!row.vendors.has(r.vendorCode)) row.vendors.set(r.vendorCode, { vendorName: r.vendorName || "—", workTypes: new Set(), labour: 0 });
    const v = row.vendors.get(r.vendorCode)!;
    v.labour += Number(r.labourCount) || 0;
    for (const e of r.workEntries) v.workTypes.add(e.workType);
  }

  const prev = previousPeriod(period);
  const prevLabourByProject = new Map<string, number>();
  if (prev) {
    for (const r of reports) {
      if (!inDateRange(r.date, prev.from, prev.to)) continue;
      if (filterProjectId && r.projectId !== filterProjectId) continue;
      if (filterDriName && r.driName !== filterDriName) continue;
      const key = r.projectId || r.projectName || "—";
      prevLabourByProject.set(key, (prevLabourByProject.get(key) || 0) + (Number(r.labourCount) || 0));
    }
  }

  const projectSummary = [...byProject.entries()].map(([key, row]) => {
    let majorWorkType = "—";
    let max = 0;
    for (const [wt, count] of row.workTypeCounts) if (count > max) { max = count; majorWorkType = wt; }
    const prevLabour = prevLabourByProject.get(key);
    const changePct = prev && prevLabour !== undefined && prevLabour > 0
      ? Math.round(((row.labour - prevLabour) / prevLabour) * 100)
      : null;
    const vendorBreakdown = [...row.vendors.entries()]
      .map(([vendorCode, v]) => ({ vendorCode, vendorName: v.vendorName, workType: [...v.workTypes].join(", ") || "—", labourCount: v.labour }))
      .sort((a, b) => b.labourCount - a.labourCount);
    return { projectName: row.projectName, labour: row.labour, contractors: row.contractors.size, majorWorkType, reportsCount: row.reportsCount, changePct, vendorBreakdown };
  }).sort((a, b) => b.labour - a.labour);

  // ── Work-type distribution (report entries, not labour headcount — the
  // schema records labour per report, not split across the work types
  // logged in it, so "entries logged" is what's honestly derivable) ──
  const workTypeCounts = new Map<string, number>();
  for (const r of inRange) for (const e of r.workEntries) workTypeCounts.set(e.workType, (workTypeCounts.get(e.workType) || 0) + 1);
  const totalEntries = [...workTypeCounts.values()].reduce((a, b) => a + b, 0);
  const workTypeSummary = [...workTypeCounts.entries()]
    .map(([workType, entries]) => ({ workType, entries, pct: totalEntries > 0 ? Math.round((entries / totalEntries) * 100) : 0 }))
    .sort((a, b) => b.entries - a.entries);

  // ── Work progress — cumulative scope-item totals, filtered by project, DRI, and date range ──
  const filteredWO = workOrders.filter(wo => {
    if (filterProjectId) {
      const pid = typeof wo.projectId === "string" ? wo.projectId : wo.projectId?._id;
      if (pid !== filterProjectId) return false;
    }
    if (filterDriName) {
      const isDriAssigned = Boolean(
        wo.assignedDRI &&
        wo.assignedDRI.some(d => {
          if (!d) return false;
          return typeof d === "object" ? d.name === filterDriName : d === filterDriName;
        })
      );
      const hasEntryByDri = (wo.scopeItems || []).some(si => {
        const checkEntries = (entries?: ProgressEntryLike[]) =>
          (entries || []).some(e => {
            if (!e.enteredBy) return false;
            return typeof e.enteredBy === "object" ? e.enteredBy.name === filterDriName : e.enteredBy === filterDriName;
          });
        if (checkEntries(si.progressEntries)) return true;
        return (si.subItems || []).some(sub => checkEntries(sub.progressEntries));
      });
      if (!isDriAssigned && !hasEntryByDri) return false;
    }
    return true;
  });

  const byDesc = new Map<string, { description: string; unit: string; planned: number; completed: number }>();
  for (const wo of filteredWO) {
    const isDriAssigned = Boolean(
      !filterDriName ||
      (wo.assignedDRI &&
        wo.assignedDRI.some(d => {
          if (!d) return false;
          return typeof d === "object" ? d.name === filterDriName : d === filterDriName;
        }))
    );

    for (const si of wo.scopeItems || []) {
      const key = (si.description || "").trim().toLowerCase();
      if (!key) continue;
      if (!byDesc.has(key)) byDesc.set(key, { description: si.description, unit: si.unit || "", planned: 0, completed: 0 });
      const row = byDesc.get(key)!;
      row.planned += si.plannedQty || 0;

      const isAllTime = !period.from && !period.to;
      const noDriFilter = !filterDriName;

      const entryMatchesDri = (entry: ProgressEntryLike) => {
        if (noDriFilter || isDriAssigned) return true;
        const eb = entry.enteredBy;
        if (!eb) return false;
        return typeof eb === "object" ? eb.name === filterDriName : eb === filterDriName;
      };

      const allEntries: ProgressEntryLike[] = [];
      if (Array.isArray(si.progressEntries)) {
        for (const e of si.progressEntries) if (!e.invalidated?.done) allEntries.push(e);
      }
      if (Array.isArray(si.subItems)) {
        for (const sub of si.subItems) {
          if (Array.isArray(sub.progressEntries)) {
            for (const e of sub.progressEntries) if (!e.invalidated?.done) allEntries.push(e);
          }
        }
      }

      if (allEntries.length > 0) {
        for (const entry of allEntries) {
          if (!entryMatchesDri(entry)) continue;
          const dateStr = typeof entry.date === "string" ? entry.date : entry.date ? dayjs(entry.date).format("YYYY-MM-DD") : undefined;
          if (!inDateRange(dateStr, period.from, period.to)) continue;
          row.completed += Number(entry.qtyAdded) || 0;
        }
      } else if (isAllTime && (noDriFilter || isDriAssigned)) {
        row.completed += Number(si.completedQty) || 0;
      }
    }
  }
  const workProgress = [...byDesc.values()]
    .filter(r => r.planned > 0)
    .map(r => ({ ...r, pct: Math.min(100, Math.round((r.completed / r.planned) * 100)) }))
    .sort((a, b) => b.planned - a.planned)
    .slice(0, 15);

  // ── Drawing requests — filtered by date range, project, and DRI, matching the on-screen tab ──
  const filteredDR = drawingReqs.filter(d =>
    inDateRange(d.createdAt, period.from, period.to) &&
    (!filterProjectId || d.projectId === filterProjectId) &&
    (!filterDriName || d.driName === filterDriName)
  );
  const drawingRequestsOut = filteredDR
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
    .slice(0, 25)
    .map(d => ({
      ticketNo: d.ticketNo, description: d.description, projectName: d.projectName, driName: d.driName,
      stageLabel: REVIEW_STATUS_LABEL[d.reviewStatus], requestedOn: dayjs(d.createdAt).format("DD MMM YYYY"),
      daysSince: dayjs().diff(dayjs(d.createdAt), "day"),
    }));

  // ── Action items ──
  const delayedDrawings = filteredDR.filter(d => !["approved", "returned"].includes(d.reviewStatus) && dayjs().diff(dayjs(d.createdAt), "day") > 3);

  const actionItems: DailyProgressReportSummary["actionItems"] = [];
  if (delayedDrawings.length > 0) {
    actionItems.push({ level: "critical", text: `${delayedDrawings.length} drawing request${delayedDrawings.length === 1 ? "" : "s"} delayed more than 3 days` });
  }
  const totalProjectScope = filterProjectId ? 1 : projects.length;
  const missingCount = !filterProjectId ? projects.filter(p => !inRange.some(r => r.projectId === p._id)).length : 0;
  if (missingCount > 0) {
    actionItems.push({ level: "warning", text: `${missingCount} project${missingCount === 1 ? "" : "s"} did not submit a progress report for ${periodLabel(period)}` });
  }
  actionItems.push({ level: "good", text: `${projectIds.size} / ${totalProjectScope} project${totalProjectScope === 1 ? "" : "s"} reported in this period` });

  return {
    periodLabel: periodLabel(period),
    generatedAt: new Date().toISOString(),
    preparedBy,
    scopeLabel: [filterProjectId ? projects.find(p => p._id === filterProjectId)?.name : "All Projects", filterDriName || null].filter(Boolean).join(" · "),
    kpis: {
      totalLabour: inRange.reduce((s, r) => s + (Number(r.labourCount) || 0), 0),
      projectsCovered: projectIds.size,
      totalContractors: contractorCodes.size,
      workTypes: workTypeSet.size,
      reportingDays,
      reportsSubmitted: inRange.length,
      drawingRequests: filteredDR.length,
    },
    projectSummary, workTypeSummary, workProgress, drawingRequests: drawingRequestsOut, actionItems,
  };
}
