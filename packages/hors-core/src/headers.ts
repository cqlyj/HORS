export const HORS_HEADERS = {
  REQUEST: "Hors-Authorization",
  STATUS: "Hors-Status",
  ALLOW_ORIGIN: "Hors-Allow-Origin",
  DENY_REASON: "Hors-Deny-Reason",
  REQUIRE_ASSURANCE: "Hors-Require-Assurance",
  EXECUTION_MODE: "Hors-Execution-Mode",
  POLICY_HASH: "Hors-Policy-Hash",
} as const;

/** Key under MCP result `_meta` for HORS diagnostic metadata. */
export const HORS_META_KEY = "hors" as const;

export type HORSStatusValue = "executed" | "denied" | "step-up-required";
export type HORSDenyReason =
  | "origin-mismatch"
  | "function-forbidden"
  | "assurance-required"
  | "tee-unverified"
  | "no-provider";

/** Diagnostic shape embedded as `_meta.hors` on MCP tool results. */
export interface HORSDiagnosticMeta {
  status: HORSStatusValue;
  origin: string;
  executionMode: string;
  denyReason?: HORSDenyReason;
  requireAssurance?: string;
  policyHash?: string;
  teeVerified?: boolean;
  provider?: string;
  callerHumanId?: string;
  functionName?: string;
}
