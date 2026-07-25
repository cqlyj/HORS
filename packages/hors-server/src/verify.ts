import {
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
  type AgentkitPayload,
} from "@worldcoin/agentkit-core";
import type { Hex, Address } from "viem";
import type { HORSAuth, HORSPayload, ReplayStore } from "hors-core";
import { HORSError } from "hors-core";
import { parseHorsResources } from "./parse-resources.js";

export interface VerifyOptions {
  domain: string;
  nonceStore: ReplayStore;
  callIdStore: ReplayStore;
  agentBookVerifier: {
    lookupHuman(address: string): Promise<string | null>;
  };
  policyContentHash?: Hex;
  maxAge?: number;
}

const HORS_URI_PREFIX = "hors://";

export function extractFunctionName(uri: string): string {
  if (!uri.startsWith(HORS_URI_PREFIX)) {
    throw new HORSError(
      "HORS_FUNCTION_FORBIDDEN",
      `URI must use ${HORS_URI_PREFIX} scheme`,
    );
  }

  const path = uri.slice(HORS_URI_PREFIX.length);
  const slashIndex = path.indexOf("/");
  if (slashIndex === -1 || slashIndex === path.length - 1) {
    throw new HORSError(
      "HORS_FUNCTION_FORBIDDEN",
      "URI must be hors://<domain>/<functionName>",
    );
  }

  return path.slice(slashIndex + 1);
}

function toHorsPayload(payload: AgentkitPayload): HORSPayload {
  return payload as unknown as HORSPayload;
}

function assertPolicyHash(
  signedHash: Hex,
  policyContentHash: Hex | undefined,
): void {
  if (!policyContentHash) return;

  const zeroHash = `0x${"0".repeat(64)}` as Hex;

  if (!signedHash || signedHash === zeroHash) {
    throw new HORSError(
      "HORS_ORIGIN_MISMATCH",
      "Server requires a signed policy hash — client sent zero or omitted hash",
      { expected: policyContentHash },
    );
  }

  if (signedHash.toLowerCase() !== policyContentHash.toLowerCase()) {
    throw new HORSError(
      "HORS_ORIGIN_MISMATCH",
      "Signed policy hash does not match server policy",
      { expected: policyContentHash, received: signedHash },
    );
  }
}

export async function verifyHorsAuthorization(
  headerValue: string,
  options: VerifyOptions,
): Promise<HORSAuth> {
  const {
    domain,
    nonceStore,
    callIdStore,
    agentBookVerifier,
    policyContentHash,
    maxAge = 300_000,
  } = options;

  let payload: AgentkitPayload;
  try {
    payload = parseAgentkitHeader(headerValue);
  } catch (error) {
    throw new HORSError(
      "HORS_FUNCTION_FORBIDDEN",
      error instanceof Error
        ? error.message
        : "Invalid Hors-Authorization header",
    );
  }

  if (!payload.uri.startsWith(HORS_URI_PREFIX)) {
    throw new HORSError(
      "HORS_FUNCTION_FORBIDDEN",
      `URI must use ${HORS_URI_PREFIX} scheme`,
    );
  }

  const expectedUri = `hors://${domain}/${extractFunctionName(payload.uri)}`;
  const validation = await validateAgentkitMessage(payload, expectedUri, {
    maxAge,
    checkNonce: () => true,
  });

  if (!validation.valid) {
    throw new HORSError(
      "HORS_FUNCTION_FORBIDDEN",
      validation.error ?? "AgentKit message validation failed",
    );
  }

  const verification = await verifyAgentkitSignature(payload);
  if (!verification.valid || !verification.address) {
    throw new HORSError(
      "HORS_FUNCTION_FORBIDDEN",
      verification.error ?? "Signature verification failed",
    );
  }

  const resources = parseHorsResources(payload.resources);

  if (!(await Promise.resolve(nonceStore.consume(`nonce:${payload.nonce}`)))) {
    throw new HORSError("HORS_FUNCTION_FORBIDDEN", "Nonce already consumed");
  }

  if (
    !(await Promise.resolve(callIdStore.consume(`callid:${resources.callId}`)))
  ) {
    throw new HORSError(
      "HORS_FUNCTION_FORBIDDEN",
      "Duplicate callId — request already consumed",
    );
  }

  assertPolicyHash(resources.policyHash, policyContentHash);

  const callerHumanId = await agentBookVerifier.lookupHuman(
    verification.address,
  );

  if (!callerHumanId) {
    throw new HORSError(
      "HORS_ORIGIN_MISMATCH",
      "Agent not registered in AgentBook — cannot determine human origin",
      { address: verification.address },
    );
  }

  return {
    callerHumanId: callerHumanId as Hex,
    callerAddress: verification.address as Address,
    callId: resources.callId,
    payload: toHorsPayload(payload),
  };
}
