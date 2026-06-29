const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, unique: true, trim: true },
    color:       { type: String, required: true, default: '#6B7280' },
    description: { type: String, default: '' },
    isActive:    { type: Boolean, default: true },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
