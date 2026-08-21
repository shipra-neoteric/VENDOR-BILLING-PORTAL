import { useEffect, useMemo, useState } from "react";
import {
  Briefcase, FileText, PlayCircle, CheckCircle2, ChevronLeft, ChevronRight,
  Eye, Download, MoreVertical, Lock, CalendarRange, Plus,
} from "lucide-react";
import apiClient from "../../services/apiClient";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import { Skeleton } from "../../ui/Skeleton";
import MultiSelect from "../../ui/MultiSelect";
import NxCard from "../../ui/nexora/Card";
import NxBadge from "../../ui/nexora/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import NxBtn from "../../ui/nexora/Btn";
import { NxFilterRow, NxSearchFilter, NxSelectFilter } from "../../ui/nexora/Filters";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import { selectableProjects, getWorkOrderProjectId } from "../../utils/projectOptions";

interface PreviewProject {
  _id: string;
  name: string;
  parentId?: string | null;
}

interface PreviewWO {
  _id: string;
  workOrderNo: string;
  projectName: string;
  projectId?: string | { _id: string } | null;
  issueDate?: string;
  category?: string;
  vendorCode?: string;
  vendorName?: string;
  companyName?: string;
  contractValue?: number;
  status: string;
  approvalStatus?: string;
  isLocked?: boolean;
  createdAt?: string;
  createdBy?: { name?: string } | null;
}

function fmtDate(d?: string) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

// The 5 raw backend statuses collapse to the 3 you asked for. "issued" reads
// as still-in-progress operationally; "cancelled" is rare enough that it
// still needs to be visible when it happens, so it renders as its own
// fourth badge rather than being folded into (or hidden from) the other three.
function displayStatus(status: string): { label: string; color: NxBadgeColor } {
  if (status === "draft") return { label: "Draft", color: "gray" };
  if (status === "completed") return { label: "Completed", color: "green" };
  if (status === "cancelled") return { label: "Cancelled", color: "red" };
  return { label: "In Progress", color: "amber" }; // issued + in-progress
}

// "Step" is derived from the real 4-stage approval chain — matches the real
// Work Orders page's own APPROVAL_STATUS_CFG exactly: L1=draft (not yet
// submitted), L2=awaiting checker, L3=awaiting approver, L4=awaiting final
// approval. All four are real backend stages — none of them are forced to 0.
type StepKey = "l1" | "l2" | "l3" | "l4";
const STEP_LABEL: Record<StepKey, string> = { l1: "L1 Pending", l2: "L2 Pending", l3: "L3 Pending", l4: "L4 Pending" };
function stepFor(approvalStatus?: string): StepKey | null {
  if (approvalStatus === "draft") return "l1";
  if (approvalStatus === "pending-checker") return "l2";
  if (approvalStatus === "pending-approver") return "l3";
  if (approvalStatus === "pending-final") return "l4";
  return null;
}

const PAGE_SIZE = 10;

