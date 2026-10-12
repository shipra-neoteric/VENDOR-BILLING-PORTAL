const mongoose = require('mongoose');
const { Schema } = mongoose;

// One row per form field — both the fixed, built-in fields a form's own
// schema already has (projectId, labourCount, etc., which can only have
// their required/visible flags toggled, never deleted — the backend schema
// and downstream features like QC sync/Work Progress genuinely depend on
// them existing) and admin-added custom fields (type chosen freely, fully
// addable/removable). `locked` marks a built-in field whose `required` and
// `hidden` can never be changed — the ones everything else in the app
// structurally depends on (e.g. projectId: the record is meaningless
// without it; vendorCode: used to resolve the contractor; workEntries: feeds
// Work Progress/QC sync).
const formFieldSchema = new Schema(
  {
    key:      { type: String, required: true }, // built-in field name, or "custom_<id>" for a custom one
    label:    { type: String, required: true },
    type:     { type: String, enum: ['built-in', 'text', 'number', 'date', 'dropdown', 'file'], required: true },
    required: { type: Boolean, default: false },
    hidden:   { type: Boolean, default: false },
    locked:   { type: Boolean, default: false },
    // Only meaningful for type: 'dropdown'.
    options:  [{ type: String }],
    order:    { type: Number, default: 0 },
  },
  { _id: false }
);

const formConfigSchema = new Schema(
  {
    // One doc per public form this master covers — "daily-progress-report"
    // is the only one wired up today; the shape is generic so another public
    // form (Drawing Request, Work Order, …) can reuse the same model/UI
    // later without a schema change.
    formType: { type: String, required: true, unique: true },
    fields:   { type: [formFieldSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FormConfig', formConfigSchema);
