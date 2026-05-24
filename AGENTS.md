# Repository Instructions

This repository contains AI Egress Proxy, a TypeScript HTTP service that centralizes outbound calls from AI systems to external model/provider APIs.

## Boundary Rules

- Work only inside this repository.
- Do not modify parent directories, sibling repositories, home directory files, global config, or unrelated projects.
- Prefer small, reviewable changes that preserve the v0 scope.
- Do not add external services, databases, queues, or deployment-specific assumptions unless the task explicitly asks for them.

## Project Shape

- Runtime: Node.js 20+.
- Language: TypeScript.
- Entry point: `src/index.ts`.
- Main HTTP server: `src/server.ts`.
- Broker proxy logic: `src/proxy.ts`.
- Forward proxy logic: `src/forward-proxy.ts`.
- Destination policy logic: `src/destination-policy.ts`.
- Configuration: environment variables parsed in `src/config.ts`.
- Example policy profiles: `config/*.example.json`.
- Audit logging: `src/logging.ts`, with optional JSONL file output via `AUDIT_LOG_PATH`.
- Documentation: `docs/`.

## Development Commands

```bash
npm install
npm run typecheck
npm run build
npm test
npm run smoke:forward
npm run dev
```

## Implementation Guidelines

- Preserve both proxy modes: broker mode (`POST /v1/proxy`) and forward proxy mode (HTTP absolute-form requests plus HTTPS `CONNECT`).
- Prefer structural enforcement over behavioral restriction. Build constraints into routing, configuration, schemas, network boundaries, and defaults instead of relying on prompts, conventions, or callers choosing to behave correctly.
- Prefer versioned JSON policy profiles via `AI_EGRESS_PROXY_CONFIG` for reviewed network-boundary policy; keep environment variables for deployment overrides and secrets.
- Treat outbound request details as sensitive. Never log authorization tokens, cookies, API keys, or full request bodies.
- Audit events must be emitted by proxy chokepoints. Use `AUDIT_LOG_PATH` or config-file `audit.logPath` when an operator needs an explicit JSONL file.
- Prefer standard Node APIs where practical.
- Keep provider-specific behavior out of the core proxy unless it is needed for security or interoperability.
- Add tests for request validation and security boundaries before broadening features.
- Deny decisions should include AI-readable guidance so agent/tool callers can understand the blocked path and the approved alternative.

## Design Philosophy

AI Egress Proxy should make safe egress the path of least resistance and unsafe egress unavailable by construction.

For future changes, prefer mechanisms such as:

- Explicit allowlists and deny-by-default behavior.
- Typed request contracts and strict validation.
- Centralized secret handling instead of direct credential spread.
- Network-level and deployment-level routing controls.
- Auditable chokepoints for outbound AI traffic.

Avoid treating prompts, documentation, client-side conventions, or model instructions as primary security controls. They can explain intent, but they should not be the thing that enforces it.

## Security Defaults

- Only HTTPS upstream URLs are allowed.
- Upstream hosts must match `ALLOWED_HOSTS`.
- Forward proxy destinations must match `FORWARD_ALLOWED_DOMAINS` and must not match `FORWARD_DENIED_DOMAINS`.
- Forward proxy destinations resolving to private, internal, loopback, multicast, or metadata IP ranges are blocked.
- Forward proxy absolute-form HTTP requests allow `GET` and `HEAD` by default; write-like methods must be denied unless a future explicit policy adds them.
- Forward proxy HTTPS `CONNECT` allows only port `443` by default; other ports are denied because CONNECT creates an opaque TCP tunnel.
- Hop-by-hop headers are stripped.
- Sensitive request and response headers are redacted in logs.
- Audit events are JSONL and may be written to an operator-configured file path.
- `PROXY_BEARER_TOKEN` is optional for local development but should be set in any shared environment.
