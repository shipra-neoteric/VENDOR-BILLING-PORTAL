const Counter = require('../models/Counter');

// Atomically reserves the next number in a named sequence and formats it as
// a code. Replaces the old "find the max existing code, add 1" approach,
// which has a read-then-write gap: two requests landing close together
// (double-click, a slow Render cold-start prompting a retry click, two
// people submitting at once) can both read the same max and then both try
// to insert the same code, tripping the unique-index "already exists" error.
// $inc via findOneAndUpdate is a single atomic operation at the DB level,
// so concurrent callers always get distinct, gap-free numbers.
async function nextCode(sequenceName, prefix, pad = 4) {
  const counter = await Counter.findOneAndUpdate(
    { _id: sequenceName },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return `${prefix}${String(counter.seq).padStart(pad, '0')}`;
}

module.exports = { nextCode };
