import chalk from "chalk";
import {
  Client,
  StreamableHTTPClientTransport,
  isInputRequiredResult,
  specTypeSchemas,
  withInputRequired,
} from "@modelcontextprotocol/client";
import { createHORSClient, extractHorsMeta } from "hors-client";
import type { HORSDiagnosticMeta } from "hors-core";
import type { PrivateKeyAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadKeystore } from "../profile/keystore.js";
import { readProfile, readServicesCache } from "../profile/store.js";
import { extractAssuranceChallenge } from "../shared/assurance.js";
import {
  completeSelfieChallenge,
  isSelfieChallenge,
} from "../shared/selfie-qr.js";
import { writeTraceEvent } from "../trace/write.js";

function textFromResult(result: unknown): string {
  const asRecord = result as Record<string, unknown>;
  if (Array.isArray(asRecord.content)) {
    return (asRecord.content as Array<{ type?: string; text?: string }>)
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("");
  }
  return JSON.stringify(result);
}

function metaFromError(err: unknown): HORSDiagnosticMeta | undefined {
  if (!err || typeof err !== "object") return undefined;
  const data = (err as { data?: { hors?: HORSDiagnosticMeta } }).data;
  return data?.hors;
}

async function invokeRemoteCall(opts: {
  service: string;
  functionName: string;
  toolArgs: Record<string, unknown>;
  endpoint: string;
  domain: string;
  account: PrivateKeyAccount;
  proof?: string;
  requestState?: string;
}): Promise<{
  value: unknown;
  hors: ReturnType<typeof createHORSClient>;
}> {
  const hors = createHORSClient({
    signer: {
      address: opts.account.address,
      signMessage: (args) =>
        opts.account.signMessage({ message: args.message }),
    },
    domain: opts.domain,
  });

  const client = new Client(
    { name: "hors-cli", version: "0.1.0" },
    {
      versionNegotiation: { mode: "auto" },
      capabilities: {
        elicitation: { form: {} },
      },
      // Surface step-up challenges to the CLI instead of auto-looping.
      inputRequired: { autoFulfill: false },
    },
  );

  try {
    await client.connect(
      hors.wrapTransport(
        new StreamableHTTPClientTransport(new URL(opts.endpoint)),
      ),
    );

    const resultSchema = withInputRequired(specTypeSchemas.CallToolResult);
    const value = await client.request(
      {
        method: "tools/call",
        params: {
          name: opts.functionName,
          arguments: opts.toolArgs,
          ...(opts.proof && opts.requestState
            ? {
                inputResponses: {
                  assurance: {
                    action: "accept",
                    content: { proofPayload: opts.proof },
                  },
                },
                requestState: opts.requestState,
              }
            : {}),
        },
      },
      resultSchema,
      { allowInputRequired: true },
    );

    return { value, hors };
  } finally {
    await client.close();
  }
}

