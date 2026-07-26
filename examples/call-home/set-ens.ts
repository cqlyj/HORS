import "dotenv/config";
import {
  createWalletClient,
  createPublicClient,
  http,
  zeroAddress,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { namehash, normalize } from "viem/ens";
import {
  discoverHORSService,
  HORS_SERVICE_ID_TEXT_KEY,
  parseHORSServiceId,
} from "hors-client";

/** ENS Registry on Sepolia / mainnet */
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as const;

const registryAbi = [
  {
    name: "resolver",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
] as const;

const resolverAbi = [
  {
    name: "setText",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const AGENT_CONTEXT =
  "Call Home vault — borrow 0G tokens with HORS human verification";

/** Avoid viem's default thirdweb public RPC (strict 429 rate limits). */
const DEFAULT_SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Prefer explicit CLI arg over env so `make set-ens ENDPOINT=...` wins cleanly. */
function resolveEndpoint(): string {
  const raw = process.argv[2] ?? process.env.ENDPOINT;
  if (!raw) {
    throw new Error(
      "Missing ENDPOINT (set env ENDPOINT or pass as CLI arg, e.g. https://xxx.ngrok-free.app/mcp)",
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `Invalid ENDPOINT URL: ${raw}\n` +
        `Expected a full http(s) URL, e.g. https://xxx.ngrok-free.app/mcp`,
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `Invalid ENDPOINT scheme "${url.protocol}//" in ${raw}\n` +
        `Use https:// (not hthttps:// or another scheme).`,
    );
  }

  return raw;
}

async function main() {
  const ownerKey = process.env.OWNER_PRIVATE_KEY as `0x${string}` | undefined;
  const ensName = process.env.ENS_NAME;
  const endpoint = resolveEndpoint();
  const serviceIdValue = process.env.HORS_SERVICE_ID;
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? DEFAULT_SEPOLIA_RPC;

  if (!ownerKey || !ensName || !serviceIdValue) {
    throw new Error(
      "Missing OWNER_PRIVATE_KEY, ENS_NAME, or HORS_SERVICE_ID. Run `make setup` before `make set-ens`.",
    );
  }

  const account = privateKeyToAccount(ownerKey);
  const normalizedName = normalize(ensName);
  const serviceId = parseHORSServiceId(serviceIdValue);
  const node = namehash(normalizedName);
  const transport = http(rpcUrl);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport,
  });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport,
  });

  // Read the name's resolver from the ENS Registry. Do not use
  // getEnsResolver() — on Sepolia it can return a Universal Resolver
  // address that rejects setText for this node.
  const resolverAddress = await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: registryAbi,
    functionName: "resolver",
    args: [node],
  });
  if (resolverAddress === zeroAddress) {
    throw new Error(
      `No resolver set for ${normalizedName}. Set one in the ENS app first.`,
    );
  }

  console.log("ENS name:", ensName);
  console.log("Resolver:", resolverAddress);
  console.log("RPC:", rpcUrl);
  console.log("Endpoint:", endpoint);

  const records: Array<{ key: string; value: string }> = [
    { key: "agent-endpoint[mcp]", value: endpoint },
    { key: "agent-context", value: AGENT_CONTEXT },
    { key: HORS_SERVICE_ID_TEXT_KEY, value: serviceId },
  ];

  for (const [i, { key, value }] of records.entries()) {
    if (i > 0) await sleep(1_500);

    const current = await publicClient
      .getEnsText({ name: normalizedName, key })
      .catch(() => null);
    if (current === value) {
      console.log(`${key}: already set, skipping`);
      continue;
    }

    const hash = await walletClient.writeContract({
      address: resolverAddress,
      abi: resolverAbi,
      functionName: "setText",
      args: [node, key, value],
      chain: sepolia,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`${key} tx:`, hash);
  }

  const discovered = await discoverHORSService(normalizedName, rpcUrl);
  console.log("\nDone. ENS service records set and verified on Sepolia.");
  console.log("Service ID:", discovered.serviceId);
  console.log("Registry:", discovered.registryAddress);
  console.log("Binding verified:", discovered.registrationVerified);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
