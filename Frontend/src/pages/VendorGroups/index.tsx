import { useEffect, useState } from "react";
import { Button, Drawer, Form, Input, Select, Space, Spin, Table, Tag, message } from "antd";
import { PlusOutlined, TeamOutlined, UserDeleteOutlined } from "@ant-design/icons";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import { selectableProjects } from "../../utils/projectOptions";
import { vendorLabel } from "../../utils/vendorLabel";
import type { Contractor, Project, VendorGroup } from "../../types/VendorBilling";

const normalizeId = (obj: any) => ({ ...obj, id: obj._id || obj.id });
const fmt = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");

interface GroupMember {
  id: string;
  vendorCode: string;
  companyName: string;
  ownerName: string;
  mobile: string;
  status: string;
}

interface MemberProgress {
  vendorCode: string;
  companyName: string;
  workOrderCount: number;
  contractValue: number;
  billed: number;
  paid: number;
}

interface ProgressSummary {
  workOrderCount: number;
  contractValue: number;
  billed: number;
  paid: number;
}

export default function VendorGroups() {
  const [groups, setGroups] = useState<VendorGroup[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const [viewOpen, setViewOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<VendorGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [progressLoading, setProgressLoading] = useState(false);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [perMember, setPerMember] = useState<MemberProgress[]>([]);

  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [addMemberIds, setAddMemberIds] = useState<string[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    apiClient.get<{ groups: VendorGroup[] }>("/vendor-groups")
      .then((r) => setGroups(r.data.groups.map(normalizeId)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    apiClient.get<{ projects: any[] }>("/projects")
      .then((r) => setProjects(r.data.projects.map(normalizeId)))
      .catch(() => {});
    apiClient.get<{ contractors: any[] }>("/contractors")
      .then((r) => setContractors(r.data.contractors.map(normalizeId)))
      .catch(() => {});
  }, []);

  async function handleCreate() {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const res = await apiClient.post<{ group: VendorGroup }>("/vendor-groups", values);
      setGroups((prev) => [normalizeId(res.data.group), ...prev]);
      message.success(`Vendor group ${res.data.group.groupCode} created`);
      form.resetFields();
      setCreateOpen(false);
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.message || "Failed to create vendor group");
    } finally {
      setSaving(false);
    }
  }

  function loadMembers(groupId: string) {
    return apiClient.get<{ members: any[] }>(`/vendor-groups/${groupId}`)
      .then((r) => setMembers((r.data.members || []).map(normalizeId)))
      .catch(() => setMembers([]));
  }

  function openGroup(group: VendorGroup) {
    setSelectedGroup(group);
    setViewOpen(true);
    setProjectId("");
    setSummary(null);
    setPerMember([]);
    setAddMemberIds([]);
    loadMembers(group.id);
    loadProgress(group.id, "");
  }

  async function addMembers() {
    if (!selectedGroup || addMemberIds.length === 0) return;
    setAddingMembers(true);
    try {
      await Promise.all(addMemberIds.map((id) => apiClient.put(`/contractors/${id}`, { groupId: selectedGroup.id })));
      setContractors((prev) => prev.map((c) => (addMemberIds.includes(c.id) ? { ...c, groupId: selectedGroup.id } : c)));
      setAddMemberIds([]);
      await loadMembers(selectedGroup.id);
      setGroups((prev) => prev.map((g) => (g.id === selectedGroup.id ? { ...g, memberCount: (g.memberCount || 0) + addMemberIds.length } : g)));
      message.success(`${addMemberIds.length} member${addMemberIds.length !== 1 ? "s" : ""} added`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || "Failed to add members");
    } finally {
      setAddingMembers(false);
    }
  }

  async function removeMember(member: GroupMember) {
    if (!selectedGroup) return;
    setRemovingId(member.id);
    try {
      await apiClient.put(`/contractors/${member.id}`, { groupId: null });
      setContractors((prev) => prev.map((c) => (c.id === member.id ? { ...c, groupId: null } : c)));
      await loadMembers(selectedGroup.id);
      setGroups((prev) => prev.map((g) => (g.id === selectedGroup.id ? { ...g, memberCount: Math.max(0, (g.memberCount || 0) - 1) } : g)));
      message.success(`${member.companyName} removed from the group`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || "Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  }

  function loadProgress(groupId: string, forProjectId: string) {
    setProgressLoading(true);
    apiClient.get<{ summary: ProgressSummary; perMember: MemberProgress[] }>(
      `/vendor-groups/${groupId}/progress`, { params: forProjectId ? { projectId: forProjectId } : {} }
    )
      .then((r) => { setSummary(r.data.summary); setPerMember(r.data.perMember || []); })
      .catch(() => { setSummary(null); setPerMember([]); })
      .finally(() => setProgressLoading(false));
  }

  const columns = [
    {
      title: "Group Code",
      dataIndex: "groupCode",
      width: 120,
      render: (v: string) => <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#7c3aed" }}>{v}</span>,
    },
    { title: "Name", dataIndex: "name" },
    {
      title: "Members",
      dataIndex: "memberCount",
      width: 120,
      render: (v: number) => <Tag color={v > 0 ? "purple" : "default"}>{v ?? 0}</Tag>,
    },
    {
      title: "Actions",
      width: 140,
      render: (_: unknown, record: VendorGroup) => (
        <Button type="link" size="small" onClick={() => openGroup(record)}>View</Button>
      ),
    },
  ];

  const memberColumns = [
    { title: "Vendor Code", dataIndex: "vendorCode", width: 120, render: (v: string) => <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00" }}>{v}</span> },
    { title: "Company", dataIndex: "companyName" },
    { title: "Owner", dataIndex: "ownerName" },
    { title: "Mobile", dataIndex: "mobile", width: 130 },
    {
      title: "",
      width: 90,
      render: (_: unknown, record: GroupMember) => (
        <Button
          type="link" size="small" danger icon={<UserDeleteOutlined />}
          loading={removingId === record.id}
          onClick={() => removeMember(record)}
        >
          Remove
        </Button>
      ),
    },
  ];

  const progressColumns = [
    { title: "Vendor Code", dataIndex: "vendorCode", width: 120, render: (v: string) => <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#FF7A00" }}>{v}</span> },
    { title: "Company", dataIndex: "companyName" },
    { title: "Work Orders", dataIndex: "workOrderCount", width: 110, align: "right" as const },
    { title: "Contract Value", dataIndex: "contractValue", width: 140, align: "right" as const, render: fmt },
    { title: "Billed", dataIndex: "billed", width: 130, align: "right" as const, render: fmt },
    { title: "Paid", dataIndex: "paid", width: 130, align: "right" as const, render: (v: number) => <span style={{ color: "#16a34a", fontWeight: 600 }}>{fmt(v)}</span> },
  ];

  return (
    <PageShell
      title="Vendor Groups"
      description="Internal grouping only — several individually-registered vendor codes belonging to the same real business, so a bill can be paid into any member's account regardless of whose work order it's under."
      cta={
        <Button
          type="primary" icon={<PlusOutlined />} size="large"
          onClick={() => { form.resetFields(); setCreateOpen(true); }}
          style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
        >
          New Vendor Group
        </Button>
      }
    >
      <div style={{ background: "var(--nx-white)", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
        <Spin spinning={loading}>
          <Table
            rowKey="id"
            dataSource={groups}
            columns={columns}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            locale={{
              emptyText: loading ? " " : (
                <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}><TeamOutlined /></div>
                  <div style={{ fontWeight: 600, color: "#374151" }}>No vendor groups yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Click "New Vendor Group" to create one, then add members from inside it.
                  </div>
                </div>
              ),
            }}
          />
        </Spin>
      </div>

      {/* ── Create Drawer ─────────────────────────────────────── */}
      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        placement="right"
        width={480}
        title="New Vendor Group"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button size="large" type="primary" loading={saving} onClick={handleCreate} style={{ background: "#7c3aed", borderColor: "#7c3aed" }}>
              Create
            </Button>
          </div>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Group Name" name="name" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="e.g. Ambika Construction Group" />
          </Form.Item>
        </Form>
        <div style={{ fontSize: 12, color: "#9CA3AF" }}>
          You can add members right after creating the group — open it and search for contractors to add.
        </div>
      </Drawer>

      {/* ── Group Detail / Progress Drawer ────────────────────── */}
      <Drawer
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        placement="right"
        width={800}
        title={
          selectedGroup && (
            <Space>
              <TeamOutlined style={{ color: "#7c3aed" }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedGroup.name}</div>
                <div style={{ fontSize: 12, color: "#6B7280", fontWeight: 400 }}>{selectedGroup.groupCode}</div>
              </div>
            </Space>
          )
        }
        footer={<div style={{ display: "flex", justifyContent: "flex-end" }}><Button size="large" onClick={() => setViewOpen(false)}>Close</Button></div>}
        destroyOnClose
      >
        <div style={{ fontWeight: 700, fontSize: 13, color: "#374151", marginBottom: 8 }}>Members</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <Select
            mode="multiple"
            style={{ flex: 1 }}
            placeholder="Search contractors by name or vendor code to add…"
            showSearch
            value={addMemberIds}
            onChange={setAddMemberIds}
            filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
            options={contractors
              .filter((c) => !members.some((m) => m.id === c.id))
              .map((c) => ({
                label: `${vendorLabel(c.companyName, c.shortCode)} (${c.vendorCode})${c.groupId && c.groupId !== selectedGroup?.id ? " — currently in another group" : ""}`,
                value: c.id,
              }))}
          />
          <Button
            type="primary" loading={addingMembers} disabled={addMemberIds.length === 0}
            onClick={addMembers} style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
          >
            Add
          </Button>
        </div>

        <Table
          rowKey="id"
          size="small"
          dataSource={members}
          columns={memberColumns}
          pagination={false}
          locale={{ emptyText: "No members yet — search and add contractors above" }}
          style={{ marginBottom: 24 }}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>Progress</div>
          <Select
            allowClear
            placeholder="All Projects"
            style={{ width: 240 }}
            value={projectId || undefined}
            options={selectableProjects(projects).map((p) => ({ label: p.name, value: (p as any)._id || p.id }))}
            onChange={(v) => {
              const pid = v || "";
              setProjectId(pid);
              if (selectedGroup) loadProgress(selectedGroup.id, pid);
            }}
          />
        </div>

        <Spin spinning={progressLoading}>
          {summary && (
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Work Orders", value: summary.workOrderCount, color: "#374151" },
                { label: "Contract Value", value: fmt(summary.contractValue), color: "#374151" },
                { label: "Billed", value: fmt(summary.billed), color: "#d97706" },
                { label: "Paid", value: fmt(summary.paid), color: "#16a34a" },
              ].map((s) => (
                <div key={s.label} style={{ flex: 1, background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: s.color, marginTop: 2 }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
          <Table
            rowKey="vendorCode"
            size="small"
            dataSource={perMember}
            columns={progressColumns}
            pagination={false}
            locale={{ emptyText: "No work orders for this group yet" }}
          />
        </Spin>
      </Drawer>
    </PageShell>
  );
}
