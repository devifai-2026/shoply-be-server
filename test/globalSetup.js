const { MongoMemoryServer } = require('mongodb-memory-server');

// Runs once for the whole test run, before any test file's module graph is
// imported — starts a real (but ephemeral, in-memory) MongoDB and points
// MONGODB_URI at it so every model file's mongoose.connect() call in
// test/setup.js hits this instance instead of any real database.
module.exports = async function setup() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
  process.env.NODE_ENV = 'test';
  globalThis.__MONGOD__ = mongod;
  return async function teardown() {
    await mongod.stop();
  };
};
