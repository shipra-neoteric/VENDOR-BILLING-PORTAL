import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus, Pencil, Trash2, Building2, FolderOpen, CheckCircle2, Clock, ArrowLeft,
  Landmark, HardHat, Receipt, Banknote, TrendingUp, Users, ClipboardList, LayoutGrid, FileText, Activity,
} from "lucide-react";
import { WorkflowTimeline, type TimelineStep } from "../../components/WorkflowTimeline";
import dayjs from "dayjs";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Card from "../../ui/Card";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import { DatePicker } from "../../ui/DatePicker";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import Badge from "../../ui/Badge";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import type { NxBadgeColor } from "../../ui/nexora/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import Spinner from "../../ui/Spinner";
import Segmented from "../../ui/Segmented";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../ui/Table";
import { SearchFilter } from "../../ui/Filters";
import apiClient from "../../services/apiClient";
import BillDetailModal, { type BillDetailRequest } from "../../components/BillDetailModal";
import { vendorLabel } from "../../utils/vendorLabel";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Project {
  id: string;
  _id?: string;
  code: string;
  name: string;
  location: string;
  contractValue: number;
  status: "active" | "completed" | "on-hold";
  projectType?: "apartment" | "plot";
  budget?: number;
  client?: string;
  startDate?: string;
  expectedCompletion?: string;
  parentId?: string | null;
  slackChannelId?: string;
  // The real slackWebhookUrl is never sent to the client (see projectController's
  // sanitizeProject) — this is just "is one set," for the edit form's indicator.
  slackWebhookConfigured?: boolean;
}

interface WORow {
  _id: string;
  workOrderNo: string;
  vendorCode?: string;
  vendorName?: string;
  category?: string;
  status: string;
  contractValue?: number;
}

interface ContractorRow {
  _id: string;
  vendorCode: string;
  companyName: string;
  shortCode?: string;
  ownerName?: string;
}

interface ProjectStats {
  projectBudget: number;
  awardedContractValue: number;
  workExecutedValue: number;
  billedGross: number;
  certifiedNet: number;
  paidAmount: number;
  remainingContract: number;
  costVariance: number | null;
  pendingBillReqs: number;
  openBills: number;
  activeVendors: number;
  woCount: number;
  progress: number;
  categoryBreakdown: {
    category: string;
    contractValue: number;
    woCount: number;
    vendorCount: number;
    progress: number;
    workExecuted: number;
  }[];
}

interface ProjectEvent {
  _id: string;
  type: string;
  performedByName?: string;
  vendorName?: string;
  workOrderNo?: string;
  stageNo?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const EVENT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  WORK_ORDER_CREATED:      { icon: "📋", color: "#3b82f6", label: "Work Order Created" },
  WORK_ORDER_ISSUED:       { icon: "📝", color: "#6366f1", label: "Work Order Issued" },
  WORK_ORDER_COMPLETED:    { icon: "✅", color: "#16a34a", label: "Work Order Completed" },
  PROGRESS_ADDED:          { icon: "📊", color: "#FF7A00", label: "Progress Recorded" },
  BILL_REQUESTED:          { icon: "🧾", color: "#f59e0b", label: "Bill Request Submitted" },
  BILL_REQUEST_AGM_APPROVED: { icon: "📝", color: "#0ea5e9", label: "AGM Approved" },
  BILL_REQUEST_APPROVED:   { icon: "✅", color: "#16a34a", label: "GM Approved — Bill Raised" },
  BILL_REQUEST_REJECTED:   { icon: "❌", color: "#ef4444", label: "Bill Request Rejected" },
  RUNNING_BILL_CREATED:    { icon: "📄", color: "#3b82f6", label: "Running Bill Created" },
  RUNNING_BILL_SUBMITTED:  { icon: "📤", color: "#6366f1", label: "Running Bill Submitted" },
  RUNNING_BILL_VERIFIED:   { icon: "🔍", color: "#FF7A00", label: "Running Bill Verified" },
  RUNNING_BILL_APPROVED:   { icon: "✅", color: "#16a34a", label: "Running Bill Approved" },
  RUNNING_BILL_REJECTED:   { icon: "❌", color: "#ef4444", label: "Running Bill Rejected" },
  PAYMENT_INITIATED:       { icon: "💸", color: "#7c3aed", label: "Payment Initiated" },
  PAYMENT_RELEASED:        { icon: "💰", color: "#16a34a", label: "Payment Released" },
  MILESTONE_ACHIEVED:      { icon: "🏆", color: "#d97706", label: "Milestone Achieved" },
};

