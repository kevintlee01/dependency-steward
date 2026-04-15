import { prisma } from "@dependency-steward/db";

import { buildApp } from "./app";

const { app, context } = await buildApp();

try {
  await app.listen({
    port: context.env.port,
    host: "0.0.0.0"
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await Promise.all([
      context.queues.scanQueue.close(),
      context.queues.upgradeQueue.close(),
      context.queues.testBackfillQueue.close(),
      context.queues.followUpQueue.close(),
      context.queues.connection.quit(),
      prisma.$disconnect()
    ]);
    process.exit(0);
  });
}