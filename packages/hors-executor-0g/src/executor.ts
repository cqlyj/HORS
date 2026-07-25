import OpenAI from "openai";
import { HORSError } from "hors-core";
import type {
  Executor0GConfig,
  Executor0G,
  ExecuteOptions,
  ExecutionResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://router-api-testnet.integratenetwork.work/v1";
const DEFAULT_MODEL = "qwen2.5-omni";

interface ZeroGTrace {
  request_id?: string;
  provider?: string;
  tee_verified?: boolean;
  billing?: {
    input_cost?: string;
    output_cost?: string;
    total_cost?: string;
  };
}

interface ChatCompletionBody {
  id?: string;
  choices?: OpenAI.Chat.Completions.ChatCompletion["choices"];
  usage?: OpenAI.Chat.Completions.ChatCompletion["usage"];
  x_0g_trace?: ZeroGTrace;
}

function mapExecutionResult(
  completion: ChatCompletionBody,
  trace: ZeroGTrace | undefined,
  teeVerified: boolean | undefined,
): ExecutionResult {
  if (!completion.choices?.length) {
    throw new HORSError("HORS_NO_PROVIDER", "0G Router returned no choices");
  }

  const choice = completion.choices[0];

  const toolCalls = choice?.message?.tool_calls
    ?.filter(
      (
        tc,
      ): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
        tc.type === "function",
    )
    .map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));

  return {
    content: choice?.message?.content ?? "",
    toolCalls,
    provider: trace?.provider,
    teeVerified,
    billing: trace?.billing
      ? {
          inputCost: trace.billing.input_cost ?? "0",
          outputCost: trace.billing.output_cost ?? "0",
          totalCost: trace.billing.total_cost ?? "0",
        }
      : undefined,
    requestId: trace?.request_id,
    usage: completion.usage
      ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        }
      : undefined,
  };
}

async function executeViaFetch(
  config: Executor0GConfig,
  baseURL: string,
  model: string,
  trustMode: string,
  verifyTee: boolean,
  prompt: string,
  systemPrompt: string | undefined,
  options: ExecuteOptions | undefined,
): Promise<ExecutionResult> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const body = {
    model,
    messages,
    max_tokens: options?.maxTokens ?? 2048,
    temperature: options?.temperature,
    top_p: options?.topP,
    stream: false,
    tools: options?.tools,
    tool_choice: options?.toolChoice,
    response_format: options?.responseFormat,
    verify_tee: verifyTee,
  };

  let response: Response;
  try {
    response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "X-0G-Provider-Trust-Mode": trustMode,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new HORSError(
      "HORS_EXECUTION_UNVERIFIED",
      `0G Router request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    if (response.status === 503) {
      throw new HORSError(
        "HORS_NO_PROVIDER",
        `No 0G provider available for model ${model} in ${trustMode} mode`,
        { model, trustMode, status: response.status },
      );
    }
    throw new HORSError(
      "HORS_EXECUTION_UNVERIFIED",
      `0G Router error: ${response.status} ${response.statusText}`,
      { status: response.status },
    );
  }

  const completion = (await response.json()) as ChatCompletionBody;
  const trace = completion.x_0g_trace;
  const chatId =
    response.headers.get("ZG-Res-Key") ?? completion.id ?? trace?.request_id;
  const content = completion.choices?.[0]?.message?.content ?? "";

  let teeVerified = trace?.tee_verified;
  if (config.independentVerifier && trace?.provider && chatId) {
    teeVerified = await config.independentVerifier(
      trace.provider,
      chatId,
      content,
    );
  } else if (config.independentVerifier && verifyTee) {
    throw new HORSError(
      "HORS_EXECUTION_UNVERIFIED",
      "0G response missing provider or chat ID for independent TEE verification",
      { provider: trace?.provider, chatId },
    );
  }

  if (verifyTee && teeVerified !== true) {
    throw new HORSError(
      "HORS_EXECUTION_UNVERIFIED",
      "0G execution completed but TEE verification failed or missing",
      {
        provider: trace?.provider,
        requestId: trace?.request_id,
        teeVerified,
      },
    );
  }

  return mapExecutionResult(completion, trace, teeVerified);
}

export function createExecutor(config: Executor0GConfig): Executor0G {
  const baseURL = config.baseURL ?? DEFAULT_BASE_URL;
  const model = config.model ?? DEFAULT_MODEL;
  const trustMode = config.trustMode ?? "verified";
  const verifyTee = config.verifyTee ?? true;

  const client = new OpenAI({
    baseURL,
    apiKey: config.apiKey,
    defaultHeaders: {
      "X-0G-Provider-Trust-Mode": trustMode,
    },
  });

  return {
    async execute(
      prompt: string,
      systemPrompt?: string,
      options?: ExecuteOptions,
    ): Promise<ExecutionResult> {
      if (config.independentVerifier) {
        return executeViaFetch(
          config,
          baseURL,
          model,
          trustMode,
          verifyTee,
          prompt,
          systemPrompt,
          options,
        );
      }

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
      if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
      }
      messages.push({ role: "user", content: prompt });

      let completion: OpenAI.Chat.Completions.ChatCompletion;
      try {
        completion = await client.chat.completions.create({
          model,
          messages,
          max_tokens: options?.maxTokens ?? 2048,
          temperature: options?.temperature,
          top_p: options?.topP,
          stream: false,
          tools: options?.tools as
            | OpenAI.Chat.Completions.ChatCompletionTool[]
            | undefined,
          tool_choice: options?.toolChoice,
          response_format: options?.responseFormat,
          verify_tee: verifyTee,
        } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
          verify_tee?: boolean;
        });
      } catch (error) {
        if (error instanceof OpenAI.APIError) {
          if (error.status === 503) {
            throw new HORSError(
              "HORS_NO_PROVIDER",
              `No 0G provider available for model ${model} in ${trustMode} mode`,
              { model, trustMode, status: error.status },
            );
          }
          throw new HORSError(
            "HORS_EXECUTION_UNVERIFIED",
            `0G Router error: ${error.status} ${error.message}`,
            { status: error.status },
          );
        }
        throw error;
      }

      const trace = (completion as unknown as { x_0g_trace?: ZeroGTrace })
        .x_0g_trace;

      if (verifyTee && trace?.tee_verified !== true) {
        throw new HORSError(
          "HORS_EXECUTION_UNVERIFIED",
          "0G execution completed but TEE verification failed or missing",
          {
            provider: trace?.provider,
            requestId: trace?.request_id,
            teeVerified: trace?.tee_verified,
          },
        );
      }

      return mapExecutionResult(
        completion as ChatCompletionBody,
        trace,
        trace?.tee_verified,
      );
    },
  };
}
