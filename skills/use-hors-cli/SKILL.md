---
name: use-hors-cli
description: Operate HORS-protected services through the `hors` shell CLI without configuring the `hors mcp` bridge. Use when a user asks an agent to check or establish a HORS connector profile, discover an ENS service or local endpoint, inspect HORS function policies, call a protected function, demonstrate same-human authorization, or continue work from a HORS service. Preserve the human boundary for World App QR registration and assurance.
---

# Use HORS CLI

Use direct shell commands. Do not start or configure `hors mcp`; `hors call`
already speaks MCP to the remote service behind the CLI.

## Follow the workflow

### 1. Check the CLI and profile

Prefer the installed binary:

```bash
command -v hors
hors --version
hors status
```

If `hors` is unavailable but the current repository is HORS, use
`pnpm hors <command>`. Do not install, build, or globally link the CLI unless the
user asks.

### 2. Hand QR registration to the human

If `hors status` says the profile is not connected, stop automation and ask the
user to run one of these commands in their own visible terminal:

```bash
hors connect --fresh  # create and register a new connector wallet
hors connect          # reuse and register the existing connector wallet
```

Use `--fresh` only when the user explicitly wants a new wallet; it replaces the
current connector keystore. Tell the user to scan the displayed QR with World
App and wait for the command to report that the profile was saved.

Do not run `hors connect` for the user. The registration subprocess inherits the
human terminal, and the human must see and scan its QR. Wait for the user to
confirm completion, then run `hors status` again. Never request, read, or print
the connector private key.

The current CLI combines wallet creation and QR registration in `hors connect`;
do not claim that the agent created the wallet separately.

### 3. Discover and cache the service

For ENS discovery:

```bash
hors services <ens-name>
```

For a user-provided local demo endpoint:

```bash
hors services <service-name> --endpoint <mcp-url>
```

Add `--service-id <bytes32>` and `--registry <address>` only when the user or
trusted project configuration provides those values. Do not invent identifiers,
addresses, endpoints, or ENS names.

### 4. Inspect policy before calling

```bash
hors list-functions <service>
```

Use `--refresh` when current on-chain policy evidence matters. Treat the policy
as on-chain verified only when the command explicitly says `verified`. Do not
call a function whose policy says `agentCallable false`.

Do not infer a function's JSON argument keys from its name, description, or
policy. `hors list-functions` currently displays policy but not the MCP input
schema. Resolve the schema from trusted service documentation or source before
calling. If no schema is available, ask the user instead of inventing fields.

The current direct CLI can verify and display a cached service manifest, but
`hors call` does not yet attach the cached on-chain policy hash to its signed
request. If a service rejects the zero/default policy hash, report the mismatch;
do not bypass it.

### 5. Call the function

Serialize arguments as one JSON object and quote them as a single shell
argument:

```bash
hors call <service> <function> '{"key":"value"}'
```

If the inspected policy requires `selfie` or `identity`, do not execute this
command as the agent. Render the complete, shell-quoted command for the user to
run in their own visible terminal and pause. See the assurance handoff below.

Before a call with financial, destructive, publication, privacy, or other
external side effects, obtain confirmation unless the user's request already
authorizes that exact action.

Count a call as successful only when the command exits successfully and prints
`HORS_EXECUTED`. Report HORS denial codes exactly. Do not reinterpret
`HORS_ORIGIN_MISMATCH`, `HORS_FUNCTION_FORBIDDEN`,
`HORS_EXECUTION_UNVERIFIED`, or `HORS_NO_PROVIDER` as success.

If the server returns `Arguments hash mismatch — signed arguments do not match
request`, treat it first as an input-schema mismatch: an unknown key may have
been stripped during MCP input validation after the CLI signed the original
arguments. Recheck the exact field names and retry only with a trusted schema.
Do not describe this error as proof that the function itself is forbidden.

### 6. Preserve the assurance handoff

When policy inspection shows `assurance selfie` or `assurance identity`, hand
the exact `hors call` command to the user before initiating the call. Explain
that the user must run it in their visible terminal because the human owns the
World App assurance interaction. Never fabricate a proof or scan a QR on the
user's behalf.

If the goal is only to demonstrate policy enforcement, ask the user to run the
command and confirm that it prints `Step-up required` with the expected
assurance type. That is a successful gate demonstration, not a completed
function execution.

The current direct CLI prints a challenge and `requestState`, but it has no
dedicated `approve` command and does not render or complete the Selfie/Identity
QR flow. If the user wants full completion, require an already configured
human-facing assurance client. Otherwise stop after the gate demonstration and
state that current limitation plainly.

Do not ask the user to paste raw proof JSON or `requestState` into chat. Do not
put proof JSON in a command line; `--proof` exposes it through shell history and
process arguments. Let the user-visible assurance client own the proof and the
resumed call.

### 7. Present the demo result

For the Call Home vault demo, use this sequence after the service name is known.
If `hors list-functions` reports no serviceId, cache it first from the example
`.env` (`HORS_SERVICE_ID` / `HORS_REGISTRY_ADDRESS`) via
`hors services <service> --service-id <hex> --registry <hex>`, then refresh:

```bash
hors status
hors services <service>
hors list-functions <service> --refresh
hors call <service> home.balance '{}'
```

Explain the boundary accurately: the user performed World App registration;
the agent then discovered the service, inspected policy, signed the exact call,
and invoked it through the CLI.

For Call Home assurance-gated demos (`home.borrow` selfie, `home.emergency`
identity), after confirming the policy, give the command to the user; do not
run it as the agent (the human must complete the QR step-up in a visible TTY):

```bash
hors call openagents.eth home.borrow '{"recipientAddress":"0xYourFreshWallet"}'
# or
hors call openagents.eth home.emergency '{"recipientAddress":"0xYourFreshWallet","amount":"0.1","reason":"..."}'
```

In a visible terminal the CLI should render a World App QR and wait. Do not
claim `HORS_EXECUTED` unless that flow completes and the resumed call returns
that status.

Use `hors watch` only when the user wants a live trace terminal. It is
long-running. Never run `hors disconnect` without explicit confirmation because
it recursively deletes the profile, service cache, trace, and connector
keystore under `~/.hors`.

## Respect current CLI constraints

- Do not use `--password` for this demo revision: follow-up `hors call` cannot
  provide the password to unlock the keystore.
- Do not use `--skip-register` to simulate an outsider; an unregistered wallet
  does not produce a connected profile.
- Do not describe direct CLI usage as avoiding MCP entirely. It avoids an MCP
  tool installation in the agent, while `hors call` still uses MCP over the
  network.
- Do not claim that a local fallback executor is a live 0G TEE. Report the
  provider and verification metadata printed by the call.
