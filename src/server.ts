import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AppConfig } from "./config.js";
import { isProxyError, ProxyError } from "./errors.js";
import { audit } from "./logging.js";
import { proxyRequest } from "./proxy.js";

interface JsonError {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export function createAppServer(config: AppConfig) {
  return createServer(async (request, response) => {
    try {
      await routeRequest(request, response, config);
    } catch (error) {
      handleError(response, error);
    }
  });
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: AppConfig
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");

  if (method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (method === "POST" && url.pathname === "/v1/proxy") {
    authorize(request, config.proxyBearerToken);
    const body = await readJsonBody(request, config.maxRequestBytes);
    const proxied = await proxyRequest(body, config);
    writeJson(response, 200, proxied);
    return;
  }

  throw new ProxyError(404, "not_found", "Route not found");
}

function authorize(request: IncomingMessage, expectedToken: string | undefined): void {
  if (!expectedToken) {
    return;
  }

  const authorization = request.headers.authorization;
  if (authorization !== `Bearer ${expectedToken}`) {
    throw new ProxyError(401, "unauthorized", "Unauthorized");
  }
}

async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > maxBytes) {
      throw new ProxyError(413, "request_too_large", "Request body is too large");
    }

    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    throw new ProxyError(400, "empty_body", "Request body is required");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new ProxyError(400, "invalid_json", "Request body must be valid JSON");
  }
}

function handleError(response: ServerResponse, error: unknown): void {
  if (response.headersSent) {
    response.end();
    return;
  }

  if (isProxyError(error)) {
    audit("proxy.error", {
      status: error.statusCode,
      code: error.code,
      message: error.message
    });
    writeJson(response, error.statusCode, toJsonError(error.code, error.message));
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  audit("proxy.error", {
    status: 500,
    code: "internal_error",
    message
  });
  writeJson(response, 500, toJsonError("internal_error", "Internal server error"));
}

function toJsonError(code: string, message: string): JsonError {
  return {
    error: {
      code,
      message
    }
  };
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

