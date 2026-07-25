import chalk from "chalk";
import { readServicePolicy, downloadAndVerifyPolicy } from "hors-client";
import type { FunctionPolicy } from "hors-core";
import {
  readProfile,
  readServicesCache,
  upsertService,
} from "../profile/store.js";

const DEFAULT_REGISTRY = "0x86B773d98d3A7dfE6Cc785CA8F76f7A7Ca85f7b9";

function printFunctions(
  service: string,
  functions: Record<string, FunctionPolicy>,
  opts?: { verified?: boolean; policyVersion?: number },
): void {
  const header =
    opts?.verified && opts.policyVersion !== undefined
      ? `Functions for ${service} (verified, policyVersion ${opts.policyVersion})`
      : `Functions for ${service}`;
  console.log(chalk.bold(header));
  console.log("");

  const names = Object.keys(functions).sort();
  if (names.length === 0) {
    console.log(chalk.dim("  (no functions cached)"));
    return;
  }

  for (const name of names) {
    const policy = functions[name]!;
    console.log(`  ${chalk.cyan(name)}`);
    console.log(`    ${chalk.dim("origin".padEnd(14))} ${policy.origin}`);
    if (policy.assurance) {
      console.log(
        `    ${chalk.dim("assurance".padEnd(14))} ${policy.assurance}`,
      );
    }
    if (policy.executor) {
      console.log(`    ${chalk.dim("executor".padEnd(14))} ${policy.executor}`);
    }
    if (policy.agentCallable === false) {
      console.log(
        `    ${chalk.dim("agentCallable".padEnd(14))} ${chalk.red("false")}`,
      );
    }
    console.log("");
  }
}

export async function listFunctionsCommand(
  service: string,
  refresh: boolean,
): Promise<void> {
  const profile = readProfile();
  const cache = readServicesCache();
  const entry = profile?.services[service] ?? cache.services[service] ?? null;

  if (!entry) {
    console.error(
      chalk.red(
        `Service "${service}" not cached. Run \`hors services ${service}\` first.`,
      ),
    );
    process.exit(1);
  }

  const cached = entry.functions ?? {};
  if (Object.keys(cached).length > 0 && !refresh) {
    printFunctions(service, cached);
    return;
  }

  if (!entry.serviceId) {
    printFunctions(service, cached);
    console.log(
      chalk.yellow(
        "No serviceId configured. Run `hors services <ens> --service-id <hex>` to enable on-chain policy lookup.",
      ),
    );
    return;
  }

  try {
    const registry = (entry.registryAddress ??
      DEFAULT_REGISTRY) as `0x${string}`;
    const { service: svcRecord } = await readServicePolicy(
      entry.serviceId as `0x${string}`,
      registry,
    );

    const { manifest } = await downloadAndVerifyPolicy(
      svcRecord.policyStorageRoot,
      svcRecord.policyContentHash,
    );

    upsertService(service, { ...entry, functions: manifest.functions });

    printFunctions(service, manifest.functions, {
      verified: true,
      policyVersion: Number(svcRecord.policyVersion),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Policy fetch failed: ${message}`));
    if (Object.keys(cached).length > 0) {
      console.log("");
      printFunctions(service, cached);
    }
    process.exit(1);
  }
}
