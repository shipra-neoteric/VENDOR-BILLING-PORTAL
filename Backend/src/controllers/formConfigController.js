const asyncHandler = require('../utils/asyncHandler');
const { success, badRequest } = require('../utils/responseFormatter');
const FormConfig = require('../models/FormConfig');

// Default field set for the Daily Progress Report public form — matches
// PublicDailyProgressReportForm.tsx's current hardcoded fields exactly, so a
// freshly-created config changes nothing about the live form until an admin
// actually edits it. projectId/vendorCode/workEntries are locked (see
// FormConfig.js's own comment on why); the rest can have `required` toggled.
const DEFAULT_FIELDS = {
  'daily-progress-report': [
    { key: 'projectId',   label: 'Project Name',       type: 'built-in', required: true, locked: true,  order: 1 },
    { key: 'vendorCode',  label: 'Contractor Name',    type: 'built-in', required: true, locked: true,  order: 2 },
    { key: 'driName',     label: 'DRI Name',           type: 'built-in', required: true, locked: false, order: 3 },
    { key: 'date',        label: 'Date',               type: 'built-in', required: true, locked: false, order: 4 },
    { key: 'shiftType',   label: 'Shift Type',         type: 'built-in', required: true, locked: false, order: 5 },
    { key: 'labourCount', label: 'Number of Labourers',type: 'built-in', required: true, locked: false, order: 6 },
    { key: 'workEntries', label: 'Work Type Checklist',type: 'built-in', required: true, locked: true,  order: 7 },
  ],
};

async function getOrCreateConfig(formType) {
  let config = await FormConfig.findOne({ formType });
  if (!config) {
    const defaults = DEFAULT_FIELDS[formType];
    if (!defaults) return null;
    config = await FormConfig.create({ formType, fields: defaults });
  }
  return config;
}

// GET /api/public/form-config/:formType — no auth, read-only. The public
// form itself calls this to know which fields to render/require.
exports.getPublicFormConfig = asyncHandler(async (req, res) => {
  const config = await getOrCreateConfig(req.params.formType);
  if (!config) return badRequest(res, `Unknown form type '${req.params.formType}'`);
  success(res, { fields: config.fields.filter((f) => !f.hidden).sort((a, b) => a.order - b.order) });
});

// GET /api/form-config/:formType — authenticated admin view, includes
// hidden fields too (the Form Builder page needs to show/toggle them).
exports.getFormConfig = asyncHandler(async (req, res) => {
  const config = await getOrCreateConfig(req.params.formType);
  if (!config) return badRequest(res, `Unknown form type '${req.params.formType}'`);
  success(res, { fields: config.fields.sort((a, b) => a.order - b.order) });
});

// PUT /api/form-config/:formType — replaces the whole field list. Simpler
// and safer than per-field patch endpoints for what's fundamentally a
// reorderable list the admin edits as a whole in one page, same convention
// WorkOrder's paymentMilestones/scopeItems already use (send the full array
// back on every save).
exports.updateFormConfig = asyncHandler(async (req, res) => {
  const { fields } = req.body;
  if (!Array.isArray(fields) || fields.length === 0) {
    return badRequest(res, 'At least one field is required');
  }
  for (const f of fields) {
    if (!f.key || !f.label || !f.type) {
      return badRequest(res, 'Every field needs a key, label, and type');
    }
    if (f.type === 'dropdown' && (!Array.isArray(f.options) || f.options.length === 0)) {
      return badRequest(res, `Dropdown field "${f.label}" needs at least one option`);
    }
  }
  // Never let the admin UI un-lock or hide a locked field, even via a raw
  // API call with a tampered payload — re-apply the real locked fields'
  // required/hidden from the defaults rather than trusting the request body
  // for those specific keys.
  const defaults = DEFAULT_FIELDS[req.params.formType] || [];
  const lockedByKey = new Map(defaults.filter((f) => f.locked).map((f) => [f.key, f]));
  const sanitized = fields.map((f, i) => {
    const locked = lockedByKey.get(f.key);
    return {
      ...f,
      required: locked ? true : Boolean(f.required),
      hidden: locked ? false : Boolean(f.hidden),
      locked: Boolean(locked),
      order: i,
    };
  });

  const config = await FormConfig.findOneAndUpdate(
    { formType: req.params.formType },
    { $set: { fields: sanitized } },
    { new: true, upsert: true }
  );
  success(res, { fields: config.fields }, 'Form configuration saved');
});

module.exports.DEFAULT_FIELDS = DEFAULT_FIELDS;
