import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isForwardProxyHttpRequest,
  validateConnectPort,
  validateForwardHttpMethod
} from "../src/forward-proxy.js";

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

describe("forward proxy CONNECT port policy", () => {
  it("allows CONNECT to port 443", () => {
    assert.equal(validateConnectPort(443), undefined);
  });

  it("denies CONNECT to non-443 ports by default", () => {
    for (const port of [80, 22, 25, 5432, 444]) {
      const decision = validateConnectPort(port);

      assert.equal(decision?.allowed, false);
      assert.equal(decision?.code, "connect_port_denied");
      assert.match(decision?.guidance ?? "", /opaque TCP tunnel/);
    }
  });
});
