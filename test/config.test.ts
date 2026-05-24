import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("loads policy from a JSON config file", () => {
    const config = loadConfig({
      AI_EGRESS_PROXY_CONFIG: "config/strict.example.json"
    });

    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.port, 8787);
    assert.deepEqual([...config.allowedHosts], [
      "api.openai.com",
      "api.anthropic.com",
      "generativelanguage.googleapis.com"
    ]);
    assert.equal(config.forwardProxyEnabled, true);
    assert.deepEqual(config.forwardAllowedDomains, [
      "api.openai.com",
      "api.anthropic.com",
      "generativelanguage.googleapis.com"
    ]);
    assert.deepEqual(config.forwardDeniedDomains, []);
  });

  it("lets environment variables override config file policy", () => {
    const config = loadConfig({
      AI_EGRESS_PROXY_CONFIG: "config/strict.example.json",
      PORT: "9999",
      ALLOWED_HOSTS: "example.com",
      FORWARD_ALLOWED_DOMAINS: "docs.example.com",
      FORWARD_DENIED_DOMAINS: "blocked.example.com",
      FORWARD_PROXY_ENABLED: "false"
    });

    assert.equal(config.port, 9999);
    assert.deepEqual([...config.allowedHosts], ["example.com"]);
    assert.equal(config.forwardProxyEnabled, false);
    assert.deepEqual(config.forwardAllowedDomains, ["docs.example.com"]);
    assert.deepEqual(config.forwardDeniedDomains, ["blocked.example.com"]);
  });

  it("rejects malformed config file policy", () => {
    assert.throws(
      () =>
        loadConfig({
          AI_EGRESS_PROXY_CONFIG: "test/fixtures/bad-config.json"
        }),
      /broker\.allowedHosts/
    );
  });
});
