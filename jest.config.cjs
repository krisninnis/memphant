const path = require('path');

module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setupTests.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      path.resolve(__dirname, 'node_modules/ts-jest'),
      {
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          jsx: 'react-jsx',
        },
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@tauri-apps/(.*)$': '<rootDir>/src/tests/__mocks__/tauri.ts',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    'src/tests/e2e/auth-logout-mobile.test.ts',
  ],
  clearMocks: true,
};
