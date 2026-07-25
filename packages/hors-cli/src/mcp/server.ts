import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
  Client,
  StreamableHTTPClientTransport,
  isInputRequiredResult,
  specTypeSchemas,
  withInputRequired,
} from "@modelcontextprotocol/client";
import {
  createHORSClient,
  discoverHORSService,
  downloadAndVerifyPolicy,
  extractHorsMeta,
  readServicePolicy,
} from "hors-client";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod/v4";
import { loadKeystore } from "../profile/keystore.js";
import {
  readProfile,
  readServicesCache,
  upsertService,
} from "../profile/store.js";
import { extractAssuranceChallenge } from "../shared/assurance.js";
import { writeTraceEvent } from "../trace/write.js";

const DEFAULT_REGISTRY = "0x86B773d98d3A7dfE6Cc785CA8F76f7A7Ca85f7b9";

function resolveServiceEndpoint(service: string): {
  endpoint: string;
  ensName: string;
} {
  const profile = readProfile();
  const cache = readServicesCache();
  const entry = profile?.services[service] ?? cache.services[service];

  if (entry?.endpoint) {
    return { endpoint: entry.endpoint, ensName: service };
  }
  throw new Error(
    `Unknown service "${service}". Run \`hors services ${service}\` first.`,
  );
}

async function withRemoteClient<T>(
  service: string,
  fn: (client: Client, hors: ReturnType<typeof createHORSClient>) => Promise<T>,
): Promise<T> {
  const profile = readProfile();
  if (!profile) {
    throw new Error("Not connected. Run `hors connect` first.");
  }

  const { endpoint, ensName } = resolveServiceEndpoint(service);
  const privateKey = loadKeystore();
  const account = privateKeyToAccount(privateKey);

  const hors = createHORSClient({
    signer: {
      address: account.address,
      signMessage: (args) => account.signMessage({ message: args.message }),
    },
    domain: ensName.includes(".") ? ensName : "localhost",
  });

  const client = new Client(
    { name: "hors-mcp", version: "0.1.0" },
    {
      versionNegotiation: { mode: "auto" },
      capabilities: {
        elicitation: { form: {} },
      },
      inputRequired: { autoFulfill: false },
    },
  );
  const transport = hors.wrapTransport(
    new StreamableHTTPClientTransport(new URL(endpoint)),
  );
  await client.connect(transport);

  try {
    return await fn(client, hors);
  } finally {
    await client.close();
  }
}

