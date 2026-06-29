import { useEffect, useState, useCallback } from "react";
import {
  Button, Input, Modal, Form, Spin, Alert, Popconfirm, message, Tag,
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
  createdAt?: string;
}

// ── Colour palette for quick pick ─────────────────────────────
const PALETTE = [
  "#2563eb","#7c3aed","#16a85a","#f37916","#0d9488","#e03b3b",
  "#0ea5e9","#d97706","#6366f1","#ec4899","#14b8a6","#84cc16",
  "#f43f5e","#8b5cf6","#22c55e","#64748b","#ef4444","#3b82f6",
];

function lighten(hex: string): string {
  // Produce a very light tinted background from a color
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  const mix = (c: number) => Math.round(c * 0.12 + 255 * 0.88);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

export default function Categories() {
  const [cats, setCats]       = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<Category | null>(null);
  const [saving, setSaving]       = useState(false);
  const [form]                    = Form.useForm();
  const [pickedColor, setPickedColor] = useState(PALETTE[0]);

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

  function openAdd() {
    setEditing(null);
    setPickedColor(PALETTE[0]);
    form.resetFields();
    form.setFieldsValue({ color: PALETTE[0], isActive: true });
    setModalOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setPickedColor(cat.color);
    form.setFieldsValue({ name: cat.name, color: cat.color, description: cat.description ?? "", isActive: cat.isActive });
    setModalOpen(true);
  }

  async function handleSave() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await apiClient.put(`/categories/${editing._id}`, { ...values, color: pickedColor });
        message.success("Category updated");
      } else {
        await apiClient.post("/categories", { ...values, color: pickedColor });
        message.success("Category created");
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
      message.success("Category deleted");
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Delete failed";
      message.error(msg);
    }
  }

  if (loading) return (
    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", minHeight:300 }}>
      <Spin size="large" tip="Loading categories…" />
    </div>
  );

  if (error) return <Alert type="error" message={error} style={{ margin:24 }} />;

  return (
    <PageShell
      title="Categories"
      description="Manage work categories used across Work Orders and Bills. Add, rename, or recolour categories — they will reflect everywhere immediately."
      cta={
        <div style={{ display:"flex", gap:8 }}>
          <Button icon={<ReloadOutlined />} onClick={load} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ background:"#FF7A00", borderColor:"#FF7A00" }}>
            New Category
          </Button>
        </div>
      }
    >
      {/* Stats strip */}
      <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>
        {[
          { label:"Total Categories", value: cats.length,                        color:"#FF7A00" },
          { label:"Active",           value: cats.filter(c=>c.isActive).length,  color:"#16a85a" },
          { label:"Inactive",         value: cats.filter(c=>!c.isActive).length, color:"#9CA3AF" },
        ].map(s=>(
          <div key={s.label} style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:"14px 20px", minWidth:140, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"#9CA3AF", marginBottom:4 }}>{s.label}</div>
            <div style={{ fontFamily:"monospace", fontSize:24, fontWeight:700, color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Category cards grid */}
      {cats.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 20px", color:"#9CA3AF" }}>
          <AppstoreOutlined style={{ fontSize:40, marginBottom:12, display:"block" }} />
          <div style={{ fontSize:15, fontWeight:600, color:"#374151" }}>No categories yet</div>
          <div style={{ fontSize:13, marginTop:4 }}>Click "New Category" to add your first one.</div>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px,1fr))", gap:14 }}>
          {cats.map(cat=>(
            <div
              key={cat._id}
              style={{
                background:"#fff", border:`1px solid #E5E7EB`,
                borderLeft:`4px solid ${cat.color}`,
                borderRadius:12, padding:"16px 18px",
                boxShadow:"0 1px 3px rgba(0,0,0,0.04)",
                opacity: cat.isActive ? 1 : 0.55,
                transition:"box-shadow 0.15s, border-color 0.15s",
              }}
              onMouseEnter={e=>(e.currentTarget.style.boxShadow="0 4px 14px rgba(0,0,0,0.09)")}
              onMouseLeave={e=>(e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,0.04)")}
            >
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  {/* Color dot + name */}
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <span style={{ width:12, height:12, borderRadius:"50%", background:cat.color, display:"inline-block", flexShrink:0 }} />
                    <span style={{ fontWeight:700, fontSize:14, color:"#111827" }}>{cat.name}</span>
                    {!cat.isActive && <Tag style={{ marginLeft:4, fontSize:10 }}>Inactive</Tag>}
                  </div>
                  {cat.description && (
                    <div style={{ fontSize:12, color:"#6B7280", marginBottom:10, lineHeight:1.5 }}>{cat.description}</div>
                  )}
                  {/* Colour preview badge */}
                  <span style={{ display:"inline-block", background:lighten(cat.color), color:cat.color, fontWeight:600, fontSize:11, padding:"3px 10px", borderRadius:6 }}>
                    {cat.name}
                  </span>
                </div>
                {/* Actions */}
                <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                  <Button size="small" icon={<EditOutlined />} onClick={()=>openEdit(cat)} style={{ color:"#6B7280" }} />
                  <Popconfirm
                    title={`Delete "${cat.name}"?`}
                    description="This cannot be undone. Work orders using it must be reassigned first."
                    okText="Delete" okType="danger" cancelText="Cancel"
                    onConfirm={()=>handleDelete(cat)}
                  >
                    <Button size="small" icon={<DeleteOutlined />} danger />
                  </Popconfirm>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ───────────────────────────────── */}
      <Modal
        open={modalOpen}
        title={editing ? "Edit Category" : "New Category"}
        onCancel={()=>setModalOpen(false)}
        onOk={handleSave}
        okText={editing ? "Save Changes" : "Create Category"}
        confirmLoading={saving}
        okButtonProps={{ style:{ background:"#FF7A00", borderColor:"#FF7A00" } }}
        destroyOnHidden
        width={460}
      >
        <Form form={form} layout="vertical" style={{ marginTop:12 }}>
          <Form.Item
            name="name" label="Category Name"
            rules={[{ required:true, message:"Name is required" }, { min:2, message:"At least 2 characters" }]}
          >
            <Input placeholder="e.g. Landscape, Facade, Waterproofing…" maxLength={60} showCount />
          </Form.Item>

          <Form.Item label="Colour" required>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              {/* Native color input as fallback */}
              <input
                type="color" value={pickedColor}
                onChange={e=>{ setPickedColor(e.target.value); form.setFieldValue("color", e.target.value); }}
                style={{ width:40, height:36, border:"1px solid #E5E7EB", borderRadius:6, padding:2, cursor:"pointer", background:"none" }}
                title="Pick any colour"
              />
              <span style={{ fontFamily:"monospace", fontSize:13, color:"#374151" }}>{pickedColor}</span>
            </div>
            {/* Palette quick-pick */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:10 }}>
              {PALETTE.map(c=>(
                <button
                  key={c} type="button"
                  onClick={()=>{ setPickedColor(c); form.setFieldValue("color", c); }}
                  style={{ width:26, height:26, borderRadius:"50%", background:c, border: pickedColor===c ? "3px solid #111" : "2px solid #fff", boxShadow:"0 0 0 1px #E5E7EB", cursor:"pointer", padding:0 }}
                  title={c}
                />
              ))}
            </div>
            {/* Live preview */}
            <div style={{ marginTop:12, padding:"10px 14px", background:lighten(pickedColor), borderRadius:8, display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ width:10, height:10, borderRadius:"50%", background:pickedColor, display:"inline-block" }} />
              <span style={{ color:pickedColor, fontWeight:600, fontSize:13 }}>
                {form.getFieldValue("name") || "Category preview"}
              </span>
            </div>
            <Form.Item name="color" hidden><Input /></Form.Item>
          </Form.Item>

          <Form.Item name="description" label="Description (optional)">
            <Input.TextArea placeholder="Short description of what work this covers…" rows={2} maxLength={200} showCount />
          </Form.Item>

          <Form.Item name="isActive" label="Status" initialValue={true}>
            <div style={{ display:"flex", gap:10 }}>
              {[{ label:"Active", value:true, color:"#16a85a" }, { label:"Inactive", value:false, color:"#9CA3AF" }].map(opt=>(
                <button
                  key={String(opt.value)} type="button"
                  onClick={()=>form.setFieldValue("isActive", opt.value)}
                  style={{
                    padding:"6px 16px", borderRadius:7, border:"1px solid",
                    borderColor: form.getFieldValue("isActive")===opt.value ? opt.color : "#E5E7EB",
                    background: form.getFieldValue("isActive")===opt.value ? `${opt.color}18` : "#fff",
                    color: form.getFieldValue("isActive")===opt.value ? opt.color : "#6B7280",
                    fontWeight:600, fontSize:12, cursor:"pointer",
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
