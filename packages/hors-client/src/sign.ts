import { formatSIWEMessage } from "@worldcoin/agentkit-core";
import type { Hex } from "viem";
import { hashArguments } from "hors-core";

export interface SignParams {
  account: {
    address: string;
    signMessage: (args: { message: string }) => Promise<string>;
  };
  domain: string;
  functionName: string;
  args: Record<string, unknown>;
  chainId?: number;
  policyContentHash?: Hex;
}

export async function signHorsAuthorization(
  params: SignParams,
): Promise<string> {
  const {
    account,
    domain,
    functionName,
    args,
    chainId = 480,
    policyContentHash,
  } = params;

  const uri = `hors://${domain}/${functionName}`;
  const argsHash = hashArguments(args);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const callId = crypto.randomUUID();
  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + 5 * 60_000).toISOString();

  const fields = {
    domain,
    address: account.address,
    uri,
    version: "1" as const,
    chainId: `eip155:${chainId}`,
    type: "eip191" as const,
    nonce,
    issuedAt,
    expirationTime,
    statement: `Authorize HORS function call: ${functionName}`,
    resources: [
      `hors://args/${argsHash}`,
      `hors://policy/${policyContentHash ?? "0x0000000000000000000000000000000000000000000000000000000000000000"}`,
      `hors://callId/${callId}`,
    ],
  };

  const message = formatSIWEMessage(fields, account.address);
  const signature = await account.signMessage({ message });

  return Buffer.from(JSON.stringify({ ...fields, signature })).toString(
    "base64",
  );
}
