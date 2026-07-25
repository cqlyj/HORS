import type { Hex, Address } from "viem";
import type { ReplayStore } from "./replay-store.js";

// --- Enums (matching Solidity contract) ---

export type Origin = "same-human" | "any-human" | "public";
export type Assurance = "none" | "selfie" | "identity";
export type Executor = "local" | "0g";

// --- Policy Types ---

export interface IdentityAttribute {
  type: string; // e.g. 'minimum_age'
  value: number; // e.g. 21
}

export interface FunctionPolicy {
  origin: Origin;
  assurance?: Assurance;
  executor?: Executor;
  identityAttributes?: IdentityAttribute[];
  /** Default true; set false to forbid all agent calls. */
  agentCallable?: boolean;
}

/** Data uploaded to 0G Storage and hashed for on-chain registration. */
export interface HORSManifestBody {
  serviceId: Hex;
  humanOrigin: Hex;
  functions: Record<string, FunctionPolicy>;
  policyVersion: number;
}

/** Auditable enrollment binding between AgentBook humanId and World ID proof. */
export interface EnrollmentRecord {
  humanId: Hex;
  serviceId: Hex;
  enrollmentNullifier: string;
  signalHash: string;
  action: string;
  verifiedAt: string;
}

// --- Decision Types ---

export type HORSDecisionStatus = "allow" | "deny" | "step-up-required";

export interface HORSDecision {
  status: HORSDecisionStatus;
  code: HORSErrorCode | null;
  reason?: string;
  requiredAssurance?: Assurance;
}

// --- Wire Format Types (Section 9.2) ---
// Flat SIWE fields — NOT {message, signature}

export interface HORSPayload {
  domain: string;
  address: Address;
  uri: string; // hors://<ensName>/<functionName>
  version: string; // always "1"
  chainId: string; // "eip155:8453"
  type: "eip191" | "eip1271";
  nonce: string;
  issuedAt: string; // ISO 8601
  expirationTime?: string;
  statement: string; // "Authorize HORS function call: <functionName>"
  signature: Hex;
  resources: string[]; // [argsHash, policyHash, callId]
}

// --- Assurance Types ---

export interface AssuranceProof {
  type: Assurance;
  proof: unknown;
  verifiedAt: string;
  attributes?: IdentityAttribute[]; // present when type === 'identity'
}

// --- Auth Context (passed from HTTP layer to tool handler) ---

export interface HORSAuth {
  callerHumanId: Hex;
  callerAddress: Address;
  callId: string;
  payload: HORSPayload;
}

// --- Config Types ---

export interface AssuranceServerConfig {
  rpId: string;
  signingKey: string;
  appId?: string;
  environment?: "production" | "staging";
  verifyUrl?: string;
}

export interface StorageConfig {
  indexerUrl?: string;
  evmRpc?: string;
  signerPrivateKey: string;
  auditEncryptionKey?: string;
  serviceId?: Hex;
}

export interface HORSExecutor {
  execute(
    prompt: string,
    systemPrompt?: string,
    options?: unknown,
  ): Promise<{
    content: string;
    teeVerified?: boolean;
    provider?: string;
    requestId?: string;
  }>;
}

export interface ExecutionReceipt {
  executor: string;
  content: string;
  provider?: string;
  teeVerified?: boolean;
  requestId?: string;
}

export interface AuditLogEntry {
  serviceId: string;
  functionName: string;
  callerHumanId: string;
  callerAddress: string;
  argsHash: string;
  timestamp: string;
  executor?: string;
  provider?: string;
  teeVerified?: boolean;
  policyVersion?: number;
}

export interface HORSServerConfig {
  humanOrigin: Hex;
  /** Server's expected domain (e.g. "alice.eth", "localhost"). */
  domain: string;
  /** Canonical policy manifest — inline hors() policies are validated against this at registration. */
  manifest?: HORSManifestBody;
  /** Canonical manifest hash clients must sign when non-zero. Auto-computed from manifest when omitted. */
  policyContentHash?: Hex;
  /** Manifest version written to audit logs. */
  policyVersion?: number;
  /**
   * HMAC key for requestState (>=32 bytes). When omitted, a random per-process
   * key is used — step-up flows will not survive restarts or work across replicas.
   */
  stateKey?: Uint8Array | string;
  /** Injectable replay-protection stores. */
  stores?: {
    nonce?: ReplayStore;
    callId?: ReplayStore;
    stepUp?: ReplayStore;
    nullifier?: ReplayStore;
  };
  /** Registered executors keyed by policy executor name (e.g. "0g"). */
  executors?: Record<string, HORSExecutor>;
  registry?: {
    chain: "0g-galileo";
    storage?: StorageConfig;
    /** 0G Storage root of the enrollment record — verified at startup when set. */
    enrollmentStorageRoot?: Hex;
  };
  assurance?: AssuranceServerConfig;
}

// --- HORS Error Codes (Section 10) ---

export type HORSErrorCode =
  | "HORS_EXECUTED"
  | "HORS_ORIGIN_MISMATCH"
  | "HORS_ASSURANCE_REQUIRED"
  | "HORS_FUNCTION_FORBIDDEN"
  | "HORS_EXECUTION_UNVERIFIED"
  | "HORS_NO_PROVIDER";
