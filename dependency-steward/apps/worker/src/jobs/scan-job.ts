import type { Job } from "bullmq";

import type { ScanJobPayload } from "@dependency-steward/queue";

import { ExecutionService } from "../services/execution-service";

const executionService = new ExecutionService();

export async function processScanJob(job: Job<ScanJobPayload>) {
  await executionService.processScanJob(job.data);
}