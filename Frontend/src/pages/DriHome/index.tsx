import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { LayoutDashboard, ClipboardList, AlertTriangle } from "lucide-react";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import { KpiCard, KpiRow, Donut, Funnel, Panel, Grid2 } from "../../features/dashboard/components/MiniCharts";
import DrawingRequestButton from "../../components/DrawingRequestButton";
import SField from "../../ui/SField";
import { DatePicker } from "../../ui/DatePicker";
import Btn from "../../ui/Btn";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import Spinner from "../../ui/Spinner";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import {
  REVIEW_STATUS_LABEL,
} from "../../shared/constants/drawingRequestOptions";
import type { DrawingReviewStatus } from "../../shared/constants/drawingRequestOptions";

// NxBadge has no literal "purple" swatch — L3 (GM cross-check) maps to the
// closest available hue (indigo) instead of the old REVIEW_STATUS_COLOR value,
// which is otherwise identical to it stage-for-stage.
const REVIEW_BADGE_COLOR: Record<DrawingReviewStatus, NxBadgeColor> = {
  "l1-gm": "amber", "l2-architect": "blue", "l3-gm": "indigo", "l4-gm": "teal", approved: "green", returned: "red",
};

interface ProjectRow {
  projectId: string;
  projectName: string;
  workOrders: number;
  pendingItems: number;
  todayReports: number;
  overallProgressPct: number;
}

interface RecentDrawingRequest {
  _id: string;
  ticketNo: string;
  projectName: string;
  description: string;
  createdAt: string;
  reviewStatus: DrawingReviewStatus;
}

interface ReturnedDrawingRequest {
  _id: string;
  ticketNo: string;
  projectName: string;
  description: string;
}

interface DriHomeData {
  selectedDate: string;
  summary: {
    projectsAssigned: number;
    workOrders: number;
    todayReports: number;
    drawingRequests: number;
    needsAttention: number;
  };
  projects: ProjectRow[];
  workTypeCounts: Record<string, number>;
  drawingRequests: {
    total: number;
    counts: Record<DrawingReviewStatus, number>;
    recent: RecentDrawingRequest[];
    returned: ReturnedDrawingRequest[];
  };
}

const DONUT_COLORS = ["#f37916", "#2563eb", "#7c3aed", "#16a34a", "#d97706", "#dc2626", "#0891b2", "#9333ea"];

