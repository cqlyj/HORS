import { keccak256, toHex, type Hex } from "viem";
import { HORSError, type HORSManifestBody } from "hors-core";

const DEFAULT_INDEXER = "https://indexer-storage-testnet-turbo.0g.ai";

export async function downloadAndVerifyPolicy(
  storageRoot: string,
  contentHash: Hex,
  indexerUrl?: string,
): Promise<{ manifest: HORSManifestBody; verified: boolean }> {
  const { Indexer } = await import("@0gfoundation/0g-storage-ts-sdk");
  const indexer = new Indexer(indexerUrl ?? DEFAULT_INDEXER);

  const [blob, err] = await indexer.downloadToBlob(storageRoot, {
    proof: true,
  });
  if (err !== null) {
    throw err;
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  let manifest: HORSManifestBody;
  try {
    manifest = JSON.parse(text) as HORSManifestBody;
  } catch {
    throw new HORSError(
      "HORS_NO_PROVIDER",
      "0G Storage policy manifest is not valid JSON",
    );
  }

  const computedHash = keccak256(toHex(text));
  if (computedHash.toLowerCase() !== contentHash.toLowerCase()) {
    throw new HORSError(
      "HORS_ORIGIN_MISMATCH",
      "Downloaded policy manifest does not match expected content hash",
      { expected: contentHash, computed: computedHash },
    );
  }

  return { manifest, verified: true };
}
