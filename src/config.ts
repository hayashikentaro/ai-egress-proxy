export interface AppConfig {
  readonly port: number;
  readonly host: string;
  readonly allowedHosts: ReadonlySet<string>;
  readonly proxyBearerToken?: string;
  readonly maxRequestBytes: number;
  readonly upstreamTimeoutMs: number;
}

const DEFAULT_ALLOWED_HOSTS = [
  "api.openai.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com"
];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: readInteger(env.PORT, 8787, "PORT"),
    host: env.HOST?.trim() || "127.0.0.1",
    allowedHosts: new Set(readCsv(env.ALLOWED_HOSTS, DEFAULT_ALLOWED_HOSTS)),
    proxyBearerToken: emptyToUndefined(env.PROXY_BEARER_TOKEN),
    maxRequestBytes: readInteger(env.MAX_REQUEST_BYTES, 1_048_576, "MAX_REQUEST_BYTES"),
    upstreamTimeoutMs: readInteger(env.UPSTREAM_TIMEOUT_MS, 60_000, "UPSTREAM_TIMEOUT_MS")
  };
}

function readCsv(value: string | undefined, fallback: readonly string[]): string[] {
  const raw = value?.trim();
  if (!raw) {
    return [...fallback];
  }

  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function readInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

