import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Hex } from "viem";
import { ensureHorsHome, KEYSTORE_PATH } from "./store.js";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

export interface KeystoreFile {
  version: 1;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
}

/** Encrypt and persist a private key. Password defaults to empty for local demo use. */
export function saveKeystore(
  privateKey: Hex,
  password = "",
  path = KEYSTORE_PATH,
): void {
  ensureHorsHome();
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(password, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey.slice(2), "hex"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const file: KeystoreFile = {
    version: 1,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: encrypted.toString("hex"),
  };
  writeFileSync(path, JSON.stringify(file, null, 2) + "\n", { mode: 0o600 });
}

export function loadKeystore(password = "", path = KEYSTORE_PATH): Hex {
  if (!existsSync(path)) {
    throw new Error(
      `No connector keystore at ${path}. Run \`hors connect --fresh\` first.`,
    );
  }
  let file: KeystoreFile;
  try {
    file = JSON.parse(readFileSync(path, "utf8")) as KeystoreFile;
  } catch {
    throw new Error(
      `Corrupt keystore at ${path}. Delete it and run \`hors connect --fresh\`.`,
    );
  }
  if (file.version !== 1) {
    throw new Error(`Unsupported keystore version: ${file.version}`);
  }
  const salt = Buffer.from(file.salt, "hex");
  const iv = Buffer.from(file.iv, "hex");
  const tag = Buffer.from(file.tag, "hex");
  const ciphertext = Buffer.from(file.ciphertext, "hex");
  const key = deriveKey(password, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return `0x${decrypted.toString("hex")}` as Hex;
}

export function keystoreExists(path = KEYSTORE_PATH): boolean {
  return existsSync(path);
}
