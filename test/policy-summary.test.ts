import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppConfig } from "../src/config.js";
import { buildPolicySummary } from "../src/server.js";

const config: AppConfig = {
  port: 8787,
  host: "127.0.0.1",
  allowedHosts: new Set(["api.openai.com"]),
  forwardProxyEnabled: true,
  forwardAllowedDomains: ["api.openai.com", "example.com"],
  forwardDeniedDomains: ["blocked.example.com"],
  proxyBearerToken: "secret-token",
  auditLogPath: "./egress-audit.jsonl",
  maxRequestBytes: 1024,
  upstreamTimeoutMs: 5000
};

describe("buildPolicySummary", () => {
  it("returns effective non-secret broker and forward proxy policy", () => {
    const summary = buildPolicySummary(config);

    assert.equal(summary.mode.broker.enabled, true);
    assert.equal(summary.mode.broker.authRequired, true);
    assert.deepEqual(summary.mode.broker.allowedHosts, ["api.openai.com"]);
    assert.deepEqual(summary.mode.forwardProxy.httpMethods.allowed, ["GET", "HEAD"]);
    assert.deepEqual(summary.mode.forwardProxy.connect.allowedPorts, [443]);
    assert.deepEqual(summary.mode.forwardProxy.destinationPolicy.allowedDomains, [
      "api.openai.com",
      "example.com"
    ]);
    assert.deepEqual(summary.mode.forwardProxy.destinationPolicy.deniedDomains, ["blocked.example.com"]);
    assert.equal(summary.mode.forwardProxy.destinationPolicy.blocksPrivateInternalMetadataIps, true);
    assert.equal(summary.audit.sink, "file");
    assert.equal(summary.audit.logPathConfigured, true);
    assert.equal(JSON.stringify(summary).includes("secret-token"), false);
  });
});
