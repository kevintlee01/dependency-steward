import type { Job } from "bullmq";

import type { TestBackfillJobPayload } from "@dependency-steward/queue";

import { ExecutionService } from "../services/execution-service";

const executionService = new ExecutionService();

export async function processTestBackfillJob(job: Job<TestBackfillJobPayload>) {
  await executionService.processTestBackfillJob(job.data);
}