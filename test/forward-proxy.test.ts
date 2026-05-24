import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isForwardProxyHttpRequest, validateForwardHttpMethod } from "../src/forward-proxy.js";

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

describe("forward proxy HTTP method policy", () => {
  it("allows safe read-like HTTP methods", () => {
    assert.equal(validateForwardHttpMethod("GET"), undefined);
    assert.equal(validateForwardHttpMethod("HEAD"), undefined);
  });

  it("denies write-like HTTP methods by default", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const decision = validateForwardHttpMethod(method);

      assert.equal(decision?.allowed, false);
      assert.equal(decision?.code, "forward_http_method_denied");
      assert.match(decision?.guidance ?? "", /broker mode/);
    }
  });
});
