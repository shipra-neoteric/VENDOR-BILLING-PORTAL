import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Eye, ClipboardList, Users, TrendingUp, PenTool, Building2, Download } from "lucide-react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import WorkCategoryChecklist from "../../components/WorkCategoryChecklist";
import DrawingRequestButton from "../../components/DrawingRequestButton";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import { downloadDailyProgressReportPDF } from "../../components/DailyProgressReportPDF";
import { buildDailyProgressReportSummary, periodLabel } from "../../utils/dailyProgressReportSummary";
import { firstMissingProgressField, MIN_IMAGES_PER_CATEGORY } from "../../shared/constants/dailyProgressReportOptions";
import type { DailyProgressReportFormValues, WorkEntry } from "../../shared/constants/dailyProgressReportOptions";
import { REVIEW_STATUS_LABEL, REVIEW_STATUS_COLOR } from "../../shared/constants/drawingRequestOptions";
import type { DrawingRequest } from "../../shared/constants/drawingRequestOptions";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import NxBtn from "../../ui/nexora/Btn";
import NxCard from "../../ui/nexora/Card";
import NxStatCard from "../../ui/nexora/StatCard";
import NxBadge from "../../ui/nexora/Badge";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import Segmented from "../../ui/Segmented";
import SField from "../../ui/SField";
import { DatePicker } from "../../ui/DatePicker";
import Field from "../../ui/Field";
import Modal from "../../ui/Modal";
import Card from "../../ui/Card";
import { SectionHeading } from "../../ui/Descriptions";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import { SkeletonTable } from "../../ui/Skeleton";
import EmptyState from "../../ui/EmptyState";

interface ProjectOption { _id: string; name: string; }
interface ContractorOption { vendorCode: string; companyName: string; }
interface DriOption { _id: string; name: string; }
interface ScopeItemRow { description: string; unit?: string; plannedQty?: number; completedQty?: number; }
interface WorkOrderRow { _id: string; projectId?: string | { _id: string }; scopeItems: ScopeItemRow[]; }

interface ProgressReportRow extends DailyProgressReportFormValues {
  _id: string;
  createdAt: string;
}

const emptyForm: DailyProgressReportFormValues = {
  projectId: "", driName: "", date: dayjs().format("YYYY-MM-DD"), vendorCode: "",
  shiftType: "", labourCount: "", workEntries: [],
};

// The old Badge palette includes "purple", which NxBadge doesn't — map it
// onto the closest Nexora semantic color, same fix DrawingRequests/index.tsx
// already applies to this exact constants file's colors.
function toNxColor(c: "gray" | "blue" | "green" | "red" | "amber" | "purple" | "teal"): NxBadgeColor {
  return c === "purple" ? "indigo" : c;
}

