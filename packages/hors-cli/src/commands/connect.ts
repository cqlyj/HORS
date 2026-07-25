import chalk from "chalk";
import { spawn } from "node:child_process";
import { createAgentBookVerifier } from "@worldcoin/agentkit-core";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import {
  keystoreExists,
  loadKeystore,
  saveKeystore,
} from "../profile/keystore.js";
import { type HorsProfile, writeProfile } from "../profile/store.js";

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

async function pollHumanId(
  address: Address,
  timeoutMs = 5 * 60_000,
  intervalMs = 3_000,
): Promise<Hex> {
  const verifier = createAgentBookVerifier();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const humanId = await verifier.lookupHuman(address);
    if (humanId) return humanId as Hex;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    "Timed out waiting for AgentBook registration. Scan the QR in World App and retry `hors status`.",
  );
}

function runAgentkitRegister(address: Address): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(
      chalk.dim(
        `\nLaunching AgentBook registration for ${address}…\nScan the QR with World App.\n`,
      ),
    );
    const child = spawn(
      "npx",
      ["@worldcoin/agentkit-cli", "register", address],
      {
        stdio: "inherit",
        shell: true,
      },
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `agentkit-cli register exited with code ${code ?? "unknown"}`,
          ),
        );
    });
  });
}

export interface ConnectOptions {
  fresh?: boolean;
  password?: string;
  profileName?: string;
  skipRegister?: boolean;
}

export async function connectCommand(options: ConnectOptions): Promise<void> {
  const password = options.password ?? "";
  let privateKey: Hex;

  if (options.fresh || !keystoreExists()) {
    privateKey = generatePrivateKey();
    saveKeystore(privateKey, password);
    console.log(chalk.green("Generated new connector wallet"));
  } else {
    privateKey = loadKeystore(password);
    console.log(chalk.dim("Loaded connector wallet from keystore"));
  }

  const account = privateKeyToAccount(privateKey);
  const verifier = createAgentBookVerifier();
  let humanId = (await verifier.lookupHuman(account.address)) as Hex | null;

  if (!humanId) {
    if (options.skipRegister) {
      throw new Error(
        `Wallet ${account.address} is not registered in AgentBook. Re-run without --skip-register.`,
      );
    }
    await runAgentkitRegister(account.address);
    console.log(chalk.dim("Waiting for AgentBook confirmation…"));
    humanId = await pollHumanId(account.address);
  }

  const profile: HorsProfile = {
    humanId,
    connectorAddress: account.address,
    services: {},
    connectedAt: new Date().toISOString(),
    profileName: options.profileName,
  };
  writeProfile(profile);

  console.log("");
  console.log(
    chalk.bold(`Connected as ${chalk.cyan(`human://${shortAddr(humanId)}`)}`),
  );
  console.log("");
  console.log(`  ${chalk.dim("Connector wallet")}  ${account.address}`);
  console.log(`  ${chalk.dim("Wallet balance")}    0`);
  console.log(`  ${chalk.dim("AgentBook")}         human-backed`);
  console.log(
    `  ${chalk.dim("Human Origin")}     ${chalk.green("verified")} (${shortAddr(humanId)})`,
  );
  console.log("");
  console.log(
    chalk.dim(
      "Next: run `hors services <ens> [--endpoint <url>]` to discover a service",
    ),
  );
  console.log(chalk.green("Profile saved to ~/.hors/profile.json"));
}
