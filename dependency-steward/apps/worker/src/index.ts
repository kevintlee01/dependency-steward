import { Worker } from "bullmq";

import { loadRuntimeEnv } from "@dependency-steward/config";
import { prisma } from "@dependency-steward/db";
import { createQueueConnection, queueNames } from "@dependency-steward/queue";

import { processFollowUpJob } from "./jobs/follow-up-job";
import { processScanJob } from "./jobs/scan-job";
import { processTestBackfillJob } from "./jobs/test-backfill-job";
import { processUpgradeJob } from "./jobs/upgrade-job";

const env = loadRuntimeEnv();
const connection = createQueueConnection(env.redisUrl);

const scanWorker = new Worker(queueNames.scan, processScanJob, { connection });
const upgradeWorker = new Worker(queueNames.upgrade, processUpgradeJob, { connection });
const testBackfillWorker = new Worker(queueNames.testBackfill, processTestBackfillJob, { connection });
const followUpWorker = new Worker(queueNames.followUp, processFollowUpJob, { connection });

for (const worker of [scanWorker, upgradeWorker, testBackfillWorker, followUpWorker]) {
  worker.on("failed", (job, error) => {
    console.error(`Worker ${job?.queueName ?? "unknown"} failed`, error);
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await Promise.all([scanWorker.close(), upgradeWorker.close(), testBackfillWorker.close(), followUpWorker.close()]);
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  });
}