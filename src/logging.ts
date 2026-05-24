const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
  "x-auth-token"
]);

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

  console.log(JSON.stringify(payload));
}

