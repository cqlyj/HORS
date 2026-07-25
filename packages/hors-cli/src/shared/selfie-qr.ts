import chalk from "chalk";
import qrcode from "qrcode-terminal";
import {
  IDKit,
  IDKitErrorCodes,
  selfieCheckLegacy,
  type RpContext,
} from "@worldcoin/idkit-core";
import {
  asAssuranceChallenge,
  resolveAppId,
  type AssuranceChallenge,
} from "./assurance-challenge.js";
import { ensureIdkitWasmForNode } from "./idkit-wasm.js";

function renderQr(connectorURI: string): void {
  console.log("");
  console.log(
    chalk.bold("Scan with World App to complete selfie verification"),
  );
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
      `Unsupported assurance type "${challenge.type}" — CLI QR handoff currently supports selfie only`,
    );
  }
  if (!challenge.action) {
    throw new Error("Step-up challenge missing action");
  }
  if (!challenge.signal) {
    throw new Error("Step-up challenge missing signal");
  }

  const appId = resolveAppId(challenge);
  const rpContext = assertRpContext(challenge.rpContext);
  const environment = challenge.environment ?? "production";

  console.log(chalk.yellow("Step-up required: selfie"));
  console.log(chalk.dim(`Action ${challenge.action}`));

  // Node cannot fetch the packaged WASM over file:; load it from disk first.
  ensureIdkitWasmForNode();

  const request = await IDKit.requestWithInviteCode({
    app_id: appId,
    action: challenge.action,
    rp_context: rpContext,
    allow_legacy_proofs: true,
    environment,
  }).preset(selfieCheckLegacy({ signal: challenge.signal }));

  if (!request.connectorURI) {
    throw new Error("IDKit returned an empty connectorURI — cannot render QR");
  }

  renderQr(request.connectorURI);
  console.log(chalk.dim("Waiting for World App… (Ctrl+C to cancel)"));

  const completion = await request.pollUntilCompletion({
    pollInterval: 2_000,
    timeout: 5 * 60_000,
  });

  if (!completion.success) {
    const detail =
      completion.error === IDKitErrorCodes.Timeout
        ? "Timed out waiting for selfie verification"
        : completion.error === IDKitErrorCodes.Cancelled
          ? "Selfie verification was cancelled"
          : `Selfie verification failed: ${completion.error}`;
    throw new Error(detail);
  }

  console.log(chalk.green("✓ Selfie verified — completing request…"));
  return JSON.stringify(completion.result);
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

export type { AssuranceChallenge };
