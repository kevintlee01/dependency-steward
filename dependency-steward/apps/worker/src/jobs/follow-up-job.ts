import type { Job } from "bullmq";

import type { FollowUpJobPayload } from "@dependency-steward/queue";

import { ExecutionService } from "../services/execution-service";

const executionService = new ExecutionService();

export async function processFollowUpJob(job: Job<FollowUpJobPayload>) {
  await executionService.processFollowUpJob(job.data);
}