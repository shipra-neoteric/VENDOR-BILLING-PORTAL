const mongoose = require('mongoose');

const contractorSchema = new mongoose.Schema(
  {
    vendorCode:          { type: String, required: true, unique: true },
    companyName:         { type: String, required: true, trim: true },
    ownerName:           { type: String, required: true, trim: true },
    address:             { type: String },
    mobile:              { type: String, required: true },
    alternateMobile:     { type: String },
    email:               { type: String },
    accountHolderName:   { type: String },
    bankName:            { type: String },
    accountNumber:       { type: String },
    ifscCode:            { type: String },
    branchName:          { type: String },
    gstNumber:           { type: String },
    panNumber:           { type: String },
    workTypes:           [{ type: String }],
    reference1:          { type: String },
    reference2:          { type: String },
    averageTurnover:     { type: Number },
    status:              { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Contractor', contractorSchema);
