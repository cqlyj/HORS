import type { Assurance } from "hors-core";
import type { AssuranceResult } from "./types.js";
import { extractSignalHash } from "./extract-signal-hash.js";
import { extractStrictResult, verifyWithWorldApi } from "./verify-api.js";
import type { NullifierStore } from "./nullifier-store.js";

export async function verifyAssuranceProof(opts: {
  type: Assurance;
  rpId: string;
  verifyUrl?: string;
  proofPayload: string;
  expectedIdentifiers: string[];
  expectedSignalHash?: string;
  expectedAction: string;
  nullifierStore: NullifierStore;
}): Promise<AssuranceResult> {
  let apiResult;
  try {
    apiResult = await verifyWithWorldApi(
      opts.rpId,
      opts.proofPayload,
      opts.verifyUrl,
    );
  } catch (error) {
    return {
      verified: false,
      type: opts.type,
      error:
        error instanceof Error
          ? error.message
          : "World API verification failed",
    };
  }

  let strict;
  try {
    strict = extractStrictResult(
      apiResult,
      opts.expectedIdentifiers,
      opts.expectedAction,
    );
  } catch (error) {
    return {
      verified: false,
      type: opts.type,
      error:
        error instanceof Error
          ? error.message
          : "Credential verification failed",
    };
  }

  if (!opts.expectedSignalHash) {
    return {
      verified: false,
      type: opts.type,
      error: "Signal hash missing — required",
    };
  }
  const actualSignalHash = extractSignalHash(opts.proofPayload);
  if (!actualSignalHash || actualSignalHash === "0x0") {
    return {
      verified: false,
      type: opts.type,
      error: "Signal hash missing — required",
    };
  }
  if (opts.expectedSignalHash !== actualSignalHash) {
    return {
      verified: false,
      type: opts.type,
      error: "Signal mismatch",
    };
  }

  if (
    !(await Promise.resolve(
      opts.nullifierStore.consume(strict.action, strict.nullifier),
    ))
  ) {
    return {
      verified: false,
      type: opts.type,
      error: "Nullifier already consumed (replay)",
    };
  }

  return {
    verified: true,
    nullifier: strict.nullifier,
    type: opts.type,
    action: strict.action,
  };
}
