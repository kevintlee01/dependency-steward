import type { FastifyInstance } from "fastify";

import type { ApiContext } from "../types";
import { createQueuedRun, getRunDetail, resolveManualReview } from "../services/repository-service";

export async function registerRunRoutes(app: FastifyInstance, context: ApiContext) {
  app.get("/api/runs/:runId", async (request, reply) => {
    const run = await getRunDetail((request.params as { runId: string }).runId);
    if (!run) {
      reply.code(404);
      return { message: "Run not found" };
    }

    return run;
  });

  app.post("/api/runs/:runId/requeue", async (request, reply) => {
    const detail = await getRunDetail((request.params as { runId: string }).runId);
    if (!detail) {
      reply.code(404);
      return { message: "Run not found" };
    }

    const requeuedRun = await createQueuedRun({
      repositoryId: detail.repositoryId,
      dependencyCandidateId: detail.dependencyCandidate?.id,
      runType: detail.runType,
      triggerSource: "manual",
      summary: `Requeued ${detail.runType.replaceAll("_", " ")} run`
    });

    if (!requeuedRun) {
      reply.code(404);
      return { message: "Repository not found" };
    }

    if (detail.runType === "scan") {
      await context.queues.scanQueue.add(`scan:${requeuedRun.id}`, {
        runId: requeuedRun.id,
        repositoryId: detail.repositoryId,
        triggerSource: "manual",
        correlationId: requeuedRun.correlationId
      });
    } else if (detail.runType === "test_backfill" && detail.dependencyCandidate) {
      await context.queues.testBackfillQueue.add(`backfill:${requeuedRun.id}`, {
        runId: requeuedRun.id,
        repositoryId: detail.repositoryId,
        candidateId: detail.dependencyCandidate.id,
        correlationId: requeuedRun.correlationId
      });
    } else if (detail.dependencyCandidate) {
      await context.queues.upgradeQueue.add(`upgrade:${requeuedRun.id}`, {
        runId: requeuedRun.id,
        repositoryId: detail.repositoryId,
        candidateId: detail.dependencyCandidate.id,
        correlationId: requeuedRun.correlationId
      });
    }

    reply.code(202);
    return { runId: requeuedRun.id, status: requeuedRun.status };
  });

  app.post("/api/runs/:runId/resolve-manual-review", async (request, reply) => {
    const run = await resolveManualReview((request.params as { runId: string }).runId);
    if (!run) {
      reply.code(404);
      return { message: "Run not found" };
    }

    return run;
  });
}