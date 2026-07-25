import { createAgentBookVerifier } from "@worldcoin/agentkit-core";
import {
  createRequestStateCodec,
  type RequestStateCodec,
  type ServerContext,
} from "@modelcontextprotocol/server";
import type { Hex } from "viem";
import { keccak256, toHex } from "viem";
import {
  HORS_HEADERS,
  InMemoryReplayStore,
  type HORSServerConfig,
  type HORSManifestBody,
  type HORSExecutor,
  type ReplayStore,
} from "hors-core";
import {
  createSelfieAdapter,
  createIdentityAdapter,
  type AssuranceAdapter,
} from "hors-assurance";
import type { StorageClient } from "./storage.js";

export interface HORSStepUpState {
  step: "awaiting-assurance";
  callId: string;
  callerHumanId: string;
  callerAddress: string;
  functionName: string;
  argsHash: string;
  requiredAssurance: string;
  action?: string;
  expectedSignalHash?: string;
}

export interface HORSAuthContext {
  domain: string;
  humanOrigin: Hex;
  manifest?: HORSManifestBody;
  policyContentHash?: Hex;
  executors: Record<string, HORSExecutor>;
  config: HORSServerConfig;
  nonceStore: ReplayStore;
  callIdStore: ReplayStore;
  stepUpConsumedStore: ReplayStore;
  agentBookVerifier: ReturnType<typeof createAgentBookVerifier>;
  stateCodec: RequestStateCodec<HORSStepUpState>;
  stateVerify: RequestStateCodec<HORSStepUpState>["verify"];
  selfieAdapter?: AssuranceAdapter;
  identityAdapter?: AssuranceAdapter;
  storageClient?: StorageClient;
}

function resolveStateKey(config: HORSServerConfig): Uint8Array {
  if (config.stateKey) {
    return typeof config.stateKey === "string"
      ? new TextEncoder().encode(config.stateKey)
      : config.stateKey;
  }

  console.warn(
    "[HORS] No stateKey configured — using random per-process key. Step-up flows will not survive restarts or work across replicas.",
  );
  return crypto.getRandomValues(new Uint8Array(32));
}

function extractPrincipalFromHorsHeader(ctx: ServerContext): string {
  const header = ctx.http?.req?.headers.get(HORS_HEADERS.REQUEST.toLowerCase());
  if (!header) return "";
  try {
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    return (decoded.address as string) ?? "";
  } catch {
    return "";
  }
}

export async function buildAuthContext(
  config: HORSServerConfig,
): Promise<HORSAuthContext> {
  const nonceStore = config.stores?.nonce ?? new InMemoryReplayStore(600_000);
  const callIdStore = config.stores?.callId ?? new InMemoryReplayStore(600_000);
  const stepUpConsumedStore =
    config.stores?.stepUp ?? new InMemoryReplayStore(600_000);
  const agentBookVerifier = createAgentBookVerifier();
  const key = resolveStateKey(config);
  const stateCodec = createRequestStateCodec<HORSStepUpState>({
    key,
    ttlSeconds: 300,
    bind: (ctx) => extractPrincipalFromHorsHeader(ctx),
  });

  let selfieAdapter: AssuranceAdapter | undefined;
  let identityAdapter: AssuranceAdapter | undefined;

  if (config.assurance) {
    selfieAdapter = createSelfieAdapter(
      config.assurance,
      config.stores?.nullifier,
    );
    identityAdapter = createIdentityAdapter(
      config.assurance,
      config.stores?.nullifier,
    );
  }

  let manifest: HORSManifestBody | undefined;
  let policyContentHash: Hex | undefined = config.policyContentHash;

  if (config.manifest) {
    manifest = config.manifest;

    if (
      manifest.humanOrigin.toLowerCase() !== config.humanOrigin.toLowerCase()
    ) {
      throw new Error(
        `[HORS] Manifest humanOrigin (${manifest.humanOrigin}) does not match config humanOrigin (${config.humanOrigin})`,
      );
    }

    if (
      config.registry?.storage?.serviceId &&
      manifest.serviceId.toLowerCase() !==
        config.registry.storage.serviceId.toLowerCase()
    ) {
      throw new Error(
        `[HORS] Manifest serviceId (${manifest.serviceId}) does not match config serviceId (${config.registry.storage.serviceId})`,
      );
    }

    const computedHash = keccak256(toHex(JSON.stringify(manifest))) as Hex;

    if (
      policyContentHash &&
      policyContentHash.toLowerCase() !== computedHash.toLowerCase()
    ) {
      throw new Error(
        `[HORS] Configured policyContentHash (${policyContentHash}) does not match manifest hash (${computedHash})`,
      );
    }
    policyContentHash = computedHash;
    console.info(
      `[HORS] Policy manifest loaded. Content hash: ${policyContentHash}`,
    );
  }

  let storageClient: StorageClient | undefined;
  if (config.registry?.storage) {
    const { createStorageClient } = await import("./storage.js");
    storageClient = await createStorageClient(config.registry.storage);

    const enrollmentRoot = config.registry.enrollmentStorageRoot;
    if (enrollmentRoot) {
      const { downloadEnrollmentRecord } = await import("./storage.js");
      const record = await downloadEnrollmentRecord(
        storageClient,
        enrollmentRoot,
      );
      if (record.humanId.toLowerCase() !== config.humanOrigin.toLowerCase()) {
        throw new Error(
          `[HORS] Enrollment record humanId (${record.humanId}) does not match configured humanOrigin (${config.humanOrigin})`,
        );
      }
      if (
        config.registry.storage.serviceId &&
        record.serviceId.toLowerCase() !==
          config.registry.storage.serviceId.toLowerCase()
      ) {
        throw new Error(
          `[HORS] Enrollment record serviceId (${record.serviceId}) does not match configured serviceId (${config.registry.storage.serviceId})`,
        );
      }
    }
  }

  const context: HORSAuthContext = {
    domain: config.domain,
    humanOrigin: config.humanOrigin,
    manifest,
    policyContentHash: policyContentHash,
    executors: config.executors ?? {},
    config,
    nonceStore,
    callIdStore,
    stepUpConsumedStore,
    agentBookVerifier,
    stateCodec,
    stateVerify: stateCodec.verify,
    selfieAdapter,
    identityAdapter,
    storageClient,
  };

  return context;
}

export type { ServerContext };
