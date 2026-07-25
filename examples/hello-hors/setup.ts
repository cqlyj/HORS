import "dotenv/config";
import { createServer } from "node:http";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import {
  toNodeHandler,
  localhostHostValidation,
  localhostOriginValidation,
} from "@modelcontextprotocol/node";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createHORS, type HORSService } from "hors-server";
import { createHORSClient } from "hors-client";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

export { z } from "zod/v4";

const port = Number(process.env.PORT ?? 3100);

export const service: HORSService = await createHORS({
  humanOrigin: process.env.OWNER_HUMAN_ID as `0x${string}`,
  domain: process.env.HORS_DOMAIN ?? "localhost",
  stateKey: process.env.HORS_STATE_KEY ?? "hello-hors-dev-key-min-32-bytes!!",
});

export function listen(register: (server: McpServer) => void): void {
  const handler = createMcpHandler(() => {
    const server = new McpServer(
      { name: "hello-hors", version: "1.0.0" },
      {
        capabilities: { tools: {} },
        requestState: { verify: service.context.stateVerify },
      },
    );
    register(server);
    return server;
  });

  const nodeHandler = toNodeHandler(handler);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();

  const httpServer = createServer((req, res) => {
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    void nodeHandler(req, res);
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `Port ${port} is already in use. Stop the other server or set PORT in .env`,
      );
      process.exit(1);
    }
    throw err;
  });

  httpServer.listen(port, "127.0.0.1", () =>
    console.log(`Hello HORS! http://127.0.0.1:${port}/mcp`),
  );
}

const domain = process.env.HORS_DOMAIN ?? "localhost";
const endpoint = process.env.HORS_ENDPOINT ?? `http://127.0.0.1:${port}/mcp`;

function requireOwnerKey(): `0x${string}` {
  const key = process.env.AGENT_PRIVATE_KEY;
  if (!key || key === "0x...") {
    throw new Error(
      "Missing AGENT_PRIVATE_KEY — run `make register` in examples/hello-hors first",
    );
  }
  return key as `0x${string}`;
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  mode: "owner" | "stranger" = "owner",
): Promise<string> {
  const key = mode === "stranger" ? generatePrivateKey() : requireOwnerKey();
  const account = privateKeyToAccount(key);
  const hors = createHORSClient({
    signer: {
      address: account.address,
      signMessage: (message) =>
        account.signMessage({ message: message.message }),
    },
    domain,
  });
  const client = new Client({ name: `agent-${mode}`, version: "1.0.0" });
  await client.connect(
    hors.wrapTransport(new StreamableHTTPClientTransport(new URL(endpoint))),
  );
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ type: string; text: string }>)
      .map((b) => b.text)
      .join("");
    return `HORS_EXECUTED  -> ${text}`;
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  } finally {
    await client.close();
  }
}
