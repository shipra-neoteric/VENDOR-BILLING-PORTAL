import { useEffect, useState } from "react";
import { Plus, Trash2, GripVertical, Lock } from "lucide-react";
import toast from "react-hot-toast";
import apiClient from "../../services/apiClient";
import PageHeader from "../../ui/PageHeader";
import Card from "../../ui/Card";
import Field from "../../ui/Field";
import SField from "../../ui/SField";
import Btn from "../../ui/Btn";
import Spinner from "../../ui/Spinner";
import type { FormFieldConfig } from "../../shared/constants/formConfig";
import { FIELD_TYPE_LABEL } from "../../shared/constants/formConfig";

// Only the Daily Progress Report public form is wired up to this today —
// the page/model/API are generic enough that another public form (Drawing
// Request, Work Order, …) could get its own tab here later without a
// backend change, just another formType.
const FORM_TYPE = "daily-progress-report";

const CUSTOM_TYPE_OPTIONS = [
  { label: "Text", value: "text" },
  { label: "Number", value: "number" },
  { label: "Date", value: "date" },
  { label: "Dropdown", value: "dropdown" },
  { label: "Photo / File", value: "file" },
];

function newCustomField(order: number): FormFieldConfig {
  return {
    key: `custom_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    label: "",
    type: "text",
    required: false,
    hidden: false,
    locked: false,
    options: [],
    order,
  };
}

export default function FormBuilder() {
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get(`/form-config/${FORM_TYPE}`)
      .then((r) => setFields(r.data.fields ?? []))
      .catch(() => toast.error("Failed to load form configuration"))
      .finally(() => setLoading(false));
  }, []);

  function updateField(index: number, patch: Partial<FormFieldConfig>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  function addCustomField() {
    setFields((prev) => [...prev, newCustomField(prev.length)]);
  }

  function move(index: number, dir: -1 | 1) {
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    const customFields = fields.filter((f) => f.type !== "built-in");
    for (const f of customFields) {
      if (!f.label.trim()) return toast.error("Every custom field needs a label");
      if (f.type === "dropdown" && (!f.options || f.options.filter((o) => o.trim()).length === 0)) {
        return toast.error(`"${f.label}" needs at least one dropdown option`);
      }
    }
    setSaving(true);
    try {
      const payload = fields.map((f) => ({
        ...f,
        options: f.type === "dropdown" ? (f.options || []).map((o) => o.trim()).filter(Boolean) : undefined,
      }));
      const res = await apiClient.put(`/form-config/${FORM_TYPE}`, { fields: payload });
      setFields(res.data.fields ?? []);
      toast.success("Form configuration saved");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Loading form builder…" />;

  return (
    <div>
      <PageHeader
        title="Form Builder"
        subtitle="Daily Progress Report (public form) — choose which fields are required, hide ones you don't need, or add your own."
      />

      <div className="flex flex-col gap-3 mb-5">
        {fields.map((field, i) => (
          <Card key={field.key} className="flex items-start gap-3">
            <div className="flex flex-col gap-1 pt-2 text-gray-300 dark:text-gray-600">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-30">
                <GripVertical className="w-4 h-4 rotate-90" />
              </button>
            </div>

            <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_140px_auto_auto] gap-3 items-start">
              <Field
                label="Label"
                value={field.label}
                disabled={field.type === "built-in"}
                onChange={(e) => updateField(i, { label: e.target.value })}
              />
              <div>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Type</div>
                <div className="h-10 flex items-center text-[13px] text-gray-600 dark:text-gray-300">
                  {field.type === "built-in" ? (
                    <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> {FIELD_TYPE_LABEL[field.type]}</span>
                  ) : (
                    FIELD_TYPE_LABEL[field.type]
                  )}
                </div>
              </div>
              <label className="flex items-center gap-2 h-10 text-[13px] text-gray-600 dark:text-gray-300 whitespace-nowrap">
                <input
                  type="checkbox" checked={field.required} disabled={field.locked}
                  onChange={(e) => updateField(i, { required: e.target.checked })}
                />
                Required
              </label>
              {field.locked ? (
                <div className="h-10 flex items-center text-xs text-gray-400" title="This field is essential to how the report works and can't be hidden or removed">
                  Always on
                </div>
              ) : (
                <div className="h-10 flex items-center gap-3">
                  <label className="flex items-center gap-2 text-[13px] text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    <input type="checkbox" checked={field.hidden} onChange={(e) => updateField(i, { hidden: e.target.checked })} />
                    Hide from form
                  </label>
                  {field.type !== "built-in" && (
                    <button type="button" onClick={() => removeField(i)} className="text-red-500 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              {field.type !== "built-in" && (
                <div className="sm:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <SField
                    label="Field type"
                    value={field.type}
                    onChange={(v) => updateField(i, { type: v as FormFieldConfig["type"] })}
                    options={CUSTOM_TYPE_OPTIONS}
                  />
                  {field.type === "dropdown" && (
                    <Field
                      label="Options (comma-separated)"
                      value={(field.options || []).join(", ")}
                      onChange={(e) => updateField(i, { options: e.target.value.split(",") })}
                      placeholder="e.g. Sunny, Rainy, Cloudy"
                    />
                  )}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Btn label="Add Custom Field" icon={Plus} outline onClick={addCustomField} />
        <Btn label="Save Changes" color="primary" loading={saving} onClick={save} />
      </div>
    </div>
  );
}
