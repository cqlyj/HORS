const DEFAULT_VERIFY_URL = "https://developer.world.org/api/v4/verify";

/** @see https://docs.world.org/api-reference/developer-portal/verify — VerifyV4SuccessResponse */
export interface WorldVerifyResponse {
  success: boolean;
  nullifier?: string;
  action?: string;
  created_at?: string;
  environment?: string;
  results?: Array<{
    identifier: string;
    success: boolean;
    nullifier?: string;
    signal_hash?: string;
    code?: string;
    detail?: string;
  }>;
  code?: string;
  detail?: string;
}

export interface StrictVerifyResult {
  action: string;
  nullifier: string;
  identifier: string;
  signalHash?: string;
}

/**
 * Single enforcement point for World API verify responses.
 * @see https://docs.world.org/api-reference/developer-portal/verify
 */
export function extractStrictResult(
  apiResult: WorldVerifyResponse,
  expectedIdentifiers: string[],
  expectedAction: string,
): StrictVerifyResult {
  if (!apiResult.action) {
    throw new Error("World API response missing action");
  }
  if (apiResult.action !== expectedAction) {
    throw new Error(
      `World API action mismatch: expected "${expectedAction}", got "${apiResult.action}"`,
    );
  }

  const successResult = apiResult.results?.find((r) => r.success);
  if (!successResult) {
    throw new Error("No successful verification result in World API response");
  }

  if (!expectedIdentifiers.includes(successResult.identifier)) {
    throw new Error(
      `Unexpected credential type: expected one of [${expectedIdentifiers.join(", ")}], got "${successResult.identifier}"`,
    );
  }

  const nullifier = apiResult.nullifier ?? successResult.nullifier;
  if (!nullifier) {
    throw new Error("World API response missing nullifier");
  }

  return {
    action: apiResult.action,
    nullifier,
    identifier: successResult.identifier,
    signalHash: successResult.signal_hash,
  };
}

export async function verifyWithWorldApi(
  rpId: string,
  idkitResultJson: string,
  verifyUrl = DEFAULT_VERIFY_URL,
): Promise<WorldVerifyResponse> {
  let idkitResult: unknown;
  try {
    idkitResult = JSON.parse(idkitResultJson);
  } catch {
    throw new Error("Invalid proofPayload: not valid JSON");
  }

  const res = await fetch(`${verifyUrl}/${rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(idkitResult),
  });

  const body = (await res.json()) as WorldVerifyResponse;

  if (!res.ok || !body.success) {
    throw new Error(
      body.detail ?? body.code ?? `World API returned ${res.status}`,
    );
  }

  return body;
}
