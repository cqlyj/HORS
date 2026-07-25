import type { ServerContext } from "@modelcontextprotocol/server";
import {
  HORS_HEADERS,
  type HORSStatusValue,
  type HORSDenyReason,
  type FunctionPolicy,
  type HORSDecision,
  type HORSErrorCode,
} from "hors-core";

export interface DiagnosticHeaders {
  [key: string]: string;
}

function mapOriginToHeader(origin: FunctionPolicy["origin"]): string {
  if (origin === "public") return "*";
  return origin;
}

function mapDecisionToDenyReason(
  code: HORSErrorCode | null | undefined,
): HORSDenyReason | undefined {
  switch (code) {
    case "HORS_ORIGIN_MISMATCH":
      return "origin-mismatch";
    case "HORS_FUNCTION_FORBIDDEN":
      return "function-forbidden";
    case "HORS_ASSURANCE_REQUIRED":
      return "assurance-required";
    case "HORS_EXECUTION_UNVERIFIED":
      return "tee-unverified";
    case "HORS_NO_PROVIDER":
      return "no-provider";
    default:
      return undefined;
  }
}

function mapDecisionToStatus(decision: HORSDecision): HORSStatusValue {
  switch (decision.status) {
    case "allow":
      return "executed";
    case "deny":
      return "denied";
    case "step-up-required":
      return "step-up-required";
  }
}

export function buildDiagnosticHeaders(
  decision: HORSDecision,
  policy: FunctionPolicy,
  policyHash?: string,
): DiagnosticHeaders {
  const headers: DiagnosticHeaders = {
    [HORS_HEADERS.STATUS]: mapDecisionToStatus(decision),
    [HORS_HEADERS.ALLOW_ORIGIN]: mapOriginToHeader(policy.origin),
    [HORS_HEADERS.EXECUTION_MODE]: policy.executor ?? "local",
    "Cache-Control": "no-store",
  };

  const denyReason = mapDecisionToDenyReason(decision.code);
  if (denyReason) {
    headers[HORS_HEADERS.DENY_REASON] = denyReason;
  }

  if (decision.requiredAssurance) {
    headers[HORS_HEADERS.REQUIRE_ASSURANCE] = decision.requiredAssurance;
  }

  if (policyHash) {
    headers[HORS_HEADERS.POLICY_HASH] = policyHash;
  }

  return headers;
}

/** Best-effort: MCP ServerContext does not expose a response object yet. */
export function applyDiagnosticHeaders(
  _ctx: ServerContext,
  _headers: DiagnosticHeaders,
): void {
  // Diagnostic headers are built for HTTP middleware integration (Phase 4+).
  // The MCP SDK v2 beta ServerContext currently exposes only `http.req`.
}
