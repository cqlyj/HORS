import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  toBytes,
  toHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  HORSRegistryABI,
  type FunctionPolicy,
  type HORSManifestBody,
} from "hors-core";
import { createStorageClient, uploadPolicyManifest } from "hors-server";
import { zeroGGalileo, readServicePolicy } from "hors-client";

const REGISTRY_ADDRESS =
  (process.env.HORS_REGISTRY_ADDRESS as Hex | undefined) ??
  "0x86B773d98d3A7dfE6Cc785CA8F76f7A7Ca85f7b9";

function functionHash(name: string): Hex {
  return keccak256(toBytes(name));
}

function deriveServiceId(owner: Hex, ensName: string): Hex {
  const ensHash = keccak256(toBytes(ensName));
  return keccak256(encodePacked(["address", "bytes32"], [owner, ensHash]));
}

function policyToEntry(
  name: string,
  policy: FunctionPolicy,
): {
  functionHash: Hex;
  origin: number;
  assurance: number;
  executor: number;
} {
  const originMap = { "same-human": 0, "any-human": 1, public: 2 } as const;
  const assuranceMap = { none: 0, selfie: 1, identity: 2 } as const;
  const executorMap = { local: 0, "0g": 1 } as const;

  return {
    functionHash: functionHash(name),
    origin: originMap[policy.origin],
    assurance: assuranceMap[policy.assurance ?? "none"],
    executor: executorMap[policy.executor ?? "local"],
  };
}

async function main() {
  const ownerHumanId = process.env.OWNER_HUMAN_ID as Hex | undefined;
  const ownerKey = process.env.OWNER_PRIVATE_KEY as `0x${string}` | undefined;
  const storageKey = process.env.STORAGE_SIGNER_PRIVATE_KEY as
    | `0x${string}`
    | undefined;
  const ensName = process.env.ENS_NAME;

  if (!ownerHumanId || !ownerKey || !storageKey || !ensName) {
    throw new Error(
      "Missing OWNER_HUMAN_ID, OWNER_PRIVATE_KEY, STORAGE_SIGNER_PRIVATE_KEY, or ENS_NAME",
    );
  }

  const ownerAccount = privateKeyToAccount(ownerKey);
  const serviceId = deriveServiceId(ownerAccount.address, ensName);
  const humanOrigin = ownerHumanId;

  let existingPolicyVersion = 0;
  try {
    const { service } = await readServicePolicy(serviceId, REGISTRY_ADDRESS);
    existingPolicyVersion = Number(service.policyVersion);
    console.log(
      `Service already registered (on-chain policyVersion=${existingPolicyVersion}). Will call updatePolicy.`,
    );
  } catch {
    console.log("Service not registered yet. Will call registerService.");
  }

  console.log("Owner:", ownerAccount.address);
  console.log("ENS:", ensName);
  console.log("Service ID:", serviceId);
  console.log("Human origin:", humanOrigin);

  const functions: Record<string, FunctionPolicy> = {
    "home.balance": { origin: "same-human" },
    "home.borrow": {
      origin: "same-human",
      assurance: "selfie",
      executor: "0g",
    },
    "home.emergency": {
      origin: "same-human",
      assurance: "identity",
      executor: "0g",
    },
    "home.exportCredentials": { origin: "same-human", agentCallable: false },
  };

  const manifestBody: HORSManifestBody = {
    serviceId,
    humanOrigin,
    functions,
    policyVersion: existingPolicyVersion > 0 ? existingPolicyVersion + 1 : 1,
  };

  const manifestJson = JSON.stringify(manifestBody);
  const contentHash = keccak256(toHex(manifestJson));
  console.log("\nContent hash:", contentHash);

  const storageClient = await createStorageClient({
    signerPrivateKey: storageKey,
  });

  console.log("Uploading policy manifest to 0G Storage...");
  const { storageRoot, txHash } = await uploadPolicyManifest(
    storageClient,
    manifestBody,
  );
  console.log("Policy storage root:", storageRoot);
  console.log("Policy upload tx:", txHash);

  const entries = Object.entries(functions).map(([name, policy]) =>
    policyToEntry(name, policy),
  );

  const walletClient = createWalletClient({
    account: ownerAccount,
    chain: zeroGGalileo,
    transport: http(),
  });

  let registryTx: Hex;
  if (existingPolicyVersion > 0) {
    console.log("\nUpdating policy on HORSRegistry...");
    registryTx = await walletClient.writeContract({
      address: REGISTRY_ADDRESS,
      abi: HORSRegistryABI,
      functionName: "updatePolicy",
      args: [serviceId, storageRoot as Hex, contentHash, entries],
    });
    console.log("Update tx:", registryTx);
  } else {
    console.log("\nRegistering service on HORSRegistry...");
    registryTx = await walletClient.writeContract({
      address: REGISTRY_ADDRESS,
      abi: HORSRegistryABI,
      functionName: "registerService",
      args: [ensName, humanOrigin, storageRoot as Hex, contentHash, entries],
    });
    console.log("Register tx:", registryTx);
  }

  const envPath = new URL(".env", import.meta.url).pathname;
  let envContent = readFileSync(envPath, "utf-8");

  if (envContent.match(/^HORS_SERVICE_ID=.+$/m)) {
    envContent = envContent.replace(
      /^HORS_SERVICE_ID=.*$/m,
      `HORS_SERVICE_ID=${serviceId}`,
    );
  } else {
    envContent = envContent.trimEnd() + `\nHORS_SERVICE_ID=${serviceId}\n`;
  }

  writeFileSync(envPath, envContent);
  console.log(`\n✓ HORS_SERVICE_ID written to .env`);
  console.log(`  ${serviceId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
