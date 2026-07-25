import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";

export interface HORSServiceInfo {
  endpoint: string;
  context: string | null;
  ensName: string;
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

  const [endpoint, context] = await Promise.all([
    client.getEnsText({ name, key: "agent-endpoint[mcp]" }),
    client.getEnsText({ name, key: "agent-context" }),
  ]);

  if (!endpoint) {
    throw new Error(`No agent-endpoint[mcp] record for ${ensName}`);
  }

  return { endpoint, context, ensName: name };
}
