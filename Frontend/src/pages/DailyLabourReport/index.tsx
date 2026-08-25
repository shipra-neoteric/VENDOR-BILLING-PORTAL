import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, HardHat } from "lucide-react";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import { WORK_TYPE_OPTIONS, SHIFT_TYPE_OPTIONS } from "../../shared/constants/labourReportOptions";
import type { LabourReportFormValues } from "../../shared/constants/labourReportOptions";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import NxBtn from "../../ui/nexora/Btn";
import Card from "../../ui/Card";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import { DatePicker } from "../../ui/DatePicker";
import Modal from "../../ui/Modal";
import { Table, Thead, Tbody, Tr, Th, Td, TdText } from "../../ui/Table";
import { usePagination } from "../../ui/usePagination";
import Pagination from "../../ui/Pagination";
import { SkeletonTable } from "../../ui/Skeleton";

interface ProjectOption { _id: string; name: string; }
interface ContractorOption { vendorCode: string; companyName: string; vendorId?: string; name?: string; shortCode?: string; }

interface LabourReportRow extends LabourReportFormValues {
  _id: string;
  vendorName: string;
  projectName: string;
  date: string;
}

const emptyForm = { vendorCode: "", projectId: "", date: dayjs().format("YYYY-MM-DD"), workType: "", shiftType: "", labourCount: "" };

export default function DailyLabourReport() {
  const [projects, setProjects]       = useState<ProjectOption[]>([]);
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [reports, setReports]         = useState<LabourReportRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [form, setForm] = useState(emptyForm);
  const pager = usePagination(reports, 10);

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.get("/projects"),
      apiClient.get("/contractors"),
      apiClient.get("/daily-labour-reports"),
    ]).then(([p, c, r]) => {
      setProjects(p.data.projects || []);
      setContractors(c.data.contractors || []);
      setReports(r.data.reports || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function onSubmit() {
    if (!form.vendorCode) return toast.error("Select a contractor");
    if (!form.projectId) return toast.error("Select a location");
    if (!form.date) return toast.error("Select a date");
    if (!form.workType) return toast.error("Select a work type");
    if (!form.shiftType) return toast.error("Select a shift");
    if (form.labourCount === "" || Number(form.labourCount) < 0) return toast.error("Enter number of labourers");

    setSubmitting(true);
    try {
      await apiClient.post("/daily-labour-reports", {
        ...form,
        labourCount: Number(form.labourCount),
        date: dayjs(form.date).toISOString(),
      });
      toast.success("Daily Labour Report submitted");
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
        title="Daily Contractor / Labour Report"
        subtitle="Log today's on-site labour count per contractor, work type, and shift."
        icon={HardHat}
        actions={<NxBtn color="primary" label="New Report" icon={Plus} onClick={() => { setForm(emptyForm); setShowForm(true); }} />}
      />

      <Card padded={false} className="overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/40 font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9]">
          Recent Labour Reports
        </div>
        {loading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={6} /></div>
        ) : reports.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No reports submitted yet</div>
        ) : (
          <>
            <Table>
              <Thead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Contractor</Th>
                  <Th>Location</Th>
                  <Th>Work Type</Th>
                  <Th>Shift</Th>
                  <Th className="text-right">Labourers</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pager.pageItems.map(r => (
                  <Tr key={r._id}>
                    <Td><TdText>{dayjs(r.date).format("DD MMM YYYY")}</TdText></Td>
                    <Td><TdText>{r.vendorName}</TdText></Td>
                    <Td><TdText>{r.projectName}</TdText></Td>
                    <Td><TdText>{r.workType}</TdText></Td>
                    <Td><TdText>{r.shiftType}</TdText></Td>
                    <Td className="text-right"><TdText>{r.labourCount}</TdText></Td>
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
          title="New Daily Labour Report" onClose={() => setShowForm(false)}
          footer={<Btn label="Submit Report" style={{ background: "#0d9488", borderColor: "#0d9488" }} className="w-full" loading={submitting} onClick={onSubmit} />}
        >
          <div className="flex flex-col gap-4">
            <SField
              label="Contractor Name" required placeholder="Choose"
              value={form.vendorCode || null}
              onChange={v => setForm(f => ({ ...f, vendorCode: v }))}
              options={contractors.map(c => ({
                label: c.companyName || c.name || "",
                value: c.vendorCode || c.vendorId || "",
                vendorId: c.vendorId || c.vendorCode || "",
                name: c.name || c.companyName || "",
                searchText: `${c.companyName || c.name || ""} ${c.vendorCode || ""} ${c.vendorId || ""}`.trim(),
              }))}
              filterFn={(opt, search) => {
                const s = search.toLowerCase().trim();
                const contractorName = (opt.name || opt.label || "").toLowerCase();
                const vendorId = (opt.vendorId || opt.vendorCode || opt.value || "").toLowerCase();
                return contractorName.includes(s) || vendorId.includes(s);
              }}
            />
            <SField
              label="Location" required placeholder="Choose"
              value={form.projectId || null}
              onChange={v => setForm(f => ({ ...f, projectId: v }))}
              options={projects.map(p => ({ label: p.name, value: p._id }))}
            />
            <DatePicker
              label="Date" value={form.date}
              onChange={v => setForm(f => ({ ...f, date: v }))}
              max={dayjs().format("YYYY-MM-DD")}
            />
            <SField
              label="कार्य प्रकार (Work Type)" required placeholder="Choose"
              value={form.workType || null}
              onChange={v => setForm(f => ({ ...f, workType: v }))}
              options={WORK_TYPE_OPTIONS.map(w => ({ label: w, value: w }))}
            />
            <SField
              label="Shift Type" required placeholder="Choose"
              value={form.shiftType || null}
              onChange={v => setForm(f => ({ ...f, shiftType: v }))}
              options={SHIFT_TYPE_OPTIONS.map(s => ({ label: s, value: s }))}
            />
            <Field
              label="श्रमिक संख्या (Number of Labourers)" required type="number" min={0}
              placeholder="e.g. 12"
              value={form.labourCount}
              onChange={e => setForm(f => ({ ...f, labourCount: e.target.value }))}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
