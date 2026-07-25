import { HORSError } from "hors-core";
import type { Hex } from "viem";

export interface HORSResources {
  argsHash: Hex;
  policyHash: Hex;
  callId: string;
}

const ARGS_PREFIX = "hors://args/";
const POLICY_PREFIX = "hors://policy/";
const CALL_ID_PREFIX = "hors://callId/";

export function parseHorsResources(resources?: string[]): HORSResources {
  if (!resources || resources.length < 3) {
    throw new HORSError(
      "HORS_FUNCTION_FORBIDDEN",
      "Missing required HORS resources array entries",
    );
  }

  const [argsResource, policyResource, callIdResource] = resources;

  if (!argsResource?.startsWith(ARGS_PREFIX)) {
    throw new HORSError(
      "HORS_FUNCTION_FORBIDDEN",
      `Invalid args resource: expected prefix ${ARGS_PREFIX}`,
    );
  }

  if (!policyResource?.startsWith(POLICY_PREFIX)) {
    throw new HORSError(
      "HORS_FUNCTION_FORBIDDEN",
      `Invalid policy resource: expected prefix ${POLICY_PREFIX}`,
    );
  }

  if (!callIdResource?.startsWith(CALL_ID_PREFIX)) {
    throw new HORSError(
      "HORS_FUNCTION_FORBIDDEN",
      `Invalid callId resource: expected prefix ${CALL_ID_PREFIX}`,
    );
  }

  const argsHash = argsResource.slice(ARGS_PREFIX.length) as Hex;
  const policyHash = policyResource.slice(POLICY_PREFIX.length) as Hex;
  const callId = callIdResource.slice(CALL_ID_PREFIX.length);

  if (!argsHash || !policyHash || !callId) {
    throw new HORSError(
      "HORS_FUNCTION_FORBIDDEN",
      "Empty value in HORS resources array",
    );
  }

  return { argsHash, policyHash, callId };
}
