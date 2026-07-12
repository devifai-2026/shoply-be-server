const mongoose = require('mongoose');

// globals: true in vitest.config.js makes describe/it/expect/beforeAll/etc.
// ambient — this whole codebase is CommonJS, and Vitest 4 no longer supports
// require('vitest') from a CJS file, so we rely on the globals instead.

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
});

afterEach(async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
});
