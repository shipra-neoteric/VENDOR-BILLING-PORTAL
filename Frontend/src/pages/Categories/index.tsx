import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, RotateCw, LayoutGrid, ChevronRight, Tag, Layers, GitBranch, CheckCircle2 } from "lucide-react";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import Btn from "../../ui/Btn";
import NxBtn from "../../ui/nexora/Btn";
import NxBadge from "../../ui/nexora/Badge";
import NxStatCard from "../../ui/nexora/StatCard";
import Card from "../../ui/Card";
import EmptyState from "../../ui/EmptyState";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import Modal from "../../ui/Modal";
import ConfirmModal from "../../ui/ConfirmModal";
import Spinner from "../../ui/Spinner";
import Alert from "../../ui/Alert";

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

const emptyForm = { name: "", description: "", isActive: true, parentId: "" };

export default function Categories() {
  const [cats, setCats]         = useState<Category[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [modalOpen, setModalOpen]       = useState(false);
  const [editing, setEditing]           = useState<Category | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState(emptyForm);
  const [pickedColor, setPickedColor]   = useState(PALETTE[0]);
  const [expanded, setExpanded]         = useState<Set<string>>(new Set());
  const [subExpanded, setSubExpanded]   = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteBlockedReason, setDeleteBlockedReason] = useState("");

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

  function getParentColor(parentId: string | null): string {
    if (!parentId) return PALETTE[0];
    const p = cats.find(c => c._id === parentId);
    if (!p) return PALETTE[0];
    if (p.parentId) return cats.find(c => c._id === p.parentId)?.color ?? p.color;
    return p.color;
  }

  function openAdd(parentId: string | null = null) {
    setEditing(null);
    setDefaultParentId(parentId);
    const color = getParentColor(parentId);
    setPickedColor(color);
    setForm({ ...emptyForm, parentId: parentId ?? "" });
    setModalOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setDefaultParentId(null);
    setPickedColor(cat.color);
    setForm({ name: cat.name, description: cat.description ?? "", isActive: cat.isActive, parentId: cat.parentId ?? "" });
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
    if (!form.name.trim() || form.name.trim().length < 2) return toast.error("Name must be at least 2 characters");

    setSaving(true);
    try {
      const payload = { ...form, color: pickedColor, parentId: form.parentId || null };
      if (editing) {
        await apiClient.put(`/categories/${editing._id}`, payload);
        toast.success("Category updated");
      } else {
        await apiClient.post("/categories", payload);
        const label = !payload.parentId ? "Category"
          : level1.some(l => l._id === payload.parentId) ? "Sub-Category"
          : "Sub-Sub-Category";
        toast.success(`${label} created`);
      }
      setModalOpen(false);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Save failed";
      toast.error(msg);
    } finally { setSaving(false); }
  }

  function requestDelete(cat: Category, blockedReason: string) {
    setDeleteTarget(cat);
    setDeleteBlockedReason(blockedReason);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/categories/${deleteTarget._id}`);
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      await load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Delete failed";
      toast.error(msg);
    }
  }

  if (loading) return <Spinner label="Loading categories…" />;
  if (error) return <div className="m-6"><Alert type="error" message={error} /></div>;

  // Parent options for modal: level1 + level2
  const parentOptions = [
    ...level1.map(c => ({ label: c.name, value: c._id })),
    ...level2.map(c => {
      const p = level1.find(l => l._id === c.parentId);
      return { label: `${p?.name ?? ""} › ${c.name}`, value: c._id };
    }),
  ];

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="3-level category hierarchy: Category → Sub-Category → Sub-Sub-Category. Used across Work Orders for scope item classification."
        icon={LayoutGrid}
        actions={
          <div className="flex items-center gap-2">
            <NxBtn color="secondary" icon={RotateCw} label="Refresh" onClick={load} />
            <NxBtn color="primary" icon={Plus} label="New Category" onClick={() => openAdd(null)} />
          </div>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-5">
        <NxStatCard label="Total Categories" value={cats.length} icon={LayoutGrid} />
        <NxStatCard label="Category" value={level1.length} icon={Tag} />
        <NxStatCard label="Sub-Category" value={level2.length} icon={Layers} />
        <NxStatCard label="Sub-Sub-Cat" value={level3.length} icon={GitBranch} />
        <NxStatCard label="Active" value={cats.filter(c => c.isActive).length} icon={CheckCircle2} />
      </div>

      {/* ── Category tree ─────────────────────────────────────── */}
      {level1.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={LayoutGrid}
            title="No categories yet"
            message='Click "New Category" to add your first one.'
            actionLabel="New Category"
            onAction={() => openAdd(null)}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {level1.map(cat => {
            const subs   = getLevel2(cat._id);
            const isOpen = expanded.has(cat._id);

            return (
              <Card key={cat._id} padded={false} className={`overflow-hidden ${cat.isActive ? "" : "opacity-60"}`} style={{ borderLeft: `4px solid ${cat.color}` }}>
                {/* ── Level-1 header ── */}
                <div className="flex items-center px-4 py-3 gap-2.5 cursor-pointer select-none" onClick={() => toggleExpand(cat._id)}>
                  <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${isOpen ? "rotate-90" : ""}`} />
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color }} />
                  <span className="font-bold text-sm text-[#1A1A2E] dark:text-[#F1F5F9] flex-1">
                    {cat.name}{!cat.isActive && <span className="ml-2 align-middle"><NxBadge color="red">Inactive</NxBadge></span>}
                  </span>
                  <span className="text-xs text-gray-400 mr-1.5">{subs.length} sub-{subs.length === 1 ? "category" : "categories"}</span>
                  <div onClick={e => e.stopPropagation()} className="flex gap-1">
                    <button
                      type="button"
                      title="Add sub-category"
                      style={{ background: lighten(cat.color), borderColor: cat.color, color: cat.color }}
                      onClick={() => { openAdd(cat._id); setExpanded(p => new Set([...p, cat._id])); }}
                      className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <NxBtn color="icon" title="Edit" icon={Pencil} onClick={() => openEdit(cat)} />
                    <NxBtn
                      color="icon" title="Delete" icon={Trash2} disabled={subs.length > 0}
                      className="text-red-500! hover:text-red-600! hover:bg-red-50! dark:hover:bg-red-500/10!"
                      onClick={() => requestDelete(cat, subs.length > 0 ? "Delete all sub-categories first." : "")}
                    />
                  </div>
                </div>

                {/* ── Level-2 panel ── */}
                {isOpen && (
                  <div className="border-t border-gray-100 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-800/30" style={{ padding: "12px 16px 14px 44px" }}>
                    {subs.length === 0 ? (
                      <div className="text-gray-400 text-sm py-1.5">
                        No sub-categories yet —{" "}
                        <button type="button" onClick={() => openAdd(cat._id)} className="bg-transparent border-none text-primary cursor-pointer font-semibold p-0 text-sm">
                          add one
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {subs.map(sub => {
                          const subSubs   = getLevel3(sub._id);
                          const subIsOpen = subExpanded.has(sub._id);

                          return (
                            <div key={sub._id} className={`bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-lg overflow-hidden ${sub.isActive ? "" : "opacity-55"}`} style={{ borderLeft: `3px solid ${sub.color}` }}>
                              {/* Sub-cat row */}
                              <div className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" onClick={() => toggleSubExpand(sub._id)}>
                                <ChevronRight className={`w-2.5 h-2.5 text-gray-400 transition-transform shrink-0 ${subIsOpen ? "rotate-90" : ""}`} />
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sub.color }} />
                                <span className="font-semibold text-[13px] text-gray-700 dark:text-gray-300 flex-1">
                                  {sub.name}{!sub.isActive && <span className="ml-1.5 align-middle"><NxBadge color="red">Inactive</NxBadge></span>}
                                </span>
                                {sub.description && <span className="text-xs text-gray-400">{sub.description}</span>}
                                <span className="text-[11px] text-gray-400 mr-1">{subSubs.length > 0 ? `${subSubs.length} sub-sub` : ""}</span>
                                <div onClick={e => e.stopPropagation()} className="flex gap-1">
                                  <button
                                    type="button"
                                    title="Add sub-sub-category"
                                    style={{ background: lighten(sub.color), borderColor: sub.color, color: sub.color }}
                                    onClick={() => { openAdd(sub._id); setSubExpanded(p => new Set([...p, sub._id])); }}
                                    className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                  <NxBtn color="icon" title="Edit" icon={Pencil} onClick={() => openEdit(sub)} />
                                  <NxBtn
                                    color="icon" title="Delete" icon={Trash2} disabled={subSubs.length > 0}
                                    className="text-red-500! hover:text-red-600! hover:bg-red-50! dark:hover:bg-red-500/10!"
                                    onClick={() => requestDelete(sub, subSubs.length > 0 ? "Delete all sub-sub-categories first." : "")}
                                  />
                                </div>
                              </div>

                              {/* Level-3 panel */}
                              {subIsOpen && (
                                <div className="border-t border-gray-100 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-800/40" style={{ padding: "8px 12px 10px 36px" }}>
                                  {subSubs.length === 0 ? (
                                    <div className="text-gray-400 text-xs py-1">
                                      No sub-sub-categories yet —{" "}
                                      <button type="button" onClick={() => openAdd(sub._id)} className="bg-transparent border-none text-primary cursor-pointer font-semibold p-0 text-xs">
                                        add one
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col gap-1">
                                      {subSubs.map(ss => (
                                        <div key={ss._id} className={`flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-gray-700/40 rounded-md ${ss.isActive ? "" : "opacity-50"}`} style={{ borderLeft: `2px solid ${ss.color}` }}>
                                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ss.color }} />
                                          <span className="font-semibold text-xs text-gray-700 dark:text-gray-300 flex-1">
                                            {ss.name}{!ss.isActive && <span className="ml-1.5 align-middle"><NxBadge color="red">Inactive</NxBadge></span>}
                                          </span>
                                          {ss.description && <span className="text-[11px] text-gray-400">{ss.description}</span>}
                                          <div className="flex gap-1 ml-auto">
                                            <NxBtn color="icon" title="Edit" icon={Pencil} onClick={() => openEdit(ss)} />
                                            <NxBtn
                                              color="icon" title="Delete" icon={Trash2}
                                              className="text-red-500! hover:text-red-600! hover:bg-red-50! dark:hover:bg-red-500/10!"
                                              onClick={() => requestDelete(ss, "")}
                                            />
                                          </div>
                                        </div>
                                      ))}
                                      <button type="button" onClick={() => openAdd(sub._id)}
                                        className="mt-0.5 bg-transparent border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 rounded-md cursor-pointer text-[11px] text-left flex items-center gap-1.5 px-2.5 py-1.5">
                                        <Plus className="w-3 h-3" /> Add sub-sub-category under {sub.name}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        <button type="button" onClick={() => openAdd(cat._id)}
                          className="mt-0.5 bg-transparent border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 rounded-lg cursor-pointer text-xs text-left flex items-center gap-1.5 px-3 py-1.5">
                          <Plus className="w-3.5 h-3.5" /> Add sub-category under {cat.name}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Modal ────────────────────────────────────── */}
      {modalOpen && (
        <Modal
          title={getModalTitle()} onClose={() => setModalOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Btn label="Cancel" outline onClick={() => setModalOpen(false)} />
              <Btn label={editing ? "Save Changes" : "Create"} color="primary" loading={saving} onClick={handleSave} />
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            {!editing && (
              <SField
                label="Parent" placeholder="None — create as top-level category"
                hint="Leave empty for top-level. Select a Category to create a Sub-Category. Select a Sub-Category to create a Sub-Sub-Category."
                value={form.parentId || null}
                onChange={val => {
                  setForm(f => ({ ...f, parentId: val }));
                  const parent = cats.find(c => c._id === val);
                  if (parent) setPickedColor(parent.color);
                }}
                options={parentOptions}
              />
            )}

            <Field label="Name" required maxLength={60} placeholder="e.g. Foundation, Basement, Inner Plaster…"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />

            <div>
              <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">Colour <span className="text-red-500">*</span></span>
              <div className="flex items-center gap-3">
                <input type="color" value={pickedColor} onChange={e => setPickedColor(e.target.value)} title="Pick any colour"
                  className="w-10 h-9 border border-gray-200 dark:border-gray-700 rounded-md p-0.5 cursor-pointer bg-transparent" />
                <span className="font-mono text-[13px] text-gray-700 dark:text-gray-300">{pickedColor}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {PALETTE.map(c => (
                  <button key={c} type="button" onClick={() => setPickedColor(c)} title={c}
                    className="w-[26px] h-[26px] rounded-full cursor-pointer p-0"
                    style={{ background: c, border: pickedColor === c ? "3px solid #111" : "2px solid #fff", boxShadow: "0 0 0 1px #E5E7EB" }} />
                ))}
              </div>
            </div>

            <Field textarea label="Description (optional)" rows={2} maxLength={200} placeholder="Brief description…"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

            <div>
              <span className="block text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">Status</span>
              <div className="flex gap-2.5">
                {[{ label: "Active", value: true, color: "#16a85a" }, { label: "Inactive", value: false, color: "#9CA3AF" }].map(opt => (
                  <button key={String(opt.value)} type="button" onClick={() => setForm(f => ({ ...f, isActive: opt.value }))}
                    className="px-4 py-1.5 rounded-lg border font-semibold text-xs cursor-pointer"
                    style={{
                      borderColor: form.isActive === opt.value ? opt.color : "#E5E7EB",
                      background: form.isActive === opt.value ? `${opt.color}18` : "transparent",
                      color: form.isActive === opt.value ? opt.color : "#6B7280",
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal
          title={`Delete "${deleteTarget.name}"?`}
          message={deleteBlockedReason || "This cannot be undone."}
          confirmLabel="Delete" danger
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
