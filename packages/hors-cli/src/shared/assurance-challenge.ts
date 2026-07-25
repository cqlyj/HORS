import type { RpContext } from "@worldcoin/idkit-core";

export interface AssuranceChallenge {
  type?: string;
  action?: string;
  rpContext?: RpContext;
  signal?: string;
  signalHash?: string;
  signalParamName?: string;
  appId?: string;
  environment?: "production" | "staging";
  attributes?: unknown;
  instruction?: string;
}

export function asAssuranceChallenge(
  value: unknown,
): AssuranceChallenge | null {
  if (!value || typeof value !== "object") return null;
  return value as AssuranceChallenge;
}

export function resolveAppId(challenge: AssuranceChallenge): `app_${string}` {
  const raw =
    challenge.appId ??
    process.env.HORS_WORLD_APP_ID ??
    process.env.WORLD_APP_ID;
  if (!raw || typeof raw !== "string") {
    throw new Error(
      "Missing World App ID for selfie step-up. Set WORLD_APP_ID on the service (included in the challenge) or export HORS_WORLD_APP_ID / WORLD_APP_ID in this shell.",
    );
  }
  if (!raw.startsWith("app_")) {
    throw new Error(`Invalid World App ID (expected app_…): ${raw}`);
  }
  return raw as `app_${string}`;
}
