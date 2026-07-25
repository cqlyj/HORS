import {
  inputRequired,
  acceptedContent,
  inputResponse,
  ProtocolError,
  type CallToolResult,
  type InputRequiredResult,
  type ServerContext,
} from "@modelcontextprotocol/server";
import {
  evaluatePolicy,
  hashArguments,
  HORS_HEADERS,
  HORSError,
  HORS_RPC_CODES,
  type AuditLogEntry,
  type ExecutionReceipt,
  type FunctionPolicy,
  type HORSErrorCode,
  type AssuranceProof,
  type HORSAuth,
  type HORSExecutor,
} from "hors-core";
import type { Hex, Address } from "viem";
import { keccak256, toHex } from "viem";
import { buildAssuranceSignal, hashSignal } from "hors-assurance";
import type { HORSAuthContext, HORSStepUpState } from "./auth-context.js";
import { verifyHorsAuthorization, extractFunctionName } from "./verify.js";
import { parseHorsResources } from "./parse-resources.js";
import type { ReceiptMeta } from "./create-hors.js";
import type {
  HORSToolContext,
  HORSToolHandler,
  ToolHandler,
} from "./hors-service.js";

const VALID_ORIGINS = new Set<string>(["same-human", "any-human", "public"]);
const VALID_ASSURANCES = new Set<string>(["none", "selfie", "identity"]);
const VALID_EXECUTORS = new Set<string>(["local", "0g"]);

function validateExecutionReceipt(
  result: CallToolResult | InputRequiredResult,
  policy: FunctionPolicy,
  receiptBrand: WeakMap<object, ReceiptMeta>,
  functionName: string,
  callId: string,
  argsHash: string,
): { provider?: string; teeVerified?: boolean } | undefined {
  if (!policy.executor || policy.executor === "local") return undefined;

  const receipt = (result as Record<string, unknown>)?._horsReceipt as
    | object
    | undefined;
  if (!receipt) {
    throw horsToMcpError(
      "HORS_EXECUTION_UNVERIFIED",
      `Policy requires executor "${policy.executor}" but no receipt provided`,
    );
  }

  const meta = receiptBrand.get(receipt);
  if (!meta) {
    throw horsToMcpError(
      "HORS_EXECUTION_UNVERIFIED",
      "Receipt not produced by a registered executor",
    );
  }

  receiptBrand.delete(receipt);

  if (meta.executor !== policy.executor) {
    throw horsToMcpError(
      "HORS_EXECUTION_UNVERIFIED",
      `Receipt executor "${meta.executor}" does not match policy "${policy.executor}"`,
    );
  }
  if (meta.functionName !== functionName) {
    throw horsToMcpError(
      "HORS_EXECUTION_UNVERIFIED",
      "Receipt was issued for a different function",
    );
  }
  if (meta.callId !== callId) {
    throw horsToMcpError(
      "HORS_EXECUTION_UNVERIFIED",
      "Receipt was issued for a different call",
    );
  }
  if (meta.argsHash !== argsHash) {
    throw horsToMcpError(
      "HORS_EXECUTION_UNVERIFIED",
      "Receipt was issued for different arguments",
    );
  }
  if (meta.teeVerified !== true) {
    throw horsToMcpError(
      "HORS_EXECUTION_UNVERIFIED",
      "TEE verification not confirmed in receipt metadata",
    );
  }

  const textBlocks = ((result as CallToolResult).content ?? [])
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text);
  const actualContentHash = keccak256(toHex(textBlocks.join("")));
  if (actualContentHash !== meta.contentHash) {
    throw horsToMcpError(
      "HORS_EXECUTION_UNVERIFIED",
      "Response content does not match executor output",
    );
  }

  return { provider: meta.provider, teeVerified: meta.teeVerified };
}

function createHorsCtx(
  authContext: HORSAuthContext,
  receiptBrand: WeakMap<object, ReceiptMeta>,
  functionName: string,
  callId: string,
  argsHash: string,
): HORSToolContext {
  return {
    executor: (name: string) => {
      const rawExecutor = authContext.executors[name];
      if (!rawExecutor) {
        throw horsToMcpError(
          "HORS_EXECUTION_UNVERIFIED",
          `No executor registered for "${name}"`,
        );
      }
      return {
        execute: async (prompt, systemPrompt, options) => {
          const result = await rawExecutor.execute(
            prompt,
            systemPrompt,
            options,
          );
          const contentHash = keccak256(toHex(result.content));
          if (result.teeVerified !== true) {
            throw horsToMcpError(
              "HORS_EXECUTION_UNVERIFIED",
              "Executor did not confirm TEE verification",
              { teeVerified: result.teeVerified, provider: result.provider },
            );
          }
          const receipt: ExecutionReceipt = {
            executor: name,
            content: result.content,
            provider: result.provider,
            teeVerified: result.teeVerified,
            requestId: result.requestId,
          };
          Object.freeze(receipt);
          receiptBrand.set(receipt, {
            executor: name,
            functionName,
            callId,
            argsHash,
            contentHash,
            provider: result.provider,
            requestId: result.requestId,
            teeVerified: true,
          });
          return { result, receipt };
        },
      };
    },
  };
}

