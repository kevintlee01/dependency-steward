import IORedis from "ioredis";
import { Queue, type JobsOptions } from "bullmq";

import type { TriggerSource } from "@dependency-steward/shared";

export const queueNames = {
  scan: "dependency-steward.scan",
  upgrade: "dependency-steward.upgrade",
  testBackfill: "dependency-steward.test-backfill",
  followUp: "dependency-steward.follow-up"
} as const;

export interface ScanJobPayload {
  runId: string;
  repositoryId: string;
  triggerSource: TriggerSource;
  correlationId: string;
}

export interface UpgradeJobPayload {
  runId: string;
  repositoryId: string;
  candidateId: string;
  correlationId: string;
  deferredUpgradeId?: string;
}

export interface TestBackfillJobPayload {
  runId: string;
  repositoryId: string;
  candidateId: string;
  correlationId: string;
}

export interface FollowUpJobPayload {
  runId: string;
  repositoryId: string;
  deferredUpgradeId: string;
  correlationId: string;
}

export interface QueueBundle {
  connection: IORedis;
  scanQueue: Queue<ScanJobPayload>;
  upgradeQueue: Queue<UpgradeJobPayload>;
  testBackfillQueue: Queue<TestBackfillJobPayload>;
  followUpQueue: Queue<FollowUpJobPayload>;
}

const defaultJobOptions: JobsOptions = {
  removeOnComplete: 100,
  removeOnFail: 100,
  attempts: 2,
  backoff: {
    type: "exponential",
    delay: 1_500
  }
};

export function createQueueConnection(redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"): IORedis {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  });
}

export function createQueueBundle(redisUrl?: string): QueueBundle {
  const connection = createQueueConnection(redisUrl);

  return {
    connection,
    scanQueue: new Queue(queueNames.scan, { connection, defaultJobOptions }),
    upgradeQueue: new Queue(queueNames.upgrade, { connection, defaultJobOptions }),
    testBackfillQueue: new Queue(queueNames.testBackfill, { connection, defaultJobOptions }),
    followUpQueue: new Queue(queueNames.followUp, { connection, defaultJobOptions })
  };
}

export async function closeQueueBundle(bundle: QueueBundle): Promise<void> {
  await Promise.all([
    bundle.scanQueue.close(),
    bundle.upgradeQueue.close(),
    bundle.testBackfillQueue.close(),
    bundle.followUpQueue.close()
  ]);
  await bundle.connection.quit();
}