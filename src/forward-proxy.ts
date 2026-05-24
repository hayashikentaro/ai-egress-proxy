import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { connect as connectTcp, isIP, Socket } from "node:net";
import { IncomingMessage, ServerResponse } from "node:http";
import { AppConfig } from "./config.js";
import { DenyDecision, validateDestination } from "./destination-policy.js";
import { audit, redactHeaders } from "./logging.js";

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
const SAFE_FORWARD_HTTP_METHODS = new Set(["GET", "HEAD"]);

export function isForwardProxyHttpRequest(request: IncomingMessage): boolean {
  const rawUrl = request.url ?? "";
  return rawUrl.startsWith("http://") || rawUrl.startsWith("https://");
}

export async function handleForwardHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: AppConfig
): Promise<void> {
  let target: URL;

  try {
    target = new URL(request.url ?? "");
  } catch {
    writeDenyResponse(response, 400, {
      allowed: false,
      code: "invalid_forward_url",
      message: "Forward proxy requests must use an absolute HTTP URL",
      guidance: "Configure the client to use this service as HTTP_PROXY so it sends absolute-form proxy requests."
    });
    return;
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    writeDenyResponse(response, 400, {
      allowed: false,
      code: "unsupported_forward_protocol",
      message: "Forward proxy only supports HTTP and HTTPS targets",
      guidance: "Use http:// or https:// destinations through the forward proxy."
    });
    return;
  }

  const methodDeny = validateForwardHttpMethod(request.method);
  if (methodDeny) {
    auditForwardDeny("forward.http.deny", request, target.hostname, methodDeny);
    writeDenyResponse(response, 405, methodDeny);
    return;
  }

  const decision = await validateDestination(
    {
      hostname: target.hostname,
      port: Number(target.port || defaultPort(target.protocol)),
      protocol: target.protocol
    },
    {
      allowedDomains: config.forwardAllowedDomains,
      deniedDomains: config.forwardDeniedDomains
    }
  );

  if (!decision.allowed) {
    auditForwardDeny("forward.http.deny", request, target.hostname, decision);
    writeDenyResponse(response, 403, decision);
    return;
  }

  const startedAt = Date.now();
  audit("forward.http.request", {
    method: request.method,
    destinationHost: target.hostname,
    destinationPort: Number(target.port || defaultPort(target.protocol)),
    headers: redactHeaders(headersToRecord(request.headers))
  });

  await proxyHttpRequest(request, response, target, decision.addresses[0], startedAt);
}

export function validateForwardHttpMethod(method: string | undefined): DenyDecision | undefined {
  const normalized = (method ?? "GET").toUpperCase();

  if (SAFE_FORWARD_HTTP_METHODS.has(normalized)) {
    return undefined;
  }

  return {
    allowed: false,
    code: "forward_http_method_denied",
    message: "Forward proxy HTTP requests only allow safe read-like methods by default",
    guidance:
      "Use GET or HEAD for forward proxy egress. Route write-like API calls through broker mode or ask an operator to add an explicit policy."
  };
}

export async function handleConnectRequest(
  request: IncomingMessage,
  clientSocket: Socket,
  head: Buffer,
  config: AppConfig
): Promise<void> {
  const destination = parseConnectDestination(request.url ?? "");

  if (!destination) {
    writeConnectDeny(clientSocket, 400, {
      allowed: false,
      code: "invalid_connect_target",
      message: "CONNECT target must use host:port form",
      guidance: "Configure HTTPS_PROXY with this proxy and let the client send CONNECT example.com:443."
    });
    return;
  }

  const decision = await validateDestination(
    {
      hostname: destination.hostname,
      port: destination.port,
      protocol: "https:"
    },
    {
      allowedDomains: config.forwardAllowedDomains,
      deniedDomains: config.forwardDeniedDomains
    }
  );

  if (!decision.allowed) {
    auditForwardDeny("forward.connect.deny", request, destination.hostname, decision);
    writeConnectDeny(clientSocket, 403, decision);
    return;
  }

  audit("forward.connect.request", {
    method: "CONNECT",
    destinationHost: destination.hostname,
    destinationPort: destination.port
  });

  const upstreamSocket = connectTcp(destination.port, decision.addresses[0]);

  upstreamSocket.once("connect", () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length > 0) {
      upstreamSocket.write(head);
    }
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });

  upstreamSocket.once("error", () => {
    if (!clientSocket.destroyed) {
      writeConnectDeny(clientSocket, 502, {
        allowed: false,
        code: "upstream_connect_failed",
        message: "Could not connect to destination",
        guidance: "Check that the allowed destination is reachable from the proxy runtime."
      });
    }
  });
}

