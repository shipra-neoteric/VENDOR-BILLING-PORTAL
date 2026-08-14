import { useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Col,
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
  Upload,
  message,
} from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { Download, Plus, Eye, Pencil, Trash2 } from "lucide-react";

import PageShell from "../../components/PageShell";
import ContractorDetailView from "../../components/ContractorDetailView";
import { downloadContractorListPDF } from "../../components/ContractorListPDF";
import apiClient from "../../services/apiClient";
import type { Contractor, VendorGroup } from "../../types/VendorBilling";
import { vendorLabel } from "../../utils/vendorLabel";
import Btn from "../../ui/Btn";
import ConfirmModal from "../../ui/ConfirmModal";
import { SearchFilter } from "../../ui/Filters";

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

// ── Vendor Group select — pick an existing group or type a new name to
// create one on the fly (POST /vendor-groups), same "type to add" pattern
// used for Categories elsewhere in the app. Purely internal — lets several
// vendor codes belonging to the same real business (e.g. "Ambika
// Construction" has multiple individually-registered members) share bill
// payee routing later on.
function GroupCreatableSelect({
  value, groups, onSelect, onClear, onCreated,
}: {
  value?: string | null;
  groups: VendorGroup[];
  onSelect: (groupId: string) => void;
  onClear: () => void;
  onCreated: (group: VendorGroup) => void;
}) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const trimmed = search.trim();
  const exists = trimmed.length > 0 && groups.some(g => g.name.toLowerCase() === trimmed.toLowerCase());
  const CREATE_VALUE = "__create_new__";
  const options = [
    ...groups.map(g => ({ label: `${g.name}${g.memberCount ? ` (${g.memberCount} members)` : ""}`, value: g.id })),
    ...(trimmed.length > 0 && !exists ? [{ label: `+ Add "${trimmed}" as new vendor group`, value: CREATE_VALUE }] : []),
  ];

  async function handleChange(v: string) {
    if (v !== CREATE_VALUE) {
      onSelect(v);
      setSearch("");
      return;
    }
    setCreating(true);
    try {
      const res = await apiClient.post<{ group: VendorGroup }>("/vendor-groups", { name: trimmed });
      const group = normalizeId(res.data.group) as unknown as VendorGroup;
      onCreated(group);
      onSelect(group.id);
      message.success(`Vendor group "${group.name}" created`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || "Failed to create vendor group");
    } finally {
      setCreating(false);
      setSearch("");
    }
  }

  return (
    <Select
      placeholder="No group — standalone vendor"
      value={value || undefined}
      options={options}
      onChange={handleChange}
      allowClear
      onClear={() => { onClear(); setSearch(""); }}
      showSearch
      searchValue={search}
      onSearch={setSearch}
      filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
      loading={creating}
      notFoundContent={creating ? "Adding..." : "Type a name to add it"}
    />
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function Contractors() {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]           = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editingContractor, setEditingContractor] = useState<Contractor | null>(null);
  const [viewOpen, setViewOpen]       = useState(false);
  const [selected, setSelected]       = useState<Contractor | null>(null);
  const [vendorGroups, setVendorGroups] = useState<VendorGroup[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contractor | null>(null);
  const [form] = Form.useForm();

  // ── Load ──────────────────────────────────────────────────────
  useEffect(() => {
    apiClient
      .get<{ contractors: Contractor[] }>("/contractors")
      .then((r) => setContractors(r.data.contractors.map(normalizeId)))
      .catch(() => {})
      .finally(() => setLoading(false));
    apiClient
      .get<{ groups: VendorGroup[] }>("/vendor-groups")
      .then((r) => setVendorGroups(r.data.groups.map(normalizeId)))
      .catch(() => {});
  }, []);

  const groupById = (id?: string | null) => vendorGroups.find((g) => g.id === id);

  const filtered = contractors.filter(
    (c) =>
      c.vendorCode.toLowerCase().includes(search.toLowerCase()) ||
      c.companyName.toLowerCase().includes(search.toLowerCase()) ||
      c.mobile.includes(search)
  );

  // ── Register / Edit ──────────────────────────────────────────────
  const handleRegister = async () => {
    try {
      const values = await form.validateFields();
      const payload = { ...values, groupId };
      setSaving(true);
      if (editingContractor) {
        const res = await apiClient.put<{ contractor: Contractor }>(`/contractors/${editingContractor.id}`, payload);
        const updated = normalizeId(res.data.contractor);
        setContractors((prev) => prev.map((c) => (c.id === editingContractor.id ? updated : c)));
        message.success(`${res.data.contractor.companyName} updated`);
      } else {
        const res = await apiClient.post<{ contractor: Contractor }>("/contractors", payload);
        setContractors((prev) => [normalizeId(res.data.contractor), ...prev]);
        message.success(`${res.data.contractor.companyName} registered as ${res.data.contractor.vendorCode}`);
      }
      form.resetFields();
      setGroupId(null);
      setEditingContractor(null);
      setRegisterOpen(false);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return; // validation error
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (record: Contractor) => {
    form.setFieldsValue(record);
    setGroupId(record.groupId || null);
    setEditingContractor(record);
    setRegisterOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/contractors/${deleteTarget.id}`);
      setContractors((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      message.success(`"${vendorLabel(deleteTarget.companyName, deleteTarget.shortCode)}" deleted`);
      setDeleteTarget(null);
    } catch (err: any) {
      message.error(err?.response?.data?.message || "Delete failed");
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
    {
      title: "Company",
      dataIndex: "companyName",
      width: 200,
      render: (v: string, r: Contractor) => vendorLabel(v, r.shortCode),
    },
    { title: "Owner", dataIndex: "ownerName", width: 150 },
    { title: "Mobile", dataIndex: "mobile", width: 130 },
    {
      title: "Vendor Group",
      dataIndex: "groupId",
      width: 150,
      render: (v: string | null | undefined) => {
        const group = groupById(v);
        return group ? <Tag color="purple">{group.name}</Tag> : <span style={{ color: "#9CA3AF" }}>—</span>;
      },
    },
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
        <div style={{ display: "flex", gap: 4 }}>
          <Btn
            small color="blue" icon={Eye} title="View Contractor"
            onClick={() => {
              setSelected(record);
              setViewOpen(true);
              // The list omits each contractor's uploaded documents (GST/PAN certs
              // etc. can run MBs as base64) to keep it fast — fetch the full record
              // here so the profile drawer's download links actually work.
              apiClient.get<{ contractor: Contractor }>(`/contractors/${record.id}`).then(res => {
                const full = normalizeId(res.data.contractor);
                setSelected(full);
                setContractors(prev => prev.map(c => c.id === record.id ? full : c));
              }).catch(() => {});
            }}
          />
          <Btn small color="amber" icon={Pencil} title="Edit Contractor" onClick={() => openEdit(record)} />
          <Btn small color="red" icon={Trash2} title="Delete Contractor" onClick={() => setDeleteTarget(record)} />
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="Contractors"
      description="Manage registered vendors and sub-contractors."
      cta={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn
            label="Download List" icon={Download} outline
            onClick={() => downloadContractorListPDF(contractors, vendorGroups)}
          />
          <Btn
            label="Register Contractor" icon={Plus} color="primary"
            onClick={() => { form.resetFields(); setGroupId(null); setEditingContractor(null); setRegisterOpen(true); }}
          />
        </div>
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
        <SearchFilter
          placeholder="Search by vendor code, company name, or mobile…"
          value={search}
          onChange={setSearch}
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
        onClose={() => { setRegisterOpen(false); setEditingContractor(null); }}
        placement="right"
        width={640}
        title={
          <Space>
            <span style={{ fontSize: 20 }}>👷</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{editingContractor ? "Edit Contractor" : "Register Contractor"}</div>
              <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>
                {editingContractor ? `Editing ${editingContractor.vendorCode}` : "Fill in firm, bank, and tax details"}
              </div>
            </div>
          </Space>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => { setRegisterOpen(false); setEditingContractor(null); }}>
              Cancel
            </Button>
            <Button
              size="large"
              type="primary"
              loading={saving}
              onClick={handleRegister}
              style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
            >
              {editingContractor ? "Save Changes" : "Register Contractor"}
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
              <Form.Item
                label="Short Form (optional)"
                name="shortCode"
                tooltip="If this vendor code is really part of a bigger firm billed under several separate vendor codes for tax reasons, tag them all with the same short form (e.g. 'D') — it'll show in brackets next to the company name."
              >
                <Input placeholder="e.g. D" maxLength={10} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Owner Name" name="ownerName" rules={[{ required: true }]}>
                <Input placeholder="e.g. Rajesh Sharma" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Vendor Group (optional)"
                tooltip="If this vendor code is one of several individually-registered members of the same real business (e.g. different people at 'Ambika Construction' each with their own vendor code), group them here — a bill against any member's work order can then be paid into any other member's account."
              >
                <GroupCreatableSelect
                  value={groupId}
                  groups={vendorGroups}
                  onSelect={setGroupId}
                  onClear={() => setGroupId(null)}
                  onCreated={(group) => setVendorGroups((prev) => [...prev, group])}
                />
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
            <Col span={8}>
              <Form.Item label="GST Number" name="gstNumber">
                <Input placeholder="15-char GST" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="PAN Number" name="panNumber">
                <Input placeholder="10-char PAN" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Aadhaar Number" name="aadhaarNumber">
                <Input placeholder="12-digit Aadhaar" />
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
                <div style={{ fontWeight: 700, fontSize: 16 }}>{vendorLabel(selected.companyName, selected.shortCode)}</div>
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
        {selected && <ContractorDetailView contractor={selected} />}
      </Drawer>

      {deleteTarget && (
        <ConfirmModal
          title={`Delete "${vendorLabel(deleteTarget.companyName, deleteTarget.shortCode)}"?`}
          message="This cannot be undone. Work orders and bills already raised against this contractor keep their own record of the name/contact — only the vendor master record itself is removed."
          confirmLabel="Yes, Delete" danger
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
        />
      )}
    </PageShell>
  );
}
