export interface Executor0GConfig {
  apiKey: string;
  model?: string;
  /** Use `verified` on Galileo testnet; `private` requires TeeML text models (mainnet only). */
  trustMode?: "standard" | "verified" | "private";
  verifyTee?: boolean;
  baseURL?: string;
  /**
   * Optional independent TEE verifier using @0gfoundation/0g-compute-ts-sdk.
   * When set, the executor reads `ZG-Res-Key` from response headers and calls
   * this callback instead of trusting router-reported `tee_verified` alone.
   * Implementations should compare the signed text (from the provider's
   * signature endpoint) against the `content` parameter.
   *
   * @example
   * ```ts
   * import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
   * const broker = await createZGComputeNetworkBroker(wallet);
   * createExecutor({
   *   apiKey: "...",
   *   independentVerifier: (provider, chatId, content) =>
   *     broker.inference.processResponse(provider, chatId).then((v) => v === true),
   * });
   * ```
   */
  independentVerifier?: (
    providerAddress: string,
    chatId: string,
    content: string,
  ) => Promise<boolean>;
}

export interface ExecuteOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: false;
  tools?: unknown[];
  toolChoice?: "auto" | "none";
  responseFormat?: { type: "json_object" | "text" };
}

export interface ExecutionBilling {
  inputCost: string;
  outputCost: string;
  totalCost: string;
}

export interface ExecutionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ExecutionResult {
  content: string;
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  provider?: string;
  teeVerified?: boolean;
  billing?: ExecutionBilling;
  requestId?: string;
  usage?: ExecutionUsage;
}

export interface Executor0G {
  execute(
    prompt: string,
    systemPrompt?: string,
    options?: ExecuteOptions,
  ): Promise<ExecutionResult>;
}
