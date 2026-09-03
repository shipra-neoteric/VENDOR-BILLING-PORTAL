import { Fragment, useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import { HardHat, ClipboardList, TrendingUp, CheckCircle2, Layers, Lock, Pin, ArrowLeft, Users, Briefcase, Clock, FileText } from "lucide-react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import apiClient from "../../services/apiClient";
import { SearchFilter } from "../../ui/Filters";
import { useAuth } from "../../context/AuthContext";
import { useFormErrors } from "../../hooks/useFormErrors";
import { selectableProjects } from "../../utils/projectOptions";
import SField from "../../ui/SField";
import Field from "../../ui/Field";
import { DatePicker } from "../../ui/DatePicker";
import Btn from "../../ui/Btn";
import UIBadge from "../../ui/Badge";
import Spinner from "../../ui/Spinner";
import EmptyState from "../../ui/EmptyState";
import Card from "../../ui/Card";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import PageHeader from "../../ui/PageHeader";
import NxBadge from "../../ui/nexora/Badge";
import NxBtn from "../../ui/nexora/Btn";
import NxStatCard from "../../ui/nexora/StatCard";
import RemarksListInput from "../../components/RemarksListInput";

dayjs.extend(isoWeek);

// ── Shared types ──────────────────────────────────────────────────────────────
interface Project   { _id: string; name: string; code: string; parentId?: string | null; }
interface Category  { _id: string; name: string; color: string; }
interface WorkOrder { _id: string; workOrderNo: string; vendorName: string; contractValue: number; category: string; projectName?: string; }
interface ProgressEntry {
  _id: string; date: string; qtyAdded: number; remarks?: string;
  tower?: string; floor?: string; flatNo?: string; plotNo?: string; locationNote?: string;
  billedInRequestId?: string | null;
  enteredBy?: { _id: string; name: string } | string | null;
  invalidated?: { done: boolean; by?: { _id: string; name: string } | string; at?: string; reason?: string };
}
interface SubItemR {
  _id: string; description: string; remarks?: string; unit: string;
  plannedQty: number; completedQty: number; lastBilledQty: number;
  status?: string; progressEntries?: ProgressEntry[];
}
interface ScopeItemR {
  _id: string; description: string; remarks?: string; unit: string;
  plannedQty: number; completedQty: number; lastBilledQty: number;
  rate: number; status?: string; progressEntries?: ProgressEntry[];
  subItems?: SubItemR[];
}
interface WOSummary {
  _id: string; workOrderNo: string; projectName: string;
  projectId?: { _id: string; name: string; code: string; projectType?: string } | string;
  category?: string; subCategory?: string; vendorName?: string; vendorCode?: string;
}
interface WODetail  {
  _id: string; workOrderNo: string; projectName: string;
  projectId?: { _id: string; name: string; code: string; projectType?: string };
  category?: string; subCategory?: string; vendorName?: string;
  contractValue?: number; issueDate?: string;
  retentionPercent?: number;
  scopeItems: ScopeItemR[];
}
interface BRSummary {
  _id: string; reqNo: string; workOrderId: string; workOrderNo?: string;
  stageNo?: number; status: string;
  periodFrom?: string; periodTo?: string;
  items: { description: string; unit: string; billedQty: number }[];
  createdAt: string; projectName?: string; vendorName?: string;
  billId?: { billNo: string } | null;
  milestoneAchieved?: boolean;
  batchId?: string | null;
}
type EntryRow = ProgressEntry & {
  unit: string; description: string; scopeId: string;
  scopePlanned: number; scopeCompleted: number; scopeLastBilled: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtN  = (n: number) => (n ?? 0).toLocaleString("en-IN");
const fmt   = (n: number) => "₹" + (n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const pctOf = (c: number, p: number) => p > 0 ? Math.min(100, Math.round(((c ?? 0) / p) * 100)) : 0;

const BR_STATUS_COLOR: Record<string, string> = { pending: "#f59e0b", approved: "#16a34a", rejected: "#ef4444" };
const BR_STATUS_LABEL: Record<string, string> = { pending: "Pending Review", approved: "Approved", rejected: "Rejected" };
// NxBadge color + light/dark-aware "Stage N" box classes for the same three
// statuses, used by both the admin and DRI billing-stage lists in place of
// the old inline hex-styled pill (which had no dark-mode variant).
const BR_STATUS_NX_COLOR: Record<string, "amber" | "green" | "red"> = { pending: "amber", approved: "green", rejected: "red" };
const STAGE_BOX_CLS: Record<string, string> = {
  pending:  "border-amber-500 bg-amber-50 dark:bg-amber-500/10",
  approved: "border-emerald-600 bg-emerald-50 dark:bg-emerald-500/10",
  rejected: "border-red-600 bg-red-50 dark:bg-red-500/10",
};
const STAGE_TEXT_CLS: Record<string, string> = {
  pending:  "text-amber-600 dark:text-amber-400",
  approved: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-red-600 dark:text-red-400",
};

function getProjId(wo: WOSummary): string | undefined {
  if (!wo.projectId) return undefined;
  if (typeof wo.projectId === "string") return wo.projectId;
  return wo.projectId._id;
}

function formatLocation(e: EntryRow, pt: string): string {
  if (pt === "apartment") {
    const parts = [e.tower && `T-${e.tower}`, e.floor && `F-${e.floor}`, e.flatNo && `#${e.flatNo}`].filter(Boolean) as string[];
    if (parts.length) return parts.join(" ");
    return e.locationNote || "—";
  }
  if (e.plotNo) return `Plot ${e.plotNo}`;
  return e.locationNote || "—";
}

function personName(p?: { _id: string; name: string } | string | null): string {
  if (!p) return "";
  return typeof p === "string" ? "" : p.name;
}

// Renders Edit/Del/Invalidate for one entry: invalidated entries become
// read-only history (reason shown on hover); entries attached to a bill can
// only be invalidated (not edited/deleted) until that bill is rejected —
// invalidating clears the attachment and excludes the entry from progress.
// Entries that would drop completedQty below what's already been billed
// can't be deleted either — rather than a "confirm dialog with no way to
// confirm" trick, the delete affordance simply isn't rendered then.
function EntryActions({
  e, deleting, onEdit, onDelete, onInvalidate,
}: {
  e: EntryRow; deleting: boolean;
  onEdit: () => void; onDelete: () => void; onInvalidate: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const linkCls = "text-[11px] font-semibold hover:underline disabled:opacity-50 disabled:no-underline shrink-0";

  if (e.invalidated?.done) {
    const who = personName(e.invalidated.by);
    const title = `Invalidated${who ? ` by ${who}` : ""}${e.invalidated.at ? ` on ${dayjs(e.invalidated.at).format("DD MMM YYYY")}` : ""}${e.invalidated.reason ? ` — ${e.invalidated.reason}` : ""}`;
    return (
      <span title={title}>
        <NxBadge color="red">Invalidated</NxBadge>
      </span>
    );
  }
  if (e.billedInRequestId) {
    return (
      <button type="button" className={`${linkCls} text-purple-600 dark:text-purple-400`} onClick={onInvalidate}>
        Invalidate
      </button>
    );
  }

  const deletable = e.scopeCompleted - e.qtyAdded >= e.scopeLastBilled;
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={`${linkCls} text-blue-600 dark:text-blue-400`} onClick={onEdit}>Edit</button>
      {deletable ? (
        <button type="button" disabled={deleting} className={`${linkCls} text-red-600 dark:text-red-400`} onClick={() => setConfirming(true)}>
          {deleting ? "Deleting…" : "Del"}
        </button>
      ) : (
        <span className="text-[11px] text-gray-300 dark:text-gray-600" title="Entry is billed and cannot be deleted.">Del</span>
      )}
      {confirming && (
        <ConfirmModal
          title="Delete entry?"
          message="This will be deleted permanently."
          confirmLabel="Delete"
          danger
          onConfirm={() => { setConfirming(false); onDelete(); }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

// ── Admin: Construction Progress ──────────────────────────────────────────────
function WorkProgressAdmin() {
  const [projects,   setProjects]   = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selProject,   setSelProject]   = useState<string | undefined>();
  const [selCategory,  setSelCategory]  = useState<string | undefined>();
  const [selWorkOrder, setSelWorkOrder] = useState<string | undefined>();
  const [woDetail, setWODetail] = useState<WODetail | null>(null);
  const [billReqs, setBillReqs] = useState<BRSummary[]>([]);
  const [woList,   setWOList]   = useState<WorkOrder[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [mode,     setMode]     = useState<"idle" | "overview" | "detail">("idle");

  useEffect(() => {
    apiClient.get("/projects").then(r => setProjects(r.data.projects ?? []));
    apiClient.get("/categories").then(r => setCategories(r.data.categories ?? []));
  }, []);

  useEffect(() => {
    if (!selProject) { setWorkOrders([]); return; }
    apiClient.get(`/work-orders?projectId=${selProject}`).then(r => {
      let wos = r.data.workOrders ?? [];
      if (selCategory) {
        const cat = categories.find(c => c._id === selCategory);
        if (cat) wos = wos.filter((wo: WorkOrder) => wo.category === cat.name);
      }
      setWorkOrders(wos);
    });
  }, [selProject, selCategory, categories]);

  const loadProgress = async () => {
    if (!selProject || !selCategory) { toast.error("Select a Project and Category first"); return; }
    setLoading(true);
    try {
      if (selWorkOrder) {
        const [woR, brR] = await Promise.all([
          apiClient.get(`/work-orders/${selWorkOrder}`),
          apiClient.get(`/bill-requests?workOrderId=${selWorkOrder}`),
        ]);
        setWODetail(woR.data.workOrder ?? null);
        setBillReqs(brR.data.billRequests ?? []);
        setWOList([]);
        setMode("detail");
      } else {
        const cat = categories.find(c => c._id === selCategory);
        const r   = await apiClient.get(`/work-orders?projectId=${selProject}`);
        let wos   = r.data.workOrders ?? [];
        if (cat) wos = wos.filter((w: WorkOrder) => w.category === cat.name);
        setWOList(wos);
        setWODetail(null); setBillReqs([]);
        setMode("overview");
      }
    } catch { toast.error("Failed to load progress data"); }
    finally  { setLoading(false); }
  };

  const todayStr   = dayjs().format("YYYY-MM-DD");
  const allEntries = (woDetail?.scopeItems ?? [])
    .flatMap(si => (si.progressEntries ?? []).map(pe => ({
      ...pe, unit: si.unit, description: si.description,
      projectType: (woDetail as any)?.projectId?.projectType || "apartment",
    })))
    .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

  const workOrderOptions = [
    { value: "", label: "— Any —" },
    ...workOrders.map(w => ({ value: w._id, label: `${w.workOrderNo} — ${w.vendorName}` })),
  ];

  return (
    <div className="pb-10">
      <PageHeader
        icon={ClipboardList}
        title="Construction Progress"
        subtitle="Track DRI-reported progress, billing stages, and milestone payments."
      />

      <Card className="mb-6 flex gap-3 flex-wrap items-end">
        <div className="flex-1 min-w-[180px]">
          <SField
            label="Project" required placeholder="Select project"
            value={selProject ?? null}
            onChange={v => { setSelProject(v); setSelWorkOrder(undefined); setMode("idle"); setWODetail(null); setBillReqs([]); setWOList([]); }}
            options={selectableProjects(projects).map(p => ({ value: p._id, label: p.name }))}
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <SField
            label="Category" required placeholder="Select category"
            value={selCategory ?? null}
            onChange={v => { setSelCategory(v); setSelWorkOrder(undefined); setMode("idle"); }}
            options={categories.map(c => ({ value: c._id, label: c.name }))}
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <SField
            label="Work Order (optional)" placeholder="Select for detailed view"
            value={selWorkOrder ?? ""}
            onChange={v => { setSelWorkOrder(v || undefined); setMode("idle"); }}
            options={workOrderOptions}
          />
        </div>
        <NxBtn color="primary" label="Load Progress" onClick={loadProgress} />
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="large" /></div>
      ) : mode === "idle" ? (
        <Card className="text-center py-12">
          <HardHat className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <div className="text-[15px] font-semibold text-gray-600 dark:text-gray-300">No progress data yet</div>
          <div className="text-[13px] text-gray-400 dark:text-gray-500 mt-1">Select a project and category, then click Load Progress.</div>
        </Card>
      ) : mode === "overview" ? (
        woList.length === 0 ? <EmptyState title="No work orders found." /> : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {woList.map(wo => (
              <Card
                key={wo._id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => { setSelWorkOrder(wo._id); setMode("idle"); }}
              >
                <div className="font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">{wo.workOrderNo}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{wo.vendorName}</div>
                <div className="text-sm text-primary font-bold mt-2">{fmt(wo.contractValue ?? 0)}</div>
              </Card>
            ))}
          </div>
        )
      ) : woDetail ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-5">
            {(() => {
              const si = woDetail.scopeItems;
              const avgPct = si.length ? Math.round(si.reduce((s, x) => s + pctOf(x.completedQty, x.plannedQty), 0) / si.length) : 0;
              const billedAmt = si.reduce((s, x) => s + (x.lastBilledQty || 0) * (x.rate || 0), 0);
              return [
                { label: "Contract Value", value: fmt(woDetail.contractValue ?? 0), icon: ClipboardList },
                { label: "Overall Progress", value: `${avgPct}%`, icon: TrendingUp },
                { label: "Billed", value: fmt(billedAmt), icon: CheckCircle2 },
                { label: "Stages", value: String(billReqs.length), icon: Layers },
              ].map(({ label, value, icon }) => (
                <NxStatCard key={label} label={label} value={value} icon={icon} />
              ));
            })()}
          </div>

          <Card padded={false} className="overflow-hidden mb-5">
            <div className="px-5 py-3.5 bg-gray-800 dark:bg-gray-900">
              <div className="text-white font-bold text-[15px]">{woDetail.workOrderNo} — {woDetail.vendorName}</div>
              <div className="text-gray-400 text-xs mt-0.5">
                {woDetail.projectName}{woDetail.category ? ` · ${woDetail.category}` : ""}
              </div>
            </div>
            {(woDetail.retentionPercent ?? 0) > 0 && (
              <div className="m-4 mb-0 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-2.5 flex items-center gap-2.5">
                <Lock className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <div className="font-bold text-amber-800 dark:text-amber-300 text-sm">Retention Applicable: {woDetail.retentionPercent}%</div>
                  <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    {woDetail.retentionPercent}% of each bill amount will be withheld and released on work completion.
                  </div>
                </div>
              </div>
            )}
            <div className="p-4">
              <Table>
                <Thead>
                  <Tr>
                    {["#", "Description", "Unit", "Planned", "Completed", "Billed", "Unbilled", "Progress"].map(h => <Th key={h}>{h}</Th>)}
                  </Tr>
                </Thead>
                <Tbody>
                  {woDetail.scopeItems.map((si, idx) => {
                    const p = pctOf(si.completedQty, si.plannedQty);
                    const billedPct = pctOf(si.lastBilledQty || 0, si.plannedQty);
                    const unbilledPct = Math.max(0, p - billedPct);
                    return (
                      <Tr key={si._id}>
                        <Td><TdText>{idx + 1}</TdText></Td>
                        <Td>
                          <span className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9]">{si.description}</span>
                          {si.remarks && (
                            <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                              <Pin className="w-3 h-3" /> {si.remarks}
                            </div>
                          )}
                        </Td>
                        <Td><TdText>{si.unit}</TdText></Td>
                        <Td><span className="font-mono"><TdText>{fmtN(si.plannedQty)}</TdText></span></Td>
                        <Td><span className={`font-mono ${si.completedQty > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"}`}>{fmtN(si.completedQty)}</span></Td>
                        <Td><span className="font-mono text-blue-600 dark:text-blue-400">{fmtN(si.lastBilledQty || 0)}</span></Td>
                        <Td>
                          {Math.max(0, si.completedQty - (si.lastBilledQty || 0)) > 0
                            ? <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{fmtN(Math.max(0, si.completedQty - (si.lastBilledQty || 0)))}</span>
                            : <span className="text-gray-400 dark:text-gray-500">—</span>}
                        </Td>
                        <Td className="min-w-[180px]">
                          <div className="relative h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                            <div className="absolute left-0 top-0 h-full bg-emerald-600" style={{ width: `${billedPct}%` }} />
                            <div className="absolute top-0 h-full bg-primary" style={{ left: `${billedPct}%`, width: `${unbilledPct}%` }} />
                          </div>
                          <div className="text-[10px] mt-0.5">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{billedPct}% billed</span>
                            {unbilledPct > 0 && <span className="text-primary font-bold"> + {unbilledPct}% unbilled</span>}
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </div>
          </Card>

          {allEntries.length > 0 && (
            <Card padded={false} className="overflow-hidden mb-5">
              <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700/40 font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">
                Recent Progress Entries by DRI
              </div>
              <Table>
                <Thead>
                  <Tr>
                    {["Date", "Scope Item", "Location", "Qty Added", "Remarks"].map(h => <Th key={h}>{h}</Th>)}
                  </Tr>
                </Thead>
                <Tbody>
                  {allEntries.slice(0, 20).map((e, i) => (
                    <Tr key={e._id + i}>
                      <Td className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <TdText>{dayjs(e.date).format("DD MMM YYYY")}</TdText>
                          {dayjs(e.date).format("YYYY-MM-DD") === todayStr && <NxBadge color="blue">Today</NxBadge>}
                        </span>
                      </Td>
                      <Td><span className="font-medium text-[#1A1A2E] dark:text-[#F1F5F9]">{e.description}</span></Td>
                      <Td><TdText>{formatLocation(e as unknown as EntryRow, (e as any).projectType || "apartment")}</TdText></Td>
                      <Td><span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">+{fmtN(e.qtyAdded)} {e.unit}</span></Td>
                      <Td><TdText>{e.remarks || "—"}</TdText></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Card>
          )}

          {billReqs.length > 0 && (
            <Card padded={false} className="overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700/40 font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Billing Stages</div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/40">
                {billReqs.map(br => {
                  const boxCls = STAGE_BOX_CLS[br.status] ?? "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/40";
                  const textCls = STAGE_TEXT_CLS[br.status] ?? "text-gray-500 dark:text-gray-400";
                  return (
                    <div key={br._id} className="px-5 py-4 flex gap-3.5 items-start">
                      <div className={`rounded-lg text-center shrink-0 border-2 px-3 py-2 min-w-[64px] ${boxCls}`}>
                        <div className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase">Stage</div>
                        <div className={`text-xl font-extrabold ${textCls}`}>{br.stageNo ?? 1}</div>
                      </div>
                      <div className="flex-1">
                        <div className="flex gap-2 items-center mb-1 flex-wrap">
                          <span className="font-bold text-[#1A1A2E] dark:text-[#F1F5F9]">{br.reqNo}</span>
                          <NxBadge color={BR_STATUS_NX_COLOR[br.status] ?? "gray"}>{BR_STATUS_LABEL[br.status] ?? br.status}</NxBadge>
                        </div>
                        <div className="text-[11px] text-gray-400 dark:text-gray-500">
                          {br.items.map(it => `${it.description}: ${fmtN(it.billedQty)} ${it.unit}`).join(" · ")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

// ── Location fields (Add/Edit Progress modals) ────────────────────────────────
type LocationField = "tower" | "floor" | "flatNo" | "plotNo" | "locationNote";

function LocationFields({
  pt, tower, floor, flatNo, plotNo, locationNote, onChange,
}: {
  pt: string; tower: string; floor: string; flatNo: string; plotNo: string; locationNote: string;
  onChange: (field: LocationField, value: string) => void;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/40 rounded-lg p-3 mb-3.5">
      <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2.5">📍 Location (optional)</div>
      {pt === "apartment" ? (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Tower" placeholder="e.g. A, T1" value={tower} onChange={(e) => onChange("tower", e.target.value)} />
          <Field label="Floor" placeholder="e.g. G, 1, 5" value={floor} onChange={(e) => onChange("floor", e.target.value)} />
          <Field label="Flat No" placeholder="e.g. 101" value={flatNo} onChange={(e) => onChange("flatNo", e.target.value)} />
        </div>
      ) : (
        <Field label="Plot No" placeholder="e.g. Plot-42" value={plotNo} onChange={(e) => onChange("plotNo", e.target.value)} />
      )}
      <div className="mt-2">
        <Field label="Note" placeholder="Additional location details…" value={locationNote} onChange={(e) => onChange("locationNote", e.target.value)} />
      </div>
    </div>
  );
}

interface ProgFormValues {
  date: string; tower: string; floor: string; flatNo: string; plotNo: string;
  locationNote: string; qtyAdded: string; remarks: string; plannedQty: string;
}
const emptyProgForm: ProgFormValues = {
  date: "", tower: "", floor: "", flatNo: "", plotNo: "", locationNote: "", qtyAdded: "", remarks: "", plannedQty: "",
};

// ── DRI Dashboard ─────────────────────────────────────────────────────────────
function DRIDashboard() {
  const { user } = useAuth();

  // All WOs for this DRI
  const [allWOs,         setAllWOs]         = useState<WOSummary[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  // View: "select-project" = project picker, "project-detail" = project dashboard
  const [view,           setView]           = useState<"select-project" | "project-detail">("select-project");
  const [selProjectId,   setSelProjectId]   = useState<string | undefined>();
  const [selProjectName, setSelProjectName] = useState<string | undefined>();

  // WO details map (woId → WODetail) for the selected project's WOs
  const [woDetails,        setWoDetails]        = useState<Map<string, WODetail>>(new Map());
  const [woDetailsLoading, setWoDetailsLoading] = useState(false);

  // Bill requests for selected project
  const [projectBillReqs, setProjectBillReqs] = useState<BRSummary[]>([]);

  // Progress modal. progSubItem is set when logging progress against one
  // particular rather than the item itself (required once an item has any).
  const [progWOId,    setProgWOId]    = useState<string | undefined>();
  const [progItem,    setProgItem]    = useState<ScopeItemR | null>(null);
  const [progSubItem, setProgSubItem] = useState<SubItemR | null>(null);
  const [progModal,   setProgModal]   = useState(false);
  const [progFormValues, setProgFormValues] = useState<ProgFormValues>(emptyProgForm);
  const progErrors = useFormErrors<"date" | "qtyAdded">();
  const [saving,    setSaving]    = useState(false);

  // Edit entry modal
  const [editModal, setEditModal] = useState(false);
  const [editEntry, setEditEntry] = useState<EntryRow | null>(null);
  const [editFormValues, setEditFormValues] = useState<ProgFormValues>(emptyProgForm);
  const editErrors = useFormErrors<"qtyAdded">();
  const [deleting,  setDeleting]  = useState<string | null>(null);

  // Invalidate entry modal — for entries a rejected bill was made from
  const [invalidateModal, setInvalidateModal] = useState(false);
  const [invalidateEntry, setInvalidateEntry] = useState<EntryRow | null>(null);
  const [invalidateWOId,  setInvalidateWOId]  = useState<string | null>(null);
  const [invalidateReason, setInvalidateReason] = useState("");
  const invalidateErrors = useFormErrors<"reason">();
  const [invalidating,    setInvalidating]    = useState(false);

  // View all entries modal
  const [allEntriesWOId, setAllEntriesWOId] = useState<string | null>(null);

  // Quick search in project detail view
  const [driSearch, setDriSearch] = useState("");

  // ── Load all WOs once ──────────────────────────────────────────────────────
  useEffect(() => {
    apiClient.get("/work-orders")
      .then(r => setAllWOs(r.data.workOrders ?? []))
      .finally(() => setInitialLoading(false));
  }, []);

  // ── Derived: unique projects ───────────────────────────────────────────────
  const projects = useMemo<Array<{ projectId: string; projectName: string; woCount: number; vendorCodes: Set<string> }>>(() => {
    const seen = new Map<string, { projectId: string; projectName: string; woCount: number; vendorCodes: Set<string> }>();
    allWOs.forEach(wo => {
      const pid = getProjId(wo);
      if (!pid) return;
      if (!seen.has(pid)) {
        seen.set(pid, { projectId: pid, projectName: wo.projectName, woCount: 0, vendorCodes: new Set() });
      }
      const g = seen.get(pid)!;
      g.woCount++;
      if (wo.vendorCode) g.vendorCodes.add(wo.vendorCode);
    });
    return Array.from(seen.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [allWOs]);

  // WOs for selected project
  const projectWOs = useMemo(() =>
    allWOs.filter(wo => getProjId(wo) === selProjectId),
    [allWOs, selProjectId]
  );

  // Vendors in selected project (each vendor → their WOs in this project)
  const vendorGroups = useMemo(() => {
    const groups = new Map<string, { vendorCode: string; vendorName: string; wos: WOSummary[] }>();
    projectWOs.forEach(wo => {
      const code = wo.vendorCode || "unknown";
      if (!groups.has(code)) {
        groups.set(code, { vendorCode: code, vendorName: wo.vendorName || code, wos: [] });
      }
      groups.get(code)!.wos.push(wo);
    });
    return Array.from(groups.values()).sort((a, b) => a.vendorName.localeCompare(b.vendorName));
  }, [projectWOs]);

  // Filtered vendor groups by search
  const filteredVendorGroups = useMemo(() => {
    const q = driSearch.trim().toLowerCase();
    if (!q) return vendorGroups;
    return vendorGroups
      .map(vg => {
        const vendorMatch =
          vg.vendorName.toLowerCase().includes(q) ||
          vg.vendorCode.toLowerCase().includes(q);
        if (vendorMatch) return vg;
        const filteredWOs = vg.wos.filter(wo =>
          wo.workOrderNo.toLowerCase().includes(q)
        );
        if (filteredWOs.length) return { ...vg, wos: filteredWOs };
        return null;
      })
      .filter((g): g is NonNullable<typeof g> => g !== null);
  }, [vendorGroups, driSearch]);

  // Project type for location fields
  const selProjectType = useMemo((): "apartment" | "plot" => {
    const wo = allWOs.find(w => getProjId(w) === selProjectId);
    if (!wo || !wo.projectId || typeof wo.projectId === "string") return "apartment";
    return (wo.projectId as { projectType?: string }).projectType === "plot" ? "plot" : "apartment";
  }, [allWOs, selProjectId]);

  // ── Load WO details when project changes ──────────────────────────────────
  useEffect(() => {
    if (!selProjectId) { setWoDetails(new Map()); setProjectBillReqs([]); return; }
    setWoDetailsLoading(true);
    apiClient.get(`/work-orders?projectId=${selProjectId}`)
      .then(r => {
        const map = new Map<string, WODetail>();
        (r.data.workOrders ?? []).forEach((d: WODetail) => map.set(d._id, d));
        setWoDetails(map);
      })
      .finally(() => setWoDetailsLoading(false));
    if (selProjectId) {
      apiClient.get(`/bill-requests?projectId=${selProjectId}`)
        .then(r => setProjectBillReqs(r.data.billRequests ?? []));
    }
  }, [selProjectId]);

  // ── Pending WOs for billing ────────────────────────────────────────────────
  const pendingWODetails = useMemo(() =>
    Array.from(woDetails.values()).filter(d =>
      d.scopeItems.some(si => Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)) > 0) &&
      !projectBillReqs.some(br => br.workOrderId === d._id && br.status === "pending")
    ),
    [woDetails, projectBillReqs]
  );

  // ── Reload helpers ─────────────────────────────────────────────────────────
  const reloadWODetail = async (woId: string) => {
    const r = await apiClient.get(`/work-orders/${woId}`);
    setWoDetails(prev => new Map(prev).set(woId, r.data.workOrder));
  };

  // ── Progress handlers ──────────────────────────────────────────────────────
  const openAddProgress = (woId: string, item: ScopeItemR, sub: SubItemR | null) => {
    setProgWOId(woId);
    setProgItem(item);
    setProgSubItem(sub);
    progErrors.clearAll();
    setProgFormValues({ ...emptyProgForm, date: dayjs().format("YYYY-MM-DD") });
    setProgModal(true);
  };

  const handleAddProgress = async () => {
    if (!progWOId || !progItem) return;
    progErrors.clearAll();
    let hasError = false;
    if (!progFormValues.date) { progErrors.setError("date", "Select date"); hasError = true; }
    const qty = Number(progFormValues.qtyAdded);
    if (!progFormValues.qtyAdded || !(qty >= 0.01)) {
      progErrors.setError("qtyAdded", "Enter a valid quantity (e.g. 13.67)");
      hasError = true;
    }
    if (hasError) return;

    const target = progSubItem ?? progItem;
    const path = progSubItem
      ? `/work-orders/${progWOId}/scope-items/${progItem._id}/sub-items/${progSubItem._id}/progress`
      : `/work-orders/${progWOId}/scope-items/${progItem._id}/progress`;
    const plannedQty = progFormValues.plannedQty ? Number(progFormValues.plannedQty) : undefined;
    setSaving(true);
    try {
      await apiClient.post(path, {
        date: progFormValues.date || dayjs().format("YYYY-MM-DD"),
        qtyAdded: qty,
        remarks: progFormValues.remarks || "",
        tower: progFormValues.tower || "",
        floor: progFormValues.floor || "",
        flatNo: progFormValues.flatNo || "",
        plotNo: progFormValues.plotNo || "",
        locationNote: progFormValues.locationNote || "",
        ...(plannedQty ? { plannedQty } : {}),
      });
      toast.success(`+${fmtN(qty)} ${target.unit} recorded`);
      setProgModal(false);
      setProgSubItem(null);
      setProgFormValues(emptyProgForm);
      await reloadWODetail(progWOId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to add progress");
    }
    finally { setSaving(false); }
  };

  const handleEditEntry = async () => {
    if (!editEntry) return;
    editErrors.clearAll();
    const qty = Number(editFormValues.qtyAdded);
    if (!editFormValues.qtyAdded || !(qty >= 0.01)) { editErrors.setError("qtyAdded", "Required"); return; }
    const woId = editEntry.scopeId.split("||")[1] || progWOId;
    setSaving(true);
    try {
      await apiClient.patch(
        `/work-orders/${woId}/scope-items/${editEntry.scopeId.split("||")[0]}/progress/${editEntry._id}`,
        {
          qtyAdded: qty,
          date: editFormValues.date || undefined,
          remarks: editFormValues.remarks || "",
          tower: editFormValues.tower || "", floor: editFormValues.floor || "", flatNo: editFormValues.flatNo || "",
          plotNo: editFormValues.plotNo || "", locationNote: editFormValues.locationNote || "",
        }
      );
      toast.success("Entry updated");
      setEditModal(false); setEditFormValues(emptyProgForm);
      if (woId) await reloadWODetail(woId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to update entry");
    }
    finally { setSaving(false); }
  };

  const handleDeleteEntry = async (entry: EntryRow, woId: string) => {
    setDeleting(entry._id);
    try {
      await apiClient.delete(`/work-orders/${woId}/scope-items/${entry.scopeId.split("||")[0]}/progress/${entry._id}`);
      toast.success("Entry deleted");
      await reloadWODetail(woId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to delete entry");
    }
    finally { setDeleting(null); }
  };

  const handleInvalidateEntry = async () => {
    if (!invalidateEntry || !invalidateWOId) return;
    invalidateErrors.clearAll();
    if (!invalidateReason.trim()) { invalidateErrors.setError("reason", "Explain why this entry is wrong"); return; }
    setInvalidating(true);
    try {
      await apiClient.patch(
        `/work-orders/${invalidateWOId}/scope-items/${invalidateEntry.scopeId.split("||")[0]}/progress/${invalidateEntry._id}/invalidate`,
        { reason: invalidateReason }
      );
      toast.success("Entry invalidated — log correct progress separately");
      setInvalidateModal(false); setInvalidateReason("");
      await reloadWODetail(invalidateWOId);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to invalidate entry");
    }
    finally { setInvalidating(false); }
  };

  const progProjectType: "apartment" | "plot" = useMemo(() => {
    if (!progWOId) return "apartment";
    return (woDetails.get(progWOId) as any)?.projectId?.projectType || "apartment";
  }, [progWOId, woDetails]);

  const progModalTarget = progSubItem ?? progItem;
  const todayStr = dayjs().format("YYYY-MM-DD");

  // Must be above any conditional return (Rules of Hooks)
  const billHistory = useMemo(() => {
    const batches = new Map<string, BRSummary[]>();
    const singles: BRSummary[] = [];
    projectBillReqs.forEach(br => {
      if (br.batchId) {
        if (!batches.has(br.batchId)) batches.set(br.batchId, []);
        batches.get(br.batchId)!.push(br);
      } else {
        singles.push(br);
      }
    });
    const result: Array<{ type: "batch" | "single"; batchId?: string; items: BRSummary[] }> = [];
    batches.forEach((items, batchId) => result.push({ type: "batch", batchId, items }));
    singles.forEach(br => result.push({ type: "single", items: [br] }));
    return result.sort((a, b) => dayjs(b.items[0].createdAt).valueOf() - dayjs(a.items[0].createdAt).valueOf());
  }, [projectBillReqs]);

  if (initialLoading) return <Spinner size="large" />;

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW 1 — Project Picker
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "select-project") {
    return (
      <div className="p-6 max-w-[900px] mx-auto">
        <div className="mb-8">
          <div className="text-2xl font-extrabold text-[#1A1A2E] dark:text-[#F1F5F9]">Welcome, {user?.name}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Select a project to track progress and manage billing</div>
        </div>

        {projects.length === 0 ? (
          <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg">
            <EmptyState icon={HardHat} title="No work orders assigned yet" message="Ask your admin to assign work orders to you." />
          </div>
        ) : (
          <>
            <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3.5">
              Your Projects ({projects.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {projects.map(p => (
                <div
                  key={p.projectId}
                  onClick={() => { setSelProjectId(p.projectId); setSelProjectName(p.projectName); setView("project-detail"); }}
                  className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 border-l-4 border-l-primary rounded-lg p-5 pb-4 cursor-pointer hover:shadow-lg transition-shadow shadow-sm"
                >
                  <div className="text-[17px] font-bold text-[#1A1A2E] dark:text-[#F1F5F9] mb-2">{p.projectName}</div>
                  <div className="flex gap-3.5 text-xs text-gray-500 dark:text-gray-400">
                    <span>👷 {p.vendorCodes.size} contractor{p.vendorCodes.size !== 1 ? "s" : ""}</span>
                    <span>📋 {p.woCount} work order{p.woCount !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="mt-3 text-xs text-primary font-semibold">Open Project →</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW 2 — Project Dashboard (all vendors and WOs for this project)
  // ══════════════════════════════════════════════════════════════════════════
  const hasPending = pendingWODetails.length > 0;

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3.5">
          <NxBtn
            color="secondary" icon={ArrowLeft} label="All Projects"
            onClick={() => { setView("select-project"); setSelProjectId(undefined); setSelProjectName(undefined); setWoDetails(new Map()); setProjectBillReqs([]); setDriSearch(""); }}
          />
          <div>
            <div className="text-xl font-extrabold text-[#1A1A2E] dark:text-[#F1F5F9]">{selProjectName}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {selProjectType === "apartment" ? "🏢 Apartment" : "🏠 Plot"} · {projectWOs.length} work order{projectWOs.length !== 1 ? "s" : ""} · {vendorGroups.length} contractor{vendorGroups.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        {hasPending && (
          <span
            title="AGM/GM review your logged progress and decide when to generate a bill request — not done from here anymore."
            className="bg-primary/10 border border-primary/30 text-primary font-semibold text-xs px-3.5 py-1.5 rounded-lg"
          >
            🧾 {pendingWODetails.reduce((s, d) => s + d.scopeItems.filter(si => Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)) > 0).length, 0)} item(s) awaiting AGM/GM bill review
          </span>
        )}
      </div>

      {/* Search bar */}
      <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg p-3.5 mb-4">
        <SearchFilter placeholder="Search by vendor name, vendor code or work order no…" value={driSearch} onChange={setDriSearch} />
      </div>

      {/* Summary stats */}
      {!woDetailsLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-5">
          {[
            { label: "Contractors",   value: vendorGroups.length,   icon: Users },
            { label: "Work Orders",   value: projectWOs.length,     icon: Briefcase },
            { label: "Pending Items", value: pendingWODetails.reduce((s, d) => s + d.scopeItems.filter(si => Math.max(0, (si.completedQty || 0) - (si.lastBilledQty || 0)) > 0).length, 0), icon: Clock },
            { label: "Bill Requests", value: projectBillReqs.length, icon: FileText },
            { label: "Approved",      value: projectBillReqs.filter(b => b.status === "approved").length, icon: CheckCircle2 },
          ].map(s => (
            <NxStatCard key={s.label} label={s.label} value={s.value} icon={s.icon} />
          ))}
        </div>
      )}

      {/* Vendors + WOs */}
      {woDetailsLoading ? (
        <Spinner size="large" />
      ) : vendorGroups.length === 0 ? (
        <EmptyState title="No work orders found for this project." />
      ) : filteredVendorGroups.length === 0 ? (
        <EmptyState title={`No results for "${driSearch}"`} />
      ) : (
        <div className="flex flex-col gap-5">
          {filteredVendorGroups.map(vg => (
            <div key={vg.vendorCode} className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-hidden">
              {/* Vendor header */}
              <div className="bg-gray-800 dark:bg-gray-900 px-5 py-3.5 flex justify-between items-center">
                <div>
                  <div className="text-white font-bold text-base">👷 {vg.vendorName}</div>
                  <div className="text-gray-400 text-xs mt-0.5">
                    <span className="text-primary">{vg.vendorCode}</span> · {vg.wos.length} work order{vg.wos.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              {/* Work orders for this vendor in this project */}
              {vg.wos.map(woSum => {
                const detail = woDetails.get(woSum._id);
                const pendingBR = projectBillReqs.find(br => br.workOrderId === woSum._id && br.status === "pending");

                return (
                  <div key={woSum._id} className="border-b border-gray-200 dark:border-gray-700/40">
                    {/* WO sub-header */}
                    <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700/40 flex justify-between items-center">
                      <div className="flex gap-2.5 items-center flex-wrap">
                        <span className="font-bold text-primary text-[13px]">{woSum.workOrderNo}</span>
                        {woSum.category && <NxBadge color="gray">{woSum.category}</NxBadge>}
                        {pendingBR && <NxBadge color="amber">⏳ {pendingBR.reqNo} pending</NxBadge>}
                      </div>
                      {detail && (() => {
                        const avgPct = Math.round(detail.scopeItems.reduce((s, si) => s + pctOf(si.completedQty, si.plannedQty), 0) / (detail.scopeItems.length || 1));
                        return (
                          <div className="flex items-center gap-2 text-xs">
                            <div className="w-20 h-1.5 bg-gray-100 dark:bg-gray-700/40 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${avgPct >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${avgPct}%` }} />
                            </div>
                            <span className={`font-bold ${avgPct >= 100 ? "text-emerald-600" : "text-primary"}`}>{avgPct}%</span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Scope items */}
                    {!detail ? (
                      <Spinner size="small" />
                    ) : detail.scopeItems.length === 0 ? (
                      <div className="py-5 text-center text-gray-400 text-sm">No scope items defined for this work order.</div>
                    ) : (
                      <Table>
                        <Thead>
                          <Tr>
                            {["#", "Description", "Unit", "Planned", "Done", "Unbilled", "Remaining", "Progress", ""].map(h => <Th key={h}>{h}</Th>)}
                          </Tr>
                        </Thead>
                        <Tbody>
                          {detail.scopeItems.map((si, idx) => {
                            const p = pctOf(si.completedQty, si.plannedQty);
                            const unbilled = Math.max(0, (si.completedQty ?? 0) - (si.lastBilledQty || 0));
                            const rem      = Math.max(0, si.plannedQty - (si.completedQty ?? 0));
                            const isDone   = p >= 100;
                            const hasSubItems = (si.subItems?.length ?? 0) > 0;
                            return (
                              <Fragment key={si._id}>
                                <Tr>
                                  <Td className="text-gray-400 text-xs">{idx + 1}</Td>
                                  <Td className="font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] text-sm">
                                    {si.description}
                                    {hasSubItems && (
                                      <span className="ml-1.5 text-[10px] font-bold text-gray-400 uppercase">
                                        {isDone ? "✓ Complete" : `${si.subItems!.length} particulars`}
                                      </span>
                                    )}
                                    {si.remarks && <div className="text-[11px] font-normal text-amber-600 mt-0.5">📌 {si.remarks}</div>}
                                  </Td>
                                  <Td className="text-gray-500 dark:text-gray-400 text-xs">{si.unit}</Td>
                                  <Td className="font-mono text-xs">{fmtN(si.plannedQty)}</Td>
                                  <Td className={`font-mono text-xs ${si.completedQty > 0 ? "text-emerald-600" : "text-gray-400"}`}>{fmtN(si.completedQty)}</Td>
                                  <Td className="font-mono text-xs">
                                    {unbilled > 0 ? <span className="text-primary font-bold">{fmtN(unbilled)}</span> : <span className="text-gray-400">—</span>}
                                  </Td>
                                  <Td className={`font-mono text-xs ${rem > 0 ? "text-gray-600 dark:text-gray-300" : "text-emerald-600"}`}>
                                    {rem > 0 ? fmtN(rem) : "✓ Done"}
                                  </Td>
                                  <Td className="min-w-[110px]">
                                    <div className="flex items-center gap-1.5">
                                      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700/40 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${isDone ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${p}%` }} />
                                      </div>
                                      <span className={`text-[10px] font-bold min-w-[26px] ${isDone ? "text-emerald-600" : "text-primary"}`}>{p}%</span>
                                    </div>
                                  </Td>
                                  <Td>
                                    {!hasSubItems && (
                                      <NxBtn color="primary" label="+ Progress" onClick={() => openAddProgress(woSum._id, si, null)} />
                                    )}
                                  </Td>
                                </Tr>
                                {hasSubItems && si.subItems!.map((sub, subIdx) => {
                                  const sp = pctOf(sub.completedQty, sub.plannedQty);
                                  const subRem = Math.max(0, sub.plannedQty - (sub.completedQty ?? 0));
                                  const subDone = sp >= 100;
                                  return (
                                    <Tr key={sub._id} className="bg-gray-50/60 dark:bg-gray-800/20">
                                      <Td className="pl-7 text-gray-400 text-[11px]">{idx + 1}.{subIdx + 1}</Td>
                                      <Td className="font-medium text-gray-600 dark:text-gray-300 text-xs">
                                        {sub.description}
                                        {subDone && <span className="ml-1.5 text-emerald-600 text-[10px] font-bold">✓</span>}
                                      </Td>
                                      <Td className="text-gray-500 dark:text-gray-400 text-[11px]">{sub.unit}</Td>
                                      <Td className="font-mono text-[11px]">{fmtN(sub.plannedQty)}</Td>
                                      <Td className={`font-mono text-[11px] ${sub.completedQty > 0 ? "text-emerald-600" : "text-gray-400"}`}>{fmtN(sub.completedQty)}</Td>
                                      {/* Billing tracks at the item level (its completedQty rolls up from all
                                          particulars), not per particular — shown blank here on purpose. */}
                                      <Td className="text-[11px] text-gray-400">—</Td>
                                      <Td className={`font-mono text-[11px] ${subRem > 0 ? "text-gray-600 dark:text-gray-300" : "text-emerald-600"}`}>
                                        {subRem > 0 ? fmtN(subRem) : "✓ Done"}
                                      </Td>
                                      <Td className="min-w-[110px]">
                                        <div className="flex items-center gap-1.5">
                                          <div className="flex-1 h-[5px] bg-gray-100 dark:bg-gray-700/40 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${subDone ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${sp}%` }} />
                                          </div>
                                          <span className={`text-[9.5px] font-bold min-w-[26px] ${subDone ? "text-emerald-600" : "text-primary"}`}>{sp}%</span>
                                        </div>
                                      </Td>
                                      <Td>
                                        <NxBtn color="primary" label="+ Progress" onClick={() => openAddProgress(woSum._id, si, sub)} />
                                      </Td>
                                    </Tr>
                                  );
                                })}
                              </Fragment>
                            );
                          })}
                        </Tbody>
                      </Table>
                    )}

                    {/* Recent entries for this WO */}
                    {detail && (() => {
                      const allEntriesWO: EntryRow[] = detail.scopeItems.flatMap(si =>
                        (si.progressEntries ?? []).map(pe => ({
                          ...pe, unit: si.unit, description: si.description,
                          scopeId: `${si._id}||${detail._id}`,
                          scopePlanned: si.plannedQty, scopeCompleted: si.completedQty, scopeLastBilled: si.lastBilledQty || 0,
                        }))
                      ).sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
                      const entries = allEntriesWO.slice(0, 5);

                      if (!entries.length) return null;
                      return (
                        <div className="px-5 pt-2.5 pb-3.5 border-t border-gray-200 dark:border-gray-700/40">
                          <div className="flex justify-between items-center mb-2">
                            <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                              Recent Entries (last 5)
                            </div>
                            {allEntriesWO.length > 5 && (
                              <button type="button" className="text-[11px] font-semibold text-primary hover:underline" onClick={() => setAllEntriesWOId(detail._id)}>
                                View All ({allEntriesWO.length})
                              </button>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {entries.map((e, i) => (
                              <div key={e._id + i} className="flex gap-3 items-center text-xs" style={{ opacity: e.invalidated?.done ? 0.55 : 1 }}>
                                <span className="text-gray-400 min-w-[90px] whitespace-nowrap flex items-center gap-1">
                                  {dayjs(e.date).format("DD MMM")}
                                  {dayjs(e.date).format("YYYY-MM-DD") === todayStr && <NxBadge color="blue">Today</NxBadge>}
                                </span>
                                <span className={`font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] flex-1 ${e.invalidated?.done ? "line-through" : ""}`}>
                                  {e.description}
                                  {personName(e.enteredBy) && <span className="font-normal text-gray-400 text-[11px]"> · {personName(e.enteredBy)}</span>}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">{formatLocation(e, selProjectType)}</span>
                                <span className="text-emerald-600 font-bold font-mono min-w-[60px]">+{fmtN(e.qtyAdded)} {e.unit}</span>
                                <EntryActions
                                  e={e} deleting={deleting === e._id}
                                  onEdit={() => {
                                    setEditEntry(e);
                                    editErrors.clearAll();
                                    setEditFormValues({
                                      date: e.date ? dayjs(e.date).format("YYYY-MM-DD") : "",
                                      qtyAdded: String(e.qtyAdded ?? ""),
                                      remarks: e.remarks || "",
                                      tower: e.tower || "", floor: e.floor || "", flatNo: e.flatNo || "",
                                      plotNo: e.plotNo || "", locationNote: e.locationNote || "", plannedQty: "",
                                    });
                                    setProgWOId(detail._id);
                                    setEditModal(true);
                                  }}
                                  onDelete={() => handleDeleteEntry(e, detail._id)}
                                  onInvalidate={() => {
                                    setInvalidateEntry(e);
                                    setInvalidateWOId(detail._id);
                                    invalidateErrors.clearAll();
                                    setInvalidateReason("");
                                    setInvalidateModal(true);
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Bill History ────────────────────────────────────────────────────── */}
      {projectBillReqs.length > 0 && (
        <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-hidden mt-6">
          <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700/40 flex justify-between items-center">
            <div className="font-bold text-[15px] text-[#1A1A2E] dark:text-[#F1F5F9]">Billing History — {selProjectName}</div>
            <div className="text-xs text-gray-400">{projectBillReqs.length} request{projectBillReqs.length !== 1 ? "s" : ""}</div>
          </div>
          {billHistory.map((group, gi) => {
            const isBatch = group.type === "batch";
            const firstBR = group.items[0];
            const statusCounts = { pending: 0, approved: 0, rejected: 0 };
            group.items.forEach(br => { if (br.status in statusCounts) (statusCounts as any)[br.status]++; });
            const overallStatus = statusCounts.rejected > 0 ? "rejected" : statusCounts.pending > 0 ? "pending" : "approved";
            const boxCls = STAGE_BOX_CLS[overallStatus] ?? "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/40";
            const textCls = STAGE_TEXT_CLS[overallStatus] ?? "text-gray-500 dark:text-gray-400";

            return (
              <div key={gi} className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/40">
                <div className="flex gap-3 items-start">
                  {isBatch ? (
                    <div className="rounded-lg border-2 border-primary bg-primary/5 px-3 py-2 min-w-[60px] text-center shrink-0">
                      <div className="text-sm">📦</div>
                      <div className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">Batch</div>
                      <div className="text-[13px] font-extrabold text-primary">{group.items.length}</div>
                    </div>
                  ) : (
                    <div className={`rounded-lg text-center shrink-0 border-2 px-3 py-2 min-w-[60px] ${boxCls}`}>
                      <div className="text-[9px] font-bold text-gray-400 uppercase">Stage</div>
                      <div className={`text-lg font-extrabold ${textCls}`}>{firstBR.stageNo ?? 1}</div>
                    </div>
                  )}

                  <div className="flex-1">
                    <div className="flex gap-2 items-center mb-1 flex-wrap">
                      {isBatch ? (
                        <span className="font-bold text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9]">
                          {group.items.map(b => b.reqNo).join(", ")}
                        </span>
                      ) : (
                        <span className="font-bold text-[13px] text-[#1A1A2E] dark:text-[#F1F5F9]">{firstBR.reqNo}</span>
                      )}
                      <NxBadge color={BR_STATUS_NX_COLOR[overallStatus] ?? "gray"}>{BR_STATUS_LABEL[overallStatus] ?? overallStatus}</NxBadge>
                    </div>

                    {isBatch && (
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        {group.items.map(br => (
                          <span key={br._id} className="bg-gray-100 dark:bg-gray-800/40 px-2 py-0.5 rounded-md text-[11px] text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700/40">
                            {br.vendorName ?? br.workOrderNo ?? br.reqNo}{" "}
                            <span className="font-bold" style={{ color: BR_STATUS_COLOR[br.status] ?? "#9CA3AF" }}>
                              {br.status === "approved" ? "✅" : br.status === "rejected" ? "❌" : "⏳"}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="text-[11px] text-gray-400">
                      {firstBR.vendorName && <span>{firstBR.vendorName} · </span>}
                      {dayjs(firstBR.createdAt).format("DD MMM YYYY")}
                      {firstBR.periodFrom && ` · Period: ${dayjs(firstBR.periodFrom).format("DD MMM")} → ${dayjs(firstBR.periodTo ?? firstBR.createdAt).format("DD MMM")}`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Progress Modal ─────────────────────────────────────────────── */}
      {progModal && (
        <Modal
          title={progSubItem ? `Add Progress — ${progItem?.description} › ${progSubItem.description}` : `Add Progress — ${progItem?.description}`}
          onClose={() => { setProgModal(false); setProgSubItem(null); setProgFormValues(emptyProgForm); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setProgModal(false); setProgSubItem(null); setProgFormValues(emptyProgForm); }} />
              <Btn color="primary" label="Save Progress" loading={saving} onClick={handleAddProgress} />
            </div>
          }
        >
          {progModalTarget?.remarks && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-2.5 mb-3.5 text-xs text-amber-800 dark:text-amber-300">
              <span className="font-bold">📌 Instruction: </span>{progModalTarget.remarks}
            </div>
          )}
          <div className="mb-3.5">
            <DatePicker label="Date" value={progFormValues.date} onChange={(v) => setProgFormValues(prev => ({ ...prev, date: v }))} max={dayjs().format("YYYY-MM-DD")} />
            {progErrors.errors.date && <span className="block text-xs text-red-500 mt-1">{progErrors.errors.date}</span>}
          </div>
          <LocationFields
            pt={progProjectType}
            tower={progFormValues.tower} floor={progFormValues.floor} flatNo={progFormValues.flatNo}
            plotNo={progFormValues.plotNo} locationNote={progFormValues.locationNote}
            onChange={(field, value) => setProgFormValues(prev => ({ ...prev, [field]: value }))}
          />
          {progModalTarget && !progModalTarget.plannedQty && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 mb-3.5">
              <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1.5">Planned quantity not set for this item</div>
              <div className="text-[11px] text-amber-600/80 dark:text-amber-300/70 mb-2.5">You can set the total planned quantity now, or leave blank to log progress without a cap.</div>
              <Field
                label={`Total Planned Qty (${progModalTarget.unit})`} type="number" min="0.00001" step="0.00001"
                placeholder={progModalTarget.unit === "per-hr" ? "e.g. 200.0000" : "e.g. 5000"}
                value={progFormValues.plannedQty} onChange={(e) => setProgFormValues(prev => ({ ...prev, plannedQty: e.target.value }))}
              />
            </div>
          )}
          <Field
            label={`Quantity Added (${progModalTarget?.unit ?? ""})`} type="number" min="0.00001" step="0.00001"
            hint={progModalTarget?.unit === "per-hr" ? "Tip: enter decimals for minutes — e.g. 13.67 = 13 hr 40 min" : "Progress can exceed the planned qty (e.g. a correction, or ground reality running over) — AGM/GM sign off on the overage before it's billed."}
            placeholder={progModalTarget?.unit === "per-hr" ? "e.g. 13.6667" : "e.g. 500"}
            value={progFormValues.qtyAdded} onChange={(e) => setProgFormValues(prev => ({ ...prev, qtyAdded: e.target.value }))}
            error={progErrors.errors.qtyAdded}
          />
          <div className="mt-3.5">
            <RemarksListInput value={progFormValues.remarks} onChange={(v) => setProgFormValues(prev => ({ ...prev, remarks: v }))} />
          </div>
          {progModalTarget && (
            <div className="mt-3.5 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/40 rounded-lg p-3 text-xs">
              {[
                { label: "Planned",   value: progModalTarget.plannedQty > 0 ? `${fmtN(progModalTarget.plannedQty)} ${progModalTarget.unit}` : "Not set", color: progModalTarget.plannedQty > 0 ? "text-[#1A1A2E] dark:text-[#F1F5F9]" : "text-gray-400" },
                { label: "Done",      value: `${fmtN(progModalTarget.completedQty)} ${progModalTarget.unit}`, color: "text-emerald-600" },
                { label: "Remaining", value: progModalTarget.plannedQty > 0 ? `${fmtN(Math.max(0, progModalTarget.plannedQty - (progModalTarget.completedQty ?? 0)))} ${progModalTarget.unit}` : "Unlimited", color: "text-primary" },
              ].map(r => (
                <div key={r.label} className="flex justify-between mb-1">
                  <span className="text-gray-500 dark:text-gray-400">{r.label}</span><strong className={r.color}>{r.value}</strong>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* ── Edit Entry Modal ───────────────────────────────────────────────── */}
      {editModal && (
        <Modal
          title="Edit Progress Entry"
          onClose={() => { setEditModal(false); setEditFormValues(emptyProgForm); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setEditModal(false); setEditFormValues(emptyProgForm); }} />
              <Btn color="primary" label="Save Changes" loading={saving} onClick={handleEditEntry} />
            </div>
          }
        >
          <DatePicker label="Date" value={editFormValues.date} onChange={(v) => setEditFormValues(prev => ({ ...prev, date: v }))} max={dayjs().format("YYYY-MM-DD")} />
          <div className="mt-3.5">
            <LocationFields
              pt={progProjectType}
              tower={editFormValues.tower} floor={editFormValues.floor} flatNo={editFormValues.flatNo}
              plotNo={editFormValues.plotNo} locationNote={editFormValues.locationNote}
              onChange={(field, value) => setEditFormValues(prev => ({ ...prev, [field]: value }))}
            />
          </div>
          <Field
            label="Quantity Added" type="number" min="0.00001" step="0.00001" placeholder="e.g. 13.6667"
            value={editFormValues.qtyAdded} onChange={(e) => setEditFormValues(prev => ({ ...prev, qtyAdded: e.target.value }))}
            error={editErrors.errors.qtyAdded}
          />
          <div className="mt-3.5">
            <Field textarea label="Remarks (optional)" value={editFormValues.remarks} onChange={(e) => setEditFormValues(prev => ({ ...prev, remarks: e.target.value }))} />
          </div>
        </Modal>
      )}

      {/* ── Invalidate Entry Modal ─────────────────────────────────────────── */}
      {invalidateModal && (
        <Modal
          title="Invalidate Progress Entry"
          onClose={() => { setInvalidateModal(false); setInvalidateReason(""); }}
          footer={
            <div className="flex justify-end gap-2">
              <Btn outline label="Cancel" onClick={() => { setInvalidateModal(false); setInvalidateReason(""); }} />
              <Btn color="red" label="Invalidate" loading={invalidating} onClick={handleInvalidateEntry} />
            </div>
          }
        >
          <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3.5 py-2.5 mb-3.5 text-xs text-red-800 dark:text-red-300">
            This entry stays visible in history (who logged it, when, why it was invalidated) but no longer
            counts toward progress or future billing. Log the correct progress as a fresh entry afterwards.
          </div>
          {invalidateEntry && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-3.5">
              <strong className="text-[#1A1A2E] dark:text-[#F1F5F9]">{invalidateEntry.description}</strong> · +{fmtN(invalidateEntry.qtyAdded)} {invalidateEntry.unit} · {dayjs(invalidateEntry.date).format("DD MMM YYYY")}
            </div>
          )}
          <Field
            textarea label="Reason" required placeholder="e.g. Measurement was wrong, double-counted, wrong item…"
            value={invalidateReason} onChange={(e) => setInvalidateReason(e.target.value)}
            error={invalidateErrors.errors.reason}
          />
        </Modal>
      )}

      {/* ── View All Entries Modal ───────────────────────────────────────────── */}
      {allEntriesWOId && (() => {
        const detail = woDetails.get(allEntriesWOId);
        const allEntriesWO: EntryRow[] = detail
          ? detail.scopeItems.flatMap(si =>
              (si.progressEntries ?? []).map(pe => ({
                ...pe, unit: si.unit, description: si.description,
                scopeId: `${si._id}||${detail._id}`,
                scopePlanned: si.plannedQty, scopeCompleted: si.completedQty, scopeLastBilled: si.lastBilledQty || 0,
              }))
            ).sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf())
          : [];

        return (
          <Modal title="All Progress Entries" extraWide onClose={() => setAllEntriesWOId(null)}>
            <div className="max-h-[60vh] overflow-y-auto pr-2">
              {!detail ? (
                <div className="text-center text-gray-400 py-10 text-sm">No data available.</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {allEntriesWO.map((e, i) => (
                    <div key={e._id + i} className="flex gap-3 items-center text-xs py-2 border-b border-gray-100 dark:border-gray-700/40" style={{ opacity: e.invalidated?.done ? 0.55 : 1 }}>
                      <span className="text-gray-400 min-w-[90px] whitespace-nowrap flex items-center gap-1">
                        {dayjs(e.date).format("DD MMM")}
                        {dayjs(e.date).format("YYYY-MM-DD") === todayStr && <UIBadge color="blue" small>Today</UIBadge>}
                      </span>
                      <span className={`font-semibold text-[#1A1A2E] dark:text-[#F1F5F9] flex-1 ${e.invalidated?.done ? "line-through" : ""}`}>
                        {e.description}
                        {personName(e.enteredBy) && <span className="font-normal text-gray-400 text-[11px]"> · {personName(e.enteredBy)}</span>}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 min-w-[80px]">{formatLocation(e, selProjectType)}</span>
                      <span className="text-emerald-600 font-bold font-mono min-w-[60px]">+{fmtN(e.qtyAdded)} {e.unit}</span>
                      <EntryActions
                        e={e} deleting={deleting === e._id}
                        onEdit={() => {
                          setEditEntry(e);
                          editErrors.clearAll();
                          setEditFormValues({
                            date: e.date ? dayjs(e.date).format("YYYY-MM-DD") : "",
                            qtyAdded: String(e.qtyAdded ?? ""),
                            remarks: e.remarks || "",
                            tower: e.tower || "", floor: e.floor || "", flatNo: e.flatNo || "",
                            plotNo: e.plotNo || "", locationNote: e.locationNote || "", plannedQty: "",
                          });
                          setProgWOId(detail._id);
                          setEditModal(true);
                        }}
                        onDelete={() => handleDeleteEntry(e, detail._id)}
                        onInvalidate={() => {
                          setInvalidateEntry(e);
                          setInvalidateWOId(detail._id);
                          invalidateErrors.clearAll();
                          setInvalidateReason("");
                          setInvalidateModal(true);
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────
export default function WorkProgress() {
  const { user } = useAuth();
  return user?.role === "site-dri" ? <DRIDashboard /> : <WorkProgressAdmin />;
}
