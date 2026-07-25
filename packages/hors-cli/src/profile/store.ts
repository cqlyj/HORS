import { homedir } from "node:os";
import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import type { FunctionPolicy } from "hors-core";
import type { Hex, Address } from "viem";

export const HORS_HOME = join(homedir(), ".hors");
export const PROFILE_PATH = join(HORS_HOME, "profile.json");
export const SERVICES_PATH = join(HORS_HOME, "services.json");
export const KEYSTORE_PATH = join(HORS_HOME, "connector.keystore");
export const TRACE_PATH = join(HORS_HOME, "trace.jsonl");
export const POLICIES_DIR = join(HORS_HOME, "policies");

export interface ServiceCacheEntry {
  endpoint: string;
  context?: string | null;
  serviceId?: string;
  registryAddress?: string;
  functions?: Record<string, FunctionPolicy>;
}

export interface HorsProfile {
  humanId: Hex;
  connectorAddress: Address;
  services: Record<string, ServiceCacheEntry>;
  connectedAt: string;
  profileName?: string;
}

export interface ServicesCache {
  updatedAt: string;
  services: Record<string, ServiceCacheEntry>;
}

export function ensureHorsHome(): void {
  if (!existsSync(HORS_HOME)) {
    mkdirSync(HORS_HOME, { recursive: true, mode: 0o700 });
  }
  if (!existsSync(POLICIES_DIR)) {
    mkdirSync(POLICIES_DIR, { recursive: true, mode: 0o700 });
  }
}

export function readProfile(): HorsProfile | null {
  if (!existsSync(PROFILE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(PROFILE_PATH, "utf8")) as HorsProfile;
  } catch {
    console.error(
      `Warning: corrupt profile at ${PROFILE_PATH}, treating as empty`,
    );
    return null;
  }
}

export function writeProfile(profile: HorsProfile): void {
  ensureHorsHome();
  writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2) + "\n", "utf8");
}

export function clearProfile(): void {
  if (existsSync(PROFILE_PATH)) unlinkSync(PROFILE_PATH);
}

export function readServicesCache(): ServicesCache {
  if (!existsSync(SERVICES_PATH)) {
    return { updatedAt: new Date(0).toISOString(), services: {} };
  }
  try {
    return JSON.parse(readFileSync(SERVICES_PATH, "utf8")) as ServicesCache;
  } catch {
    console.error(
      `Warning: corrupt services cache at ${SERVICES_PATH}, treating as empty`,
    );
    return { updatedAt: new Date(0).toISOString(), services: {} };
  }
}

export function writeServicesCache(cache: ServicesCache): void {
  ensureHorsHome();
  writeFileSync(SERVICES_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

export function upsertService(ensName: string, entry: ServiceCacheEntry): void {
  const cache = readServicesCache();
  cache.services[ensName] = entry;
  cache.updatedAt = new Date().toISOString();
  writeServicesCache(cache);

  const profile = readProfile();
  if (profile) {
    profile.services[ensName] = entry;
    writeProfile(profile);
  }
}

export function clearHorsHome(): void {
  if (existsSync(HORS_HOME)) {
    rmSync(HORS_HOME, { recursive: true, force: true });
  }
}
