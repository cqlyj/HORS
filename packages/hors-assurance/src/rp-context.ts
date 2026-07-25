import { signRequest } from "@worldcoin/idkit-core/signing";
import type { AssuranceServerConfig } from "hors-core";
import type { RpContext } from "./types.js";

export function createRpContext(
  config: AssuranceServerConfig,
  action: string,
): RpContext {
  const { sig, nonce, createdAt, expiresAt } = signRequest({
    signingKeyHex: config.signingKey,
    action,
    ttl: 300,
  });

  return {
    rp_id: config.rpId,
    nonce,
    created_at: createdAt,
    expires_at: expiresAt,
    signature: sig,
  };
}