function stripReceipt(
  result: CallToolResult | InputRequiredResult,
): CallToolResult | InputRequiredResult {
  const cleanResult = { ...result };
  delete (cleanResult as Record<string, unknown>)._horsReceipt;
  return cleanResult;
}

function normalizeToolArgs(
  argsOrCtx: Record<string, unknown> | ServerContext,
  maybeCtx?: ServerContext,
): [Record<string, unknown>, ServerContext] {
  if (maybeCtx !== undefined) {
    return [argsOrCtx as Record<string, unknown>, maybeCtx];
  }
  return [{}, argsOrCtx as ServerContext];
}

function horsToMcpError(
  code: HORSErrorCode,
  message?: string,
  data?: unknown,
): ProtocolError {
  return new ProtocolError(HORS_RPC_CODES[code], message ?? code, data);
}

function parseAuditEncryptionKey(hexKey: string): Uint8Array {
  const normalized = hexKey.startsWith("0x") ? hexKey.slice(2) : hexKey;
  if (normalized.length !== 64) {
    throw new Error(
      "Audit encryption key must be 32 bytes (64 hex characters)",
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error("Audit encryption key must be valid hex");
  }
  const bytes = Buffer.from(normalized, "hex");
  if (bytes.length !== 32) {
    throw new Error("Audit encryption key decoded to invalid byte length");
  }
  return Uint8Array.from(bytes);
}

function policiesEqual(a: FunctionPolicy, b: FunctionPolicy): boolean {
  if (a.origin !== b.origin) return false;
  if ((a.assurance ?? "none") !== (b.assurance ?? "none")) return false;
  if ((a.executor ?? "local") !== (b.executor ?? "local")) return false;
  const aAttrs = JSON.stringify(a.identityAttributes ?? []);
  const bAttrs = JSON.stringify(b.identityAttributes ?? []);
  return aAttrs === bAttrs;
}

function validateExecutorRegistration(
  policy: FunctionPolicy,
  executors: Record<string, HORSExecutor>,
): void {
  if (policy.executor && policy.executor !== "local") {
    if (!executors[policy.executor]) {
      throw horsToMcpError(
        "HORS_EXECUTION_UNVERIFIED",
        `Policy requires executor "${policy.executor}" but none is registered`,
      );
    }
  }
}

async function maybeWriteAuditLog(
  authContext: HORSAuthContext,
  params: {
    functionName: string;
    callerHumanId: Hex;
    callerAddress: Address;
    argsHash: Hex;
    policy: FunctionPolicy;
    executorResult?: { provider?: string; teeVerified?: boolean };
  },
): Promise<string | undefined> {
  const storage = authContext.config.registry?.storage;
  if (!authContext.storageClient || !storage?.auditEncryptionKey) {
    return undefined;
  }

  try {
    const { writeAuditLog } = await import("./storage.js");
    const entry: AuditLogEntry = {
      serviceId: storage.serviceId ?? "unregistered",
      functionName: params.functionName,
      callerHumanId: params.callerHumanId,
      callerAddress: params.callerAddress,
      argsHash: params.argsHash,
      timestamp: new Date().toISOString(),
      executor: params.policy.executor,
      provider: params.executorResult?.provider,
      teeVerified: params.executorResult?.teeVerified,
      policyVersion: authContext.config.policyVersion,
    };
    const key = parseAuditEncryptionKey(storage.auditEncryptionKey);
    const { rootHash } = await writeAuditLog(
      authContext.storageClient,
      entry,
      key,
    );
    return rootHash;
  } catch (err) {
    console.error("[HORS] Audit log write failed:", err);
    return undefined;
  }
}

async function finalizeAllowResult(
  authContext: HORSAuthContext,
  result: CallToolResult | InputRequiredResult,
  policy: FunctionPolicy,
  receiptBrand: WeakMap<object, ReceiptMeta>,
  auditParams: {
    functionName: string;
    callerHumanId: Hex;
    callerAddress: Address;
    argsHash: Hex;
    callId: string;
  },
): Promise<CallToolResult | InputRequiredResult> {
  const trustedMeta = validateExecutionReceipt(
    result,
    policy,
    receiptBrand,
    auditParams.functionName,
    auditParams.callId,
    auditParams.argsHash,
  );
  const auditRoot = await maybeWriteAuditLog(authContext, {
    functionName: auditParams.functionName,
    callerHumanId: auditParams.callerHumanId,
    callerAddress: auditParams.callerAddress,
    argsHash: auditParams.argsHash,
    policy,
    executorResult: trustedMeta,
  });
  if (auditRoot) {
    console.info(
      `[HORS] Audit root: ${auditRoot} for ${auditParams.functionName}`,
    );
  }
  return stripReceipt(result);
}

async function handleStepUpReentry(
  authContext: HORSAuthContext,
  receiptBrand: WeakMap<object, ReceiptMeta>,
  state: HORSStepUpState,
  functionName: string,
  args: Record<string, unknown>,
  ctx: ServerContext,
  handler: HORSToolHandler,
  policy: FunctionPolicy,
): Promise<CallToolResult | InputRequiredResult> {
  if (state.functionName !== functionName) {
    throw horsToMcpError(
      "HORS_FUNCTION_FORBIDDEN",
      "Step-up state was issued for a different function",
      { stateFunction: state.functionName, invoked: functionName },
    );
  }

  if (
    !(await Promise.resolve(
      authContext.stepUpConsumedStore.consume(`stepup:${state.callId}`),
    ))
  ) {
    throw horsToMcpError(
      "HORS_FUNCTION_FORBIDDEN",
      "Step-up already completed — replay rejected",
    );
  }

  const response = inputResponse(ctx.mcpReq.inputResponses, "assurance");

  if (response.kind !== "elicit") {
    throw horsToMcpError(
      "HORS_ASSURANCE_REQUIRED",
      "Assurance step-up was not completed",
    );
  }

  if (response.action === "decline" || response.action === "cancel") {
    throw horsToMcpError(
      "HORS_ASSURANCE_REQUIRED",
      "Assurance verification was declined or cancelled",
    );
  }

  if (response.action !== "accept") {
    throw horsToMcpError(
      "HORS_ASSURANCE_REQUIRED",
      "Unexpected assurance response action",
    );
  }

  const content = acceptedContent<{ proofPayload?: string }>(
    ctx.mcpReq.inputResponses,
    "assurance",
  );

  const proofPayload = content?.proofPayload;
  if (!proofPayload) {
    throw horsToMcpError(
      "HORS_ASSURANCE_REQUIRED",
      "Missing proofPayload in assurance response",
    );
  }

  const computedArgsHash = hashArguments(args);
  if (computedArgsHash.toLowerCase() !== state.argsHash.toLowerCase()) {
    throw horsToMcpError(
      "HORS_FUNCTION_FORBIDDEN",
      "Arguments hash mismatch on step-up reentry — signed arguments do not match request",
      { expected: state.argsHash, computed: computedArgsHash },
    );
  }

  const adapter =
    state.requiredAssurance === "identity"
      ? authContext.identityAdapter
      : authContext.selfieAdapter;

  if (!adapter) {
    throw horsToMcpError(
      "HORS_ASSURANCE_REQUIRED",
      `No ${state.requiredAssurance} adapter configured`,
    );
  }

  const assuranceResult = await adapter.verify(
    proofPayload,
    state.expectedSignalHash,
    state.action,
  );

  if (!assuranceResult.verified) {
    throw horsToMcpError(
      "HORS_ASSURANCE_REQUIRED",
      assuranceResult.error ?? "Assurance verification failed",
      { type: state.requiredAssurance },
    );
  }

  if (
    state.action &&
    assuranceResult.action &&
    assuranceResult.action !== state.action
  ) {
    throw horsToMcpError(
      "HORS_ASSURANCE_REQUIRED",
      "Action mismatch — proof was generated for a different assurance action",
      { expected: state.action, received: assuranceResult.action },
    );
  }

  const assuranceProofs: AssuranceProof[] = [
    {
      type: state.requiredAssurance as AssuranceProof["type"],
      proof: assuranceResult.nullifier ?? proofPayload,
      verifiedAt: new Date().toISOString(),
      attributes: [
        {
          type: "identity_attested",
          value: assuranceResult.identityAttested ? 1 : 0,
        },
      ],
    },
  ];

  const decision = evaluatePolicy(
    policy,
    state.callerHumanId as `0x${string}`,
    authContext.humanOrigin,
    assuranceProofs,
  );

  if (decision.status === "allow") {
    const horsCtx = createHorsCtx(
      authContext,
      receiptBrand,
      functionName,
      state.callId,
      state.argsHash,
    );
    const result = await handler(args, ctx, horsCtx);
    return finalizeAllowResult(authContext, result, policy, receiptBrand, {
      functionName: state.functionName,
      callerHumanId: state.callerHumanId as Hex,
      callerAddress: state.callerAddress as Address,
      argsHash: state.argsHash as Hex,
      callId: state.callId,
    });
  }

  if (decision.status === "deny") {
    throw horsToMcpError(decision.code!, decision.reason);
  }

  throw horsToMcpError(
    "HORS_ASSURANCE_REQUIRED",
    decision.reason ?? "Assurance verification failed",
    { requiredAssurance: decision.requiredAssurance },
  );
}

async function verifyAuthHeader(
  authContext: HORSAuthContext,
  headerValue: string,
): Promise<HORSAuth> {
  return verifyHorsAuthorization(headerValue, {
    domain: authContext.domain,
    nonceStore: authContext.nonceStore,
    callIdStore: authContext.callIdStore,
    agentBookVerifier: authContext.agentBookVerifier,
    policyContentHash: authContext.policyContentHash,
    maxAge: 300_000,
  });
}

function validatePolicyAtRegistration(
  authContext: HORSAuthContext | null,
  functionName: string,
  policy: FunctionPolicy,
): void {
  if (!authContext?.manifest) return;

  const manifestPolicy = authContext.manifest.functions[functionName];
  if (!manifestPolicy) {
    throw new Error(
      `HORS policy error for "${functionName}": function not found in manifest. ` +
        `Manifest contains: [${Object.keys(authContext.manifest.functions).join(", ")}]`,
    );
  }
  if (!policiesEqual(policy, manifestPolicy)) {
    throw new Error(
      `HORS policy error for "${functionName}": inline policy does not match manifest. ` +
        `Inline: ${JSON.stringify(policy)}, Manifest: ${JSON.stringify(manifestPolicy)}`,
    );
  }
}

export function horsImpl(
  authContext: HORSAuthContext,
  receiptBrand: WeakMap<object, ReceiptMeta>,
  functionName: string,
  policy: FunctionPolicy,
  handler: HORSToolHandler,
): ToolHandler {
  if (!policy.origin || !VALID_ORIGINS.has(policy.origin)) {
    throw new Error(
      `Invalid HORS policy for "${functionName}": origin must be one of: same-human, any-human, public. Got: "${policy.origin}"`,
    );
  }
  if (policy.assurance && !VALID_ASSURANCES.has(policy.assurance)) {
    throw new Error(
      `Invalid HORS policy for "${functionName}": assurance must be one of: none, selfie, identity. Got: "${policy.assurance}"`,
    );
  }
  if (policy.executor && !VALID_EXECUTORS.has(policy.executor)) {
    throw new Error(
      `Invalid HORS policy for "${functionName}": executor must be one of: local, 0g. Got: "${policy.executor}"`,
    );
  }

  validatePolicyAtRegistration(authContext, functionName, policy);

  return async (argsOrCtx, maybeCtx) => {
    const [args, ctx] = normalizeToolArgs(argsOrCtx, maybeCtx);

    validateExecutorRegistration(policy, authContext.executors);

    if (
      policy.origin === "public" &&
      (!policy.assurance || policy.assurance === "none")
    ) {
      const callId = crypto.randomUUID();
      const argsHash = hashArguments(args);
      const horsCtx = createHorsCtx(
        authContext,
        receiptBrand,
        functionName,
        callId,
        argsHash,
      );
      const result = await handler(args, ctx, horsCtx);
      if (policy.executor && policy.executor !== "local") {
        validateExecutionReceipt(
          result,
          policy,
          receiptBrand,
          functionName,
          callId,
          argsHash,
        );
        return stripReceipt(result);
      }
      return result;
    }

    const horsAuthHeader = ctx.http?.req?.headers.get(
      HORS_HEADERS.REQUEST.toLowerCase(),
    );
    if (!horsAuthHeader) {
      throw horsToMcpError(
        "HORS_ORIGIN_MISMATCH",
        "Missing Hors-Authorization header",
      );
    }

    const state = ctx.mcpReq.requestState<HORSStepUpState>();
    if (state?.step === "awaiting-assurance") {
      let reentryAuth: HORSAuth;
      try {
        reentryAuth = await verifyAuthHeader(authContext, horsAuthHeader);
      } catch (error) {
        if (error instanceof HORSError) {
          throw horsToMcpError(error.code, error.message, error.data);
        }
        throw error;
      }

      if (
        reentryAuth.callerAddress.toLowerCase() !==
        state.callerAddress.toLowerCase()
      ) {
        throw horsToMcpError(
          "HORS_ORIGIN_MISMATCH",
          "Step-up caller mismatch",
          {
            headerAddress: reentryAuth.callerAddress,
            stateAddress: state.callerAddress,
          },
        );
      }

      return handleStepUpReentry(
        authContext,
        receiptBrand,
        state,
        functionName,
        args,
        ctx,
        handler,
        policy,
      );
    }

    let horsAuth: HORSAuth;
    try {
      horsAuth = await verifyAuthHeader(authContext, horsAuthHeader);
    } catch (error) {
      if (error instanceof HORSError) {
        throw horsToMcpError(error.code, error.message, error.data);
      }
      throw error;
    }

    const signedFunctionName = extractFunctionName(horsAuth.payload.uri);
    if (signedFunctionName !== functionName) {
      throw horsToMcpError(
        "HORS_FUNCTION_FORBIDDEN",
        "Signed function name does not match tool",
        {
          signed: signedFunctionName,
          expected: functionName,
        },
      );
    }

    const resources = parseHorsResources(horsAuth.payload.resources);
    const computedArgsHash = hashArguments(args);
    if (computedArgsHash.toLowerCase() !== resources.argsHash.toLowerCase()) {
      throw horsToMcpError(
        "HORS_FUNCTION_FORBIDDEN",
        "Arguments hash mismatch — signed arguments do not match request",
        {
          expected: resources.argsHash,
          computed: computedArgsHash,
        },
      );
    }

    const decision = evaluatePolicy(
      policy,
      horsAuth.callerHumanId,
      authContext.humanOrigin,
    );

    switch (decision.status) {
      case "allow": {
        const horsCtx = createHorsCtx(
          authContext,
          receiptBrand,
          functionName,
          horsAuth.callId,
          computedArgsHash,
        );
        const result = await handler(args, ctx, horsCtx);
        return finalizeAllowResult(authContext, result, policy, receiptBrand, {
          functionName,
          callerHumanId: horsAuth.callerHumanId,
          callerAddress: horsAuth.payload.address,
          argsHash: computedArgsHash,
          callId: horsAuth.callId,
        });
      }

      case "deny":
        throw horsToMcpError(decision.code!, decision.reason);

      case "step-up-required": {
        const adapter =
          decision.requiredAssurance === "identity"
            ? authContext.identityAdapter
            : authContext.selfieAdapter;

        if (!adapter) {
          throw horsToMcpError(
            "HORS_ASSURANCE_REQUIRED",
            `No ${decision.requiredAssurance} adapter configured. Set assurance.rpId and assurance.signingKey in createHORS config.`,
          );
        }

        const action = `hors:${decision.requiredAssurance}:${horsAuth.callId}`;
        const signal = buildAssuranceSignal(
          horsAuth.callerAddress,
          functionName,
          resources.argsHash,
          horsAuth.payload.nonce,
          policy.identityAttributes,
        );
        const expectedSignalHash = hashSignal(signal).toString();
        const challenge = adapter.initiate(
          action,
          signal,
          policy.identityAttributes,
        );

        return inputRequired({
          inputRequests: {
            assurance: inputRequired.elicit({
              message: JSON.stringify({
                type: decision.requiredAssurance,
                action: challenge.action,
                rpContext: challenge.rpContext,
                signal: challenge.signal,
                signalHash: challenge.signalHash,
                signalParamName: challenge.signalParamName,
                ...(challenge.attributes
                  ? { attributes: challenge.attributes }
                  : {}),
                instruction: `Complete ${decision.requiredAssurance} verification via World App, then return the IDKit result JSON as proofPayload`,
              }),
              requestedSchema: {
                type: "object",
                properties: { proofPayload: { type: "string" } },
                required: ["proofPayload"],
              },
            }),
          },
          requestState: await authContext.stateCodec.mint(
            {
              step: "awaiting-assurance",
              callId: horsAuth.callId,
              callerHumanId: horsAuth.callerHumanId,
              callerAddress: horsAuth.payload.address,
              functionName,
              argsHash: resources.argsHash,
              requiredAssurance: decision.requiredAssurance!,
              action: challenge.action,
              expectedSignalHash,
            },
            ctx,
          ),
        });
      }
    }
  };
}
