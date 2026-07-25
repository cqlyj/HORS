import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { keccak256, toHex } from "viem";
import type { IdentityAttribute } from "hors-core";

export { hashSignal };

function hashAttributes(attributes?: IdentityAttribute[]): string {
  if (!attributes?.length) return "none";
  const sorted = [...attributes].sort((a, b) => a.type.localeCompare(b.type));
  return keccak256(toHex(JSON.stringify(sorted)));
}

export function buildAssuranceSignal(
  agentAddress: string,
  functionName: string,
  argsDigest: string,
  nonce: string,
  attributes?: IdentityAttribute[],
): string {
  return `${agentAddress}:${functionName}:${argsDigest}:${nonce}:${hashAttributes(attributes)}`;
}
