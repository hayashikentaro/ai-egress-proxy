import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { AppConfig } from "./config.js";
import { isProxyError, ProxyError } from "./errors.js";
import {
  handleConnectRequest,
  handleForwardHttpRequest,
  isForwardProxyHttpRequest
} from "./forward-proxy.js";
import { audit } from "./logging.js";
import { proxyRequest } from "./proxy.js";

interface JsonError {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

interface PolicySummary {
  readonly mode: {
    readonly broker: {
      readonly enabled: true;
      readonly endpoint: "/v1/proxy";
      readonly authRequired: boolean;
      readonly allowedHosts: readonly string[];
      readonly httpsOnly: true;
    };
    readonly forwardProxy: {
      readonly enabled: boolean;
      readonly httpMethods: {
        readonly allowed: readonly string[];
        readonly deniedByDefault: readonly string[];
      };
      readonly connect: {
        readonly allowedPorts: readonly number[];
        readonly deniedOtherPortsByDefault: true;
      };
      readonly destinationPolicy: {
        readonly allowedDomains: readonly string[];
        readonly deniedDomains: readonly string[];
        readonly blocksPrivateInternalMetadataIps: true;
      };
    };
  };
  readonly limits: {
    readonly maxRequestBytes: number;
    readonly upstreamTimeoutMs: number;
  };
  readonly audit: {
    readonly jsonl: true;
    readonly sink: "stdout" | "file";
    readonly logPathConfigured: boolean;
  };
}

export function createAppServer(config: AppConfig) {
  const server = createServer(async (request, response) => {
    try {
      await routeRequest(request, response, config);
    } catch (error) {
      handleError(response, error);
    }
  });

  server.on("connect", (request, socket, head) => {
    if (!config.forwardProxyEnabled) {
      socket.end("HTTP/1.1 404 Not Found\r\nconnection: close\r\n\r\n");
      return;
    }

    handleConnectRequest(request, socket as Socket, head, config).catch(() => {
      socket.end("HTTP/1.1 500 Internal Server Error\r\nconnection: close\r\n\r\n");
    });
  });

  return server;
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

  if (method === "GET" && url.pathname === "/policy") {
    writeJson(response, 200, buildPolicySummary(config));
    return;
  }

  if (method === "POST" && url.pathname === "/v1/proxy") {
    authorize(request, config.proxyBearerToken);
    const body = await readJsonBody(request, config.maxRequestBytes);
    const proxied = await proxyRequest(body, config);
    writeJson(response, 200, proxied);
    return;
  }

  if (config.forwardProxyEnabled && isForwardProxyHttpRequest(request)) {
    await handleForwardHttpRequest(request, response, config);
    return;
  }

  throw new ProxyError(404, "not_found", "Route not found");
}

export function buildPolicySummary(config: AppConfig): PolicySummary {
  return {
    mode: {
      broker: {
        enabled: true,
        endpoint: "/v1/proxy",
        authRequired: config.proxyBearerToken !== undefined,
        allowedHosts: [...config.allowedHosts],
        httpsOnly: true
      },
      forwardProxy: {
        enabled: config.forwardProxyEnabled,
        httpMethods: {
          allowed: ["GET", "HEAD"],
          deniedByDefault: ["POST", "PUT", "PATCH", "DELETE"]
        },
        connect: {
          allowedPorts: [443],
          deniedOtherPortsByDefault: true
        },
        destinationPolicy: {
          allowedDomains: config.forwardAllowedDomains,
          deniedDomains: config.forwardDeniedDomains,
          blocksPrivateInternalMetadataIps: true
        }
      }
    },
    limits: {
      maxRequestBytes: config.maxRequestBytes,
      upstreamTimeoutMs: config.upstreamTimeoutMs
    },
    audit: {
      jsonl: true,
      sink: config.auditLogPath ? "file" : "stdout",
      logPathConfigured: config.auditLogPath !== undefined
    }
  };
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
