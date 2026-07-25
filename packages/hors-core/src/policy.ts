import type { FunctionPolicy, HORSDecision, AssuranceProof } from "./types.js";
import type { Hex } from "viem";

export function evaluatePolicy(
  policy: FunctionPolicy,
  callerHumanId: Hex,
  ownerHumanId: Hex,
  assuranceProofs?: AssuranceProof[],
): HORSDecision {
  // Step 1: Origin check
  if (policy.origin === "same-human") {
    if (callerHumanId.toLowerCase() !== ownerHumanId.toLowerCase()) {
      return {
        status: "deny",
        code: "HORS_ORIGIN_MISMATCH",
        reason: `Caller humanId ${callerHumanId} does not match owner ${ownerHumanId}`,
      };
    }
  } else if (policy.origin !== "any-human" && policy.origin !== "public") {
    return {
      status: "deny",
      code: "HORS_FUNCTION_FORBIDDEN",
      reason: `Unknown origin: ${policy.origin}`,
    };
  }
  // 'any-human' and 'public' always pass origin check

  // Step 2: Assurance check
  const required = policy.assurance ?? "none";
  if (required !== "none") {
    const hasProof = assuranceProofs?.some((p) => p.type === required);
    if (!hasProof) {
      return {
        status: "step-up-required",
        code: "HORS_ASSURANCE_REQUIRED",
        requiredAssurance: required,
      };
    }

    if (required === "identity" && policy.identityAttributes?.length) {
      const identityProof = assuranceProofs?.find((p) => p.type === "identity");
      const attested = identityProof?.attributes?.some(
        (a) => a.type === "identity_attested" && a.value >= 1,
      );
      if (!attested) {
        return {
          status: "step-up-required",
          code: "HORS_ASSURANCE_REQUIRED",
          requiredAssurance: "identity",
          reason: "Identity attributes not attested by World App",
        };
      }
    }
  }

  // Step 3: All checks passed
  return { status: "allow", code: null };
}
