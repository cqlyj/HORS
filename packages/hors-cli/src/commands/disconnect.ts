import chalk from "chalk";
import { clearHorsHome } from "../profile/store.js";

export async function disconnectCommand(): Promise<void> {
  clearHorsHome();
  console.log(chalk.green("Cleared ~/.hors/ — disconnected."));
}
