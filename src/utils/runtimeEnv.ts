type RuntimeEnv = Record<string, string | undefined>;

declare global {
  // eslint-disable-next-line no-var
  var __MEMPHANT_ENV__: RuntimeEnv | undefined;
}

export function getRuntimeEnv(): RuntimeEnv {
  if (typeof globalThis !== 'undefined' && globalThis.__MEMPHANT_ENV__) {
    return globalThis.__MEMPHANT_ENV__;
  }

  if (typeof process !== 'undefined' && process.env) {
    return process.env as RuntimeEnv;
  }

  return {};
}

export function getRuntimeEnvValue(key: string): string | undefined {
  return getRuntimeEnv()[key];
}
