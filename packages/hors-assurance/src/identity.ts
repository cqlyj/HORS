import type {
  IdentityAttribute,
  ReplayStore,
  AssuranceServerConfig,
} from "hors-core";
import type {
  AssuranceAdapter,
  AssuranceChallenge,
  AssuranceResult,
} from "./types.js";
import { hashSignal } from "./signal.js";
import { createRpContext } from "./rp-context.js";
import { NullifierStore } from "./nullifier-store.js";
import { verifyAssuranceProof } from "./verify-common.js";

export function createIdentityAdapter(
  config: AssuranceServerConfig,
  nullifierReplayStore?: ReplayStore,
): AssuranceAdapter {
  const nullifierStore = new NullifierStore(nullifierReplayStore);

  return {
    type: "identity",

    initiate(
      action: string,
      signal?: string,
      attributes?: IdentityAttribute[],
    ): AssuranceChallenge {
      const rpContext = createRpContext(config, action);
      return {
        type: "identity",
        action,
        signal,
        signalHash: signal ? hashSignal(signal).toString() : undefined,
        rpContext,
        attributes,
        signalParamName: "legacy_signal",
      };
    },

    async verify(
      proofPayload: string,
      expectedSignalHash?: string,
      expectedAction?: string,
    ): Promise<AssuranceResult> {
      let idkitResult: Record<string, unknown>;
      try {
        idkitResult = JSON.parse(proofPayload);
      } catch {
        return { verified: false, type: "identity", error: "Invalid JSON" };
      }

      if (idkitResult.identity_attested !== true) {
        return {
          verified: false,
          type: "identity",
          identityAttested: false,
          error: "Identity attributes not attested",
        };
      }

      if (!expectedAction) {
        return {
          verified: false,
          type: "identity",
          error: "Expected action missing — required for verification",
        };
      }

      const result = await verifyAssuranceProof({
        type: "identity",
        rpId: config.rpId,
        verifyUrl: config.verifyUrl,
        proofPayload,
        expectedIdentifiers: ["passport", "mnc"],
        expectedSignalHash,
        expectedAction,
        nullifierStore,
      });

      if (result.verified) {
        return { ...result, identityAttested: true };
      }
      return result;
    },
  };
}
