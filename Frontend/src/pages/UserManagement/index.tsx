import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table, Button, Tag, Input, Form, Select, Switch,
  Drawer, Space, message, Row, Col, Popconfirm, Modal,
  Badge, Descriptions, Avatar,
} from "antd";
import {
  PlusOutlined, EditOutlined, KeyOutlined,
  UserOutlined, CheckCircleOutlined, StopOutlined, TeamOutlined,
} from "@ant-design/icons";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";
import { useAuth } from "../../context/AuthContext";
import dayjs from "dayjs";

// ── Types ─────────────────────────────────────────────────────────

interface AppUser {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

type UserRole = "owner" | "gm" | "engineer" | "accounts" | "dri" | "contractor";

// ── Role config ───────────────────────────────────────────────────

const ROLE_CFG: Record<UserRole, { label: string; color: string; description: string }> = {
  owner:      { label: "Owner / Admin",    color: "red",     description: "Full system access — all modules, user management" },
  gm:         { label: "General Manager",  color: "purple",  description: "All modules except user management" },
  engineer:   { label: "Site Engineer",    color: "blue",    description: "Work orders, progress, bill requests" },
  accounts:   { label: "Accounts",         color: "cyan",    description: "Bills, payments, ledger" },
  dri:        { label: "DRI (Field Eng.)", color: "orange",  description: "Work progress entry only — restricted portal" },
  contractor: { label: "Contractor",       color: "geekblue",description: "Read-only contractor portal" },
};

const ROLE_OPTIONS = Object.entries(ROLE_CFG).map(([value, { label, description }]) => ({
  value: value as UserRole,
  label,
  description,
}));

const AVATAR_COLORS: Record<UserRole, string> = {
  owner:      "#f37916",
  gm:         "#7c3aed",
  engineer:   "#1677ff",
  accounts:   "#0891b2",
  dri:        "#d4620c",
  contractor: "#3b5bdb",
};

// ── Helpers ───────────────────────────────────────────────────────

const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

// ── Stat Card ─────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: {
  label: string; value: number | string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: "var(--nx-white)",
      border: "1px solid var(--nx-border)",
      borderRadius: 12,
      padding: "18px 20px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || "var(--nx-text)", marginTop: 4, lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--nx-text-muted)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────

export default function UserManagement() {
  const { user: me } = useAuth();

  const [users, setUsers]     = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Create / Edit drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editUser, setEditUser]     = useState<AppUser | null>(null);
  const [saving, setSaving]         = useState(false);
  const [form]                      = Form.useForm();

