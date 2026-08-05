import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Button,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Row,
  Select,
  Space,
  Tag,
  message,
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import apiClient from "../../services/apiClient";
import { selectableProjects } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";
import StatusTag from "../../shared/components/StatusTag";
import type { Contractor } from "../../types/VendorBilling";
import { BILL_TYPE_CFG, RELATIONSHIP_OPTIONS } from "../../shared/constants/billOptions";
import { billFinancials, holdAmountFromPercent } from "../../shared/utils/billMath";

// ── Types — a self-contained slice of what AccountsPayment's own Bill/LineItem
// types look like, since this drawer fetches and posts independently ────────

interface LineItem {
  key: number;
  scopeItemId?: string;
  // Set only when this row bills one particular within scopeItemId rather
  // than the scope item as a whole — a scope item that HAS particulars is
  // never billed directly, only through its particulars (see importFromWO).
  subItemId?: string;
  // The parent scope item's own description — set only on particular rows,
  // used purely to group them under a collapsible header in the table.
  groupLabel?: string;
  description: string;
  unit: string;
  plannedQty: number;
  // How much has already been billed against this scope item/particular,
  // cumulative across EVERY bill ever raised for it (progress-cycle or
  // manual) — drives the remaining-% cap shown here; the backend enforces
  // the real limit.
  lastBilledQty?: number;
  percentComplete?: number;
  billedQty: number;
  rate: number;
  amount: number;
}

interface ExistingBill { id: string; billNo: string; amount: number; status: string; isActive?: boolean; }

interface ProjectOpt { id: string; name: string; code: string; parentId?: string | null; }
interface SubItemOpt { id: string; description: string; unit: string; plannedQty: number; lastBilledQty: number; rate?: number; }
interface ScopeItemOpt { id: string; description: string; unit: string; plannedQty: number; lastBilledQty: number; rate?: number; subItems?: SubItemOpt[]; }
interface WorkOrderOpt { id: string; workOrderNo: string; projectId: string; projectName: string; vendorCode: string; vendorName: string; scopeItems: ScopeItemOpt[]; }
interface AdvanceSlipOpt { _id: string; slipNo: string; amount: number; amountRecovered: number; balance: number; date?: string; reference?: string; }

const fmt = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const normalizeId = (obj: Record<string, unknown>) => ({ ...obj, id: (obj._id || obj.id)?.toString() || "" });
const normalizeWO = (wo: Record<string, unknown>): WorkOrderOpt => ({
  ...normalizeId(wo),
  scopeItems: ((wo.scopeItems as Record<string, unknown>[]) || []).map((si) => ({
    ...normalizeId(si),
    subItems: ((si.subItems as Record<string, unknown>[]) || []).map(normalizeId),
  })),
} as unknown as WorkOrderOpt);

let _key = 0;
const nextKey = () => ++_key;
const blankRow = (): LineItem => ({ key: nextKey(), description: "", unit: "", plannedQty: 0, billedQty: 0, rate: 0, amount: 0 });

// Remaining % still billable for a scope-item/particular-linked row — null for plain rows.
function remainingPercent(li: LineItem): number | null {
  if (!li.scopeItemId || !(li.plannedQty > 0)) return null;
  const remaining = li.plannedQty - (li.lastBilledQty || 0);
  return Math.max(0, Math.round((remaining / li.plannedQty) * 10000) / 100);
}

