import type { FunctionPolicy, HORSServerConfig } from "hors-core";
import { buildAuthContext } from "./auth-context.js";
import { horsImpl } from "./hors.js";
import type {
  HORSService,
  HORSToolHandler,
  ToolHandler,
} from "./hors-service.js";

export interface ReceiptMeta {
  executor: string;
  functionName: string;
  callId: string;
  argsHash: string;
  contentHash: string;
  provider?: string;
  requestId?: string;
  teeVerified: true;
}

export async function createHORS(
  config: HORSServerConfig,
): Promise<HORSService> {
  const context = await buildAuthContext(config);
  const receiptBrand = new WeakMap<object, ReceiptMeta>();
  return {
    hors: (
      functionName: string,
      policy: FunctionPolicy,
      handler: HORSToolHandler,
    ) => horsImpl(context, receiptBrand, functionName, policy, handler),
    get context() {
      return context;
    },
  };
}
