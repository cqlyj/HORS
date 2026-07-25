export const HORS_HEADERS = {
  REQUEST: "Hors-Authorization",
  STATUS: "Hors-Status",
  ALLOW_ORIGIN: "Hors-Allow-Origin",
  DENY_REASON: "Hors-Deny-Reason",
  REQUIRE_ASSURANCE: "Hors-Require-Assurance",
  EXECUTION_MODE: "Hors-Execution-Mode",
  POLICY_HASH: "Hors-Policy-Hash",
} as const;

export type HORSStatusValue = "executed" | "denied" | "step-up-required";
export type HORSDenyReason =
  | "origin-mismatch"
  | "function-forbidden"
  | "assurance-required"
  | "tee-unverified"
  | "no-provider";
