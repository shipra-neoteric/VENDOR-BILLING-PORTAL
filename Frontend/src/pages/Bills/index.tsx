import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Alert,
  Button,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  message,
  Popconfirm,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  DollarOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import DateRangeFilter, { inDateRange } from "../../components/DateRangeFilter";

// ── Types ────────────────────────────────────────────────────────

type BillStatus = "draft" | "submitted" | "verified" | "approved" | "rejected" | "paid";

interface LineItem {
  key: number;
  scopeItemId?: string;
  description: string;
  unit: string;
  plannedQty: number;
  billedQty: number;
  rate: number;
  amount: number;
}

interface Bill {
  id: string;
  billNo: string;
  workOrderId?: string;
  workOrderNo?: string;
  projectId?: string;
  projectName?: string;
  vendorCode?: string;
  vendorName?: string;
  billDate: string;
  billingPeriodFrom?: string;
  billingPeriodTo?: string;
  contractorRefNo?: string;
  generatedBy?: string;
  lineItems: Omit<LineItem, "key">[];
  amount: number;
  gstPercent: number;
  retentionPercent?: number;
  retentionAmount?: number;
  advanceRecovery?: number;
  tdsPercent: number;
  remarks?: string;
  status: BillStatus;
  submittedAt?: string;
  verifiedBy?: { name: string; role: string } | null;
  verifiedAt?: string;
  approvedBy?: { name: string; role: string } | null;
  approvedAt?: string;
  rejectedBy?: { name: string; role: string } | null;
  rejectReason?: string;
  paymentDate?: string;
  paymentUTR?: string;
  paymentChequeNo?: string;
  paymentMode?: string;
  paymentReleasedBy?: string;
  paymentBank?: string;
  paidAmount?: number;
  createdAt?: string;
}

interface ProjectOpt { id: string; name: string; code: string; }
interface ContractorOpt {
  id: string; vendorCode: string; companyName: string; ownerName?: string;
  mobile?: string; address?: string; bankName?: string; accountNumber?: string;
  ifscCode?: string; branchName?: string; gstNumber?: string; panNumber?: string;
}
interface ScopeItemOpt { id: string; description: string; unit: string; plannedQty: number; completedQty: number; rate?: number; }
interface WorkOrderOpt { id: string; workOrderNo: string; projectId: string; projectName: string; vendorCode: string; vendorName: string; scopeItems: ScopeItemOpt[]; }

// ── Helpers ──────────────────────────────────────────────────────

const fmt = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const normalizeId = (obj: Record<string, unknown>) => ({ ...obj, id: (obj._id || obj.id)?.toString() || "" });
const normalizeWO = (wo: Record<string, unknown>): WorkOrderOpt => ({
  ...normalizeId(wo),
  scopeItems: ((wo.scopeItems as Record<string, unknown>[]) || []).map(normalizeId),
} as unknown as WorkOrderOpt);

let _key = 0;
const nextKey = () => ++_key;

const blankRow = (): LineItem => ({ key: nextKey(), description: "", unit: "", plannedQty: 0, billedQty: 0, rate: 0, amount: 0 });

const STATUS_CFG: Record<BillStatus, { label: string; antColor: string }> = {
  draft:     { label: "Draft",      antColor: "default" },
  submitted: { label: "Submitted",  antColor: "processing" },
  verified:  { label: "Verified",   antColor: "warning" },
  approved:  { label: "Approved",   antColor: "success" },
  rejected:  { label: "Rejected",   antColor: "error" },
  paid:      { label: "Paid",       antColor: "purple" },
};

// ── Print / Download ─────────────────────────────────────────────