// A self-contained, read-only demo of the Nexora IMS style guide (dynamic
// theme color, stat cards, table, badges, filters) applied to real work
// order data — deliberately separate from the real Work Orders page and
// its ui/ components, so nothing else in the app changes until this look
// is approved and the real pages are switched over to it.
export default function NexoraPreview() {
  const [workOrders, setWorkOrders] = useState<PreviewWO[]>([]);
  const [projects, setProjects] = useState<PreviewProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stepFilter, setStepFilter] = useState<StepKey | "">("");
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    apiClient
      .get("/work-orders")
      .then((res) => setWorkOrders(res.data.workOrders ?? res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    apiClient
      .get("/projects")
      .then((res) => setProjects(res.data.projects ?? res.data ?? []))
      .catch(() => {});
  }, []);

  const projectOptions = useMemo(
    () => selectableProjects(projects).map((p) => ({ label: p.name, value: p._id })),
    [projects]
  );

  const counts = useMemo(() => {
    const c = { total: workOrders.length, draft: 0, inProgress: 0, completed: 0 };
    for (const wo of workOrders) {
      if (wo.status === "draft") c.draft++;
      else if (wo.status === "completed") c.completed++;
      else if (wo.status !== "cancelled") c.inProgress++;
    }
    return c;
  }, [workOrders]);

  const stepCounts = useMemo(() => {
    const c: Record<StepKey, number> = { l1: 0, l2: 0, l3: 0, l4: 0 };
    for (const wo of workOrders) {
      const s = stepFor(wo.approvalStatus);
      if (s) c[s]++;
    }
    return c;
  }, [workOrders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workOrders.filter((wo) => {
      const matchSearch = !q || wo.workOrderNo.toLowerCase().includes(q) || wo.projectName?.toLowerCase().includes(q);
      const matchStatus = !statusFilter || wo.status === statusFilter;
      const matchStep = !stepFilter || stepFor(wo.approvalStatus) === stepFilter;
      const matchProject = projectFilter.length === 0 || projectFilter.includes(getWorkOrderProjectId(wo.projectId) ?? "");
      return matchSearch && matchStatus && matchStep && matchProject;
    });
  }, [workOrders, search, statusFilter, stepFilter, projectFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const COL_COUNT = 11;

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Style Pilot — Not a real page
        </span>
      </div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Work Orders</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Read-only preview of the Nexora IMS style guide applied to real work order data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NxBtn color="secondary" icon={CalendarRange} label="Monthly Report" onClick={() => {}} />
          <NxBtn color="primary" icon={Plus} label="New Work Order" onClick={() => {}} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <NxStatCard label="Total Work Orders" value={counts.total} icon={Briefcase} />
        <NxStatCard
          label="Draft" value={counts.draft} icon={FileText}
          active={statusFilter === "draft"} onClick={() => { setStatusFilter(statusFilter === "draft" ? "" : "draft"); setPage(1); }}
        />
        <NxStatCard
          label="In Progress" value={counts.inProgress} icon={PlayCircle}
          active={statusFilter === "in-progress"} onClick={() => { setStatusFilter(statusFilter === "in-progress" ? "" : "in-progress"); setPage(1); }}
        />
        <NxStatCard
          label="Completed" value={counts.completed} icon={CheckCircle2}
          active={statusFilter === "completed"} onClick={() => { setStatusFilter(statusFilter === "completed" ? "" : "completed"); setPage(1); }}
        />
      </div>

      <NxCard className="mb-3">
        <NxFilterRow>
          <NxSearchFilter value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by WO No or project…" />
          <NxSelectFilter
            value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} placeholder="All Statuses"
            options={[
              { label: "Draft", value: "draft" }, { label: "In Progress", value: "in-progress" },
              { label: "Completed", value: "completed" }, { label: "Cancelled", value: "cancelled" },
            ]}
          />
          <div className="w-56">
            <MultiSelect
              values={projectFilter}
              onChange={(v) => { setProjectFilter(v); setPage(1); }}
              options={projectOptions}
              placeholder="All Projects"
            />
          </div>
        </NxFilterRow>
      </NxCard>

      {/* Step toggle row — clicking a pill filters the table, matching the
          reference screenshot's horizontal status-chip pattern. */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => { setStepFilter(""); setPage(1); }}
          className={
            stepFilter === ""
              ? "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold theme-text"
              : "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-500! dark:text-gray-400!"
          }
          style={stepFilter === "" ? { backgroundColor: "var(--theme-primary-tint)" } : undefined}
        >
          All Steps <span className="ml-1 opacity-75">{workOrders.length}</span>
        </button>
        {(Object.keys(STEP_LABEL) as StepKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => { setStepFilter(stepFilter === k ? "" : k); setPage(1); }}
            className={
              stepFilter === k
                ? "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold theme-text"
                : "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-500! dark:text-gray-400!"
            }
            style={stepFilter === k ? { backgroundColor: "var(--theme-primary-tint)" } : undefined}
          >
            {STEP_LABEL[k]} <span className="ml-1 opacity-75">{stepCounts[k]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>WO No</Th>
              <Th>Date</Th>
              <Th>Project</Th>
              <Th>Category</Th>
              <Th>Vendor Code</Th>
              <Th>Company Name</Th>
              <Th>Contract Value</Th>
              <Th>Status</Th>
              <Th>Step</Th>
              <Th>Created</Th>
              <Th>Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {pageRows.length === 0 && (
              <Tr><Td colSpan={COL_COUNT}><div className="text-center text-gray-400 py-8">No work orders match these filters</div></Td></Tr>
            )}
            {pageRows.map((wo) => {
              const st = displayStatus(wo.status);
              const step = stepFor(wo.approvalStatus);
              return (
                <Tr key={wo._id} className="cursor-pointer">
                  <Td><TdText>{wo.workOrderNo}</TdText></Td>
                  <Td><TdText>{fmtDate(wo.issueDate)}</TdText></Td>
                  <Td><TdText>{wo.projectName}</TdText></Td>
                  <Td><TdText>{wo.category || "—"}</TdText></Td>
                  <Td><TdText>{wo.vendorCode || "—"}</TdText></Td>
                  <Td><TdText>{wo.vendorName || "—"}</TdText></Td>
                  <Td className="text-right font-bold">₹{(wo.contractValue ?? 0).toLocaleString("en-IN")}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <NxBadge color={st.color}>{st.label}</NxBadge>
                      {wo.isLocked && (
                        <span title="Locked"><Lock className="w-3.5 h-3.5 text-gray-400" /></span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    {step ? (
                      <NxBadge color="orange">{STEP_LABEL[step]}</NxBadge>
                    ) : wo.approvalStatus === "sent-back" ? (
                      <NxBadge color="red">Sent Back</NxBadge>
                    ) : (
                      <NxBadge color="green">Approved</NxBadge>
                    )}
                  </Td>
                  <Td>
                    <div className="text-sm text-gray-800 dark:text-gray-200">{fmtDate(wo.createdAt)}</div>
                    <div className="text-xs text-gray-400">by {wo.createdBy?.name || "—"}</div>
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <NxBtn color="icon" icon={Eye} onClick={() => {}} />
                      <NxBtn color="icon" icon={Download} onClick={() => {}} />
                      <NxBtn color="icon" icon={MoreVertical} onClick={() => {}} />
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 px-3 sm:px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg mt-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 border rounded disabled:opacity-40 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Prev</span>
          </button>
          {Array.from({ length: totalPages }).slice(0, 5).map((_, i) => (
            <button
              key={i} type="button" onClick={() => setPage(i + 1)}
              className={`px-2.5 sm:px-3 py-1.5 min-w-[32px] border rounded ${
                page === i + 1 ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button
            type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 border rounded disabled:opacity-40 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
          >
            <span className="hidden sm:inline">Next</span> <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
