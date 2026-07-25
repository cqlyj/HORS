import { keccak256, toHex } from "viem";
import type { Hex } from "viem";

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Deterministic argument hashing via recursive sorted-key JSON serialization.
 * Known simplification: RFC 8785 (JSON Canonicalization Scheme) is the
 * long-term target; sorted keys are sufficient for the hackathon.
 */
export function hashArguments(args: Record<string, unknown>): Hex {
  return keccak256(toHex(JSON.stringify(canonicalize(args))));
}