// ── Config ─────────────────────────────────────────────────────────────────────
// Nexora status-pill mapping (NxBadge semantics: green=success/complete,
// blue/indigo=in-progress/approved-stage, amber=pending/waiting,
// red=rejected/blocked, gray=neutral/draft).
function projectStatusBadge(status: Project["status"]): { label: string; color: NxBadgeColor } {
  if (status === "completed") return { label: "Completed", color: "green" };
  if (status === "on-hold") return { label: "On Hold", color: "amber" };
  return { label: "Active", color: "blue" };
}
function woStatusBadge(status: string): { label: string; color: NxBadgeColor } {
  if (status === "completed") return { label: "Completed", color: "green" };
  if (status === "in-progress") return { label: "In Progress", color: "amber" };
  if (status === "issued") return { label: "Issued", color: "blue" };
  return { label: "Draft", color: "gray" };
}
function billReqStatusBadge(status: string): { label: string; color: NxBadgeColor } {
  if (status === "approved") return { label: "Approved", color: "green" };
  if (status === "rejected") return { label: "Rejected", color: "red" };
  if (status === "pending-gm") return { label: "Pending GM", color: "amber" };
  return { label: "Pending", color: "amber" };
}

const normalizeId = (obj: any): Project => ({ ...obj, id: obj._id || obj.id });
const fmt = (n: number) => "₹" + (n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// ── Workflow Timeline helpers ──────────────────────────────────────────────────
const WF_STEPS: { key: string; name: string; icon: string; types: string[] }[] = [
  { key: "wo_created",   name: "Work Order\nGenerated",   icon: "📋", types: ["WORK_ORDER_CREATED"] },
  { key: "dri_viewed",   name: "Issued\nto DRI",          icon: "👷", types: ["WORK_ORDER_ISSUED"] },
  { key: "bill_req",     name: "Stage 1\nBill Request",   icon: "🧾", types: ["BILL_REQUESTED"] },
  { key: "agm_approved", name: "AGM\nApproved",           icon: "📝", types: ["BILL_REQUEST_AGM_APPROVED"] },
  { key: "gm_bill_approved", name: "GM Approved &\nBill Raised", icon: "📄", types: ["BILL_REQUEST_APPROVED"] },
  { key: "rb_approved",  name: "Running Bill\nApproved",  icon: "🔏", types: ["RUNNING_BILL_APPROVED", "RUNNING_BILL_VERIFIED"] },
  { key: "pay_init",     name: "Payment\nInitiated",      icon: "💸", types: ["PAYMENT_INITIATED"] },
  { key: "pay_out",      name: "Payment\nReleased",       icon: "💰", types: ["PAYMENT_RELEASED", "MILESTONE_ACHIEVED"] },
  { key: "wo_done",      name: "Work Order\nCompleted",   icon: "🏆", types: ["WORK_ORDER_COMPLETED"] },
];

function buildTimelineSteps(events: ProjectEvent[], woNo: string): TimelineStep[] {
  const evs    = events.filter(e => e.workOrderNo === woNo);
  const findEv = (types: string[]) => evs.find(e => types.includes(e.type));
  const billRejected = evs.some(e => e.type === "BILL_REQUEST_REJECTED");

  const mapped  = WF_STEPS.map(s => ({ ...s, ev: findEv(s.types) }));
  const lastIdx = mapped.reduce((acc, s, i) => s.ev ? i : acc, -1);
  const currIdx = lastIdx + 1;

  return mapped.map((s, i): TimelineStep => {
    if (s.ev) return { key: s.key, name: s.name, icon: s.icon, status: "completed", date: s.ev.createdAt, completedBy: s.ev.performedByName };
    if (i === currIdx) {
      if (s.key === "bill_req" && billRejected) return { key: s.key, name: s.name, icon: s.icon, status: "rejected" };
      return { key: s.key, name: s.name, icon: s.icon, status: "current" };
    }
    return { key: s.key, name: s.name, icon: s.icon, status: "pending" };
  });
}

// ── Project Detail View ────────────────────────────────────────────────────────
function ProjectDetail({
  project, onBack, onEdit, onDelete, allProjects, onSelectProject, onAddSubProject,
}: {
  project: Project;
  onBack: () => void;
  onEdit: (p: Project, e: React.MouseEvent) => void;
  onDelete: (p: Project) => void;
  allProjects: Project[];
  onSelectProject: (p: Project) => void;
  onAddSubProject: (parent: Project) => void;
}) {
  const id = project._id || project.id;
  const parentProject = project.parentId ? allProjects.find(p => p.id === project.parentId) : null;
  const subProjects = project.parentId ? [] : allProjects.filter(p => p.parentId === project.id);
  const [wos,           setWOs]          = useState<WORow[]>([]);
  const [stats,         setStats]        = useState<ProjectStats | null>(null);
  const [activity,      setActivity]     = useState<ProjectEvent[]>([]);
  const [billRequests,  setBillRequests] = useState<BillDetailRequest[]>([]);
  const [contractors,   setContractors]  = useState<ContractorRow[]>([]);
  const [loading,       setLoading]      = useState(true);
  const [selectedWONo,  setSelectedWONo] = useState<string>("");
  const [activeTab,     setActiveTab]    = useState<"vendors" | "workorders" | "category" | "bills" | "activity">("workorders");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewBill,      setViewBill]     = useState<BillDetailRequest | null>(null);
  const [deleteTarget,  setDeleteTarget] = useState<Project | null>(null);
  const [deleting,      setDeleting]     = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  useEffect(() => {
    setLoading(true);
    setSelectedCategory(null);
    Promise.all([
      apiClient.get(`/work-orders?projectId=${id}`),
      apiClient.get(`/projects/${id}/stats`),
      apiClient.get(`/projects/${id}/activity?limit=30`),
      apiClient.get(`/bill-requests?projectId=${id}`),
      apiClient.get(`/contractors`),
    ])
      .then(([wosR, statsR, actR, brR, contR]) => {
        const loadedWOs: WORow[] = wosR.data.workOrders ?? [];
        setWOs(loadedWOs);
        setStats(statsR.data.stats ?? null);
        setActivity(actR.data.events ?? []);
        setBillRequests(brR.data.billRequests ?? []);
        setContractors(contR.data.contractors ?? []);
        if (loadedWOs.length > 0) {
          const active = loadedWOs.find(w => w.status === "in-progress") ?? loadedWOs[loadedWOs.length - 1];
          setSelectedWONo(active.workOrderNo);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const completedCount = wos.filter(w => w.status === "completed").length;

  const projectVendors = useMemo(() => {
    const vendorCodes = new Set(wos.map(w => w.vendorCode).filter(Boolean));
    return contractors.filter(c => vendorCodes.has(c.vendorCode)).map(c => {
      const vendorWOs = wos.filter(w => w.vendorCode === c.vendorCode);
      return {
        contractor: c,
        woCount: vendorWOs.length,
        contractValue: vendorWOs.reduce((s, w) => s + (w.contractValue || 0), 0),
      };
    });
  }, [wos, contractors]);

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-5">
        <Btn outline small icon={ArrowLeft} label="Back to Projects" onClick={onBack} />
        {parentProject && (
          <Btn outline small label={`← ${parentProject.name}`} onClick={() => onSelectProject(parentProject)} />
        )}
      </div>

      {/* Project header card */}
      <Card className="mb-5">
        <div className="flex justify-between items-start gap-5 flex-wrap">
          <div>
            <NxBadge color="gray">{project.code}</NxBadge>
            <div className="text-2xl font-extrabold text-[#1A1A2E] dark:text-[#F1F5F9] leading-tight mt-2 mb-1.5">
              {project.name}
            </div>
            {project.client && <div className="text-[13px] text-gray-500 dark:text-gray-400 mb-0.5">🏢 Client: {project.client}</div>}
            <div className="text-sm text-gray-500 dark:text-gray-400">📍 {project.location || "—"}</div>
            {(project.startDate || project.expectedCompletion) && (
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {project.startDate && `Start: ${dayjs(project.startDate).format("MMM YYYY")}`}
                {project.startDate && project.expectedCompletion && " → "}
                {project.expectedCompletion && `Target: ${dayjs(project.expectedCompletion).format("MMM YYYY")}`}
              </div>
            )}
            <div className="flex gap-2 mt-2.5 flex-wrap">
              <NxBadge color={projectStatusBadge(project.status).color}>{projectStatusBadge(project.status).label}</NxBadge>
              {project.projectType && (
                <NxBadge color={project.projectType === "apartment" ? "indigo" : "teal"}>
                  {project.projectType === "apartment" ? "Apartment" : "Plot"}
                </NxBadge>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <NxBtn color="primary" icon={Pencil} label="Edit Project" onClick={e => onEdit(project, e)} />
            <NxBtn
              color="danger" icon={Trash2} label="Delete"
              disabled={subProjects.length > 0}
              title={subProjects.length > 0 ? "Delete its sub-projects first" : undefined}
              onClick={() => setDeleteTarget(project)}
            />
          </div>
        </div>
      </Card>

      {/* Sub-Projects */}
      {!project.parentId && (
        <Card padded={false} className="mb-5 overflow-hidden">
          <div className="flex justify-between items-center px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/40">
            <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Sub-Projects</div>
            <Btn small outline icon={Plus} label="Add Sub-Project" onClick={() => onAddSubProject(project)} />
          </div>
          {subProjects.length === 0 ? (
            <div className="text-center py-8 text-[13px] text-gray-400">No sub-projects yet.</div>
          ) : (
            <div>
              {subProjects.map((sp, i) => (
                <div
                  key={sp.id}
                  onClick={() => onSelectProject(sp)}
                  className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 ${i < subProjects.length - 1 ? "border-b border-gray-100 dark:border-gray-700/40" : ""}`}
                >
                  <NxBadge color="gray">{sp.code}</NxBadge>
                  <span className="flex-1 font-semibold text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9]">{sp.name}</span>
                  <NxBadge color={projectStatusBadge(sp.status).color}>{projectStatusBadge(sp.status).label}</NxBadge>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setDeleteTarget(sp); }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {loading ? (
        <Spinner label="Loading project details…" />
      ) : (
        <>
          {/* Financial stats */}
          {stats && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <NxStatCard label="Total Contract Value" value={fmt(stats.awardedContractValue)} icon={Landmark} />
                <NxStatCard label="Work Executed"    value={fmt(stats.workExecutedValue)}    icon={HardHat} />
                <NxStatCard label="Total Billed"     value={fmt(stats.billedGross)}          icon={Receipt} />
                <NxStatCard label="Total Certified (Net)" value={fmt(stats.certifiedNet)}    icon={CheckCircle2} />
                <NxStatCard label="Paid"             value={fmt(stats.paidAmount)}           icon={Banknote} />
                <NxStatCard label="Remaining"        value={fmt(stats.remainingContract)}    icon={Clock} />
                <NxStatCard label="Overall Progress" value={`${stats.progress}%`}            icon={TrendingUp} />
              </div>

              {/* Quick indicators */}
              <div className="flex gap-2.5 flex-wrap mb-5">
                <NxBadge size="md" color="teal">{stats.activeVendors} Active Contractor{stats.activeVendors !== 1 ? "s" : ""}</NxBadge>
                <NxBadge size="md" color="blue">{stats.woCount} Work Order{stats.woCount !== 1 ? "s" : ""}</NxBadge>
                <NxBadge size="md" color="green">{completedCount} Completed WOs</NxBadge>
                <NxBadge size="md" color={stats.pendingBillReqs > 0 ? "amber" : "gray"}>{stats.pendingBillReqs} Pending Bill Req{stats.pendingBillReqs !== 1 ? "s" : ""}</NxBadge>
                <NxBadge size="md" color={stats.openBills > 0 ? "indigo" : "gray"}>{stats.openBills} Open Bill{stats.openBills !== 1 ? "s" : ""}</NxBadge>
              </div>
            </>
          )}

          {/* Tab switcher */}
          <div className="mb-5">
            <Segmented
              value={activeTab}
              onChange={setActiveTab}
              options={[
                { value: "vendors",    label: <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />Vendors</span> },
                { value: "workorders", label: <span className="flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" />Work Orders</span> },
                { value: "category",   label: <span className="flex items-center gap-1.5"><LayoutGrid className="w-3.5 h-3.5" />Category</span> },
                { value: "bills",      label: <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Bills</span> },
                { value: "activity",   label: <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" />Live Activity</span> },
              ]}
            />
          </div>

          {/* Vendors tab */}
          {activeTab === "vendors" && (
            <div className="mb-5">
              <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9] mb-3">Vendors</div>
              {projectVendors.length === 0 ? (
                <Card className="text-center py-12">
                  <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">No vendors yet</div>
                  <div className="text-xs text-gray-400 mt-1">Vendors appear here once work orders are assigned to them.</div>
                </Card>
              ) : (
                <Table>
                  <Thead>
                    <Tr><Th>Vendor</Th><Th>Vendor Code</Th><Th>Owner</Th><Th>Work Orders</Th><Th className="text-right">Contract Value</Th></Tr>
                  </Thead>
                  <Tbody>
                    {projectVendors.map(v => (
                      <Tr key={v.contractor._id}>
                        <Td>{vendorLabel(v.contractor.companyName, v.contractor.shortCode)}</Td>
                        <Td>{v.contractor.vendorCode}</Td>
                        <Td>{v.contractor.ownerName || "—"}</Td>
                        <Td>{v.woCount}</Td>
                        <Td className="text-right font-bold">{fmt(v.contractValue)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </div>
          )}

          {/* Work Orders tab */}
          {activeTab === "workorders" && (
            <>
              <div className="mb-5">
                <div className="flex justify-between items-center mb-3">
                  <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Work Orders</div>
                  <div className="text-xs text-gray-400">{wos.length} total</div>
                </div>
                {wos.length === 0 ? (
                  <Card className="text-center py-12">
                    <ClipboardList className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">No work orders yet</div>
                    <div className="text-xs text-gray-400 mt-1">Work orders assigned to this project will appear here.</div>
                  </Card>
                ) : (
                  <Table>
                    <Thead>
                      <Tr><Th>WO Number</Th><Th>Vendor</Th><Th>Category</Th><Th>Status</Th><Th className="text-right">Contract Value</Th></Tr>
                    </Thead>
                    <Tbody>
                      {wos.map(wo => (
                        <Tr key={wo._id}>
                          <Td>{wo.workOrderNo}</Td>
                          <Td>{wo.vendorName || "—"}</Td>
                          <Td>{wo.category || "—"}</Td>
                          <Td><NxBadge color={woStatusBadge(wo.status).color}>{woStatusBadge(wo.status).label}</NxBadge></Td>
                          <Td className="text-right font-bold">{fmt(wo.contractValue || 0)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )}
              </div>

              {/* Work Order Lifecycle Timeline */}
              {wos.length > 0 && (
                <Card className="mb-5">
                  <div className="flex justify-between items-start flex-wrap gap-2.5 mb-4">
                    <div>
                      <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Work Order Lifecycle</div>
                      <div className="text-xs text-gray-400 mt-0.5">Billing workflow progress — click any completed step for details</div>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {wos.map(wo => (
                        <button
                          key={wo._id}
                          onClick={() => setSelectedWONo(wo.workOrderNo)}
                          className={`rounded-lg px-3 py-1 text-[11px] font-bold transition-colors ${selectedWONo === wo.workOrderNo ? "bg-primary text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"}`}
                        >
                          {wo.workOrderNo}
                        </button>
                      ))}
                    </div>
                  </div>
                  <WorkflowTimeline steps={selectedWONo ? buildTimelineSteps(activity, selectedWONo) : []} />
                </Card>
              )}
            </>
          )}

          {/* Category tab */}
          {activeTab === "category" && stats && (
            <div className="mb-5">
              <div className="flex items-center gap-2.5 mb-3">
                {selectedCategory && (
                  <button type="button" onClick={() => setSelectedCategory(null)} className="text-primary font-bold text-[13px]">
                    ← Categories
                  </button>
                )}
                <div className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">
                  {selectedCategory ? `Bills — ${selectedCategory}` : "Category Breakdown"}
                </div>
              </div>

              {!selectedCategory ? (
                stats.categoryBreakdown.length === 0 ? (
                  <Card className="text-center py-12">
                    <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">No categories yet</div>
                  </Card>
                ) : (
                  <Table>
                    <Thead>
                      <Tr><Th>Category</Th><Th>WOs</Th><Th>Vendors</Th><Th className="text-right">Contract Value</Th><Th className="text-right">Work Executed</Th><Th>Progress</Th></Tr>
                    </Thead>
                    <Tbody>
                      {stats.categoryBreakdown.map(cat => (
                        <Tr key={cat.category} onClick={() => setSelectedCategory(cat.category)} className="cursor-pointer">
                          <Td>{cat.category}</Td>
                          <Td>{cat.woCount}</Td>
                          <Td>{cat.vendorCount}</Td>
                          <Td className="text-right font-bold">{fmt(cat.contractValue)}</Td>
                          <Td className="text-right">{fmt(cat.workExecuted)}</Td>
                          <Td className="min-w-[140px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                                <div className={`h-full rounded ${cat.progress >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${cat.progress}%` }} />
                              </div>
                              <span className={`text-xs font-bold min-w-[32px] ${cat.progress >= 100 ? "text-emerald-500" : "text-primary"}`}>{cat.progress}%</span>
                            </div>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )
              ) : (
                (() => {
                  const catBills = billRequests.filter(br => br.category === selectedCategory);
                  return catBills.length === 0 ? (
                    <Card className="text-center py-12">
                      <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">No bills under this category yet</div>
                    </Card>
                  ) : (
                    <Card padded={false} className="overflow-hidden">
                      {catBills.map((br, i) => (
                        <div
                          key={br._id}
                          onClick={() => setViewBill(br)}
                          className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 ${i < catBills.length - 1 ? "border-b border-gray-100 dark:border-gray-700/40" : ""}`}
                        >
                          <NxBadge color="gray">{br.reqNo}</NxBadge>
                          <span className="flex-1 text-sm font-medium text-[#1A1A2E] dark:text-[#F1F5F9]">{br.vendorName}</span>
                          <span className="text-xs text-gray-400">{dayjs(br.createdAt).format("DD MMM YYYY")}</span>
                          <NxBadge color={billReqStatusBadge(br.status).color}>{billReqStatusBadge(br.status).label}</NxBadge>
                        </div>
                      ))}
                    </Card>
                  );
                })()
              )}
            </div>
          )}

          {/* Bills tab */}
          {activeTab === "bills" && (
            <div className="mb-5">
              <div className="flex justify-between items-center mb-3">
                <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Bills</div>
                <div className="text-xs text-gray-400">{billRequests.length} total</div>
              </div>
              {billRequests.length === 0 ? (
                <Card className="text-center py-12">
                  <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">No bills yet</div>
                </Card>
              ) : (
                <Table>
                  <Thead>
                    <Tr><Th>Req No</Th><Th>Work Order</Th><Th>Vendor</Th><Th>Category</Th><Th>Date</Th><Th>Status</Th></Tr>
                  </Thead>
                  <Tbody>
                    {billRequests.map(br => (
                      <Tr key={br._id} onClick={() => setViewBill(br)} className="cursor-pointer">
                        <Td>{br.reqNo}</Td>
                        <Td>{br.workOrderNo}</Td>
                        <Td>{br.vendorName}</Td>
                        <Td>{br.category || "—"}</Td>
                        <Td>{dayjs(br.createdAt).format("DD MMM YYYY")}</Td>
                        <Td><NxBadge color={billReqStatusBadge(br.status).color}>{billReqStatusBadge(br.status).label}</NxBadge></Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </div>
          )}

          {/* Live Activity tab */}
          {activeTab === "activity" && (
            <div className="mb-5">
              <div className="flex justify-between items-center mb-3">
                <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Live Activity</div>
                <div className="text-xs text-gray-400">Last {activity.length} events</div>
              </div>
              {activity.length === 0 ? (
                <Card className="text-center py-12">
                  <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">No activity yet</div>
                </Card>
              ) : (
                <Card padded={false} className="px-5">
                  {activity.map((ev, i) => {
                    const cfg = EVENT_CONFIG[ev.type] ?? { icon: "📌", color: "#9CA3AF", label: ev.type };
                    return (
                      <div key={ev._id} className={`flex gap-3 py-3.5 ${i < activity.length - 1 ? "border-b border-gray-100 dark:border-gray-700/40" : ""}`}>
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[15px] shrink-0"
                          style={{ background: cfg.color + "18", border: `1.5px solid ${cfg.color}44` }}
                        >
                          {cfg.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <div className="text-sm font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">
                              {cfg.label}
                              {ev.stageNo && <span className="text-primary text-xs ml-1.5">Stage {ev.stageNo}</span>}
                            </div>
                            <div className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">{dayjs(ev.createdAt).format("DD MMM, HH:mm")}</div>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {ev.vendorName && <span>{ev.vendorName}</span>}
                            {ev.workOrderNo && <span className={`text-primary ${ev.vendorName ? "ml-1.5" : ""}`}>{ev.workOrderNo}</span>}
                          </div>
                          {ev.performedByName && <div className="text-[11px] text-gray-400 mt-0.5">by {ev.performedByName}</div>}
                        </div>
                      </div>
                    );
                  })}
                </Card>
              )}
            </div>
          )}
        </>
      )}

      <BillDetailModal billRequest={viewBill} open={!!viewBill} onClose={() => setViewBill(null)} />

      {deleteTarget && (
        <ConfirmModal
          title={`Delete "${deleteTarget.name}"?`}
          message="This cannot be undone."
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  name: "", client: "", location: "", projectType: "apartment", status: "active",
  startDate: "", expectedCompletion: "", slackChannelId: "",
  // Write-only — always starts blank, even when editing a project that
  // already has one set (see Field's hint/indicator below).
  slackWebhookUrl: "",
};

export default function Projects() {
  const [projects, setProjects]           = useState<Project[]>([]);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState<"all" | "active" | "completed" | "on-hold">("all");
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [detailProject, setDetailProject] = useState<Project | null>(null);
  const [creatingUnderParent, setCreatingUnderParent] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<Project | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const [formState, setFormState]         = useState(EMPTY_FORM);
  // Separate from formState.slackWebhookUrl (which is write-only and always
  // starts blank) — set only by the "Clear" action, so an explicit removal
  // is distinguishable from "left the field untouched."
  const [clearSlackWebhook, setClearSlackWebhook] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    apiClient.get<{ projects: Project[] }>("/projects")
      .then(r => setProjects(r.data.projects.map(normalizeId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() =>
    projects
      .filter(p =>
        !p.parentId &&
        (statusFilter === "all" || p.status === statusFilter) && (
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.code.toLowerCase().includes(search.toLowerCase()) ||
          (p.location || "").toLowerCase().includes(search.toLowerCase())
        )
      )
      .sort((a, b) => a.name.localeCompare(b.name)),
    [projects, search, statusFilter]
  );

  const getSubProjects = (parentId: string) =>
    projects.filter(p => p.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));

  const handleDeleteProject = async (project: Project) => {
    setDeleting(true);
    try {
      await apiClient.delete(`/projects/${project.id}`);
      setProjects(prev => prev.filter(p => p.id !== project.id));
      if (detailProject?.id === project.id) setDetailProject(null);
      toast.success(`"${project.name}" deleted`);
      setDeleteTarget(null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Delete failed";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  // Each card doubles as a status filter for the list below — clicking one
  // narrows `filtered` to that status; clicking it again (or "Total Projects")
  // clears back to "all".
  const statCards: { label: string; value: number; icon: typeof Building2; filterValue: "all" | "active" | "completed" | "on-hold" }[] = [
    { label: "Total Projects", value: projects.length,                                     icon: Building2,    filterValue: "all" },
    { label: "Active",         value: projects.filter(p => p.status === "active").length,    icon: CheckCircle2, filterValue: "active" },
    { label: "Completed",      value: projects.filter(p => p.status === "completed").length, icon: CheckCircle2, filterValue: "completed" },
    { label: "On Hold",        value: projects.filter(p => p.status === "on-hold").length,   icon: Clock,        filterValue: "on-hold" },
  ];

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingProject(null);
    setCreatingUnderParent(null);
    setFormState(EMPTY_FORM);
    setClearSlackWebhook(false);
    setDrawerOpen(true);
  };

  const openAddSubProject = (parent: Project) => {
    setEditingProject(null);
    setCreatingUnderParent(parent);
    setFormState(EMPTY_FORM);
    setClearSlackWebhook(false);
    setDrawerOpen(true);
  };

  const openEdit = (project: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingProject(project);
    setCreatingUnderParent(null);
    setFormState({
      name: project.name,
      client: project.client || "",
      location: project.location,
      projectType: project.projectType || "apartment",
      status: project.status,
      startDate: project.startDate ? project.startDate.slice(0, 10) : "",
      expectedCompletion: project.expectedCompletion ? project.expectedCompletion.slice(0, 10) : "",
      slackChannelId: project.slackChannelId || "",
      slackWebhookUrl: "",
    });
    setClearSlackWebhook(false);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!formState.name.trim()) return toast.error("Project name is required");
    if (!formState.location.trim()) return toast.error("Location is required");

    const payload = {
      name: formState.name.trim(),
      client: formState.client.trim() || undefined,
      location: formState.location.trim(),
      projectType: formState.projectType,
      status: formState.status,
      startDate: formState.startDate || undefined,
      expectedCompletion: formState.expectedCompletion || undefined,
      slackChannelId: formState.slackChannelId.trim(),
      // undefined (dropped by JSON.stringify) = left untouched; a real string
      // = set/replace; null = explicit "Clear" — see updateProject's handling.
      slackWebhookUrl: clearSlackWebhook ? null : (formState.slackWebhookUrl.trim() || undefined),
    };

    setSaving(true);
    try {
      if (editingProject) {
        const res = await apiClient.put<{ project: Project }>(`/projects/${editingProject.id}`, payload);
        const updated = normalizeId(res.data.project);
        setProjects(prev => prev.map(p => p.id === editingProject.id ? updated : p));
        if (detailProject?.id === editingProject.id) setDetailProject(updated);
        toast.success("Project updated");
      } else {
        const res = await apiClient.post<{ project: Project }>("/projects", { ...payload, parentId: creatingUnderParent?.id ?? undefined });
        setProjects(prev => [normalizeId(res.data.project), ...prev]);
        toast.success(`Project ${res.data.project.code} created`);
      }
      setDrawerOpen(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {detailProject ? (
        /* ── Detail view — ProjectDetail's own header card already carries
        the title/code/location/Edit/Delete, so no outer page-header wrapper
        is needed here (it would just duplicate that row). ── */
        <ProjectDetail
          project={detailProject}
          onBack={() => setDetailProject(null)}
          onEdit={openEdit}
          onDelete={handleDeleteProject}
          allProjects={projects}
          onSelectProject={setDetailProject}
          onAddSubProject={openAddSubProject}
        />
      ) : (
        /* ── List view ────────────────────────────────────────────────────── */
        <>
          <PageHeader
            title="Projects"
            subtitle="Manage project master data — locations, contract values, and status."
            icon={Building2}
            actions={<NxBtn label="Add Project" icon={Plus} color="primary" onClick={openCreate} />}
          />

          {loading ? (
            <Spinner label="Loading projects…" />
          ) : (
            <>
              {/* Stats strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
                {statCards.map(s => (
                  <NxStatCard
                    key={s.label} label={s.label} value={s.value} icon={s.icon}
                    active={statusFilter === s.filterValue}
                    onClick={() => setStatusFilter(statusFilter === s.filterValue ? "all" : s.filterValue)}
                  />
                ))}
              </div>

              {/* Search */}
              <div className="mb-5">
                <SearchFilter value={search} onChange={setSearch} placeholder="Search by project name, code, or location…" />
              </div>

              {/* Cards grid */}
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <FolderOpen className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                  <p className="text-base font-medium text-gray-500 dark:text-gray-400">
                    {search ? "No projects match your search" : "No projects yet"}
                  </p>
                  {!search && (
                    <p className="text-sm text-gray-400 dark:text-gray-500">Click "Add Project" to get started.</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {filtered.map(proj => {
                    const subCount = getSubProjects(proj.id).length;
                    return (
                      <Card
                        key={proj.id}
                        onClick={() => setDetailProject(proj)}
                        className="cursor-pointer hover:shadow-lg transition-all duration-200"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <NxBadge color="gray">{proj.code}</NxBadge>
                          <NxBadge color={projectStatusBadge(proj.status).color}>{projectStatusBadge(proj.status).label}</NxBadge>
                        </div>

                        <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9] leading-snug mb-1.5">
                          {proj.name}
                        </div>

                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">📍 {proj.location || "—"}</div>

                        {subCount > 0 && (
                          <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mb-1.5">
                            📁 {subCount} sub-project{subCount !== 1 ? "s" : ""}
                          </div>
                        )}

                        <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-700/40 mt-2 pt-2.5">
                          {proj.projectType ? (
                            <NxBadge color={proj.projectType === "apartment" ? "indigo" : "teal"}>
                              {proj.projectType === "apartment" ? "Apartment" : "Plot"}
                            </NxBadge>
                          ) : <span />}
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <NxBtn color="icon" icon={Pencil} title="Edit" onClick={e => openEdit(proj, e)} />
                            <NxBtn
                              color="icon" icon={Trash2} title={subCount > 0 ? "Delete its sub-projects first" : "Delete"}
                              disabled={subCount > 0}
                              onClick={e => { e.stopPropagation(); setDeleteTarget(proj); }}
                            />
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Create / Edit Drawer ─────────────────────────────────────────── */}
      {drawerOpen && (
        <Modal
          icon={Building2}
          title={editingProject ? "Edit Project" : creatingUnderParent ? "Add Sub-Project" : "Add Project"}
          subtitle={
            editingProject
              ? `Editing ${editingProject.code}`
              : creatingUnderParent
                ? `Under "${creatingUnderParent.name}"`
                : "Project code will be auto-assigned (PRJ-001)"
          }
          onClose={() => setDrawerOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn label="Cancel" outline onClick={() => setDrawerOpen(false)} />
              <Btn label={editingProject ? "Save Changes" : "Add Project"} color="primary" loading={saving} onClick={handleSave} />
            </div>
          }
        >
          <div className="space-y-4">
            <Field
              label="Project Name" required placeholder="e.g. Metro Station Phase 2"
              value={formState.name} onChange={e => setFormState(f => ({ ...f, name: e.target.value }))}
            />
            <Field
              label="Client / Owner" placeholder="e.g. DDA, NMDC"
              value={formState.client} onChange={e => setFormState(f => ({ ...f, client: e.target.value }))}
            />
            <Field
              label="Location" required placeholder="e.g. Bhopal"
              value={formState.location} onChange={e => setFormState(f => ({ ...f, location: e.target.value }))}
            />
            <SField
              label="Project Type" value={formState.projectType}
              options={[
                { value: "apartment", label: "Apartment / Commercial" },
                { value: "plot", label: "Plot / Villa" },
              ]}
              onChange={v => setFormState(f => ({ ...f, projectType: v }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <DatePicker
                label="Start Date" value={formState.startDate}
                onChange={v => setFormState(f => ({ ...f, startDate: v }))}
              />
              <DatePicker
                label="Target Completion" value={formState.expectedCompletion}
                onChange={v => setFormState(f => ({ ...f, expectedCompletion: v }))}
              />
            </div>
            <SField
              label="Status" value={formState.status}
              options={[
                { value: "active", label: "Active" },
                { value: "completed", label: "Completed" },
                { value: "on-hold", label: "On Hold" },
              ]}
              onChange={v => setFormState(f => ({ ...f, status: v }))}
            />
            <Field
              label="Slack Channel ID" placeholder="e.g. C0AR8J39S8H"
              hint='Daily Progress Reports for this project post here — the channel ID, not its name. In Slack: open the channel → View channel details. Leave blank to skip Slack.'
              value={formState.slackChannelId} onChange={e => setFormState(f => ({ ...f, slackChannelId: e.target.value }))}
            />
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                  Slack Webhook URL
                </span>
                {editingProject && (
                  editingProject.slackWebhookConfigured && !clearSlackWebhook ? (
                    <span className="flex items-center gap-2 text-[11px]">
                      <Badge color="green" small>Configured</Badge>
                      <button
                        type="button"
                        className="text-red-500 hover:text-red-600 font-semibold"
                        onClick={() => { setClearSlackWebhook(true); setFormState(f => ({ ...f, slackWebhookUrl: "" })); }}
                      >
                        Clear
                      </button>
                    </span>
                  ) : (
                    <Badge color="gray" small>{clearSlackWebhook ? "Will be removed" : "Not set"}</Badge>
                  )
                )}
              </div>
              <Field
                type="password" autoComplete="new-password"
                placeholder={editingProject?.slackWebhookConfigured ? "•••••••••••••••••••••••• (leave blank to keep)" : "https://hooks.slack.com/services/…"}
                hint="A per-project Slack Incoming Webhook posts here directly — no bot-membership issues. Kept write-only: this never shows the saved value, only whether one exists."
                value={formState.slackWebhookUrl}
                disabled={clearSlackWebhook}
                onChange={e => setFormState(f => ({ ...f, slackWebhookUrl: e.target.value }))}
              />
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete "${deleteTarget.name}"?`}
          message="This cannot be undone."
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={() => handleDeleteProject(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
