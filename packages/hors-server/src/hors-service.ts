import type { HORSAuthContext } from "./auth-context.js";
import type { ExecutionReceipt, FunctionPolicy } from "hors-core";
import type {
  CallToolResult,
  InputRequiredResult,
  ServerContext,
} from "@modelcontextprotocol/server";

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ServerContext,
) =>
  | Promise<CallToolResult | InputRequiredResult>
  | CallToolResult
  | InputRequiredResult;

export interface ExecutorResult {
  content: string;
  toolCalls?: unknown[];
  provider?: string;
  teeVerified?: boolean;
  requestId?: string;
}

export interface InvocationBoundExecutor {
  execute(
    prompt: string,
    systemPrompt?: string,
    options?: unknown,
  ): Promise<{ result: ExecutorResult; receipt: ExecutionReceipt }>;
}

export interface HORSToolContext {
  executor(name: string): InvocationBoundExecutor;
}

export type HORSToolHandler = (
  args: Record<string, unknown>,
  ctx: ServerContext,
  horsCtx: HORSToolContext,
) =>
  | Promise<CallToolResult | InputRequiredResult>
  | CallToolResult
  | InputRequiredResult;

export interface HORSService {
  hors(
    functionName: string,
    policy: FunctionPolicy,
    handler: HORSToolHandler,
  ): ToolHandler;
  readonly context: HORSAuthContext;
}
