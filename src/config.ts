import { readFileSync } from "node:fs";

export interface AppConfig {
  readonly port: number;
  readonly host: string;
  readonly allowedHosts: ReadonlySet<string>;
  readonly forwardProxyEnabled: boolean;
  readonly forwardAllowedDomains: readonly string[];
  readonly forwardDeniedDomains: readonly string[];
  readonly proxyBearerToken?: string;
  readonly maxRequestBytes: number;
  readonly upstreamTimeoutMs: number;
}

interface ConfigFile {
  readonly server?: {
    readonly host?: unknown;
    readonly port?: unknown;
  };
  readonly broker?: {
    readonly allowedHosts?: unknown;
  };
  readonly forwardProxy?: {
    readonly enabled?: unknown;
    readonly allowedDomains?: unknown;
    readonly deniedDomains?: unknown;
  };
  readonly limits?: {
    readonly maxRequestBytes?: unknown;
    readonly upstreamTimeoutMs?: unknown;
  };
}

const DEFAULT_ALLOWED_HOSTS = [
  "api.openai.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com"
];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const fileConfig = loadConfigFile(env.AI_EGRESS_PROXY_CONFIG);

  return {
    port: readInteger(
      env.PORT,
      readFileInteger(fileConfig.server?.port, 8787, "server.port"),
      "PORT"
    ),
    host: env.HOST?.trim() || readFileString(fileConfig.server?.host, "127.0.0.1", "server.host"),
    allowedHosts: new Set(
      readCsv(
        env.ALLOWED_HOSTS,
        readFileStringArray(fileConfig.broker?.allowedHosts, DEFAULT_ALLOWED_HOSTS, "broker.allowedHosts")
      )
    ),
    forwardProxyEnabled: readBoolean(
      env.FORWARD_PROXY_ENABLED,
      readFileBoolean(fileConfig.forwardProxy?.enabled, true, "forwardProxy.enabled")
    ),
    forwardAllowedDomains: readCsv(
      env.FORWARD_ALLOWED_DOMAINS,
      readFileStringArray(
        fileConfig.forwardProxy?.allowedDomains,
        DEFAULT_ALLOWED_HOSTS,
        "forwardProxy.allowedDomains"
      )
    ),
    forwardDeniedDomains: readCsv(
      env.FORWARD_DENIED_DOMAINS,
      readFileStringArray(fileConfig.forwardProxy?.deniedDomains, [], "forwardProxy.deniedDomains")
    ),
    proxyBearerToken: emptyToUndefined(env.PROXY_BEARER_TOKEN),
    maxRequestBytes: readInteger(
      env.MAX_REQUEST_BYTES,
      readFileInteger(fileConfig.limits?.maxRequestBytes, 1_048_576, "limits.maxRequestBytes"),
      "MAX_REQUEST_BYTES"
    ),
    upstreamTimeoutMs: readInteger(
      env.UPSTREAM_TIMEOUT_MS,
      readFileInteger(fileConfig.limits?.upstreamTimeoutMs, 60_000, "limits.upstreamTimeoutMs"),
      "UPSTREAM_TIMEOUT_MS"
    )
  };
}

function loadConfigFile(path: string | undefined): ConfigFile {
  const trimmed = path?.trim();
  if (!trimmed) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(trimmed, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Could not read AI_EGRESS_PROXY_CONFIG ${trimmed}: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error("AI_EGRESS_PROXY_CONFIG must contain a JSON object");
  }

  return parsed;
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

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function readFileString(value: unknown, fallback: string, name: string): string {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value.trim();
}

function readFileStringArray(value: unknown, fallback: readonly string[], name: string): string[] {
  if (value === undefined) {
    return [...fallback];
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${name} must be an array of non-empty strings`);
  }

  return value.map((item) => item.trim().toLowerCase());
}

function readFileInteger(value: unknown, fallback: number, name: string): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function readFileBoolean(value: unknown, fallback: boolean, name: string): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`);
  }

  return value;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
