import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { ensureHorsHome, TRACE_PATH } from "../profile/store.js";
import type { TraceEvent } from "./renderer.js";

export function writeTraceEvent(event: TraceEvent, path = TRACE_PATH): void {
  ensureHorsHome();
  if (!existsSync(path)) {
    writeFileSync(path, "", { mode: 0o600 });
  }
  appendFileSync(path, JSON.stringify(event) + "\n", "utf8");
}
