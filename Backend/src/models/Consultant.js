const mongoose = require('mongoose');

const docFieldSchema = new mongoose.Schema(
  { fileName: { type: String }, dataUrl: { type: String } },
  { _id: false }
);

const CONSULTANCY_TYPES = [
  'Architect', 'Interior Designer', 'Structural Consultant', 'MEP Consultant',
  'Landscape Consultant', 'Facade Consultant', 'Quantity Surveyor',
  'Project Management Consultant', 'BIM Consultant', 'Environmental Consultant',
  'Lighting Consultant', 'Other',
];

const consultantSchema = new mongoose.Schema(
  {
    consultantCode:      { type: String, required: true, unique: true },
    firmName:            { type: String, required: true, trim: true },
    principalName:       { type: String, required: true, trim: true },
    consultancyType:     { type: String, enum: CONSULTANCY_TYPES, default: 'Other' },
    professionalRegistration: { type: String, default: '' },
    licenseNo:           { type: String, default: '' },
    experience:          { type: String, default: '' },
    designSoftware:      [{ type: String }],
    portfolioUrl:        { type: String, default: '' },
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
    aadhaarNumber:       { type: String },
    status:              { type: String, enum: ['active', 'inactive'], default: 'active' },
    documents: {
      gstCertificate:  docFieldSchema,
      panCard:         docFieldSchema,
      cancelledCheque: docFieldSchema,
      businessCard:    docFieldSchema,
      professionalRegistrationCert: docFieldSchema,
    },
    createdBy:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Consultant', consultantSchema);
module.exports.CONSULTANCY_TYPES = CONSULTANCY_TYPES;
