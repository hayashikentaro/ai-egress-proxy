# AI Egress Proxy

AI Egress Proxy is a minimal TypeScript service that routes outbound AI traffic through one auditable control point.

The core philosophy is: prefer structural enforcement over behavioral restriction. Instead of asking AI agents or client applications to remember where they may send traffic, put allowed egress behind explicit code, configuration, and network paths.

The v0 implementation has two related modes:

- Broker mode: `POST /v1/proxy` for explicit JSON-based AI provider calls.
- Forward proxy mode: HTTP forward proxy and HTTPS `CONNECT` support for tools that use `HTTP_PROXY` / `HTTPS_PROXY`.

The foundation includes:

- Upstream and forward destination allowlist enforcement.
- Private, internal, loopback, multicast, and metadata IP blocking for forward proxy destinations.
- Optional bearer-token protection for callers.
- Request size and upstream timeout limits.
- JSONL audit logging with sensitive header redaction.
- AI-readable deny guidance.
- Health endpoint for deployment checks.

## Quick Start

```bash
npm install
npm run typecheck
npm run build
npm test
npm run dev
```

The development server listens on `127.0.0.1:8787` by default.

```bash
curl http://127.0.0.1:8787/health
```

## Broker Mode

Send requests to `POST /v1/proxy` with a JSON body:

```json
{
  "url": "https://api.openai.com/v1/responses",
  "method": "POST",
  "headers": {
    "authorization": "Bearer provider-token",
    "content-type": "application/json"
  },
  "body": {
    "model": "gpt-4.1-mini",
    "input": "hello"
  }
}
```

The proxy returns:

```json
{
  "status": 200,
  "headers": {
    "content-type": "application/json"
  },
  "body": {}
}
```

If the upstream returns non-JSON content, `body` is returned as text.

## Forward Proxy Mode

Forward proxy mode lets existing tools route traffic through the proxy without changing application code:

```bash
export HTTP_PROXY=http://127.0.0.1:8787
export HTTPS_PROXY=http://127.0.0.1:8787
curl https://api.openai.com/v1/models
```

The proxy accepts:

- HTTP absolute-form proxy requests such as `GET http://example.com/path`.
- HTTPS `CONNECT` tunnels such as `CONNECT api.openai.com:443`.

Before connecting, the proxy validates the destination domain and resolved IP addresses. Denied requests return a structured error with a `guidance` field intended to be readable by AI agents and tool callers.

## Configuration

| Name | Default | Description |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port. |
| `HOST` | `127.0.0.1` | Bind host. |
| `ALLOWED_HOSTS` | `api.openai.com,api.anthropic.com,generativelanguage.googleapis.com` | Comma-separated broker-mode upstream host allowlist. |
| `FORWARD_PROXY_ENABLED` | `true` | Enables HTTP forward proxy and HTTPS `CONNECT` handling. |
| `FORWARD_ALLOWED_DOMAINS` | `api.openai.com,api.anthropic.com,generativelanguage.googleapis.com` | Comma-separated forward proxy domain allowlist. Use `*` only in tightly controlled test environments. |
| `FORWARD_DENIED_DOMAINS` | empty | Comma-separated forward proxy domain denylist. Deny rules override allow rules. |
| `PROXY_BEARER_TOKEN` | empty | Optional token required from callers as `Authorization: Bearer ...`. |
| `MAX_REQUEST_BYTES` | `1048576` | Maximum JSON request payload size. |
| `UPSTREAM_TIMEOUT_MS` | `60000` | Upstream fetch timeout. |

## Design Philosophy

AI Egress Proxy is meant to be a structural control, not a prompt-layer request for good behavior.

Good deployments should make direct provider egress unnecessary or unavailable, then route AI-provider calls through this service. Broker mode controls explicit API calls; forward proxy mode gives existing SDKs and package tools a standard egress path. Behavioral guidance can still exist, but it should sit on top of enforced boundaries rather than replace them.

## Documentation

- [Scope](docs/SCOPE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Codex instructions](AGENTS.md)
