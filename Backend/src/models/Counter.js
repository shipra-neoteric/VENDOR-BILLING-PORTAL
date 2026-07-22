const mongoose = require('mongoose');

// Backs atomic auto-increment codes (WO numbers, bill numbers, etc — see
// utils/sequence.js). One document per named sequence, e.g. { _id: 'workOrderNo', seq: 208 }.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

module.exports = mongoose.model('Counter', counterSchema);
