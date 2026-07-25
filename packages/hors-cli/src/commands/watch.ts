import chalk from "chalk";
import {
  existsSync,
  openSync,
  readSync,
  closeSync,
  watchFile,
  unwatchFile,
  statSync,
} from "node:fs";
import { TRACE_PATH } from "../profile/store.js";
import { renderTraceEvent, type TraceEvent } from "../trace/renderer.js";

export async function watchCommand(): Promise<void> {
  if (!existsSync(TRACE_PATH)) {
    console.log(
      chalk.dim(
        `Waiting for ${TRACE_PATH}… (make a call via \`hors mcp\` to create it)`,
      ),
    );
  } else {
    console.log(chalk.dim(`Tailing ${TRACE_PATH}`));
  }
  console.log(chalk.dim("Press Ctrl+C to stop.\n"));

  let offset = existsSync(TRACE_PATH) ? statSync(TRACE_PATH).size : 0;
  let buffer = "";

  const flush = (): void => {
    if (!existsSync(TRACE_PATH)) return;
    const size = statSync(TRACE_PATH).size;
    if (size < offset) {
      // File truncated / rotated
      offset = 0;
      buffer = "";
    }
    if (size === offset) return;

    const fd = openSync(TRACE_PATH, "r");
    try {
      const length = size - offset;
      const chunk = Buffer.alloc(length);
      readSync(fd, chunk, 0, length, offset);
      offset = size;
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed) as TraceEvent;
          console.log(renderTraceEvent(event));
        } catch {
          console.log(chalk.red(`Invalid trace line: ${trimmed.slice(0, 80)}`));
        }
      }
    } finally {
      closeSync(fd);
    }
  };

  flush();
  watchFile(TRACE_PATH, { interval: 400 }, flush);

  await new Promise<void>((resolve) => {
    const stop = (): void => {
      unwatchFile(TRACE_PATH);
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
