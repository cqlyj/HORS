import { callTool } from "./setup.js";

console.log("-- From cors() to hors() --\n");

const same = await callTool("canAfford", { amount: 350 }, "owner");
console.log(`  Same-human agent:      ${same}`);

const stranger = await callTool("canAfford", { amount: 350 }, "stranger");
console.log(`  Different-human agent: ${stranger}`);
