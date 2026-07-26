# HORS SDK guide

HORS is a TypeScript workspace for adding human-origin policy to MCP tools. The
public developer surface has three layers:

1. `service.hors()` wraps a server tool with a declarative policy.
2. `createHORSClient()` signs outbound MCP `tools/call` requests.
3. `hors` provides the same flow as an operator- and agent-friendly CLI.

The remaining packages supply shared protocol types, World assurance, ENS and
0G reads, and verified execution.

## Installation model

The packages are private workspace packages in the current prototype. Clone and
build the repository rather than installing them from npm:

```bash
git clone https://github.com/cqlyj/HORS.git
cd HORS
corepack enable
pnpm install
pnpm build
pnpm check-types
```

For CLI use:

```bash
cd packages/hors-cli
pnpm link --global
hors --version
```

From the repository root, `pnpm hors <command>` runs the built CLI without a
global link.

## Package map

| Package | Primary exports |
| --- | --- |
| `hors-core` | `FunctionPolicy`, `HORSServerConfig`, `HORSManifestBody`, `hashArguments`, `evaluatePolicy`, error codes, replay stores, HORSRegistry ABI |
| `hors-server` | `createHORS`, storage helpers, enrollment helpers, diagnostics |
| `hors-client` | `createHORSClient`, `discoverHORSService`, `readServicePolicy`, `downloadAndVerifyPolicy`, `extractHorsMeta` |
| `hors-assurance` | Selfie and Identity adapters, RP signing, signal helpers, nullifier store |
| `hors-executor-0g` | `createExecutor` and 0G execution/result types |
| `hors-cli` | `hors` binary and stdio MCP bridge |

## Policy model

Every protected function declares a `FunctionPolicy`:

```ts
interface FunctionPolicy {
  origin: "same-human" | "any-human" | "public";
  assurance?: "none" | "selfie" | "identity";
  executor?: "local" | "0g";
  identityAttributes?: Array<{ type: string; value: number }>;
  agentCallable?: boolean;
}
```

### Origin

| Value | Meaning |
| --- | --- |
| `same-human` | Caller must be a registered agent whose AgentBook `humanId` equals the service owner's |
| `any-human` | Caller must carry a valid HORS request and resolve through AgentBook, but may belong to another human |
| `public` | With no assurance requirement, the handler can run without a HORS header |

`same-human` is the normal policy for private personal services.

### Assurance

| Value | Meaning |
| --- | --- |
| `none` or omitted | No World step-up after the origin decision |
| `selfie` | Require a call-bound Selfie Check before execution |
| `identity` | Require a call-bound Identity Check before execution |

The server uses MCP `inputRequired` and authenticated `requestState` for the
human handoff. A resumed call must match the original caller, function,
arguments, call ID, World action, and signal.

### Executor

| Value | Meaning |
| --- | --- |
| `local` or omitted | The handler can complete locally |
| `0g` | The handler must execute through the registered `0g` executor and return its invocation-bound receipt |

When `executor: "0g"` is set, missing, unverified, mismatched, or forged receipts
fail with `HORS_EXECUTION_UNVERIFIED`.

### Agent callable

`agentCallable` defaults to `true`. Setting it to `false` rejects every agent
request before origin or handler execution:

```ts
service.hors(
  "vault.exportCredentials",
  { origin: "same-human", agentCallable: false },
  exportHandler,
);
```

This is useful for explicitly documenting a service function that exists for a
human-only surface but must never cross an agent boundary.

## Server integration

Create the service once, pass its `stateVerify` function to the MCP server, and
wrap each protected tool:

```ts
import { createHORS } from "hors-server";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";

const horsService = await createHORS({
  humanOrigin: process.env.OWNER_HUMAN_ID as `0x${string}`,
  domain: process.env.HORS_DOMAIN ?? "finance.alice.eth",
  stateKey: process.env.HORS_STATE_KEY,
});

const handler = createMcpHandler(() => {
  const server = new McpServer(
    { name: "finance-service", version: "1.0.0" },
    {
      capabilities: { tools: {} },
      requestState: { verify: horsService.context.stateVerify },
    },
  );

  server.registerTool(
    "finance.canCommit",
    {
      description: "Evaluate a commitment without returning finance state",
      inputSchema: z.object({
        amount: z.number(),
        currency: z.string(),
        purpose: z.string(),
      }),
    },
    horsService.hors(
      "finance.canCommit",
      { origin: "same-human" },
      async (args) => ({
        content: [
          {
            type: "text",
            text: JSON.stringify(await evaluateCommitment(args)),
          },
        ],
      }),
    ),
  );

  return server;
});
```

`createHORS()` is asynchronous and returns one `HORSService`. There is no
standalone `createHORSAuth()` or imported `hors()` function in the current API.

### Server configuration

