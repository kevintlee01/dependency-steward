import type { Job } from "bullmq";

import type { UpgradeJobPayload } from "@dependency-steward/queue";

import { ExecutionService } from "../services/execution-service";

const executionService = new ExecutionService();

export async function processUpgradeJob(job: Job<UpgradeJobPayload>) {
  await executionService.processUpgradeJob(job.data);
}