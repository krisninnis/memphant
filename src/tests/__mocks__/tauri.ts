// Mock for all @tauri-apps/* imports so unit tests can run outside Tauri
export const invoke = jest.fn().mockResolvedValue(undefined);
export const open = jest.fn().mockResolvedValue(null);
export const save = jest.fn().mockResolvedValue(null);
export const openUrl = jest.fn().mockResolvedValue(undefined);
export const check = jest.fn().mockResolvedValue(null);
export const getSession = jest.fn().mockResolvedValue({ data: { session: null } });
export default {};
