import type { FastifyInstance } from "fastify";

import { prisma } from "@dependency-steward/db";
import type { ApiContext } from "../types";
import {
  createQueuedRun,
  createRepository,
  getLatestCoverage,
  getRepositoryDetail,
  listDependencyCandidates,
  listRepositories,
  listRuns,
  updatePolicy,
  updateRepository
} from "../services/repository-service";

export async function registerRepositoryRoutes(app: FastifyInstance, context: ApiContext) {
  app.get("/api/repos", async () => listRepositories());

  app.post("/api/repos", async (request, reply) => {
    const body = request.body as {
      fullName: string;
      owner?: string;
      name?: string;
      repoUrl?: string | null;
      localPath?: string | null;
      defaultBranch?: string;
    };

    const detail = await createRepository(body);

    const run = await createQueuedRun({
      repositoryId: detail.repository.id,
      runType: "scan",
      triggerSource: "manual",
      summary: "Initial scan after repository import"
    });

    if (run) {
      await context.queues.scanQueue.add(`scan:${run.id}`, {
        runId: run.id,
        repositoryId: detail.repository.id,
        triggerSource: "manual",
        correlationId: run.correlationId
      });
    }

    reply.code(201);
    return detail;
  });

  app.get("/api/repos/:repoId", async (request, reply) => {
    const detail = await getRepositoryDetail((request.params as { repoId: string }).repoId);
    if (!detail) {
      reply.code(404);
      return { message: "Repository not found" };
    }

    return detail;
  });

  app.patch("/api/repos/:repoId", async (request, reply) => {
    const repoId = (request.params as { repoId: string }).repoId;
    const repo = await updateRepository(repoId, request.body as Record<string, string>);
    if (!repo) {
      reply.code(404);
      return { message: "Repository not found" };
    }

    return repo;
  });

  app.patch("/api/repos/:repoId/policy", async (request, reply) => {
    const repoId = (request.params as { repoId: string }).repoId;
    const policy = await updatePolicy(repoId, request.body as Record<string, unknown>);
    if (!policy) {
      reply.code(404);
      return { message: "Repository not found" };
    }

    return policy;
  });

  app.get("/api/repos/:repoId/runs", async (request) => listRuns((request.params as { repoId: string }).repoId));
  app.get("/api/repos/:repoId/dependencies", async (request) =>
    listDependencyCandidates((request.params as { repoId: string }).repoId)
  );
  app.get("/api/repos/:repoId/coverage", async (request) => getLatestCoverage((request.params as { repoId: string }).repoId));

  app.post("/api/repos/:repoId/scan", async (request, reply) => {
    const repoId = (request.params as { repoId: string }).repoId;

    // Check if there's already an active scan for this repo
    const activeRun = await prisma.run.findFirst({
      where: {
        repositoryId: repoId,
        status: { in: ["queued", "preparing", "running"] }
      }
    });

    if (activeRun) {
      reply.code(409);
      return {
        message: `A ${activeRun.runType.replaceAll("_", " ")} run is already ${activeRun.status.replaceAll("_", " ")}`,
        runId: activeRun.id,
        status: activeRun.status
      };
    }

    const run = await createQueuedRun({
      repositoryId: repoId,
      runType: "scan",
      triggerSource: "manual",
      summary: "Queued manual dependency scan"
    });

    if (!run) {
      reply.code(404);
      return { message: "Repository not found" };
    }

    await context.queues.scanQueue.add(`scan:${run.id}`, {
      runId: run.id,
      repositoryId: repoId,
      triggerSource: "manual",
      correlationId: run.correlationId
    });

    reply.code(202);
    return { runId: run.id, status: run.status };
  });

  app.post("/api/repos/:repoId/backfill-tests", async (request, reply) => {
    const repoId = (request.params as { repoId: string }).repoId;
    const body = request.body as { candidateId: string };
    const run = await createQueuedRun({
      repositoryId: repoId,
      dependencyCandidateId: body.candidateId,
      runType: "test_backfill",
      triggerSource: "manual",
      summary: "Queued manual test backfill run"
    });

    if (!run) {
      reply.code(404);
      return { message: "Repository not found" };
    }

    await prisma.dependencyCandidate.update({
      where: { id: body.candidateId },
      data: { status: "in_progress" }
    });

    await context.queues.testBackfillQueue.add(`backfill:${run.id}`, {
      runId: run.id,
      repositoryId: repoId,
      candidateId: body.candidateId,
      correlationId: run.correlationId
    });

    reply.code(202);
    return { runId: run.id, status: run.status };
  });

  app.post("/api/repos/:repoId/upgrade/:candidateId", async (request, reply) => {
    const params = request.params as { repoId: string; candidateId: string };
    const run = await createQueuedRun({
      repositoryId: params.repoId,
      dependencyCandidateId: params.candidateId,
      runType: "upgrade",
      triggerSource: "manual",
      summary: "Queued manual dependency upgrade run"
    });

    if (!run) {
      reply.code(404);
      return { message: "Repository not found" };
    }

    await prisma.dependencyCandidate.update({
      where: { id: params.candidateId },
      data: { status: "in_progress" }
    });

    await context.queues.upgradeQueue.add(`upgrade:${run.id}`, {
      runId: run.id,
      repositoryId: params.repoId,
      candidateId: params.candidateId,
      correlationId: run.correlationId
    });

    reply.code(202);
    return { runId: run.id, status: run.status };
  });

  app.post("/api/repos/:repoId/candidates/:candidateId/bypass", async (request, reply) => {
    const params = request.params as { repoId: string; candidateId: string };
    const candidate = await prisma.dependencyCandidate.findFirst({
      where: { id: params.candidateId },
      include: { snapshot: true }
    });

    if (!candidate || candidate.snapshot.repositoryId !== params.repoId) {
      reply.code(404);
      return { message: "Candidate not found" };
    }

    const newStatus = candidate.status === "bypassed" ? "ready" : "bypassed";
    await prisma.dependencyCandidate.update({
      where: { id: params.candidateId },
      data: { status: newStatus }
    });

    return { id: params.candidateId, status: newStatus };
  });

  app.delete("/api/repos/:repoId", async (request, reply) => {
    const repoId = (request.params as { repoId: string }).repoId;
    const repo = await prisma.repository.findUnique({ where: { id: repoId } });
    if (!repo) {
      reply.code(404);
      return { message: "Repository not found" };
    }

    await prisma.$transaction([
      prisma.runStep.deleteMany({ where: { run: { repositoryId: repoId } } }),
      prisma.artifact.deleteMany({ where: { run: { repositoryId: repoId } } }),
      prisma.evaluationRecord.deleteMany({ where: { run: { repositoryId: repoId } } }),
      prisma.pullRequestRecord.deleteMany({ where: { repositoryId: repoId } }),
      prisma.deferredUpgrade.deleteMany({ where: { repositoryId: repoId } }),
      prisma.run.deleteMany({ where: { repositoryId: repoId } }),
      prisma.dependencyCandidate.deleteMany({ where: { snapshot: { repositoryId: repoId } } }),
      prisma.dependencySnapshot.deleteMany({ where: { repositoryId: repoId } }),
      prisma.coverageFileMetric.deleteMany({ where: { coverageSnapshot: { repositoryId: repoId } } }),
      prisma.coverageSnapshot.deleteMany({ where: { repositoryId: repoId } }),
      prisma.policy.deleteMany({ where: { repositoryId: repoId } }),
      prisma.repository.delete({ where: { id: repoId } })
    ]);

    return { message: "Repository deleted" };
  });
}