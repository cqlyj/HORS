import {
  createPublicClient,
  encodePacked,
  http,
  keccak256,
  toBytes,
  type Hex,
  type Address,
} from "viem";
import { normalize } from "viem/ens";
import { HORSRegistryABI } from "hors-core";
import { zeroGGalileo } from "./chains.js";

export const HORS_REGISTRY_ADDRESS =
  "0x86B773d98d3A7dfE6Cc785CA8F76f7A7Ca85f7b9" as const satisfies Address;

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

export function parseHORSServiceId(value: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(
      `Invalid HORS service ID "${value}": expected a 32-byte hex value`,
    );
  }
  return value.toLowerCase() as Hex;
}

export function deriveHORSServiceId(owner: Address, ensName: string): Hex {
  const normalizedName = normalize(ensName);
  const ensHash = keccak256(toBytes(normalizedName));
  return keccak256(
    encodePacked(["address", "bytes32"], [owner, ensHash]),
  );
}

export function assertHORSServiceBinding(
  serviceId: Hex,
  ensName: string,
  owner: Address,
): void {
  const expected = deriveHORSServiceId(owner, ensName);
  if (serviceId.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `HORS service ID ${serviceId} is not registered for ${normalize(ensName)} by registry owner ${owner}`,
    );
  }
}

export async function readServiceRecord(
  serviceId: Hex,
  registryAddress: Address = HORS_REGISTRY_ADDRESS,
  rpcUrl?: string,
): Promise<RegistryServiceRecord> {
  const client = createPublicClient({
    chain: zeroGGalileo,
    transport: http(rpcUrl),
  });

  return client.readContract({
    address: registryAddress,
    abi: HORSRegistryABI,
    functionName: "getService",
    args: [serviceId],
  }) as Promise<RegistryServiceRecord>;
}

export async function verifyHORSServiceRegistration(
  serviceId: Hex,
  ensName: string,
  registryAddress: Address = HORS_REGISTRY_ADDRESS,
  rpcUrl?: string,
): Promise<RegistryServiceRecord> {
  const service = await readServiceRecord(serviceId, registryAddress, rpcUrl);
  assertHORSServiceBinding(serviceId, ensName, service.owner);
  return service;
}

export async function readServicePolicy(
  serviceId: Hex,
  registryAddress: Address = HORS_REGISTRY_ADDRESS,
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
