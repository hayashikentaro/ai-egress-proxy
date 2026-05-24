# Roadmap

The roadmap prioritizes structural enforcement over behavioral restriction. Features should make policy enforceable through service boundaries, configuration, network paths, typed contracts, and auditable chokepoints before adding convenience layers.

## v0

- Broker endpoint for explicit JSON proxy calls.
- HTTP forward proxy handling.
- HTTPS `CONNECT` handling.
- HTTPS-only broker upstream enforcement.
- Broker host allowlist.
- Forward proxy domain allow/deny policy.
- Private, internal, loopback, multicast, and metadata IP blocking.
- Optional caller bearer token.
- Upstream timeout.
- Redacted JSONL audit logging.
- AI-readable deny guidance.
- Basic unit tests.

## v0.1

- Streaming response support.
- More explicit request and response size limits.
- Structured audit event sink interface.
- Per-route policy configuration.
- Better examples for OpenAI, Anthropic, and Gemini.
- Deployment notes for making the proxy the default outbound AI-provider path.
- Forward proxy integration tests with local upstream fixtures.

## v0.2

- Rate limiting.
- Request metadata fields for app, user, workspace, and trace IDs.
- Policy decision hooks.
- Deployment examples for common hosting targets.
- Policy tests that verify deny-by-default behavior.

## Later

- Persistent audit storage.
- Admin/configuration API.
- OpenTelemetry integration.
- Provider-aware convenience routes.
- Secret reference resolution rather than direct provider-token forwarding.
- Network and identity integrations that reduce reliance on client-side compliance.
