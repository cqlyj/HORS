# Hello HORS — From `cors()` to `hors()`

Protecting an MCP tool by human origin should take one wrapper.

This minimal example shows **origin policy only**: same-human agents can call a tool; everyone else is denied. No 0G, Selfie, Identity, or on-chain registry — just AgentBook + HORS.

```ts
// Express + CORS                          // MCP + HORS
app.use(cors({                             const service = await createHORS({
  origin: "https://alice.com",               humanOrigin: aliceHumanId,
}));                                       });

app.get("/balance", handler);              service.hors("canAfford", { origin: "same-human" }, handler)
```

## Prerequisites

- Node.js 20+
- pnpm (from the HORS repo root)
- [World App](https://world.org/world-app) with an **Orb-verified** World ID (needed once for AgentBook registration)

## Quick start

From the repo root:

```bash
pnpm install
pnpm build
cd examples/hello-hors
```

Then:

```bash
make register   # generates a wallet, shows a QR — scan with World App
make server     # Terminal 1 — MCP server on :3100
make client     # Terminal 2 — same-human vs stranger
```

Expected output:

```
-- From cors() to hors() --

  Same-human agent:      HORS_EXECUTED  -> yes
  Different-human agent: HORS_ORIGIN_MISMATCH
```

Reset and re-demo:

```bash
make reset
make register
```

## What the files are for

| File           | Role                                                           |
| -------------- | -------------------------------------------------------------- |
| `server.ts`    | The hero slide — one tool, one `hors()` policy                 |
| `client.ts`    | Two calls: owner (same human) and stranger (random wallet)     |
| `setup.ts`     | Boilerplate — `createHORS`, MCP HTTP wiring, `callTool` helper |
| `register.ts`  | One-shot AgentBook registration; writes `.env`                 |
| `.env.example` | Template for the four env vars `register` writes               |

Audience-facing signal lives in `server.ts` and `client.ts`. Everything else is infrastructure.

## How registration works

`make register`:

1. Generates an agent wallet (or reuses `AGENT_PRIVATE_KEY` from an existing `.env`)
2. Saves the private key immediately so a slow lookup never loses it
3. Runs `npx @worldcoin/agentkit-cli register <address>` (QR in the terminal)
4. Looks up `humanId` from AgentBook (with retries while the chain indexes)
5. Writes `.env` with `OWNER_HUMAN_ID`, `AGENT_PRIVATE_KEY`, domain, and port

If the CLI reports success but lookup is still empty, wait a minute and run `make register` again — it will skip the QR when the wallet is already registered.

## Environment

Written by `make register` — you should not need to edit manually:

| Variable            | Meaning                                           |
| ------------------- | ------------------------------------------------- |
| `OWNER_HUMAN_ID`    | AgentBook humanId for the registered agent wallet |
| `AGENT_PRIVATE_KEY` | Private key of that wallet                        |
| `HORS_DOMAIN`       | SIWE domain expected by the server (`localhost`)  |
| `PORT`              | HTTP port (default `3100`)                        |

Optional:

| Variable         | Meaning                                               |
| ---------------- | ----------------------------------------------------- |
| `HORS_ENDPOINT`  | Client MCP URL (default `http://127.0.0.1:$PORT/mcp`) |
| `HORS_STATE_KEY` | HMAC key for request state (≥32 bytes)                |

## Troubleshooting

| Symptom                                    | Fix                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `EADDRINUSE` on `:3100`                    | Stop the other process (`fuser -v 3100/tcp`) or set `PORT` / `HORS_ENDPOINT` in `.env` |
| `Missing AGENT_PRIVATE_KEY`                | Run `make register` first                                                              |
| `Registration not found` / humanId missing | Wait for AgentBook indexing, then `make register` again (key is already in `.env`)     |
| Owner call returns `HORS_ORIGIN_MISMATCH`  | Re-run `make register` so `OWNER_HUMAN_ID` matches the registered wallet               |
| Stranger call succeeds                     | It should not — check that the tool is wrapped with `{ origin: "same-human" }`         |

## Out of scope

This example intentionally omits ENS discovery, 0G executors, Selfie/Identity
step-up, and registry publication. Continue with the full [Call Home
example](../call-home/README.md).
