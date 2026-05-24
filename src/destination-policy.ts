import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type LookupRecord = {
  readonly address: string;
  readonly family: number;
};

type LookupResolver = (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<LookupRecord[]>;

export interface DestinationPolicy {
  readonly allowedDomains: readonly string[];
  readonly deniedDomains: readonly string[];
}

export interface Destination {
  readonly hostname: string;
  readonly port: number;
  readonly protocol: "http:" | "https:";
}

export interface DenyDecision {
  readonly allowed: false;
  readonly code: string;
  readonly message: string;
  readonly guidance: string;
}

export interface AllowDecision {
  readonly allowed: true;
  readonly addresses: readonly string[];
}

export type DestinationDecision = AllowDecision | DenyDecision;

export async function validateDestination(
  destination: Destination,
  policy: DestinationPolicy,
  resolver: LookupResolver = defaultResolver
): Promise<DestinationDecision> {
  const hostname = normalizeHostname(destination.hostname);

  if (!hostname) {
    return deny(
      "invalid_destination_host",
      "Destination host is invalid",
      "Use an absolute HTTP URL or CONNECT host:port with a valid destination hostname."
    );
  }

  if (destination.port <= 0 || destination.port > 65535) {
    return deny(
      "invalid_destination_port",
      "Destination port is invalid",
      "Use a destination port from 1 to 65535."
    );
  }

  if (matchesDomainList(hostname, policy.deniedDomains)) {
    return deny(
      "destination_domain_denied",
      "Destination domain is denied by policy",
      "Choose an approved endpoint or ask an operator to update FORWARD_DENIED_DOMAINS."
    );
  }

  if (!matchesDomainList(hostname, policy.allowedDomains)) {
    return deny(
      "destination_domain_not_allowed",
      "Destination domain is not allowed by policy",
      "Route requests only to domains listed in FORWARD_ALLOWED_DOMAINS."
    );
  }

  const addresses = await resolveAddresses(hostname, resolver);
  if (addresses.length === 0) {
    return deny(
      "destination_dns_empty",
      "Destination did not resolve to an IP address",
      "Check the hostname or ask an operator to add a resolvable allowed destination."
    );
  }

  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      return deny(
        "destination_ip_blocked",
        "Destination resolves to a private, internal, loopback, multicast, or metadata IP address",
        "Use a public internet destination. Internal networks and metadata services are blocked by design."
      );
    }
  }

  return {
    allowed: true,
    addresses
  };
}

export function isBlockedAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    return isBlockedIpv4(address);
  }

  if (kind === 6) {
    return isBlockedIpv6(address);
  }

  return true;
}

export function matchesDomainList(hostname: string, rules: readonly string[]): boolean {
  const normalized = normalizeHostname(hostname);

  for (const rule of rules) {
    const normalizedRule = normalizeHostname(rule);
    if (!normalizedRule) {
      continue;
    }

    if (normalizedRule === "*") {
      return true;
    }

    if (normalized === normalizedRule || normalized.endsWith(`.${normalizedRule}`)) {
      return true;
    }
  }

  return false;
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
}

async function resolveAddresses(hostname: string, resolver: LookupResolver): Promise<string[]> {
  if (isIP(hostname)) {
    return [hostname];
  }

  const records = await resolver(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

async function defaultResolver(
  hostname: string,
  options: { all: true; verbatim: true }
): Promise<LookupRecord[]> {
  return lookup(hostname, options);
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff")
  );
}

function deny(code: string, message: string, guidance: string): DenyDecision {
  return {
    allowed: false,
    code,
    message,
    guidance
  };
}
