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
  const [modalOpen, setModalOpen]       = useState(false);
  const [editing, setEditing]           = useState<Category | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [form]                  = Form.useForm();
  const [pickedColor, setPickedColor]   = useState(PALETTE[0]);
  const [expanded, setExpanded]         = useState<Set<string>>(new Set());
  const [subExpanded, setSubExpanded]   = useState<Set<string>>(new Set());

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

  // ── Derived hierarchy ──────────────────────────────────────────
  const level1 = cats.filter(c => !c.parentId);
  const level2 = cats.filter(c => {
    if (!c.parentId) return false;
    return level1.some(l1 => l1._id === c.parentId);
  });
  const level3 = cats.filter(c => {
    if (!c.parentId) return false;
    return level2.some(l2 => l2._id === c.parentId);
  });

  const getLevel2 = (l1Id: string) => level2.filter(c => c.parentId === l1Id);
  const getLevel3 = (l2Id: string) => level3.filter(c => c.parentId === l2Id);

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSubExpand(id: string) {
    setSubExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function getParentColor(parentId: string | null | undefined): string {
    if (!parentId) return PALETTE[0];
    const p = cats.find(c => c._id === parentId);
    if (!p) return PALETTE[0];
    // If p itself has a parent, use that parent's color
    if (p.parentId) return cats.find(c => c._id === p.parentId)?.color ?? p.color;
    return p.color;
  }

  function openAdd(parentId: string | null = null) {
    setEditing(null);
    setDefaultParentId(parentId);
    const color = getParentColor(parentId);
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

  function getModalTitle() {
    if (editing) {
      const depth = !editing.parentId ? "Category"
        : level2.some(l => l._id === editing._id) ? "Sub-Category"
        : "Sub-Sub-Category";
      return `Edit ${depth}`;
    }
    if (!defaultParentId) return "New Category";
    const parent = cats.find(c => c._id === defaultParentId);
    if (!parent) return "New Category";
    if (!parent.parentId) return `New Sub-Category under "${parent.name}"`;
    const grandparent = cats.find(c => c._id === parent.parentId);
    return `New Sub-Sub-Category under "${grandparent?.name ?? ""} › ${parent.name}"`;
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
        const label = !payload.parentId ? "Category"
          : level1.some(l => l._id === payload.parentId) ? "Sub-Category"
          : "Sub-Sub-Category";
        message.success(`${label} created`);
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

  // Parent options for modal: level1 + level2
  const parentOptions = [
    { label: "── Top-Level Categories ──", value: "__sep1", disabled: true },
    ...level1.map(c => ({ label: c.name, value: c._id })),
    ...(level2.length > 0 ? [
      { label: "── Sub-Categories ──", value: "__sep2", disabled: true },
      ...level2.map(c => {
        const p = level1.find(l => l._id === c.parentId);
        return { label: `${p?.name ?? ""} › ${c.name}`, value: c._id };
      }),
    ] : []),
  ];

  return (
    <PageShell
      title="Categories"
      description="3-level category hierarchy: Category → Sub-Category → Sub-Sub-Category. Used across Work Orders for scope item classification."
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
          { label: "Total",         value: cats.length,                          color: "#FF7A00" },
          { label: "Category",      value: level1.length,                        color: "#2563eb" },
          { label: "Sub-Category",  value: level2.length,                        color: "#7c3aed" },
          { label: "Sub-Sub-Cat",   value: level3.length,                        color: "#0d9488" },
          { label: "Active",        value: cats.filter(c => c.isActive).length,  color: "#16a85a" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px 20px", minWidth: 120, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Category tree ─────────────────────────────────────── */}
      {level1.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#9CA3AF" }}>
          <AppstoreOutlined style={{ fontSize: 40, marginBottom: 12, display: "block" }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>No categories yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Click "New Category" to add your first one.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {level1.map(cat => {
            const subs   = getLevel2(cat._id);
            const isOpen = expanded.has(cat._id);

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
                {/* ── Level-1 header ── */}
                <div
                  style={{ display: "flex", alignItems: "center", padding: "13px 16px", gap: 10, cursor: "pointer", userSelect: "none" }}
                  onClick={() => toggleExpand(cat._id)}
                >
                  <span style={{ fontSize: 10, color: "#9CA3AF", display: "inline-block", transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: cat.color, display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#111827", flex: 1 }}>
                    {cat.name}
                    {!cat.isActive && <Tag style={{ marginLeft: 8, fontSize: 10 }}>Inactive</Tag>}
                  </span>
                  <span style={{ fontSize: 12, color: "#9CA3AF", marginRight: 6 }}>
                    {subs.length} sub-{subs.length === 1 ? "category" : "categories"}
                  </span>
                  <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 4 }}>
                    <Tooltip title="Add sub-category">
                      <Button
                        size="small" icon={<PlusOutlined />}
                        onClick={() => { openAdd(cat._id); setExpanded(p => new Set([...p, cat._id])); }}
                        style={{ background: lighten(cat.color), borderColor: cat.color, color: cat.color }}
                      />
                    </Tooltip>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(cat)} style={{ color: "#6B7280" }} />
                    <Popconfirm
                      title={`Delete "${cat.name}"?`}
                      description={subs.length > 0 ? "Delete all sub-categories first." : "This cannot be undone."}
                      okText="Delete" okType="danger" cancelText="Cancel"
                      onConfirm={() => handleDelete(cat)}
                      disabled={subs.length > 0}
                    >
                      <Button size="small" icon={<DeleteOutlined />} danger disabled={subs.length > 0} />
                    </Popconfirm>
                  </div>
                </div>

                {/* ── Level-2 panel ── */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid #F3F4F6", padding: "12px 16px 14px 44px", background: "#FAFAFA" }}>
                    {subs.length === 0 ? (
                      <div style={{ color: "#9CA3AF", fontSize: 13, padding: "6px 0" }}>
                        No sub-categories yet —{" "}
                        <button type="button" onClick={() => openAdd(cat._id)}
                          style={{ background: "none", border: "none", color: "#FF7A00", cursor: "pointer", fontWeight: 600, padding: 0, fontSize: 13 }}>
                          add one
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {subs.map(sub => {
                          const subSubs   = getLevel3(sub._id);
                          const subIsOpen = subExpanded.has(sub._id);

                          return (
                            <div key={sub._id} style={{
                              background: "#fff", border: "1px solid #EAEAEA",
                              borderLeft: `3px solid ${sub.color}`, borderRadius: 8,
                              overflow: "hidden", opacity: sub.isActive ? 1 : 0.55,
                            }}>
                              {/* Sub-cat row */}
                              <div
                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", userSelect: "none" }}
                                onClick={() => toggleSubExpand(sub._id)}
                              >
                                <span style={{ fontSize: 9, color: "#9CA3AF", display: "inline-block", transition: "transform 0.2s", transform: subIsOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: sub.color, display: "inline-block", flexShrink: 0 }} />
                                <span style={{ fontWeight: 600, fontSize: 13, color: "#374151", flex: 1 }}>
                                  {sub.name}
                                  {!sub.isActive && <Tag style={{ marginLeft: 6, fontSize: 10 }}>Inactive</Tag>}
                                </span>
                                {sub.description && <span style={{ fontSize: 12, color: "#9CA3AF" }}>{sub.description}</span>}
                                <span style={{ fontSize: 11, color: "#9CA3AF", marginRight: 4 }}>
                                  {subSubs.length > 0 ? `${subSubs.length} sub-sub` : ""}
                                </span>
                                <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 4 }}>
                                  <Tooltip title="Add sub-sub-category">
                                    <Button
                                      size="small" icon={<PlusOutlined />}
                                      onClick={() => { openAdd(sub._id); setSubExpanded(p => new Set([...p, sub._id])); }}
                                      style={{ background: lighten(sub.color), borderColor: sub.color, color: sub.color }}
                                    />
                                  </Tooltip>
                                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(sub)} style={{ color: "#6B7280" }} />
                                  <Popconfirm
                                    title={`Delete "${sub.name}"?`}
                                    description={subSubs.length > 0 ? "Delete all sub-sub-categories first." : "This cannot be undone."}
                                    okText="Delete" okType="danger" cancelText="Cancel"
                                    onConfirm={() => handleDelete(sub)}
                                    disabled={subSubs.length > 0}
                                  >
                                    <Button size="small" icon={<DeleteOutlined />} danger disabled={subSubs.length > 0} />
                                  </Popconfirm>
                                </div>
                              </div>

                              {/* Level-3 panel */}
                              {subIsOpen && (
                                <div style={{ borderTop: "1px solid #F3F4F6", padding: "8px 12px 10px 36px", background: "#F8F9FC" }}>
                                  {subSubs.length === 0 ? (
                                    <div style={{ color: "#9CA3AF", fontSize: 12, padding: "4px 0" }}>
                                      No sub-sub-categories yet —{" "}
                                      <button type="button" onClick={() => openAdd(sub._id)}
                                        style={{ background: "none", border: "none", color: "#FF7A00", cursor: "pointer", fontWeight: 600, padding: 0, fontSize: 12 }}>
                                        add one
                                      </button>
                                    </div>
                                  ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                      {subSubs.map(ss => (
                                        <div key={ss._id} style={{
                                          display: "flex", alignItems: "center", gap: 8,
                                          padding: "6px 10px", background: "#fff",
                                          border: "1px solid #EAEAEA", borderLeft: `2px solid ${ss.color}`,
                                          borderRadius: 6, opacity: ss.isActive ? 1 : 0.5,
                                        }}>
                                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: ss.color, display: "inline-block", flexShrink: 0 }} />
                                          <span style={{ fontWeight: 600, fontSize: 12, color: "#374151", flex: 1 }}>
                                            {ss.name}
                                            {!ss.isActive && <Tag style={{ marginLeft: 6, fontSize: 10 }}>Inactive</Tag>}
                                          </span>
                                          {ss.description && <span style={{ fontSize: 11, color: "#9CA3AF" }}>{ss.description}</span>}
                                          <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                                            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(ss)} style={{ color: "#6B7280" }} />
                                            <Popconfirm
                                              title={`Delete "${ss.name}"?`}
                                              description="This cannot be undone."
                                              okText="Delete" okType="danger" cancelText="Cancel"
                                              onConfirm={() => handleDelete(ss)}
                                            >
                                              <Button size="small" icon={<DeleteOutlined />} danger />
                                            </Popconfirm>
                                          </div>
                                        </div>
                                      ))}
                                      <button type="button" onClick={() => openAdd(sub._id)}
                                        style={{ marginTop: 2, background: "none", border: "1px dashed #D1D5DB", color: "#9CA3AF", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, textAlign: "left", display: "flex", alignItems: "center", gap: 5 }}>
                                        <PlusOutlined /> Add sub-sub-category under {sub.name}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        <button type="button" onClick={() => openAdd(cat._id)}
                          style={{ marginTop: 2, background: "none", border: "1px dashed #D1D5DB", color: "#9CA3AF", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, textAlign: "left", display: "flex", alignItems: "center", gap: 6 }}>
                          <PlusOutlined /> Add sub-category under {cat.name}
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
        title={getModalTitle()}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText={editing ? "Save Changes" : "Create"}
        confirmLoading={saving}
        okButtonProps={{ style: { background: "#FF7A00", borderColor: "#FF7A00" } }}
        destroyOnHidden
        width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          {!editing && (
            <Form.Item
              name="parentId"
              label="Parent"
              tooltip="Leave empty for top-level. Select a Category to create a Sub-Category. Select a Sub-Category to create a Sub-Sub-Category."
            >
              <Select
                placeholder="None — create as top-level category"
                allowClear
                showSearch
                filterOption={(inp, opt) => String(opt?.label ?? "").toLowerCase().includes(inp.toLowerCase())}
                options={parentOptions.filter(o => !("disabled" in o && o.disabled && o.value?.toString().startsWith("__")) || true)}
                getPopupContainer={trigger => trigger.parentElement || document.body}
                onChange={val => {
                  if (val) {
                    const parent = cats.find(c => c._id === val);
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
            <Input placeholder="e.g. Foundation, Basement, Inner Plaster…" maxLength={60} showCount />
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
            <Input.TextArea placeholder="Brief description…" rows={2} maxLength={200} showCount />
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
