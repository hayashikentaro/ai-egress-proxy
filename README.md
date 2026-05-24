# AI Egress Proxy

AI Egress Proxy is a minimal TypeScript service that brokers outbound AI-provider HTTP calls through one auditable control point.

The core philosophy is: prefer structural enforcement over behavioral restriction. Instead of asking AI agents or client applications to remember where they may send traffic, put allowed egress behind explicit code, configuration, and network paths.

The v0 implementation focuses on a small foundation:

- HTTP proxy endpoint for outbound AI requests.
- Upstream host allowlist enforcement.
- Optional bearer-token protection for callers.
- Request size and upstream timeout limits.
- Basic audit logging with sensitive header redaction.
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

## Proxy Requests

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

## Configuration

| Name | Default | Description |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port. |
| `HOST` | `127.0.0.1` | Bind host. |
| `ALLOWED_HOSTS` | `api.openai.com,api.anthropic.com,generativelanguage.googleapis.com` | Comma-separated upstream host allowlist. |
| `PROXY_BEARER_TOKEN` | empty | Optional token required from callers as `Authorization: Bearer ...`. |
| `MAX_REQUEST_BYTES` | `1048576` | Maximum JSON request payload size. |
| `UPSTREAM_TIMEOUT_MS` | `60000` | Upstream fetch timeout. |

## Design Philosophy

AI Egress Proxy is meant to be a structural control, not a prompt-layer request for good behavior.

Good deployments should make direct provider egress unnecessary or unavailable, then route AI-provider calls through this service. The proxy can then enforce allowlists, request shape, authentication, limits, and logging in one place. Behavioral guidance can still exist, but it should sit on top of enforced boundaries rather than replace them.

## Documentation

- [Scope](docs/SCOPE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Codex instructions](AGENTS.md)
