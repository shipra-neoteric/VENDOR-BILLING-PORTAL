const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    code:          { type: String, required: true, unique: true, trim: true },
    name:          { type: String, required: true, trim: true },
    location:      { type: String, trim: true },
    contractValue: { type: Number, default: 0 },
    status:        { type: String, enum: ['active', 'completed', 'on-hold'], default: 'active' },
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);
