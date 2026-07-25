#!/usr/bin/env node
import { createCommand } from "commander";
import { connectCommand } from "./commands/connect.js";
import { statusCommand } from "./commands/status.js";
import { servicesCommand } from "./commands/services.js";
import { disconnectCommand } from "./commands/disconnect.js";
import { watchCommand } from "./commands/watch.js";
import { callCommand } from "./commands/call.js";
import { listFunctionsCommand } from "./commands/list-functions.js";
import { startMcpBridge } from "./mcp/server.js";

const program = createCommand();

program
  .name("hors")
  .description("HORS CLI — connect agent runtimes to human-origin services")
  .version("0.1.0");

program
  .command("connect")
  .description("Generate/load connector wallet and register with AgentBook")
  .option("--fresh", "Generate a new connector wallet", false)
  .option("--password <password>", "Keystore password (default: empty)")
  .option("--profile <name>", "Optional profile label")
  .option("--skip-register", "Do not launch AgentBook QR registration", false)
  .action(async (opts) => {
    await connectCommand({
      fresh: Boolean(opts.fresh),
      password: opts.password,
      profileName: opts.profile,
      skipRegister: Boolean(opts.skipRegister),
    });
  });

program
  .command("status")
  .description("Show current HORS profile")
  .action(async () => {
    await statusCommand();
  });

program
  .command("services")
  .description("List cached services, or discover a new ENS name")
  .argument("[ensName]", "Optional ENS name to discover and cache")
  .option(
    "--endpoint <url>",
    "Manual MCP endpoint (skip ENS lookup; for local demos)",
  )
  .option("--service-id <hex>", "On-chain HORS service ID (bytes32 hex)")
  .option(
    "--registry <address>",
    "HORSRegistry contract address",
    "0x86B773d98d3A7dfE6Cc785CA8F76f7A7Ca85f7b9",
  )
  .action(async (ensName: string | undefined, opts) => {
    await servicesCommand(
      ensName,
      opts.endpoint,
      opts.serviceId,
      opts.registry,
    );
  });

program
  .command("disconnect")
  .description("Clear ~/.hors/ profile and keystore")
  .action(async () => {
    await disconnectCommand();
  });

program
  .command("watch")
  .description("Tail ~/.hors/trace.jsonl and render live HORS traces")
  .action(async () => {
    await watchCommand();
  });

program
  .command("list-functions")
  .description(
    "List HORS-protected functions and policies for a cached service",
  )
  .argument("<service>", "ENS name of the service")
  .option(
    "--refresh",
    "Force re-fetch from on-chain registry (ignore cache)",
    false,
  )
  .action(async (service: string, opts) => {
    await listFunctionsCommand(service, Boolean(opts.refresh));
  });

program
  .command("call")
  .description("Call a remote HORS function (writes a trace event)")
  .argument("<service>", "ENS service name")
  .argument("<function>", "Function / tool name")
  .argument("[argsJson]", "JSON object of arguments", "{}")
  .option("--proof <json>", "World App proof JSON for step-up completion")
  .option(
    "--request-state <token>",
    "Opaque requestState from a previous step-up challenge",
  )
  .action(
    async (service: string, fn: string, argsJson: string = "{}", opts) => {
      await callCommand(service, fn, argsJson, opts.proof, opts.requestState);
    },
  );

program
  .command("mcp")
  .description("Start stdio MCP bridge for Codex / MCP clients")
  .action(() => {
    startMcpBridge();
  });

await program.parseAsync(process.argv);
