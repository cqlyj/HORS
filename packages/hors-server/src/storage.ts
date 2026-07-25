import {
  HORSError,
  type AuditLogEntry,
  type EnrollmentRecord,
  type HORSManifestBody,
  type StorageConfig,
} from "hors-core";

const DEFAULT_INDEXER = "https://indexer-storage-testnet-turbo.0g.ai";
const DEFAULT_EVM_RPC = "https://evmrpc-testnet.0g.ai";

export interface StorageClient {
  indexer: import("@0gfoundation/0g-storage-ts-sdk").Indexer;
  signer: import("ethers").Wallet;
  evmRpc: string;
}

interface UploadTxResult {
  rootHash: string;
  txHash: string;
}

function parseUploadResult(tx: Record<string, unknown>): UploadTxResult {
  if ("rootHash" in tx && typeof tx.rootHash === "string") {
    return {
      rootHash: tx.rootHash,
      txHash: String(tx.txHash),
    };
  }

  const rootHashes = tx.rootHashes;
  const txHashes = tx.txHashes;
  if (
    Array.isArray(rootHashes) &&
    rootHashes.length > 0 &&
    Array.isArray(txHashes) &&
    txHashes.length > 0
  ) {
    return {
      rootHash: String(rootHashes[0]),
      txHash: String(txHashes[0]),
    };
  }

  throw new HORSError(
    "HORS_NO_PROVIDER",
    "Unexpected 0G Storage upload response shape",
  );
}

function storageError(message: string, cause?: unknown): HORSError {
  return new HORSError("HORS_NO_PROVIDER", message, cause);
}

export async function createStorageClient(
  config: StorageConfig,
): Promise<StorageClient> {
  let sdk: typeof import("@0gfoundation/0g-storage-ts-sdk");
  let ethersModule: typeof import("ethers");
  try {
    [sdk, ethersModule] = await Promise.all([
      import("@0gfoundation/0g-storage-ts-sdk"),
      import("ethers"),
    ]);
  } catch {
    throw new HORSError(
      "HORS_NO_PROVIDER",
      "0G Storage SDK or ethers not installed. Install: npm i @0gfoundation/0g-storage-ts-sdk ethers",
    );
  }

  const { Indexer } = sdk;
  const { ethers } = ethersModule;

  const evmRpc = config.evmRpc ?? DEFAULT_EVM_RPC;
  const provider = new ethers.JsonRpcProvider(evmRpc);
  const signer = new ethers.Wallet(config.signerPrivateKey, provider);
  const indexer = new Indexer(config.indexerUrl ?? DEFAULT_INDEXER);

  return { indexer, signer, evmRpc };
}

async function uploadBytes(
  client: StorageClient,
  bytes: Uint8Array,
  encryption?: { type: "aes256"; key: Uint8Array },
): Promise<UploadTxResult> {
  const { MemData } = await import("@0gfoundation/0g-storage-ts-sdk");
  const memData = new MemData(bytes);

  const [, treeErr] = await memData.merkleTree();
  if (treeErr !== null) {
    throw storageError(`Merkle tree generation failed: ${treeErr}`);
  }

  const uploadOpts = encryption
    ? { encryption: { type: "aes256" as const, key: encryption.key } }
    : undefined;

  const [tx, uploadErr] = await client.indexer.upload(
    memData,
    client.evmRpc,
    client.signer as never,
    uploadOpts,
  );

  if (uploadErr !== null) {
    throw storageError(`0G Storage upload failed: ${uploadErr}`);
  }

  return parseUploadResult(tx as Record<string, unknown>);
}

export async function uploadPolicyManifest(
  client: StorageClient,
  manifest: HORSManifestBody,
): Promise<{ storageRoot: string; txHash: string }> {
  const json = JSON.stringify(manifest);
  const bytes = new TextEncoder().encode(json);
  const { rootHash, txHash } = await uploadBytes(client, bytes);
  return { storageRoot: rootHash, txHash };
}

export async function uploadEnrollmentRecord(
  client: StorageClient,
  record: EnrollmentRecord,
): Promise<{ storageRoot: string; txHash: string }> {
  const json = JSON.stringify(record);
  const bytes = new TextEncoder().encode(json);
  const { rootHash, txHash } = await uploadBytes(client, bytes);
  return { storageRoot: rootHash, txHash };
}

export async function downloadEnrollmentRecord(
  client: StorageClient,
  storageRoot: string,
): Promise<EnrollmentRecord> {
  const [blob, err] = await client.indexer.downloadToBlob(storageRoot, {
    proof: true,
  });
  if (err !== null) {
    throw storageError(`0G Storage enrollment download failed: ${err}`);
  }

  const text = new TextDecoder().decode(
    new Uint8Array(await blob.arrayBuffer()),
  );
  try {
    return JSON.parse(text) as EnrollmentRecord;
  } catch {
    throw storageError("0G Storage enrollment record is not valid JSON");
  }
}

export async function downloadPolicyManifest(
  client: StorageClient,
  storageRoot: string,
): Promise<HORSManifestBody> {
  const [blob, err] = await client.indexer.downloadToBlob(storageRoot, {
    proof: true,
  });
  if (err !== null) {
    throw storageError(`0G Storage download failed: ${err}`);
  }

  const text = new TextDecoder().decode(
    new Uint8Array(await blob.arrayBuffer()),
  );
  try {
    return JSON.parse(text) as HORSManifestBody;
  } catch {
    throw storageError("0G Storage policy manifest is not valid JSON");
  }
}

export async function writeAuditLog(
  client: StorageClient,
  entry: AuditLogEntry,
  key: Uint8Array,
): Promise<{ rootHash: string }> {
  const bytes = new TextEncoder().encode(JSON.stringify(entry));
  const { rootHash } = await uploadBytes(client, bytes, {
    type: "aes256",
    key,
  });
  return { rootHash };
}

export async function readAuditLog(
  client: StorageClient,
  rootHash: string,
  key: Uint8Array,
): Promise<AuditLogEntry> {
  const [blob, err] = await client.indexer.downloadToBlob(rootHash, {
    proof: true,
    decryption: { symmetricKey: key },
  });
  if (err !== null) {
    throw storageError(`0G Storage audit log download failed: ${err}`);
  }

  const text = new TextDecoder().decode(
    new Uint8Array(await blob.arrayBuffer()),
  );
  try {
    return JSON.parse(text) as AuditLogEntry;
  } catch {
    throw storageError("0G Storage audit log is not valid JSON");
  }
}
