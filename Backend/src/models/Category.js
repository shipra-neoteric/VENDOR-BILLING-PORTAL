const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    color:       { type: String, required: true, default: '#6B7280' },
    description: { type: String, default: '' },
    isActive:    { type: Boolean, default: true },
    parentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Name must be unique within the same parent scope
categorySchema.index({ name: 1, parentId: 1 }, { unique: true });

module.exports = mongoose.model('Category', categorySchema);
