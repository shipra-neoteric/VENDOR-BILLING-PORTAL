const mongoose = require('mongoose');

const stageSchema = new mongoose.Schema(
  {
    projectId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Project',  required: true },
    categoryId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    name:        { type: String, required: true, trim: true },
    sequence:    { type: Number, default: 1 },
    description: { type: String },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

stageSchema.index({ projectId: 1, categoryId: 1, sequence: 1 });

module.exports = mongoose.model('Stage', stageSchema);