```ts
interface HORSServerConfig {
  humanOrigin: `0x${string}`;
  domain: string;
  manifest?: HORSManifestBody;
  policyContentHash?: `0x${string}`;
  policyVersion?: number;
  stateKey?: Uint8Array | string;
  stores?: {
    nonce?: ReplayStore;
    callId?: ReplayStore;
    stepUp?: ReplayStore;
    nullifier?: ReplayStore;
  };
  executors?: Record<string, HORSExecutor>;
  assurance?: {
    rpId: string;
    signingKey: string;
    appId?: string;
    environment?: "production" | "staging";
    verifyUrl?: string;
  };
  registry?: {
    chain: "0g-galileo";
    storage?: StorageConfig;
    enrollmentStorageRoot?: `0x${string}`;
  };
}
```

Important configuration behavior:

- `humanOrigin` and `domain` are required.
- Use a stable secret `stateKey` of at least 32 bytes when step-up must survive a
  process restart or be accepted by more than one replica.
- When `manifest` is supplied, every inline policy is checked against it at tool
  registration time. HORS also computes and enforces its content hash.
- Register every non-local executor under the same key used by the policy.
- Add `assurance` only when Selfie or Identity functions are exposed.
- Custom replay stores let a deployment replace the in-memory defaults with
  durable, shared state.

## Client integration

`createHORSClient()` wraps an MCP transport. The wrapper only modifies
`tools/call`; normal MCP negotiation and other request types pass through.

```ts
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createHORSClient, discoverHORSService } from "hors-client";

const discovered = await discoverHORSService("finance.alice.eth");

const hors = createHORSClient({
  signer: {
    address: account.address,
    signMessage: ({ message }) => account.signMessage({ message }),
  },
  domain: "finance.alice.eth",
  policyContentHash,
});

const client = new Client({ name: "travel-agent", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(
  new URL(discovered.endpoint),
);

await client.connect(hors.wrapTransport(transport));
const result = await client.callTool({
  name: "finance.canCommit",
  arguments: {
    amount: 850,
    currency: "EUR",
    purpose: "Lisbon trip",
  },
});
```

The default signing chain identifier is World Chain mainnet (`480`). It can be
overridden with `chainId` in the client config when needed.

### Signed request resources

The wrapper creates a fresh nonce and call ID for each invocation and signs a
SIWE-compatible AgentKit message with:

```text
hors://args/<canonical-args-hash>
hors://policy/<policy-content-hash>
hors://callId/<uuid>
```

The arguments hash is recursive and deterministic: object keys are sorted at
every nesting level before hashing. The server hashes the MCP-validated
arguments again and rejects any mismatch.

When a server loads a non-zero policy content hash, the caller must sign that
same hash. `hors list-functions --refresh` verifies and caches the published
manifest for inspection; applications using `hors-client` directly can pass
the on-chain value to `createHORSClient()`.

## ENS discovery

```ts
import { discoverHORSService } from "hors-client";

const service = await discoverHORSService("openagents.eth", optionalSepoliaRpc);
// {
//   endpoint: "https://…/mcp",
//   context: "Call Home vault — …",
//   ensName: "openagents.eth",
//   serviceId: "0x…",
//   registryAddress: "0x86B7…f7b9",
//   registrationVerified: true
// }
```

The resolver reads live Sepolia text records:

- `agent-endpoint[mcp]` (ENSIP-26)
- `agent-context` (ENSIP-26)
- `hors.service-id` (HORS service registration discovery)

No endpoint or service identity fallback is invented. Discovery throws if
`agent-endpoint[mcp]` or `hors.service-id` is absent or malformed. The client
reads the service owner from the canonical HORSRegistry on 0G Galileo and
requires the published ID to equal
`keccak256(owner, keccak256(normalizedEnsName))` before returning it.

## HORSRegistry and Storage

Read the compact service record and policies from 0G Galileo:

```ts
import {
  readServicePolicy,
  downloadAndVerifyPolicy,
} from "hors-client";

const { service, policies } = await readServicePolicy(
  serviceId,
  registryAddress,
);

const { manifest } = await downloadAndVerifyPolicy(
  service.policyStorageRoot,
  service.policyContentHash,
);
```

`downloadAndVerifyPolicy()` asks the 0G Storage indexer for a proof-bearing
download, parses the manifest, hashes the exact bytes, and rejects a content
hash mismatch.

The `examples/call-home/enroll.ts` script:

1. builds the `HORSManifestBody`;
2. uploads it to 0G Storage;
3. calculates its content hash and Storage root;
4. registers or updates the service in HORSRegistry; and
5. writes the resulting service ID to the example's local `.env`.

This publishes policy evidence. The Call Home service still uses its inline
policies for runtime enforcement.

## World assurance

Add RP credentials to the server:

```ts
const service = await createHORS({
  humanOrigin,
  domain,
  stateKey,
  assurance: {
    rpId: process.env.WORLD_RP_ID!,
    signingKey: process.env.WORLD_SIGNING_KEY!,
    appId: process.env.WORLD_APP_ID,
    environment: "production",
  },
});
```

Then declare assurance on the function:

```ts
service.hors(
  "vault.borrow",
  { origin: "same-human", assurance: "selfie" },
  borrowHandler,
);
```

