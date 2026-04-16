import '@testing-library/jest-dom';

// Quiet noisy cloud sync logs during tests.
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

// Basic IndexedDB mock hook if a test needs it and hasn't provided one.
if (typeof indexedDB === 'undefined') {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: {
      databases: jest.fn(async () => []),
      deleteDatabase: jest.fn(),
    },
    writable: true,
  });
}