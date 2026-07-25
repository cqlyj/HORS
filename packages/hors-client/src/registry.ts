import { createPublicClient, http, type Hex, type Address } from "viem";
import { HORSRegistryABI } from "hors-core";
import { zeroGGalileo } from "./chains.js";

export interface RegistryServiceRecord {
  owner: Address;
  policyVersion: bigint;
  humanOrigin: Hex;
  policyStorageRoot: Hex;
  policyContentHash: Hex;
  updatedAt: bigint;
}

export interface RegistryPolicyEntry {
  functionHash: Hex;
  origin: number;
  assurance: number;
  executor: number;
}

export async function readServicePolicy(
  serviceId: Hex,
  registryAddress: Address,
  rpcUrl?: string,
): Promise<{
  service: RegistryServiceRecord;
  policies: RegistryPolicyEntry[];
}> {
  const client = createPublicClient({
    chain: zeroGGalileo,
    transport: http(rpcUrl),
  });

  const [service, policies] = await Promise.all([
    client.readContract({
      address: registryAddress,
      abi: HORSRegistryABI,
      functionName: "getService",
      args: [serviceId],
    }) as Promise<RegistryServiceRecord>,
    client.readContract({
      address: registryAddress,
      abi: HORSRegistryABI,
      functionName: "getPolicies",
      args: [serviceId],
    }) as Promise<RegistryPolicyEntry[]>,
  ]);

  return { service, policies };
}
