import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBlockedAddress,
  matchesDomainList,
  validateDestination
} from "../src/destination-policy.js";

const resolver = async () => [{ address: "93.184.216.34", family: 4 as const }];

describe("destination policy", () => {
  it("matches exact domains and subdomains", () => {
    assert.equal(matchesDomainList("api.openai.com", ["api.openai.com"]), true);
    assert.equal(matchesDomainList("v1.api.openai.com", ["api.openai.com"]), true);
    assert.equal(matchesDomainList("example.com", ["api.openai.com"]), false);
  });

  it("blocks private and metadata IPv4 ranges", () => {
    assert.equal(isBlockedAddress("10.0.0.1"), true);
    assert.equal(isBlockedAddress("127.0.0.1"), true);
    assert.equal(isBlockedAddress("169.254.169.254"), true);
    assert.equal(isBlockedAddress("192.168.1.1"), true);
    assert.equal(isBlockedAddress("93.184.216.34"), false);
  });

  it("blocks internal IPv6 ranges", () => {
    assert.equal(isBlockedAddress("::1"), true);
    assert.equal(isBlockedAddress("fc00::1"), true);
    assert.equal(isBlockedAddress("fe80::1"), true);
    assert.equal(isBlockedAddress("2606:4700:4700::1111"), false);
  });

  it("denies domains outside the allowlist", async () => {
    const decision = await validateDestination(
      {
        hostname: "example.com",
        port: 443,
        protocol: "https:"
      },
      {
        allowedDomains: ["api.openai.com"],
        deniedDomains: []
      },
      resolver
    );

    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(decision.code, "destination_domain_not_allowed");
      assert.match(decision.guidance, /FORWARD_ALLOWED_DOMAINS/);
    }
  });

  it("lets deny rules override allow rules", async () => {
    const decision = await validateDestination(
      {
        hostname: "api.openai.com",
        port: 443,
        protocol: "https:"
      },
      {
        allowedDomains: ["api.openai.com"],
        deniedDomains: ["openai.com"]
      },
      resolver
    );

    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(decision.code, "destination_domain_denied");
    }
  });
});

