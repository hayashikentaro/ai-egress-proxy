# Scope

AI Egress Proxy v0 is a small HTTP proxy for controlled outbound AI-provider traffic.

The project prefers structural enforcement over behavioral restriction. v0 should prove the basic shape of an enforced egress path: requests go through a service that can allow, deny, log, and normalize them without depending on voluntary client behavior.

## In Scope

- Accept proxy requests from trusted internal clients.
- Enforce an upstream host allowlist.
- Require HTTPS upstream URLs.
- Optionally authenticate callers with a shared bearer token.
- Forward JSON, text, and binary-like request bodies supported by `fetch`.
- Return upstream status, selected response headers, and parsed response body.
- Emit redacted audit logs for request attempts and outcomes.
- Provide a health endpoint.
- Document deployment expectations that make the proxy the intended egress path.

## Out of Scope for v0

- Multi-tenant policy engines.
- Per-user budgets, rate limits, or quota enforcement.
- Persistent audit storage.
- Admin UI.
- Provider-specific SDK abstractions.
- Streaming response passthrough.
- mTLS, OAuth, JWT verification, or external identity provider integration.
- Request body inspection for prompt safety or data loss prevention.
- Prompt-only, policy-by-convention, or client-only enforcement models.

## Security Posture

v0 is a control point, not a complete data-governance platform. It should be deployed behind trusted infrastructure, with `PROXY_BEARER_TOKEN` set outside local development.

For meaningful enforcement, surrounding infrastructure should make direct AI-provider egress unnecessary or unavailable for clients that are expected to use the proxy. The proxy is strongest when it is part of the route, not merely an optional helper library.
