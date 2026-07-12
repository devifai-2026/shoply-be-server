const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './test/globalSetup.js',
    setupFiles: ['./test/setup.js'],
    testTimeout: 20000,
    hookTimeout: 30000,
    pool: 'forks',
    fileParallelism: false,
  },
});
