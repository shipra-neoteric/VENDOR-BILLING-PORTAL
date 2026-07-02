import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Upload,
  message,
} from "antd";
import {
  PlusOutlined,
  UploadOutlined,
  DownloadOutlined,
  ImportOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
} from "@ant-design/icons";
import * as XLSX from "xlsx";

import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import type { Contractor } from "../../types/VendorBilling";

const normalizeId = (obj: any) => ({ ...obj, id: obj._id || obj.id });

const WORK_OPTIONS = [
  "General Contractors",
  "Excavation",
  "Concrete",
  "Framing",
  "Steel",
  "Window & Door",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Fire Alarm & Sprinkler",
  "Roofing",
  "Insulation",
  "Drywall",
  "Taping",
  "Plaster",
  "Flooring",
  "Finish Carpentry",
  "Painting",
  "Masonry",
  "Landscaping",
];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: "#6B7280",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        borderBottom: "1px solid #E5E7EB",
        paddingBottom: 8,
        marginBottom: 16,
        marginTop: 24,
      }}
    >
      {children}
    </div>
  );
}

// ── Import field definitions ───────────────────────────────────

const IMPORT_FIELDS = [
  { key: "companyName",       label: "Company Name",        required: true },
  { key: "ownerName",         label: "Owner / Contact Name", required: false },
  { key: "mobile",            label: "Mobile / Phone",      required: false },
  { key: "alternateMobile",   label: "Alternate Mobile",    required: false },
  { key: "address",           label: "Address",             required: false },
  { key: "email",             label: "Email",               required: false },
  { key: "panNumber",         label: "PAN Number",          required: false },
  { key: "gstNumber",         label: "GST Number",          required: false },
  { key: "accountHolderName", label: "Account Holder Name", required: false },
  { key: "bankName",          label: "Bank Name",           required: false },
  { key: "accountNumber",     label: "Account Number",      required: false },
  { key: "ifscCode",          label: "IFSC Code",           required: false },
  { key: "branchName",        label: "Branch Name",         required: false },
  { key: "workTypes",         label: "Work Types",          required: false },
  { key: "reference1",        label: "Reference 1",         required: false },
  { key: "reference2",        label: "Reference 2",         required: false },
  { key: "averageTurnover",   label: "Average Turnover",    required: false },
];

// Auto-guess column mapping from Excel header names
const AUTO_GUESS: Record<string, string> = {
  "company name": "companyName", "companyname": "companyName", "company": "companyName",
  "firm name": "companyName", "firmname": "companyName", "firm": "companyName",
  "business name": "companyName", "vendor name": "companyName", "name of firm": "companyName",
  "party name": "companyName", "supplier name": "companyName",
  "owner name": "ownerName", "ownername": "ownerName", "owner": "ownerName",
  "contact person": "ownerName", "contact name": "ownerName", "proprietor": "ownerName",
  "proprietor name": "ownerName", "name": "ownerName", "person name": "ownerName",
  "director name": "ownerName", "partner name": "ownerName",
  "mobile": "mobile", "phone": "mobile", "mobile number": "mobile", "mobile no": "mobile",
  "phone number": "mobile", "contact no": "mobile", "contact number": "mobile",
  "phone no": "mobile", "mob": "mobile", "cell": "mobile", "cell number": "mobile",
  "telephone": "mobile", "tel": "mobile", "mob no": "mobile",
  "alternate mobile": "alternateMobile", "alt mobile": "alternateMobile",
  "alternate phone": "alternateMobile", "alt phone": "alternateMobile",
  "other mobile": "alternateMobile", "mobile 2": "alternateMobile",
  "address": "address", "addr": "address", "office address": "address",
  "email": "email", "email id": "email", "email address": "email", "mail": "email",
  "pan": "panNumber", "pan number": "panNumber", "pan no": "panNumber", "panno": "panNumber",
  "gst": "gstNumber", "gst number": "gstNumber", "gst no": "gstNumber", "gstin": "gstNumber",
  "account holder": "accountHolderName", "account holder name": "accountHolderName",
  "bank name": "bankName", "bank": "bankName", "bank nm": "bankName",
  "account number": "accountNumber", "account no": "accountNumber", "acc no": "accountNumber",
  "a/c no": "accountNumber", "ac no": "accountNumber",
  "ifsc": "ifscCode", "ifsc code": "ifscCode", "ifsc no": "ifscCode",
  "branch": "branchName", "branch name": "branchName",
  "work types": "workTypes", "work type": "workTypes", "type of work": "workTypes",
  "nature of work": "workTypes", "category": "workTypes", "work category": "workTypes",
  "reference 1": "reference1", "ref 1": "reference1", "reference1": "reference1",
  "reference 2": "reference2", "ref 2": "reference2", "reference2": "reference2",
  "turnover": "averageTurnover", "average turnover": "averageTurnover",
  "annual turnover": "averageTurnover",
};

