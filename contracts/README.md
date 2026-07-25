# Foundry — HORSRegistry

Solidity contracts for the HORS on-chain registry. Foundry loads `.env` automatically when you run `forge` from this directory.

## Setup

```bash
cp .env.example .env
# Edit .env — set PRIVATE_KEY=0x... (burner wallet on testnet only)
```

`.env` is gitignored. Never commit real keys.

## Build

```bash
forge build
pnpm abi   # export ABI to packages/hors-core/abi/
```

## Deploy (0G Galileo, chain 16602)

Dry run (simulation only, no gas):

```bash
forge script script/DeployHORSRegistry.s.sol --rpc-url galileo -vvvv
```

Broadcast (requires testnet OG from https://faucet.0g.ai):

```bash
forge script script/DeployHORSRegistry.s.sol \
  --rpc-url galileo \
  --broadcast \
  --legacy \
  --gas-price 3000000000 \
  -vvvv
```

`--legacy` is required on 0G — the chain does not support EIP-1559. See [0G deploy docs](https://docs.0g.ai/developer-hub/building-on-0g/contracts-on-0g/deploy-contracts).

## Verify on Chainscan

```bash
forge verify-contract <DEPLOYED_ADDRESS> src/HORSRegistry.sol:HORSRegistry \
  --chain-id 16602 \
  --verifier blockscout \
  --verifier-url https://chainscan-galileo.0g.ai/open/api
```

Omit `--watch` on 0G — status polling is incompatible with their Blockscout API. Check verification manually on the explorer after ~30s.

## Network

| Parameter | Value                                                            |
| --------- | ---------------------------------------------------------------- |
| Chain ID  | 16602                                                            |
| RPC       | `https://evmrpc-testnet.0g.ai` (alias `galileo` in foundry.toml) |
| Explorer  | https://chainscan-galileo.0g.ai                                  |
