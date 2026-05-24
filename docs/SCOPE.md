# Scope

AI Egress Proxy v0 is a small HTTP proxy for controlled outbound AI-provider traffic.

The project prefers structural enforcement over behavioral restriction. v0 should prove the basic shape of enforced egress paths: broker requests and standard forward proxy traffic go through a service that can allow, deny, log, and normalize them without depending on voluntary client behavior.

## In Scope

- Accept proxy requests from trusted internal clients.
- Keep broker mode with `POST /v1/proxy`.
- Add forward proxy mode for HTTP absolute-form requests and HTTPS `CONNECT`.
- Enforce broker upstream host allowlists.
- Enforce forward proxy domain allow/deny policy.
- Support optional JSON config files for versioned broker and forward proxy policy.
- Block forward proxy destinations that resolve to private, internal, loopback, multicast, or metadata IP ranges.
- Deny write-like HTTP absolute-form forward proxy methods by default.
- Deny HTTPS `CONNECT` to non-443 ports by default.
- Require HTTPS upstream URLs for broker mode.
- Optionally authenticate callers with a shared bearer token.
- Forward JSON, text, and binary-like request bodies supported by `fetch`.
- Return upstream status, selected response headers, and parsed response body.
- Emit redacted JSONL audit logs for request attempts, outcomes, and denials.
- Support explicit JSONL audit log file output with `AUDIT_LOG_PATH`.
- Return AI-readable deny guidance for blocked forward proxy destinations.
- Provide a health endpoint.
- Provide a runtime policy summary endpoint for effective non-secret configuration.
- Document deployment expectations that make the proxy the intended egress path.

## Out of Scope for v0

- Multi-tenant policy engines.
- Per-user budgets, rate limits, or quota enforcement.
- Persistent audit storage.
- Admin UI.
- Provider-specific SDK abstractions.
- Full HTTP cache/proxy feature parity.
- TLS interception or certificate generation.
- mTLS, OAuth, JWT verification, or external identity provider integration.
- Request body inspection for prompt safety or data loss prevention.
- Prompt-only, policy-by-convention, or client-only enforcement models.

## Security Posture

v0 is a control point, not a complete data-governance platform. It should be deployed behind trusted infrastructure, with `PROXY_BEARER_TOKEN` set outside local development.

For meaningful enforcement, surrounding infrastructure should make direct AI-provider egress unnecessary or unavailable for clients that are expected to use the proxy. The proxy is strongest when it is part of the route, not merely an optional helper library.
