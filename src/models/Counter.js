const mongoose = require('mongoose');

// Generic atomic sequence counter (e.g. invoice numbers). One document per
// `key`; `next()` uses $inc via findOneAndUpdate, which MongoDB guarantees is
// atomic even under concurrent order creation — no race-condition duplicates.
const counterSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: Number, required: true, default: 0 },
});

const CounterDefault = mongoose.model('Counter', counterSchema);

function getCounterModel(conn) {
  if (!conn) return CounterDefault;
  return conn.models.Counter || conn.model('Counter', counterSchema);
}

// Returns the next integer in the sequence for `key`, seeding at `start` if
// the counter doesn't exist yet. Seeding and incrementing are separate atomic
// ops rather than one $inc, so a fresh counter's first value is exactly
// `start` (not start + 1) while concurrent creation still can't double-seed
// (the upsert's unique index rejects the loser of a race, who then falls
// through to the plain $inc below).
async function nextValue(Counter, key, start = 1) {
  try {
    await Counter.create({ key, value: start - 1 });
  } catch (err) {
    if (err.code !== 11000) throw err; // ignore "already seeded" races
  }
  const doc = await Counter.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { upsert: true, new: true },
  );
  return doc.value;
}

module.exports = CounterDefault;
module.exports.getCounterModel = getCounterModel;
module.exports.nextValue = nextValue;
