import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { audit, configureAuditLog } from "../src/logging.js";

let tempDir: string | undefined;

afterEach(() => {
  configureAuditLog(undefined);
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("audit logging", () => {
  it("writes JSONL audit events to the configured file", () => {
    tempDir = mkdtempSync(join(tmpdir(), "ai-egress-proxy-audit-"));
    const logPath = join(tempDir, "audit.jsonl");

    configureAuditLog(logPath);
    audit("test.audit", {
      status: 200
    });

    const lines = readFileSync(logPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), {
      event: "test.audit",
      timestamp: JSON.parse(lines[0]).timestamp,
      status: 200
    });
  });
});
