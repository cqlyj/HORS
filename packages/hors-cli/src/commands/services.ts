import chalk from "chalk";
import { discoverHORSService } from "hors-client";
import {
  readProfile,
  readServicesCache,
  upsertService,
} from "../profile/store.js";

export async function servicesCommand(
  ensName?: string,
  endpoint?: string,
  serviceId?: string,
  registryAddress?: string,
): Promise<void> {
  if (ensName) {
    if (endpoint) {
      upsertService(ensName, {
        endpoint,
        context: "manual endpoint override",
        ...(serviceId ? { serviceId } : {}),
        ...(registryAddress ? { registryAddress } : {}),
      });
      console.log(chalk.green(`Cached ${ensName} → ${endpoint}`));
      return;
    }
    console.log(chalk.dim(`Discovering ${ensName}…`));
    const info = await discoverHORSService(ensName);
    upsertService(ensName, {
      endpoint: info.endpoint,
      context: info.context,
      ...(serviceId ? { serviceId } : {}),
      ...(registryAddress ? { registryAddress } : {}),
    });
    console.log(chalk.green(`Cached ${ensName}`));
    console.log(`  endpoint  ${info.endpoint}`);
    if (info.context) console.log(`  context   ${info.context}`);
    return;
  }

  const profile = readProfile();
  const cache = readServicesCache();
  const merged = {
    ...cache.services,
    ...(profile?.services ?? {}),
  };

  const names = Object.keys(merged);
  if (names.length === 0) {
    console.log(
      chalk.yellow(
        "No services cached. Run `hors services <ens>` or `hors services <ens> --endpoint <url>`.",
      ),
    );
    return;
  }

  console.log(chalk.bold("Discovered HORS services"));
  console.log("");
  for (const name of names) {
    const svc = merged[name]!;
    console.log(`  ${chalk.cyan(name)}`);
    console.log(`    endpoint  ${svc.endpoint}`);
    if (svc.context) console.log(`    context   ${svc.context}`);
    if (svc.serviceId) console.log(`    serviceId ${svc.serviceId}`);
    const fns = Object.keys(svc.functions ?? {});
    if (fns.length > 0) {
      console.log(`    functions ${fns.join(", ")}`);
    }
  }
  console.log("");
}
