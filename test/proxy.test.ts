import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProxyError } from "../src/errors.js";
import { proxyRequest } from "../src/proxy.js";

const config = {
  allowedHosts: new Set(["api.openai.com"]),
  upstreamTimeoutMs: 1_000
};

describe("proxyRequest validation", () => {
  it("rejects non-object payloads", async () => {
    await assert.rejects(() => proxyRequest(null, config), {
      name: "ProxyError",
      code: "invalid_request"
    });
  });

  it("requires HTTPS upstream URLs", async () => {
    await assert.rejects(
      () =>
        proxyRequest(
          {
            url: "http://api.openai.com/v1/responses"
          },
          config
        ),
      (error) => error instanceof ProxyError && error.code === "https_required"
    );
  });

  it("enforces the upstream host allowlist", async () => {
    await assert.rejects(
      () =>
        proxyRequest(
          {
            url: "https://example.com/v1/responses"
          },
          config
        ),
      (error) => error instanceof ProxyError && error.code === "upstream_host_not_allowed"
    );
  });

  it("rejects unsafe HTTP methods", async () => {
    await assert.rejects(
      () =>
        proxyRequest(
          {
            url: "https://api.openai.com/v1/responses",
            method: "TRACE"
          },
          config
        ),
      (error) => error instanceof ProxyError && error.code === "method_not_allowed"
    );
  });
});