export default function DriHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DriHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const today = dayjs().format("YYYY-MM-DD");
  const [selectedDate, setSelectedDate] = useState(today);
  const isToday = selectedDate === today;

  useEffect(() => {
    setLoading(true);
    apiClient.get("/dri-home", { params: { date: selectedDate } })
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedDate]);

  const projectOptions = useMemo(
    () => (data?.projects ?? []).map(p => ({ label: p.projectName, value: p.projectId })),
    [data]
  );

  const visibleProjects = useMemo(() => {
    if (!data) return [];
    return projectFilter ? data.projects.filter(p => p.projectId === projectFilter) : data.projects;
  }, [data, projectFilter]);

  const donutSegments = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.workTypeCounts).map(([label, value], i) => ({
      label, value, color: DONUT_COLORS[i % DONUT_COLORS.length],
    }));
  }, [data]);

  const funnelStages = useMemo(() => {
    if (!data) return [];
    const c = data.drawingRequests.counts;
    return [
      { label: "Total Requested", count: data.drawingRequests.total },
      { label: "GM Screening (L1)", count: c["l1-gm"] ?? 0 },
      { label: "Architect Drawing (L2)", count: c["l2-architect"] ?? 0 },
      { label: "GM Cross-Check (L3)", count: c["l3-gm"] ?? 0 },
      { label: "GM Final Approval (L4)", count: c["l4-gm"] ?? 0 },
      { label: "Approved", count: c.approved ?? 0 },
      { label: "Returned", count: c.returned ?? 0 },
    ];
  }, [data]);

  const dayLabel = dayjs(selectedDate).format("DD MMM YYYY");

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-[22px] font-extrabold text-[#1A1A2E] dark:text-[#F1F5F9]">
            <LayoutDashboard className="w-5 h-5 text-primary" /> Welcome back, {user?.name} 👋
          </div>
          <div className="text-sm text-gray-400 mt-1">
            {isToday ? `Here's what's happening on your projects today — ${dayLabel}.` : `Here's what's happening on your projects on ${dayLabel}.`}
          </div>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <div style={{ width: 170 }}>
            <DatePicker value={selectedDate} onChange={setSelectedDate} max={today} />
          </div>
          <div style={{ width: 220 }}>
            <SField placeholder="All Projects" value={projectFilter} onChange={setProjectFilter} options={projectOptions} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Spinner /></div>
      ) : !data ? (
        <div className="text-center py-14 text-gray-400">Couldn't load your dashboard — try refreshing.</div>
      ) : (
      <>
      <KpiRow>
        <KpiCard icon="🏗️" label="Projects Assigned" value={data.summary.projectsAssigned} color="var(--theme-primary)" />
        <KpiCard icon="📋" label="Work Orders" value={data.summary.workOrders} color="#2563eb" />
        <KpiCard icon="📅" label={isToday ? "Today's Progress Reports" : `Progress Reports (${dayLabel})`} value={data.summary.todayReports} color="#16a34a" />
        <KpiCard icon="✏️" label="Drawing Requests" value={data.summary.drawingRequests} color="#7c3aed" />
        <KpiCard icon="⚠️" label="Pending Approvals" value={data.summary.needsAttention} color={data.summary.needsAttention > 0 ? "#dc2626" : "#16a34a"} />
      </KpiRow>

      <Grid2>
        <Panel title="Project Progress Overview" sub={`${visibleProjects.length} project${visibleProjects.length === 1 ? "" : "s"}`}>
          {visibleProjects.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No projects assigned yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Project</Th>
                    <Th>Overall Progress</Th>
                    <Th>{isToday ? "Today's" : dayLabel} Progress</Th>
                    <Th>Work Orders</Th>
                    <Th>Pending Items</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {visibleProjects.map(p => (
                    <Tr key={p.projectId}>
                      <Td><span className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{p.projectName}</span></Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, p.overallProgressPct)}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-gray-500">{p.overallProgressPct}%</span>
                        </div>
                      </Td>
                      <Td><TdText>{p.todayReports} Report{p.todayReports === 1 ? "" : "s"}</TdText></Td>
                      <Td><TdText>{p.workOrders}</TdText></Td>
                      <Td>{p.pendingItems > 0 ? <NxBadge color="amber">{p.pendingItems}</NxBadge> : <span className="text-gray-300 dark:text-gray-600">0</span>}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          )}
        </Panel>

        <Panel title={isToday ? "Today's Progress by Work Type" : `Progress by Work Type — ${dayLabel}`} sub={isToday ? "Categories checked off in today's reports" : `Categories checked off in reports filed on ${dayLabel}`}>
          {donutSegments.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No progress reports filed {isToday ? "today" : `on ${dayLabel}`} yet.</div>
          ) : (
            <Donut segments={donutSegments} />
          )}
        </Panel>
      </Grid2>

      <Grid2>
        <Panel title="Drawing Request Status Overview" sub="Your own requests, across their AGM → GM review chain">
          <div className="mb-4 overflow-x-auto">
            <Funnel stages={funnelStages} colorFor={(i) => ["#374151", "#d97706", "#7c3aed", "#16a34a", "#dc2626"][i] || "#374151"} />
          </div>
          {data.drawingRequests.recent.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">No drawing requests raised yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Ticket</Th>
                    <Th>Project</Th>
                    <Th>Description</Th>
                    <Th>Requested On</Th>
                    <Th>Review Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {data.drawingRequests.recent.map(r => (
                    <Tr key={r._id}>
                      <Td><span className="font-bold text-purple-600 dark:text-purple-400">{r.ticketNo}</span></Td>
                      <Td><TdText>{r.projectName}</TdText></Td>
                      <Td><span className="max-w-[160px] truncate block" title={r.description}>{r.description}</span></Td>
                      <Td><TdText>{dayjs(r.createdAt).format("DD MMM YYYY")}</TdText></Td>
                      <Td><NxBadge color={REVIEW_BADGE_COLOR[r.reviewStatus]}>{REVIEW_STATUS_LABEL[r.reviewStatus]}</NxBadge></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          )}
          <div className="mt-3 text-right">
            <Btn label="View All Drawing Requests" outline small onClick={() => navigate("/drawing-requests")} />
          </div>
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel title="Pending Approvals (You)" sub="Returned requests awaiting your revision">
            {data.drawingRequests.returned.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">Nothing needs your attention right now.</div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {data.drawingRequests.returned.map(r => (
                  <button
                    key={r._id}
                    onClick={() => navigate("/drawing-requests")}
                    className="w-full flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/5 px-3.5 py-2.5 text-left hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{r.ticketNo} — {r.projectName}</div>
                      <div className="text-xs text-gray-400 truncate">{r.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Quick Actions">
            <div className="flex flex-col gap-2.5">
              <NxBtn label="New Daily Progress Report" icon={ClipboardList} color="primary" className="w-full" onClick={() => navigate("/daily-progress-report")} />
              <DrawingRequestButton projectOptions={projectOptions} driName={user?.name} />
            </div>
          </Panel>
        </div>
      </Grid2>
      </>
      )}
    </div>
  );
}