export default function DailyProgressReport() {
  const { user } = useAuth();

  const [projects, setProjects]       = useState<ProjectOption[]>([]);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [driUsers, setDriUsers]       = useState<DriOption[]>([]);
  const [reports, setReports]         = useState<ProgressReportRow[]>([]);
  const [workOrders, setWorkOrders]   = useState<WorkOrderRow[]>([]);
  const [drawingReqs, setDrawingReqs] = useState<DrawingRequest[]>([]);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [viewReport, setViewReport]   = useState<ProgressReportRow | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Filters driving the flashcards/tables below — independent of the New
  // Report form's own state above. Default null/null ("All Time") matches
  // every other page's DateRangeFilter convention (Billing, WorkItems, etc).
  const [filterDateFrom, setFilterDateFrom] = useState<Dayjs | null>(null);
  const [filterDateTo, setFilterDateTo] = useState<Dayjs | null>(null);
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterDriName, setFilterDriName] = useState("");
  const [activeTab, setActiveTab] = useState<"progress" | "drawings" | "summary">("progress");
  const [generating, setGenerating] = useState(false);

  // Returns the freshly-fetched data directly (in addition to updating
  // state) so callers that need it immediately — like PDF generation —
  // don't have to wait a render cycle for stale-closure state to update.
  const fetchAll = async () => {
    const [p, c, u, r, wo, dr] = await Promise.all([
      apiClient.get("/projects"),
      apiClient.get("/contractors"),
      apiClient.get("/auth/users", { params: { role: "site-dri" } }),
      apiClient.get("/daily-progress-reports"),
      apiClient.get("/work-orders"),
      apiClient.get("/drawing-requests"),
    ]);
    const data = {
      projects: (p.data.projects || []) as ProjectOption[],
      contractors: (c.data.contractors || []) as ContractorOption[],
      driUsers: (u.data.users || []) as DriOption[],
      reports: (r.data.reports || []) as ProgressReportRow[],
      workOrders: (wo.data.workOrders || []) as WorkOrderRow[],
      drawingReqs: (dr.data.requests || []) as DrawingRequest[],
    };
    setProjects(data.projects);
    setContractors(data.contractors);
    setDriUsers(data.driUsers);
    setReports(data.reports);
    setWorkOrders(data.workOrders);
    setDrawingReqs(data.drawingReqs);
    return data;
  };

  const load = () => {
    setLoading(true);
    fetchAll().catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function handleGenerateReport() {
    setGenerating(true);
    try {
      const data = await fetchAll();
      const summary = buildDailyProgressReportSummary({
        reports: data.reports,
        workOrders: data.workOrders,
        drawingReqs: data.drawingReqs,
        projects: data.projects,
        period: { from: filterDateFrom, to: filterDateTo },
        filterProjectId,
        filterDriName,
        preparedBy: user?.name || "—",
      });
      await downloadDailyProgressReportPDF(summary);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  }

  function openNew() {
    // If the logged-in user is themselves a registered DRI, default to their
    // own name — still changeable, since an admin filling this in on behalf
    // of a site DRI needs to pick a different one from the dropdown.
    const ownName = driUsers.some(d => d.name === user?.name) ? user?.name ?? "" : "";
    setForm({ ...emptyForm, driName: ownName });
    setShowForm(true);
  }

  function setEntries(workEntries: WorkEntry[]) {
    setForm(f => ({ ...f, workEntries }));
  }

  async function onSubmit() {
    const missing = firstMissingProgressField(form);
    if (missing) return toast.error(`Select ${missing}`);
    if (form.workEntries.length === 0) return toast.error("Check at least one work type");
    const short = form.workEntries.find(e => e.images.length < MIN_IMAGES_PER_CATEGORY);
    if (short) return toast.error(`"${short.workType}" needs at least ${MIN_IMAGES_PER_CATEGORY} photo${MIN_IMAGES_PER_CATEGORY === 1 ? "" : "s"}`);

    setSubmitting(true);
    try {
      await apiClient.post("/daily-progress-reports", form);
      toast.success("Daily Progress Report submitted");
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  const projectOptions = projects.map(p => ({ label: p.name, value: p._id }));

  // ── Filtered slices driving the flashcards/tables ──────────────────────
  const reportsInPeriod = useMemo(() => reports.filter(r =>
    inDateRange(r.date, filterDateFrom, filterDateTo) &&
    (!filterProjectId || r.projectId === filterProjectId) &&
    (!filterDriName || r.driName === filterDriName)
  ), [reports, filterDateFrom, filterDateTo, filterProjectId, filterDriName]);

  const periodText = useMemo(() => periodLabel({ from: filterDateFrom, to: filterDateTo }), [filterDateFrom, filterDateTo]);

  const totalLabourToday = useMemo(
    () => reportsInPeriod.reduce((s, r) => s + (Number(r.labourCount) || 0), 0),
    [reportsInPeriod]
  );
  const activeProjectsToday = useMemo(
    () => new Set(reportsInPeriod.map(r => r.projectId)).size,
    [reportsInPeriod]
  );

  const filteredWorkOrders = useMemo(() => workOrders.filter(wo => {
    if (!filterProjectId) return true;
    const pid = typeof wo.projectId === "string" ? wo.projectId : wo.projectId?._id;
    return pid === filterProjectId;
  }), [workOrders, filterProjectId]);

  // Grouped by description across every work order in scope — a "site-wide"
  // rollup rather than per-work-order, since a work item like "Excavation"
  // recurs across many work orders.
  const workProgressRows = useMemo(() => {
    const byDesc = new Map<string, { description: string; unit: string; planned: number; completed: number }>();
    for (const wo of filteredWorkOrders) {
      for (const si of wo.scopeItems || []) {
        const key = (si.description || "").trim().toLowerCase();
        if (!key) continue;
        if (!byDesc.has(key)) byDesc.set(key, { description: si.description, unit: si.unit || "", planned: 0, completed: 0 });
        const row = byDesc.get(key)!;
        row.planned += si.plannedQty || 0;
        row.completed += si.completedQty || 0;
      }
    }
    return [...byDesc.values()].filter(r => r.planned > 0).sort((a, b) => b.planned - a.planned).slice(0, 8);
  }, [filteredWorkOrders]);

  // Overall %, from every scope item in scope — not just the top 8 rows shown.
  const overallWorkProgressPct = useMemo(() => {
    let planned = 0, completed = 0;
    for (const wo of filteredWorkOrders) {
      for (const si of wo.scopeItems || []) {
        planned += si.plannedQty || 0;
        completed += si.completedQty || 0;
      }
    }
    return planned > 0 ? Math.round((completed / planned) * 100) : 0;
  }, [filteredWorkOrders]);

  const labourByProject = useMemo(() => {
    const byProject = new Map<string, { projectName: string; total: number }>();
    for (const r of reportsInPeriod) {
      const key = r.projectId || r.projectName || "—";
      if (!byProject.has(key)) byProject.set(key, { projectName: r.projectName || "—", total: 0 });
      byProject.get(key)!.total += Number(r.labourCount) || 0;
    }
    return [...byProject.values()].sort((a, b) => b.total - a.total);
  }, [reportsInPeriod]);

  const filteredDrawingReqs = useMemo(
    () => drawingReqs.filter(d => !filterProjectId || d.projectId === filterProjectId),
    [drawingReqs, filterProjectId]
  );
  const pendingDrawingReqs = useMemo(
    () => filteredDrawingReqs.filter(d => d.status !== "completed"),
    [filteredDrawingReqs]
  );

  // "Summary" tab keeps the full history (not locked to one date, so it
  // still works as a browsable log) but still respects the Project/DRI
  // filters, same as everything else on this page.
  const summaryReports = useMemo(() => reports.filter(r =>
    (!filterProjectId || r.projectId === filterProjectId) &&
    (!filterDriName || r.driName === filterDriName)
  ), [reports, filterProjectId, filterDriName]);
  const pager = usePagination(summaryReports, 10);

  return (
    <div>
      <PageHeader
        title="Daily Progress Report"
        subtitle="Track labour, work progress, and drawing requests across all your projects."
        icon={ClipboardList}
        actions={
          <>
            <DrawingRequestButton projectId={form.projectId} projectOptions={projectOptions} driName={form.driName} />
            <NxBtn color="primary" label="New Report" icon={Plus} onClick={openNew} />
          </>
        }
      />

      {/* ── Filters ── */}
      <NxCard className="mb-5">
        <div className="flex flex-wrap items-end gap-3.5">
          <div>
            <div className="text-[11px] text-gray-400 mb-1">Date Range</div>
            <DateRangeFilter onChange={(from, to) => { setFilterDateFrom(from); setFilterDateTo(to); }} />
          </div>
          <div className="w-[200px]">
            <div className="text-[11px] text-gray-400 mb-1">Project</div>
            <SField value={filterProjectId} onChange={setFilterProjectId} options={[{ value: "", label: "All Projects" }, ...projectOptions]} />
          </div>
          <div className="w-[200px]">
            <div className="text-[11px] text-gray-400 mb-1">DRI / Site Engineer</div>
            <SField
              value={filterDriName} onChange={setFilterDriName}
              options={[{ value: "", label: "All DRI" }, ...driUsers.map(d => ({ label: d.name, value: d.name }))]}
            />
          </div>
          <NxBtn color="primary" label="Generate Report" icon={Download} loading={generating} onClick={handleGenerateReport} />
        </div>
      </NxCard>

      {/* ── Flashcards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <NxStatCard icon={Users} label={`Total Labour (${periodText})`} value={totalLabourToday} />
        <NxStatCard icon={TrendingUp} label="Work Progress (Overall)" value={`${overallWorkProgressPct}%`} />
        <NxStatCard icon={PenTool} label="Pending Drawing Requests" value={pendingDrawingReqs.length} />
        <NxStatCard icon={Building2} label={`Active Projects (${periodText})`} value={activeProjectsToday} />
      </div>

      {/* ── Tabs ── */}
      <div className="mb-4">
        <Segmented
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: "progress", label: "Work Progress" },
            { value: "drawings", label: "Drawing Requests" },
            { value: "summary", label: "Summary" },
          ]}
        />
      </div>

      {activeTab === "progress" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <NxCard>
            <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9] mb-0.5">Work Progress (Site-wide)</div>
            <div className="text-xs text-gray-400 mb-3.5">{filterProjectId ? projects.find(p => p._id === filterProjectId)?.name : "All projects"} — planned vs. completed by work item</div>
            {workProgressRows.length === 0 ? (
              <EmptyState title="No scope items recorded yet" />
            ) : (
              <Table>
                <Thead>
                  <Tr><Th>Work Item</Th><Th className="text-right">Planned</Th><Th className="text-right">Completed</Th><Th>Progress</Th></Tr>
                </Thead>
                <Tbody>
                  {workProgressRows.map(r => {
                    const pct = r.planned > 0 ? Math.min(100, Math.round((r.completed / r.planned) * 100)) : 0;
                    return (
                      <Tr key={r.description}>
                        <Td><TdText>{r.description}</TdText></Td>
                        <Td className="text-right font-mono">{r.planned.toLocaleString("en-IN")} {r.unit}</Td>
                        <Td className="text-right font-mono">{r.completed.toLocaleString("en-IN")} {r.unit}</Td>
                        <Td>
                          <div className="flex items-center gap-2 min-w-[110px]">
                            <div className="w-16 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                              <div className={`h-full rounded-full ${pct >= 90 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-mono font-semibold">{pct}%</span>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            )}
          </NxCard>

          <NxCard>
            <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9] mb-0.5">Labour Count by Project</div>
            <div className="text-xs text-gray-400 mb-3.5">{periodText}{filterDriName ? ` · ${filterDriName}` : ""}</div>
            {labourByProject.length === 0 ? (
              <EmptyState title="No reports logged for this date" />
            ) : (
              <Table>
                <Thead>
                  <Tr><Th>Project</Th><Th className="text-right">Total Labour</Th><Th>% of Total</Th></Tr>
                </Thead>
                <Tbody>
                  {labourByProject.map(row => {
                    const pct = totalLabourToday > 0 ? Math.round((row.total / totalLabourToday) * 100) : 0;
                    return (
                      <Tr key={row.projectName}>
                        <Td><TdText>{row.projectName}</TdText></Td>
                        <Td className="text-right font-mono font-semibold">{row.total}</Td>
                        <Td>
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <div className="w-16 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-mono">{pct}%</span>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            )}
          </NxCard>
        </div>
      )}

      {activeTab === "drawings" && (
        <NxCard padded={false} className="mb-5 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/40 flex justify-between items-center">
            <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Drawing Request Status</div>
            <NxBadge color="blue">{filteredDrawingReqs.length} total</NxBadge>
          </div>
          {filteredDrawingReqs.length === 0 ? (
            <div className="py-12"><EmptyState title="No drawing requests for this project" /></div>
          ) : (
            <Table>
              <Thead>
                <Tr><Th>Ticket</Th><Th>Description</Th><Th>Project</Th><Th>Requested By</Th><Th>Current Stage</Th><Th>Requested On</Th><Th className="text-right">Days Since</Th></Tr>
              </Thead>
              <Tbody>
                {filteredDrawingReqs.slice(0, 15).map(d => (
                  <Tr key={d._id}>
                    <Td><span className="font-mono font-bold text-primary">{d.ticketNo}</span></Td>
                    <Td><TdText>{d.description}</TdText></Td>
                    <Td><TdText>{d.projectName}</TdText></Td>
                    <Td><TdText>{d.driName}</TdText></Td>
                    <Td><NxBadge color={toNxColor(REVIEW_STATUS_COLOR[d.reviewStatus])}>{REVIEW_STATUS_LABEL[d.reviewStatus]}</NxBadge></Td>
                    <Td><TdText>{dayjs(d.createdAt).format("DD MMM YYYY")}</TdText></Td>
                    <Td className="text-right font-mono">{dayjs().diff(dayjs(d.createdAt), "day")}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </NxCard>
      )}

      {activeTab === "summary" && (
        <Card padded={false} className="overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/40 font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">
            Recent Reports
          </div>
          {loading ? (
            <div className="p-4"><SkeletonTable rows={5} cols={7} /></div>
          ) : summaryReports.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No reports submitted yet</div>
          ) : (
            <>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Date</Th>
                    <Th>Project</Th>
                    <Th>Contractor</Th>
                    <Th>DRI</Th>
                    <Th>Shift</Th>
                    <Th className="text-right">Labourers</Th>
                    <Th>Categories</Th>
                    <Th></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {pager.pageItems.map(r => (
                    <Tr key={r._id}>
                      <Td><TdText>{dayjs(r.date).format("DD MMM YYYY")}</TdText></Td>
                      <Td><TdText>{r.projectName}</TdText></Td>
                      <Td><TdText>{r.vendorName}</TdText></Td>
                      <Td><TdText>{r.driName}</TdText></Td>
                      <Td><TdText>{r.shiftType}</TdText></Td>
                      <Td className="text-right"><TdText>{r.labourCount}</TdText></Td>
                      <Td><NxBadge color="blue">{r.workEntries.length} categor{r.workEntries.length === 1 ? "y" : "ies"}</NxBadge></Td>
                      <Td><NxBtn color="icon" title="View" icon={Eye} onClick={() => setViewReport(r)} /></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              {pager.totalPages > 1 && (
                <div className="px-5 py-3.5 border-t border-gray-100 dark:border-gray-700/40">
                  <Pagination page={pager.page} totalPages={pager.totalPages} onChange={pager.setPage} />
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {showForm && (
        <Modal
          title="New Daily Progress Report"
          subtitle="Fill in today's site details, then check off what work happened."
          icon={ClipboardList}
          extraWide
          onClose={() => setShowForm(false)}
          footer={<Btn label="Submit Report" color="primary" className="w-full" loading={submitting} onClick={onSubmit} />}
        >
          <Card className="mb-5">
            <SectionHeading>Report Details</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SField
                label="Project" required placeholder="Choose"
                value={form.projectId || null}
                onChange={v => setForm(f => ({ ...f, projectId: v }))}
                options={projectOptions}
              />
              <SField
                label="Contractor Name" required placeholder="Choose"
                value={form.vendorCode || null}
                onChange={v => setForm(f => ({ ...f, vendorCode: v }))}
                options={contractors.map(c => ({ label: c.companyName, value: c.vendorCode }))}
              />
              <SField
                label="DRI Name" required placeholder="Choose"
                value={form.driName || null}
                onChange={v => setForm(f => ({ ...f, driName: v }))}
                options={driUsers.map(d => ({ label: d.name, value: d.name }))}
              />
              <DatePicker
                label="Date" value={form.date}
                onChange={v => setForm(f => ({ ...f, date: v }))}
                max={dayjs().format("YYYY-MM-DD")}
              />
              <SField
                label="Shift Type" required placeholder="Choose"
                value={form.shiftType || null}
                onChange={v => setForm(f => ({ ...f, shiftType: v }))}
                options={[{ label: "Day", value: "Day" }, { label: "Night", value: "Night" }]}
              />
              <Field
                label="Number of Labourers" required type="number" min={0}
                placeholder="e.g. 12"
                value={form.labourCount}
                onChange={e => setForm(f => ({ ...f, labourCount: e.target.value === "" ? "" : Number(e.target.value) }))}
              />
            </div>
          </Card>

          <Card>
            <SectionHeading>Work Type — check what happened today</SectionHeading>
            <WorkCategoryChecklist entries={form.workEntries} onChange={setEntries} />
          </Card>
        </Modal>
      )}

      {viewReport && (
        <Modal title={`Report — ${viewReport.projectName}`} onClose={() => setViewReport(null)}>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-gray-800/40 p-3.5 rounded-lg text-sm">
              <div><span className="text-gray-400">Date: </span>{dayjs(viewReport.date).format("DD MMM YYYY")}</div>
              <div><span className="text-gray-400">DRI: </span>{viewReport.driName}</div>
              <div><span className="text-gray-400">Contractor: </span>{viewReport.vendorName}</div>
              <div><span className="text-gray-400">Shift: </span>{viewReport.shiftType}</div>
              <div><span className="text-gray-400">Labourers: </span>{viewReport.labourCount}</div>
            </div>
            {viewReport.workEntries.map(entry => (
              <div key={entry.workType} className="border border-gray-200 dark:border-gray-700/40 rounded-lg p-3">
                <div className="font-semibold text-sm text-[#1A1A2E] dark:text-[#F1F5F9] mb-2">{entry.workType}</div>
                <div className="flex flex-wrap gap-2">
                  {entry.images.map((img, i) => (
                    <a key={i} href={img.url} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0">
                      <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
                {(entry.beforeImages?.length > 0 || entry.afterImages?.length > 0) && (
                  <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/40">
                    <div>
                      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Before</div>
                      <div className="flex flex-wrap gap-2">
                        {entry.beforeImages.map((img, i) => (
                          <a key={i} href={img.url} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0">
                            <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                          </a>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">After</div>
                      <div className="flex flex-wrap gap-2">
                        {entry.afterImages.map((img, i) => (
                          <a key={i} href={img.url} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0">
                            <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
