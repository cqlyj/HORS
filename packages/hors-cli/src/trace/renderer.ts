import chalk from "chalk";
import type { HORSDiagnosticMeta } from "hors-core";

export interface TraceEvent {
  ts: string;
  type: "request" | "response" | "error";
  service: string;
  function: string;
  caller?: string;
  agent?: string;
  meta?: HORSDiagnosticMeta;
  error?: string;
}

function row(label: string, value: string): string {
  return `  ${chalk.dim(label.padEnd(14))} ${value}`;
}

export function renderTraceEvent(event: TraceEvent): string {
  const lines: string[] = [];
  const header =
    event.type === "request"
      ? chalk.cyan("--- HORS REQUEST ---")
      : event.type === "error"
        ? chalk.red("--- HORS ERROR ---")
        : chalk.green("--- HORS RESPONSE ---");

  lines.push(header);
  lines.push(row("Agent", event.agent ?? "hors-cli"));
  if (event.caller) lines.push(row("Wallet", event.caller));
  lines.push(row("Service", event.service));
  lines.push(row("Function", event.function));

  const meta = event.meta;
  if (meta) {
    lines.push(chalk.bold("--- ORIGIN ---"));
    lines.push(row("Caller", meta.callerHumanId ?? "—"));
    lines.push(row("Origin", meta.origin));
    if (meta.denyReason) {
      lines.push(
        row(
          "Result",
          meta.denyReason === "origin-mismatch"
            ? chalk.red("ORIGIN MISMATCH")
            : chalk.red(meta.denyReason.toUpperCase()),
        ),
      );
    } else if (meta.status === "executed") {
      lines.push(row("Result", chalk.green("SAME HUMAN / ALLOWED")));
    }

    lines.push(chalk.bold("--- EXECUTION ---"));
    if (meta.teeVerified !== undefined) {
      lines.push(
        row(
          "TEE verified",
          meta.teeVerified ? chalk.green("true") : chalk.yellow("false"),
        ),
      );
    }
    lines.push(row("Executor", meta.executionMode));
    if (meta.provider) lines.push(row("Provider", meta.provider));

    lines.push(chalk.bold("--- DECISION ---"));
    if (meta.status === "executed") {
      lines.push(row("Status", chalk.green("HORS_EXECUTED")));
    } else if (meta.status === "step-up-required") {
      lines.push(
        row(
          "Status",
          chalk.yellow(
            `HORS_ASSURANCE_REQUIRED (${meta.requireAssurance ?? "?"})`,
          ),
        ),
      );
    } else {
      lines.push(
        row(
          "Status",
          chalk.red(
            meta.denyReason === "function-forbidden"
              ? "HORS_FUNCTION_FORBIDDEN"
              : meta.denyReason === "origin-mismatch"
                ? "HORS_ORIGIN_MISMATCH"
                : "HORS_DENIED",
          ),
        ),
      );
    }
  }

  if (event.error) {
    lines.push(row("Error", chalk.red(event.error)));
  }

  lines.push(`  ${chalk.dim(event.ts)}`);
  return lines.join("\n");
}
