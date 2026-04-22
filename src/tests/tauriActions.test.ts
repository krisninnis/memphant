import { isTauri } from '@tauri-apps/api/core';
import { isDesktopApp } from '../utils/runtime';

const mockedIsTauri = isTauri as jest.MockedFunction<typeof isTauri>;

describe('isDesktopApp', () => {
  afterEach(() => {
    mockedIsTauri.mockReset();
    mockedIsTauri.mockReturnValue(false);
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('returns true when the supported Tauri runtime flag is present', () => {
    mockedIsTauri.mockReturnValue(true);

    expect(isDesktopApp()).toBe(true);
  });

  it('falls back to the legacy internal global for older desktop builds', () => {
    mockedIsTauri.mockReturnValue(false);
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    expect(isDesktopApp()).toBe(true);
  });

  it('returns false in plain browser mode', () => {
    mockedIsTauri.mockReturnValue(false);

    expect(isDesktopApp()).toBe(false);
  });
});
