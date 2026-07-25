import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createAgentBookVerifier } from "@worldcoin/agentkit-core";
import { execSync } from "node:child_process";
import { writeFileSync, existsSync, readFileSync } from "node:fs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readEnvValue(key: string): string | undefined {
  if (!existsSync(".env")) return undefined;
  const match = readFileSync(".env", "utf8").match(
    new RegExp(`^${key}=(.+)$`, "m"),
  );
  return match?.[1]?.trim();
}

function writeEnv(values: Record<string, string>): void {
  const lines = [
    `OWNER_HUMAN_ID=${values.OWNER_HUMAN_ID ?? readEnvValue("OWNER_HUMAN_ID") ?? "0x..."}`,
    `AGENT_PRIVATE_KEY=${values.AGENT_PRIVATE_KEY}`,
    `HORS_DOMAIN=${values.HORS_DOMAIN ?? readEnvValue("HORS_DOMAIN") ?? "localhost"}`,
    `PORT=${values.PORT ?? readEnvValue("PORT") ?? "3100"}`,
  ];
  writeFileSync(".env", lines.join("\n") + "\n");
}

let privateKey = readEnvValue("AGENT_PRIVATE_KEY") as `0x${string}` | undefined;
privateKey ??= generatePrivateKey();

const account = privateKeyToAccount(privateKey);

// Persist the wallet immediately so a failed lookup never loses the key.
writeEnv({ AGENT_PRIVATE_KEY: privateKey });

const verifier = createAgentBookVerifier();
let humanId = await verifier.lookupHuman(account.address);

if (humanId) {
  console.log(`Agent ${account.address} is already registered.`);
} else {
  console.log(`Agent address: ${account.address}\n`);
  console.log("Scan the QR code with World App to register this agent:\n");

  execSync(`npx @worldcoin/agentkit-cli register ${account.address}`, {
    stdio: "inherit",
  });

  console.log(
    "\nLooking up humanId (AgentBook may take a few seconds to index)...",
  );
  for (let attempt = 1; attempt <= 12; attempt++) {
    humanId = await verifier.lookupHuman(account.address);
    if (humanId) break;
    console.log(`  attempt ${attempt}/12 — not indexed yet, retrying in 3s...`);
    await sleep(3000);
  }
}

if (!humanId) {
  console.error(
    "\nRegistration tx succeeded but humanId is not visible yet.",
    "Your wallet key is saved in .env — run `make register` again in a minute",
    "to finish without re-scanning the QR code.",
  );
  process.exit(1);
}

writeEnv({ AGENT_PRIVATE_KEY: privateKey, OWNER_HUMAN_ID: humanId });

console.log(`\nDone! humanId: ${humanId}`);
console.log(".env written. Run: make server");