  // Password modal
  const [pwdOpen, setPwdOpen]     = useState(false);
  const [pwdUser, setPwdUser]     = useState<AppUser | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdForm]                 = Form.useForm();

  // ── Load ──────────────────────────────────────────────────────

  const load = useCallback(() => {
    setLoading(true);
    apiClient
      .get<{ users: AppUser[] }>("/users")
      .then((r) => setUsers(r.data.users || []))
      .catch(() => message.error("Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived ───────────────────────────────────────────────────

  const myId = (me as unknown as { _id?: string; id?: string })?._id
    || (me as unknown as { id?: string })?.id;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const matchSearch =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        ROLE_CFG[u.role]?.label.toLowerCase().includes(q);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [users, search, roleFilter]);

  const stats = useMemo(() => ({
    total:    users.length,
    active:   users.filter((u) => u.isActive).length,
    inactive: users.filter((u) => !u.isActive).length,
    byRole:   ROLE_OPTIONS
      .map((r) => ({ ...r, count: users.filter((u) => u.role === r.value).length }))
      .filter((r) => r.count > 0),
  }), [users]);

  // ── Handlers ──────────────────────────────────────────────────

  function openCreate() {
    setEditUser(null);
    form.resetFields();
    form.setFieldsValue({ isActive: true, role: "engineer" });
    setDrawerOpen(true);
  }

  function openEdit(u: AppUser) {
    setEditUser(u);
    form.setFieldsValue({ name: u.name, email: u.email, role: u.role, isActive: u.isActive });
    setDrawerOpen(true);
  }

  async function handleSave() {
    let values: Record<string, unknown>;
    try { values = await form.validateFields(); } catch { return; }

    setSaving(true);
    try {
      if (editUser) {
        const res = await apiClient.put<{ user: AppUser }>(`/users/${editUser._id}`, values);
        setUsers((prev) => prev.map((u) => u._id === editUser._id ? res.data.user : u));
        message.success("User updated");
      } else {
        const res = await apiClient.post<{ user: AppUser }>("/users", values);
        setUsers((prev) => [res.data.user, ...prev]);
        message.success(`User ${res.data.user.name} created`);
      }
      setDrawerOpen(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function openPassword(u: AppUser) {
    setPwdUser(u);
    pwdForm.resetFields();
    setPwdOpen(true);
  }

  async function handlePassword() {
    let values: Record<string, unknown>;
    try { values = await pwdForm.validateFields(); } catch { return; }
    if (!pwdUser) return;

    setPwdSaving(true);
    try {
      await apiClient.patch(`/users/${pwdUser._id}/password`, { password: values.password });
      message.success(`Password updated for ${pwdUser.name}`);
      setPwdOpen(false);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to update password");
    } finally {
      setPwdSaving(false);
    }
  }

  async function handleToggleActive(u: AppUser) {
    try {
      const res = await apiClient.put<{ user: AppUser }>(`/users/${u._id}`, { isActive: !u.isActive });
      setUsers((prev) => prev.map((x) => x._id === u._id ? res.data.user : x));
      message.success(`${u.name} ${!u.isActive ? "activated" : "deactivated"}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed");
    }
  }

  async function handleDeactivate(u: AppUser) {
    try {
      await apiClient.delete(`/users/${u._id}`);
      setUsers((prev) => prev.map((x) => x._id === u._id ? { ...x, isActive: false } : x));
      message.success(`${u.name} deactivated`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      message.error(e?.response?.data?.message || "Failed to deactivate");
    }
  }

  // ── Table columns ─────────────────────────────────────────────

  const columns = [
    {
      title: "User",
      key: "user",
      render: (_: unknown, u: AppUser) => (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar
            style={{
              background: AVATAR_COLORS[u.role] || "#9ba3b8",
              fontWeight: 700,
              fontSize: 14,
              flexShrink: 0,
              opacity: u.isActive ? 1 : 0.5,
            }}
            size={40}
          >
            {initials(u.name)}
          </Avatar>
          <div>
            <div style={{ fontWeight: 700, color: "var(--nx-text)", fontSize: 15, lineHeight: 1.3 }}>
              {u.name}
              {myId === u._id && (
                <Tag color="orange" style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, verticalAlign: "middle" }}>You</Tag>
              )}
            </div>
            <div style={{ fontSize: 13, color: "var(--nx-text-muted)", marginTop: 1 }}>{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: "Role",
      dataIndex: "role",
      width: 200,
      render: (role: UserRole) => (
        <Tag color={ROLE_CFG[role]?.color || "default"} style={{ fontWeight: 600, fontSize: 12 }}>
          {ROLE_CFG[role]?.label || role}
        </Tag>
      ),
    },
    {
      title: "Status",
      dataIndex: "isActive",
      width: 140,
      render: (active: boolean, u: AppUser) => (
        <Switch
          checked={active}
          checkedChildren="Active"
          unCheckedChildren="Inactive"
          onChange={() => handleToggleActive(u)}
          style={{ background: active ? "#16a85a" : undefined, minWidth: 80 }}
        />
      ),
    },
    {
      title: "Joined",
      dataIndex: "createdAt",
      width: 130,
      render: (v: string) => (
        <span style={{ fontSize: 13, color: "var(--nx-text-muted)" }}>
          {dayjs(v).format("DD MMM YYYY")}
        </span>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 200,
      render: (_: unknown, u: AppUser) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(u)}
            style={{ fontSize: 13 }}>
            Edit
          </Button>
          <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => openPassword(u)}
            style={{ fontSize: 13 }}>
            Password
          </Button>
          {myId !== u._id && u.isActive && (
            <Popconfirm
              title={`Deactivate ${u.name}?`}
              description="They will lose access immediately."
              onConfirm={() => handleDeactivate(u)}
              okText="Deactivate"
              okButtonProps={{ danger: true }}
            >
              <Button type="link" size="small" danger icon={<StopOutlined />}
                style={{ fontSize: 13 }}>
                Disable
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────

  return (
    <PageShell
      title="User Management"
      description="Manage team members, roles, and access levels"
      cta={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={openCreate}
          style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
        >
          Add User
        </Button>
      }
    >
      {/* ── Stats ── */}
      <Row gutter={[14, 14]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <StatCard label="Total Users" value={stats.total} />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard label="Active" value={stats.active} color="#16a85a" />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard label="Inactive" value={stats.inactive} color="#e03b3b" />
        </Col>
        <Col xs={12} sm={6}>
          <div style={{
            background: "var(--nx-white)",
            border: "1px solid var(--nx-border)",
            borderRadius: 12,
            padding: "18px 20px",
            height: "100%",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nx-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
              By Role
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {stats.byRole.map((r) => (
                <Tag key={r.value} color={ROLE_CFG[r.value]?.color} style={{ fontWeight: 600, fontSize: 12 }}>
                  {r.label.split(" ")[0]} · {r.count}
                </Tag>
              ))}
            </div>
          </div>
        </Col>
      </Row>

      {/* ── Role Access Matrix ── */}
      <div style={{
        background: "var(--nx-fill)",
        border: "1px solid var(--nx-border)",
        borderRadius: 12,
        padding: "16px 20px",
        marginBottom: 20,
      }}>
        <div style={{
          fontWeight: 700,
          fontSize: 12,
          color: "var(--nx-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 14,
        }}>
          Role Access Matrix
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "10px 24px" }}>
          {ROLE_OPTIONS.map((r) => (
            <div key={r.value} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <Tag color={ROLE_CFG[r.value]?.color} style={{ fontWeight: 600, fontSize: 12, flexShrink: 0, marginTop: 1 }}>
                {r.label}
              </Tag>
              <span style={{ fontSize: 13, color: "var(--nx-text-3)", lineHeight: 1.5 }}>
                {r.description}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <Input.Search
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ width: 300 }}
        />
        <Select
          value={roleFilter}
          onChange={setRoleFilter}
          style={{ width: 200 }}
          options={[
            { label: "All Roles", value: "all" },
            ...ROLE_OPTIONS.map((r) => ({ label: r.label, value: r.value })),
          ]}
        />
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--nx-text-muted)" }}>
          {filtered.length} user{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <div style={{
        background: "var(--nx-white)",
        border: "1px solid var(--nx-border)",
        borderRadius: 12,
        overflow: "hidden",
      }}>
        <Table
          rowKey="_id"
          dataSource={filtered}
          columns={columns}
          loading={loading}
          pagination={{ pageSize: 15, showSizeChanger: false }}
          rowClassName={(u) => !u.isActive ? "nx-row-inactive" : ""}
          locale={{
            emptyText: (
              <div style={{ padding: 48, textAlign: "center", color: "var(--nx-text-muted)" }}>
                <TeamOutlined style={{ fontSize: 36, marginBottom: 12, display: "block" }} />
                <div style={{ fontWeight: 700, fontSize: 15 }}>No users found</div>
              </div>
            ),
          }}
        />
      </div>

      {/* ── Create / Edit Drawer ── */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
        title={
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>
              {editUser ? "Edit User" : "Add New User"}
            </div>
            <div style={{ fontSize: 13, color: "var(--nx-text-2)", fontWeight: 400, marginTop: 3 }}>
              {editUser ? `Editing account for ${editUser.name}` : "Create a new team member account"}
            </div>
          </div>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="large" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button
              size="large"
              type="primary"
              loading={saving}
              onClick={handleSave}
              style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
            >
              {editUser ? "Save Changes" : "Create User"}
            </Button>
          </div>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Full Name"
            name="name"
            rules={[{ required: true, message: "Name is required" }]}
          >
            <Input
              placeholder="e.g. Rahul Sharma"
              size="large"
              prefix={<UserOutlined style={{ color: "var(--nx-text-muted)" }} />}
            />
          </Form.Item>

          <Form.Item
            label="Email Address"
            name="email"
            rules={[
              { required: true, message: "Email is required" },
              { type: "email", message: "Enter a valid email" },
            ]}
          >
            <Input placeholder="e.g. rahul@neotericgrp.in" size="large" />
          </Form.Item>

          {!editUser && (
            <Form.Item
              label="Password"
              name="password"
              rules={[
                { required: true, message: "Password is required" },
                { min: 6, message: "At least 6 characters" },
              ]}
            >
              <Input.Password placeholder="Set initial password" size="large" />
            </Form.Item>
          )}

          <Form.Item
            label="Role"
            name="role"
            rules={[{ required: true, message: "Select a role" }]}
          >
            <Select
              size="large"
              placeholder="Select role…"
              optionRender={(opt) => (
                <div style={{ padding: "4px 0" }}>
                  <Tag color={ROLE_CFG[opt.data.value as UserRole]?.color} style={{ fontWeight: 600, marginBottom: 4 }}>
                    {ROLE_CFG[opt.data.value as UserRole]?.label}
                  </Tag>
                  <div style={{ fontSize: 12, color: "var(--nx-text-muted)", marginTop: 3 }}>
                    {opt.data.description as string}
                  </div>
                </div>
              )}
              options={ROLE_OPTIONS.map((r) => ({
                value: r.value,
                label: ROLE_CFG[r.value]?.label,
                description: r.description,
              }))}
            />
          </Form.Item>

          <Form.Item label="Account Status" name="isActive" valuePropName="checked">
            <Switch
              checkedChildren={<><CheckCircleOutlined /> Active</>}
              unCheckedChildren={<><StopOutlined /> Inactive</>}
            />
          </Form.Item>

          {editUser && (
            <div style={{
              background: "var(--nx-fill)",
              border: "1px solid var(--nx-border)",
              borderRadius: 10,
              padding: "14px 16px",
              marginTop: 8,
            }}>
              <div style={{ fontSize: 13, color: "#d4620c", fontWeight: 700, marginBottom: 8 }}>
                Account Info
              </div>
              <Descriptions size="small" column={1} colon={false}>
                <Descriptions.Item label={<span style={{ color: "var(--nx-text-muted)", fontSize: 13 }}>Member Since</span>}>
                  <span style={{ color: "var(--nx-text)", fontSize: 13 }}>
                    {dayjs(editUser.createdAt).format("DD MMM YYYY")}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label={<span style={{ color: "var(--nx-text-muted)", fontSize: 13 }}>Status</span>}>
                  <Badge
                    status={editUser.isActive ? "success" : "error"}
                    text={<span style={{ color: "var(--nx-text)", fontSize: 13 }}>{editUser.isActive ? "Active" : "Inactive"}</span>}
                  />
                </Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 10, fontSize: 13, color: "var(--nx-text-muted)" }}>
                Use the <strong style={{ color: "var(--nx-text-3)" }}>Password</strong> button on the table to change this user's password.
              </div>
            </div>
          )}
        </Form>
      </Drawer>

      {/* ── Change Password Modal ── */}
      <Modal
        open={pwdOpen}
        onCancel={() => setPwdOpen(false)}
        title={
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Change Password</div>
            {pwdUser && (
              <div style={{ fontSize: 13, color: "var(--nx-text-muted)", fontWeight: 400, marginTop: 2 }}>
                {pwdUser.name} · {pwdUser.email}
              </div>
            )}
          </div>
        }
        footer={null}
        destroyOnClose
        width={440}
      >
        <Form form={pwdForm} layout="vertical" style={{ marginTop: 20 }}>
          <Form.Item
            label="New Password"
            name="password"
            rules={[
              { required: true, message: "Password is required" },
              { min: 6, message: "At least 6 characters" },
            ]}
          >
            <Input.Password size="large" placeholder="Enter new password" />
          </Form.Item>
          <Form.Item
            label="Confirm Password"
            name="confirm"
            dependencies={["password"]}
            rules={[
              { required: true, message: "Please confirm the password" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) return Promise.resolve();
                  return Promise.reject(new Error("Passwords do not match"));
                },
              }),
            ]}
          >
            <Input.Password size="large" placeholder="Re-enter new password" />
          </Form.Item>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <Button size="large" onClick={() => setPwdOpen(false)}>Cancel</Button>
            <Button
              size="large"
              type="primary"
              loading={pwdSaving}
              onClick={handlePassword}
              style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
              icon={<KeyOutlined />}
            >
              Update Password
            </Button>
          </div>
        </Form>
      </Modal>

      <style>{`
        .nx-row-inactive { opacity: 0.5; }
      `}</style>
    </PageShell>
  );
}
