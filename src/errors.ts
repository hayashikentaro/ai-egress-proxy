export class ProxyError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ProxyError";
  }
}

export function isProxyError(error: unknown): error is ProxyError {
  return error instanceof ProxyError;
}

