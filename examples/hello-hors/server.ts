import { service, listen, z } from "./setup.js";

listen((server) => {
  server.registerTool(
    "canAfford",
    {
      description: "Can you afford this?",
      inputSchema: z.object({ amount: z.number() }),
    },
    service.hors("canAfford", { origin: "same-human" }, async (args) => ({
      content: [
        {
          type: "text",
          text: (args.amount as number) <= 500 ? "yes" : "no",
        },
      ],
    })),
  );
});
