# Project Status

Last updated: 2026-05-31

## Repository

- Local path: `/Users/hayashikentarou/Projects/ai-egress-proxy`
- GitHub remote: `git@github.com:hayashikentaro/ai-egress-proxy.git`
- Default branch: `main`
- Current package: `ai-egress-proxy`
- Runtime: Node.js 20+
- Language: TypeScript

## Current Shape

AI Egress Proxy is a small TypeScript service for structurally controlled AI egress. The project has two modes:

- Broker mode: `POST /v1/proxy` accepts explicit JSON proxy requests for AI-provider API calls.
- Forward proxy mode: HTTP absolute-form forwarding and HTTPS `CONNECT` support for clients that use `HTTP_PROXY` / `HTTPS_PROXY`.

The design principle is to prefer structural enforcement over behavioral restriction. Policy is enforced in server-side routing, validation, destination checks, deny defaults, and audit logging rather than relying on prompts or client self-reporting.

## Implemented v0 Capabilities

- Health endpoint: `GET /health`
- Runtime policy endpoint: `GET /policy`
- Broker endpoint: `POST /v1/proxy`
- Broker HTTPS-only upstream enforcement
- Broker upstream host allowlist
- Optional caller bearer-token auth with `PROXY_BEARER_TOKEN`
- Forward proxy HTTP absolute-form request handling
- Forward proxy HTTPS `CONNECT` handling
- Forward HTTP method policy: allow `GET` / `HEAD`, deny write-like methods by default
- CONNECT port policy: allow only port `443` by default
- Destination domain allow/deny policy
- Private, internal, loopback, multicast, and metadata IP blocking
- DNS resolution before forwarding, with forwarding locked to the resolved address
- AI-readable deny guidance in blocked forward proxy responses
- Redacted JSONL audit events
- Optional audit file output with `AUDIT_LOG_PATH`
- Optional JSON policy config file with `AI_EGRESS_PROXY_CONFIG`
- Example policy profiles in `config/`
- Forward proxy smoke workflow

## Key Files

- `src/index.ts`: loads config, configures audit logging, starts the server.
- `src/config.ts`: loads environment variables and optional JSON config files.
- `src/server.ts`: owns HTTP routing, `/health`, `/policy`, broker endpoint, and `CONNECT` wiring.
- `src/proxy.ts`: broker-mode request validation and upstream forwarding.
- `src/forward-proxy.ts`: forward HTTP proxy and HTTPS `CONNECT` behavior.
- `src/destination-policy.ts`: domain policy and IP range blocking.
- `src/logging.ts`: header redaction and JSONL audit sink.
- `config/strict.example.json`: reviewable strict policy profile.
- `config/smoke.example.json`: local smoke-test policy profile.
- `scripts/smoke-forward-proxy.sh`: local forward proxy smoke test.

## Useful Commands

```bash
npm install
npm run typecheck
npm test
npm run smoke:forward
npm run dev
```

Run with the strict example policy:

```bash
AI_EGRESS_PROXY_CONFIG=./config/strict.example.json npm run dev
```

Run with explicit audit file output:

```bash
AUDIT_LOG_PATH=./egress-audit.jsonl npm run dev
```

Inspect the runtime policy:

```bash
curl http://127.0.0.1:8787/policy
```

## Verification State

Latest known verification before this status snapshot:

- `npm run typecheck` passed
- `npm test` passed
- `npm run smoke:forward` passed outside the sandbox and verified:
  - `GET /policy`
  - allowed HTTP `GET`
  - allowed HTTPS `CONNECT` to port `443`
  - denied write-like HTTP method
  - denied non-443 `CONNECT`
  - denied metadata/private IP egress
  - JSONL audit file output

## Current Limits

- No TLS interception or HTTPS MITM.
- No persistent audit database.
- No admin UI.
- No multi-tenant policy engine.
- No rate limiting or quotas yet.
- Forward proxy streaming and full proxy/cache feature parity are intentionally out of v0 scope.

## Notes for Future Work

- Keep both broker mode and forward proxy mode.
- Keep unsafe egress unavailable by construction.
- Keep policy reviewable in config files where possible.
- Do not log secrets, request bodies, provider tokens, cookies, or API keys.
- When adding policy features, update `GET /policy`, docs, unit tests, and the smoke workflow together.
