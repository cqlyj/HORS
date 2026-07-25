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

async function main() {
  const ownerKey = process.env.OWNER_PRIVATE_KEY as `0x${string}` | undefined;
  const ensName = process.env.ENS_NAME;
  const endpoint = process.env.ENDPOINT ?? process.argv[2];
  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? DEFAULT_SEPOLIA_RPC;

  if (!ownerKey || !ensName) {
    throw new Error("Missing OWNER_PRIVATE_KEY or ENS_NAME");
  }
  if (!endpoint) {
    throw new Error(
      "Missing ENDPOINT (set env ENDPOINT or pass as CLI arg, e.g. https://xxx.ngrok.io/mcp)",
    );
  }

  const account = privateKeyToAccount(ownerKey);
  const normalizedName = normalize(ensName);
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

  console.log("\nDone. ENSIP-26 records set on Sepolia.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