function applyMapping(rawRows: Record<string, any>[], mapping: Record<string, string>) {
  return rawRows.map(raw => {
    const out: Record<string, any> = {};
    for (const [excelCol, fieldKey] of Object.entries(mapping)) {
      if (!fieldKey) continue;
      const val = raw[excelCol];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        out[fieldKey] = fieldKey === "averageTurnover" ? Number(val) : String(val).trim();
      }
    }
    return out;
  }).filter(r => r.companyName);
}

// ── Template download ──────────────────────────────────────────

function downloadTemplate() {
  const headers = [
    "Company Name", "Owner Name", "Mobile", "Alternate Mobile", "Address", "Email",
    "Account Holder Name", "Bank Name", "Account Number", "IFSC Code", "Branch Name",
    "GST Number", "PAN Number", "Work Types", "Reference 1", "Reference 2", "Average Turnover",
  ];
  const sample = [
    "ABC Construction", "Ramesh Kumar", "9876543210", "9988776655",
    "123 MG Road Bhopal", "ramesh@abc.com",
    "Ramesh Kumar", "SBI", "1234567890", "SBIN0001234", "Bhopal Main",
    "27AAAAA0000A1Z5", "ABCDE1234F", "Concrete, Excavation",
    "Suresh Jain", "", "5000000",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contractors");
  XLSX.writeFile(wb, "contractor_import_template.xlsx");
}

// ── Main Component ─────────────────────────────────────────────

export default function Contractors() {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [viewOpen, setViewOpen]       = useState(false);
  const [selected, setSelected]       = useState<Contractor | null>(null);
  const [form] = Form.useForm();

  // ── Import state ──────────────────────────────────────────────
  type ImportStep = "map" | "preview" | "done";
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importStep,      setImportStep]      = useState<ImportStep>("map");
  const [rawRows,         setRawRows]         = useState<Record<string, any>[]>([]);
  const [excelHeaders,    setExcelHeaders]    = useState<string[]>([]);
  const [colMapping,      setColMapping]      = useState<Record<string, string>>({});
  const [importRows,      setImportRows]      = useState<any[]>([]);
  const [importing,       setImporting]       = useState(false);
  const [importResult,    setImportResult]    = useState<{ created: any[]; skipped: any[]; errors: any[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetImport = () => {
    setImportStep("map");
    setRawRows([]);
    setExcelHeaders([]);
    setColMapping({});
    setImportRows([]);
    setImportResult(null);
    setImportModalOpen(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (raw.length === 0) { message.error("No data rows found in the file."); return; }

      const headers = Object.keys(raw[0]);
      // Auto-guess mapping
      const guessed: Record<string, string> = {};
      for (const h of headers) {
        const guess = AUTO_GUESS[h.trim().toLowerCase()];
        if (guess) guessed[h] = guess;
      }
      setRawRows(raw);
      setExcelHeaders(headers);
      setColMapping(guessed);
      setImportStep("map");
      setImportResult(null);
      setImportModalOpen(true);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleApplyMapping = () => {
    const mapped = applyMapping(rawRows, colMapping);
    if (mapped.length === 0) {
      message.error("No rows have a Company Name after mapping. Please map the Company Name column.");
      return;
    }
    setImportRows(mapped);
    setImportStep("preview");
  };

  const handleImport = async () => {
    if (importRows.length === 0) return;
    setImporting(true);
    try {
      const res = await apiClient.post<{ created: any[]; skipped: any[]; errors: any[] }>(
        "/contractors/bulk",
        { contractors: importRows }
      );
      setImportResult(res.data);
      setImportStep("done");
      if (res.data.created.length > 0) {
        setContractors(prev => [...res.data.created.map(normalizeId), ...prev]);
      }
      message.success(`Import done: ${res.data.created.length} added, ${res.data.skipped.length} skipped, ${res.data.errors.length} errors`);
    } catch {
      message.error("Import failed. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  // ── Load ──────────────────────────────────────────────────────
  useEffect(() => {
    apiClient
      .get<{ contractors: Contractor[] }>("/contractors")
      .then((r) => setContractors(r.data.contractors.map(normalizeId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = contractors.filter(
    (c) =>
      c.vendorCode.toLowerCase().includes(search.toLowerCase()) ||
      c.companyName.toLowerCase().includes(search.toLowerCase()) ||
      c.mobile.includes(search)
  );

  // ── Register ──────────────────────────────────────────────────
  const handleRegister = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const res = await apiClient.post<{ contractor: Contractor }>("/contractors", values);
      setContractors((prev) => [normalizeId(res.data.contractor), ...prev]);
      message.success(`${res.data.contractor.companyName} registered as ${res.data.contractor.vendorCode}`);
      form.resetFields();
      setRegisterOpen(false);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return; // validation error
    } finally {
      setSaving(false);
    }
  };

  // ── Columns ───────────────────────────────────────────────────
  const columns = [
    {
      title: "Vendor Code",
      dataIndex: "vendorCode",
      width: 120,
      render: (v: string) => (
        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00" }}>{v}</span>
      ),
    },
    { title: "Company", dataIndex: "companyName", width: 200 },
    { title: "Owner", dataIndex: "ownerName", width: 150 },
    { title: "Mobile", dataIndex: "mobile", width: 130 },
    {
      title: "Work Types",
      dataIndex: "workTypes",
      width: 200,
      render: (v: string[]) =>
        (v || []).slice(0, 2).map((t) => (
          <Tag key={t} style={{ marginBottom: 2 }}>
            {t}
          </Tag>
        )),
    },
    {
      title: "Status",
      dataIndex: "status",
      width: 90,
      render: (v: string) => (
        <Tag color={v === "active" ? "green" : "default"}>{(v || "").toUpperCase()}</Tag>
      ),
    },
    {
      title: "Actions",
      width: 110,
      render: (_: unknown, record: Contractor) => (
        <Button
          type="link"
          size="small"
          onClick={() => { setSelected(record); setViewOpen(true); }}
        >
          View Profile
        </Button>
      ),
    },
  ];

  return (
    <PageShell
      title="Contractors"
      description="Manage registered vendors and sub-contractors."
      cta={
        <Space>
          <Button
            icon={<DownloadOutlined />}
            size="large"
            onClick={downloadTemplate}
          >
            Download Template
          </Button>
          <Button
            icon={<ImportOutlined />}
            size="large"
            onClick={() => fileInputRef.current?.click()}
          >
            Import Excel
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => { form.resetFields(); setRegisterOpen(true); }}
            style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
          >
            Register Contractor
          </Button>
        </Space>
      }
    >
      {/* Search */}
      <div
        style={{
          background: "var(--nx-white)",
          border: "1px solid #E5E7EB",
          borderRadius: 10,
          padding: "14px 16px",
          marginBottom: 16,
        }}
      >
        <Input.Search
          placeholder="Search by vendor code, company name, or mobile…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ maxWidth: 420 }}
        />
      </div>

      {/* Table */}
      <div
        style={{
          background: "var(--nx-white)",
          border: "1px solid #E5E7EB",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <Spin spinning={loading}>
          <Table
            rowKey="id"
            dataSource={filtered}
            columns={columns}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{
              emptyText: loading ? " " : (
                <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>👷</div>
                  <div style={{ fontWeight: 600, color: "#374151" }}>
                    No contractors yet
                  </div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Click "Register Contractor" to add your first vendor.
                  </div>
                </div>
              ),
            }}
          />
        </Spin>
      </div>

      {/* ── Register Contractor Drawer ─────────────────────────── */}
      <Drawer
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        placement="right"
        width={640}
        title={
          <Space>
            <span style={{ fontSize: 20 }}>👷</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Register Contractor</div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                Fill in firm, bank, and tax details
              </div>
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => setRegisterOpen(false)}>
              Cancel
            </Button>
            <Button
              size="large"
              type="primary"
              loading={saving}
              onClick={handleRegister}
              style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
            >
              Register Contractor
            </Button>
          </div>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <SectionHeading>Firm Details</SectionHeading>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Company / Firm Name" name="companyName" rules={[{ required: true }]}>
                <Input placeholder="e.g. ABC Infra Pvt Ltd" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Owner Name" name="ownerName" rules={[{ required: true }]}>
                <Input placeholder="e.g. Rajesh Sharma" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Address" name="address" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Full address…" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Mobile" name="mobile" rules={[{ required: true }]}>
                <Input placeholder="10-digit mobile" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Alternate Mobile" name="alternateMobile">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Email" name="email">
            <Input type="email" placeholder="company@email.com" />
          </Form.Item>

          <SectionHeading>Bank Details</SectionHeading>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Account Holder Name" name="accountHolderName" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Bank Name" name="bankName" rules={[{ required: true }]}>
                <Input placeholder="e.g. HDFC Bank" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="Account Number" name="accountNumber">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="IFSC Code" name="ifscCode">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Branch" name="branchName">
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <SectionHeading>Tax Details</SectionHeading>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="GST Number" name="gstNumber">
                <Input placeholder="15-char GST" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="PAN Number" name="panNumber" rules={[{ required: true }]}>
                <Input placeholder="10-char PAN" />
              </Form.Item>
            </Col>
          </Row>

          <SectionHeading>Type of Work</SectionHeading>
          <Form.Item name="workTypes">
            <Checkbox.Group
              options={WORK_OPTIONS.map((w) => ({ label: w, value: w }))}
              style={{ display: "flex", flexWrap: "wrap", gap: "6px 0" }}
            />
          </Form.Item>

          <SectionHeading>References</SectionHeading>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Reference Company 1" name="reference1">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Reference Company 2" name="reference2">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Average Turnover (Lakhs)" name="averageTurnover">
            <InputNumber style={{ width: "100%" }} min={0} placeholder="e.g. 50" />
          </Form.Item>

          <SectionHeading>Documents</SectionHeading>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {["GST Certificate", "PAN Card", "Cancelled Cheque", "Business Card", "Aadhaar Card"].map(
              (doc) => (
                <Upload key={doc} beforeUpload={() => false} maxCount={1}>
                  <Button icon={<UploadOutlined />} style={{ width: 220 }}>
                    {doc}
                  </Button>
                </Upload>
              )
            )}
          </div>
        </Form>
      </Drawer>

      {/* ── View Profile Drawer ────────────────────────────────── */}
      <Drawer
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        placement="right"
        width={600}
        title={
          selected && (
            <Space>
              <span style={{ fontSize: 20 }}>👷</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.companyName}</div>
                <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                  {selected.vendorCode}
                </div>
              </div>
            </Space>
          )
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button size="large" onClick={() => setViewOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        {selected && (
          <>
            <SectionHeading>Firm Details</SectionHeading>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Vendor Code" span={2}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00" }}>
                  {selected.vendorCode}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Company">{selected.companyName}</Descriptions.Item>
              <Descriptions.Item label="Owner">{selected.ownerName}</Descriptions.Item>
              <Descriptions.Item label="Mobile">{selected.mobile}</Descriptions.Item>
              <Descriptions.Item label="Alt. Mobile">{selected.alternateMobile || "—"}</Descriptions.Item>
              <Descriptions.Item label="Email" span={2}>{selected.email || "—"}</Descriptions.Item>
              <Descriptions.Item label="Address" span={2}>{selected.address}</Descriptions.Item>
            </Descriptions>

            <SectionHeading>Bank Details</SectionHeading>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Account Holder">{selected.accountHolderName}</Descriptions.Item>
              <Descriptions.Item label="Bank">{selected.bankName}</Descriptions.Item>
              <Descriptions.Item label="Account No.">{selected.accountNumber}</Descriptions.Item>
              <Descriptions.Item label="IFSC">{selected.ifscCode}</Descriptions.Item>
              <Descriptions.Item label="Branch">{selected.branchName}</Descriptions.Item>
            </Descriptions>

            <SectionHeading>Tax Details</SectionHeading>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="GST">{selected.gstNumber || "—"}</Descriptions.Item>
              <Descriptions.Item label="PAN">{selected.panNumber}</Descriptions.Item>
            </Descriptions>

            <SectionHeading>Work Types</SectionHeading>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(selected.workTypes || []).map((t) => (
                <Tag key={t} color="orange">{t}</Tag>
              ))}
            </div>

            {(selected.reference1 || selected.reference2 || selected.averageTurnover) && (
              <>
                <SectionHeading>References</SectionHeading>
                <Descriptions column={1} size="small">
                  {selected.reference1 && (
                    <Descriptions.Item label="Reference 1">{selected.reference1}</Descriptions.Item>
                  )}
                  {selected.reference2 && (
                    <Descriptions.Item label="Reference 2">{selected.reference2}</Descriptions.Item>
                  )}
                  {selected.averageTurnover && (
                    <Descriptions.Item label="Avg. Turnover">
                      ₹{selected.averageTurnover} Lakhs
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </>
            )}
          </>
        )}
      </Drawer>

      {/* ── Import Modal (3-step) ──────────────────────────────── */}
      <Modal
        open={importModalOpen}
        onCancel={resetImport}
        width={980}
        title={
          <Space>
            <span style={{ fontSize: 20 }}>📥</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Import Contractors from Excel</div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                {importStep === "map"     && `${rawRows.length} rows detected — map your columns below`}
                {importStep === "preview" && `${importRows.length} contractors ready — review before importing`}
                {importStep === "done"    && importResult && `Done — ${importResult.created.length} added, ${importResult.skipped.length} skipped, ${importResult.errors.length} errors`}
              </div>
            </div>
          </Space>
        }
        footer={
          <Space>
            {importStep === "map" && (
              <>
                <Button size="large" onClick={resetImport}>Cancel</Button>
                <Button size="large" type="primary" onClick={handleApplyMapping} style={{ background: "#FF7A00", borderColor: "#FF7A00" }}>
                  Preview Mapped Data →
                </Button>
              </>
            )}
            {importStep === "preview" && (
              <>
                <Button size="large" onClick={() => setImportStep("map")}>← Back to Mapping</Button>
                <Button
                  size="large" type="primary" loading={importing}
                  onClick={handleImport}
                  style={{ background: "#16a85a", borderColor: "#16a85a" }}
                >
                  Import {importRows.length} Contractor{importRows.length !== 1 ? "s" : ""}
                </Button>
              </>
            )}
            {importStep === "done" && (
              <Button size="large" onClick={resetImport}>Close</Button>
            )}
          </Space>
        }
        destroyOnClose
      >
        {/* ── Step 1: Column Mapper ── */}
        {importStep === "map" && (
          <div>
            <Alert
              type="info" showIcon style={{ marginBottom: 16, borderRadius: 6 }}
              message="Map your Excel columns to contractor fields"
              description={`Your file has ${excelHeaders.length} columns. We've auto-guessed the mapping where possible — check and correct any mismatches. Only "Company Name" is required.`}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
              {IMPORT_FIELDS.map(field => (
                <div key={field.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ minWidth: 160, fontSize: 13, color: field.required ? "#1a1f2e" : "#5a6278", fontWeight: field.required ? 700 : 400 }}>
                    {field.label}
                    {field.required && <span style={{ color: "#e03b3b", marginLeft: 2 }}>*</span>}
                  </div>
                  <Select
                    allowClear
                    placeholder="— skip —"
                    style={{ flex: 1 }}
                    value={Object.entries(colMapping).find(([, v]) => v === field.key)?.[0] || undefined}
                    onChange={(excelCol) => {
                      setColMapping(prev => {
                        const next = { ...prev };
                        // Remove any existing mapping to this field
                        for (const k of Object.keys(next)) {
                          if (next[k] === field.key) delete next[k];
                        }
                        if (excelCol) next[excelCol] = field.key;
                        return next;
                      });
                    }}
                    options={[
                      ...excelHeaders.map(h => ({ label: h, value: h })),
                    ]}
                    showSearch
                    filterOption={(inp, opt) =>
                      String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())
                    }
                  />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: "10px 14px", background: "#f5f6f8", borderRadius: 8, fontSize: 12, color: "#5a6278" }}>
              <strong>Tip:</strong> Fields left as "— skip —" will be blank for imported contractors. You can always edit them later.
            </div>
          </div>
        )}

        {/* ── Step 2: Preview ── */}
        {importStep === "preview" && (
          <div>
            <Alert
              type="success" showIcon style={{ marginBottom: 12, borderRadius: 6 }}
              message={`${importRows.length} contractors mapped successfully`}
              description="Vendor codes (VC-XXXX) will be auto-assigned. Rows where the mobile number already exists in the system will be skipped automatically."
            />
            <Table
              size="small"
              rowKey={(_, i) => String(i)}
              dataSource={importRows}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              scroll={{ x: 900 }}
              columns={[
                { title: "Company Name", dataIndex: "companyName", width: 200, render: v => <strong style={{ color: "#1a1f2e" }}>{v}</strong> },
                { title: "Owner / Contact", dataIndex: "ownerName", width: 160, render: v => v || <span style={{ color: "#e4e7ee" }}>—</span> },
                { title: "Mobile", dataIndex: "mobile", width: 120, render: v => v || <span style={{ color: "#e4e7ee" }}>—</span> },
                { title: "PAN", dataIndex: "panNumber", width: 120, render: v => v || <span style={{ color: "#e4e7ee" }}>—</span> },
                { title: "Bank", dataIndex: "bankName", width: 130, render: v => v || <span style={{ color: "#e4e7ee" }}>—</span> },
                { title: "Work Types", dataIndex: "workTypes", width: 140, render: v => v || <span style={{ color: "#e4e7ee" }}>—</span> },
                {
                  title: "Status",
                  width: 80,
                  render: (_: unknown, row: any) =>
                    row.companyName
                      ? <Tag color="green" style={{ fontSize: 11 }}>Ready</Tag>
                      : <Tag color="red" style={{ fontSize: 11 }}>Missing name</Tag>,
                },
              ]}
            />
          </div>
        )}

        {/* ── Step 3: Result ── */}
        {importStep === "done" && importResult && (
          <div>
            <Row gutter={12} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <div style={{ background: "#f0faf4", border: "1px solid #b7e8c8", borderRadius: 8, padding: "16px", textAlign: "center" }}>
                  <CheckCircleOutlined style={{ color: "#16a85a", fontSize: 28, marginBottom: 6 }} />
                  <div style={{ fontWeight: 800, fontSize: 32, color: "#16a85a" }}>{importResult.created.length}</div>
                  <div style={{ fontSize: 13, color: "#5a6278", fontWeight: 600 }}>Contractors Added</div>
                </div>
              </Col>
              <Col span={8}>
                <div style={{ background: "#fff8f3", border: "1px solid #f8c9a0", borderRadius: 8, padding: "16px", textAlign: "center" }}>
                  <MinusCircleOutlined style={{ color: "#f37916", fontSize: 28, marginBottom: 6 }} />
                  <div style={{ fontWeight: 800, fontSize: 32, color: "#f37916" }}>{importResult.skipped.length}</div>
                  <div style={{ fontSize: 13, color: "#5a6278", fontWeight: 600 }}>Skipped (duplicate)</div>
                </div>
              </Col>
              <Col span={8}>
                <div style={{ background: importResult.errors.length > 0 ? "#fff5f5" : "#f5f6f8", border: `1px solid ${importResult.errors.length > 0 ? "#ffcdd2" : "#e4e7ee"}`, borderRadius: 8, padding: "16px", textAlign: "center" }}>
                  <CloseCircleOutlined style={{ color: importResult.errors.length > 0 ? "#e03b3b" : "#9ba3b8", fontSize: 28, marginBottom: 6 }} />
                  <div style={{ fontWeight: 800, fontSize: 32, color: importResult.errors.length > 0 ? "#e03b3b" : "#9ba3b8" }}>{importResult.errors.length}</div>
                  <div style={{ fontSize: 13, color: "#5a6278", fontWeight: 600 }}>Errors</div>
                </div>
              </Col>
            </Row>

            {importResult.skipped.length > 0 && (
              <Alert type="warning" style={{ marginBottom: 10, borderRadius: 6 }}
                message={`${importResult.skipped.length} skipped — mobile number already in system`}
                description={importResult.skipped.slice(0, 5).map(s => s.row).join(", ") + (importResult.skipped.length > 5 ? ` + ${importResult.skipped.length - 5} more` : "")}
              />
            )}
            {importResult.errors.length > 0 && (
              <Alert type="error" style={{ marginBottom: 10, borderRadius: 6 }}
                message="Rows that failed"
                description={importResult.errors.slice(0, 5).map(e => `${e.row}: ${e.reason}`).join(" · ") + (importResult.errors.length > 5 ? ` + ${importResult.errors.length - 5} more` : "")}
              />
            )}
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
