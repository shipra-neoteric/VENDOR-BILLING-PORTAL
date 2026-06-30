import { useEffect, useState, useCallback } from "react";
import {
  Button, Input, Modal, Form, Spin, Alert, Popconfirm, message, Tag, Select, Tooltip,
} from "antd";
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, AppstoreOutlined,
} from "@ant-design/icons";
import PageShell from "../../components/PageShell";
import apiClient from "../../services/apiClient";

// ── Types ─────────────────────────────────────────────────────
interface Category {
  _id: string;
  name: string;
  color: string;
  description?: string;
  isActive: boolean;
  parentId?: string | null;
  createdAt?: string;
}

// ── Colour palette ─────────────────────────────────────────────
const PALETTE = [
  "#2563eb","#7c3aed","#16a85a","#f37916","#0d9488","#e03b3b",
  "#0ea5e9","#d97706","#6366f1","#ec4899","#14b8a6","#84cc16",
  "#f43f5e","#8b5cf6","#22c55e","#64748b","#ef4444","#3b82f6",
];

function lighten(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c * 0.12 + 255 * 0.88);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

export default function Categories() {
  const [cats, setCats]         = useState<Category[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [modalOpen, setModalOpen]     = useState(false);
  const [editing, setEditing]         = useState<Category | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [form]                  = Form.useForm();
  const [pickedColor, setPickedColor] = useState(PALETTE[0]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiClient.get("/categories");
      setCats(res.data.categories ?? []);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to load categories");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const topLevel   = cats.filter(c => !c.parentId);
  const subCats    = cats.filter(c => !!c.parentId);
  const getChildren = (parentId: string) => subCats.filter(c => c.parentId === parentId);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openAdd(parentId: string | null = null) {
    setEditing(null);
    setDefaultParentId(parentId);
    const color = parentId
      ? (topLevel.find(c => c._id === parentId)?.color ?? PALETTE[0])
      : PALETTE[0];
    setPickedColor(color);
    form.resetFields();
    form.setFieldsValue({ color, isActive: true, parentId: parentId ?? undefined });
    setModalOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setDefaultParentId(null);
    setPickedColor(cat.color);
    form.setFieldsValue({
      name: cat.name, color: cat.color,
      description: cat.description ?? "",
      isActive: cat.isActive,
      parentId: cat.parentId ?? undefined,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = { ...values, color: pickedColor, parentId: values.parentId ?? null };
      if (editing) {
        await apiClient.put(`/categories/${editing._id}`, payload);
        message.success("Category updated");
      } else {
        await apiClient.post("/categories", payload);
        message.success(payload.parentId ? "Subcategory created" : "Category created");
      }
      setModalOpen(false);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Save failed";
      message.error(msg);
    } finally { setSaving(false); }
  }

  async function handleDelete(cat: Category) {
    try {
      await apiClient.delete(`/categories/${cat._id}`);
      message.success(`"${cat.name}" deleted`);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Delete failed";
      message.error(msg);
    }
  }

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
      <Spin size="large" tip="Loading categories…" />
    </div>
  );

  if (error) return <Alert type="error" message={error} style={{ margin: 24 }} />;

  return (
    <PageShell
      title="Categories"
      description="Manage the work category hierarchy used across Work Orders and Progress tracking. Top-level categories (Civil, MEP…) contain subcategories (Foundation, Basement…)."
      cta={
        <div style={{ display: "flex", gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={load} />
          <Button
            type="primary" icon={<PlusOutlined />}
            onClick={() => openAdd(null)}
            style={{ background: "#FF7A00", borderColor: "#FF7A00" }}
          >
            New Category
          </Button>
        </div>
      }
    >
      {/* Stats strip */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Total",       value: cats.length,                       color: "#FF7A00" },
          { label: "Top-Level",   value: topLevel.length,                   color: "#2563eb" },
          { label: "Sub-Cats",    value: subCats.length,                    color: "#7c3aed" },
          { label: "Active",      value: cats.filter(c => c.isActive).length, color: "#16a85a" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 20px", minWidth: 130, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Category tree ─────────────────────────────────────── */}
      {topLevel.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#9CA3AF" }}>
          <AppstoreOutlined style={{ fontSize: 40, marginBottom: 12, display: "block" }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>No categories yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Click "New Category" to add your first one.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {topLevel.map(cat => {
            const children = getChildren(cat._id);
            const isOpen   = expanded.has(cat._id);

            return (
              <div
                key={cat._id}
                style={{
                  background: "#fff",
                  border: "1px solid #E5E7EB",
                  borderLeft: `4px solid ${cat.color}`,
                  borderRadius: 12,
                  overflow: "hidden",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  opacity: cat.isActive ? 1 : 0.6,
                }}
              >
                {/* ── Category header row ── */}
                <div
                  style={{ display: "flex", alignItems: "center", padding: "13px 16px", gap: 10, cursor: "pointer", userSelect: "none" }}
                  onClick={() => toggleExpand(cat._id)}
                >
                  <span
                    style={{
                      fontSize: 10, color: "#9CA3AF",
                      display: "inline-block",
                      transition: "transform 0.2s",
                      transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  >▶</span>

                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: cat.color, display: "inline-block", flexShrink: 0 }} />

                  <span style={{ fontWeight: 700, fontSize: 14, color: "#111827", flex: 1 }}>
                    {cat.name}
                    {!cat.isActive && <Tag style={{ marginLeft: 8, fontSize: 10 }}>Inactive</Tag>}
                  </span>

                  <span style={{ fontSize: 12, color: "#9CA3AF", marginRight: 6 }}>
                    {children.length} sub-{children.length === 1 ? "category" : "categories"}
                  </span>

                  {/* Action buttons — stop propagation so click doesn't toggle expand */}
                  <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 4 }}>
                    <Tooltip title="Add subcategory">
                      <Button
                        size="small" icon={<PlusOutlined />}
                        onClick={() => { openAdd(cat._id); setExpanded(p => new Set([...p, cat._id])); }}
                        style={{ background: lighten(cat.color), borderColor: cat.color, color: cat.color }}
                      />
                    </Tooltip>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(cat)} style={{ color: "#6B7280" }} />
                    <Popconfirm
                      title={`Delete "${cat.name}"?`}
                      description={
                        children.length > 0
                          ? "Delete all subcategories first before deleting this category."
                          : "This cannot be undone."
                      }
                      okText="Delete" okType="danger" cancelText="Cancel"
                      onConfirm={() => handleDelete(cat)}
                      disabled={children.length > 0}
                    >
                      <Button
                        size="small" icon={<DeleteOutlined />} danger
                        disabled={children.length > 0}
                        title={children.length > 0 ? "Delete subcategories first" : undefined}
                      />
                    </Popconfirm>
                  </div>
                </div>

                {/* ── Subcategories panel ── */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid #F3F4F6", padding: "12px 16px 14px 44px", background: "#FAFAFA" }}>
                    {children.length === 0 ? (
                      <div style={{ color: "#9CA3AF", fontSize: 13, padding: "6px 0" }}>
                        No subcategories yet —{" "}
                        <button
                          type="button"
                          onClick={() => openAdd(cat._id)}
                          style={{ background: "none", border: "none", color: "#FF7A00", cursor: "pointer", fontWeight: 600, padding: 0, fontSize: 13 }}
                        >
                          add one
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {children.map(sub => (
                          <div
                            key={sub._id}
                            style={{
                              display: "flex", alignItems: "center", gap: 8,
                              padding: "8px 12px",
                              background: "#fff",
                              border: "1px solid #EAEAEA",
                              borderLeft: `3px solid ${sub.color}`,
                              borderRadius: 8,
                              opacity: sub.isActive ? 1 : 0.55,
                            }}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: sub.color, display: "inline-block", flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, fontSize: 13, color: "#374151", minWidth: 140 }}>
                              {sub.name}
                              {!sub.isActive && <Tag style={{ marginLeft: 6, fontSize: 10 }}>Inactive</Tag>}
                            </span>
                            {sub.description && (
                              <span style={{ fontSize: 12, color: "#9CA3AF", flex: 1 }}>{sub.description}</span>
                            )}
                            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(sub)} style={{ color: "#6B7280" }} />
                              <Popconfirm
                                title={`Delete "${sub.name}"?`}
                                description="This cannot be undone."
                                okText="Delete" okType="danger" cancelText="Cancel"
                                onConfirm={() => handleDelete(sub)}
                              >
                                <Button size="small" icon={<DeleteOutlined />} danger />
                              </Popconfirm>
                            </div>
                          </div>
                        ))}

                        {/* Add more subcategory inline button */}
                        <button
                          type="button"
                          onClick={() => openAdd(cat._id)}
                          style={{
                            marginTop: 2,
                            background: "none",
                            border: "1px dashed #D1D5DB",
                            color: "#9CA3AF",
                            borderRadius: 8,
                            padding: "6px 12px",
                            cursor: "pointer",
                            fontSize: 12,
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <PlusOutlined /> Add subcategory under {cat.name}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Modal ────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        title={
          editing
            ? `Edit ${editing.parentId ? "Subcategory" : "Category"}`
            : defaultParentId
            ? `New Subcategory under "${topLevel.find(c => c._id === defaultParentId)?.name ?? ""}"`
            : "New Category"
        }
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText={editing ? "Save Changes" : "Create"}
        confirmLoading={saving}
        okButtonProps={{ style: { background: "#FF7A00", borderColor: "#FF7A00" } }}
        destroyOnHidden
        width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          {/* Parent selector — shown when creating, hidden when editing (parentId doesn't change) */}
          {!editing && (
            <Form.Item
              name="parentId"
              label="Parent Category"
              tooltip="Leave empty to create a top-level category. Select a parent to create a subcategory."
            >
              <Select
                placeholder="None — create as top-level category"
                allowClear
                showSearch
                filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
                options={topLevel.map(c => ({ label: c.name, value: c._id }))}
                getPopupContainer={trigger => trigger.parentElement || document.body}
                onChange={val => {
                  if (val) {
                    const parent = topLevel.find(c => c._id === val);
                    if (parent) { setPickedColor(parent.color); form.setFieldValue("color", parent.color); }
                  }
                }}
              />
            </Form.Item>
          )}

          <Form.Item
            name="name" label="Name"
            rules={[{ required: true, message: "Name is required" }, { min: 2, message: "At least 2 characters" }]}
          >
            <Input placeholder="e.g. Foundation, Basement, First Floor…" maxLength={60} showCount />
          </Form.Item>

          <Form.Item label="Colour" required>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="color" value={pickedColor}
                onChange={e => { setPickedColor(e.target.value); form.setFieldValue("color", e.target.value); }}
                style={{ width: 40, height: 36, border: "1px solid #E5E7EB", borderRadius: 6, padding: 2, cursor: "pointer", background: "none" }}
                title="Pick any colour"
              />
              <span style={{ fontFamily: "monospace", fontSize: 13, color: "#374151" }}>{pickedColor}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {PALETTE.map(c => (
                <button
                  key={c} type="button"
                  onClick={() => { setPickedColor(c); form.setFieldValue("color", c); }}
                  style={{
                    width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", padding: 0,
                    border: pickedColor === c ? "3px solid #111" : "2px solid #fff",
                    boxShadow: "0 0 0 1px #E5E7EB",
                  }}
                  title={c}
                />
              ))}
            </div>
            <Form.Item name="color" hidden><Input /></Form.Item>
          </Form.Item>

          <Form.Item name="description" label="Description (optional)">
            <Input.TextArea
              placeholder="Brief description of this category…"
              rows={2} maxLength={200} showCount
            />
          </Form.Item>

          <Form.Item name="isActive" label="Status" initialValue={true}>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { label: "Active",   value: true,  color: "#16a85a" },
                { label: "Inactive", value: false, color: "#9CA3AF" },
              ].map(opt => (
                <button
                  key={String(opt.value)} type="button"
                  onClick={() => form.setFieldValue("isActive", opt.value)}
                  style={{
                    padding: "6px 16px", borderRadius: 7, border: "1px solid", cursor: "pointer",
                    fontWeight: 600, fontSize: 12,
                    borderColor: form.getFieldValue("isActive") === opt.value ? opt.color : "#E5E7EB",
                    background:  form.getFieldValue("isActive") === opt.value ? `${opt.color}18` : "#fff",
                    color:       form.getFieldValue("isActive") === opt.value ? opt.color : "#6B7280",
                  }}
                >{opt.label}</button>
              ))}
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </PageShell>
  );
}
