import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Eye, FileText } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import DailyProjectReportSections from "../../components/DailyProjectReportSections";
import { isAlert, firstMissingDprField } from "../../shared/constants/dprOptions";
import type { DprFormValues } from "../../shared/constants/dprOptions";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import NxBtn from "../../ui/nexora/Btn";
import Card from "../../ui/Card";
import NxBadge from "../../ui/nexora/Badge";
import SField from "../../ui/SField";
import { DatePicker } from "../../ui/DatePicker";
import Modal from "../../ui/Modal";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import { SkeletonTable } from "../../ui/Skeleton";

interface ProjectOption { _id: string; name: string; }

interface DprRow extends DprFormValues {
  _id: string;
  createdAt: string;
}

const ALERT_FIELDS: { key: keyof DprFormValues; label: string }[] = [
  { key: "workDelayed",       label: "Delay" },
  { key: "labourShort",       label: "Labour" },
  { key: "materialShort",     label: "Material" },
  { key: "drawingPending",    label: "Drawing" },
  { key: "challengeBlocking", label: "Challenge" },
  { key: "escalationRequired",label: "Escalation" },
];

const emptyForm: { projectId: string; date: string } & Partial<DprFormValues> = {
  projectId: "", date: dayjs().format("YYYY-MM-DD"),
};

function DetailRow({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-2 border-b border-gray-100 dark:border-gray-700/40 last:border-b-0">
      <span className="w-44 shrink-0 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">{value}</span>
    </div>
  );
}

export default function DailyProjectReport() {
  const { user } = useAuth();

  const [projects, setProjects]   = useState<ProjectOption[]>([]);
  const [reports, setReports]     = useState<DprRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [viewReport, setViewReport] = useState<DprRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const pager = usePagination(reports, 10);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get("/projects"),
      apiClient.get("/daily-reports"),
    ]).then(([p, r]) => {
      setProjects(p.data.projects || []);
      setReports(r.data.reports || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function onSubmit() {
    if (!form.projectId) return toast.error("Select a project");
    if (!form.date) return toast.error("Select a date");
    const missing = firstMissingDprField(form);
    if (missing) return toast.error(`Select ${missing}`);

    setSubmitting(true);
    try {
      await apiClient.post("/daily-reports", {
        ...form,
        driName: user?.name,
        date: dayjs(form.date).toISOString(),
      });
      toast.success("Daily Project Report submitted");
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

  return (
    <div>
      <PageHeader
        title="Daily Project Report"
        subtitle="Log your end-of-day site report — work progress, labour/material/drawing alerts, and anything that needs escalation."
        icon={FileText}
        actions={<NxBtn color="primary" label="New Report" icon={Plus} onClick={() => { setForm(emptyForm); setShowForm(true); }} />}
      />

      <Card padded={false} className="overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/40 font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">
          My Recent Reports
        </div>
        {loading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={4} /></div>
        ) : reports.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No reports submitted yet</div>
        ) : (
          <>
            <Table>
              <Thead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Project</Th>
                  <Th>Alerts</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {pager.pageItems.map(r => (
                  <Tr key={r._id}>
                    <Td><TdText>{dayjs(r.date).format("DD MMM YYYY")}</TdText></Td>
                    <Td><TdText>{r.projectName}</TdText></Td>
                    <Td>
                      <div className="flex gap-1 flex-wrap">
                        {ALERT_FIELDS.filter(f => isAlert(r[f.key] as string)).map(f => (
                          <NxBadge key={f.key} color={f.key === "escalationRequired" ? "red" : "orange"}>{f.label}</NxBadge>
                        ))}
                        {ALERT_FIELDS.every(f => !isAlert(r[f.key] as string)) && <NxBadge color="green">All clear</NxBadge>}
                      </div>
                    </Td>
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

      {showForm && (
        <Modal
          title="New Daily Project Report" extraWide onClose={() => setShowForm(false)}
          footer={<Btn label="Submit Report" style={{ background: "#4f46e5", borderColor: "#4f46e5" }} className="w-full" loading={submitting} onClick={onSubmit} />}
        >
          <Card className="mb-5 flex flex-col gap-4">
            <SField
              label="Project" required placeholder="Choose"
              value={form.projectId || null}
              onChange={v => setForm(f => ({ ...f, projectId: v }))}
              options={projects.map(p => ({ label: p.name, value: p._id }))}
            />
            <DatePicker
              label="Date" value={form.date}
              onChange={v => setForm(f => ({ ...f, date: v }))}
              max={dayjs().format("YYYY-MM-DD")}
            />
          </Card>

          <DailyProjectReportSections values={form} onChange={patch => setForm(f => ({ ...f, ...patch }))} />
        </Modal>
      )}

      {viewReport && (
        <Modal title={`DPR — ${viewReport.projectName ?? ""}`} onClose={() => setViewReport(null)}>
          <Card padded={false} className="px-4">
            <DetailRow label="Date" value={dayjs(viewReport.date).format("DD MMM YYYY")} />
            <DetailRow label="DRI" value={viewReport.driName} />
            <DetailRow label="Tomorrow's Plan" value={viewReport.tomorrowsPlan} />
            <DetailRow label="Work Delayed" value={viewReport.workDelayed} />
            <DetailRow label="Labour Short" value={viewReport.labourShort} />
            <DetailRow label="Additional Labour Needed" value={viewReport.additionalLabourNeeded} />
            <DetailRow label="Labour Impact" value={viewReport.labourShortageImpact} />
            <DetailRow label="Material Short" value={viewReport.materialShort} />
            <DetailRow label="Material Runs Out In" value={viewReport.materialRunOutDays} />
            <DetailRow label="Material Received On Time" value={viewReport.materialReceivedOnTime} />
            <DetailRow label="Material Impact" value={viewReport.materialShortageImpact} />
            <DetailRow label="Drawing Pending" value={viewReport.drawingPending} />
            <DetailRow label="Drawing Reference" value={viewReport.drawingReference} />
            <DetailRow label="Pending Since" value={viewReport.drawingPendingDays} />
            <DetailRow label="Blocked Activity" value={viewReport.drawingBlockedActivity} />
            <DetailRow label="Challenge" value={viewReport.challengeBlocking} />
            <DetailRow label="Challenge Details" value={viewReport.challengeDescription} />
            <DetailRow label="Escalation Required" value={viewReport.escalationRequired} />
            <DetailRow label="Escalation Action" value={viewReport.escalationAction} />
          </Card>
        </Modal>
      )}
    </div>
  );
}