For a visible terminal, `hors call` handles the human loop:

1. receive the MCP `inputRequired` challenge;
2. render the World App QR;
3. poll for the IDKit result;
4. submit the proof through MCP `inputResponses`; and
5. resume with the authenticated `requestState`.

The server verifies the returned API result, expected credential, action,
identifier, nullifier, and signal. Proof nullifiers and completed step-up state
are replay-protected.

The stdio `hors mcp` bridge deliberately does not scan or approve on behalf of a
human. It returns the challenge so its host can perform an explicit human
handoff.

## 0G verified execution

Create and register the executor:

```ts
import { createExecutor } from "hors-executor-0g";
import { createHORS } from "hors-server";

const zeroG = createExecutor({
  apiKey: process.env.OG_ROUTER_API_KEY!,
  model: process.env.OG_MODEL ?? "qwen2.5-omni",
  trustMode: "verified",
  verifyTee: true,
});

const service = await createHORS({
  humanOrigin,
  domain,
  executors: { "0g": zeroG },
});
```

The protected handler must obtain its executor through the invocation-bound
context and return the receipt unchanged:

```ts
service.hors(
  "vault.borrow",
  { origin: "same-human", assurance: "selfie", executor: "0g" },
  async (args, _mcpContext, horsContext) => {
    const { result, receipt } = await horsContext
      .executor("0g")
      .execute(buildPrompt(args), privateSystemPrompt, {
        responseFormat: { type: "json_object" },
      });

    return {
      content: [{ type: "text", text: result.content }],
      _horsReceipt: receipt,
    };
  },
);
```

The text block must remain identical to `result.content` because HORS validates
the response content hash against the receipt.

The adapter understands the 0G Router's OpenAI-compatible chat interface,
provider metadata, `tee_verified`, request ID, and optional billing/usage
fields. It maps provider unavailability to `HORS_NO_PROVIDER` and missing or
failed verification to `HORS_EXECUTION_UNVERIFIED`.

For stronger verification, provide `independentVerifier(provider, chatId,
content)`. The callback can use `@0gfoundation/0g-compute-ts-sdk` to verify the
provider response and compare signed output with the returned content.

## CLI reference

```text
hors connect [--fresh] [--profile <name>]
hors status
hors services [ens-name] [--endpoint <url>]
hors list-functions <service> [--refresh]
hors call <service> <function> '<json>'
hors watch
hors mcp
hors disconnect
```

Typical sequence:

```bash
hors connect --fresh
hors services openagents.eth
hors list-functions openagents.eth --refresh
hors call openagents.eth home.balance '{}'
hors call openagents.eth home.borrow \
  '{"recipientAddress":"0xYourFreshWallet"}'
```

`hors connect` and assurance-gated `hors call` commands belong in a visible
human terminal because they render World App QR codes. Connector material is
stored under `~/.hors`; the CLI does not print the private key.

`hors disconnect` clears that local profile, keystore, service cache, and trace,
so agents should not run it without explicit human confirmation.

## Diagnostics and errors

HORS attaches structured diagnostic metadata under MCP `_meta.hors`. The client
exposes the latest diagnostic through `lastDiagnostic` and
`extractHorsMeta(result)`.

| Code | JSON-RPC code | Meaning |
| --- | ---: | --- |
| `HORS_EXECUTED` | `0` | Policy admitted the call and the handler completed |
| `HORS_ORIGIN_MISMATCH` | `-32001` | Missing/invalid human origin or wrong service owner |
| `HORS_ASSURANCE_REQUIRED` | `-32002` | Selfie or Identity step-up is required or incomplete |
| `HORS_FUNCTION_FORBIDDEN` | `-32003` | Function is not agent-callable or signed resources do not match |
| `HORS_EXECUTION_UNVERIFIED` | `-32004` | Required executor receipt is absent, mismatched, or not TEE-verified |
| `HORS_NO_PROVIDER` | `-32005` | No 0G provider is available for the requested model/trust mode |

Denials are returned as MCP tool errors with the exact HORS code and diagnostic
context. Callers should preserve these codes rather than collapsing them into a
generic failure.

## Agent skill

Install the bundled operating skill with:

```bash
npx skills add https://github.com/cqlyj/HORS --skill use-hors-cli
```

Or expose it to Codex directly:

```bash
mkdir -p "$HOME/.agents/skills"
ln -s "$(pwd)/skills/use-hors-cli" "$HOME/.agents/skills/use-hors-cli"
```

The skill instructs an agent to inspect policy before calling, use exact
argument schemas, preserve the World App handoff, avoid printing proofs or
private keys, and require confirmation for external side effects.

## Reference implementations

- [`examples/hello-hors`](../examples/hello-hors/) — minimal same-human policy.
- [`examples/call-home`](../examples/call-home/) — ENS, World assurance,
  HORSRegistry, 0G Storage, verified execution, and a token transfer.
- [`draft/SPEC.md`](../draft/SPEC.md) — wire and policy specification.
