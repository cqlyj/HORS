import chalk from "chalk";
import qrcode from "qrcode-terminal";
import {
  IDKit,
  IDKitErrorCodes,
  identityCheck,
  selfieCheckLegacy,
  type IdentityAttribute,
  type RpContext,
} from "@worldcoin/idkit-core";
import {
  asAssuranceChallenge,
  resolveAppId,
  type AssuranceChallenge,
} from "./assurance-challenge.js";
import { ensureIdkitWasmForNode } from "./idkit-wasm.js";

function renderQr(connectorURI: string, kind: "selfie" | "identity"): void {
  const label =
    kind === "identity"
      ? "Scan with World App to complete identity verification"
      : "Scan with World App to complete selfie verification";
  console.log("");
  console.log(chalk.bold(label));
  console.log("");
  qrcode.generate(connectorURI, { small: true });
  console.log("");
  console.log(chalk.dim("Or open this URL on your phone:"));
  console.log(chalk.cyan(connectorURI));
  console.log("");
}

function assertRpContext(value: unknown): RpContext {
  if (!value || typeof value !== "object") {
    throw new Error("Step-up challenge missing rpContext");
  }
  const rp = value as Record<string, unknown>;
  if (
    !rp.rp_id ||
    !rp.nonce ||
    typeof rp.created_at !== "number" ||
    typeof rp.expires_at !== "number" ||
    !rp.signature
  ) {
    throw new Error("Step-up challenge has incomplete rpContext");
  }
  return {
    rp_id: rp.rp_id as string,
    nonce: rp.nonce as string,
    created_at: rp.created_at,
    expires_at: rp.expires_at,
    signature: rp.signature as string,
  };
}

function normalizeIdentityAttributes(value: unknown): IdentityAttribute[] {
  if (!Array.isArray(value)) return [];
  return value as IdentityAttribute[];
}

async function pollIdkitProof(opts: {
  kind: "selfie" | "identity";
  challenge: AssuranceChallenge;
}): Promise<string> {
  const { kind, challenge } = opts;
  if (!challenge.action) {
    throw new Error("Step-up challenge missing action");
  }
  if (!challenge.signal) {
    throw new Error("Step-up challenge missing signal");
  }

  const appId = resolveAppId(challenge);
  const rpContext = assertRpContext(challenge.rpContext);
  const environment = challenge.environment ?? "production";

  console.log(chalk.yellow(`Step-up required: ${kind}`));
  console.log(chalk.dim(`Action ${challenge.action}`));

  // Node cannot fetch the packaged WASM over file:; load it from disk first.
  ensureIdkitWasmForNode();

  const builder = IDKit.requestWithInviteCode({
    app_id: appId,
    action: challenge.action,
    rp_context: rpContext,
    allow_legacy_proofs: true,
    environment,
  });

  const request =
    kind === "identity"
      ? await builder.preset(
          identityCheck({
            attributes: normalizeIdentityAttributes(challenge.attributes),
            legacy_signal: challenge.signal,
          }),
        )
      : await builder.preset(selfieCheckLegacy({ signal: challenge.signal }));

  if (!request.connectorURI) {
    throw new Error("IDKit returned an empty connectorURI — cannot render QR");
  }

  renderQr(request.connectorURI, kind);
  console.log(chalk.dim("Waiting for World App… (Ctrl+C to cancel)"));

  const completion = await request.pollUntilCompletion({
    pollInterval: 2_000,
    timeout: 5 * 60_000,
  });

  if (!completion.success) {
    const label = kind === "identity" ? "Identity" : "Selfie";
    const detail =
      completion.error === IDKitErrorCodes.Timeout
        ? `Timed out waiting for ${kind} verification`
        : completion.error === IDKitErrorCodes.Cancelled
          ? `${label} verification was cancelled`
          : `${label} verification failed: ${completion.error}`;
    throw new Error(detail);
  }

  console.log(
    chalk.green(
      `✓ ${kind === "identity" ? "Identity" : "Selfie"} verified — completing request…`,
    ),
  );
  return JSON.stringify(completion.result);
}

/**
 * Open a World App selfie challenge from a HORS step-up payload, render a QR,
 * poll until the human completes it, and return the IDKit result JSON.
 */
export async function completeSelfieChallenge(
  challengeInput: unknown,
): Promise<string> {
  const challenge = asAssuranceChallenge(challengeInput);
  if (!challenge) {
    throw new Error("Invalid assurance challenge payload");
  }
  if (challenge.type && challenge.type !== "selfie") {
    throw new Error(
      `Unsupported assurance type "${challenge.type}" for selfie handoff`,
    );
  }
  return pollIdkitProof({ kind: "selfie", challenge });
}

/**
 * Open a World App identity challenge from a HORS step-up payload, render a QR,
 * poll until the human completes it, and return the IDKit result JSON.
 */
export async function completeIdentityChallenge(
  challengeInput: unknown,
): Promise<string> {
  const challenge = asAssuranceChallenge(challengeInput);
  if (!challenge) {
    throw new Error("Invalid assurance challenge payload");
  }
  if (challenge.type !== "identity") {
    throw new Error(
      `Unsupported assurance type "${challenge.type ?? "undefined"}" for identity handoff`,
    );
  }
  return pollIdkitProof({ kind: "identity", challenge });
}

/** QR handoff for selfie or identity step-ups in an interactive TTY. */
export async function completeAssuranceChallenge(
  challengeInput: unknown,
): Promise<string> {
  if (isIdentityChallenge(challengeInput)) {
    return completeIdentityChallenge(challengeInput);
  }
  return completeSelfieChallenge(challengeInput);
}

export function isSelfieChallenge(challengeInput: unknown): boolean {
  const challenge = asAssuranceChallenge(challengeInput);
  // Older servers may omit type; treat those as selfie when action/signal look present.
  return (
    challenge?.type === "selfie" ||
    (challenge?.type === undefined &&
      Boolean(challenge?.action && challenge?.signal && challenge?.rpContext))
  );
}

export function isIdentityChallenge(challengeInput: unknown): boolean {
  const challenge = asAssuranceChallenge(challengeInput);
  return challenge?.type === "identity";
}

export function isInteractiveAssuranceChallenge(
  challengeInput: unknown,
): boolean {
  return (
    isSelfieChallenge(challengeInput) || isIdentityChallenge(challengeInput)
  );
}

export type { AssuranceChallenge };
