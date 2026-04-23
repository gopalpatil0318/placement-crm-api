module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true,
  collectCoverageFrom: [
    'src/middleware/**/*.js',
    'src/utils/permissionCache.js',
  ],
};
