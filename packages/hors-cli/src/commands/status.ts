import chalk from "chalk";
import { readProfile, KEYSTORE_PATH, PROFILE_PATH } from "../profile/store.js";
import { keystoreExists } from "../profile/keystore.js";

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export async function statusCommand(): Promise<void> {
  const profile = readProfile();
  if (!profile) {
    console.log(chalk.yellow("Not connected. Run `hors connect` first."));
    return;
  }

  console.log(chalk.bold("HORS status"));
  console.log("");
  console.log(`  ${chalk.dim("Profile")}          ${PROFILE_PATH}`);
  console.log(
    `  ${chalk.dim("Keystore")}         ${keystoreExists() ? KEYSTORE_PATH : chalk.red("missing")}`,
  );
  console.log(`  ${chalk.dim("Human ID")}         ${profile.humanId}`);
  console.log(
    `  ${chalk.dim("Connector")}        ${profile.connectorAddress} (${shortAddr(profile.connectorAddress)})`,
  );
  if (profile.profileName) {
    console.log(`  ${chalk.dim("Profile name")}     ${profile.profileName}`);
  }
  console.log(`  ${chalk.dim("Connected at")}     ${profile.connectedAt}`);
  console.log("");
  console.log(chalk.bold("Services"));
  const names = Object.keys(profile.services);
  if (names.length === 0) {
    console.log(chalk.dim("  (none)"));
  } else {
    for (const name of names) {
      const svc = profile.services[name]!;
      const fnCount = Object.keys(svc.functions ?? {}).length;
      console.log(`  ${chalk.cyan(name)}`);
      console.log(`    endpoint   ${svc.endpoint}`);
      if (svc.context) console.log(`    context    ${svc.context}`);
      if (fnCount > 0) console.log(`    functions  ${fnCount}`);
    }
  }
  console.log("");
}
