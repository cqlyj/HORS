import { createPublicClient, http, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import {
  HORS_REGISTRY_ADDRESS,
  parseHORSServiceId,
  verifyHORSServiceRegistration,
} from "./registry.js";

export const HORS_SERVICE_ID_TEXT_KEY = "hors.service-id";

export interface HORSServiceInfo {
  endpoint: string;
  context: string | null;
  ensName: string;
  serviceId: Hex;
  registryAddress: Address;
  registrationVerified: true;
}

export async function discoverHORSService(
  ensName: string,
  rpcUrl?: string,
): Promise<HORSServiceInfo> {
  const name = normalize(ensName);

  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const [endpoint, context, serviceIdRecord] = await Promise.all([
    client.getEnsText({ name, key: "agent-endpoint[mcp]" }),
    client.getEnsText({ name, key: "agent-context" }),
    client.getEnsText({ name, key: HORS_SERVICE_ID_TEXT_KEY }),
  ]);

  if (!endpoint) {
    throw new Error(`No agent-endpoint[mcp] record for ${ensName}`);
  }

  if (!serviceIdRecord) {
    throw new Error(
      `No ${HORS_SERVICE_ID_TEXT_KEY} record for ${ensName}`,
    );
  }

  const serviceId = parseHORSServiceId(serviceIdRecord);
  await verifyHORSServiceRegistration(
    serviceId,
    name,
    HORS_REGISTRY_ADDRESS,
  );

  return {
    endpoint,
    context,
    ensName: name,
    serviceId,
    registryAddress: HORS_REGISTRY_ADDRESS,
    registrationVerified: true,
  };
}
