import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Eye, ClipboardList } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import WorkCategoryChecklist from "../../components/WorkCategoryChecklist";
import DrawingRequestButton from "../../components/DrawingRequestButton";
import { firstMissingProgressField, MIN_IMAGES_PER_CATEGORY, MIN_BEFORE_AFTER_IMAGES } from "../../shared/constants/dailyProgressReportOptions";
import type { DailyProgressReportFormValues, WorkEntry } from "../../shared/constants/dailyProgressReportOptions";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import Card from "../../ui/Card";
import Badge from "../../ui/Badge";
import SField from "../../ui/SField";
import { DatePicker } from "../../ui/DatePicker";
import Field from "../../ui/Field";
import Modal from "../../ui/Modal";
import { SectionHeading } from "../../ui/Descriptions";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import { SkeletonTable } from "../../ui/Skeleton";

interface ProjectOption { _id: string; name: string; }
interface ContractorOption { vendorCode: string; companyName: string; }
interface DriOption { _id: string; name: string; }

interface ProgressReportRow extends DailyProgressReportFormValues {
  _id: string;
  createdAt: string;
}

const emptyForm: DailyProgressReportFormValues = {
  projectId: "", driName: "", date: dayjs().format("YYYY-MM-DD"), vendorCode: "",
  shiftType: "", labourCount: "", workEntries: [],
};

export default function DailyProgressReport() {
  const { user } = useAuth();

  const [projects, setProjects]       = useState<ProjectOption[]>([]);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [driUsers, setDriUsers]       = useState<DriOption[]>([]);
  const [reports, setReports]         = useState<ProgressReportRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [viewReport, setViewReport]   = useState<ProgressReportRow | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get("/projects"),
      apiClient.get("/contractors"),
      apiClient.get("/auth/users", { params: { role: "site-dri" } }),
      apiClient.get("/daily-progress-reports"),
    ]).then(([p, c, u, r]) => {
      setProjects(p.data.projects || []);
      setContractors(c.data.contractors || []);
      setDriUsers(u.data.users || []);
      setReports(r.data.reports || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

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
    const missingBefore = form.workEntries.find(e => e.beforeImages.length < MIN_BEFORE_AFTER_IMAGES);
    if (missingBefore) return toast.error(`"${missingBefore.workType}" needs a before photo`);
    const missingAfter = form.workEntries.find(e => e.afterImages.length < MIN_BEFORE_AFTER_IMAGES);
    if (missingAfter) return toast.error(`"${missingAfter.workType}" needs an after photo`);

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

  return (
    <div>
      <PageHeader
        title="Daily Progress Report"
        subtitle="End-of-day site report — work progress by category with photo evidence, plus today's labour count."
        icon={ClipboardList}
        actions={
          <>
            <DrawingRequestButton projectId={form.projectId} projectOptions={projectOptions} driName={form.driName} />
            <Btn label="New Report" icon={Plus} color="primary" onClick={openNew} />
          </>
        }
      />

      <Card padded={false} className="overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/40 font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">
          Recent Reports
        </div>
        {loading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={7} /></div>
        ) : reports.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No reports submitted yet</div>
        ) : (
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
              {reports.map(r => (
                <Tr key={r._id}>
                  <Td><TdText>{dayjs(r.date).format("DD MMM YYYY")}</TdText></Td>
                  <Td><TdText>{r.projectName}</TdText></Td>
                  <Td><TdText>{r.vendorName}</TdText></Td>
                  <Td><TdText>{r.driName}</TdText></Td>
                  <Td><TdText>{r.shiftType}</TdText></Td>
                  <Td className="text-right"><TdText>{r.labourCount}</TdText></Td>
                  <Td><Badge color="blue" small>{r.workEntries.length} categor{r.workEntries.length === 1 ? "y" : "ies"}</Badge></Td>
                  <Td><Btn small outline icon={Eye} onClick={() => setViewReport(r)} /></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

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
