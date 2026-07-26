# Call Home

A HORS-protected personal vault MCP service. You're in a coffee shop, need 0G
tokens for LLM inference, and ask your home vault to lend them without exposing
the vault's private rules or credentials.

## What this service protects

Four tools, four policy tiers:

| Tool                     | Policy                                | Behavior                                         |
| ------------------------ | ------------------------------------- | ------------------------------------------------ |
| `home.balance`           | `same-human`                          | Read vault balance, policies, and borrow history |
| `home.borrow`            | `same-human` + `selfie` + `0g`        | Borrow up to 0.01 0G after selfie + TEE approval |
| `home.emergency`         | `same-human` + `identity` + `0g`      | Higher limit (0.1 0G) after document-backed step-up |
| `home.exportCredentials` | `same-human` + `agentCallable: false` | Always forbidden (`HORS_FUNCTION_FORBIDDEN`)     |

## Prerequisites

- Node.js 20+ and Corepack
- [World App](https://world.org/world-app) with Orb-verified World ID
- 0G testnet tokens for storage/registry and vault funding ([faucet](https://faucet.0g.ai))
- 0G Router API key from [pc.testnet.0g.ai](https://pc.testnet.0g.ai)
- World RP credentials from [developer.world.org](https://developer.world.org)
- ENS name on Sepolia with owner wallet control

## One-time setup

### 1. Initialize

```bash
cd examples/call-home
make init
# → Installs dependencies and builds all packages
# → Links `hors` CLI globally
# → Creates .env from .env.example (if needed)
```

### 2. Fill in credentials

Edit `.env` with your keys:

- `OWNER_HUMAN_ID` — your AgentBook humanId
- `OWNER_PRIVATE_KEY` — owner wallet (registers service + sends borrowed tokens)
- `STORAGE_SIGNER_PRIVATE_KEY` — 0G Storage signer (needs testnet funds)
- `ENS_NAME` — your ENS name (e.g. `openagents.eth`)
- `OG_ROUTER_API_KEY` — 0G Router API key for verified TEE inference
- `WORLD_RP_ID`, `WORLD_SIGNING_KEY`, `WORLD_APP_ID` — World RP credentials

### 3. Publish policy and register the service

```bash
make setup
# → Uploads policy manifest to 0G Storage
# → Registers service on HORSRegistry
# → Auto-writes HORS_SERVICE_ID to .env
```

### 4. Set ENS records

```bash
make expose                    # Terminal B — get a public URL
make set-ens ENDPOINT=https://xxx.ngrok-free.app/mcp
# → Sets ENSIP-26 endpoint/context plus the HORS service ID on Sepolia
# → Resolves the records back and verifies the registry binding
```

## Demo script

**Narrative:** _"I'm in a coffee shop in Lisbon. I need 0G tokens for LLM
inference but can't get faucet tokens. I create a fresh agent, prove it belongs
to my human origin, and ask my home vault to lend me tokens."_

### Before the demo

```bash
# Terminal A
make server

# Terminal B — uses --host-header=rewrite so MCP accepts the tunnel Host
make expose

# Terminal C
hors watch
```

If you run ngrok manually, either use `--host-header=rewrite` or set
`ALLOWED_HOSTS=<your-ngrok-host>` in `.env` and restart the server. Without one
of those, calls fail with `Invalid Host: ….ngrok-free.app`.

### Step 1 — Establish human origin (your terminal)

```bash
hors connect --fresh
```

Scan the QR with World App. Output ends with:

```
✓ Human origin verified
✓ Profile saved to ~/.hors/profile.json
```

### Step 2 — Agent calls home

Discover the service. ENS supplies the endpoint and HORS service ID; the client
verifies that ID against the canonical registry before caching anything:

```bash
hors services openagents.eth
```

After scanning, tell your AI agent:

> I'm in a coffee shop and need 0G tokens. Discover openagents.eth and borrow
> tokens to my fresh wallet.

The agent runs:

```bash
hors status
hors services openagents.eth
hors list-functions openagents.eth --refresh
hors call openagents.eth home.balance '{}'
hors call openagents.eth home.borrow '{"recipientAddress":"0xFresh..."}'
```

`home.borrow` triggers a selfie step-up → scan the QR → TEE evaluates the
request → native 0G tokens arrive on-chain (Galileo testnet).

### Policy denial demo

```bash
# 1. Forbidden credentials export — even the owner is rejected
hors call openagents.eth home.exportCredentials '{}'
# → HORS_FUNCTION_FORBIDDEN
```

Use [`hello-hors`](../hello-hors/README.md) for a deterministic same-human
versus unrelated-wallet origin test. `hors connect --skip-register` is not an
outsider profile: the CLI correctly refuses to save a connected profile without
an AgentBook `humanId`.

## Reset for re-demo

```bash
make reset
# → Clears ~/.hors/ (wallet, profile, service cache)
# → AgentBook registration is on-chain (persistent)
# → Service registration is on-chain (persistent)
```

Then repeat from Step 1 — `hors connect --fresh`, scan QR, prompt your agent again.

## Local development (without ENS)

```bash
make server

# In another terminal:
hors connect --fresh
# (scan QR)

hors services openagents.eth \
  --endpoint http://127.0.0.1:3200/mcp

hors call openagents.eth home.balance '{}'
hors call openagents.eth home.borrow '{"recipientAddress":"0xYourAddress"}'
```

## Environment variables

| Variable                     | Used by                      | Description                                                                     |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| `OWNER_HUMAN_ID`             | Server                       | Owner's AgentBook `humanId` (same human as the connector that will call)        |
| `HORS_DOMAIN`                | Server                       | Domain in `Hors-Authorization` headers clients sign (default: `openagents.eth`) |
| `PORT`                       | Server                       | HTTP listen port (default: `3200`)                                              |
| `OWNER_PRIVATE_KEY`          | Server, `make setup`         | Owner wallet — registers service and sends borrowed tokens                      |
| `OG_ROUTER_API_KEY`          | Server                       | 0G Router API key for verified TEE inference                                    |
| `OG_MODEL`                   | Server                       | 0G model name (default: `qwen2.5-omni`)                                         |
| `WORLD_RP_ID`                | Server                       | World RP ID for selfie/identity step-up                                         |
| `WORLD_SIGNING_KEY`          | Server                       | World RP signing key                                                            |
| `WORLD_APP_ID`               | Server                       | World App ID for assurance flows                                                |
| `ENS_NAME`                   | `make setup`, `make set-ens` | ENS name used for service ID derivation and text records                        |
| `STORAGE_SIGNER_PRIVATE_KEY` | `make setup`                 | 0G Storage signer key (needs testnet funds)                                     |
| `HORS_SERVICE_ID`            | `make setup`, `make set-ens` | Auto-written to `.env` and published as the `hors.service-id` ENS text record   |
| `ENDPOINT`                   | `make set-ens`               | Public MCP URL (pass as arg: `make set-ens ENDPOINT=...`)                       |

## Evidence mode versus local mode

For a sponsor-demo run, set `OG_ROUTER_API_KEY` and confirm the HORS diagnostic
contains a real 0G provider address plus `teeVerified: true`. The server uses
0G Router `verified` trust mode with `verify_tee` enabled.

When `OG_ROUTER_API_KEY` is absent, the example uses `provider: "demo-local"` so
the surrounding policy and UI flow can be developed offline. That local result
is a simulation and must not be presented as 0G Compute or TEE evidence.

## Related documentation

- [HORS architecture](../../docs/ARCHITECTURE.md)
- [SDK guide](../../docs/SDK.md)
- [Selfie Check testing](../../docs/SELFIE_TESTING.md)
- [Identity Check testing](../../docs/IDENTITY_TESTING.md)