export function startMcpBridge(): void {
  serveStdio(() => {
    const server = new McpServer(
      { name: "hors", version: "0.1.0" },
      {
        capabilities: { tools: {} },
        instructions: [
          "HORS (Human-Origin Resource Sharing) lets AI agents call human-origin protected MCP services.",
          "",
          "WORKFLOW — follow these steps in order:",
          "1. Call hors_status to check if a human identity is connected.",
          '   If connected is false, tell the user: "Run `hors connect --fresh` in your terminal and scan the QR code with World App."',
          "   Then wait for them to confirm, and call hors_status again.",
          "2. Call hors_discover with the service ENS name (e.g. openagents.eth) to resolve and cache the endpoint.",
          "3. Call hors_call with the service name, function name, and arguments to invoke a remote tool.",
          "",
          "IMPORTANT: Identity setup (step 1) requires a terminal command and World App QR scan — it cannot be done via MCP.",
          "Once connected, all subsequent calls work automatically through these MCP tools.",
        ].join("\n"),
      },
    );

    server.registerTool(
      "hors_status",
      {
        description: [
          "Check whether HORS is ready for remote calls. CALL THIS FIRST before any other hors_ tool.",
          "",
          "If connected is true: you can proceed to hors_discover and hors_call.",
          "If connected is false: tell the user to run `hors connect --fresh` in their terminal and scan the World App QR code. Then call hors_status again.",
        ].join("\n"),
        inputSchema: z.object({}),
      },
      async () => {
        const profile = readProfile();
        if (!profile) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    connected: false,
                    nextStep:
                      "Run `hors connect --fresh` in your terminal and scan the QR code with World App. Then call hors_status again.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  connected: true,
                  humanId: profile.humanId,
                  connectorAddress: profile.connectorAddress,
                  services: profile.services,
                  connectedAt: profile.connectedAt,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "hors_discover",
      {
        description: [
          "Discover a HORS service and cache its endpoint. Call this after hors_status shows connected:true, and before hors_call.",
          "",
          "Resolves the service's MCP endpoint via ENS (ENSIP-26 text records on Sepolia).",
          "For local development, pass the endpoint parameter to skip ENS and register a direct URL.",
        ].join("\n"),
        inputSchema: z.object({
          ensName: z
            .string()
            .describe("ENS name of the service, e.g. openagents.eth"),
          endpoint: z
            .string()
            .optional()
            .describe(
              "Direct MCP endpoint URL — skips ENS resolution (for local dev, e.g. http://127.0.0.1:3200/mcp)",
            ),
          serviceId: z
            .string()
            .optional()
            .describe(
              "On-chain HORS service ID (bytes32 hex) — enables policy verification via hors_list_functions",
            ),
          registryAddress: z
            .string()
            .optional()
            .describe(
              "HORSRegistry contract address (default: 0x86B773d98d3A7dfE6Cc785CA8F76f7A7Ca85f7b9)",
            ),
        }),
      },
      async (args) => {
        const ensName = String(args.ensName);
        const directEndpoint = args.endpoint ? String(args.endpoint) : null;

        try {
          const info = directEndpoint
            ? { endpoint: directEndpoint, context: ensName }
            : await discoverHORSService(ensName);

          upsertService(ensName, {
            endpoint: info.endpoint,
            context: info.context,
            ...(args.serviceId ? { serviceId: String(args.serviceId) } : {}),
            ...(args.registryAddress
              ? { registryAddress: String(args.registryAddress) }
              : {}),
          });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { ...info, source: directEndpoint ? "direct" : "ens" },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `Service discovery failed: ${err instanceof Error ? err.message : String(err)}`,
                  hint: directEndpoint
                    ? undefined
                    : "If ENS is not set up, pass the endpoint parameter directly (e.g. http://127.0.0.1:3200/mcp).",
                }),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "hors_list_functions",
      {
        description: [
          "List available functions on a discovered HORS service and their security policies.",
          "Call hors_discover first to cache the service. This is optional — you can skip straight to hors_call if you know the function name.",
          "",
          "Returns a map of function names to their policies (origin, assurance, executor, agentCallable).",
          "Functions with agentCallable:false will always be rejected.",
        ].join("\n"),
        inputSchema: z.object({
          service: z
            .string()
            .describe(
              "ENS name of the service (must be cached via hors_discover first)",
            ),
          refresh: z
            .boolean()
            .optional()
            .describe("Force re-fetch from on-chain registry (ignore cache)"),
        }),
      },
      async (args) => {
        const service = String(args.service);
        const profile = readProfile();
        const cache = readServicesCache();
        const entry =
          profile?.services[service] ?? cache.services[service] ?? null;

        if (!entry) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `Service "${service}" not cached. Call hors_discover first.`,
                }),
              },
            ],
            isError: true,
          };
        }

        const cached = entry.functions ?? {};
        if (Object.keys(cached).length > 0 && !args.refresh) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { service, endpoint: entry.endpoint, functions: cached },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        if (!entry.serviceId) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    service,
                    endpoint: entry.endpoint,
                    functions: cached,
                    hint: "No serviceId configured. Run `hors services <ens> --service-id <hex>` to enable on-chain policy lookup.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        try {
          const registry = (entry.registryAddress ??
            DEFAULT_REGISTRY) as `0x${string}`;
          const { service: svcRecord } = await readServicePolicy(
            entry.serviceId as `0x${string}`,
            registry,
          );

          const { manifest } = await downloadAndVerifyPolicy(
            svcRecord.policyStorageRoot,
            svcRecord.policyContentHash,
          );

          upsertService(service, { ...entry, functions: manifest.functions });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    service,
                    endpoint: entry.endpoint,
                    functions: manifest.functions,
                    verified: true,
                    policyVersion: Number(svcRecord.policyVersion),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    service,
                    endpoint: entry.endpoint,
                    functions: cached,
                    error: `Policy fetch failed: ${err instanceof Error ? err.message : String(err)}`,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      "hors_call",
      {
        description: [
          "Invoke a function on a remote HORS-protected service.",
          "",
          "PREREQUISITES:",
          "1. hors_status must show connected:true (run `hors connect --fresh` in terminal if not)",
          "2. hors_discover must have cached the service endpoint",
          "",
          "The service verifies that the calling agent is backed by the same human as the service owner.",
          "If the function requires additional assurance (e.g. selfie), the response will have status 'step-up-required'",
          "with instructions for the user to complete in World App. Then call hors_call again with the same",
          "service/function/arguments plus proofPayload and requestState from the prior response.",
        ].join("\n"),
        inputSchema: z.object({
          service: z
            .string()
            .describe("ENS name of the service (e.g. openagents.eth)"),
          function: z
            .string()
            .describe(
              "Function name on the remote service (e.g. project.resume, project.evaluateDecision)",
            ),
          arguments: z
            .record(z.string(), z.unknown())
            .optional()
            .describe("Arguments to pass to the function"),
          proofPayload: z
            .string()
            .optional()
            .describe(
              "World App proof JSON — only when completing a step-up challenge from a prior response",
            ),
          requestState: z
            .string()
            .optional()
            .describe(
              "Opaque token from a prior step-up response — echo back byte-exact",
            ),
        }),
      },
      async (args) => {
        const service = String(args.service);
        const functionName = String(args.function);
        const toolArgs =
          (args.arguments as Record<string, unknown> | undefined) ?? {};
        const profile = readProfile();
        const caller = profile?.connectorAddress;

        writeTraceEvent({
          ts: new Date().toISOString(),
          type: "request",
          service,
          function: functionName,
          caller,
          agent: "hors-mcp",
        });

        const hasProof = Boolean(args.proofPayload);
        const hasState = Boolean(args.requestState);
        if (hasProof !== hasState) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: hasProof
                    ? "proofPayload provided without requestState — both are required to complete a step-up challenge"
                    : "requestState provided without proofPayload — both are required to complete a step-up challenge",
                }),
              },
            ],
            isError: true,
          };
        }

        try {
          return await withRemoteClient(service, async (client, hors) => {
            const resultSchema = withInputRequired(
              specTypeSchemas.CallToolResult,
            );
            const value = await client.request(
              {
                method: "tools/call",
                params: {
                  name: functionName,
                  arguments: toolArgs,
                  ...(args.proofPayload && args.requestState
                    ? {
                        inputResponses: {
                          assurance: {
                            action: "accept",
                            content: {
                              proofPayload: String(args.proofPayload),
                            },
                          },
                        },
                        requestState: String(args.requestState),
                      }
                    : {}),
                },
              },
              resultSchema,
              { allowInputRequired: true },
            );

            if (isInputRequiredResult(value)) {
              const meta = hors.lastDiagnostic;
              const challenge = extractAssuranceChallenge(value.inputRequests);

              writeTraceEvent({
                ts: new Date().toISOString(),
                type: "response",
                service,
                function: functionName,
                caller,
                agent: "hors-mcp",
                meta,
              });

              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify(
                      {
                        status: "step-up-required",
                        instruction:
                          "Complete the assurance challenge in World App, then call hors_call again with the same service/function/arguments, plus proofPayload and requestState.",
                        challenge,
                        requestState: value.requestState,
                        meta,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }

            const meta = extractHorsMeta(value) ?? hors.lastDiagnostic;

            writeTraceEvent({
              ts: new Date().toISOString(),
              type: "response",
              service,
              function: functionName,
              caller,
              agent: "hors-mcp",
              meta,
            });

            const textBlocks = Array.isArray(value.content)
              ? value.content
                  .filter(
                    (b): b is { type: "text"; text: string } =>
                      b.type === "text" && typeof b.text === "string",
                  )
                  .map((b) => b.text)
                  .join("\n")
              : JSON.stringify(value, null, 2);

            const asRecord = value as Record<string, unknown>;
            if (asRecord.isError === true) {
              writeTraceEvent({
                ts: new Date().toISOString(),
                type: "error",
                service,
                function: functionName,
                caller,
                agent: "hors-mcp",
                meta,
                error: textBlocks,
              });
              return {
                content: [
                  {
                    type: "text" as const,
                    text: JSON.stringify({ error: textBlocks, meta }, null, 2),
                  },
                ],
                isError: true,
                ...(meta ? { _meta: { hors: meta } } : {}),
              };
            }

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ result: textBlocks, meta }, null, 2),
                },
              ],
              ...(meta ? { _meta: { hors: meta } } : {}),
            };
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const meta = (() => {
            if (err && typeof err === "object" && "data" in err) {
              const data = (err as { data?: { hors?: unknown } }).data;
              if (data?.hors && typeof data.hors === "object") {
                return data.hors as import("hors-core").HORSDiagnosticMeta;
              }
            }
            return undefined;
          })();

          writeTraceEvent({
            ts: new Date().toISOString(),
            type: "error",
            service,
            function: functionName,
            caller,
            agent: "hors-mcp",
            meta,
            error: message,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: message, meta }, null, 2),
              },
            ],
            isError: true,
            ...(meta ? { _meta: { hors: meta } } : {}),
          };
        }
      },
    );

    return server;
  });

  console.error("hors mcp bridge listening on stdio");
}
