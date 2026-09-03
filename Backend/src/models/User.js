const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name:  { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    // No longer a fixed enum — a custom role name (validated in
    // userController.js's isValidRole) is also accepted, alongside the 6
    // built-in roles. Those 6 keep every existing hardcoded behavior
    // (owner/site-dri bypasses, authorize() gates, etc.) exactly as before;
    // a custom role gets none of that and relies entirely on its own
    // `permissions` array.
    role: {
      type: String,
      default: 'site-dri',
    },
    vendorCode: { type: String, default: null },
    mobile: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    // Slack member ID (e.g. "U0123ABC") — links a Slack account to this user so
    // an Approve/Reject click on a Slack approval message can be attributed to
    // the real person, not a generic bot identity. Found on Slack via the
    // person's profile → "More" → "Copy member ID".
    slackUserId: { type: String, default: null },
    // Which internal team this user belongs to — same fixed list as
    // WorkOrder/RunningBill's own Department field. Drives which bills a
    // user can see/approve in the Bill Approval flow (only their own
    // department's bills) and who shows up as a candidate L1 approver when
    // a bill in that department is created.
    department: {
      type: String,
      enum: ['', 'civil', 'marketing', 'planning', 'maintenance', 'custom'],
      default: '',
    },
    customDepartment: { type: String, default: '' },
    permissions: [{
      module:  { type: String, required: true },
      actions: [{ type: String }],
      _id: false,
    }],
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
