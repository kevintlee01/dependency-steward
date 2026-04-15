import type { FastifyInstance } from "fastify";

import { prisma } from "@dependency-steward/db";
import { verifyWebhookSignature } from "@dependency-steward/github";

import type { ApiContext } from "../types";
import { createQueuedRun, recordWebhookDelivery } from "../services/repository-service";

export async function registerWebhookRoutes(app: FastifyInstance, context: ApiContext) {
  app.post("/api/webhooks/github", async (request, reply) => {
    const rawPayload = JSON.stringify(request.body ?? {});
    const signature = request.headers["x-hub-signature-256"] as string | undefined;
    const eventName = (request.headers["x-github-event"] as string | undefined) ?? "unknown";
    const deliveryId = (request.headers["x-github-delivery"] as string | undefined) ?? `manual-${Date.now()}`;

    if (context.env.githubAppWebhookSecret) {
      const valid = verifyWebhookSignature(rawPayload, signature, context.env.githubAppWebhookSecret);
      if (!valid) {
        reply.code(401);
        return { message: "Invalid webhook signature" };
      }
    }

    const payload = request.body as Record<string, unknown>;
    const repositoryFullName = (payload.repository as { full_name?: string } | undefined)?.full_name;
    const repository = repositoryFullName
      ? await prisma.repository.findUnique({ where: { fullName: repositoryFullName } })
      : null;

    await recordWebhookDelivery({
      deliveryId,
      eventName,
      payload,
      repositoryId: repository?.id
    });

    if (eventName === "pull_request") {
      const pullRequest = payload.pull_request as { number?: number; merged?: boolean } | undefined;
      const action = payload.action as string | undefined;

      if (pullRequest?.merged && action === "closed" && repository) {
        await prisma.pullRequestRecord.updateMany({
          where: { repositoryId: repository.id, githubPrNumber: pullRequest.number },
          data: { status: "merged" }
        });

        const matchedPrs = await prisma.pullRequestRecord.findMany({
          where: { repositoryId: repository.id, githubPrNumber: pullRequest.number },
          include: { run: { select: { dependencyCandidateId: true } } }
        });
        for (const pr of matchedPrs) {
          if (pr.run?.dependencyCandidateId) {
            await prisma.dependencyCandidate.update({
              where: { id: pr.run.dependencyCandidateId },
              data: { status: "completed" }
            });
          }
        }

        const deferredUpgrades = await prisma.deferredUpgrade.findMany({
          where: {
            repositoryId: repository.id,
            status: "pending",
            prerequisitePr: {
              githubPrNumber: pullRequest.number
            }
          }
        });

        await Promise.all(
          deferredUpgrades.map(async (deferredUpgrade) => {
            const run = await createQueuedRun({
              repositoryId: repository.id,
              dependencyCandidateId: deferredUpgrade.dependencyCandidateId,
              runType: "follow_up",
              triggerSource: "webhook",
              summary: `Follow-up upgrade for ${deferredUpgrade.packageName}`
            });

            if (!run) {
              return;
            }

            return context.queues.followUpQueue.add(`follow-up:${deferredUpgrade.id}`, {
              runId: run.id,
              repositoryId: repository.id,
              deferredUpgradeId: deferredUpgrade.id,
              correlationId: run.correlationId
            });
          })
        );
      }
    }

    reply.code(202);
    return { status: "accepted" };
  });
}