export default function NewBillDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (bill: Record<string, unknown>) => void;
}) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [contractorId, setContractorId] = useState<string>("");
  // Who this bill's payment actually goes to — normally the same as the
  // selected contractor, but a fellow Vendor Group member can be picked
  // instead (e.g. "Ambika Construction" takes the work, this particular
  // bill pays a different individually-registered member of that group).
  const [payeeVendorCode, setPayeeVendorCode] = useState<string>("");
  const [woList, setWoList] = useState<WorkOrderOpt[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([blankRow()]);
  const [gstPercent, setGstPercent] = useState<number>(18);
  const [isCustomGst, setIsCustomGst] = useState(false);
  const [billType, setBillType] = useState<string>("running");
  const [relType, setRelType] = useState<string>("NONE");
  const [linkedBillIds, setLinkedBillIds] = useState<string[]>([]);
  const [selectedWOId, setSelectedWOId] = useState<string>("");
  const [woExistingBills, setWoExistingBills] = useState<ExistingBill[]>([]);
  // The WO scope items were actually imported from — kept separate from
  // selectedWOId (the "Bill Relationship" picker) so changing that picker
  // afterward can't silently disconnect the imported qty/variance checks
  // from the WO that actually owns them.
  const [importedFromWOId, setImportedFromWOId] = useState<string>("");
  // Scope items with particulars are collapsed by default — the arrow next
  // to their group header reveals the particulars to bill against.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Hold (retention) decided at creation time — either a % or a flat amount.
  const [holdMode, setHoldMode] = useState<"percent" | "amount">("percent");
  const [holdPercent, setHoldPercent] = useState<number>(0);
  const [holdAmountInput, setHoldAmountInput] = useState<number>(0);

  // Advance recovery decided at creation time.
  const [pendingAdvances, setPendingAdvances] = useState<AdvanceSlipOpt[]>([]);
  const [advancesLoading, setAdvancesLoading] = useState(false);
  const [advancesUnavailable, setAdvancesUnavailable] = useState(false);
  const [recoveryAmount, setRecoveryAmount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setProjectId("");
    setContractorId("");
    setPayeeVendorCode("");
    setWoList([]);
    setLineItems([blankRow()]);
    setGstPercent(18);
    setIsCustomGst(false);
    setBillType("running");
    setRelType("NONE");
    setLinkedBillIds([]);
    setSelectedWOId("");
    setWoExistingBills([]);
    setImportedFromWOId("");
    setExpandedGroups(new Set());
    setHoldMode("percent");
    setHoldPercent(0);
    setHoldAmountInput(0);
    setPendingAdvances([]);
    setAdvancesUnavailable(false);
    setRecoveryAmount(null);

    apiClient.get<{ projects: Record<string, unknown>[] }>("/projects")
      .then((r) => setProjects((r.data.projects || []).map((p) => normalizeId(p) as unknown as ProjectOpt)))
      .catch(() => {});
    apiClient.get<{ contractors: Record<string, unknown>[] }>("/contractors")
      .then((r) => setContractors((r.data.contractors || []).map((c) => normalizeId(c) as unknown as Contractor)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedContractor = useMemo(
    () => contractors.find((c) => c.id === contractorId) || null,
    [contractors, contractorId]
  );

  // Defaults the payee back to the selected contractor's own code whenever
  // that selection changes — a previous group override shouldn't silently
  // carry over onto an unrelated contractor.
  useEffect(() => {
    setPayeeVendorCode(selectedContractor?.vendorCode || "");
  }, [selectedContractor?.vendorCode]);

  const groupSiblings = useMemo(
    () => selectedContractor?.groupId
      ? contractors.filter((c) => c.groupId === selectedContractor.groupId)
      : [],
    [contractors, selectedContractor?.groupId]
  );
  const selectedPayee = useMemo(
    () => contractors.find((c) => c.vendorCode === payeeVendorCode) || selectedContractor,
    [contractors, payeeVendorCode, selectedContractor]
  );

  useEffect(() => {
    if (!projectId || !contractorId) { setWoList([]); return; }
    const c = contractors.find((x) => x.id === contractorId);
    if (!c) return;
    apiClient.get<{ workOrders: Record<string, unknown>[] }>(`/work-orders?projectId=${projectId}`)
      .then((r) => {
        const all = (r.data.workOrders || []).map(normalizeWO);
        setWoList(all.filter((wo) => wo.vendorCode === c.vendorCode));
      })
      .catch(() => setWoList([]));
  }, [projectId, contractorId, contractors]);

  // Outstanding advances for the picked contractor/project — same fetch used
  // by Accounts Payment's own late-stage recovery picker.
  useEffect(() => {
    if (!projectId || !selectedContractor?.vendorCode) { setPendingAdvances([]); return; }
    setAdvancesLoading(true);
    setAdvancesUnavailable(false);
    apiClient.get<{ advanceSlips: AdvanceSlipOpt[] }>(`/advance-slips/pending?projectId=${projectId}&vendorCode=${selectedContractor.vendorCode}`)
      .then((r) => {
        const slips = (r.data.advanceSlips || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        setPendingAdvances(slips);
      })
      .catch(() => { setPendingAdvances([]); setAdvancesUnavailable(true); })
      .finally(() => setAdvancesLoading(false));
  }, [projectId, selectedContractor?.vendorCode]);

  function updateLineItem(key: number, field: keyof LineItem, val: unknown) {
    setLineItems((prev) =>
      prev.map((li) => {
        if (li.key !== key) return li;
        const updated = { ...li, [field]: val };
        if (field === "percentComplete") {
          const cap = remainingPercent(li);
          const pct = Math.max(0, cap != null ? Math.min(Number(val) || 0, cap) : Number(val) || 0);
          updated.percentComplete = pct;
          updated.billedQty = Math.round(((li.plannedQty || 0) * pct / 100) * 100) / 100;
        } else if (field === "billedQty" && li.scopeItemId && li.plannedQty > 0) {
          updated.percentComplete = Math.round(((Number(val) || 0) / li.plannedQty) * 10000) / 100;
        }
        if (field === "billedQty" || field === "rate" || field === "percentComplete") {
          // Rounded to paise (2 decimals), not the nearest whole rupee — a
          // fractional rate (e.g. ₹50.5/sqft) produces a genuinely fractional
          // amount, and rounding it away here would discard real money.
          updated.amount = Math.round((Number(updated.billedQty) || 0) * (Number(updated.rate) || 0) * 100) / 100;
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
    // A scope item with particulars is never billed as a whole — only its
    // particulars carry a real plannedQty/rate — so import ITS particulars
    // as individual rows, grouped under a collapsible header, instead of one
    // row for the parent.
    const imported: LineItem[] = wo.scopeItems.flatMap((si) => {
      if (si.subItems && si.subItems.length > 0) {
        return si.subItems.map((sub) => ({
          key: nextKey(),
          scopeItemId: si.id,
          subItemId: sub.id,
          groupLabel: si.description,
          description: sub.description,
          unit: sub.unit || "",
          plannedQty: sub.plannedQty || 0,
          lastBilledQty: sub.lastBilledQty || 0,
          percentComplete: 0,
          billedQty: 0,
          rate: sub.rate || 0,
          amount: 0,
        }));
      }
      return [{
        key: nextKey(),
        scopeItemId: si.id,
        description: si.description,
        unit: si.unit || "",
        plannedQty: si.plannedQty || 0,
        lastBilledQty: si.lastBilledQty || 0,
        percentComplete: 0,
        billedQty: 0,
        rate: si.rate || 0,
        amount: 0,
      }];
    });
    setLineItems((prev) => [...prev.filter((li) => li.description.trim()), ...imported]);
    setImportedFromWOId(woId);
    message.success(`${imported.length} item${imported.length === 1 ? "" : "s"} imported — enter % complete or quantity`);
  }

  async function handleWOSelectForLinking(woId: string) {
    setSelectedWOId(woId);
    if (!woId) { setWoExistingBills([]); return; }
    try {
      const res = await apiClient.get<{ bills: Record<string, unknown>[] }>(`/bills/chain/${woId}`);
      const existing = (res.data.bills || []).map(b => normalizeId(b) as unknown as ExistingBill);
      setWoExistingBills(existing.filter(b => b.status !== "rejected"));
    } catch { setWoExistingBills([]); }
  }

  const totalLineAmount = useMemo(
    () => lineItems.reduce((s, li) => s + (li.amount || 0), 0),
    [lineItems]
  );

  const gross = totalLineAmount;
  const holdAmount = holdMode === "percent"
    ? holdAmountFromPercent(gross, holdPercent || 0)
    : Math.round(holdAmountInput || 0);
  const { gstAmount: gstAmt, netAfterHold } = billFinancials({ gross, gstPercent, retentionAmount: holdAmount, advanceRecovery: recoveryAmount || 0 });
  const maxRecovery = pendingAdvances.reduce((s, sl) => s + sl.balance, 0);
  const payableNow = netAfterHold;

  async function handleSubmit() {
    const validItems = lineItems.filter((li) => li.description.trim() && li.billedQty > 0);
    if (validItems.length === 0) {
      message.error("Add at least one work item with a description and quantity > 0");
      return;
    }
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    const project = projects.find((p) => p.id === projectId);
    const contractor = selectedContractor;

    const linkedBills = linkedBillIds.map(id => {
      const found = woExistingBills.find(b => b.id === id);
      return { billId: id, billNo: found?.billNo ?? id, relationshipType: relType };
    });

    // Distribute the entered recovery amount across outstanding slips
    // oldest-first, capped at each slip's own balance — same allocation
    // Accounts Payment's own late-stage recovery picker already uses.
    const recoveries: { slipId: string; amount: number }[] = [];
    let remaining = recoveryAmount || 0;
    for (const slip of pendingAdvances) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, slip.balance);
      if (take > 0) recoveries.push({ slipId: slip._id, amount: take });
      remaining -= take;
    }

    const linkedToScopeItems = validItems.some((li) => li.scopeItemId);

    const payload = {
      billDate:          dayjs(values.billDate as string).toISOString(),
      projectId:         projectId || undefined,
      projectName:       project?.name ?? "",
      vendorCode:        selectedPayee?.vendorCode ?? contractor?.vendorCode ?? "",
      vendorName:        selectedPayee?.companyName ?? contractor?.companyName ?? "",
      generatedBy:       values.generatedBy ?? "",
      contractorRefNo:   values.contractorRefNo ?? "",
      remarks:           values.remarks ?? "",
      gstPercent,
      tdsPercent:        0,
      billType,
      relationshipType:  linkedBills.length > 0 ? relType : "NONE",
      linkedBills:       linkedBills.length > 0 ? linkedBills : [],
      workOrderId:       linkedToScopeItems ? (importedFromWOId || selectedWOId || undefined) : (selectedWOId || undefined),
      retentionPercent:  holdMode === "percent" ? (holdPercent || 0) : (gross > 0 ? Math.round((holdAmount / gross) * 10000) / 100 : 0),
      retentionAmount:   holdAmount,
      ...(recoveries.length ? { advanceRecoveries: recoveries } : {}),
      lineItems: validItems.map(({ key: _k, lastBilledQty: _l, percentComplete: _p, groupLabel: _g, ...rest }) => ({
        ...rest,
        amount: rest.billedQty * rest.rate,
      })),
    };

    setSaving(true);
    try {
      const res = await apiClient.post<{ bill: Record<string, unknown> }>("/bills", payload);
      message.success(`Bill ${res.data.bill.billNo} created — awaiting maker confirmation`);
      onCreated(res.data.bill);
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to create bill");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      width={880}
      title={
        <Space>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>New Bill</div>
            <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
              Select project → contractor → add work items → submit — lands in Draft, awaiting maker confirmation
            </div>
          </div>
        </Space>
      }
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button size="large" onClick={onClose}>Cancel</Button>
          <Button
            size="large"
            type="primary"
            loading={saving}
            onClick={handleSubmit}
            style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
          >
            Save as Draft
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
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="Site / Project" name="projectId">
                <Select
                  showSearch
                  allowClear
                  placeholder="Select project…"
                  style={{ width: "100%" }}
                  onChange={(v) => { setProjectId(v || ""); setWoList([]); }}
                  filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                  options={selectableProjects(projects).map((p) => ({ value: p.id, label: `${p.code ? p.code + " — " : ""}${p.name}` }))}
                />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item label="Contractor *" name="contractorId" rules={[{ required: true, message: "Select a contractor" }]}>
                <Select
                  showSearch
                  placeholder="Search by name or vendor code…"
                  style={{ width: "100%" }}
                  onChange={(v) => setContractorId(v || "")}
                  filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                  options={contractors.map((c) => ({
                    value: c.id,
                    label: `${vendorLabel(c.companyName, c.shortCode)}  (${c.vendorCode})`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Vendor Code">
                <Input
                  value={selectedContractor?.vendorCode || ""}
                  disabled
                  style={{ background: "var(--nx-white)", color: "#FF7A00", fontWeight: 700, fontFamily: "monospace" }}
                  placeholder="Auto-filled"
                />
              </Form.Item>
            </Col>
          </Row>

          {groupSiblings.length > 1 && (
            <Row gutter={16}>
              <Col span={16}>
                <Form.Item
                  label="Pay To (Vendor Group)"
                  tooltip={`${selectedContractor?.companyName} is part of a Vendor Group — this bill's payment can go to any member, not just the one whose Work Order this is.`}
                >
                  <Select
                    style={{ width: "100%" }}
                    value={payeeVendorCode}
                    onChange={(v) => setPayeeVendorCode(v)}
                    options={groupSiblings.map((c) => ({
                      value: c.vendorCode,
                      label: `${vendorLabel(c.companyName, c.shortCode)}  (${c.vendorCode})${c.vendorCode === selectedContractor?.vendorCode ? " — this work order's own vendor" : ""}`,
                    }))}
                  />
                </Form.Item>
              </Col>
            </Row>
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
            <Col span={isCustomGst ? 4 : 8}>
              <Form.Item label="GST Slab" name="gstPercent" initialValue={18} tooltip="GST % applicable on this bill. TDS deduction is handled at payment time.">
                <Select
                  onChange={(v) => {
                    if (v === -1) { setIsCustomGst(true); return; }
                    setIsCustomGst(false);
                    setGstPercent(Number(v));
                  }}
                  options={[
                    { label: "0% — Exempt / Nil", value: 0 },
                    { label: "5%", value: 5 },
                    { label: "12%", value: 12 },
                    { label: "18% (Standard)", value: 18 },
                    { label: "Custom…", value: -1 },
                  ]}
                />
              </Form.Item>
            </Col>
            {isCustomGst && (
              <Col span={4}>
                <Form.Item label="Custom %">
                  <InputNumber style={{ width: "100%" }} min={0} max={100} value={gstPercent} onChange={(v) => setGstPercent(Number(v) || 0)} />
                </Form.Item>
              </Col>
            )}
            <Col span={8}>
              <Form.Item label="Bill Type" tooltip="Categorise what kind of bill this is for the billing chain">
                <Select
                  value={billType}
                  onChange={v => setBillType(v)}
                  options={Object.entries(BILL_TYPE_CFG).map(([k, v]) => ({ value: k, label: v.label }))}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Bill Relationship — link to existing bills on this WO */}
          <div style={{ background: "#f0f6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#1d4ed8", marginBottom: 10 }}>
              Bill Relationship (optional)
              <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: 8 }}>Link this bill to existing bills in a Work Order</span>
            </div>
            <Row gutter={12}>
              <Col span={10}>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Select Work Order</div>
                <Select
                  showSearch allowClear placeholder="Search work order…"
                  style={{ width: "100%" }}
                  value={selectedWOId || undefined}
                  onChange={(v) => { handleWOSelectForLinking(v || ""); setLinkedBillIds([]); }}
                  filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                  options={woList.map(wo => ({ value: wo.id, label: `${wo.workOrderNo}` }))}
                />
              </Col>
              <Col span={14}>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Relationship Type</div>
                <Select
                  value={relType}
                  onChange={v => setRelType(v)}
                  style={{ width: "100%" }}
                  options={RELATIONSHIP_OPTIONS}
                />
              </Col>
            </Row>
            {woExistingBills.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                  Select bills this new bill relates to:
                  {["SUPERSEDES", "REVISION_OF", "CORRECTION_OF"].includes(relType) && (
                    <span style={{ color: "#dc2626", marginLeft: 6, fontWeight: 600 }}>
                      ⚠ Selected bills will be marked inactive (superseded)
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {woExistingBills.map(b => {
                    const isSelected = linkedBillIds.includes(b.id);
                    const isSuperseded = b.isActive === false;
                    return (
                      <div
                        key={b.id}
                        onClick={() => {
                          if (isSuperseded) return;
                          setLinkedBillIds(prev =>
                            prev.includes(b.id) ? prev.filter(x => x !== b.id) : [...prev, b.id]
                          );
                        }}
                        style={{
                          border: `1.5px solid ${isSelected ? "#2563eb" : "#e4e7ee"}`,
                          borderRadius: 6, padding: "6px 10px", cursor: isSuperseded ? "not-allowed" : "pointer",
                          background: isSelected ? "#eff6ff" : isSuperseded ? "#f9fafb" : "#fff",
                          opacity: isSuperseded ? 0.5 : 1, fontSize: 12, userSelect: "none",
                        }}
                      >
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: isSelected ? "#2563eb" : "#FF7A00" }}>
                          {b.billNo}
                        </span>
                        <span style={{ color: "#9ba3b8", marginLeft: 6 }}>
                          ₹{b.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span style={{ marginLeft: 6 }}><StatusTag status={b.status} /></span>
                        {isSuperseded && <Tag color="default" style={{ fontSize: 10 }}>Superseded</Tag>}
                        {isSelected && <span style={{ color: "#2563eb", marginLeft: 4 }}>✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

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
            Items imported from a work order show a Master Qty + % of Work Done — quantity auto-computes from the percent
          </span>
        </div>

        <div style={{ border: "1px solid #e4e7ee", borderRadius: 8, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "#f5f6f8" }}>
                <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "left" }}>Description of Work *</th>
                <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "center", width: 70 }}>Unit</th>
                <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "right", width: 90 }}>Master Qty</th>
                <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "right", width: 110 }}>% of Work</th>
                <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "right", width: 100 }}>Quantity *</th>
                <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "right", width: 120 }}>Rate (₹) *</th>
                <th style={{ padding: "8px 10px", fontWeight: 700, fontSize: 11, color: "#5a6278", textAlign: "right", width: 130 }}>Amount (₹)</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rows: ReactNode[] = [];
                const seenGroups = new Set<string>();
                lineItems.forEach((item, i) => {
                  const groupKey = item.scopeItemId && item.subItemId ? item.scopeItemId : null;

                  if (groupKey && !seenGroups.has(groupKey)) {
                    seenGroups.add(groupKey);
                    const isExpanded = expandedGroups.has(groupKey);
                    const particulars = lineItems.filter((li) => li.scopeItemId === groupKey && li.subItemId);
                    const groupAmount = particulars.reduce((s, li) => s + (li.amount || 0), 0);
                    rows.push(
                      <tr
                        key={`group-${groupKey}`}
                        onClick={() => setExpandedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
                          return next;
                        })}
                        style={{ background: "#f0f6ff", borderBottom: "1px solid #dbeafe", cursor: "pointer" }}
                      >
                        <td colSpan={6} style={{ padding: "8px 10px", fontWeight: 700, fontSize: 12, color: "#1d4ed8" }}>
                          <span style={{ display: "inline-block", transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", marginRight: 8 }}>▶</span>
                          {item.groupLabel}
                          <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: 8 }}>
                            {particulars.length} particular{particulars.length === 1 ? "" : "s"} — click to {isExpanded ? "collapse" : "add % of work done per particular"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: groupAmount > 0 ? "#16a85a" : "#c0c4cc" }}>
                          {groupAmount > 0 ? fmt(groupAmount) : "—"}
                        </td>
                        <td></td>
                      </tr>
                    );
                  }

                  if (groupKey && !expandedGroups.has(groupKey)) return;

                  const cap = remainingPercent(item);
                  rows.push(
                    <tr key={item.key} style={{ background: groupKey ? "#fafcff" : i % 2 === 0 ? "#fff" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "6px 8px", paddingLeft: groupKey ? 26 : 8 }}>
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
                      <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: "monospace", color: "#6b7280" }}>
                        {item.scopeItemId ? item.plannedQty : "—"}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        {item.scopeItemId ? (
                          <div>
                            <InputNumber
                              min={0}
                              max={cap ?? 100}
                              value={item.percentComplete || undefined}
                              placeholder="0"
                              onChange={(v) => updateLineItem(item.key, "percentComplete", Number(v) || 0)}
                              style={{ width: "100%" }}
                              bordered={false}
                              formatter={(v) => (v ? `${v}%` : "")}
                              parser={(v) => (v ?? "").replace("%", "") as unknown as number}
                            />
                            {cap != null && <div style={{ fontSize: 10, color: "#9ba3b8", textAlign: "right" }}>{cap}% remaining</div>}
                          </div>
                        ) : (
                          <span style={{ color: "#c0c4cc", fontSize: 11, display: "block", textAlign: "right" }}>—</span>
                        )}
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
                          <Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={lineItems.length === 1} />
                        </Popconfirm>
                      </td>
                    </tr>
                  );
                });
                return rows;
              })()}
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

        {/* Financial Summary — Gross/GST, then Hold and Advance Recovery both
            decided right here at creation time, both live-reducing what's shown
            as actually payable. */}
        <div style={{ border: "1px solid #e4e7ee", borderRadius: 8, overflow: "hidden", marginTop: 12 }}>
          <div style={{ background: "#fff8f3", borderBottom: "1px solid #f8c9a0", padding: "8px 14px" }}>
            <span style={{ fontWeight: 700, fontSize: 12, color: "#d4620c", textTransform: "uppercase", letterSpacing: "0.06em" }}>Financial Summary</span>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: "1px solid #f5f6f8", color: "#1a1f2e" }}>
              <span>Gross Amount</span><span>{fmt(gross)}</span>
            </div>
          </div>

          {/* Hold — taken off the gross first, since it's a security deposit on the
              contractor's own basic value, not on the GST they merely collect on
              the government's behalf. GST below is calculated on what's left. */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #f5f6f8", background: "#fefce8" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: "#92400e" }}>Hold (Retention)</span>
              <Radio.Group size="small" value={holdMode} onChange={(e) => setHoldMode(e.target.value)}>
                <Radio.Button value="percent">%</Radio.Button>
                <Radio.Button value="amount">₹</Radio.Button>
              </Radio.Group>
            </div>
            {holdMode === "percent" ? (
              <InputNumber<number>
                style={{ width: "100%" }} min={0} max={100} suffix="%"
                value={holdPercent}
                onChange={(v) => setHoldPercent(Number(v) || 0)}
                placeholder="0 — leave blank to skip"
              />
            ) : (
              <InputNumber<number>
                style={{ width: "100%" }} min={0} max={gross} prefix="₹"
                value={holdAmountInput}
                onChange={(v) => setHoldAmountInput(Number(v) || 0)}
                placeholder="0 — leave blank to skip"
              />
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 6, color: "#b45309", fontFamily: "monospace" }}>
              <span>Held this bill</span><span>− {fmt(holdAmount)}</span>
            </div>
          </div>

          {/* Advance Recovery — deducted (along with Hold, above) BEFORE GST is
              calculated, not after, so it's shown here rather than below. */}
          {!advancesUnavailable && (
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #f5f6f8", background: "#fff7ed" }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#92400e", marginBottom: 8 }}>Advance Recovery</div>
              {advancesLoading && <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8 }}>Checking pending advances…</div>}
              {!advancesLoading && pendingAdvances.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {pendingAdvances.map(slip => (
                    <div key={slip._id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid #fde68a" }}>
                      <span style={{ color: "#78350f" }}>{slip.slipNo}{slip.reference ? ` — ${slip.reference}` : ""}</span>
                      <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#b45309" }}>Balance: {fmt(slip.balance)}</span>
                    </div>
                  ))}
                </div>
              )}
              {!advancesLoading && pendingAdvances.length === 0 && (
                <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8 }}>No outstanding advance slips for this vendor on this project.</div>
              )}
              <InputNumber<number>
                style={{ width: "100%" }}
                prefix="− ₹"
                value={recoveryAmount}
                onChange={setRecoveryAmount}
                min={0}
                max={maxRecovery > 0 ? maxRecovery : undefined}
                precision={0}
                placeholder="0 — leave blank to skip recovery"
                disabled={pendingAdvances.length === 0}
              />
              <div style={{ fontSize: 11, color: "#92400e", marginTop: 6 }}>
                Recovered right now, real-time — the advance slip's own balance updates immediately.
              </div>
            </div>
          )}

          <div style={{ fontFamily: "monospace", fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: "1px solid #f5f6f8", color: "#1a1f2e" }}>
              <span>Net Before GST</span><span>{fmt(gross - holdAmount - (recoveryAmount || 0))}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", borderBottom: "1px solid #f5f6f8", color: "#16a85a" }}>
              <span>+ GST @ {gstPercent}%</span><span>{fmt(gstAmt)}</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#fff8f3", fontWeight: 800, fontSize: 15, color: "#d4620c" }}>
            <span>Payable Now</span>
            <span>{fmt(payableNow)}</span>
          </div>
          <div style={{ padding: "6px 14px", fontSize: 11, color: "#9ba3b8", borderTop: "1px solid #f5f6f8" }}>
            TDS deduction is recorded at payment initiation time
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical">
        <Form.Item label="Remarks" name="remarks">
          <Input.TextArea rows={2} placeholder="Describe the scope of work covered in this bill…" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
