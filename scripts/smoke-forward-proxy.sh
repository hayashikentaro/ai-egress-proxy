#!/usr/bin/env bash
set -euo pipefail

PROXY_HOST="${PROXY_HOST:-127.0.0.1}"
PROXY_PORT="${PROXY_PORT:-18787}"
PROXY_URL="http://${PROXY_HOST}:${PROXY_PORT}"
SMOKE_ALLOWED_HTTP_URL="${SMOKE_ALLOWED_HTTP_URL:-http://example.com/}"
SMOKE_ALLOWED_HTTPS_URL="${SMOKE_ALLOWED_HTTPS_URL:-https://example.com/}"
SMOKE_PRIVATE_IP_URL="${SMOKE_PRIVATE_IP_URL:-http://169.254.169.254/latest/meta-data/}"
SMOKE_CONNECT_DENIED_TARGET="${SMOKE_CONNECT_DENIED_TARGET:-example.com:80}"
SERVER_LOG_FILE="${TMPDIR:-/tmp}/ai-egress-proxy-smoke-forward-${PROXY_PORT}.log"
AUDIT_LOG_FILE="${AUDIT_LOG_PATH:-${TMPDIR:-/tmp}/ai-egress-proxy-smoke-forward-${PROXY_PORT}.jsonl}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for the forward proxy smoke test" >&2
  exit 1
fi

echo "Building project..."
npm run build >/dev/null

rm -f "$SERVER_LOG_FILE" "$AUDIT_LOG_FILE"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Starting AI Egress Proxy on ${PROXY_URL}..."
PORT="$PROXY_PORT" \
HOST="$PROXY_HOST" \
AI_EGRESS_PROXY_CONFIG="${AI_EGRESS_PROXY_CONFIG:-config/smoke.example.json}" \
AUDIT_LOG_PATH="$AUDIT_LOG_FILE" \
node dist/src/index.js >"$SERVER_LOG_FILE" 2>&1 &
SERVER_PID=$!

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 1 "${PROXY_URL}/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "Proxy server exited early. Log output:" >&2
    cat "$SERVER_LOG_FILE" >&2 || true
    exit 1
  fi
  sleep 0.5
done

curl -fsS --max-time 2 "${PROXY_URL}/health" >/dev/null

expect_contains() {
  local name="$1"
  local haystack="$2"
  local needle="$3"

  if [[ "$haystack" != *"$needle"* ]]; then
    echo "FAIL: ${name}" >&2
    echo "Expected output to contain: ${needle}" >&2
    echo "Actual output:" >&2
    echo "$haystack" >&2
    echo "Proxy log:" >&2
    cat "$SERVER_LOG_FILE" >&2 || true
    exit 1
  fi

  echo "PASS: ${name}"
}

echo "Checking runtime policy summary..."
policy_output="$(curl -fsS --max-time 2 "${PROXY_URL}/policy")"
expect_contains "policy summary includes broker mode" "$policy_output" '"broker"'
expect_contains "policy summary includes forward proxy mode" "$policy_output" '"forwardProxy"'
expect_contains "policy summary exposes allowed HTTP methods" "$policy_output" '"allowed":["GET","HEAD"]'
expect_contains "policy summary exposes CONNECT 443 policy" "$policy_output" '"allowedPorts":[443]'
expect_contains "policy summary exposes audit sink" "$policy_output" '"logPathConfigured":true'

echo "Checking allowed HTTP GET through forward proxy..."
curl -sS --max-time 10 --proxy "$PROXY_URL" "$SMOKE_ALLOWED_HTTP_URL" >/dev/null
echo "PASS: allowed HTTP GET"

echo "Checking allowed HTTPS CONNECT through forward proxy..."
curl -sS --max-time 10 --proxy "$PROXY_URL" --head "$SMOKE_ALLOWED_HTTPS_URL" >/dev/null
echo "PASS: allowed HTTPS CONNECT to port 443"

echo "Checking denied write-like HTTP method..."
post_output="$(curl -sS --max-time 10 --proxy "$PROXY_URL" -X POST -d smoke "$SMOKE_ALLOWED_HTTP_URL" || true)"
expect_contains "denied HTTP POST" "$post_output" "forward_http_method_denied"

echo "Checking denied CONNECT to non-443 port..."
connect_output="$(
  node - "$PROXY_HOST" "$PROXY_PORT" "$SMOKE_CONNECT_DENIED_TARGET" <<'NODE'
const net = require("node:net");

const proxyHost = process.argv[2];
const proxyPort = Number(process.argv[3]);
const target = process.argv[4];
const socket = net.connect(proxyPort, proxyHost);
let output = "";

function finish(code) {
  socket.destroy();
  process.stdout.write(output);
  process.exit(code);
}

socket.setTimeout(5000, () => finish(2));
socket.on("connect", () => {
  socket.write(`CONNECT ${target} HTTP/1.1\r\nhost: ${target}\r\n\r\n`);
});
socket.on("data", (chunk) => {
  output += chunk.toString("utf8");
  if (output.includes("\r\n\r\n")) {
    finish(0);
  }
});
socket.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
NODE
)"
expect_contains "denied CONNECT non-443" "$connect_output" "connect_port_denied"

echo "Checking denied metadata/private IP egress..."
private_output="$(curl -sS --max-time 10 --proxy "$PROXY_URL" "$SMOKE_PRIVATE_IP_URL" || true)"
expect_contains "denied private metadata IP" "$private_output" "destination_ip_blocked"

if [[ ! -s "$AUDIT_LOG_FILE" ]]; then
  echo "FAIL: audit log file was not written: ${AUDIT_LOG_FILE}" >&2
  cat "$SERVER_LOG_FILE" >&2 || true
  exit 1
fi

expect_contains "audit log records forward events" "$(cat "$AUDIT_LOG_FILE")" "forward."

echo "Forward proxy smoke test passed."
echo "Proxy JSONL audit log: ${AUDIT_LOG_FILE}"