export async function callCommand(
  service: string,
  functionName: string,
  argsJson?: string,
  proof?: string,
  requestState?: string,
): Promise<void> {
  const profile = readProfile();
  if (!profile) {
    throw new Error("Not connected. Run `hors connect` first.");
  }

  const cache = readServicesCache();
  const entry =
    profile.services[service] ?? cache.services[service] ?? undefined;
  if (!entry?.endpoint) {
    throw new Error(
      `Unknown service "${service}". Run \`hors connect ${service}\` or \`hors services ${service}\` first.`,
    );
  }

  let toolArgs: Record<string, unknown> = {};
  if (argsJson) {
    try {
      toolArgs = JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid JSON arguments: ${argsJson}`);
    }
  }

  const hasProof = Boolean(proof);
  const hasState = Boolean(requestState);
  if (hasProof !== hasState) {
    throw new Error(
      hasProof
        ? "proofPayload provided without requestState — both are required to complete a step-up challenge"
        : "requestState provided without proofPayload — both are required to complete a step-up challenge",
    );
  }

  const privateKey = loadKeystore();
  const account = privateKeyToAccount(privateKey);
  const domain = service.includes(".") ? service : "localhost";

  writeTraceEvent({
    ts: new Date().toISOString(),
    type: "request",
    service,
    function: functionName,
    caller: account.address,
    agent: "hors-cli",
  });

  try {
    let activeProof = proof;
    let activeState = requestState;
    let { value, hors } = await invokeRemoteCall({
      service,
      functionName,
      toolArgs,
      endpoint: entry.endpoint,
      domain,
      account,
      proof: activeProof,
      requestState: activeState,
    });

    if (isInputRequiredResult(value) && !activeProof) {
      const meta = hors.lastDiagnostic;
      const challenge = extractAssuranceChallenge(value.inputRequests);
      const state = value.requestState;

      writeTraceEvent({
        ts: new Date().toISOString(),
        type: "response",
        service,
        function: functionName,
        caller: account.address,
        agent: "hors-cli",
        meta,
      });

      const interactive =
        Boolean(process.stdout.isTTY) && isSelfieChallenge(challenge);
      if (!interactive) {
        console.log(chalk.yellow("Step-up required"));
        console.log(
          JSON.stringify(
            {
              challenge,
              requestState: state,
              instruction:
                "Re-run this exact `hors call` in your visible terminal to scan the World App QR, or complete externally and pass --proof / --request-state.",
              meta,
            },
            null,
            2,
          ),
        );
        return;
      }

      activeProof = await completeSelfieChallenge(challenge);
      activeState = state;

      writeTraceEvent({
        ts: new Date().toISOString(),
        type: "request",
        service,
        function: functionName,
        caller: account.address,
        agent: "hors-cli",
      });

      ({ value, hors } = await invokeRemoteCall({
        service,
        functionName,
        toolArgs,
        endpoint: entry.endpoint,
        domain,
        account,
        proof: activeProof,
        requestState: activeState,
      }));
    }

    if (isInputRequiredResult(value)) {
      const meta = hors.lastDiagnostic;
      const challenge = extractAssuranceChallenge(value.inputRequests);

      writeTraceEvent({
        ts: new Date().toISOString(),
        type: "response",
        service,
        function: functionName,
        caller: account.address,
        agent: "hors-cli",
        meta,
      });

      console.log(chalk.yellow("Step-up required"));
      console.log(
        JSON.stringify(
          {
            challenge,
            requestState: value.requestState,
            instruction:
              "Run again with --proof and --request-state to complete",
            meta,
          },
          null,
          2,
        ),
      );
      return;
    }

    const meta = extractHorsMeta(value) ?? hors.lastDiagnostic;
    const asRecord = value as Record<string, unknown>;
    const text = textFromResult(value);

    const denied =
      asRecord.isError === true ||
      meta?.status === "denied" ||
      /HORS_(FUNCTION_FORBIDDEN|ORIGIN_MISMATCH|ASSURANCE_REQUIRED|EXECUTION_UNVERIFIED|NO_PROVIDER)/.test(
        text,
      );

    if (denied) {
      writeTraceEvent({
        ts: new Date().toISOString(),
        type: "error",
        service,
        function: functionName,
        caller: account.address,
        agent: "hors-cli",
        meta,
        error: text,
      });
      console.error(chalk.red(text));
      if (meta) console.error(chalk.dim(`_meta.hors: ${JSON.stringify(meta)}`));
      process.exitCode = 1;
      return;
    }

    writeTraceEvent({
      ts: new Date().toISOString(),
      type: "response",
      service,
      function: functionName,
      caller: account.address,
      agent: "hors-cli",
      meta,
    });

    console.log(chalk.green("HORS_EXECUTED"));
    console.log(text);
    if (meta) {
      console.log(chalk.dim(`_meta.hors: ${JSON.stringify(meta)}`));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const meta = metaFromError(err);
    writeTraceEvent({
      ts: new Date().toISOString(),
      type: "error",
      service,
      function: functionName,
      caller: account.address,
      agent: "hors-cli",
      meta,
      error: message,
    });
    console.error(chalk.red(message));
    if (meta) console.error(chalk.dim(`_meta.hors: ${JSON.stringify(meta)}`));
    process.exitCode = 1;
  }
}
