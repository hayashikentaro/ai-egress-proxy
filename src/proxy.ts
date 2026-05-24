import { AppConfig } from "./config.js";
import { ProxyError } from "./errors.js";
import { audit, redactHeaders } from "./logging.js";

export interface ProxyRequestPayload {
  readonly url: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
}

export interface ProxyResponsePayload {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);
const RESPONSE_HEADERS = new Set([
  "content-type",
  "cache-control",
  "request-id",
  "x-request-id",
  "openai-request-id"
]);

export async function proxyRequest(
  payload: unknown,
  config: Pick<AppConfig, "allowedHosts" | "upstreamTimeoutMs">
): Promise<ProxyResponsePayload> {
  const request = parsePayload(payload);
  const upstreamUrl = parseUpstreamUrl(request.url, config.allowedHosts);
  const method = normalizeMethod(request.method);
  const headers = normalizeHeaders(request.headers);
  const body = serializeBody(method, headers, request.body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
  const startedAt = Date.now();

  audit("proxy.request", {
    method,
    upstreamHost: upstreamUrl.hostname,
    upstreamPath: upstreamUrl.pathname,
    headers: redactHeaders(headers)
  });

  try {
    const response = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      signal: controller.signal
    });

    const responseHeaders = selectResponseHeaders(response.headers);
    const responseBody = await parseResponseBody(response);

    audit("proxy.response", {
      method,
      upstreamHost: upstreamUrl.hostname,
      status: response.status,
      durationMs: Date.now() - startedAt,
      headers: redactHeaders(responseHeaders)
    });

    return {
      status: response.status,
      headers: responseHeaders,
      body: responseBody
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProxyError(504, "upstream_timeout", "Upstream request timed out");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parsePayload(payload: unknown): ProxyRequestPayload {
  if (!isRecord(payload)) {
    throw new ProxyError(400, "invalid_request", "Request body must be a JSON object");
  }

  if (typeof payload.url !== "string" || payload.url.trim() === "") {
    throw new ProxyError(400, "invalid_url", "url is required");
  }

  if (payload.method !== undefined && typeof payload.method !== "string") {
    throw new ProxyError(400, "invalid_method", "method must be a string");
  }

  if (payload.headers !== undefined && !isStringRecord(payload.headers)) {
    throw new ProxyError(400, "invalid_headers", "headers must be an object of string values");
  }

  return {
    url: payload.url,
    method: payload.method,
    headers: payload.headers,
    body: payload.body
  };
}

function parseUpstreamUrl(rawUrl: string, allowedHosts: ReadonlySet<string>): URL {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new ProxyError(400, "invalid_url", "url must be an absolute URL");
  }

  if (url.protocol !== "https:") {
    throw new ProxyError(400, "https_required", "Upstream URL must use HTTPS");
  }

  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new ProxyError(403, "upstream_host_not_allowed", "Upstream host is not allowed");
  }

  if (url.username || url.password) {
    throw new ProxyError(400, "url_credentials_not_allowed", "URL credentials are not allowed");
  }

  return url;
}

function normalizeMethod(method: string | undefined): string {
  const normalized = (method || "POST").toUpperCase();

  if (!ALLOWED_METHODS.has(normalized)) {
    throw new ProxyError(400, "method_not_allowed", "HTTP method is not allowed");
  }

  return normalized;
}

function normalizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers ?? {})) {
    const lowerName = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerName) || lowerName === "host") {
      continue;
    }

    normalized[lowerName] = value;
  }

  return normalized;
}

function serializeBody(
  method: string,
  headers: Record<string, string>,
  body: unknown
): string | undefined {
  if (body === undefined || method === "GET") {
    return undefined;
  }

  if (typeof body === "string") {
    return body;
  }

  if (!headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  return JSON.stringify(body);
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (!text) {
    return null;
  }

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return text;
}

function selectResponseHeaders(headers: Headers): Record<string, string> {
  const selected: Record<string, string> = {};

  for (const [name, value] of headers.entries()) {
    if (RESPONSE_HEADERS.has(name.toLowerCase())) {
      selected[name.toLowerCase()] = value;
    }
  }

  return selected;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((item) => typeof item === "string");
}