function proxyHttpRequest(
  clientRequest: IncomingMessage,
  clientResponse: ServerResponse,
  target: URL,
  upstreamAddress: string,
  startedAt: number
): Promise<void> {
  return new Promise((resolve) => {
    const headers = stripProxyHeaders(headersToRecord(clientRequest.headers));
    const transport = target.protocol === "https:" ? requestHttps : requestHttp;
    const upstreamRequest = transport(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || defaultPort(target.protocol),
        method: clientRequest.method,
        path: `${target.pathname}${target.search}`,
        headers,
        lookup: lockedLookup(upstreamAddress)
      },
      (upstreamResponse) => {
        clientResponse.writeHead(
          upstreamResponse.statusCode ?? 502,
          stripProxyHeaders(headersToRecord(upstreamResponse.headers))
        );
        upstreamResponse.pipe(clientResponse);
        upstreamResponse.once("end", () => {
          audit("forward.http.response", {
            method: clientRequest.method,
            destinationHost: target.hostname,
            status: upstreamResponse.statusCode ?? 502,
            durationMs: Date.now() - startedAt
          });
          resolve();
        });
      }
    );

    upstreamRequest.once("error", () => {
      if (!clientResponse.headersSent) {
        writeDenyResponse(clientResponse, 502, {
          allowed: false,
          code: "upstream_request_failed",
          message: "Could not forward request to destination",
          guidance: "Check that the allowed destination is reachable from the proxy runtime."
        });
      } else {
        clientResponse.end();
      }
      resolve();
    });

    clientRequest.pipe(upstreamRequest);
  });
}

function parseConnectDestination(value: string): { hostname: string; port: number } | undefined {
  const separator = value.lastIndexOf(":");
  if (separator <= 0) {
    return undefined;
  }

  const hostname = value.slice(0, separator).replace(/^\[|\]$/g, "");
  const port = Number(value.slice(separator + 1));

  if (!hostname || !Number.isInteger(port)) {
    return undefined;
  }

  return { hostname, port };
}

function writeDenyResponse(response: ServerResponse, statusCode: number, decision: DenyDecision): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(
    JSON.stringify({
      error: {
        code: decision.code,
        message: decision.message,
        guidance: decision.guidance
      }
    })
  );
}

function writeConnectDeny(socket: Socket, statusCode: number, decision: DenyDecision): void {
  const body = JSON.stringify({
    error: {
      code: decision.code,
      message: decision.message,
      guidance: decision.guidance
    }
  });

  socket.end(
    `HTTP/1.1 ${statusCode} ${statusText(statusCode)}\r\n` +
      "content-type: application/json; charset=utf-8\r\n" +
      `content-length: ${Buffer.byteLength(body)}\r\n` +
      "connection: close\r\n" +
      "\r\n" +
      body
  );
}

function auditForwardDeny(
  event: string,
  request: IncomingMessage,
  destinationHost: string,
  decision: DenyDecision
): void {
  audit(event, {
    method: request.method,
    destinationHost,
    code: decision.code,
    message: decision.message,
    guidance: decision.guidance
  });
}

function stripProxyHeaders(headers: Record<string, string>): Record<string, string> {
  const stripped: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      stripped[name] = value;
    }
  }

  return stripped;
}

function headersToRecord(headers: IncomingMessage["headers"]): Record<string, string> {
  const record: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      record[name] = value;
    } else if (Array.isArray(value)) {
      record[name] = value.join(", ");
    }
  }

  return record;
}

function defaultPort(protocol: string): string {
  return protocol === "https:" ? "443" : "80";
}

function lockedLookup(address: string) {
  return (
    _hostname: string,
    _options: unknown,
    callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void
  ) => {
    callback(null, address, isIP(address));
  };
}

function statusText(statusCode: number): string {
  if (statusCode === 400) {
    return "Bad Request";
  }

  if (statusCode === 403) {
    return "Forbidden";
  }

  if (statusCode === 502) {
    return "Bad Gateway";
  }

  return "Error";
}
