import type { ExecutionReceipt } from "hors-core";
import type { ExecutionResult } from "./types.js";

/** @deprecated Branded receipts are issued by horsCtx.executor() — unbranded receipts fail WeakMap validation. */
export function createReceipt(result: ExecutionResult): ExecutionReceipt {
  return {
    executor: "0g",
    content: result.content,
    provider: result.provider,
    teeVerified: result.teeVerified,
    requestId: result.requestId,
  };
}
