const path = require('path');

module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': [
      path.resolve(__dirname, 'node_modules/ts-jest'),
      { tsconfig: { module: 'commonjs', esModuleInterop: true } },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Mock Tauri internals so tests can run outside Tauri
  moduleNameMapper: {
    '^@tauri-apps/(.*)$': '<rootDir>/src/tests/__mocks__/tauri.ts',
  },
};