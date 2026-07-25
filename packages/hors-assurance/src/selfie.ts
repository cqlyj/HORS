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

export function createSelfieAdapter(
  config: AssuranceServerConfig,
  nullifierReplayStore?: ReplayStore,
): AssuranceAdapter {
  const nullifierStore = new NullifierStore(nullifierReplayStore);

  return {
    type: "selfie",

    initiate(
      action: string,
      signal?: string,
      _attributes?: IdentityAttribute[],
    ): AssuranceChallenge {
      const rpContext = createRpContext(config, action);
      return {
        type: "selfie",
        action,
        signal,
        signalHash: signal ? hashSignal(signal).toString() : undefined,
        rpContext,
        signalParamName: "signal",
      };
    },

    async verify(
      proofPayload: string,
      expectedSignalHash?: string,
      expectedAction?: string,
    ): Promise<AssuranceResult> {
      if (!expectedAction) {
        return {
          verified: false,
          type: "selfie",
          error: "Expected action missing — required for verification",
        };
      }

      return verifyAssuranceProof({
        type: "selfie",
        rpId: config.rpId,
        verifyUrl: config.verifyUrl,
        proofPayload,
        expectedIdentifiers: ["face", "selfie"],
        expectedSignalHash,
        expectedAction,
        nullifierStore,
      });
    },
  };
}
