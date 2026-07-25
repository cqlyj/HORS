import { createAgentBookVerifier } from "@worldcoin/agentkit-core";
import type { Address, Hex } from "viem";
import type {
  AssuranceServerConfig,
  EnrollmentRecord,
  ReplayStore,
} from "hors-core";
import { HORSError } from "hors-core";
import {
  createRpContext,
  extractSignalHash,
  extractStrictResult,
  hashSignal,
  NullifierStore,
  verifyWithWorldApi,
  type RpContext,
} from "hors-assurance";

export interface EnrollmentChallenge {
  action: string;
  signal: string;
  signalHash: string;
  rpContext: RpContext;
}

export async function initiateEnrollment(
  ownerAddress: Address,
  serviceId: Hex,
  assuranceConfig: AssuranceServerConfig,
): Promise<EnrollmentChallenge> {
  const verifier = createAgentBookVerifier();
  const humanId = await verifier.lookupHuman(ownerAddress);
  if (!humanId) {
    throw new HORSError(
      "HORS_ORIGIN_MISMATCH",
      "Owner wallet not registered on AgentBook — run `npx @worldcoin/agentkit-cli register` first",
    );
  }

  const action = `hors:enroll:${serviceId}`;
  const signal = humanId;

  return {
    action,
    signal,
    signalHash: hashSignal(signal).toString(),
    rpContext: createRpContext(assuranceConfig, action),
  };
}

export async function verifyEnrollment(
  ownerAddress: Address,
  serviceId: Hex,
  proofPayload: string,
  assuranceConfig: AssuranceServerConfig,
  nullifierStore?: ReplayStore,
): Promise<EnrollmentRecord> {
  const verifier = createAgentBookVerifier();
  const humanId = await verifier.lookupHuman(ownerAddress);
  if (!humanId) {
    throw new HORSError(
      "HORS_ORIGIN_MISMATCH",
      "Owner not registered on AgentBook",
    );
  }

  const expectedAction = `hors:enroll:${serviceId}`;
  const expectedSignalHash = hashSignal(humanId).toString();

  const apiResult = await verifyWithWorldApi(
    assuranceConfig.rpId,
    proofPayload,
    assuranceConfig.verifyUrl,
  );

  let strict;
  try {
    strict = extractStrictResult(
      apiResult,
      ["orb", "proof_of_human"],
      expectedAction,
    );
  } catch (error) {
    throw new HORSError(
      "HORS_ASSURANCE_REQUIRED",
      error instanceof Error ? error.message : "Enrollment verification failed",
    );
  }

  const actualSignalHash = extractSignalHash(proofPayload);
  if (!actualSignalHash || actualSignalHash !== expectedSignalHash) {
    throw new HORSError(
      "HORS_ASSURANCE_REQUIRED",
      "Enrollment signal not bound to the correct humanId",
    );
  }

  if (nullifierStore) {
    const store = new NullifierStore(nullifierStore);
    if (
      !(await Promise.resolve(store.consume(expectedAction, strict.nullifier)))
    ) {
      throw new HORSError(
        "HORS_ASSURANCE_REQUIRED",
        "Enrollment nullifier already consumed",
      );
    }
  }

  return {
    humanId: humanId as Hex,
    serviceId,
    enrollmentNullifier: strict.nullifier,
    signalHash: actualSignalHash,
    action: expectedAction,
    verifiedAt: new Date().toISOString(),
  };
}
