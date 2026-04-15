import type { FastifyInstance } from "fastify";

import type { ApiContext } from "../types";
import { buildHealthResponse } from "../services/repository-service";

export async function registerHealthRoute(app: FastifyInstance, context: ApiContext) {
  app.get("/health", async () =>
    buildHealthResponse({
      githubConfigured: context.githubConfigured,
      llmConfigured: context.llmConfigured,
      redisConfigured: Boolean(context.env.redisUrl)
    })
  );
}