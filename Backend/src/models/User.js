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
