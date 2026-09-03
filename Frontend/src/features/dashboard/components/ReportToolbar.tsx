import { useEffect, useRef, useState } from "react";
import { Button, Tooltip, Modal, Input, TimePicker, message, List, Popconfirm, Empty } from "antd";
import { ChevronDown } from "lucide-react";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import type { DPRReport } from "../../../types/DPR";
import { downloadDPRCsv } from "../utils/dprExport";
import { formatDprDateRange } from "../utils/dprDateRange";
import { useReportSchedules } from "../hooks/useReportSchedules";
import Btn from "../../../ui/Btn";

type ViewType = "operational" | "financial";

function reportSummaryFields(report: DPRReport, viewType: ViewType, projectLabel: string) {
  const recordCount = report.operational.projectPerformance.length + report.financial.aging.table.length + report.operational.siteProgressToday.length;
  const label = viewType === "operational" ? "Operational" : "Financial";
  return [
    { label: "Report", value: label },
    { label: "Project", value: projectLabel },
    { label: report.meta.isSingleDay ? "Date" : "Period", value: formatDprDateRange(report.meta) },
    { label: "Generated", value: dayjs(report.meta.generatedAt).format("h:mm A") },
    { label: "Records", value: String(recordCount) },
  ];
}

export function ReportSummaryHeader({ report, viewType, projectLabel }: { report: DPRReport; viewType: ViewType; projectLabel: string }) {
  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 12.5, color: "#6B7280", marginBottom: 4 }}>
      {reportSummaryFields(report, viewType, projectLabel).map(f => (
        <span key={f.label}>{f.label}: <strong style={{ color: "#374151" }}>{f.value}</strong></span>
      ))}
    </div>
  );
}

export function ReportToolbar({ report, viewType, projectLabel, projectId }: { report: DPRReport; viewType: ViewType; projectLabel: string; projectId: string }) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | "pdf" | "excel">(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTime, setScheduleTime] = useState<Dayjs | null>(dayjs("09:00", "HH:mm"));
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const { schedules, create, remove } = useReportSchedules();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function confirmDownload() {
    if (confirmAction === "pdf") {
      setPdfLoading(true);
      try {
        const { downloadDPRPDF } = await import("../../../components/DPRPDFReport");
        await downloadDPRPDF(viewType, report, projectLabel);
      } catch {
        message.error("Failed to generate PDF");
      } finally {
        setPdfLoading(false);
      }
    } else if (confirmAction === "excel") {
      downloadDPRCsv(viewType, report, projectLabel);
    }
    setConfirmAction(null);
  }

  return (
    <div ref={menuRef} style={{ position: "relative", display: "inline-block" }}>
      <Btn color="primary" onClick={() => setMenuOpen(o => !o)}>
        Actions
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
      </Btn>

      {menuOpen && (
        <div
          className="absolute right-0 z-50 mt-1.5 min-w-[200px] rounded-xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-[#1E293B] shadow-xl p-2 flex flex-col gap-1"
        >
          <Button block icon={<span>📄</span>} onClick={() => { setMenuOpen(false); setConfirmAction("pdf"); }}>Download PDF</Button>
          <Button block icon={<span>📊</span>} onClick={() => { setMenuOpen(false); setConfirmAction("excel"); }}>Export Excel</Button>
          <Tooltip title="Prints the current page as shown">
            <Button block icon={<span>🖨</span>} onClick={() => { setMenuOpen(false); window.print(); }}>Print</Button>
          </Tooltip>
          <Button block icon={<span>📅</span>} onClick={() => { setMenuOpen(false); setScheduleOpen(true); }}>Schedule Report</Button>
          <Button block icon={<span>📧</span>} onClick={() => { setMenuOpen(false); setEmailOpen(true); }}>Email</Button>
        </div>
      )}

      <Modal
        open={!!confirmAction} onCancel={() => setConfirmAction(null)} onOk={confirmDownload}
        confirmLoading={pdfLoading} okText={confirmAction === "pdf" ? "Download PDF" : "Download Excel"}
        title="Confirm Report Download"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 }}>
          {reportSummaryFields(report, viewType, projectLabel).map(f => (
            <div key={f.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "#6B7280" }}>{f.label}</span>
              <span style={{ fontWeight: 600, color: "#374151" }}>{f.value}</span>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={scheduleOpen} onCancel={() => setScheduleOpen(false)} footer={null} title="Schedule Report"
      >
        <p style={{ color: "#6B7280", fontSize: 13, marginBottom: 14 }}>
          Get an in-app reminder each day once the report is ready. There's no email service connected
          yet, so this won't send anything by mail — it surfaces a notification here when you're back
          in the app after the chosen time.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
          <TimePicker value={scheduleTime} onChange={setScheduleTime} format="HH:mm" minuteStep={15} style={{ flex: 1 }} />
          <Button
            type="primary"
            onClick={() => {
              if (!scheduleTime) return;
              create.mutate({
                viewType,
                projectId: projectId === "all" ? null : projectId,
                projectName: projectLabel,
                timeOfDay: scheduleTime.format("HH:mm"),
              }, {
                onSuccess: () => message.success(`Scheduled — ${viewType} report for ${projectLabel} daily at ${scheduleTime.format("HH:mm")}`),
                onError: () => message.error("Failed to create schedule"),
              });
            }}
            loading={create.isPending}
          >
            Add Schedule
          </Button>
        </div>
        {schedules.length === 0 ? (
          <Empty description="No schedules yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            size="small"
            dataSource={schedules}
            renderItem={s => (
              <List.Item
                actions={[
                  <Popconfirm key="del" title="Remove this schedule?" onConfirm={() => remove.mutate(s._id)}>
                    <Button type="text" danger size="small">Remove</Button>
                  </Popconfirm>,
                ]}
              >
                <span style={{ fontSize: 13 }}>
                  <strong style={{ textTransform: "capitalize" }}>{s.viewType}</strong> — {s.projectName} — daily at {s.timeOfDay}
                </span>
              </List.Item>
            )}
          />
        )}
      </Modal>

      <Modal
        open={emailOpen} onCancel={() => setEmailOpen(false)} title="Email Report" footer={null}
      >
        <p style={{ color: "#6B7280", fontSize: 13, marginBottom: 12 }}>
          There's no email service connected yet, so this can't actually send. For now, download the
          PDF above and attach it to an email yourself — or use Schedule Report for an in-app reminder instead.
        </p>
        <Input placeholder="recipient@example.com" value={emailTo} onChange={e => setEmailTo(e.target.value)} disabled />
      </Modal>
    </div>
  );
}
