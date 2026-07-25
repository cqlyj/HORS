import type { Hex } from "viem";
import { HORS_META_KEY, type HORSDiagnosticMeta } from "hors-core";
import {
  isJSONRPCRequest,
  isJSONRPCResponse,
  type Transport,
  type JSONRPCMessage,
  type TransportSendOptions,
} from "@modelcontextprotocol/client";
import { signHorsAuthorization } from "./sign.js";

export interface HORSClientConfig {
  signer: {
    address: string;
    signMessage: (args: { message: string }) => Promise<string>;
  };
  domain: string;
  chainId?: number;
  /** When using ENS discovery + registry reads, pass the on-chain policyContentHash
   *  so every Hors-Authorization includes a signed policy digest the server can verify. */
  policyContentHash?: Hex;
}

export interface HORSClient {
  wrapTransport(transport: Transport): Transport;
  readonly lastDiagnostic: HORSDiagnosticMeta | undefined;
}

/** Extract `_meta.hors` from a CallToolResult (or any MCP result object). */
export function extractHorsMeta(
  result: unknown,
): HORSDiagnosticMeta | undefined {
  if (!result || typeof result !== "object") return undefined;
  const meta = (result as { _meta?: Record<string, unknown> })._meta;
  if (!meta || typeof meta !== "object") return undefined;
  const hors = meta[HORS_META_KEY];
  if (!hors || typeof hors !== "object") return undefined;
  return hors as HORSDiagnosticMeta;
}

function extractFromJsonRpcMessage(
  message: JSONRPCMessage,
): HORSDiagnosticMeta | undefined {
  if (!isJSONRPCResponse(message)) return undefined;
  const result = (message as { result?: unknown }).result;
  const fromResult = extractHorsMeta(result);
  if (fromResult) return fromResult;

  // Deny paths put diagnostic meta on ProtocolError.data
  const error = (message as { error?: { data?: unknown } }).error;
  if (error?.data && typeof error.data === "object") {
    const data = error.data as Record<string, unknown>;
    if (data.hors && typeof data.hors === "object") {
      return data.hors as HORSDiagnosticMeta;
    }
  }
  return undefined;
}

class HORSTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport["onmessage"];

  constructor(
    private inner: Transport,
    private config: HORSClientConfig,
  ) {}

  get sessionId() {
    return this.inner.sessionId;
  }

  get hasPerRequestStream() {
    return this.inner.hasPerRequestStream;
  }

  async start() {
    return this.inner.start();
  }

  async close() {
    return this.inner.close();
  }

  setProtocolVersion?(version: string) {
    return this.inner.setProtocolVersion?.(version);
  }

  setSupportedProtocolVersions?(versions: string[]) {
    return this.inner.setSupportedProtocolVersions?.(versions);
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions) {
    if (
      isJSONRPCRequest(message) &&
      message.method === "tools/call" &&
      "params" in message
    ) {
      const params = message.params as {
        name: string;
        arguments?: Record<string, unknown>;
      };

      const horsHeader = await signHorsAuthorization({
        account: this.config.signer,
        domain: this.config.domain,
        functionName: params.name,
        args: params.arguments ?? {},
        chainId: this.config.chainId,
        policyContentHash: this.config.policyContentHash,
      });

      return this.inner.send(message, {
        ...options,
        headers: {
          ...options?.headers,
          "Hors-Authorization": horsHeader,
        },
      });
    }

    return this.inner.send(message, options);
  }
}

export function createHORSClient(config: HORSClientConfig): HORSClient {
  let lastDiagnostic: HORSDiagnosticMeta | undefined;

  return {
    get lastDiagnostic() {
      return lastDiagnostic;
    },
    wrapTransport(transport: Transport): Transport {
      const wrapped = new HORSTransport(transport, config);

      const origOnclose = transport.onclose;
      transport.onclose = () => {
        origOnclose?.();
        wrapped.onclose?.();
      };

      const origOnerror = transport.onerror;
      transport.onerror = (error) => {
        origOnerror?.(error);
        wrapped.onerror?.(error);
      };

      const origOnmessage = transport.onmessage;
      transport.onmessage = (message, extra) => {
        const diagnostic = extractFromJsonRpcMessage(message);
        if (diagnostic) {
          lastDiagnostic = diagnostic;
        }
        origOnmessage?.(message, extra);
        wrapped.onmessage?.(message, extra);
      };

      return wrapped;
    },
  };
}
