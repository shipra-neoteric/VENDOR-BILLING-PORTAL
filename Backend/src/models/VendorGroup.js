const mongoose = require('mongoose');

// A purely internal grouping of several independently-registered Contractor
// vendor codes that are, in reality, the same business (e.g. "Ambika
// Construction" issues a Work Order as one firm, but wants different bills
// against it paid out into different individually-registered accounts under
// that same firm). Membership lives on Contractor.groupId (has-many via FK),
// not as a list here, so there's only one place that can go out of sync.
const vendorGroupSchema = new mongoose.Schema(
  {
    groupCode: { type: String, required: true, unique: true },
    name:      { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('VendorGroup', vendorGroupSchema);
