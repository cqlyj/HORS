import type { HORSErrorCode } from "./types.js";

export const HORS_RPC_CODES: Record<HORSErrorCode, number> = {
  HORS_EXECUTED: 0,
  HORS_ORIGIN_MISMATCH: -32001,
  HORS_ASSURANCE_REQUIRED: -32002,
  HORS_FUNCTION_FORBIDDEN: -32003,
  HORS_EXECUTION_UNVERIFIED: -32004,
  HORS_NO_PROVIDER: -32005,
} as const;

export class HORSError extends Error {
  readonly code: HORSErrorCode;
  readonly rpcCode: number;
  readonly data?: unknown;

  constructor(code: HORSErrorCode, message?: string, data?: unknown) {
    super(message ?? code);
    this.name = "HORSError";
    this.code = code;
    this.rpcCode = HORS_RPC_CODES[code];
    this.data = data;
  }
}