function printBill(bill: Bill, contractor: ContractorOpt | null) {
  const rows = (bill.lineItems || [])
    .map(
      (li, i) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${i + 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${li.description}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${li.unit || "-"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${(li.billedQty || 0).toLocaleString("en-IN")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${(li.rate || 0).toLocaleString("en-IN")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${(li.amount || 0).toLocaleString("en-IN")}</td>
      </tr>`
    )
    .join("");

  const bankSection =
    contractor?.bankName
      ? `<div style="border:1px solid #e8e8e8;border-radius:6px;padding:14px;margin-bottom:24px">
          <h4 style="font-size:10px;text-transform:uppercase;color:#f47b20;letter-spacing:1px;margin:0 0 10px">Bank Details</h4>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
            <div><span style="font-size:10px;color:#999;display:block">Bank Name</span><strong>${contractor.bankName}</strong></div>
            <div><span style="font-size:10px;color:#999;display:block">Account No.</span><strong>${contractor.accountNumber || "-"}</strong></div>
            <div><span style="font-size:10px;color:#999;display:block">IFSC Code</span><strong>${contractor.ifscCode || "-"}</strong></div>
            <div><span style="font-size:10px;color:#999;display:block">Branch</span><strong>${contractor.branchName || "-"}</strong></div>
          </div>
        </div>`
      : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Bill - ${bill.billNo}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:30px;color:#333;font-size:13px}@media print{body{padding:15px}button{display:none!important}}</style>
</head><body>

<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #f47b20;padding-bottom:16px;margin-bottom:20px">
  <div>
    <div style="font-size:24px;font-weight:bold;color:#f47b20">Neoteric Properties</div>
    <div style="color:#666;font-size:12px;margin-top:4px">Project Cost Center</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#333">RUNNING BILL</div>
    <div style="margin-top:6px;font-size:13px"><strong>Bill No:</strong> ${bill.billNo}</div>
    <div style="font-size:13px"><strong>Date:</strong> ${bill.billDate ? dayjs(bill.billDate).format("DD/MM/YYYY") : "-"}</div>
    <div style="font-size:13px"><strong>Status:</strong> <span style="background:#f47b20;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px">${bill.status.toUpperCase()}</span></div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
  <div style="border:1px solid #e8e8e8;border-radius:6px;padding:14px;background:#fafafa">
    <h4 style="font-size:10px;text-transform:uppercase;color:#f47b20;letter-spacing:1px;margin:0 0 10px">From (Contractor)</h4>
    <p style="font-weight:bold;font-size:14px;margin-bottom:4px">${bill.vendorName || contractor?.companyName || "-"}</p>
    <p style="margin-bottom:3px;color:#555">Vendor Code: <strong>${bill.vendorCode || contractor?.vendorCode || "-"}</strong></p>
    ${contractor?.ownerName ? `<p style="margin-bottom:3px;color:#555">Contact: ${contractor.ownerName}</p>` : ""}
    ${contractor?.mobile ? `<p style="margin-bottom:3px;color:#555">Mobile: ${contractor.mobile}</p>` : ""}
    ${contractor?.address ? `<p style="margin-bottom:3px;color:#555">${contractor.address}</p>` : ""}
    ${contractor?.gstNumber ? `<p style="margin-bottom:3px;color:#555">GST: ${contractor.gstNumber}</p>` : ""}
    ${contractor?.panNumber ? `<p style="color:#555">PAN: ${contractor.panNumber}</p>` : ""}
  </div>
  <div style="border:1px solid #e8e8e8;border-radius:6px;padding:14px;background:#fafafa">
    <h4 style="font-size:10px;text-transform:uppercase;color:#f47b20;letter-spacing:1px;margin:0 0 10px">To</h4>
    <p style="font-weight:bold;font-size:14px;margin-bottom:4px">Neoteric Properties</p>
    <p style="margin-bottom:3px;color:#555">Site / Project: <strong>${bill.projectName || "-"}</strong></p>
    ${bill.workOrderNo ? `<p style="margin-bottom:3px;color:#555">Work Order: ${bill.workOrderNo}</p>` : ""}
    ${bill.generatedBy ? `<p style="color:#555">Generated By: ${bill.generatedBy}</p>` : ""}
  </div>
</div>

<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
  <thead>
    <tr>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:center;width:40px">Sr.</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:left">Description of Work</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:center;width:70px">Unit</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:right;width:80px">Qty</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:right;width:110px">Rate (₹)</th>
      <th style="background:#f47b20;color:#fff;padding:10px 12px;text-align:right;width:120px">Amount (₹)</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div style="display:flex;justify-content:flex-end;margin-bottom:24px">
  <div style="min-width:320px;border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;font-family:monospace">
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee">
      <span>Gross Amount</span><span>₹${(bill.amount || 0).toLocaleString("en-IN")}</span>
    </div>
    ${(bill.gstPercent ?? 0) > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#16a34a">
      <span>GST @ ${bill.gstPercent}%</span><span>+ ₹${Math.round((bill.amount || 0) * (bill.gstPercent ?? 0) / 100).toLocaleString("en-IN")}</span>
    </div>` : ""}
    ${(bill.retentionAmount ?? 0) > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#dc2626">
      <span>Hold / Retention${(bill.retentionPercent ?? 0) > 0 ? ` @ ${bill.retentionPercent}%` : ""}</span>
      <span>− ₹${Math.round(bill.retentionAmount ?? 0).toLocaleString("en-IN")}</span>
    </div>` : ""}
    <div style="display:flex;justify-content:space-between;padding:11px 14px;background:#fff7ed;font-weight:bold;font-size:14px;color:#f47b20;border-top:2px solid #fed7aa">
      <span>Net Payable</span>
      <span>₹${Math.round((bill.amount || 0) * (1 + (bill.gstPercent ?? 0) / 100) - (bill.retentionAmount ?? 0)).toLocaleString("en-IN")}</span>
    </div>
    ${bill.paidAmount != null ? (() => {
      const netPay = Math.round((bill.amount || 0) * (1 + (bill.gstPercent ?? 0) / 100) - (bill.retentionAmount ?? 0));
      const advRec = Math.round(bill.advanceRecovery ?? 0);
      const tds = Math.max(0, netPay - advRec - Math.round(bill.paidAmount));
      return `${advRec > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#d97706">
      <span>Less: Advance Recovery</span><span>− ₹${advRec.toLocaleString("en-IN")}</span>
    </div>` : ""}${tds > 0 ? `
    <div style="display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid #eee;color:#dc2626">
      <span>Less: TDS Deducted${bill.tdsPercent ? ` (${bill.tdsPercent}%)` : ""}</span><span>− ₹${tds.toLocaleString("en-IN")}</span>
    </div>` : ""}
    <div style="display:flex;justify-content:space-between;padding:11px 14px;background:#f0fdf4;font-weight:bold;font-size:15px;color:#16a34a;border-top:2px solid #bbf7d0">
      <span>Actually Paid</span><span>₹${Math.round(bill.paidAmount).toLocaleString("en-IN")}</span>
    </div>`;
    })() : ""}
  </div>
</div>

${bankSection}

${bill.status === "paid" && bill.paymentDate ? `
<div style="border:1px solid #c4b5fd;border-radius:6px;padding:14px;margin-bottom:24px;background:#faf5ff">
  <h4 style="font-size:10px;text-transform:uppercase;color:#7c3aed;letter-spacing:1px;margin:0 0 10px">Payment Details</h4>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;font-size:12px">
    <div><span style="font-size:10px;color:#999;display:block">Payment Date</span><strong>${dayjs(bill.paymentDate).format("DD/MM/YYYY")}</strong></div>
    <div><span style="font-size:10px;color:#999;display:block">Mode</span><strong>${({ neft: "NEFT", rtgs: "RTGS", imps: "IMPS", internet_banking: "Internet Banking", upi: "UPI", cheque: "Cheque", dd: "Demand Draft", cash: "Cash" })[bill.paymentMode || ""] || bill.paymentMode?.toUpperCase() || "—"}</strong></div>
    <div><span style="font-size:10px;color:#999;display:block">UTR / Reference</span><strong style="font-family:monospace">${bill.paymentUTR || "—"}</strong></div>
    ${bill.paymentBank ? `<div><span style="font-size:10px;color:#999;display:block">Bank</span><strong>${bill.paymentBank}</strong></div>` : ""}
    ${bill.paymentReleasedBy ? `<div><span style="font-size:10px;color:#999;display:block">Released By</span><strong>${bill.paymentReleasedBy}</strong></div>` : ""}
  </div>
</div>` : ""}

${bill.remarks ? `<div style="border:1px solid #e8e8e8;border-radius:6px;padding:12px;margin-bottom:24px"><strong>Remarks:</strong> ${bill.remarks}</div>` : ""}

<div style="display:flex;justify-content:space-around;margin-top:50px;padding-top:16px;border-top:1px solid #eee">
  <div style="text-align:center">
    <div style="border-top:1px solid #333;width:180px;margin:0 auto 6px"></div>
    <p style="font-size:12px;color:#666;font-weight:600">AGM</p>
    <p style="font-size:12px;color:#999">Neoteric Properties</p>
  </div>
  <div style="text-align:center">
    <div style="border-top:1px solid #333;width:180px;margin:0 auto 6px"></div>
    <p style="font-size:12px;color:#666;font-weight:600">GM</p>
    <p style="font-size:12px;color:#999">Neoteric Properties</p>
  </div>
</div>

<div style="text-align:center;margin-top:24px;font-size:11px;color:#bbb;border-top:1px solid #f0f0f0;padding-top:10px">
  Computer-generated bill · Neoteric Properties — Project Cost Center
</div>
<div style="text-align:center;margin-top:14px">
  <button onclick="window.print()" style="background:#f47b20;color:#fff;border:none;padding:8px 24px;border-radius:4px;cursor:pointer;font-size:13px">
    Print / Save as PDF
  </button>
</div>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=950");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.addEventListener("load", () => { win.focus(); win.print(); });
    // fallback if load already fired (cached)
    if (win.document.readyState === "complete") { win.focus(); win.print(); }
  }
}

// ── StatCard ─────────────────────────────────────────────────────

function StatCard({
  title, value, sub, color, bg, icon,
}: {
  title: string; value: React.ReactNode; sub?: string;
  color?: string; bg?: string; icon?: React.ReactNode;
}) {
  return (
    <div style={{ background: bg || "#fff", border: "1px solid #e4e7ee", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#9ba3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {icon} {title}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || "#1a1f2e", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ba3b8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function Bills() {
  const [bills, setBills]             = useState<Bill[]>([]);
  const [loading, setLoading]         = useState(true);
  const [projects, setProjects]       = useState<ProjectOpt[]>([]);
  const [contractors, setContractors] = useState<ContractorOpt[]>([]);

  // Filters
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom]         = useState<Dayjs | null>(null);
  const [dateTo, setDateTo]             = useState<Dayjs | null>(null);

  // New Bill drawer
  const [newOpen, setNewOpen]           = useState(false);
  const [newSaving, setNewSaving]       = useState(false);
  const [newForm]                       = Form.useForm();
  const [newProjectId, setNewProjectId] = useState<string>("");
  const [newContractorId, setNewContractorId] = useState<string>("");
  const [woList, setWoList]             = useState<WorkOrderOpt[]>([]);
  const [lineItems, setLineItems]       = useState<LineItem[]>([blankRow()]);

  // GST slab for new bill (TDS is decided at payment time)
  const [newGstPercent, setNewGstPercent] = useState<number>(18);

  // View drawer
  const [viewBill, setViewBill]   = useState<Bill | null>(null);
  const [viewOpen, setViewOpen]   = useState(false);

  // Approve / Reject drawer
  const [actionBillId, setActionBillId] = useState<string | null>(null);
  const [actionType, setActionType]     = useState<"approve" | "reject">("approve");
  const [actionOpen, setActionOpen]     = useState(false);
  const [actionForm]                    = Form.useForm();
  const [actionSaving, setActionSaving] = useState(false);

  // Pay drawer
  const [payBillId, setPayBillId] = useState<string | null>(null);
  const [payOpen, setPayOpen]     = useState(false);
  const [payForm]                 = Form.useForm();
  const [paySaving, setPaySaving] = useState(false);

  // Edit deductions (for paid bills)
  const [dedOpen,   setDedOpen]   = useState(false);
  const [dedBillId, setDedBillId] = useState<string | null>(null);
  const [dedForm]                 = Form.useForm();
  const [dedSaving, setDedSaving] = useState(false);

  // ── Load data ────────────────────────────────────────────────

  const loadBills = useCallback(() => {
    setLoading(true);
    apiClient
      .get<{ bills: Record<string, unknown>[] }>("/bills")
      .then((r) => setBills((r.data.bills || []).map((b) => normalizeId(b) as unknown as Bill)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadBills();
    apiClient.get<{ projects: Record<string, unknown>[] }>("/projects")
      .then((r) => setProjects((r.data.projects || []).map((p) => normalizeId(p) as unknown as ProjectOpt)))
      .catch(() => {});
    apiClient.get<{ contractors: Record<string, unknown>[] }>("/contractors")
      .then((r) => setContractors((r.data.contractors || []).map((c) => normalizeId(c) as unknown as ContractorOpt)))
      .catch(() => {});
  }, [loadBills]);

  // Load work orders when project + contractor selected
  useEffect(() => {
    if (!newProjectId || !newContractorId) { setWoList([]); return; }
    const c = contractors.find((x) => x.id === newContractorId);
    if (!c) return;
    apiClient.get<{ workOrders: Record<string, unknown>[] }>(`/work-orders?projectId=${newProjectId}`)
      .then((r) => {
        const all = (r.data.workOrders || []).map(normalizeWO);
        setWoList(all.filter((wo) => wo.vendorCode === c.vendorCode));
      })
      .catch(() => setWoList([]));
  }, [newProjectId, newContractorId, contractors]);

  // ── Derived ──────────────────────────────────────────────────

  const selectedContractor = useMemo(
    () => contractors.find((c) => c.id === newContractorId) || null,
    [contractors, newContractorId]
  );

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        (b.billNo || "").toLowerCase().includes(q) ||
        (b.vendorName || "").toLowerCase().includes(q) ||
        (b.workOrderNo || "").toLowerCase().includes(q) ||
        (b.projectName || "").toLowerCase().includes(q) ||
        (b.generatedBy || "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || b.status === statusFilter;
      const matchDate   = inDateRange(b.billDate, dateFrom, dateTo);
      return matchSearch && matchStatus && matchDate;
    });
  }, [bills, search, statusFilter, dateFrom, dateTo]);

  const stats = useMemo(() => ({
    submitted: bills.filter((b) => b.status === "submitted" || b.status === "verified").length,
    approved:  bills.filter((b) => b.status === "approved").length,
    paid:      bills.filter((b) => b.status === "paid").length,
    totalPaid: bills.filter((b) => b.status === "paid").reduce((s, b) => s + (b.amount || 0), 0),
  }), [bills]);

  const totalLineAmount = useMemo(
    () => lineItems.reduce((s, li) => s + (li.amount || 0), 0),
    [lineItems]
  );

  const currentViewBill = useMemo(
    () => (viewBill ? bills.find((b) => b.id === viewBill.id) || viewBill : null),
    [bills, viewBill]
  );

  const payTarget = useMemo(
    () => (payBillId ? bills.find((b) => b.id === payBillId) || null : null),
    [bills, payBillId]
  );

  const actionTarget = useMemo(
    () => (actionBillId ? bills.find((b) => b.id === actionBillId) || null : null),
    [bills, actionBillId]
  );

  // ── Line item helpers ────────────────────────────────────────

  function updateLineItem(key: number, field: keyof LineItem, val: unknown) {
    setLineItems((prev) =>
      prev.map((li) => {
        if (li.key !== key) return li;
        const updated = { ...li, [field]: val };
        if (field === "billedQty" || field === "rate") {
          updated.amount = Math.round((Number(updated.billedQty) || 0) * (Number(updated.rate) || 0));
        }
        return updated;
      })
    );
  }

  function removeLineItem(key: number) {
    setLineItems((prev) => prev.filter((li) => li.key !== key));
  }

  function importFromWO(woId: string) {
    const wo = woList.find((w) => w.id === woId);
    if (!wo) return;
    const imported: LineItem[] = wo.scopeItems.map((si) => ({
      key: nextKey(),
      scopeItemId: si.id,
      description: si.description,
      unit: si.unit || "",
      plannedQty: si.plannedQty || 0,
      billedQty: 0,
      rate: si.rate || 0,
      amount: 0,
    }));
    setLineItems((prev) => [...prev.filter((li) => li.description.trim()), ...imported]);
    message.success(`${imported.length} scope items imported — enter quantities`);
  }

  // ── New Bill ─────────────────────────────────────────────────

  function openNewBill() {
    newForm.resetFields();
    setNewProjectId("");
    setNewContractorId("");
    setWoList([]);
    setLineItems([blankRow()]);
    setNewGstPercent(18);
    setNewOpen(true);
  }

  async function handleSubmitBill() {
    const validItems = lineItems.filter((li) => li.description.trim() && li.billedQty > 0);
    if (validItems.length === 0) {
      message.error("Add at least one work item with a description and quantity > 0");
      return;
    }
    let values: Record<string, unknown>;
    try {
      values = await newForm.validateFields();
    } catch {
      return;
    }

    const project = projects.find((p) => p.id === newProjectId);
    const contractor = selectedContractor;

    const payload = {
      billDate:          dayjs(values.billDate as string).toISOString(),
      projectId:         newProjectId || undefined,
      projectName:       project?.name ?? "",
      vendorCode:        contractor?.vendorCode ?? "",
      vendorName:        contractor?.companyName ?? "",
      generatedBy:       values.generatedBy ?? "",
      contractorRefNo:   values.contractorRefNo ?? "",
      remarks:           values.remarks ?? "",
      gstPercent:        newGstPercent,
      tdsPercent:        0,
      lineItems: validItems.map(({ key: _k, ...rest }) => ({
        ...rest,
        amount: rest.billedQty * rest.rate,
      })),
    };

    setNewSaving(true);
    try {
      const res = await apiClient.post<{ bill: Record<string, unknown> }>("/bills", payload);
      setBills((prev) => [normalizeId(res.data.bill) as unknown as Bill, ...prev]);
      message.success(`Bill ${res.data.bill.billNo} submitted for approval`);
      setNewOpen(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to create bill");
    } finally {
      setNewSaving(false);
    }
  }

  // ── Download ─────────────────────────────────────────────────

  const downloadBill = useCallback(
    (bill: Bill) => {
      const contractor = contractors.find((c) => c.vendorCode === bill.vendorCode) ?? null;
      printBill(bill, contractor);
    },
    [contractors]
  );

  // ── Approve / Reject ─────────────────────────────────────────

  function openAction(bill: Bill, type: "approve" | "reject") {
    setActionBillId(bill.id);
    setActionType(type);
    actionForm.resetFields();
    setActionOpen(true);
  }

  async function handleAction() {
    if (!actionBillId) return;
    try {
      const values = await actionForm.validateFields();
      setActionSaving(true);
      const endpoint = actionType === "approve" ? `/bills/${actionBillId}/approve` : `/bills/${actionBillId}/reject`;
      const body     = actionType === "approve" ? { remarks: values.remarks } : { reason: values.reason };
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(endpoint, body);
      const updated = normalizeId(res.data.bill) as unknown as Bill;
      setBills((prev) => prev.map((b) => (b.id === actionBillId ? updated : b)));
      message.success(actionType === "approve" ? "Bill approved" : "Bill rejected");
      setActionOpen(false);
    } catch (err: unknown) {
      const e = err as { errorFields?: unknown; response?: { data?: { message?: string } } };
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || "Action failed");
    } finally {
      setActionSaving(false);
    }
  }

  // ── Pay ──────────────────────────────────────────────────────

  function openPay(bill: Bill) {
    setPayBillId(bill.id);
    payForm.resetFields();
    payForm.setFieldsValue({ paymentDate: dayjs(), paymentMode: "neft", paidAmount: bill.amount });
    setPayOpen(true);
  }

  async function handlePay() {
    if (!payBillId) return;
    try {
      const values = await payForm.validateFields();
      setPaySaving(true);
      const body = {
        paymentUTR:        values.paymentUTR,
        paymentMode:       values.paymentMode,
        paymentDate:       values.paymentDate ? dayjs(values.paymentDate as string).toISOString() : undefined,
        paymentBank:       values.paymentBank,
        paymentReleasedBy: values.paymentReleasedBy,
        paidAmount:        values.paidAmount,
      };
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${payBillId}/pay`, body);
      const updated = normalizeId(res.data.bill) as unknown as Bill;
      setBills((prev) => prev.map((b) => (b.id === payBillId ? updated : b)));
      message.success("Payment recorded");
      setPayOpen(false);
    } catch (err: unknown) {
      const e = err as { errorFields?: unknown; response?: { data?: { message?: string } } };
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || "Failed to record payment");
    } finally {
      setPaySaving(false);
    }
  }

  // ── Patch deductions ─────────────────────────────────────────
  async function handlePatchDeductions() {
    if (!dedBillId) return;
    try {
      const values = await dedForm.validateFields();
      setDedSaving(true);
      const res = await apiClient.patch<{ bill: Record<string, unknown> }>(`/bills/${dedBillId}/deductions`, {
        advanceRecovery: values.advanceRecovery ?? 0,
        retentionAmount: values.retentionAmount ?? 0,
      });
      const updated = normalizeId(res.data.bill) as unknown as Bill;
      setBills((prev) => prev.map((b) => (b.id === dedBillId ? updated : b)));
      message.success("Deductions updated");
      setDedOpen(false);
      setDedBillId(null);
    } catch (err: unknown) {
      const e = err as { errorFields?: unknown; response?: { data?: { message?: string } } };
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || "Failed to update deductions");
    } finally { setDedSaving(false); }
  }

  // ── Table columns ────────────────────────────────────────────

  const columns = [
    {
      title: "Bill No.",
      dataIndex: "billNo",
      width: 110,
      render: (v: string) => (
        <span style={{ fontFamily: "monospace", color: "#f37916", fontWeight: 700 }}>{v}</span>
      ),
    },
    {
      title: "Date",
      dataIndex: "billDate",
      width: 100,
      render: (v: string) => (v ? dayjs(v).format("DD MMM YYYY") : "—"),
    },
    {
      title: "Project",
      dataIndex: "projectName",
      width: 160,
      render: (v: string) => v || <span style={{ color: "#c0c4cc" }}>—</span>,
    },
    {
      title: "Contractor",
      dataIndex: "vendorName",
      width: 160,
    },
    {
      title: "Vendor Code",
      dataIndex: "vendorCode",
      width: 110,
      render: (v: string) => v ? <Tag color="orange" style={{ fontFamily: "monospace" }}>{v}</Tag> : "—",
    },
    {
      title: "Amount",
      dataIndex: "amount",
      width: 130,
      render: (v: number) => (
        <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{fmt(v)}</span>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 120,
      render: (v: BillStatus) => (
        <Tag color={STATUS_CFG[v]?.antColor || "default"} style={{ fontWeight: 600, fontSize: 11 }}>
          {STATUS_CFG[v]?.label || v}
        </Tag>
      ),
    },
    {
      title: "Actions",
      width: 230,
      render: (_: unknown, r: Bill) => (
        <Space size={0} wrap>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setViewBill(r); setViewOpen(true); }}>
            View
          </Button>
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => downloadBill(r)}>
            Download
          </Button>
          {(r.status === "submitted" || r.status === "verified") && (
            <>
              <Button type="link" size="small" style={{ color: "#16a85a" }} icon={<CheckCircleOutlined />} onClick={() => openAction(r, "approve")}>
                Approve
              </Button>
              <Button type="link" size="small" danger icon={<CloseCircleOutlined />} onClick={() => openAction(r, "reject")}>
                Reject
              </Button>
            </>
          )}
          {r.status === "approved" && (
            <Button type="link" size="small" style={{ color: "#7c3aed", fontWeight: 700 }} icon={<DollarOutlined />} onClick={() => openPay(r)}>
              Pay
            </Button>
          )}
        </Space>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────────────────

  return (
    <PageShell
      title="Billing & Payments"
      description="Generate bills for completed work · Approval chain · Payment release"
      cta={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={openNewBill}
          style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
        >
          New Bill
        </Button>
      }
    >
      {/* Stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <StatCard title="Pending Approval" value={stats.submitted} sub="submitted bills" color="#1677ff" bg="#f0f6ff" icon={<ClockCircleOutlined />} />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="Approved" value={stats.approved} sub="awaiting payment" color="#16a85a" bg="#f0faf4" icon={<CheckCircleOutlined />} />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="Payments Released" value={stats.paid} color="#7c3aed" icon={<DollarOutlined />} />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="Total Paid" value={fmt(stats.totalPaid)} color="#16a85a" bg="#f0faf4" icon={<FileTextOutlined />} />
        </Col>
      </Row>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <Input.Search
          placeholder="Search bills…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 280 }}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 180 }}
          options={[
            { label: "All Status",  value: "all" },
            { label: "Submitted",   value: "submitted" },
            { label: "Verified",    value: "verified" },
            { label: "Approved",    value: "approved" },
            { label: "Rejected",    value: "rejected" },
            { label: "Paid",        value: "paid" },
          ]}
        />
        <DateRangeFilter onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
        <span style={{ marginLeft: "auto", color: "#9ba3b8", fontSize: 12 }}>
          {filteredBills.length} bill{filteredBills.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Bills table */}
      <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
        <Spin spinning={loading}>
          <Table
            rowKey="id"
            dataSource={filteredBills}
            columns={columns}
            scroll={{ x: 1200 }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{
              emptyText: loading ? " " : (
                <div style={{ padding: "48px", textAlign: "center", color: "#9ba3b8" }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🧾</div>
                  <div style={{ fontWeight: 700, color: "#5a6278", fontSize: 15 }}>No bills yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Click "New Bill" to generate the first bill.</div>
                </div>
              ),
            }}
          />
        </Spin>
      </div>

      {/* ── View Drawer ──────────────────────────────────────────── */}
      <Drawer
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        width={720}
        title={
          currentViewBill && (
            <div>
              <span style={{ fontFamily: "monospace", color: "#f37916", fontWeight: 800, fontSize: 16 }}>
                {currentViewBill.billNo}
              </span>
              <Tag
                color={STATUS_CFG[currentViewBill.status]?.antColor || "default"}
                style={{ marginLeft: 12, fontWeight: 600 }}
              >
                {STATUS_CFG[currentViewBill.status]?.label}
              </Tag>
              <div style={{ fontSize: 12, color: "#9ba3b8", fontWeight: 400, marginTop: 4 }}>
                {currentViewBill.vendorName}
                {currentViewBill.workOrderNo ? ` · ${currentViewBill.workOrderNo}` : ""}
                {" · "}{dayjs(currentViewBill.billDate).format("DD MMM YYYY")}
              </div>
            </div>
          )
        }
        extra={
          currentViewBill && (
            <Space>
              <Button icon={<DownloadOutlined />} onClick={() => downloadBill(currentViewBill)}>
                Download
              </Button>
              {(currentViewBill.status === "submitted" || currentViewBill.status === "verified") && (
                <>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    style={{ background: "#16a85a", borderColor: "#16a85a" }}
                    onClick={() => { setViewOpen(false); openAction(currentViewBill, "approve"); }}
                  >
                    Approve
                  </Button>
                  <Button danger icon={<CloseCircleOutlined />} onClick={() => { setViewOpen(false); openAction(currentViewBill, "reject"); }}>
                    Reject
                  </Button>
                </>
              )}
              {currentViewBill.status === "approved" && (
                <Button
                  type="primary"
                  icon={<DollarOutlined />}
                  style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
                  onClick={() => { setViewOpen(false); openPay(currentViewBill); }}
                >
                  Record Payment
                </Button>
              )}
            </Space>
          )
        }
      >
        {currentViewBill && (
          <>
            <div style={{ border: "1px solid #e4e7ee", borderRadius: 10, padding: 16, marginBottom: 16, background: "#fafbff" }}>
              <Row gutter={[16, 8]}>
                <Col span={12}>
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Project</span>}>
                      <span style={{ fontWeight: 700 }}>{currentViewBill.projectName || "—"}</span>
                    </Descriptions.Item>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Contractor</span>}>
                      {currentViewBill.vendorName}
                    </Descriptions.Item>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Vendor Code</span>}>
                      <Tag color="blue" style={{ fontFamily: "monospace" }}>{currentViewBill.vendorCode || "—"}</Tag>
                    </Descriptions.Item>
                    {currentViewBill.workOrderNo && (
                      <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Work Order</span>}>
                        <Tag color="orange" style={{ fontFamily: "monospace" }}>{currentViewBill.workOrderNo}</Tag>
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                </Col>
                <Col span={12}>
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Bill Date</span>}>
                      {dayjs(currentViewBill.billDate).format("DD MMM YYYY")}
                    </Descriptions.Item>
                    {currentViewBill.contractorRefNo && (
                      <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Ref No.</span>}>
                        {currentViewBill.contractorRefNo}
                      </Descriptions.Item>
                    )}
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8", fontSize: 12 }}>Generated By</span>}>
                      <strong>{currentViewBill.generatedBy || "—"}</strong>
                    </Descriptions.Item>
                  </Descriptions>
                </Col>
              </Row>
            </div>

            {currentViewBill.status === "rejected" && currentViewBill.rejectReason && (
              <Alert
                type="error"
                showIcon
                message={<span><strong>Rejection Reason:</strong> {currentViewBill.rejectReason}</span>}
                style={{ marginBottom: 16 }}
              />
            )}

            <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1f2e", marginBottom: 10 }}>Work Items Billed</div>
            <div style={{ overflowX: "auto", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f5f6f8" }}>
                    {["Work Item", "Unit", "Qty", "Rate (₹)", "Amount"].map((h) => (
                      <th key={h} style={{ padding: "8px 10px", fontWeight: 700, color: "#5a6278", textAlign: "right", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(currentViewBill.lineItems || []).map((li, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f5f6f8" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600, color: "#1a1f2e" }}>{li.description}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "#9ba3b8" }}>{li.unit || "—"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#f37916" }}>
                        {(li.billedQty || 0).toLocaleString("en-IN")}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace" }}>
                        {(li.rate || 0).toLocaleString("en-IN")}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#16a85a" }}>
                        {fmt(li.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: "#f5f6f8", fontWeight: 700 }}>
                    <td colSpan={4} style={{ padding: "8px 10px", textAlign: "right", color: "#5a6278" }}>Total Billed Amount</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", color: "#f37916", fontSize: 14 }}>
                      {fmt(currentViewBill.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Financial summary */}
            {(() => {
              const gross    = currentViewBill.amount || 0;
              const gstPct   = currentViewBill.gstPercent ?? 0;
              const gstAmt   = Math.round(gross * gstPct / 100);
              const retAmt   = currentViewBill.retentionAmount ?? 0;
              const retPct   = currentViewBill.retentionPercent ?? 0;
              const advRec   = currentViewBill.advanceRecovery ?? 0;
              const netPay   = gross + gstAmt - retAmt;
              const paid     = currentViewBill.paidAmount;
              // TDS = what's left after net payable minus advance minus actually paid
              const tdsAmt = paid != null ? Math.max(0, Math.round(netPay - advRec - paid)) : 0;

              type Row = { label: string; value: string; color: string; bold?: boolean; borderTop?: boolean; bg?: string };
              const rows: Row[] = [
                { label: "Gross Amount", value: fmt(gross), color: "#1a1f2e" },
              ];
              if (gstAmt > 0) rows.push({ label: `GST @ ${gstPct}%`, value: `+ ${fmt(gstAmt)}`, color: "#16a85a" });
              if (retAmt > 0) rows.push({ label: `Hold / Retention${retPct > 0 ? ` @ ${retPct}%` : ""}`, value: `− ${fmt(retAmt)}`, color: "#e03b3b" });
              rows.push({ label: "NET PAYABLE", value: fmt(netPay), color: "#7c3aed", bold: true, borderTop: true });
              if (advRec > 0) rows.push({ label: "Less: Advance Recovery", value: `− ${fmt(advRec)}`, color: "#d97706" });
              if (tdsAmt > 0) rows.push({ label: `Less: TDS Deducted${currentViewBill.tdsPercent ? ` (${currentViewBill.tdsPercent}%)` : ""}`, value: `− ${fmt(tdsAmt)}`, color: "#dc2626" });
              if (paid != null) rows.push({ label: "ACTUALLY PAID", value: fmt(paid), color: "#16a85a", bold: true, borderTop: true, bg: "#f0fdf4" });
              return (
                <div style={{ border: "1px solid #e4e7ee", borderRadius: 8, overflow: "hidden", fontFamily: "monospace", fontSize: 13, marginBottom: 16 }}>
                  <div style={{ background: "#f5f6f8", padding: "8px 14px", fontWeight: 700, fontSize: 11, color: "#5a6278", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Financial Summary
                  </div>
                  <div style={{ padding: "8px 14px" }}>
                    {rows.map((r, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: r.borderTop ? "2px solid #e4e7ee" : undefined, marginTop: r.borderTop ? 4 : 0, background: r.bg, color: r.color, fontWeight: r.bold ? 700 : 400, fontSize: r.bold ? 14 : 13 }}>
                        <span>{r.label}</span><span>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {currentViewBill.remarks && (
              <>
                <Divider />
                <div style={{ color: "#5a6278", fontSize: 13 }}><strong>Remarks:</strong> {currentViewBill.remarks}</div>
              </>
            )}

            {currentViewBill.approvedBy && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0faf4", borderRadius: 8, border: "1px solid #b7e8c8" }}>
                <div style={{ fontSize: 12, color: "#16a85a", fontWeight: 700 }}>
                  Approved by {(currentViewBill.approvedBy as { name: string })?.name || "—"}
                  {currentViewBill.approvedAt && (
                    <span style={{ fontWeight: 400, color: "#9ba3b8", marginLeft: 8 }}>
                      {dayjs(currentViewBill.approvedAt).format("DD MMM YYYY")}
                    </span>
                  )}
                </div>
              </div>
            )}

            {currentViewBill.status === "paid" && (
              <>
                <Divider />
                <div style={{ background: "#f5f0ff", border: "1px solid #c4b5fd", borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#7c3aed" }}>Payment Released</div>
                    <Button
                      size="small"
                      onClick={() => {
                        setDedBillId(currentViewBill.id);
                        dedForm.setFieldsValue({
                          advanceRecovery: currentViewBill.advanceRecovery ?? 0,
                          retentionAmount: currentViewBill.retentionAmount ?? 0,
                        });
                        setDedOpen(true);
                      }}
                      style={{ fontSize: 11 }}
                    >
                      Edit Deductions
                    </Button>
                  </div>
                  <Descriptions column={2} size="small" colon={false}>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Payment Date</span>}>
                      {currentViewBill.paymentDate ? dayjs(currentViewBill.paymentDate).format("DD MMM YYYY") : "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Mode</span>}>
                      <Tag color="purple">
                        {({ neft: "NEFT", rtgs: "RTGS", imps: "IMPS", internet_banking: "Internet Banking", upi: "UPI", cheque: "Cheque", dd: "DD", cash: "Cash" } as Record<string, string>)[currentViewBill.paymentMode || ""] || currentViewBill.paymentMode?.toUpperCase() || "—"}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>UTR / Ref</span>}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{currentViewBill.paymentUTR || "—"}</span>
                    </Descriptions.Item>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Bank</span>}>
                      {currentViewBill.paymentBank || "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label={<span style={{ color: "#9ba3b8" }}>Released By</span>}>
                      {currentViewBill.paymentReleasedBy || "—"}
                    </Descriptions.Item>
                  </Descriptions>
                </div>
              </>
            )}
          </>
        )}
      </Drawer>

      {/* ── New Bill Drawer ───────────────────────────────────────── */}
      <Drawer
        open={newOpen}
        onClose={() => setNewOpen(false)}
        placement="right"
        width={860}
        title={
          <Space>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>New Bill</div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                Select project → contractor → add work items → submit
              </div>
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button
              size="large"
              type="primary"
              loading={newSaving}
              onClick={handleSubmitBill}
              style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
            >
              Submit Bill for Approval
            </Button>
          </div>
        }
        destroyOnClose
      >
        {/* Step 1 — Project, Contractor, Date */}
        <div style={{ background: "#f5f6f8", borderRadius: 8, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1f2e", marginBottom: 12 }}>
            Bill Information
          </div>
          <Form form={newForm} layout="vertical">
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="Site / Project" name="projectId">
                  <Select
                    showSearch
                    allowClear
                    placeholder="Select project…"
                    style={{ width: "100%" }}
                    onChange={(v) => { setNewProjectId(v || ""); setWoList([]); }}
                    filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                    options={projects.map((p) => ({ value: p.id, label: `${p.code ? p.code + " — " : ""}${p.name}` }))}
                  />
                </Form.Item>
              </Col>
              <Col span={10}>
                <Form.Item label="Contractor *" name="contractorId" rules={[{ required: true, message: "Select a contractor" }]}>
                  <Select
                    showSearch
                    placeholder="Search by name or vendor code…"
                    style={{ width: "100%" }}
                    onChange={(v) => setNewContractorId(v || "")}
                    filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                    options={contractors.map((c) => ({
                      value: c.id,
                      label: `${c.companyName}  (${c.vendorCode})`,
                    }))}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="Vendor Code">
                  <Input
                    value={selectedContractor?.vendorCode || ""}
                    disabled
                    style={{ background: "var(--nx-white)", color: "#f37916", fontWeight: 700, fontFamily: "monospace" }}
                    placeholder="Auto-filled"
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* Contractor auto-fill preview */}
            {selectedContractor && (
              <div style={{ background: "var(--nx-white)", borderRadius: 6, border: "1px solid #e4e7ee", padding: "10px 12px", marginBottom: 12, fontSize: 12 }}>
                <Row gutter={16}>
                  <Col span={6}>
                    <div style={{ color: "#9ba3b8", fontWeight: 600, marginBottom: 2 }}>Owner</div>
                    <div>{selectedContractor.ownerName || "—"}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ color: "#9ba3b8", fontWeight: 600, marginBottom: 2 }}>Mobile</div>
                    <div style={{ fontFamily: "monospace" }}>{selectedContractor.mobile || "—"}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ color: "#9ba3b8", fontWeight: 600, marginBottom: 2 }}>GST</div>
                    <div style={{ fontFamily: "monospace" }}>{selectedContractor.gstNumber || "—"}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ color: "#9ba3b8", fontWeight: 600, marginBottom: 2 }}>PAN</div>
                    <div style={{ fontFamily: "monospace" }}>{selectedContractor.panNumber || "—"}</div>
                  </Col>
                </Row>
              </div>
            )}

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="Bill Date *" name="billDate" rules={[{ required: true, message: "Required" }]}>
                  <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" defaultValue={dayjs()} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="Generated By *" name="generatedBy" rules={[{ required: true, message: "Required" }]}>
                  <Input placeholder="Full name of person generating bill" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="Contractor Ref. No." name="contractorRefNo">
                  <Input placeholder="e.g. ABCI/2026/003" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="GST Slab" name="gstPercent" initialValue={18} tooltip="GST % applicable on this bill. TDS deduction is handled at payment time.">
                  <Select
                    onChange={(v) => setNewGstPercent(Number(v))}
                    options={[
                      { label: "0% — Exempt / Nil", value: 0 },
                      { label: "5%", value: 5 },
                      { label: "12%", value: 12 },
                      { label: "18% (Standard)", value: 18 },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* Work order import (optional) */}
            {woList.length > 0 && (
              <div style={{ background: "#fff7ed", border: "1px solid #ffd591", borderRadius: 6, padding: "10px 14px", marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#d4620c", marginBottom: 8 }}>
                  Work orders found — import scope items (optional)
                </div>
                <Row gutter={12} align="middle">
                  <Col flex="1">
                    <Select
                      placeholder="Select a work order to import its scope items…"
                      style={{ width: "100%" }}
                      onChange={(v) => { if (v) importFromWO(v as string); }}
                      options={woList.map((wo) => ({
                        value: wo.id,
                        label: wo.workOrderNo + (wo.projectName ? " — " + wo.projectName : ""),
                      }))}
                    />
                  </Col>
                </Row>
              </div>
            )}
          </Form>
        </div>

        {/* Step 2 — Work Items table */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1f2e", marginBottom: 10 }}>
            Work Items
            <span style={{ fontWeight: 400, fontSize: 11, color: "#9ba3b8", marginLeft: 8 }}>
              Enter description, quantity and rate for each item
            </span>
          </div>

          <div style={{ border: "1px solid #e4e7ee", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f6f8" }}>
                  <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "left" }}>
                    Description of Work *
                  </th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "center", width: 80 }}>
                    Unit
                  </th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "right", width: 100 }}>
                    Quantity *
                  </th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "right", width: 120 }}>
                    Rate (₹) *
                  </th>
                  <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "right", width: 130 }}>
                    Amount (₹)
                  </th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={item.key} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "6px 8px" }}>
                      <Input
                        value={item.description}
                        placeholder="e.g. RCC work, Plastering, Tile fixing…"
                        onChange={(e) => updateLineItem(item.key, "description", e.target.value)}
                        bordered={false}
                        style={{ padding: "2px 4px" }}
                      />
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <Input
                        value={item.unit}
                        placeholder="sqft"
                        onChange={(e) => updateLineItem(item.key, "unit", e.target.value)}
                        bordered={false}
                        style={{ padding: "2px 4px", textAlign: "center" }}
                      />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <InputNumber
                        min={0}
                        value={item.billedQty || undefined}
                        placeholder="0"
                        onChange={(v) => updateLineItem(item.key, "billedQty", Number(v) || 0)}
                        style={{ width: "100%" }}
                        bordered={false}
                      />
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <InputNumber
                        min={0}
                        value={item.rate || undefined}
                        placeholder="0.00"
                        onChange={(v) => updateLineItem(item.key, "rate", Number(v) || 0)}
                        style={{ width: "100%" }}
                        bordered={false}
                        formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                        parser={(v) => (v ?? "").replace(/,/g, "") as unknown as 0}
                      />
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: item.amount > 0 ? "#16a85a" : "#c0c4cc", whiteSpace: "nowrap" }}>
                      {item.amount > 0 ? fmt(item.amount) : "—"}
                    </td>
                    <td style={{ padding: "6px 4px", textAlign: "center" }}>
                      <Popconfirm
                        title="Remove this row?"
                        onConfirm={() => removeLineItem(item.key)}
                        disabled={lineItems.length === 1}
                      >
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          disabled={lineItems.length === 1}
                        />
                      </Popconfirm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setLineItems((prev) => [...prev, blankRow()])}
            style={{ width: "100%", marginTop: 8 }}
          >
            Add Work Item
          </Button>

          {/* Dynamic financial summary */}
          {(() => {
            const gross  = totalLineAmount;
            const gstAmt = Math.round(gross * newGstPercent / 100);
            const net    = gross + gstAmt;
            return (
              <div style={{ border: "1px solid #e4e7ee", borderRadius: 8, overflow: "hidden", marginTop: 12 }}>
                <div style={{ background: "#fff8f3", borderBottom: "1px solid #f8c9a0", padding: "8px 14px" }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: "#d4620c", textTransform: "uppercase", letterSpacing: "0.06em" }}>Financial Summary</span>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: "1px solid #f5f6f8", color: "#1a1f2e" }}>
                    <span>Gross Amount</span><span>{fmt(gross)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: "1px solid #f5f6f8", color: "#16a85a" }}>
                    <span>+ GST @ {newGstPercent}%</span><span>{fmt(gstAmt)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#fff8f3", fontWeight: 800, fontSize: 15, color: "#d4620c" }}>
                    <span>Net Payable (incl. GST)</span>
                    <span>{fmt(net)}</span>
                  </div>
                  <div style={{ padding: "6px 14px", fontSize: 11, color: "#9ba3b8", borderTop: "1px solid #f5f6f8" }}>
                    TDS deduction is recorded at payment time by Finance
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Remarks */}
        <Form form={newForm} layout="vertical">
          <Form.Item label="Remarks" name="remarks">
            <Input.TextArea rows={2} placeholder="Describe the scope of work covered in this bill…" />
          </Form.Item>
        </Form>
      </Drawer>

      {/* ── Approve / Reject Drawer ───────────────────────────────── */}
      <Drawer
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        placement="right"
        width={480}
        title={
          <Space>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                {actionType === "approve" ? "Approve" : "Reject"} Bill
                {actionTarget ? ` — ${actionTarget.billNo}` : ""}
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                {actionTarget && `${actionTarget.vendorName}${actionTarget.workOrderNo ? " · " + actionTarget.workOrderNo : ""}`}
              </div>
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => setActionOpen(false)}>Cancel</Button>
            <Button
              size="large"
              type="primary"
              loading={actionSaving}
              onClick={handleAction}
              style={{
                background: actionType === "approve" ? "#16a85a" : "#e03b3b",
                borderColor: actionType === "approve" ? "#16a85a" : "#e03b3b",
              }}
            >
              {actionType === "approve" ? "Approve" : "Reject"}
            </Button>
          </div>
        }
        destroyOnClose
      >
        {actionTarget && (
          <>
            <div style={{ background: "#f5f6f8", borderRadius: 8, padding: "12px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "#9ba3b8", fontWeight: 700, textTransform: "uppercase" }}>Bill Amount</div>
                <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 20, color: "#f37916" }}>{fmt(actionTarget.amount)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#9ba3b8" }}>{actionTarget.vendorName}</div>
                {actionTarget.workOrderNo && (
                  <Tag color="orange" style={{ fontFamily: "monospace", marginTop: 4 }}>{actionTarget.workOrderNo}</Tag>
                )}
              </div>
            </div>
            <Form form={actionForm} layout="vertical">
              {actionType === "reject" ? (
                <Form.Item label="Reason for Rejection" name="reason" rules={[{ required: true, message: "Please provide a reason" }]}>
                  <Input.TextArea rows={4} placeholder="Explain why this bill is being rejected…" />
                </Form.Item>
              ) : (
                <Form.Item label="Remarks (optional)" name="remarks">
                  <Input.TextArea rows={3} placeholder="Any approval conditions or notes…" />
                </Form.Item>
              )}
            </Form>
          </>
        )}
      </Drawer>

      {/* ── Pay Drawer ────────────────────────────────────────────── */}
      <Drawer
        open={payOpen}
        onClose={() => { setPayOpen(false); setPayBillId(null); }}
        placement="right"
        width={520}
        title={
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              Record Payment{payTarget ? ` — ${payTarget.billNo}` : ""}
            </div>
            <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>Enter UTR / cheque details to release payment</div>
          </div>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => { setPayOpen(false); setPayBillId(null); }}>Cancel</Button>
            <Button size="large" type="primary" loading={paySaving} onClick={handlePay} style={{ background: "#7c3aed", borderColor: "#7c3aed" }}>
              Record Payment
            </Button>
          </div>
        }
        destroyOnClose
      >
        {payTarget && (
          <>
            <div style={{ background: "#f5f0ff", border: "1px solid #c4b5fd", borderRadius: 8, padding: "12px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "#9ba3b8", fontWeight: 700, textTransform: "uppercase" }}>Net Payable to Contractor</div>
                <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 22, color: "#7c3aed" }}>{fmt(payTarget.amount)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{payTarget.vendorName}</div>
                {payTarget.workOrderNo && <div style={{ fontSize: 11, color: "#9ba3b8" }}>{payTarget.workOrderNo}</div>}
              </div>
            </div>
            <Form form={payForm} layout="vertical">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Payment Date" name="paymentDate" rules={[{ required: true }]}>
                    <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Payment Mode" name="paymentMode" rules={[{ required: true }]}>
                    <Select options={[
                      { label: "NEFT", value: "neft" },
                      { label: "RTGS", value: "rtgs" },
                      { label: "IMPS", value: "imps" },
                      { label: "Internet Banking", value: "internet_banking" },
                      { label: "UPI", value: "upi" },
                      { label: "Cheque", value: "cheque" },
                      { label: "Demand Draft (DD)", value: "dd" },
                      { label: "Cash", value: "cash" },
                    ]} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="UTR / Transaction Reference" name="paymentUTR">
                <Input placeholder="e.g. HDFC202606270001234" style={{ fontFamily: "monospace" }} />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Bank" name="paymentBank">
                    <Input placeholder="e.g. HDFC Bank" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Released By" name="paymentReleasedBy" rules={[{ required: true }]}>
                    <Input placeholder="Finance officer name" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                label="Actual Amount Paid (₹)"
                name="paidAmount"
                rules={[{ required: true, message: "Enter the amount actually paid" }]}
                extra={
                  <Form.Item noStyle shouldUpdate={(prev, cur) => prev.paidAmount !== cur.paidAmount}>
                    {({ getFieldValue }) => {
                      const paid = getFieldValue("paidAmount") as number | undefined;
                      if (!paid || !payTarget) return null;
                      const diff = Math.round(payTarget.amount - paid);
                      if (diff === 0) return null;
                      return (
                        <span style={{ color: diff > 0 ? "#e03b3b" : "#16a85a", fontSize: 12 }}>
                          {diff > 0
                            ? `₹${diff.toLocaleString("en-IN")} less than bill amount (TDS / deduction)`
                            : `₹${Math.abs(diff).toLocaleString("en-IN")} more than bill amount`}
                        </span>
                      );
                    }}
                  </Form.Item>
                }
              >
                <InputNumber<number>
                  style={{ width: "100%", fontFamily: "monospace", fontWeight: 700 }}
                  min={0}
                  precision={0}
                  formatter={(v) => `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  parser={(v) => Number((v || "").replace(/[₹\s,]/g, ""))}
                />
              </Form.Item>
            </Form>
          </>
        )}
      </Drawer>

      {/* ── Edit Deductions Modal ─────────────────────────────────── */}
      <Modal
        open={dedOpen}
        onCancel={() => { setDedOpen(false); setDedBillId(null); }}
        onOk={handlePatchDeductions}
        title="Edit Deductions"
        okText="Save"
        okButtonProps={{ loading: dedSaving, style: { background: "#7c3aed", borderColor: "#7c3aed" } }}
        destroyOnClose
      >
        <div style={{ marginTop: 8, fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
          Correct the advance recovery and hold/retention amounts for this paid bill. TDS will be computed automatically as the remaining difference.
        </div>
        <Form form={dedForm} layout="vertical">
          <Form.Item label="Hold / Retention Amount (₹)" name="retentionAmount">
            <InputNumber<number>
              style={{ width: "100%", fontFamily: "monospace" }}
              min={0} precision={0} prefix="₹"
              placeholder="0"
            />
          </Form.Item>
          <Form.Item label="Advance Recovery (₹)" name="advanceRecovery">
            <InputNumber<number>
              style={{ width: "100%", fontFamily: "monospace" }}
              min={0} precision={0} prefix="₹"
              placeholder="0"
            />
          </Form.Item>
        </Form>
      </Modal>
    </PageShell>
  );
}
