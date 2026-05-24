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
- Proxy logic: `src/proxy.ts`.
- Configuration: environment variables parsed in `src/config.ts`.
- Documentation: `docs/`.

## Development Commands

```bash
npm install
npm run typecheck
npm run build
npm test
npm run dev
```

## Implementation Guidelines

- Keep v0 intentionally narrow: one proxy endpoint, health endpoint, allowlist enforcement, optional caller auth, timeout handling, and redacted logging.
- Prefer structural enforcement over behavioral restriction. Build constraints into routing, configuration, schemas, network boundaries, and defaults instead of relying on prompts, conventions, or callers choosing to behave correctly.
- Treat outbound request details as sensitive. Never log authorization tokens, cookies, API keys, or full request bodies.
- Prefer standard Node APIs where practical.
- Keep provider-specific behavior out of the core proxy unless it is needed for security or interoperability.
- Add tests for request validation and security boundaries before broadening features.

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
- Hop-by-hop headers are stripped.
- Sensitive request and response headers are redacted in logs.
- `PROXY_BEARER_TOKEN` is optional for local development but should be set in any shared environment.
