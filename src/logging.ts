import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
  "x-auth-token"
]);
let auditLogPath: string | undefined;

export function configureAuditLog(path: string | undefined): void {
  auditLogPath = path;

  if (auditLogPath) {
    const directory = dirname(auditLogPath);
    if (directory !== ".") {
      mkdirSync(directory, { recursive: true });
    }
    appendFileSync(auditLogPath, "", "utf8");
  }
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    redacted[name] = SENSITIVE_HEADER_NAMES.has(name.toLowerCase()) ? "[redacted]" : value;
  }

  return redacted;
}

export function audit(event: string, fields: Record<string, unknown>): void {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    ...fields
  };
  const line = `${JSON.stringify(payload)}\n`;

  if (auditLogPath) {
    appendFileSync(auditLogPath, line, "utf8");
    return;
  }

  process.stdout.write(line);
}
