import type { Assurance, IdentityAttribute } from "hors-core";

export interface RpContext {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
}

export interface AssuranceChallenge {
  type: Assurance;
  action: string;
  signal?: string;
  signalHash?: string;
  rpContext: RpContext;
  attributes?: IdentityAttribute[];
  /** IDKit preset param name: "signal" for selfie, "legacy_signal" for identity. */
  signalParamName?: string;
}

export interface AssuranceResult {
  verified: boolean;
  nullifier?: string;
  action?: string;
  type: Assurance;
  identityAttested?: boolean;
  error?: string;
}

export interface AssuranceAdapter {
  readonly type: Assurance;
  initiate(
    action: string,
    signal?: string,
    attributes?: IdentityAttribute[],
  ): AssuranceChallenge;
  verify(
    proofPayload: string,
    expectedSignalHash?: string,
    expectedAction?: string,
  ): Promise<AssuranceResult>;
}
