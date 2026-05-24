import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isForwardProxyHttpRequest } from "../src/forward-proxy.js";

describe("forward proxy request detection", () => {
  it("detects HTTP absolute-form requests", () => {
    assert.equal(isForwardProxyHttpRequest({ url: "http://example.com/path" } as never), true);
  });

  it("detects HTTPS absolute-form requests", () => {
    assert.equal(isForwardProxyHttpRequest({ url: "https://api.openai.com/v1/models" } as never), true);
  });

  it("does not treat origin-form app routes as forward proxy requests", () => {
    assert.equal(isForwardProxyHttpRequest({ url: "/v1/proxy" } as never), false);
  });
});

