# Smoke Tests

This document describes small local checks for confirming that AI Egress Proxy enforces the expected v0 forward proxy boundaries.

The smoke workflow is not a new product mode. It is a human and agent-friendly way to prove that selected egress paths are allowed or denied by code.

## Forward Proxy Smoke Test

Run:

```bash
npm run smoke:forward
```

The script builds the project, starts a local proxy on `127.0.0.1:18787`, runs a set of curl-based checks, and then stops the proxy.

It checks:

- Allowed HTTP `GET` through the forward proxy.
- Allowed HTTPS `CONNECT` to port `443`.
- Denied write-like HTTP method, using `POST`.
- Denied HTTPS `CONNECT` to a non-443 port.
- Denied metadata/private IP egress.

The script uses `config/smoke.example.json`, which intentionally sets `forwardProxy.allowedDomains` to `*` so that the private IP blocking check reaches IP policy instead of being denied earlier by domain policy. Do not treat that wildcard as a recommended deployment setting.

## Requirements

- Node.js dependencies installed with `npm install`.
- `curl` available on `PATH`.
- Local port `18787` available, or set `PROXY_PORT`.
- Internet access to `example.com` for the allowed egress checks.

## Useful Overrides

```bash
PROXY_PORT=18888 npm run smoke:forward
AI_EGRESS_PROXY_CONFIG=config/smoke.example.json npm run smoke:forward
SMOKE_ALLOWED_HTTP_URL=http://example.com/ npm run smoke:forward
SMOKE_ALLOWED_HTTPS_URL=https://example.com/ npm run smoke:forward
```

The script writes the proxy JSONL audit log to a temporary file and prints its path when the smoke run passes.
