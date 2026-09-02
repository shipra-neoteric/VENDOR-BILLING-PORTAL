import { Fragment, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FileText, Users, Building2, AlertTriangle, Pin, ChevronDown, ChevronRight, TrendingUp,
} from "lucide-react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import { DropdownSelectFilter } from "../../ui/Filters";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";
import WorkflowInstanceStepper from "../../components/WorkflowInstanceStepper";
import type { WorkflowInstance } from "../../types/Workflow";
import UIBadge from "../../ui/Badge";
import Btn from "../../ui/Btn";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import Spinner from "../../ui/Spinner";
import PageHeader from "../../ui/PageHeader";
import Modal from "../../ui/Modal";
import Field from "../../ui/Field";
import Checkbox from "../../ui/Checkbox";
import { Descriptions, DescItem } from "../../ui/Descriptions";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import NxBadge from "../../ui/nexora/Badge";
import NxBtn from "../../ui/nexora/Btn";
import NxStatCard from "../../ui/nexora/StatCard";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProgressEntryDetail {
  _id: string; date: string; qtyAdded: number; remarks?: string;
  tower?: string; floor?: string; flatNo?: string; plotNo?: string; locationNote?: string;
  enteredBy?: { _id: string; name: string } | string | null;
  invalidated?: { done?: boolean; reason?: string; at?: string };
}
interface SubItemDetail {
  _id: string; description: string; remarks?: string; unit: string;
  plannedQty: number; completedQty: number; lastBilledQty: number;
  status?: string; varianceApproved?: boolean;
  progressEntries?: ProgressEntryDetail[];
}
interface ScopeItemDetail {
  _id: string; description: string; remarks?: string; unit: string;
  plannedQty: number; completedQty: number; lastBilledQty: number;
  status?: string; varianceApproved?: boolean;
  subItems?: SubItemDetail[];
  progressEntries?: ProgressEntryDetail[];
}
interface WORow {
  _id: string; workOrderNo: string; projectName: string;
  projectId?: string | { _id: string; name: string };
  vendorName?: string; vendorCode?: string; category?: string; status: string;
  assignedDRI?: { _id: string; name: string }[];
}
interface WODetail extends WORow {
  contractValue?: number;
  scopeItems: ScopeItemDetail[];
}
interface ProjectOption { _id: string; name: string; code?: string; parentId?: string | null; }
interface DriOption { _id: string; name: string; email: string; }
interface ActivityEvent {
  _id: string; type: string; workOrderId?: string; workOrderNo?: string; vendorName?: string;
  projectId?: { _id: string; name: string } | string;
  performedByName?: string; performedBy?: string; remarks?: string;
  metadata?: { scopeItem?: string; qtyAdded?: number; unit?: string; plannedQty?: number; completedQty?: number };
  createdAt: string;
}
interface BillItem {
  scopeItemId?: string; description: string; unit: string; billedQty: number;
  rate?: number; amount?: number; progressRemarks?: string;
}
interface ApprovalHistoryEntry {
  stage: "agm" | "gm"; action: "approved" | "rejected";
  by?: { _id: string; name: string } | string | null;
  at?: string; remarks?: string;
}
interface BillRequestRow {
  _id: string; reqNo: string; stageNo?: number;
  workOrderId?: string; workOrderNo: string;
  projectId?: string; projectName: string; projectLocation?: string;
  vendorCode?: string; vendorName: string; companyName?: string; category?: string; subCategory?: string;
  items: BillItem[]; remarks?: string;
  periodFrom?: string; periodTo?: string;
  status: "pending" | "pending-gm" | "approved" | "rejected";
  requestedBy?: { name: string; email: string };
  agmApprovedBy?: { name: string } | string | null;
  agmApprovedAt?: string;
  retentionAmount?: number;
  advanceRecovery?: number;
  gstPercentOverride?: number | null;
  payeeVendorCode?: string;
  payeeVendorName?: string;
  rejectReason?: string;
  approvalHistory?: ApprovalHistoryEntry[];
  billId?: { _id: string; billNo: string; status: string; amount: number; paidAmount?: number; retentionPercent?: number; retentionAmount?: number; advanceRecovery?: number; gstPercent?: number; tdsAmount?: number; paymentDate?: string; paymentMode?: string; paymentUTR?: string; paymentBank?: string; paymentReleasedBy?: string };
  milestoneAchieved?: boolean;
  milestoneDate?: string;
  createdAt: string;
  isArchived?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Per-unit rates are fractional far more often than totals are — rounding
// them for display (as fmt() does) silently turns 130.5 into 131.
const fmtN = (n: number) => (n ?? 0).toLocaleString("en-IN");
const pctOf = (c: number, p: number) => p > 0 ? Math.min(100, Math.round((c / p) * 100)) : 0;

const STATUS_CFG: Record<string, { color: string; label: string }> = {
  pending: { color: "orange", label: "Pending L1 (AGM)" },
  "pending-gm": { color: "blue", label: "Pending L2 (GM)" },
  approved: { color: "green", label: "Approved" },
  rejected: { color: "red", label: "Rejected" },
};

type VarianceLevel = "none" | "yellow" | "red";
function varianceLevel(plannedQty: number, completedQty: number): VarianceLevel {
  if (!(plannedQty > 0) || completedQty <= plannedQty) return "none";
  const overPct = ((completedQty - plannedQty) / plannedQty) * 100;
  return overPct <= 10 ? "yellow" : "red";
}
function itemHasUnapprovedVariance(si: ScopeItemDetail): boolean {
  if (si.subItems && si.subItems.length > 0) {
    return si.subItems.some(sub => varianceLevel(sub.plannedQty, sub.completedQty) !== "none" && !sub.varianceApproved);
  }
  return varianceLevel(si.plannedQty, si.completedQty) !== "none" && !si.varianceApproved;
}

function VarianceTag({ level }: { level: VarianceLevel }) {
  if (level === "none") return null;
  return (
    <NxBadge color={level === "yellow" ? "amber" : "red"}>
      <span className="inline-flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> Over plan {level === "yellow" ? "≤10%" : ">10%"}</span>
    </NxBadge>
  );
}

function getProjId(row: WORow): string | undefined {
  if (!row.projectId) return undefined;
  return typeof row.projectId === "string" ? row.projectId : row.projectId._id;
}

// Compact, read-only log of every raw dated progress entry behind a scope
// item — the aggregated planned/done/unbilled row above can't show this;
// the data already exists on the WorkOrder document, this just surfaces it.
function ProgressEntryLog({ entries }: { entries?: ProgressEntryDetail[] }) {
  if (!entries || entries.length === 0) {
    return <div className="px-2.5 py-2 text-xs text-gray-400">No individual entries recorded.</div>;
  }
  const sorted = [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="bg-gray-100 dark:bg-gray-800/40">
          {["Date", "Qty Added", "Location", "Remarks", ""].map(h => (
            <th key={h} className="px-2 py-1 text-left text-[10px] text-gray-500 dark:text-gray-400 uppercase">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(e => {
          const loc = [e.tower && `Tower ${e.tower}`, e.floor && `Floor ${e.floor}`, e.flatNo && `Flat ${e.flatNo}`, e.plotNo && `Plot ${e.plotNo}`, e.locationNote].filter(Boolean).join(" · ");
          return (
            <tr
              key={e._id}
              className="border-b border-gray-200 dark:border-gray-700/40"
              style={{ textDecoration: e.invalidated?.done ? "line-through" : undefined, opacity: e.invalidated?.done ? 0.55 : 1 }}
            >
              <td className="px-2 py-1">{dayjs(e.date).format("DD MMM YYYY")}</td>
              <td className="px-2 py-1 font-mono text-emerald-600 font-semibold">+{fmtN(e.qtyAdded)}</td>
              <td className="px-2 py-1 text-gray-500 dark:text-gray-400">{loc || "—"}</td>
              <td className="px-2 py-1 text-gray-500 dark:text-gray-400">{e.remarks || "—"}</td>
              <td className="px-2 py-1">
                {e.invalidated?.done && <UIBadge color="red" small>Invalidated{e.invalidated.reason ? `: ${e.invalidated.reason}` : ""}</UIBadge>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SiteProgress() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [allWOs, setAllWOs] = useState<WORow[]>([]);
  const [billReqs, setBillReqs] = useState<BillRequestRow[]>([]);
  const [driList, setDriList] = useState<DriOption[]>([]);
  const [kpis, setKpis] = useState({ progressEntriesToday: 0, drisActiveToday: 0, projectsActiveToday: 0 });

  const [selProjectId, setSelProjectId] = useState<string | undefined>(undefined);
  const [selDriId, setSelDriId] = useState<string | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [woDetails, setWoDetails] = useState<Map<string, WODetail>>(new Map());
  const [detailLoading, setDetailLoading] = useState(false);

  // Note: reviewing/approving bill requests (AGM/GM chain) and manual bills
  // now lives on its own page — see Bill Approval (pages/BillRequests). This
  // page still fetches bill-requests itself (below) since it needs it for
  // the "Bill <reqNo> — <status>" badge on a work order's own card, and to
  // stop a second bill request being raised against a WO that already has
  // one pending.
  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get("/projects/activity", { params: { limit: 100 } }),
      apiClient.get("/projects"),
      apiClient.get("/work-orders"),
      apiClient.get("/bill-requests"),
      apiClient.get("/auth/users?role=site-dri"),
      apiClient.get("/dpr"),
    ])
      .then(([actR, projR, woR, brR, driR, dprR]) => {
        setActivity(actR.data.events ?? []);
        setProjects(projR.data.projects ?? []);
        setAllWOs(woR.data.workOrders ?? []);
        setBillReqs(brR.data.billRequests ?? []);
        setDriList(driR.data.users ?? []);
        const k = dprR.data?.operational?.kpis || {};
        setKpis({
          progressEntriesToday: k.progressEntriesToday || 0,
          drisActiveToday: k.drisActiveToday || 0,
          projectsActiveToday: k.projectsActiveToday || 0,
        });
      })
      .catch(() => toast.error("Failed to load Site Progress data"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const projectWOs = useMemo(
    () => selProjectId ? allWOs.filter(wo => getProjId(wo) === selProjectId) : [],
    [allWOs, selProjectId]
  );

  useEffect(() => {
    if (!projectWOs.length) { setWoDetails(new Map()); return; }
    setDetailLoading(true);
    Promise.all(projectWOs.map(wo => apiClient.get(`/work-orders/${wo._id}`)))
      .then(results => {
        const map = new Map<string, WODetail>();
        results.forEach(r => { const d = r.data.workOrder; if (d) map.set(d._id, d); });
        setWoDetails(map);
      })
      .catch(() => { })
      .finally(() => setDetailLoading(false));
  }, [projectWOs]);

  const reloadWODetail = async (woId: string) => {
    const r = await apiClient.get(`/work-orders/${woId}`);
    setWoDetails(prev => new Map(prev).set(woId, r.data.workOrder));
  };

  // ── Work order detail + bill-generation modal ───────────────────────────────
  const [viewWOId, setViewWOId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [slaInstance, setSlaInstance] = useState<WorkflowInstance | null>(null);
  const [billRemarks, setBillRemarks] = useState("");
  const [generating, setGenerating] = useState(false);
  const [approvingVariance, setApprovingVariance] = useState<string | null>(null);

  const viewWO = viewWOId ? woDetails.get(viewWOId) ?? null : null;

  const openWO = async (woId: string, projectIdHint?: string) => {
    if (projectIdHint && projectIdHint !== selProjectId) setSelProjectId(projectIdHint);
    setViewWOId(woId);
    setChecked(new Set());
    setExpandedEntries(new Set());
    setBillRemarks("");
    if (!woDetails.has(woId)) {
      try {
        const r = await apiClient.get(`/work-orders/${woId}`);
        setWoDetails(prev => new Map(prev).set(woId, r.data.workOrder));
      } catch { /* modal will just show a spinner state */ }
    }
  };

  useEffect(() => {
    if (!viewWOId) { setSlaInstance(null); return; }
    apiClient.get("/workflows/instances", { params: { entityType: "WorkOrder", entityId: viewWOId } })
      .then(res => setSlaInstance(res.data.instances?.[0] ?? null))
      .catch(() => setSlaInstance(null));
  }, [viewWOId]);

  const toggleCheck = (itemId: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };
  const toggleEntries = (itemId: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  };

  const handleApproveVariance = async (item: ScopeItemDetail, subItem?: SubItemDetail) => {
    if (!viewWO) return;
    const key = subItem ? subItem._id : item._id;
    setApprovingVariance(key);
    try {
      const path = subItem
        ? `/work-orders/${viewWO._id}/scope-items/${item._id}/sub-items/${subItem._id}/approve-variance`
        : `/work-orders/${viewWO._id}/scope-items/${item._id}/approve-variance`;
      await apiClient.patch(path);
      toast.success("Variance approved");
      await reloadWODetail(viewWO._id);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to approve variance");
    } finally {
      setApprovingVariance(null);
    }
  };

  const handleGenerateBill = async () => {
    if (!viewWO || checked.size === 0) return;
    setGenerating(true);
    try {
      const res = await apiClient.post("/bill-requests", {
        workOrderId: viewWO._id,
        scopeItemIds: Array.from(checked),
        remarks: billRemarks,
      });
      toast.success(res.data?.message || "Bill request submitted");
      setViewWOId(null);
      setChecked(new Set());
      setBillRemarks("");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to generate bill request");
    } finally {
      setGenerating(false);
    }
  };

  const pendingBRForWO = (woId: string) => billReqs.find(br => br.workOrderId === woId && ["pending", "pending-gm"].includes(br.status));
  // ── Activity feed row click → jump straight to that work order ─────────────
  const openFromActivity = (ev: ActivityEvent) => {
    if (!ev.workOrderId) return;
    const projId = typeof ev.projectId === "object" ? ev.projectId?._id : ev.projectId;
    openWO(ev.workOrderId, projId);
  };

  const filteredActivity = useMemo(() => activity.filter(ev => {
    const evProjId = typeof ev.projectId === "object" ? ev.projectId?._id : ev.projectId;
    if (selProjectId && evProjId !== selProjectId) return false;
    if (selDriId) {
      const dri = driList.find(d => d._id === selDriId);
      if (!dri || ev.performedByName !== dri.name) return false;
    }
    if (!inDateRange(ev.createdAt, dateFrom, dateTo)) return false;
    return true;
  }), [activity, selProjectId, selDriId, driList, dateFrom, dateTo]);

  const activityPager = usePagination(filteredActivity, 8);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size="large" /></div>;
  }

  return (
    <div>
      <PageHeader
        icon={TrendingUp}
        title="Site Progress"
        subtitle="See what DRI has been logging, and raise bill requests for AGM/GM to approve on the Bill Approval page."
      />

      {/* ── KPI flashcards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-5">
        <NxStatCard label="Today's Progress Entries" value={kpis.progressEntriesToday} icon={FileText} />
        <NxStatCard label="Active DRIs Today" value={kpis.drisActiveToday} icon={Users} />
        <NxStatCard label="Active Projects Today" value={kpis.projectsActiveToday} icon={Building2} />
      </div>

      <>
          {/* ── Filters ── */}
          <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
            <div className="flex gap-2.5 flex-wrap items-center">
              <DropdownSelectFilter
                value={selProjectId ?? ""} onChange={v => setSelProjectId(v || undefined)}
                placeholder="All projects" resetValue=""
                options={projects.map(p => ({ label: p.name, value: p._id }))}
              />
              <DropdownSelectFilter
                value={selDriId ?? ""} onChange={v => setSelDriId(v || undefined)}
                placeholder="All DRIs" resetValue=""
                options={driList.map(d => ({ label: `${d.name} (${d.email})`, value: d._id }))}
              />
              <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
            </div>
          </div>

          {/* ── Recent DRI Progress ── */}
          <div className="mb-7">
            <div className="font-bold text-[15px] mb-2.5 text-[#1A1A2E] dark:text-[#F1F5F9]">Recent DRI Progress</div>
            {filteredActivity.length === 0 ? (
              <EmptyState title="No progress logged for these filters" />
            ) : (
              <>
                <Table className="min-w-[900px]">
                  <Thead>
                    <Tr>
                      <Th className="w-[14%]">When</Th>
                      <Th className="w-[24%]">Project / Work Order</Th>
                      <Th className="w-[16%]">DRI</Th>
                      <Th className="w-[22%]">Progress</Th>
                      <Th className="w-[24%]">Remarks</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {activityPager.pageItems.map(ev => {
                      const m = ev.metadata || {};
                      const level = m.plannedQty != null && m.completedQty != null ? varianceLevel(m.plannedQty, m.completedQty) : "none";
                      return (
                        <Tr key={ev._id}>
                          <Td className="whitespace-nowrap">{dayjs(ev.createdAt).format("DD MMM, hh:mm a")}</Td>
                          <Td className="whitespace-nowrap truncate">
                            <div className="font-semibold truncate">{typeof ev.projectId === "object" ? ev.projectId?.name : "—"}</div>
                            <button type="button" onClick={() => openFromActivity(ev)} className="text-primary text-xs hover:underline">
                              {ev.workOrderNo}
                            </button>
                          </Td>
                          <Td className="whitespace-nowrap truncate">{ev.performedByName || "—"}</Td>
                          <Td>
                            <div className="text-[13px]">{m.scopeItem} <span className="font-mono text-emerald-600 font-bold">+{fmtN(m.qtyAdded || 0)} {m.unit}</span></div>
                            {level !== "none" && <VarianceTag level={level} />}
                          </Td>
                          <Td>
                            {ev.remarks
                              ? <span className="text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1"><Pin className="w-3 h-3" /> {ev.remarks}</span>
                              : <span className="text-gray-300 dark:text-gray-600">—</span>}
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
                {activityPager.totalPages > 1 && (
                  <div className="mt-3"><Pagination page={activityPager.page} totalPages={activityPager.totalPages} onChange={activityPager.setPage} /></div>
                )}
              </>
            )}
          </div>

          {/* ── Project → Work Order drill-down ── */}
          <div>
            <div className="font-bold text-[15px] mb-3 text-[#1A1A2E] dark:text-[#F1F5F9]">Work Orders</div>
            {!selProjectId ? (
              <EmptyState title="Pick a project above to see its work orders and progress" />
            ) : detailLoading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : projectWOs.length === 0 ? (
              <EmptyState title="No work orders in this project" />
            ) : (
              <div className="flex flex-col gap-2">
                {projectWOs.map(wo => {
                  const detail = woDetails.get(wo._id);
                  const avgPct = detail && detail.scopeItems.length > 0
                    ? Math.round(detail.scopeItems.reduce((s, si) => s + pctOf(si.completedQty, si.plannedQty), 0) / detail.scopeItems.length)
                    : 0;
                  const anyVariance = detail?.scopeItems.some(si => itemHasUnapprovedVariance(si));
                  const pendingBR = pendingBRForWO(wo._id);
                  return (
                    <Card key={wo._id} className="flex justify-between items-center flex-wrap gap-2.5">
                      <div>
                        <div className="flex gap-2 items-center flex-wrap">
                          <span className="font-bold text-primary">{wo.workOrderNo}</span>
                          {wo.category && <NxBadge color="gray">{wo.category}</NxBadge>}
                          {anyVariance && (
                            <NxBadge color="red"><span className="inline-flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> Unapproved variance</span></NxBadge>
                          )}
                          {pendingBR && <NxBadge color={pendingBR.status === "pending-gm" ? "blue" : "orange"}>Bill {pendingBR.reqNo} — {STATUS_CFG[pendingBR.status]?.label}</NxBadge>}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {wo.vendorName} · {(wo.assignedDRI ?? []).map(d => d.name).join(", ") || "No DRI assigned"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-[70px] h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                            <div className={`h-full ${avgPct >= 100 ? "bg-emerald-600" : "bg-primary"}`} style={{ width: `${avgPct}%` }} />
                          </div>
                          <span className="text-xs font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">{avgPct}%</span>
                        </div>
                        <NxBtn color="primary" label="View & Bill" onClick={() => openWO(wo._id)} />
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
      </>

      {/* ── Work order detail + bill-generation modal ── */}
      {viewWOId && (
        <Modal
          icon={FileText}
          title={`Work Order — ${viewWO?.workOrderNo ?? ""}`}
          extraWide
          onClose={() => { setViewWOId(null); setChecked(new Set()); }}
          footer={
            <div className="flex justify-between items-center w-full">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {checked.size > 0 ? `${checked.size} item${checked.size !== 1 ? "s" : ""} selected` : "Select items below to bill"}
              </span>
              <div className="flex gap-2">
                <Btn outline label="Close" onClick={() => setViewWOId(null)} />
                <Btn color="primary" label="Generate Bill Request" disabled={checked.size === 0} loading={generating} onClick={handleGenerateBill} />
              </div>
            </div>
          }
        >
          {!viewWO ? (
            <Spinner size="large" />
          ) : (
            <div className="flex flex-col gap-3.5">
              <Descriptions columns={2}>
                <DescItem label="Project">{viewWO.projectName}</DescItem>
                <DescItem label="Contractor">{`${viewWO.vendorName ?? ""} (${viewWO.vendorCode ?? ""})`}</DescItem>
                <DescItem label="Category">{viewWO.category || "—"}</DescItem>
                <DescItem label="Contract Value">{viewWO.contractValue ? fmt(viewWO.contractValue) : "—"}</DescItem>
                <DescItem label="Assigned DRI">{(viewWO.assignedDRI ?? []).map(d => d.name).join(", ") || "—"}</DescItem>
                <DescItem label="Status">{viewWO.status}</DescItem>
              </Descriptions>

              {slaInstance && (
                <div>
                  <div className="text-[11px] text-gray-400 mb-0.5">
                    Work order sign-off chain (informational — not related to progress variance below)
                  </div>
                  <WorkflowInstanceStepper
                    instance={slaInstance}
                    userRole={user?.role}
                    userId={user?.id}
                    onChanged={() => {
                      apiClient.get("/workflows/instances", { params: { entityType: "WorkOrder", entityId: viewWO._id } })
                        .then(res => setSlaInstance(res.data.instances?.[0] ?? null))
                        .catch(() => { });
                    }}
                    compact
                  />
                </div>
              )}

              <div>
                <div className="font-bold text-xs text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">
                  Scope Items — select which ones to bill this cycle
                </div>
                <Table>
                  <Thead>
                    <Tr>
                      <Th></Th>
                      <Th>Description</Th>
                      <Th>Unit</Th>
                      <Th>Planned</Th>
                      <Th>Done</Th>
                      <Th>Unbilled</Th>
                      <Th>Variance</Th>
                      <Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {viewWO.scopeItems.map((si) => {
                      const hasSubItems = (si.subItems?.length ?? 0) > 0;
                      // A parent's own completedQty/lastBilledQty are a display
                      // rollup, not a billable quantity (see
                      // recomputeParentFromSubItems) — the real unbilled total
                      // is the sum of what's actually unbilled on each particular.
                      const unbilled = hasSubItems
                        ? si.subItems!.reduce((s, sub) => s + Math.max(0, (sub.completedQty || 0) - (sub.lastBilledQty || 0)), 0)
                        : Math.max(0, si.completedQty - (si.lastBilledQty || 0));
                      const level = varianceLevel(si.plannedQty, si.completedQty);
                      const blocked = itemHasUnapprovedVariance(si);
                      const canBill = unbilled > 0 && !blocked;
                      const entryCount = si.progressEntries?.length ?? 0;
                      const isExpanded = expandedEntries.has(si._id);
                      return (
                        <Fragment key={si._id}>
                          <Tr>
                            <Td>
                              {unbilled > 0 && (
                                <span title={blocked ? `Approve the variance${hasSubItems ? " on every particular" : ""} below first` : undefined}>
                                  <Checkbox checked={checked.has(si._id)} disabled={!canBill} onChange={() => toggleCheck(si._id)} />
                                </span>
                              )}
                            </Td>
                            <Td className="font-semibold">
                              {!hasSubItems && entryCount > 0 && (
                                <button type="button" onClick={() => toggleEntries(si._id)} className="mr-1.5 text-gray-500 dark:text-gray-400 align-middle">
                                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 inline" /> : <ChevronRight className="w-3.5 h-3.5 inline" />}
                                </button>
                              )}
                              {si.description}
                              {!hasSubItems && entryCount > 0 && (
                                <span className="text-[11px] text-gray-400 font-normal ml-1.5">({entryCount} entr{entryCount !== 1 ? "ies" : "y"})</span>
                              )}
                              {si.remarks && <div className="text-[11px] text-amber-600 font-normal">📌 {si.remarks}</div>}
                            </Td>
                            <Td>{si.unit}</Td>
                            <Td className="font-mono">{fmtN(si.plannedQty)}</Td>
                            <Td className="font-mono">{fmtN(si.completedQty)}</Td>
                            <Td className={`font-mono ${unbilled > 0 ? "text-primary font-bold" : "text-gray-400"}`}>{fmtN(unbilled)}</Td>
                            <Td>
                              {!hasSubItems && level !== "none" && (
                                <div className="flex items-center gap-1.5">
                                  <VarianceTag level={level} />
                                  {!si.varianceApproved && (
                                    <Btn small outline loading={approvingVariance === si._id} label="Approve" onClick={() => handleApproveVariance(si)} />
                                  )}
                                </div>
                              )}
                              {hasSubItems && itemHasUnapprovedVariance(si) && <UIBadge color="red" small>See particulars</UIBadge>}
                            </Td>
                            <Td></Td>
                          </Tr>
                          {!hasSubItems && isExpanded && (
                            <Tr>
                              <Td></Td>
                              <Td colSpan={7} className="!py-0 pb-2.5">
                                <ProgressEntryLog entries={si.progressEntries} />
                              </Td>
                            </Tr>
                          )}
                          {hasSubItems && si.subItems!.map(sub => {
                            const subUnbilled = Math.max(0, (sub.completedQty || 0) - (sub.lastBilledQty || 0));
                            const subLevel = varianceLevel(sub.plannedQty, sub.completedQty);
                            const subEntryCount = sub.progressEntries?.length ?? 0;
                            const subExpanded = expandedEntries.has(sub._id);
                            return (
                              <Fragment key={sub._id}>
                                <Tr className="bg-gray-50/60 dark:bg-gray-800/20">
                                  <Td></Td>
                                  <Td className="pl-6 text-xs text-gray-500 dark:text-gray-400">
                                    {subEntryCount > 0 && (
                                      <button type="button" onClick={() => toggleEntries(sub._id)} className="mr-1.5 text-gray-400 align-middle">
                                        {subExpanded ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
                                      </button>
                                    )}
                                    {sub.description}
                                    {subEntryCount > 0 && <span className="text-[10px] text-gray-400 ml-1.5">({subEntryCount})</span>}
                                  </Td>
                                  <Td className="text-xs">{sub.unit}</Td>
                                  <Td className="font-mono text-xs">{fmtN(sub.plannedQty)}</Td>
                                  <Td className="font-mono text-xs">{fmtN(sub.completedQty)}</Td>
                                  <Td className={`font-mono text-xs ${subUnbilled > 0 ? "text-primary font-bold" : "text-gray-400"}`}>{fmtN(subUnbilled)}</Td>
                                  <Td>
                                    {subLevel !== "none" && (
                                      <div className="flex items-center gap-1.5">
                                        <VarianceTag level={subLevel} />
                                        {!sub.varianceApproved && (
                                          <Btn small outline loading={approvingVariance === sub._id} label="Approve" onClick={() => handleApproveVariance(si, sub)} />
                                        )}
                                      </div>
                                    )}
                                  </Td>
                                  <Td></Td>
                                </Tr>
                                {subExpanded && (
                                  <Tr className="bg-gray-50/60 dark:bg-gray-800/20">
                                    <Td></Td><Td></Td>
                                    <Td colSpan={6} className="pl-6">
                                      <ProgressEntryLog entries={sub.progressEntries} />
                                    </Td>
                                  </Tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </Tbody>
                </Table>
              </div>

              <Field
                textarea label="Remarks for this bill request (optional)" placeholder="Notes for whoever approves this…"
                value={billRemarks} onChange={e => setBillRemarks(e.target.value)}
              />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
