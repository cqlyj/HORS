import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let patched = false;

function resolveWasmPath(): string {
  const require = createRequire(import.meta.url);
  return join(
    dirname(require.resolve("@worldcoin/idkit-core")),
    "idkit_wasm_bg.wasm",
  );
}

function requestUrl(input: unknown): string | undefined {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url;
  }
  return undefined;
}

/**
 * IDKit loads `idkit_wasm_bg.wasm` via `fetch(new URL(..., import.meta.url))`.
 * Node's undici fetch rejects `file:` URLs ("not implemented... yet..."), so
 * patch those requests to read the packaged WASM from disk.
 */
export function ensureIdkitWasmForNode(): void {
  if (patched) return;
  if (typeof process === "undefined" || !process.versions?.node) return;

  const wasmPath = resolveWasmPath();
  const origFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = requestUrl(input);
    if (url && url.includes("idkit_wasm_bg.wasm")) {
      const path = url.startsWith("file:") ? fileURLToPath(url) : wasmPath;
      const bytes = readFileSync(path);
      return new Response(bytes, {
        status: 200,
        headers: { "Content-Type": "application/wasm" },
      });
    }
    return origFetch(input, init);
  }) as typeof fetch;

  patched = true;
}
