const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name:          { type: String, required: true, unique: true, trim: true },
    shortCode:     { type: String, required: true, unique: true, trim: true, uppercase: true },
    type:          {
      type: String,
      enum: ['Private Limited', 'LLP', 'Proprietorship', 'Partnership', 'Company', 'Other'],
      default: 'Private Limited',
    },
    cin:           { type: String, trim: true },
    gstNumber:     { type: String, trim: true },
    panNumber:     { type: String, trim: true },
    address:       { type: String, trim: true },
    city:          { type: String, trim: true },
    state:         { type: String, trim: true },
    email:         { type: String, trim: true, lowercase: true },
    phone:         { type: String, trim: true },
    contactPerson: { type: String, trim: true },
    color:         { type: String, default: '#6B7280' },
    isActive:      { type: Boolean, default: true },
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Company', companySchema);
