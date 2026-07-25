import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createWalletClient,
  createPublicClient,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createExecutor } from "hors-executor-0g";
import { zeroGGalileo } from "hors-client";
import type { HORSExecutor } from "hors-core";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Vault state ---

export interface VaultPolicy {
  maxPerRequest: string;
  dailyLimit?: string;
  assurance: string;
  description: string;
}

export interface VaultState {
  policies: {
    borrow: VaultPolicy;
    emergency: VaultPolicy;
  };
  ownerCredentials: {
    note: string;
    seedPhrase: string;
  };
}

export const vault: VaultState = JSON.parse(
  readFileSync(join(__dirname, "memory", "vault-state.json"), "utf8"),
);

// --- In-memory borrow ledger (resets on restart) ---

export interface BorrowRecord {
  address: string;
  amount: string;
  timestamp: number;
  type: "borrow" | "emergency";
}

export const ledger: BorrowRecord[] = [];

// --- Owner wallet for on-chain transfers ---

const ownerKey = process.env.OWNER_PRIVATE_KEY as `0x${string}` | undefined;

export const ownerAccount = ownerKey
  ? privateKeyToAccount(ownerKey)
  : undefined;

export const ownerWalletClient: WalletClient | undefined = ownerAccount
  ? createWalletClient({
      account: ownerAccount,
      chain: zeroGGalileo,
      transport: http(),
    })
  : undefined;

export const publicClient: PublicClient = createPublicClient({
  chain: zeroGGalileo,
  transport: http(),
});

// --- 0G Executor ---

function createDemoExecutor(): HORSExecutor {
  console.warn(
    "[call-home] OG_ROUTER_API_KEY not set — using demo local executor",
  );
  return {
    async execute(prompt, systemPrompt) {
      const lower = `${systemPrompt ?? ""}\n${prompt}`.toLowerCase();
      if (lower.includes("emergency")) {
        return {
          content: JSON.stringify({
            approved: true,
            reason: "Emergency request approved — identity verified",
          }),
          teeVerified: true,
          provider: "demo-local",
        };
      }
      return {
        content: JSON.stringify({
          approved: true,
          reason: "Within daily limit — borrow approved",
        }),
        teeVerified: true,
        provider: "demo-local",
      };
    },
  };
}

export const executor: HORSExecutor = process.env.OG_ROUTER_API_KEY
  ? createExecutor({
      apiKey: process.env.OG_ROUTER_API_KEY,
      trustMode: "verified",
      model: process.env.OG_MODEL ?? "qwen2.5-omni",
    })
  : createDemoExecutor();

// --- Assurance ---

export const assurance =
  process.env.WORLD_RP_ID && process.env.WORLD_SIGNING_KEY
    ? {
        rpId: process.env.WORLD_RP_ID,
        signingKey: process.env.WORLD_SIGNING_KEY,
        appId: process.env.WORLD_APP_ID,
      }
    : undefined;

if (!assurance) {
  console.warn(
    "[call-home] WORLD_RP_ID / WORLD_SIGNING_KEY not set — assurance step-ups will fail",
  );
}

// --- Server config ---

export const port = Number(process.env.PORT ?? 3200);
export const ownerHumanId = process.env.OWNER_HUMAN_ID as `0x${string}`;
export const domain = process.env.HORS_DOMAIN ?? "openagents.eth";
export const stateKey =
  process.env.HORS_STATE_KEY ?? "call-home-dev-key-min-32-bytes!!!";
